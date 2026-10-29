"""The Race Planner in SQL (db/views.d/60_scenario.sql) must give the plan and the race time the
Python reference gives (garmin_sync/planner.py, garmin_sync/scenario.py), on the same synthetic
runners as the property tests. The SQL functions are pure: they take the runner as JSON, so this
reads nothing from the database and writes nothing.

Runs against any database where the views are installed (DATABASE_URL, or RAN_SCENARIO_DB); skipped
when there is none.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from dataclasses import replace

import pytest

from conftest import all_cases, make_ctx
from garmin_sync.planner import plan_options, tune_up_possible
from garmin_sync.scenario import _zones, best_realistic, compute, least_effort

psycopg = pytest.importorskip("psycopg")


def _url() -> str | None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    return os.getenv("RAN_SCENARIO_DB") or os.getenv("DATABASE_URL")


@pytest.fixture(scope="module")
def db():
    url = _url()
    if not url:
        pytest.skip("no database to run the SQL planner on")
    try:
        conn = psycopg.connect(url, autocommit=True)
    except psycopg.OperationalError as e:
        pytest.skip(f"database unavailable: {e}")
    if not conn.execute("select to_regproc('garmin.scn_compute') is not null").fetchone()[0]:
        pytest.skip("garmin.scn_compute is not installed (apply db/views.d/60_scenario.sql)")
    yield conn
    conn.close()


def ctx_json(ctx: dict) -> str:
    """The Python context in the shape garmin.scn_ctx_json reads."""
    today, race, day, h = ctx["today"], ctx["race"], ctx["day"], ctx["habits"]
    kinds = sorted(ctx["profile"])
    fit = ctx["fit"].get("vo2_per_ctl")
    return json.dumps({
        "today": today, "start": ctx["start"], "n": ctx["n"], "vol0": ctx["vol0"], "long0": ctx["long0"],
        "partial": ctx["partial_first"], "done_week": ctx["done_this_week"],
        "race_id": race["race_id"], "race_name": race["name"], "race_date": race["race_date"], "km": race["distance_km"],
        "goal_s": race["goal_time_s"], "easy_pace": ctx["paces"]["easy"], "thr_pace": ctx["paces"]["threshold"],
        "h_runs": h["runs_per_week"], "h_biggest": h["biggest_week"], "h_peak_default": h["peak_default"],
        "h_start_km": h["start_km"], "h_last_week": h["last_week_km"], "h_weeks": h["weeks"],
        "vo2_today": day["vo2_effective"], "vo2_garmin": day["vo2max_garmin"], "atl": day["atl"], "ctl": day["ctl"],
        "shape_today": day["marathon_shape"], "lt_fraction": day["lt_fraction"],
        "ctl_hist": [ctx["ctl_hist"].get(today - dt.timedelta(days=40 - i)) for i in range(41)],
        "prof_kind": kinds, "prof_pace": [ctx["profile"][k]["pace_s_per_km"] for k in kinds],
        "prof_lpm": [ctx["profile"][k]["load_per_min"] for k in kinds],
        "run_dates": [t for t, _ in ctx["runs"]], "run_kms": [k for _, k in ctx["runs"]],
        "fc_pred": ctx["fc"]["predicted_time_s"], "fc_heat": ctx["fc"]["heat_adj_pct"], "fc_cal": ctx["fc"]["calibration"],
        "fc_band": ctx["fc"]["band_pct"], "fc_race_wbgt": ctx["fc"]["race_wbgt_c"], "fc_train_wbgt": ctx["fc"]["training_wbgt_c"],
        "fc_has_plan": ctx["fc"]["has_plan"],
        "atl_days": ctx["param"]["atl_days"], "ctl_days": ctx["param"]["ctl_days"], "band_lo": ctx["param"]["tsb_band_low"],
        "band_hi": ctx["param"]["tsb_band_high"], "taper_gain": ctx["param"]["taper_gain_pct"],
        "fit_b": fit["value"] if fit else None, "fit_lo": fit["ci_low"] if fit else None, "fit_hi": fit["ci_high"] if fit else None,
        "has_fit": bool(fit), "decoupling": ctx["decoupling"],
    }, default=str)


SQL_OPTS = """garmin.scn_options(garmin.scn_ctx_json(%(ctx)s::jsonb), %(runs)s, %(peak)s, %(quality)s, %(long_max)s, %(ramp)s,
                                  %(taper)s, %(front)s, %(tune)s, %(start_km)s, %(target)s)"""


def sql_args(ctx, o) -> dict:
    return {"ctx": ctx_json(ctx), "runs": o.runs_per_week, "peak": o.peak_km, "quality": o.quality, "long_max": o.long_max_km,
            "ramp": o.ramp_pct, "taper": o.taper_weeks, "front": o.front_loaded, "tune": o.tune_up, "start_km": o.start_km,
            "target": o.target_time_s}


def sql_compute(db, ctx, o) -> dict:
    return db.execute(f"select garmin.scn_compute(garmin.scn_ctx_json(%(ctx)s::jsonb), {SQL_OPTS}, true)",
                      sql_args(ctx, o)).fetchone()[0]


def variants(ctx):
    base = plan_options(None, ctx["race"]["distance_km"], ctx["habits"])
    return {
        "default": base,
        "front-loaded": replace(base, front_loaded=True),
        "slow ramp, short long runs": replace(base, ramp_pct=6.0, long_max_km=base.long_max_km - 6),
        "3 runs, no quality": replace(base, runs_per_week=3, quality=0),
        "7 runs, big peak": replace(base, runs_per_week=7, peak_km=base.peak_km + 15),
        # the app offers a tune-up race only where it fits (plan_options drops it elsewhere)
        **({"tune-up": replace(base, tune_up=True)} if tune_up_possible(ctx["race"]["distance_km"], ctx["habits"]["weeks"]) else {}),
        "short taper, goal pace": replace(base, taper_weeks=1, target_time_s=3.5 * 3600),
    }


@pytest.mark.parametrize("weeks,km", all_cases())
def test_plan_and_forecast_match(db, weeks, km):
    """Every week's km within 0.1 km, the same sessions on the same days, the race time within 1 %."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    for name, o in variants(ctx).items():
        py, sq = compute(ctx, o), sql_compute(db, ctx, o)
        assert [w["phase"] for w in py["weeks"]] == [w["phase"] for w in sq["weeks"]], name
        for a, b in zip(py["weeks"], sq["weeks"], strict=True):
            assert abs(a["km"] - b["km"]) <= 0.1 + 1e-9, f"{name}: week {a['week']} {a['km']:.1f} vs {b['km']:.1f} km"
        assert [(str(d["day"]), d["session"]) for d in py["days"]] == [(d["day"], d["session"]) for d in sq["days"]], name
        notes = sum(1 for a, b in zip(py["days"], sq["days"]) if (a["notes"] or "") != (b["notes"] or ""))
        assert notes == 0, f"{name}: {notes} day notes differ"
        p, s = py["predicted_time_s"], sq["predicted_time_s"]
        assert (p is None) == (s is None), name
        if p:
            assert abs(s / p - 1) <= 0.01, f"{name}: race time {p:.0f} vs {s:.0f} s"
        for a, b in zip(py["phases"], sq["phases"], strict=True):
            assert a["phase"] == b["phase"] and a["from_week"] == b["from_week"], name
            ea, eb = a["expected"]["race_time_s"], b["expected"]["race_time_s"]
            if ea:
                assert abs(eb / ea - 1) <= 0.01, f"{name}: after {a['phase']} {ea:.0f} vs {eb:.0f} s"


@pytest.mark.parametrize("weeks,km", [(10, 42.195), (18, 42.195), (14, 21.0975)])
def test_recommended_plan_matches(db, weeks, km):
    """The recommended plan (best_realistic, then least_effort when the goal is in reach)."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    habits = plan_options(None, km, ctx["habits"])
    fast, fast_t = best_realistic(ctx, habits)
    goal = ctx["race"]["goal_time_s"]
    easy = least_effort(ctx, fast, goal) if goal and fast_t and fast_t <= goal else None
    best = easy[0] if easy else fast
    sq = db.execute("select garmin.scn_best(garmin.scn_ctx_json(%s::jsonb), %s)", (ctx_json(ctx), habits.runs_per_week)).fetchone()[0]
    for k in ("peak_km", "quality", "long_max_km", "ramp_pct", "taper_weeks", "front_loaded"):
        assert float(getattr(best, k)) == float(sq["best_options"][k]), k
    assert abs(sq["fastest_time_s"] / fast_t - 1) <= 0.01


@pytest.mark.parametrize("weeks,km", [(10, 42.195), (14, 21.0975)])
def test_slider_sweeps_match(db, weeks, km):
    """Each setting's race time at each value, and its zone."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    o = plan_options(None, km, ctx["habits"])
    py = {(c["key"], float(p["value"])): p for c in _zones(ctx, o, 4 * 3600) for p in c["points"]}
    rows = db.execute(f"select key, value, time_s, zone from garmin.scn_sweep(garmin.scn_ctx_json(%(ctx)s::jsonb), {SQL_OPTS}, %(goal)s)",
                      {**sql_args(ctx, o), "goal": 4 * 3600}).fetchall()
    assert {(k, float(v)) for k, v, _, _ in rows} == set(py)
    for k, v, t, z in rows:
        p = py[(k, float(v))]
        assert z == p["zone"], (k, v)
        if p["time_s"]:
            assert abs(t / p["time_s"] - 1) <= 0.01, (k, v)
