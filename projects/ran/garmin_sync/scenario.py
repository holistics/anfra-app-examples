"""The Race Planner's model: from what the runner controls to the race time, without writing anything
(POST /plan/preview). The chain follows the README's causal model:

    controls (runs a week, quality sessions, longest long run, weekly increase, taper)
      -> plan (planner.plan_days)
      -> race day: marathon shape (from the plan's km and long runs, the garmin.day formula)
                   race fitness  (effective VO2max today + vo2_per_ctl x change in 30-day mean CTL,
                                  fitted on the runner's history by garmin-sync fit)
                   freshness     (fatigue and fitness carried to race eve with the plan's load)
      -> time = Daniels(VO2max x shape factor, distance) x calibration x (1 + heat %) x (1 + taper %)

The saved plan's forecast (garmin.race_forecast) is the same calculation in SQL.

On top of the chain:
  - best realistic plan: the fastest plan inside the evidence's safe zone for every control, with
    the runner's runs per week kept (a life constraint). Without options, the preview starts there.
  - target: the goal when the best realistic plan reaches it, else the best realistic time, with
    what the goal would need.
  - zones per control: the time at each value with the others held, where the target stops being
    reached (too little), where more stops helping (flat), and where injury evidence starts (risk).
"""

from __future__ import annotations

import datetime as dt
import math
import os
from collections import defaultdict
from dataclasses import replace
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .model import daniels_demand, daniels_fraction, daniels_time_s, shape_factor
from .planner import PlanOptions, _int, asdict, distance_limits, plan_context, plan_days, plan_options, tune_up_possible

RUN_SESSIONS = ("easy", "long", "threshold", "intervals")
FOCUS = {
    # phase: (title, what the weeks hold, purpose: the determinant it trains)
    "sharpen": ("Sharpen: hold and get race-ready", "Volume and long run held where they are; race-pace reps and threshold work. Too little time to build fitness, enough to arrive sharp",
                "Keep the fitness you have and rehearse race pace"),
    "base": ("Base: aerobic volume and VO2max", "Volume up steadily, one long easy run a week, intervals and tempo",
             "Endurance: more weekly km and longer long runs raise the marathon shape (volume, durability); short intervals keep VO2max moving"),
    "build": ("Build: threshold and marathon-specific", "Cruise intervals at threshold, goal-pace work, long runs finishing at goal pace",
              "Threshold: the share of VO2max you can hold for hours, plus race-specific long runs"),
    "peak": ("Peak: the biggest weeks", "Highest volume and longest long runs, threshold and long goal-pace work",
             "The most endurance before the taper: the marathon shape peaks here"),
    "taper": ("Taper: freshness", "Volume down, intensity kept: shorter long runs, goal-pace sharpeners",
              "Freshness: fatigue falls faster than fitness, so you race rested"),
    "race week": ("Race week", "A short sharpener at goal pace, easy runs, rest, race", "Arrive fresh"),
}


def control_space(distance_km: float, habits: dict[str, Any]) -> list[dict[str, Any]]:
    """The controls, most important first: values to sweep, and the evidence's zones (amber =
    caution, red = injury risk)."""
    lim = distance_limits(distance_km)
    long_hi = 36 if distance_km >= 40 else 26 if distance_km >= 20 else 20
    big = habits.get("biggest_week") or 0
    safe_peak = 1.25 * big if big else lim["peak_cap"]
    peaks = sorted({*range(30, int(lim["peak_cap"]) + 1, 5), int(habits.get("peak_default") or 0)} - {0})
    last = habits.get("last_week_km") or habits.get("start_km") or 40.0
    return [
        {"key": "start_km", "label": "This week", "unit": " km",
         "values": sorted({*range(int(5 * math.floor(last * 0.8 / 5)), int(last * 1.3) + 1, 5)}),
         "amber": lambda v: v > last * 1.10 + 0.5, "red": lambda v: v > last * 1.20 + 0.5,
         "risk": f"more than 10 % over last week ({last:.0f} km) is the usual caution; over 20 % raised injuries "
                 "in the next 3 weeks (Damsted 2019)"},
        {"key": "ramp_pct", "label": "Weekly increase", "unit": " %", "values": list(range(4, 25, 2)),
         "amber": lambda v: v > 10, "red": lambda v: v > 20,
         "risk": "over 10 % is the usual caution; over 20 % a week raised injuries in the next 3 weeks (Damsted 2019)"},
        {"key": "peak_km", "label": "Biggest week", "unit": " km", "values": peaks,
         "amber": lambda v: v > safe_peak + 0.5, "red": lambda v: False,
         "risk": f"well beyond your biggest week of the last year ({big:.0f} km): your body has not carried that load yet"},
        {"key": "long_max_km", "label": "Longest long run", "unit": " km",
         "values": list(range(10 if distance_km >= 20 else 8, long_hi + 1, 2)),
         "amber": lambda v: v > lim["long_max"] + 0.5, "red": lambda v: False,
         "risk": f"beyond {lim['long_max']:.0f} km, the usual cap for this distance, the recovery cost grows faster than the benefit (weak evidence). "
                 "Each long run stays within 10 % of your longest of the past 4 weeks (Frandsen 2025)"},
        {"key": "runs_per_week", "label": "Runs per week", "unit": "", "values": [3, 4, 5, 6, 7],
         "amber": lambda v: v >= 7, "red": lambda v: False,
         "risk": "7 runs leaves no rest day", "life": True},
        {"key": "quality", "label": "Quality sessions a week", "unit": "", "values": [0, 1, 2],
         "amber": lambda v: v == 0, "red": lambda v: False,
         "risk": "0 leaves threshold and VO2max to volume alone; more than 2 hard sessions a week is a common caution"},
        {"key": "taper_weeks", "label": "Taper", "unit": " wk", "values": list(lim["taper"]),
         "amber": lambda v: v not in lim["taper"], "red": lambda v: False,
         "risk": f"the evidence favours {'–'.join(map(str, lim['taper']))} weeks for this distance (Bosquet 2007)"},
        {"key": "front_loaded", "label": "Build-up", "unit": "", "values": [0, 1],
         "amber": lambda v: False, "red": lambda v: False,
         "risk": "gradual: biggest week at the peak, long runs alternating, less total running; front-loaded: "
                 "biggest week as early as the weekly increase allows, the longest long run every week, more running. "
                 "Both stay inside the injury limits; no study compares them"},
    ] + ([{"key": "tune_up", "label": "Tune-up race", "unit": "", "values": [0, 1],
           "amber": lambda v: False, "red": lambda v: False,
           "risk": "a race 6 weeks out checks the forecast against reality; it costs a lighter week"}]
         if tune_up_possible(distance_km, habits.get("weeks") or 0) else [])


def load(conn: psycopg.Connection, race_id: int) -> dict[str, Any]:
    """Everything the model needs, read once; compute() is then pure and fast."""
    today = dt.date.today()
    ctx = plan_context(conn, race_id, today)
    race = ctx["race"]
    ctx["day"] = conn.execute(
        """select vo2_effective, vo2max_garmin, atl, ctl, marathon_shape, lt_fraction
           from garmin.day where calendar_date = %s""", (today,)
    ).fetchone() or {}
    ctx["ctl_hist"] = {r["calendar_date"]: r["ctl"] for r in conn.execute(
        "select calendar_date, ctl from garmin.day where calendar_date between %s and %s",
        (today - dt.timedelta(days=40), today))}
    ctx["profile"] = {r["kind"]: r for r in conn.execute("select kind, pace_s_per_km, load_per_min from garmin.session_profile")}
    ctx["runs"] = [(r["start_date"], r["distance_km"]) for r in conn.execute(
        """select start_date, distance_km from garmin.activity
           where is_run and start_date between %s and %s""", (race["race_date"] - dt.timedelta(days=220), today))]   # 26 weeks before the pre-taper days too (as SQL)
    ctx["fc"] = conn.execute(
        """select predicted_time_s, heat_adj_pct, calibration, band_pct, race_wbgt_c, training_wbgt_c,
                  has_plan, shape_race
           from garmin.race_forecast where race_id = %s""", (race_id,)
    ).fetchone() or {}
    ctx["param"] = {r["name"]: float(r["value"]) for r in conn.execute("select name, value from garmin.planner_param")}
    ctx["fit"] = {r["name"]: r for r in conn.execute("select name, value, ci_low, ci_high, n from garmin.model_param")}
    dec = conn.execute(
        """select avg(m.decoupling_pct) as v from garmin.activity_marker m join garmin.activity a using (activity_id)
           where a.start_date >= current_date - 56 and m.decoupling_pct is not null"""
    ).fetchone()
    ctx["decoupling"] = dec["v"] if dec else None
    return ctx


def marathon_shape(runs: list[tuple[dt.date, float]], on: dt.date, vo2: float) -> float | None:
    """Runalyze's marathon shape on a day (the garmin.day formula): 26 weeks of km and 10 weeks of
    runs of 13 km or more, relative to VO2max. runs = (date, km)."""
    if not vo2 or vo2 <= 4:
        return None
    week_km = sum(k for t, k in runs if on - dt.timedelta(days=181) <= t <= on) / 26
    longs = sum((2 - 2.0 * (on - t).days / 70) * ((k - 13) / (math.log(vo2 / 4) * 12 - 13)) ** 2
                for t, k in runs if on - dt.timedelta(days=69) <= t <= on and k >= 13)
    return 100 * (2.0 / 3 * week_km / vo2 ** 1.135 + 1.0 / 3 * longs / 10)


def pre_taper_day(days: list[dict[str, Any]]) -> dt.date | None:
    """The day before the plan's taper (or race week, when there is no taper) starts; the same rule as
    garmin.race_forecast."""
    starts = [d["day"] for d in days if d.get("phase") in ("taper", "race week")]
    return min(starts) - dt.timedelta(days=1) if starts else None


PRE_TAPER_HOLD_WEEKS = 3


def pre_taper_shape(pts: list[tuple[dt.date, float]], pre: dt.date | None, today: dt.date, until: dt.date,
                    vo2: float) -> float | None:
    """The highest marathon shape on the day before the taper and the same weekday 1 and 2 weeks
    earlier, counting only days still ahead and before `until`; None when there is none."""
    if not pre:
        return None
    on = [pre - dt.timedelta(weeks=k) for k in range(PRE_TAPER_HOLD_WEEKS)]
    vals = [marathon_shape(pts, d, vo2) for d in on if today < d < until]
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


def _estimate(days: list[dict[str, Any]], profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Each planned day's km, minutes and load, as garmin.plan_day estimates them."""
    for d in days:
        p = profile.get(d["session"]) or {}
        pace, lpm = p.get("pace_s_per_km"), p.get("load_per_min") or 0
        d["km_est"] = None if d["session"] in ("rest", "strength") else (
            d.get("planned_km") if d.get("planned_km") is not None
            else (d["planned_min"] * 60 / pace if d.get("planned_min") and pace else None))
        d["min_est"] = 0 if d["session"] == "rest" else (
            d.get("planned_min") if d.get("planned_min") is not None
            else (d["planned_km"] * pace / 60 if d.get("planned_km") and pace else 0))
        d["load"] = (d["min_est"] or 0) * lpm
    return days


def _phase_family(phases: list[str]) -> list[str]:
    """A recovery week belongs to the phase it sits in."""
    out: list[str] = []
    for ph in phases:
        out.append(out[-1] if ph == "recovery" and out else ph)
    return out


def _phase_pace_scales(days: list[dict[str, Any]], vo2_on, vo2_today: float | None) -> tuple[dict[int, float], dict[int, dt.date]]:
    """week -> factor on the threshold pace: VO2max today / projected VO2max at the start of the
    week's phase (pace ~ inversely proportional to VO2max at a fixed share of it, Daniels). The taper
    and race week keep the last training phase's paces (a taper keeps fitness)."""
    by_week: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for d in days:
        by_week[d["week"]].append(d)
    weeks = sorted(by_week)
    fams = _phase_family([by_week[w][0]["phase"] for w in weeks])
    scales: dict[int, float] = {}
    starts: dict[int, dt.date] = {}
    last = 1.0
    for i, w in enumerate(weeks):
        if fams[i] in ("taper", "race week"):
            scales[w] = last
            continue
        first = next(j for j in range(i, -1, -1) if j == 0 or fams[j - 1] != fams[i])
        start = min(d["day"] for d in by_week[weeks[first]])
        start = start - dt.timedelta(days=start.weekday())
        starts[w] = start
        v = vo2_on(start) if vo2_today else None
        scales[w] = last = (vo2_today / v) if v and vo2_today else 1.0
    return scales, starts


def _ctl30(path: dict[dt.date, float], end: dt.date) -> float | None:
    xs = [path[end - dt.timedelta(days=i)] for i in range(30) if (end - dt.timedelta(days=i)) in path]
    return sum(xs) / len(xs) if xs else None


def compute(ctx: dict[str, Any], opts: PlanOptions, full: bool = True) -> dict[str, Any]:
    """The chain for one set of controls. full=False returns only what the sweeps need."""
    race, today, profile, param, day, fc = ctx["race"], ctx["today"], ctx["profile"], ctx["param"], ctx["day"], ctx["fc"]
    km = race["distance_km"]
    days = _estimate(plan_days(ctx, opts), profile)
    race_date, eve = race["race_date"], race["race_date"] - dt.timedelta(days=1)

    # Fatigue and fitness carried to race eve with the plan's load (garmin.projection).
    load_by_day: dict[dt.date, float] = defaultdict(float)
    for d in days:
        if d["day"] > today:
            load_by_day[d["day"]] += d["load"]
    atl, ctl = day.get("atl") or 0.0, day.get("ctl") or 0.0
    path = dict(ctx["ctl_hist"])
    fitness = []
    t = today
    while t < eve:
        t += dt.timedelta(days=1)
        ld = load_by_day.get(t, 0.0)
        atl += (ld - atl) * (1 - math.exp(-1 / param["atl_days"]))
        ctl += (ld - ctl) * (1 - math.exp(-1 / param["ctl_days"]))
        path[t] = ctl
        fitness.append((t, ctl, atl, ld))

    # Race fitness along the way: today's effective VO2max moved by the change in 30-day mean CTL.
    fit = ctx["fit"].get("vo2_per_ctl")
    b = fit["value"] if fit else 0.0
    c_now = _ctl30(ctx["ctl_hist"], today)
    vo2_today = day.get("vo2_effective")

    def vo2_on(on: dt.date) -> float | None:
        c = _ctl30(path, on)
        return vo2_today + b * ((c - c_now) if c is not None and c_now is not None else 0.0) if vo2_today else None

    # Session paces follow the fitness projected at the start of each phase (taper keeps the last).
    scales, starts = _phase_pace_scales(days, vo2_on, vo2_today)
    if any(abs(s - 1) > 1e-4 for s in scales.values()):
        days = _estimate(plan_days(ctx, opts, pace_scale=scales), profile)
    tsb_share = (ctl - atl) / ctl if ctl else None
    in_band = tsb_share is not None and param["tsb_band_low"] <= tsb_share <= param["tsb_band_high"]
    taper_adj = param["taper_gain_pct"] if tsb_share is not None and tsb_share < param["tsb_band_low"] else 0.0

    # Race fitness on race day.
    c_eve = _ctl30(path, eve)
    dctl = (c_eve - c_now) if c_now is not None and c_eve is not None else 0.0
    vo2 = vo2_today + b * dctl if vo2_today else None
    vo2_shape = (vo2_today or day.get("vo2max_garmin") or 0) + b * dctl

    # Marathon shape on race eve (garmin.day formula), runs so far plus the plan's runs.
    # runs so far plus the plan's runs, a tune-up race included (the race itself is on race day)
    pts = list(ctx["runs"]) + [(d["day"], d["km_est"]) for d in days
                               if today < d["day"] < race_date and d["session"] not in ("rest", "strength") and d["km_est"]]
    shape = marathon_shape(pts, eve, vo2_shape)
    # A planned taper keeps endurance: the formula reads its lower volume as lost endurance, while
    # tapers of 2-3 weeks keep or improve performance (Bosquet 2007; Mujika & Padilla 2003). So the
    # race uses the higher of the shape on race eve and on the day before the taper, while that day is
    # still ahead: the best of the last three weeks before it (one day's shape depends on where the
    # last long runs fell). Past races and today's numbers use the formula as it is (garmin.day).
    pre = pre_taper_day(days)
    shape_pre = pre_taper_shape(pts, pre, today, eve, vo2_shape)
    if shape is not None and shape_pre is not None:
        shape = max(shape, shape_pre)

    cal = fc.get("calibration") or 1.0
    heat = fc.get("heat_adj_pct") or 0.0
    k = cal * (1 + heat / 100) * (1 + taper_adj / 100)
    sf = shape_factor(shape, km)
    t_full = daniels_time_s(vo2, km) if vo2 else None
    t_shape = daniels_time_s(vo2 * sf, km) if vo2 else None
    predicted = t_shape * k if t_shape else None
    def training(d: dict[str, Any]) -> bool:   # a run of the plan, a tune-up race included
        return d["session"] in RUN_SESSIONS or (d["session"] == "race" and d["day"] < race_date)
    total_km = sum(d["km_est"] or 0 for d in days if d["day"] > today and training(d))
    week_km: dict[int, float] = defaultdict(float)
    for d in days:
        if training(d):
            week_km[d["week"]] += d["km_est"] or 0
    if ctx.get("partial_first"):
        week_km[1] += ctx.get("done_this_week", 0.0)
    out: dict[str, Any] = {"predicted_time_s": predicted, "shape_race": shape, "vo2_race": vo2, "tsb_in_band": in_band,
                           "total_km": total_km, "peak_week_km": max(week_km.values(), default=0.0),
                           "long_run_km": max((d["km_est"] or 0 for d in days if d["session"] == "long"), default=0.0)}
    if not full:
        return out

    weeks = _weeks_summary(days, ctx.get("done_this_week", 0.0) if ctx.get("partial_first") else 0.0)
    phases = _phases(weeks, days)
    # What each phase should leave you with, at its last day: the same model as race day, without a taper.
    lt_today = ctx["paces"].get("threshold")
    on_day = {f[0]: f for f in fitness}
    held = None   # the marathon shape the last training phase leaves: a taper keeps it
    for ph in phases:
        end = min(ph["end"], eve)
        f_end = on_day.get(end)
        v_end = vo2_on(end)
        vo2_end_shape = (vo2_today or day.get("vo2max_garmin") or 0) + ((v_end - vo2_today) if v_end and vo2_today else 0)
        s_end = marathon_shape([p for p in pts if p[0] <= end], end, vo2_end_shape)
        if ph["phase"] in ("taper", "race week"):
            # the taper keeps the endurance the training left: the race's own hold (shape_pre, against
            # race-day VO2max) when there is one, so the last phase ends on the race-day forecast
            keep = shape_pre if shape_pre is not None else held
            if s_end is not None and keep is not None and pre and pre > today:
                s_end = max(s_end, keep)
        else:
            held = s_end
        ph["expected"] = {
            "on": end, "vo2": v_end, "shape": s_end,
            "threshold_pace_s_per_km": lt_today * vo2_today / v_end if lt_today and v_end and vo2_today else None,
            "race_time_s": daniels_time_s(v_end * shape_factor(s_end, km), km) * cal * (1 + heat / 100) if v_end else None,
            "week_km": ph["km_to"], "long_km": ph["long_to"],
            "ctl": f_end[1] if f_end else None, "atl": f_end[2] if f_end else None,
            "form_share": (f_end[1] - f_end[2]) / f_end[1] if f_end and f_end[1] else None,
        }
    vo2_lo = vo2_today + fit["ci_low"] * dctl if fit and vo2_today and fit["ci_low"] is not None else None
    vo2_hi = vo2_today + fit["ci_high"] * dctl if fit and vo2_today and fit["ci_high"] is not None else None
    out.update({
        "options": asdict(opts),
        "result": {
            "predicted_time_s": predicted, "band_pct": fc.get("band_pct"),
            "now_time_s": fc.get("predicted_time_s"), "now_has_plan": fc.get("has_plan"),
            "daniels_time_s": t_full, "daniels_shape_time_s": t_shape, "time_if_shape_met_s": t_full * k if t_full else None,
            "calibration": cal, "heat_adj_pct": heat, "taper_adj_pct": taper_adj, "k": k,
            "vo2_today": vo2_today, "vo2_race": vo2,
            "vo2_race_range": [min(vo2_lo, vo2_hi), max(vo2_lo, vo2_hi)] if vo2_lo is not None and vo2_hi is not None else None,
            "vo2_per_ctl": b, "ctl30_today": c_now, "ctl30_race": c_eve,
            "shape_today": day.get("marathon_shape"), "shape_race": shape, "shape_needed": km ** 1.23, "shape_factor": sf,
            "tsb_share": tsb_share, "tsb_in_band": in_band, "tsb_band": [param["tsb_band_low"], param["tsb_band_high"]],
            "race_wbgt_c": fc.get("race_wbgt_c"), "training_wbgt_c": fc.get("training_wbgt_c"),
            "decoupling_pct": ctx["decoupling"], "lt_fraction": day.get("lt_fraction"),
            "threshold_pace_today": ctx["paces"].get("threshold"),
        },
        "weeks": weeks,
        "phases": phases,
        "days": [{k2: d.get(k2) for k2 in ("day", "week", "phase", "session", "planned_km", "planned_min", "km_est",
                                           "target_pace_s_per_km", "target_hr", "notes")} for d in days],
        "fitness": [{"day": t, "ctl": c, "atl": a, "load": ld} for t, c, a, ld in fitness],
    })
    return out


def best_realistic(ctx: dict[str, Any], opts: PlanOptions) -> tuple[PlanOptions, float | None]:
    """The fastest plan with every control in the evidence's safe (green) zone and race-morning
    freshness in the band, runs per week kept. When no plan lands in the band, the fastest one."""
    lim = distance_limits(ctx["race"]["distance_km"])
    best, best_t, fallback, fallback_t = opts, math.inf, opts, math.inf
    # defaults first, so that among equal plans the default settings are kept
    tapers = [lim["taper_default"]] + [x for x in lim["taper"] if x != lim["taper_default"]]
    for front in (False, True):
     for ramp in (10, 8, 6):
        for long in sorted({lim["long_max"] - 6, lim["long_max"] - 3, lim["long_max"]}, reverse=True):
            for q in sorted({min(2, opts.runs_per_week - 1), min(1, opts.runs_per_week - 1)}, reverse=True):
                for taper in tapers:
                    o = replace(opts, ramp_pct=float(ramp), long_max_km=float(long), quality=q, taper_weeks=taper,
                                front_loaded=front)
                    r = compute(ctx, o, full=False)
                    t = r["predicted_time_s"] or math.inf
                    if r["tsb_in_band"] and t < best_t - 1:
                        best, best_t = o, t
                    if t < fallback_t - 1:
                        fallback, fallback_t = o, t
    if best_t == math.inf:
        best, best_t = fallback, fallback_t
    return best, (best_t if best_t < math.inf else None)


def least_effort(ctx: dict[str, Any], opts: PlanOptions, goal: float) -> tuple[PlanOptions, dict[str, Any]] | None:
    """The plan that reaches the goal with the least effort: either build-up, every control in its safe (green) zone,
    race morning fresh, the runner's runs per week kept. Effort = total running km over the plan;
    ties go to fewer quality sessions, then a lower biggest week. For each combination of weekly
    increase, longest long run, quality and taper, the smallest biggest week that still reaches the
    goal is found by bisection (more volume is faster). None when no safe plan reaches the goal."""
    lim = distance_limits(ctx["race"]["distance_km"])
    peak_hi = float(ctx["habits"].get("peak_default") or lim["peak_cap"])
    peak_lo = float(max(15, math.floor(ctx["vol0"])))
    tapers = [lim["taper_default"]] + [x for x in lim["taper"] if x != lim["taper_default"]]
    longs = sorted({lim["long_max"] - 6, lim["long_max"] - 4, lim["long_max"] - 2, lim["long_max"]})
    qs = sorted({min(1, opts.runs_per_week - 1), min(2, opts.runs_per_week - 1)})

    def ok(o: PlanOptions) -> dict[str, Any] | None:
        r = compute(ctx, o, full=False)
        return r if r["predicted_time_s"] and r["predicted_time_s"] <= goal and r["tsb_in_band"] else None

    best: tuple[tuple[float, int, float], PlanOptions, dict[str, Any]] | None = None
    for front in (False, True):
     for ramp in (6.0, 8.0, 10.0):
        for long in longs:
            for q in qs:
                for taper in tapers:
                    o = replace(opts, ramp_pct=ramp, long_max_km=float(long), quality=q, taper_weeks=taper, peak_km=peak_hi,
                                front_loaded=front)
                    if not ok(o):
                        continue
                    lo, hi = peak_lo, peak_hi
                    if ok(replace(o, peak_km=lo)):
                        hi = lo
                    while hi - lo > 1:
                        mid = math.floor((lo + hi) / 2)
                        if ok(replace(o, peak_km=float(mid))):
                            hi = mid
                        else:
                            lo = mid
                    o = replace(o, peak_km=float(hi))
                    r = ok(o)
                    if not r:
                        continue
                    key = (round(r["total_km"]), q, hi)
                    if best is None or key < best[0]:
                        best = (key, o, r)
    return (best[1], best[2]) if best else None


_FRONTIER_CACHE: dict[tuple, list[dict[str, Any]]] = {}


def effort_frontier_cached(ctx: dict[str, Any], opts: PlanOptions, goal: float | None,
                           recommended: PlanOptions | None) -> list[dict[str, Any]]:
    """The frontier changes only with the race, the runner's runs per week and the data, not with
    the other controls: cache it per (race, runs per week, today, current load, goal, recommended)."""
    key = (ctx["race"]["race_id"], opts.runs_per_week, opts.tune_up, opts.front_loaded, ctx["today"], round(ctx["vol0"], 3), round(ctx["long0"], 3),
           ctx["done_this_week"], goal, recommended and tuple(sorted(asdict(recommended).items())),
           ctx["day"].get("vo2_effective"), ctx["fc"].get("calibration"))
    if key not in _FRONTIER_CACHE:
        if len(_FRONTIER_CACHE) > 32:
            _FRONTIER_CACHE.clear()
        _FRONTIER_CACHE[key] = effort_frontier(ctx, opts, goal, recommended)
    return _FRONTIER_CACHE[key]


def effort_frontier(ctx: dict[str, Any], opts: PlanOptions, goal: float | None,
                    recommended: PlanOptions | None) -> list[dict[str, Any]]:
    """The effort slider: for each amount of running (total km over the plan), the fastest safe plan.
    Candidates: every control in its safe zone, race morning fresh, the runner's runs per week and
    build-up kept;
    the biggest week from the current load to its safe maximum in 1 km steps. Pareto front on
    (total km, predicted time), at most 80 positions; the recommended plan is kept."""
    lim = distance_limits(ctx["race"]["distance_km"])
    peak_hi = float(ctx["habits"].get("peak_default") or lim["peak_cap"])
    peak_lo = float(max(15, math.floor(ctx["vol0"])))
    longs = sorted({lim["long_max"] - 6, lim["long_max"] - 4, lim["long_max"] - 2, lim["long_max"]})
    qs = sorted({min(1, opts.runs_per_week - 1), min(2, opts.runs_per_week - 1)})
    pts = []
    peaks = sorted({*[peak_lo + i for i in range(int(peak_hi - peak_lo) + 1)], peak_hi})
    # the runner's build-up is kept, like their runs per week: the slider moves the other settings
    for front in (opts.front_loaded,):
     for ramp in (6.0, 8.0, 10.0):
        for long in longs:
            for q in qs:
                for taper in lim["taper"]:
                    for peak in peaks:
                        o = replace(opts, ramp_pct=ramp, long_max_km=float(long), quality=q, taper_weeks=taper,
                                    peak_km=float(peak), front_loaded=front)
                        r = compute(ctx, o, full=False)
                        if r["predicted_time_s"] and r["tsb_in_band"]:
                            pts.append((r["total_km"], r["predicted_time_s"], o, r))
    pts.sort(key=lambda p: (p[0], p[1]))
    front, best = [], math.inf
    for km_, t_, o, r in pts:
        if t_ < best - 5:
            front.append((km_, t_, o, r))
            best = t_
    # the recommended plan sits on the slider: as an equal point already there, or added
    if recommended is not None and recommended.front_loaded != opts.front_loaded:
        recommended = None      # the recommendation uses the other build-up: not on this slider
    if recommended is not None:
        r = compute(ctx, recommended, full=False)
        rk, rt = r["total_km"], r["predicted_time_s"]
        same = next((i for i, p in enumerate(front) if abs(p[0] - rk) < 1 and abs(p[1] - rt) < 15), None)
        if same is not None:
            front[same] = (rk, rt, recommended, r)
        elif rt:
            front = sorted(front + [(rk, rt, recommended, r)], key=lambda p: (p[0], p[1]))
    if len(front) > 80:   # thin evenly by km, keeping the ends and the recommended plan
        lo_km, hi_km = front[0][0], front[-1][0]
        keep = {0, len(front) - 1} | {i for i, p in enumerate(front) if recommended is not None and p[2] == recommended}
        for k in range(1, 79):
            target = lo_km + (hi_km - lo_km) * k / 79
            keep.add(min(range(len(front)), key=lambda i: abs(front[i][0] - target)))
        front = [front[i] for i in sorted(keep)]
    return [{"options": asdict(o), "total_km": km_, "time_s": t_, "peak_week_km": r["peak_week_km"],
             "long_run_km": r["long_run_km"], "shape": r["shape_race"], "vo2": r["vo2_race"],
             "reaches": bool(goal and t_ <= goal), "recommended": recommended is not None and o == recommended}
            for km_, t_, o, r in front]


def _zones(ctx: dict[str, Any], opts: PlanOptions, target: float | None) -> list[dict[str, Any]]:
    out = []
    for c in control_space(ctx["race"]["distance_km"], ctx["habits"]):
        cur = getattr(opts, c["key"])
        cast = type(cur)
        vals = sorted(set(c["values"]) | {cur})
        pts = []
        for v in vals:
            r = compute(ctx, replace(opts, **{c["key"]: cast(v)}), full=False)
            # a value that leaves race morning short of (or past) the freshness band is a caution too
            zone = "red" if c["red"](v) else "amber" if c["amber"](v) or not r["tsb_in_band"] else "green"
            pts.append({"value": v, "time_s": r["predicted_time_s"], "shape": r["shape_race"], "vo2": r["vo2_race"],
                        "zone": zone, "fresh": r["tsb_in_band"],
                        "reaches": bool(target and r["predicted_time_s"] and r["predicted_time_s"] <= target + 30)})
        i = next(n for n, p in enumerate(pts) if p["value"] == cur)
        nxt = pts[i + 1] if i + 1 < len(pts) else None
        prv = pts[i - 1] if i > 0 else None
        reach = [p["value"] for p in pts if p["reaches"]]
        # from this value on, more changes the time by less than 30 s
        flat = next((p["value"] for n, p in enumerate(pts[:-1])
                     if all(abs((q["time_s"] or 0) - (p["time_s"] or 0)) < 30 for q in pts[n + 1:])), None)
        out.append({
            "key": c["key"], "label": c["label"], "unit": c["unit"], "value": cur, "life": c.get("life", False),
            "points": pts, "risk_note": c["risk"],
            "step_up_s": (nxt["time_s"] - pts[i]["time_s"]) if nxt and nxt["time_s"] and pts[i]["time_s"] else None,
            "step_down_s": (prv["time_s"] - pts[i]["time_s"]) if prv and prv["time_s"] and pts[i]["time_s"] else None,
            "reaches_from": min(reach) if reach and len(reach) < len(pts) else None,
            "reaches_all": len(reach) == len(pts),
            "flat_from": flat,
        })
    return out


def _checks(ctx: dict[str, Any], opts: PlanOptions, r: dict[str, Any]) -> list[dict[str, str]]:
    lim = distance_limits(ctx["race"]["distance_km"])
    res, out = r["result"], []
    if opts.ramp_pct > 20:
        out.append({"level": "bad", "text": f"Weekly increase {opts.ramp_pct:.0f} %: over 20 % a week raised injuries in the next 3 weeks (Damsted 2019)"})
    elif opts.ramp_pct > 10:
        out.append({"level": "warn", "text": f"Weekly increase {opts.ramp_pct:.0f} %: above the usual 10 % caution"})
    if opts.taper_weeks not in lim["taper"]:
        out.append({"level": "warn", "text": f"A {opts.taper_weeks}-week taper: the evidence favours {'–'.join(map(str, lim['taper']))} weeks"})
    big = ctx["habits"].get("biggest_week")
    peak_run = max((w["km"] for w in r["weeks"]), default=0)
    if big and peak_run > 1.25 * big + 0.5:
        out.append({"level": "warn", "text": f"Biggest week {peak_run:.0f} km: well beyond your biggest of the last year ({big:.0f} km)"})
    # weeks that hold fewer runs than asked: the current week, the tune-up and race weeks are expected
    short = [w["week"] for w in r["weeks"]
             if w["runs"] < opts.runs_per_week and w["phase"] != "race week" and not w["race_km"]
             and not (w["week"] == 1 and ctx.get("partial_first"))]
    if short:
        out.append({"level": "info", "text": f"{', '.join(f'W{n}' for n in short)} hold fewer than {opts.runs_per_week} runs: "
                    "the long run and quality sessions leave under 2 km per extra easy run"})
    if opts.runs_per_week >= 7:
        out.append({"level": "warn", "text": "7 runs a week leaves no rest day"})
    if res["tsb_share"] is not None and not res["tsb_in_band"]:
        lo = res["tsb_share"] < res["tsb_band"][0]
        out.append({"level": "warn" if lo else "info",
                    "text": f"Race-morning freshness {res['tsb_share'] * 100:.0f} % of fitness, "
                            f"{'below' if lo else 'above'} the 10–30 % band" + (" (costs ~2 %): a longer taper fixes it" if lo else "")})
    if peak_run < opts.peak_km - 1 and r["weeks"] and r["weeks"][0]["phase"] != "race week":
        out.append({"level": "info", "text": f"The biggest week of {opts.peak_km:.0f} km is not reached: rising {opts.ramp_pct:.0f} % a week, the plan tops out at {peak_run:.0f} km"})
    if res["decoupling_pct"] and res["decoupling_pct"] > 5:
        out.append({"level": "info", "text": f"Durability: {res['decoupling_pct']:.1f} % heart-rate drift on long runs (target ≤ 5 %); the weekly long runs train it"})
    if res["lt_fraction"] and res["lt_fraction"] < 0.8 and opts.quality == 0:
        out.append({"level": "info", "text": f"Threshold at {res['lt_fraction'] * 100:.0f} % of VO2max speed: a quality session a week would train it"})
    return out


def _target(ctx: dict[str, Any], best: dict[str, Any], best_t: float | None) -> dict[str, Any]:
    goal = ctx["race"]["goal_time_s"]
    km = ctx["race"]["distance_km"]
    res = best["result"]
    now = ctx["fc"].get("predicted_time_s")
    out = {"goal_time_s": goal, "best_time_s": best_t, "best_options": best["options"],
           "best_shape": res["shape_race"], "best_vo2": res["vo2_race"],
           "best_total_km": best["total_km"],   # the same measure as the effort slider (tune-up race included)
           "best_peak_km": max((w["km"] for w in best["weeks"]), default=None),
           "now_time_s": now, "now_has_plan": ctx["fc"].get("has_plan"),
           # the saved plan (or, without one, today) is about as fast as the best safe plan
           "now_is_best": bool(now and best_t and abs(now - best_t) <= 60),
           # the saved plan forecasts clearly faster than any plan inside the safety rules: it builds
           # up faster than they allow (e.g. made with an earlier plan builder)
           "saved_faster_than_safe": bool(now and best_t and ctx["fc"].get("has_plan") and now < best_t - 60),
           # so close to the race that no plan moves the time much
           "little_time": (ctx["race"]["race_date"] - ctx["today"]).days < 35}
    if not goal or not best_t:
        out.update({"reachable": None, "target_time_s": best_t})
        return out
    out["reachable"] = best_t <= goal + 30
    out["target_time_s"] = goal if out["reachable"] else best_t
    # What the goal would need: VO2max at the best plan's shape, or shape at its VO2max.
    g = goal / res["k"] / 60
    vdot = daniels_demand(km * 1000 / g) / daniels_fraction(g)
    out["goal_vdot_full_shape"] = vdot
    out["goal_vo2_at_best_shape"] = vdot / res["shape_factor"]
    f = vdot / res["vo2_race"] if res["vo2_race"] else None
    out["goal_shape_at_best_vo2"] = (km ** 1.23 - (1 - (f - 0.6) / 0.4) * 100) if f and 0.6 <= f <= 1 else None
    out["goal_needs_more_than_full_shape"] = bool(f and f > 1)
    return out


def preview(body: dict[str, Any]) -> dict[str, Any]:
    race_id = _int(body.get("race_id"), "race_id")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        ctx = load(conn, race_id)
    km = ctx["race"]["distance_km"]
    raw = body.get("options") if isinstance(body.get("options"), dict) else None
    habits_opts = plan_options({"runs_per_week": (raw or {}).get("runs_per_week")}, km, ctx["habits"])
    fast_opts, fast_t = best_realistic(ctx, habits_opts)
    goal = ctx["race"]["goal_time_s"]
    # The recommended plan: the least effort that reaches the goal; when no safe plan reaches it,
    # the fastest safe plan.
    easy = least_effort(ctx, fast_opts, goal) if goal and fast_t and fast_t <= goal else None
    best_opts = easy[0] if easy else fast_opts
    best_full = compute(ctx, best_opts)
    target = _target(ctx, best_full, best_full["result"]["predicted_time_s"])
    target["fastest_time_s"] = fast_t
    target["fastest_total_km"] = compute(ctx, fast_opts, full=False)["total_km"]
    target["least_effort"] = bool(easy)
    if easy:
        target["reachable"] = True
        target["target_time_s"] = goal
    opts = plan_options(raw, km, ctx["habits"]) if raw else best_opts
    # goal-pace sessions aim at the working target
    opts = replace(opts, target_time_s=target["target_time_s"])
    r = compute(ctx, opts)
    r.update({
        "race": {"race_id": race_id, "name": ctx["race"]["name"], "race_date": ctx["race"]["race_date"],
                 "distance_km": km, "goal_time_s": ctx["race"]["goal_time_s"]},
        "weeks_to_race": (ctx["race"]["race_date"] - ctx["today"]).days / 7,
        "habits": ctx["habits"],
        "target": target,
        "controls": _zones(ctx, opts, target["target_time_s"]),
        "effort": effort_frontier_cached(ctx, replace(opts, target_time_s=None), goal, replace(best_opts, target_time_s=None)),
        # the other build-up's front, so the slider can use one km scale for both
        "effort_other": [{"total_km": p["total_km"], "time_s": p["time_s"]} for p in effort_frontier_cached(
            ctx, replace(opts, target_time_s=None, front_loaded=not opts.front_loaded), goal,
            replace(best_opts, target_time_s=None))],
        "total_km": r.get("total_km"),
        "peak_week_km": r.get("peak_week_km"),
        "long_run_km": r.get("long_run_km"),
        "checks": _checks(ctx, opts, r),
    })
    return r


def _weeks_summary(days: list[dict[str, Any]], done_first: float = 0.0) -> list[dict[str, Any]]:
    """Per plan week. The first week, when it is the current one, adds what was already run."""
    by = defaultdict(list)
    for d in days:
        by[d["week"]].append(d)
    out = []
    prev_km = None
    for n in sorted(by):
        ds = by[n]
        done = done_first if n == 1 else 0.0
        run_km = sum(d["km_est"] or 0 for d in ds if d["session"] in RUN_SESSIONS) + done
        longs = [d["km_est"] or 0 for d in ds if d["session"] == "long"]
        first = min(d["day"] for d in ds)
        out.append({
            "week": n, "week_start": first - dt.timedelta(days=first.weekday()),
            "phase": ds[0]["phase"], "km": run_km, "done_km": done or None, "long_km": max(longs) if longs else None,
            "runs": sum(1 for d in ds if d["session"] in RUN_SESSIONS or d["session"] == "race"),
            "quality": sum(1 for d in ds if d["session"] in ("threshold", "intervals")),
            "race_km": sum(d["km_est"] or 0 for d in ds if d["session"] == "race"),
            "load": sum(d["load"] for d in ds),
            "ramp_pct": (run_km / prev_km - 1) * 100 if prev_km else None,
        })
        prev_km = run_km
    return out


def _phases(weeks: list[dict[str, Any]], days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Consecutive weeks grouped into phases; a recovery week belongs to the phase it sits in. Each
    phase carries example sessions (from its first week) and its km and long-run ranges."""
    blocks: list[dict[str, Any]] = []
    for w in weeks:
        phase = w["phase"]
        family = blocks[-1]["phase"] if phase == "recovery" and blocks else phase
        if not blocks or blocks[-1]["phase"] != family:
            title, what, purpose = FOCUS.get(family, (family.title(), "", ""))
            blocks.append({"phase": family, "title": title, "what": what, "purpose": purpose, "weeks": [], "recovery_weeks": []})
        b = blocks[-1]
        b["weeks"].append(w)
        if phase == "recovery":
            b["recovery_weeks"].append(w["week"])
    out = []
    for b in blocks:
        ws = [w for w in b["weeks"] if w["phase"] != "recovery"] or b["weeks"]
        longs = [w["long_km"] for w in ws if w["long_km"]]
        # example sessions from the phase's fullest week (the current week may be mostly past)
        key = lambda n: sum(1 for d in days if d["week"] == n and d["session"] in ("threshold", "intervals", "long"))  # noqa: E731
        first = max((w["week"] for w in ws), key=lambda n: (key(n), -n))
        sessions = [d for d in days if d["week"] == first and d["session"] in ("threshold", "intervals", "long") and d.get("notes")]
        easy = [d for d in days if d["week"] == first and d["session"] == "easy"]
        out.append({
            "phase": b["phase"], "title": b["title"], "what": b["what"], "purpose": b["purpose"],
            "from_week": b["weeks"][0]["week"], "to_week": b["weeks"][-1]["week"],
            "start": b["weeks"][0]["week_start"], "end": b["weeks"][-1]["week_start"] + dt.timedelta(days=6),
            "km_from": ws[0]["km"], "km_to": ws[-1]["km"],
            "long_from": longs[0] if longs else None, "long_to": longs[-1] if longs else None,
            "runs": ws[0]["runs"], "quality_per_week": max(w["quality"] for w in ws),
            "recovery_weeks": b["recovery_weeks"],
            "sessions": [{"session": d["session"], "notes": d["notes"]} for d in sessions],
            "easy_runs": len(easy), "easy_km": sum(d["km_est"] or 0 for d in easy),
        })
    return out
