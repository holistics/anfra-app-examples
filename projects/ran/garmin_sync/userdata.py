"""Writes into app.*: what the user enters by hand (races, weigh-ins), from scripts or psql. The Data
Apps only read; nothing in them writes here."""

from __future__ import annotations

import datetime as dt
import os
from typing import Any

import psycopg
from psycopg.rows import dict_row

PRIORITIES = ("A", "B", "C")


class InvalidInput(ValueError):
    pass


def _seconds(body: dict[str, Any], key: str) -> float | None:
    value = body.get(key)
    if value in (None, ""):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise InvalidInput(f"{key} must be a number of seconds") from None
    if not 0 < value < 7 * 86400:
        raise InvalidInput(f"{key} is out of range")
    return value


def _race_fields(body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name or len(name) > 200:
        raise InvalidInput("name is required (at most 200 characters)")
    try:
        distance = float(body["distance_km"])
    except (KeyError, TypeError, ValueError):
        raise InvalidInput("distance_km must be a number") from None
    if not 0.1 <= distance <= 400:
        raise InvalidInput("distance_km must be between 0.1 and 400")
    time_s = _seconds(body, "official_time_s")
    goal_s = _seconds(body, "goal_time_s")
    priority = str(body.get("priority") or "B").upper()
    if priority not in PRIORITIES:
        raise InvalidInput("priority must be A, B or C")
    notes = body.get("notes")
    if notes is not None and len(str(notes)) > 2000:
        raise InvalidInput("notes are limited to 2000 characters")
    return {"name": name, "distance_km": distance, "official_time_s": time_s, "goal_time_s": goal_s,
            "priority": priority,
            "notes": notes}


def save_race(body: dict[str, Any]) -> dict[str, Any]:
    """Create or update a race. With activity_id: marks that activity (one race per activity).
    Without: an upcoming goal race, which needs race_date."""
    fields = _race_fields(body)
    activity_id = body.get("activity_id")
    race_id = body.get("race_id")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        if activity_id not in (None, ""):
            try:
                activity_id = int(activity_id)
            except (TypeError, ValueError):
                raise InvalidInput("activity_id must be an integer") from None
            row = conn.execute(
                "select (summary->>'startTimeLocal')::date as d from raw.activity where activity_id = %s",
                (activity_id,),
            ).fetchone()
            if not row:
                raise InvalidInput(f"activity {activity_id} not found")
            params = {**fields, "activity_id": activity_id, "race_date": row["d"]}
            # A goal race entered ahead of time (same date, no activity yet) becomes this run's race,
            # so it keeps its goal and gains the result.
            linked = conn.execute(
                """update app.race set activity_id = %(activity_id)s, name = %(name)s, distance_km = %(distance_km)s,
                     official_time_s = %(official_time_s)s, goal_time_s = coalesce(%(goal_time_s)s, goal_time_s),
                     priority = %(priority)s, notes = coalesce(%(notes)s, notes), updated_at = now()
                   where race_id = (select race_id from app.race where activity_id is null and race_date = %(race_date)s
                                    order by race_id limit 1)
                     and not exists (select 1 from app.race where activity_id = %(activity_id)s)
                   returning *""",
                params,
            ).fetchone()
            if linked:
                return linked
            return conn.execute(
                """insert into app.race (activity_id, race_date, name, distance_km, official_time_s, goal_time_s, priority, notes)
                   values (%(activity_id)s, %(race_date)s, %(name)s, %(distance_km)s, %(official_time_s)s, %(goal_time_s)s, %(priority)s, %(notes)s)
                   on conflict (activity_id) do update set
                     name = excluded.name, distance_km = excluded.distance_km,
                     official_time_s = excluded.official_time_s, goal_time_s = excluded.goal_time_s,
                     priority = excluded.priority, notes = excluded.notes, updated_at = now()
                   returning *""",
                params,
            ).fetchone()
        try:
            race_date = dt.date.fromisoformat(str(body.get("race_date")))
        except ValueError:
            raise InvalidInput("race_date (YYYY-MM-DD) is required for a race without an activity") from None
        if race_id not in (None, ""):
            row = conn.execute(
                """update app.race set race_date = %(race_date)s, name = %(name)s, distance_km = %(distance_km)s,
                     official_time_s = %(official_time_s)s, goal_time_s = %(goal_time_s)s, priority = %(priority)s,
                     notes = %(notes)s, updated_at = now()
                   where race_id = %(race_id)s returning *""",
                {**fields, "race_date": race_date, "race_id": int(race_id)},
            ).fetchone()
            if not row:
                raise InvalidInput(f"race {race_id} not found")
            return row
        return conn.execute(
            """insert into app.race (race_date, name, distance_km, official_time_s, goal_time_s, priority, notes)
               values (%(race_date)s, %(name)s, %(distance_km)s, %(official_time_s)s, %(goal_time_s)s, %(priority)s, %(notes)s)
               returning *""",
            {**fields, "race_date": race_date},
        ).fetchone()


def delete_race(race_id: int) -> bool:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        return conn.execute("delete from app.race where race_id = %s", (race_id,)).rowcount > 0


def save_weigh_in(body: dict[str, Any]) -> dict[str, Any]:
    """A weigh-in entered in the app (D9). garmin.day carries weight forward, so it is refreshed."""
    try:
        measured_on = dt.date.fromisoformat(str(body.get("measured_on")))
    except ValueError:
        raise InvalidInput("measured_on (YYYY-MM-DD) is required") from None
    if measured_on > dt.date.today():
        raise InvalidInput("measured_on cannot be in the future")
    try:
        weight = float(body["weight_kg"])
    except (KeyError, TypeError, ValueError):
        raise InvalidInput("weight_kg must be a number") from None
    if not 20 <= weight <= 300:
        raise InvalidInput("weight_kg must be between 20 and 300")
    fat = body.get("body_fat_pct")
    if fat in (None, ""):
        fat = None
    else:
        try:
            fat = float(fat)
        except (TypeError, ValueError):
            raise InvalidInput("body_fat_pct must be a number") from None
        if not 2 <= fat <= 70:
            raise InvalidInput("body_fat_pct must be between 2 and 70")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        row = conn.execute(
            """insert into app.weigh_in (measured_on, weight_kg, body_fat_pct) values (%s, %s, %s)
               returning *""",
            (measured_on, weight, fat),
        ).fetchone()
        conn.commit()
        conn.execute("refresh materialized view concurrently garmin.day")
        return row


def delete_weigh_in(weigh_in_id: int) -> bool:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        deleted = conn.execute("delete from app.weigh_in where weigh_in_id = %s", (weigh_in_id,)).rowcount > 0
        conn.commit()
        if deleted:
            conn.execute("refresh materialized view concurrently garmin.day")
        return deleted
