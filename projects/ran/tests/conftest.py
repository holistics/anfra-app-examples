"""A synthetic runner for the planner's property tests: the same context the sync server builds from
the database (planner.plan_context + scenario.load), made from a few numbers, so the tests run
without a database and the same everywhere."""

from __future__ import annotations

import datetime as dt
import math
from typing import Any

import pytest

from garmin_sync.planner import PEAK_OF_BIGGEST, distance_limits
from garmin_sync.scenario import marathon_shape

TODAY = dt.date(2026, 10, 15)  # a Thursday: the plan starts mid-week

PROFILE = {
    # kind: pace (s/km), load per minute (TRIMP units)
    "easy": (400, 1.0), "long": (410, 1.1), "threshold": (300, 1.8), "intervals": (280, 2.2),
    "race": (320, 2.0), "strength": (None, 0.5), "rest": (None, 0.0),
}


def history(today: dt.date, vol: float, longest: float, runs_per_week: int, weeks: int = 30) -> list[tuple[dt.date, float]]:
    """Steady past training: one long run on Sundays, the rest of the week's km spread evenly."""
    out = []
    monday = today - dt.timedelta(days=today.weekday())
    for w in range(1, weeks + 1):
        start = monday - dt.timedelta(weeks=w)
        out.append((start + dt.timedelta(days=6), longest))
        easy = (vol - longest) / max(runs_per_week - 1, 1)
        for d in range(runs_per_week - 1):
            out.append((start + dt.timedelta(days=d), easy))
    return out


def make_ctx(weeks: int = 14, distance_km: float = 42.195, vol0: float = 48.0, long0: float = 21.0,
             runs_per_week: int = 6, vo2: float = 41.2, ctl: float = 46.0, biggest_week: float = 60.0,
             goal_time_s: float | None = 4 * 3600, heat_adj_pct: float = -1.0, done_this_week: float = 13.0,
             today: dt.date = TODAY) -> dict[str, Any]:
    """weeks = plan weeks including the current one and race week."""
    lim = distance_limits(distance_km)
    partial = today.weekday() < 6
    this_monday = today - dt.timedelta(days=today.weekday())
    start = this_monday if partial else this_monday + dt.timedelta(days=7)
    race_date = start + dt.timedelta(weeks=weeks - 1, days=6)
    runs = history(today, vol0, long0, runs_per_week)
    habits = {
        "runs_per_week": runs_per_week, "biggest_week": biggest_week,
        "peak_default": float(min(lim["peak_cap"], max(5 * round(PEAK_OF_BIGGEST * biggest_week / 5), 5 * round(vol0 / 5)))),
        "recent_weeks": [], "start_km": vol0, "last_week_km": vol0, "longest_4w": long0,
        "done_this_week": done_this_week if partial else 0.0, "weeks": weeks,
    }
    return {
        "today": today, "start": start, "n": weeks, "vol0": vol0, "long0": long0,
        "partial_first": partial, "done_this_week": done_this_week if partial else 0.0, "habits": habits,
        "race": {"race_id": 1, "name": "Test race", "race_date": race_date, "distance_km": distance_km,
                 "goal_time_s": goal_time_s},
        "paces": {"easy": 400.0, "threshold": 300.0},
        "day": {"vo2_effective": vo2, "vo2max_garmin": vo2 + 8, "atl": ctl, "ctl": ctl,
                "marathon_shape": marathon_shape(runs, today, vo2), "lt_fraction": 0.79},
        "ctl_hist": {today - dt.timedelta(days=i): ctl for i in range(41)},
        "profile": {k: {"kind": k, "pace_s_per_km": p, "load_per_min": l} for k, (p, l) in PROFILE.items()},
        "runs": runs,
        "fc": {"predicted_time_s": None, "heat_adj_pct": heat_adj_pct, "calibration": 1.079, "band_pct": 4.0,
               "race_wbgt_c": 25.0, "training_wbgt_c": 27.0, "has_plan": False, "shape_race": None},
        "param": {"atl_days": 7.0, "ctl_days": 42.0, "tsb_band_low": 0.10, "tsb_band_high": 0.30, "taper_gain_pct": 2.0},
        "fit": {"vo2_per_ctl": {"value": 0.110, "ci_low": 0.032, "ci_high": 0.189, "n": 148}},
        "decoupling": 5.2,
    }


def today_time(ctx: dict[str, Any]) -> float:
    """'If the race were today': today's VO2max and marathon shape, same conditions, no plan."""
    from garmin_sync.model import daniels_time_s, shape_factor
    km = ctx["race"]["distance_km"]
    vo2 = ctx["day"]["vo2_effective"]
    k = ctx["fc"]["calibration"] * (1 + ctx["fc"]["heat_adj_pct"] / 100)
    return daniels_time_s(vo2 * shape_factor(ctx["day"]["marathon_shape"], km), km) * k


@pytest.fixture
def ctx_factory():
    return make_ctx


HORIZONS = [3, 6, 10, 14, 18, 24]          # plan weeks, current week and race week included
DISTANCES = [21.0975, 42.195]


def all_cases():
    return [(w, d) for w in HORIZONS for d in DISTANCES]


def approx_le(a: float, b: float, tol: float = 30.0) -> bool:
    """a <= b, within tol seconds (the forecast moves in seconds; noise below 30 s is not a finding)."""
    return a <= b + tol and not math.isnan(a)
