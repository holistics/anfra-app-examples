"""The training plan toward a race: the Python reference for the Race Planner, which the apps compute
in SQL (db/views.d/60_scenario.sql, kept equal by tests/test_scenario_sql.py). generate_plan() writes
a plan into app.plan_day offline (e.g. deploy/dump-db.sh seeds the demo with one); the apps only
read it. The plan follows the evidence in the README's causal model:
  - Controls the runner sets: runs per week, biggest week, quality sessions a week, longest long
    run, weekly increase, taper length. The biggest week defaults to 1.25 x the runner's biggest
    week of the last year (well beyond their history is a caution).
  - The plan starts with the current week: its days so far are history, the rest fill the week up
    to the current load (the average of the last 2 complete weeks; the long run from the longest
    of the last 4 weeks). From next week volume rises by the weekly increase (a lighter week every
    4th, 3:1 loading) up to the biggest week.
  - Phases by the time left: with up to 3 weeks before the taper, sharpen (hold volume and the long
    run, race-specific sessions) then taper; 4-7 weeks, build-peak-taper; 8+, base-build-peak-taper.
  - Build-up, the runner's choice: gradual (volume spread so the biggest week arrives at the start
    of the peak phase, the weekly increase a maximum; long runs grow with the volume and, once at
    the longest, alternate with medium-long runs: 3-5 runs of that length) or front-loaded (volume
    rises at the weekly increase until the biggest week; the long run grows as fast as the spike
    rule allows and stays at its longest). Both stay inside the injury evidence's limits (weekly
    increase, single-run spikes); no study compares the two. A tune-up race
    (half marathon before a marathon, 10K before a half) 6 weeks before race week, in a lighter
    week, on by default for plans of 12+ weeks.
  - Taper: 2-3 weeks for a marathon (75/55/40 % or 65/45 % of the peak); for a half and shorter a
    gentler week before race week (80 % then 50 %), about 10 days, inside the 8-14 days that
    Bosquet 2007 found best.
  - Long run: one a week, never more than 10 % longer than the longest run of the previous 4
    weeks (single-session spikes over 10 % raise overuse injury: Frandsen et al. 2025), up to the
    longest long run and half the week. Durability (D4) is trained by long steady runs.
  - Quality sessions, picked by phase: intervals and tempo in base (VO2max, D1), cruise intervals
    and goal pace in build (threshold D2, specificity), threshold and long goal-pace work in peak,
    short goal-pace sharpeners in the taper. Paces: the runner's own threshold (garmin.day) and
    easy pace; intervals 20 s/km faster than threshold; goal pace = the target time.
  - Easy runs fill the rest of the week, each at most 3/4 of that week's long run, so the volume a
    week can hold depends on runs per week and the long run (more runs carry more volume).
  - One strength session a week on a rest day, for economy (D3; Llanos-Lagos 2024).
  - Taper: 41-60 % less volume over the last 2-3 weeks with intensity kept (Bosquet 2007).
"""

from __future__ import annotations

import datetime as dt
import math
import os
from dataclasses import asdict, dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .userdata import InvalidInput

SESSIONS = ("rest", "easy", "long", "threshold", "intervals", "strength", "race")
RECOVERY_EVERY = 4     # every 4th base/build week is lighter
RECOVERY_FACTOR = 0.75
LONG_SPIKE = 1.10      # a long run at most 10 % longer than the longest of the previous 4 weeks
LONG_SHARE = 0.50      # and at most half the week
EASY_OF_LONG = 0.75    # an easy run at most 3/4 of the week's long run: runs a week and the long run cap the volume
EASY_MIN_KM = 2.0      # easy runs share what the long run and quality sessions leave; below this, fewer of them
EASY_SHORT_KM = 5.0    # an easy run shorter than this is flagged as one to merge into a quality day
PEAK_WEEKS = 2
PEAK_OF_BIGGEST = 1.25  # default biggest week: 1.25 x the runner's biggest week of the last year
# Taper: share of the peak week, from the first taper week to race week (race excluded).
# Mean reduction ~43 % (3 weeks) / ~45 % (2 weeks): inside Bosquet's 41-60 %.
TAPER = {3: (0.75, 0.55, 0.40), 2: (0.65, 0.45), 1: (0.50,)}
# Half marathon and shorter: a gentler week before race week (~10-day taper, inside 8-14 days).
TAPER_SHORT = {2: (0.80, 0.50), 1: (0.55,)}
SHARPEN_MAX_WEEKS = 3   # up to this many weeks before the taper: hold and sharpen, no build
# Weekday slots (0 = Monday): long run Sunday, quality Tuesday and Thursday, easy runs after.
LONG_DAY, QUALITY_DAYS, EASY_DAYS = 6, (1, 3), (5, 2, 0, 4)


@dataclass
class PlanOptions:
    """What the runner controls. Defaults: the runner's own habits and the distance's evidence."""
    runs_per_week: int           # 3 to 7 runs, the long run and quality sessions included
    peak_km: float               # the biggest week the plan may reach
    quality: int                 # 0 to 2 quality sessions a week
    long_max_km: float           # longest long run
    ramp_pct: float              # how much a build week may rise over the one before
    taper_weeks: int             # race week included
    target_time_s: float | None  # the time the goal-pace sessions aim at (default: the race goal)
    tune_up: bool = False        # a tune-up race 6 weeks before race week (default: on for 12+ week plans)
    start_km: float | None = None  # this week's km (the plan's starting load); default: the higher of
                                   # last week and the last 2 complete weeks' average
    front_loaded: bool = False   # build-up: False = gradual (biggest week at the peak phase, long runs
                                 # alternate), True = front-loaded (volume rises at the weekly increase
                                 # until the biggest week; the long run stays at its longest)


def distance_limits(distance_km: float) -> dict[str, Any]:
    """Per distance: volume cap, default longest long run, taper weeks the evidence supports."""
    if distance_km >= 40:
        return {"peak_cap": 90.0, "long_max": 32.0, "taper": (2, 3), "taper_default": 3}
    if distance_km >= 20:
        return {"peak_cap": 70.0, "long_max": 21.0, "taper": (1, 2), "taper_default": 2}
    return {"peak_cap": 55.0, "long_max": 15.0, "taper": (1, 2), "taper_default": 1}


def plan_options(raw: Any, distance_km: float, habits: dict[str, Any] | None = None) -> PlanOptions:
    """Options from a request body; missing ones take the runner's habits and the distance's
    defaults. Range-checked."""
    lim = distance_limits(distance_km)
    habits = habits or {}
    raw = raw if isinstance(raw, dict) else {}

    def get(name: str, lo: float, hi: float, default: float) -> float:
        v = _num(raw.get(name), name, lo, hi)
        return default if v is None else v

    runs = int(get("runs_per_week", 3, 7, habits.get("runs_per_week") or 4))
    return PlanOptions(
        runs_per_week=runs,
        peak_km=get("peak_km", 15, 160, habits.get("peak_default") or lim["peak_cap"]),
        quality=int(min(get("quality", 0, 2, 2 if runs >= 4 else 1), max(runs - 1, 0))),
        long_max_km=get("long_max_km", 8, 42, lim["long_max"]),
        ramp_pct=get("ramp_pct", 0, 30, 10.0),
        taper_weeks=int(get("taper_weeks", 1, 3, lim["taper_default"])),
        target_time_s=_num(raw.get("target_time_s"), "target_time_s", 300, 86400),
        front_loaded=bool(get("front_loaded", 0, 1, 0)),
        # rounded like a typed value, so the preview and the saved plan start from the same number
        start_km=round(get("start_km", 10, 160, habits.get("start_km") or 0), 1) or None,
        tune_up=bool(get("tune_up", 0, 1, 1 if tune_up_possible(distance_km, habits.get("weeks") or 0) else 0))
                and tune_up_possible(distance_km, habits.get("weeks") or 0),
    )


TUNE_UP_WEEKS_BEFORE = 6   # the tune-up race: 6 weeks before race week


def tune_up_possible(distance_km: float, weeks: int) -> bool:
    """A tune-up race fits a half marathon or longer with 12+ weeks to go."""
    return distance_km >= 20 and weeks >= 12


def tune_up_km(distance_km: float) -> float:
    """Half marathon before a marathon, 10K before a half."""
    return 21.0975 if distance_km >= 40 else 10.0


def _pace(s: float | None) -> str:
    if not s:
        return "?"
    m, r = divmod(round(s), 60)
    return f"{m}:{r:02d}"


def _phases(n: int, taper_n: int) -> list[str]:
    """Phase of each week. The structure depends on the time left:
      - a few weeks (up to SHARPEN_MAX_WEEKS before the taper): sharpen, then taper. Fitness barely
        moves in so little time, so volume and the long run are held and the work is race-specific;
      - 4 to 7 weeks before the taper: build (no base), peak, taper;
      - 8 to 12: base, build (every 4th week lighter), a 2-week peak, taper, race week;
      - 13 or more: the same, sized to the time: base ~40 %, build ~35 %, a 3-week peak."""
    taper_n = min(taper_n, max(1, n - 1))   # a short plan still gets its taper
    m = n - taper_n
    if m <= SHARPEN_MAX_WEEKS:
        return ["sharpen"] * m + ["taper"] * (taper_n - 1) + ["race week"]
    # long plans (13+ weeks before the taper): base ~40 %, build ~35 %, a 3-week peak
    peak_n = 3 if m >= 13 else PEAK_WEEKS if m >= 6 else (1 if m >= 3 else 0)
    rest = m - peak_n
    base_n = round(rest * 0.53) if m >= 13 else math.ceil(rest / 2) if m >= 8 else 0
    out = []
    for i in range(rest):
        if (i + 1) % RECOVERY_EVERY == 0:
            out.append("recovery")
        else:
            out.append("base" if i < base_n else "build")
    out += ["peak"] * peak_n + ["taper"] * (taper_n - 1) + ["race week"]
    return out


def _weeks(ctx: dict[str, Any], opts: PlanOptions) -> list[dict[str, Any]]:
    """Weekly targets: km, long-run km, phase.

    Volume is spread so that the biggest week arrives at the start of the peak phase: each
    progressing week rises by the slowest rate that gets there in time, never more than the
    runner's weekly increase. The long run grows with the volume (and never more than 10 % over
    the longest of the previous 4 weeks); once it reaches the longest long run, weeks alternate
    between it and a medium-long run (3/4), so the plan holds 3-5 runs of that length rather
    than one every week. A tune-up race replaces the long run 6 weeks before race week, in a
    lighter week."""
    phases = _phases(ctx["n"], opts.taper_weeks)
    vol0 = max(opts.start_km or ctx["vol0"], 12.0)
    first_holds = bool(ctx.get("partial_first"))
    # progressing weeks up to and including the first peak week (the current week holds)
    first_peak = phases.index("peak") if "peak" in phases else None
    steps = sum(1 for k, ph in enumerate(phases[: (first_peak + 1) if first_peak is not None else len(phases)])
                if ph in ("base", "build", "peak") and not (k == 0 and first_holds))
    target = max(opts.peak_km, vol0)
    needed = (target / vol0) ** (1 / steps) - 1 if steps else 0.0
    # gradual: the slowest increase that reaches the biggest week at the peak; front-loaded: the full rate
    ramp = 1 + (opts.ramp_pct / 100 if opts.front_loaded else min(opts.ramp_pct / 100, max(needed, 0.0)))
    long_cap = opts.long_max_km
    tune_week = len(phases) - 1 - TUNE_UP_WEEKS_BEFORE if opts.tune_up else None
    vol = vol0
    longs = [ctx["long0"]] * 4              # the long runs of the previous 4 weeks (spike rule)
    weeks: list[dict[str, Any]] = []
    at_max = 0                              # weeks since the long run first reached its maximum
    # the long run reaches its longest about 4 progressing weeks before the peak ends, so the
    # alternation gives 3-5 runs of that length
    long_steps = max(1, steps - 4 + (3 if first_peak is not None else 0))
    k = 0
    for i, ph in enumerate(phases):
        if ph == "sharpen":
            # hold the current load and long run
            long = min(max(longs[-4:]), long_cap, LONG_SHARE * vol)
            weeks.append({"km": vol, "long": long, "phase": ph})
        elif ph in ("base", "build", "peak"):
            # the current week holds the current load; the increase starts next week
            if not (i == 0 and first_holds):
                vol = min(vol * ramp, opts.peak_km)
                k += 1
            planned = ctx["long0"] + (long_cap - ctx["long0"]) * min(k / long_steps, 1.0)
            if opts.front_loaded:   # grow as fast as the spike rule allows and stay at the longest
                planned = long_cap
            long = min(max(longs[-4:]) * LONG_SPIKE, long_cap, LONG_SHARE * vol, max(planned, longs[-1]))
            if long >= 0.97 * long_cap and not opts.front_loaded:
                at_max += 1
                if at_max % 2 == 0:          # every other week a medium-long run
                    long = 0.75 * long_cap
            weeks.append({"km": vol, "long": long, "phase": ph})
        elif ph == "recovery":
            weeks.append({"km": vol * RECOVERY_FACTOR, "long": longs[-1] * RECOVERY_FACTOR, "phase": ph})
        else:
            break
        if i == tune_week and ph in ("build", "peak", "recovery"):
            weeks[-1].update({"km": weeks[-1]["km"] * 0.85, "long": None,
                              "tune_up": tune_up_km(ctx["race"]["distance_km"])})
        longs.append(weeks[-1]["long"] or weeks[-1].get("tune_up") or 0.0)
    peak = max((w["km"] for w in weeks), default=vol)
    peak_long = max((w["long"] or 0 for w in weeks), default=ctx["long0"]) or ctx["long0"]
    taper_n = len(phases) - len(weeks)
    shares = TAPER if ctx["race"]["distance_km"] >= 40 else TAPER_SHORT
    for j, share in enumerate(shares.get(taper_n, (0.6,) * taper_n)[-taper_n:]):
        race_week = j == taper_n - 1
        weeks.append({"km": peak * share, "long": None if race_week else peak_long * (0.7 if j == 0 else 0.5),
                      "phase": "race week" if race_week else "taper"})
    return weeks


def _quality(phase: str, which: int, q_km: float, paces: dict[str, float | None]) -> dict[str, Any]:
    """The quality session the plan picks for a phase (which = 0 first, 1 second)."""
    lt, goal = paces["threshold"], paces["goal"]
    iv = lt - 20 if lt else None
    gp_km = max(3, round(q_km * 0.6))
    # the main set scales with the session's distance (about 2.5-3 km of warm-up and cool-down around it)
    reps = max(3, min(6, round((q_km - 3) / 1.3)))
    tempo = max(15, min(25, 5 * round((q_km - 3) * 4.5 / 5)))
    cruise = 3 if q_km >= 9 else 2
    table = {
        "base": [("intervals", iv, f"Intervals: {reps} x 1 km at {_pace(iv)}/km, 2 min jog (VO2max)"),
                 ("threshold", lt, f"Tempo: {tempo} min at threshold {_pace(lt)}/km")],
        "build": [("threshold", lt, f"Cruise intervals: {cruise} x 10 min at threshold {_pace(lt)}/km, 2 min jog"),
                  ("threshold", goal, f"Goal pace: {gp_km} km at {_pace(goal)}/km inside the run")],
        "peak": [("threshold", lt, f"Threshold: 2 x 15 min at {_pace(lt)}/km, 3 min jog"),
                 ("threshold", goal, f"Goal pace: {gp_km + 2} km at {_pace(goal)}/km inside the run")],
        "taper": [("threshold", goal, f"Sharpener: 3 x 2 km at goal pace {_pace(goal)}/km, 2 min jog"),
                  ("intervals", iv, f"Strides and 4 x 1 km at {_pace(iv)}/km, full recovery")],
        "sharpen": [("threshold", goal, f"Race pace: 3 x 3 km at goal pace {_pace(goal)}/km, 3 min jog"),
                    ("threshold", lt, f"Threshold: 2 x 12 min at {_pace(lt)}/km, 3 min jog")],
        "recovery": [("threshold", lt, f"Tempo: 15 min at threshold {_pace(lt)}/km"),
                     ("threshold", lt, "")],
    }
    session, pace, notes = table[phase][which]
    return {"session": session, "target_pace_s_per_km": pace, "notes": notes}


def _week_days(week_start: dt.date, w: dict[str, Any], paces: dict[str, float | None],
               race: dict[str, Any] | None, opts: PlanOptions) -> list[dict[str, Any]]:
    """Seven days for one week from the runner's runs per week and quality sessions."""
    phase = w["phase"]
    day = lambda n: week_start + dt.timedelta(days=n)  # noqa: E731
    easy_p, goal_p = paces["easy"], paces["goal"]

    if phase == "race week":
        q = round(min(8.0, w["km"] * 0.35), 1)
        easy_km = max(w["km"] - q, 0)
        # easy runs of at least 5 km: fewer of them in a light race week
        others = max(min(opts.runs_per_week - 2, int(easy_km // EASY_MIN_KM)), 1)
        days = [{"day": day(1), "session": "threshold", "planned_km": q, "target_pace_s_per_km": goal_p,
                 "notes": f"Sharpener: 4 x 1 km at goal pace {_pace(goal_p)}/km, 2 min jog"}]
        for i, n in enumerate(sorted((3, 5, 2, 0)[:others])):
            days.append({"day": day(n), "session": "easy", "planned_km": round(easy_km / others, 1),
                         "target_pace_s_per_km": easy_p, "notes": "Easy" + (", with 4 strides" if i == 0 else "")})
        if race:
            days.append({"day": race["race_date"], "session": "race", "planned_km": race["distance_km"],
                         "planned_min": race["goal_time_s"] / 60 if race["goal_time_s"] else None,
                         "target_pace_s_per_km": goal_p, "notes": f"{race['name']}: goal pace {_pace(goal_p)}/km"})
            days = [d for d in days if d["day"] < race["race_date"] or d["session"] == "race"]
        planned = {d["day"] for d in days}
        days += [{"day": day(n), "session": "rest", "notes": "Rest"} for n in range(7)
                 if day(n) not in planned and (not race or day(n) < race["race_date"])]
        return sorted(days, key=lambda d: d["day"])

    if w.get("tune_up"):
        # a lighter week ending in the tune-up race: one short threshold session, easy runs, rest
        # the day before; the race replaces the long run
        tk, lt = w["tune_up"], paces["threshold"]
        name = "half marathon" if tk > 20 else "10K"
        q = round(min(8.0, w["km"] * 0.2), 1)
        easy_total = max(w["km"] - tk - q, 0)
        n_easy = min(max(opts.runs_per_week - 2, 0), int(easy_total // EASY_MIN_KM))
        days = [{"day": day(1), "session": "threshold", "planned_km": q, "target_pace_s_per_km": lt,
                 "notes": f"Tempo: 15 min at threshold {_pace(lt)}/km, the week's only hard session"},
                {"day": day(6), "session": "race", "planned_km": round(tk, 1),
                 "target_pace_s_per_km": (lt + 10) if lt else None,
                 "notes": f"Tune-up race: a {name} as a hard, even effort (about {_pace((lt + 10) if lt else None)}/km). "
                          "Mark it as a race afterwards: its result recalibrates your forecast"}]
        for n in sorted((2, 3, 0, 4)[:n_easy]):
            days.append({"day": day(n), "session": "easy", "planned_km": round(easy_total / n_easy, 1),
                         "target_pace_s_per_km": easy_p, "notes": "Easy, conversational (Z2)"})
        used = {d["day"] for d in days}
        days += [{"day": day(n), "session": "rest", "notes": "Rest" if n != 5 else "Rest before the tune-up race"}
                 for n in range(7) if day(n) not in used]
        return sorted(days, key=lambda d: d["day"])

    runs = opts.runs_per_week
    n_quality = min(opts.quality, runs - 1, 1 if phase == "recovery" else 2)
    q_km = round(min(12.0 if phase in ("build", "peak", "sharpen") else 10.0, w["km"] * 0.2) * (0.7 if phase == "taper" else 1), 1)
    long_km = round(w["long"], 1) if w["long"] else 0.0
    # the quality sessions and the long run are the week's key sessions; every other run the runner
    # asked for is easy and shares what is left (fewer only when under 2 km each would remain)
    days: list[dict[str, Any]] = []
    for i in range(n_quality):
        days.append({**_quality(phase, i, q_km, paces), "day": day(QUALITY_DAYS[i]), "planned_km": q_km})
    easy_km = max(w["km"] - long_km - q_km * n_quality, 0)
    n_easy = min(max(runs - 1 - n_quality, 0), int(easy_km / EASY_MIN_KM + 1e-6))
    free = [d for d in (*QUALITY_DAYS[n_quality:], *EASY_DAYS)][:n_easy]
    easy_each = min(easy_km / n_easy, max(EASY_OF_LONG * long_km, EASY_SHORT_KM)) if n_easy else 0
    easy_note = (f"Easy, conversational (Z2). Flexible: any free day, or add these {easy_each:.1f} km to a "
                 "quality day's warm-up or cool-down") if easy_each < EASY_SHORT_KM else \
        "Easy, conversational (Z2). Flexible: any free day"
    for n in sorted(free):
        days.append({"day": day(n), "session": "easy", "planned_km": round(easy_each, 1),
                     "target_pace_s_per_km": easy_p, "notes": easy_note})
    long_note = "Long run, easy and steady (durability)"
    if phase == "sharpen" and goal_p:
        long_note = f"Long run, easy; last {min(5, round(long_km * 0.25))} km at goal pace {_pace(goal_p)}/km"
    elif phase == "peak" and goal_p:
        long_note = f"Long run, easy; last {min(10, round(long_km * 0.3))} km at goal pace {_pace(goal_p)}/km"
    elif phase == "build" and goal_p:
        long_note = f"Long run, easy; last {min(6, round(long_km * 0.2))} km at goal pace {_pace(goal_p)}/km"
    days.append({"day": day(LONG_DAY), "session": "long", "planned_km": long_km, "target_pace_s_per_km": easy_p,
                 "notes": long_note})
    used = {d["day"] for d in days}
    strength_day = next((day(n) for n in (4, 0, 2) if day(n) not in used), None)
    if strength_day:
        days.append({"day": strength_day, "session": "strength", "planned_min": 35,
                     "notes": "Strength & plyometrics, 30-40 min (economy)"})
        used.add(strength_day)
    days += [{"day": day(n), "session": "rest", "notes": "Rest"} for n in range(7) if day(n) not in used]
    return sorted(days, key=lambda d: d["day"])


def plan_context(conn: psycopg.Connection, race_id: int, today: dt.date | None = None) -> dict[str, Any]:
    """Everything a plan is built from, read once: the race, the last 4 weeks, the runner's paces."""
    today = today or dt.date.today()
    race = conn.execute(
        "select race_id, name, race_date, distance_km, goal_time_s from app.race where race_id = %s", (race_id,)
    ).fetchone()
    if not race:
        raise InvalidInput(f"race {race_id} not found")
    if race["race_date"] <= today:
        raise InvalidInput("the race is not in the future")
    # Where the runner is now: the last 2 complete weeks (Monday to Sunday). A raw 28-day average
    # would count a missed week and the first days of the current one, and start the plan too low.
    this_monday = today - dt.timedelta(days=today.weekday())
    recent = conn.execute(
        """select coalesce(sum(distance_km), 0) / 2.0 as vol, count(distinct start_date) / 2.0 as run_days,
                  array_agg(distinct date_trunc('week', start_date)::date) as weeks
           from garmin.activity where is_run and start_date >= %s - 14 and start_date < %s""",
        (this_monday, this_monday),
    ).fetchone()
    weekly = conn.execute(
        """select date_trunc('week', start_date)::date as week, sum(distance_km) as km, max(distance_km) as longest
           from garmin.activity where is_run and start_date >= %s - 14 and start_date < %s group by 1 order by 1""",
        (this_monday, this_monday),
    ).fetchall()
    longest = conn.execute(
        "select coalesce(max(distance_km), 0) as km from garmin.activity where is_run and start_date > %s - 28 and start_date <= %s",
        (today, today),
    ).fetchone()["km"]
    form = conn.execute(
        """select d.easy_hr_pace_s_per_km as easy, coalesce(d.lt_pace_own_s_per_km, d.lt_pace_s_per_km) as threshold,
                  (select pace_s_per_km from garmin.session_profile where kind = 'easy') as easy_profile
           from garmin.day d where d.calendar_date = %s""",
        (today,),
    ).fetchone() or {}
    paces = {"easy": form.get("easy") or form.get("easy_profile"), "threshold": form.get("threshold")}
    # The plan starts with the current week (its days so far are history) unless it is Sunday.
    partial = today.weekday() < 6
    start = this_monday if partial else this_monday + dt.timedelta(days=7)
    done_this_week = conn.execute(
        "select coalesce(sum(distance_km), 0) as km from garmin.activity where is_run and start_date between %s and %s",
        (this_monday, today),
    ).fetchone()["km"] if partial else 0.0
    race_week = race["race_date"] - dt.timedelta(days=race["race_date"].weekday())
    n = (race_week - start).days // 7 + 1
    if n < 1:
        raise InvalidInput("the race is too close for a plan (less than a week)")
    biggest = conn.execute(
        """select coalesce(max(km), 0) as km from (select sum(distance_km) as km from garmin.activity
           where is_run and start_date > %s - 365 group by date_trunc('week', start_date)) x""", (today,)
    ).fetchone()["km"]
    # the starting load: last complete week, or the 2-week average if that is higher (a low last week,
    # e.g. illness, does not drag the plan down; continuing at last week's level is not a jump)
    last_week = float(weekly[-1]["km"]) if weekly and weekly[-1]["week"] == this_monday - dt.timedelta(days=7) else 0.0
    vol0 = max(float(recent["vol"]), last_week)
    long0 = float(longest) or 0.25 * max(vol0, 12.0)
    lim = distance_limits(race["distance_km"])
    habits = {"runs_per_week": max(3, min(6, math.floor(float(recent["run_days"]) + 0.5))),
              "biggest_week": float(biggest),
              "peak_default": float(min(lim["peak_cap"], max(5 * round(PEAK_OF_BIGGEST * float(biggest) / 5), 5 * round(vol0 / 5)))),
              "recent_weeks": [{"week": w["week"], "km": float(w["km"]), "longest": float(w["longest"])} for w in weekly],
              "start_km": vol0, "last_week_km": last_week or vol0, "longest_4w": long0}
    habits["done_this_week"] = float(done_this_week)
    habits["weeks"] = n
    return {"today": today, "race": race, "paces": paces, "start": start, "n": n, "vol0": vol0, "long0": long0,
            "habits": habits, "partial_first": partial, "done_this_week": float(done_this_week)}


def _fill_current_week(days: list[dict[str, Any]], target_km: float, done_km: float, today: dt.date) -> list[dict[str, Any]]:
    """The current week: its days up to today are history, so only later days are planned. The
    long run keeps its distance; easy runs fill what is left of the week's target after what was
    already run (each still at most 3/4 of the long run); a quality day still ahead keeps its session."""
    ahead = [d for d in days if d["day"] > today]
    long_km = sum(d.get("planned_km") or 0 for d in ahead if d["session"] == "long")
    quality_km = sum(d.get("planned_km") or 0 for d in ahead if d["session"] in ("threshold", "intervals"))
    easy = [d for d in ahead if d["session"] == "easy"]
    fill = max(target_km - done_km - long_km - quality_km, 0)
    cap = max(EASY_OF_LONG * long_km, 5.0)
    out = []
    for d in ahead:
        if d["session"] == "easy":
            km = round(min(fill / len(easy), cap), 1)
            d = {**d, "planned_km": km} if km >= EASY_MIN_KM else {"day": d["day"], "session": "rest", "notes": "Rest"}
        out.append(d)
    return out


def plan_days(ctx: dict[str, Any], options: Any = None, pace_scale: dict[int, float] | None = None) -> list[dict[str, Any]]:
    """The plan's days from a plan_context, from the current week (days after today) or next Monday
    to race day. Each day carries its week's phase and week number. options: PlanOptions or a dict.
    pace_scale: week -> factor on the threshold pace (and the interval pace from it), from the
    projected fitness at the start of that week's phase (scenario.compute); goal and easy paces stay."""
    race = ctx["race"]
    opts = options if isinstance(options, PlanOptions) else plan_options(options, race["distance_km"], ctx["habits"])
    target = opts.target_time_s or race["goal_time_s"]
    paces = {**ctx["paces"], "goal": target / race["distance_km"] if target else None}
    days: list[dict[str, Any]] = []
    weeks = _weeks(ctx, opts)
    for i, w in enumerate(weeks):
        is_race_week = i == len(weeks) - 1
        s = (pace_scale or {}).get(i + 1, 1.0)
        week_paces = {**paces, "threshold": paces["threshold"] * s if paces.get("threshold") else None}
        week = _week_days(ctx["start"] + dt.timedelta(weeks=i), w, week_paces, race if is_race_week else None, opts)
        if i == 0 and ctx.get("partial_first"):
            week = _fill_current_week(week, w["km"], ctx["done_this_week"], ctx["today"])
        days += [{**d, "phase": w["phase"], "week": i + 1} for d in week]
    return days


def build_plan(conn: psycopg.Connection, race_id: int, today: dt.date | None = None,
               options: Any = None) -> list[dict[str, Any]]:
    """The plan's days for a race (not written)."""
    return plan_days(plan_context(conn, race_id, today), options)


def generate_plan(body: dict[str, Any]) -> dict[str, Any]:
    """Replace a race's future plan with the starter plan. Past days (planned vs done) are kept."""
    race_id = _int(body.get("race_id"), "race_id")
    from .scenario import load, compute   # the preview's plan, paces included (no import cycle at load)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        ctx = load(conn, race_id)
        opts = plan_options(body.get("options"), ctx["race"]["distance_km"], ctx["habits"])
        days = compute(ctx, opts)["days"]
        conn.execute("delete from app.plan_day where race_id = %s and day > current_date", (race_id,))
        for d in days:
            _upsert(conn, race_id, _clean(d))
        conn.commit()
        conn.execute("delete from raw.sync_state where key = %s", (f"plan_paces_anchor:{race_id}",))
        update_phase_paces(conn, anchor_only=True)
    return {"race_id": race_id, "days": len(days), "from": str(days[0]["day"]), "to": str(days[-1]["day"])}


GOAL_PACE_WORDS = ("goal pace", "Goal pace", "Race pace", "race pace", "Sharpener", "Tune-up race")


def _block_start(days: list[dict[str, Any]], today: dt.date) -> tuple[dt.date, str] | None:
    """The first day of the phase the plan is in from today on (a recovery week belongs to its phase)."""
    days = sorted((d for d in days if d["phase"]), key=lambda d: d["day"])
    fam: list[str] = []
    for d in days:
        fam.append(fam[-1] if d["phase"] == "recovery" and fam else d["phase"])
    i = next((k for k, d in enumerate(days) if d["day"] > today), None)
    if i is None:
        return None
    j = i
    while j > 0 and fam[j - 1] == fam[i]:
        j -= 1
    return days[j]["day"], fam[i]


def update_phase_paces(conn: psycopg.Connection, anchor_only: bool = False) -> list[dict[str, Any]]:
    """At the start of each phase of a saved plan, bring its session paces up to date: the threshold
    and interval sessions from today on move by the ratio of the runner's measured threshold pace now
    (garmin.day) to the threshold pace planned for this phase; the projected progression of later
    phases is kept on top. Goal-pace sessions stay at goal pace. Runs once per phase (sync_state)."""
    from psycopg.rows import tuple_row
    from .sync import get_state, set_state
    today = dt.date.today()
    out = []
    cur = conn.cursor(row_factory=tuple_row)   # whatever row factory the caller's connection uses
    measured = cur.execute(
        "select coalesce(lt_pace_own_s_per_km, lt_pace_s_per_km) from garmin.day where calendar_date = %s", (today,)
    ).fetchone()
    measured = measured[0] if measured else None
    for (race_id,) in cur.execute(
            "select distinct race_id from app.plan_day p join app.race r using (race_id) where r.race_date > %s", (today,)).fetchall():
        days = [dict(zip(("plan_day_id", "day", "phase", "session", "target_pace_s_per_km", "notes"), r)) for r in cur.execute(
            """select plan_day_id, day, phase, session, target_pace_s_per_km, notes from app.plan_day
               where race_id = %s order by day""", (race_id,)).fetchall()]
        block = _block_start(days, today)
        if not block:
            continue
        key = f"plan_paces_anchor:{race_id}"
        if get_state(conn, key) == block[0].isoformat():
            continue
        set_state(conn, key, block[0].isoformat())
        if anchor_only or not measured:
            continue
        in_block = [d for d in days if d["day"] >= block[0] and d["day"] > today]
        planned = next((d["target_pace_s_per_km"] for d in in_block if d["session"] == "threshold" and d["target_pace_s_per_km"]
                        and not any(w in (d["notes"] or "") for w in GOAL_PACE_WORDS)), None)
        if not planned:
            continue
        ratio = measured / planned
        if abs(ratio - 1) < 0.005:
            continue
        changed = 0
        for d in days:
            if d["day"] <= today or d["session"] not in ("threshold", "intervals") or not d["target_pace_s_per_km"]:
                continue
            if any(w in (d["notes"] or "") for w in GOAL_PACE_WORDS):
                continue
            old, new = d["target_pace_s_per_km"], d["target_pace_s_per_km"] * ratio
            notes = (d["notes"] or "").replace(f"{_pace(old)}/km", f"{_pace(new)}/km")
            cur.execute("update app.plan_day set target_pace_s_per_km = %s, notes = %s, updated_at = now() where plan_day_id = %s",
                         (round(new, 1), notes, d["plan_day_id"]))
            changed += 1
        out.append({"race_id": race_id, "phase": block[1], "from": block[0], "ratio": ratio, "sessions": changed})
    conn.commit()
    return out


def save_days(body: dict[str, Any]) -> dict[str, Any]:
    """Upsert planned days of one race: {race_id, days: [{day, session, planned_km?, planned_min?,
    target_pace_s_per_km?, target_hr?, notes?}]}. A day with session null or '' is removed."""
    race_id = _int(body.get("race_id"), "race_id")
    days = body.get("days")
    if not isinstance(days, list) or not 1 <= len(days) <= 31:
        raise InvalidInput("days must be a list of 1 to 31 days")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        if not conn.execute("select 1 from app.race where race_id = %s", (race_id,)).fetchone():
            raise InvalidInput(f"race {race_id} not found")
        saved = removed = 0
        for raw in days:
            if not isinstance(raw, dict):
                raise InvalidInput("each day must be an object")
            if raw.get("session") in (None, ""):
                day = _date(raw.get("day"))
                removed += conn.execute("delete from app.plan_day where race_id = %s and day = %s",
                                        (race_id, day)).rowcount
                continue
            _upsert(conn, race_id, _clean(raw))
            saved += 1
        conn.commit()
    return {"saved": saved, "removed": removed}


def delete_day(plan_day_id: int) -> bool:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        deleted = conn.execute("delete from app.plan_day where plan_day_id = %s", (plan_day_id,)).rowcount > 0
        conn.commit()
        return deleted


def _upsert(conn: psycopg.Connection, race_id: int, d: dict[str, Any]) -> None:
    conn.execute(
        """insert into app.plan_day (race_id, day, session, planned_km, planned_min, target_pace_s_per_km, target_hr, notes, phase)
           values (%(race_id)s, %(day)s, %(session)s, %(planned_km)s, %(planned_min)s, %(target_pace_s_per_km)s,
                   %(target_hr)s, %(notes)s, %(phase)s)
           on conflict (race_id, day) do update set
             session = excluded.session, planned_km = excluded.planned_km, planned_min = excluded.planned_min,
             target_pace_s_per_km = excluded.target_pace_s_per_km, target_hr = excluded.target_hr,
             notes = excluded.notes, phase = coalesce(excluded.phase, app.plan_day.phase), updated_at = now()""",
        {**d, "race_id": race_id},
    )


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    session = str(d.get("session") or "")
    if session not in SESSIONS:
        raise InvalidInput(f"session must be one of {', '.join(SESSIONS)}")
    out = {"day": _date(d.get("day")), "session": session,
           "planned_km": _num(d.get("planned_km"), "planned_km", 0, 200),
           "planned_min": _num(d.get("planned_min"), "planned_min", 0, 1440),
           "target_pace_s_per_km": _num(d.get("target_pace_s_per_km"), "target_pace_s_per_km", 120, 1200),
           "target_hr": _num(d.get("target_hr"), "target_hr", 60, 230),
           "notes": (str(d["notes"])[:500] if d.get("notes") else None),
           "phase": d.get("phase") if d.get("phase") in ("sharpen", "base", "build", "recovery", "peak", "taper", "race week") else None}
    if session == "rest":
        out["planned_km"] = out["planned_min"] = out["target_pace_s_per_km"] = out["target_hr"] = None
    return out


def _date(v: Any) -> dt.date:
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v))
    except ValueError:
        raise InvalidInput("day must be YYYY-MM-DD") from None


def _num(v: Any, name: str, lo: float, hi: float) -> float | None:
    if v in (None, ""):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise InvalidInput(f"{name} must be a number") from None
    if not lo <= x <= hi:
        raise InvalidInput(f"{name} must be between {lo:g} and {hi:g}")
    return round(x, 2)


def _int(v: Any, name: str) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        raise InvalidInput(f"{name} must be an integer") from None
