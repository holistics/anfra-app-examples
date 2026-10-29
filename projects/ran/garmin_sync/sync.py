"""Garmin Connect -> Postgres sync: the whole account history, every endpoint worth keeping.

Every run fetches what is missing, so a long first backfill can be stopped and resumed:

- activities: the full list once, then from a couple of days before the newest one
- per activity: each document kind it does not have yet (laps, streams, HR zones, weather, ...)
- per day: each daily endpoint for each day it has no row for, newest day first, plus the last
  few days again (Garmin keeps updating today's and yesterday's numbers)
- ranged endpoints: one document per calendar year, past years once, the current year always
- one-off documents (records, zones, devices, gear, ...): refreshed every run

History starts at the first activity (or GARMIN_HISTORY_START=YYYY-MM-DD).
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable

import psycopg
from psycopg.types.json import Jsonb
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)

from .markers import sync_best_efforts
from .weather import sync_weather
from .model import fit_safely

log = logging.getLogger("garmin_sync")

ROOT = Path(__file__).resolve().parent.parent
TOKENSTORE = os.getenv("GARMINTOKENS", "~/.garminconnect")
HISTORY_START = os.getenv("GARMIN_HISTORY_START")  # optional floor, YYYY-MM-DD
OVERLAP_DAYS = 2
MAX_KIND_FAILURES = 5  # consecutive errors before a kind is skipped for the rest of a run
LOCK_KEY = 0x6A726D6E  # pg advisory lock id for "one sync at a time"

# raw.daily.kind -> client method taking an ISO date
DAILY_KINDS: dict[str, str] = {
    "user_summary": "get_user_summary",
    "sleep": "get_sleep_data",
    "hrv": "get_hrv_data",
    "training_readiness": "get_training_readiness",
    "training_status": "get_training_status",
    "max_metrics": "get_max_metrics",
    "stress": "get_stress_data",
    "body_battery_events": "get_body_battery_events",
    "respiration": "get_respiration_data",
    "spo2": "get_spo2_data",
    "heart_rates": "get_heart_rates",
    "steps": "get_steps_data",
}

# raw.activity_doc.kind -> client method taking an activity id ('details_meta' is special:
# get_activity_details, parsed into garmin.activity_sample)
ACTIVITY_KINDS: dict[str, str] = {
    "splits": "get_activity_splits",
    "details_meta": "get_activity_details",
    "hr_zones": "get_activity_hr_in_timezones",
    "typed_splits": "get_activity_typed_splits",
    "weather": "get_activity_weather",
    "exercise_sets": "get_activity_exercise_sets",
    # The workout the activity followed (steps and their targets). Garmin keeps it only while the
    # workout exists, so it is saved with the activity; deleted or club-sent ones come back empty.
    "workout": "get_workout_by_id",
}
ACTIVITY_KIND_ONLY_FOR = {"exercise_sets": ("strength_training",)}

# raw.doc key prefix -> callable(client, start, end) for one calendar-year chunk
RANGE_KINDS: dict[str, Callable[[Garmin, str, str], Any]] = {
    "race_predictions": lambda c, s, e: c.get_race_predictions(s, e, "daily"),
    "endurance_score": lambda c, s, e: c.get_endurance_score(s, e),
    "hill_score": lambda c, s, e: c.get_hill_score(s, e),
    "lactate_threshold": lambda c, s, e: c.get_lactate_threshold(latest=False, start_date=s, end_date=e),
    "max_metrics_range": lambda c, s, e: c.get_max_metrics_range(s, e),
    "rhr_range": lambda c, s, e: c.get_rhr_daily(s, e),
}

# raw.doc key -> callable(client), refreshed every run
SINGLE_KINDS: dict[str, Callable[[Garmin], Any]] = {
    "personal_records": lambda c: c.get_personal_record(),
    "hr_zones_config": lambda c: c.get_heart_rate_zones(),
    "lactate_threshold_latest": lambda c: c.get_lactate_threshold(),
    "race_predictions_latest": lambda c: c.get_race_predictions(),
    "fitness_age": lambda c: c.get_fitnessage_data(dt.date.today().isoformat()),
    "devices": lambda c: c.get_devices(),
    "user_settings": lambda c: c.get_userprofile_settings(),
    "user_profile": lambda c: c.get_user_profile(),
}

# Stream metric keys -> garmin.activity_sample columns, in preference order.
STREAM_COLUMNS: dict[str, tuple[str, ...]] = {
    "elapsed_s": ("sumDuration", "sumElapsedDuration"),
    "distance_m": ("sumDistance",),
    "heart_rate": ("directHeartRate",),
    "speed_mps": ("directSpeed",),
    "cadence_spm": ("directDoubleCadence", "directRunCadence"),
    "elevation_m": ("directElevation",),
    "power_w": ("directPower",),
    "latitude": ("directLatitude",),
    "longitude": ("directLongitude",),
    "stride_length_cm": ("directStrideLength",),
    "vertical_osc_cm": ("directVerticalOscillation",),
    "ground_contact_ms": ("directGroundContactTime",),
    "grade_adj_speed_mps": ("directGradeAdjustedSpeed",),
    "temperature_c": ("directAirTemperature",),
}
SAMPLE_COLUMNS = ["activity_id", "seq", "sample_time", *STREAM_COLUMNS]


class SyncBusy(RuntimeError):
    """Another sync holds the lock."""


class NotLoggedIn(RuntimeError):
    """No usable Garmin tokens: run `garmin-sync login`."""


class Breaker:
    """Stops calling an endpoint that keeps failing (e.g. unsupported by the user's device)."""

    def __init__(self) -> None:
        self.failures: dict[str, int] = {}

    def open(self, kind: str) -> bool:
        return self.failures.get(kind, 0) >= MAX_KIND_FAILURES

    def record(self, kind: str, ok: bool, err: Exception | None = None) -> None:
        if ok:
            self.failures[kind] = 0
            return
        self.failures[kind] = self.failures.get(kind, 0) + 1
        log.warning("%s: %s", kind, err)
        if self.open(kind):
            log.warning("%s failed %s times in a row; skipping it for this run", kind, MAX_KIND_FAILURES)


def connect_garmin() -> Garmin:
    client = Garmin()
    try:
        client.login(TOKENSTORE)
    except (GarminConnectAuthenticationError, ValueError) as e:
        raise NotLoggedIn("Garmin tokens missing or expired: run `uv run garmin-sync login`") from e
    return client


def login_interactive() -> None:
    import getpass

    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    client = Garmin(email, password, prompt_mfa=lambda: input("MFA code: ").strip())
    client.login(TOKENSTORE)
    name = client.get_full_name()
    print(f"Logged in as {name}. Tokens saved to {Path(TOKENSTORE).expanduser()}")


def call(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Call a Garmin endpoint, backing off when rate-limited. Not found -> None."""
    for attempt in range(5):
        try:
            return fn(*args, **kwargs)
        except GarminConnectNotFoundError:
            return None
        except GarminConnectTooManyRequestsError:
            wait = 60 * (attempt + 1)
            log.warning("Rate-limited by Garmin; waiting %ss", wait)
            time.sleep(wait)
    return fn(*args, **kwargs)


def sql_files() -> list[Path]:
    """Tables first, then views: db/schema.sql, db/schema.d/*.sql, db/views.sql, db/views.d/*.sql
    (each .d folder in name order). A views.d file drops and recreates its own objects; views.sql
    drops garmin.activity with cascade, which removes anything built on it."""
    db = ROOT / "db"
    files: list[Path] = []
    for base in ("schema", "views"):
        files += [p for p in [db / f"{base}.sql"] if p.exists()]
        files += sorted((db / f"{base}.d").glob("*.sql"))
    return files


def apply_sql(conn: psycopg.Connection) -> None:
    for path in sql_files():
        conn.execute(path.read_text())
    conn.commit()


def get_state(conn: psycopg.Connection, key: str) -> str | None:
    from psycopg.rows import tuple_row
    row = conn.cursor(row_factory=tuple_row).execute("select value from raw.sync_state where key = %s", (key,)).fetchone()
    return row[0] if row else None


def set_state(conn: psycopg.Connection, key: str, value: str) -> None:
    conn.execute(
        """insert into raw.sync_state (key, value) values (%s, %s)
           on conflict (key) do update set value = excluded.value, updated_at = now()""",
        (key, value),
    )


# Materialized views the sync recomputes, in dependency order (each needs a unique index).
DERIVED_VIEWS = [
    "garmin.activity_marker",
    "garmin.activity_load",
    "garmin.day",
    "garmin.activity_zone",
]


def refresh_derived(conn: psycopg.Connection) -> None:
    """Recompute the derived tables (markers, garmin.day's training calculations) from what is stored."""
    for name in DERIVED_VIEWS:
        conn.execute(f"refresh materialized view concurrently {name}")
    conn.commit()


def put_doc(conn: psycopg.Connection, key: str, payload: Any) -> None:
    conn.execute(
        """insert into raw.doc (key, payload) values (%s, %s)
           on conflict (key) do update set payload = excluded.payload, fetched_at = now()""",
        (key, Jsonb(payload)),
    )


def parse_samples(activity_id: int, details: dict[str, Any]) -> list[tuple]:
    index = {d["key"]: d["metricsIndex"] for d in details.get("metricDescriptors") or []}
    picks = {col: next((index[k] for k in keys if k in index), None) for col, keys in STREAM_COLUMNS.items()}
    ts_idx = index.get("directTimestamp")
    rows = []
    for seq, point in enumerate(details.get("activityDetailMetrics") or []):
        m = point.get("metrics") or []
        get = lambda i: m[i] if i is not None and i < len(m) else None  # noqa: E731
        ts = get(ts_idx)
        sample_time = dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc) if ts else None
        rows.append((activity_id, seq, sample_time, *(get(picks[c]) for c in STREAM_COLUMNS)))
    return rows


def put_activity_doc(conn: psycopg.Connection, activity_id: int, kind: str, payload: Any) -> None:
    conn.execute(
        """insert into raw.activity_doc (activity_id, kind, payload) values (%s, %s, %s)
           on conflict (activity_id, kind) do update set payload = excluded.payload, fetched_at = now()""",
        (activity_id, kind, Jsonb(payload)),
    )


def sync_details(conn: psycopg.Connection, client: Garmin, activity_id: int) -> None:
    details = call(client.get_activity_details, str(activity_id), maxchart=100_000) or {}
    samples = parse_samples(activity_id, details)
    meta = {k: v for k, v in details.items() if k not in ("activityDetailMetrics", "geoPolylineDTO")}
    meta["sampleCount"] = len(samples)
    with conn.transaction():
        conn.execute("delete from garmin.activity_sample where activity_id = %s", (activity_id,))
        if samples:
            with conn.cursor().copy(
                f"copy garmin.activity_sample ({', '.join(SAMPLE_COLUMNS)}) from stdin"
            ) as copy:
                for row in samples:
                    copy.write_row(row)
        put_activity_doc(conn, activity_id, "details_meta", meta)


def sync_activities(conn, client, history_start: dt.date | None, today: dt.date, progress, stats) -> None:
    full = get_state(conn, "activities_full_listed") == "1"
    if full:
        latest = conn.execute("select max(start_time_gmt)::date from raw.activity").fetchone()[0]
        start = (latest or today) - dt.timedelta(days=OVERLAP_DAYS)
    else:
        start = history_start or dt.date(2000, 1, 1)
    progress(f"Listing activities since {start}")
    activities = call(client.get_activities_by_date, start.isoformat(), today.isoformat()) or []
    for a in activities:
        inserted = conn.execute(
            """insert into raw.activity (activity_id, start_time_gmt, summary)
               values (%s, %s::timestamp at time zone 'UTC', %s)
               on conflict (activity_id) do update
               set summary = excluded.summary, start_time_gmt = excluded.start_time_gmt, fetched_at = now()
               returning (xmax = 0)""",
            (a["activityId"], a["startTimeGMT"], Jsonb(a)),
        ).fetchone()[0]
        stats["new_activities"] += int(inserted)
    if not full:
        set_state(conn, "activities_full_listed", "1")
    conn.commit()


def sync_activity_docs(conn, client, progress, breaker) -> None:
    pending = conn.execute(
        """select a.activity_id, a.summary->'activityType'->>'typeKey', k.kind, a.summary->>'workoutId'
           from raw.activity a cross join unnest(%s::text[]) k(kind)
           where not exists (select 1 from raw.activity_doc d
                             where d.activity_id = a.activity_id and d.kind = k.kind)
           order by a.start_time_gmt desc, k.kind""",
        (list(ACTIVITY_KINDS),),
    ).fetchall()
    todo: dict[int, list[str]] = {}
    workout_of: dict[int, str] = {}
    for activity_id, type_key, kind, workout_id in pending:
        only = ACTIVITY_KIND_ONLY_FOR.get(kind)
        if only and type_key not in only:
            continue
        if kind == "workout":
            if not workout_id:
                continue
            workout_of[activity_id] = workout_id
        todo.setdefault(activity_id, []).append(kind)
    for i, (activity_id, kinds) in enumerate(todo.items(), 1):
        progress(f"Activity details {i}/{len(todo)}")
        for kind in kinds:
            if breaker.open(f"activity:{kind}"):
                continue
            try:
                if kind == "details_meta":
                    sync_details(conn, client, activity_id)
                else:
                    arg = workout_of[activity_id] if kind == "workout" else str(activity_id)
                    payload = call(getattr(client, ACTIVITY_KINDS[kind]), arg)
                    put_activity_doc(conn, activity_id, kind, payload)
                conn.commit()
                breaker.record(f"activity:{kind}", True)
            except Exception as e:  # retried next run
                conn.rollback()
                breaker.record(f"activity:{kind}", False, e)


def sync_daily(conn, client, first_day: dt.date, today: dt.date, progress, breaker, stats) -> None:
    recent = today - dt.timedelta(days=OVERLAP_DAYS)
    rows = conn.execute(
        """select d::date, k.kind
           from generate_series(%s::date, %s::date, interval '1 day') d
           cross join unnest(%s::text[]) k(kind)
           where d::date >= %s
              or not exists (select 1 from raw.daily r where r.calendar_date = d::date and r.kind = k.kind)
           order by 1 desc, 2""",
        (first_day, today, list(DAILY_KINDS), recent),
    ).fetchall()
    todo: dict[dt.date, list[str]] = {}
    for day, kind in rows:
        todo.setdefault(day, []).append(kind)
    for i, (day, kinds) in enumerate(todo.items(), 1):
        progress(f"Daily data {i}/{len(todo)} ({day})")
        for kind in kinds:
            if breaker.open(f"daily:{kind}"):
                continue
            try:
                payload = call(getattr(client, DAILY_KINDS[kind]), day.isoformat())
                breaker.record(f"daily:{kind}", True)
            except Exception as e:
                breaker.record(f"daily:{kind}", False, e)
                continue
            conn.execute(
                """insert into raw.daily (calendar_date, kind, payload) values (%s, %s, %s)
                   on conflict (calendar_date, kind) do update
                   set payload = excluded.payload, fetched_at = now()""",
                (day, kind, Jsonb(payload)),
            )
        conn.commit()
        stats["days_synced"] += 1
        if i % 100 == 0:
            refresh_derived(conn)


def sync_ranges(conn, client, first_day: dt.date, today: dt.date, progress, breaker) -> None:
    have = {r[0] for r in conn.execute("select key from raw.doc")}
    for year in range(today.year, first_day.year - 1, -1):
        start = max(first_day, dt.date(year, 1, 1))
        end = min(today, dt.date(year, 12, 31))
        for kind, fn in RANGE_KINDS.items():
            key = f"{kind}:{year}"
            if (key in have and year != today.year) or breaker.open(kind):
                continue
            progress(f"{kind} {year}")
            try:
                put_doc(conn, key, call(fn, client, start.isoformat(), end.isoformat()))
                conn.commit()
                breaker.record(kind, True)
            except Exception as e:
                conn.rollback()
                breaker.record(kind, False, e)


def sync_singles(conn, client, progress, breaker) -> None:
    progress("Records, zones, devices and gear")
    for key, fn in SINGLE_KINDS.items():
        try:
            put_doc(conn, key, call(fn, client))
            conn.commit()
        except Exception as e:
            conn.rollback()
            breaker.record(key, False, e)
    try:
        settings = call(client.get_user_profile) or {}
        profile_pk = settings.get("id") or settings.get("userProfilePk")
        if profile_pk:
            gear = call(client.get_gear, str(profile_pk)) or []
            put_doc(conn, "gear", gear)
            for g in gear if isinstance(gear, list) else []:
                if g.get("uuid"):
                    put_doc(conn, f"gear_stats:{g['uuid']}", call(client.get_gear_stats, g["uuid"]))
            conn.commit()
    except Exception as e:
        conn.rollback()
        breaker.record("gear", False, e)


def sync_body_composition(conn, client, first_day: dt.date, today: dt.date, progress) -> None:
    through = get_state(conn, "body_composition_through")
    start = first_day if not through else max(first_day, dt.date.fromisoformat(through) - dt.timedelta(days=30))
    progress(f"Body composition since {start}")
    chunk_start = start
    while chunk_start <= today:
        chunk_end = min(today, chunk_start + dt.timedelta(days=89))
        data = call(client.get_body_composition, chunk_start.isoformat(), chunk_end.isoformat()) or {}
        for w in data.get("dateWeightList") or []:
            conn.execute(
                """insert into raw.body_composition (sample_pk, payload) values (%s, %s)
                   on conflict (sample_pk) do update set payload = excluded.payload, fetched_at = now()""",
                (str(w.get("samplePk") or w.get("date")), Jsonb(w)),
            )
        set_state(conn, "body_composition_through", chunk_end.isoformat())
        conn.commit()
        chunk_start = chunk_end + dt.timedelta(days=1)


def run_sync(trigger: str = "cli", progress: Callable[[str], None] = lambda msg: log.info(msg)) -> dict[str, Any]:
    """One sync. Raises SyncBusy if another is running."""
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as conn:
        if not conn.execute("select pg_try_advisory_lock(%s)", (LOCK_KEY,)).fetchone()[0]:
            raise SyncBusy("A sync is already running")
        conn.commit()
        apply_sql(conn)
        if get_state(conn, "demo_database"):
            # A synthetic runner (`garmin-sync demo-data`): never mix real Garmin data into it.
            log.info("Demo database: Garmin sync is off")
            return {"skipped": "demo database"}
        # We hold the lock, so any run still marked running was killed.
        conn.execute("update raw.sync_run set status = 'aborted', finished_at = now() where status = 'running'")
        run_id = conn.execute(
            "insert into raw.sync_run (trigger) values (%s) returning id", (trigger,)
        ).fetchone()[0]
        conn.commit()
        stats = {"new_activities": 0, "days_synced": 0}
        breaker = Breaker()

        def report(msg: str) -> None:
            progress(msg)
            conn.execute("update raw.sync_run set message = %s where id = %s", (msg, run_id))
            conn.commit()

        try:
            report("Connecting to Garmin")
            client = connect_garmin()
            today = dt.date.today()
            history_start = dt.date.fromisoformat(HISTORY_START) if HISTORY_START else None

            sync_activities(conn, client, history_start, today, report, stats)
            first_activity = conn.execute(
                "select min((summary->>'startTimeLocal')::date) from raw.activity"
            ).fetchone()[0]
            first_day = history_start or first_activity or today

            sync_singles(conn, client, report, breaker)
            sync_activity_docs(conn, client, report, breaker)
            sync_best_efforts(conn, report)
            sync_weather(conn, report)
            refresh_derived(conn)
            sync_daily(conn, client, first_day, today, report, breaker, stats)
            sync_ranges(conn, client, first_day, today, report, breaker)
            sync_body_composition(conn, client, first_day, today, report)
            refresh_derived(conn)
            fit_safely(conn, report)
            try:   # the saved plans' session paces, brought up to date at the start of each phase
                from .planner import update_phase_paces
                for u in update_phase_paces(conn):
                    log.info("plan %s: %s phase, %d session paces x %.3f", u["race_id"], u["phase"], u["sessions"], u["ratio"])
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                log.warning("phase paces not updated: %s", e)

            skipped = sorted(k for k in breaker.failures if breaker.open(k))
            message = f"Skipped after repeated errors: {', '.join(skipped)}" if skipped else None
            conn.execute(
                """update raw.sync_run set finished_at = now(), status = 'ok', message = %s,
                   new_activities = %s, days_synced = %s where id = %s""",
                (message, stats["new_activities"], stats["days_synced"], run_id),
            )
            conn.commit()
            progress("Done")
            return stats
        except Exception as e:
            conn.rollback()
            conn.execute(
                "update raw.sync_run set finished_at = now(), status = 'error', message = %s where id = %s",
                (str(e)[:2000], run_id),
            )
            conn.commit()
            raise
        finally:
            conn.execute("select pg_advisory_unlock(%s)", (LOCK_KEY,))
            conn.commit()
