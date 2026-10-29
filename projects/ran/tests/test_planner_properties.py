"""Properties the Race Planner must hold for any runner and any time to the race.

Each test states one rule from the product's model (docs/prd.en.md, docs/research.en.md) and checks
it across horizons (3 to 24 plan weeks) and distances (half marathon, marathon) on synthetic runners.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import replace

import pytest

from conftest import HORIZONS, all_cases, approx_le, make_ctx, today_time
from garmin_sync.planner import (EASY_MIN_KM, EASY_OF_LONG, EASY_SHORT_KM, LONG_SHARE, LONG_SPIKE, TUNE_UP_WEEKS_BEFORE,
                                 _phases, _weeks, distance_limits, plan_days, plan_options)
from garmin_sync.scenario import best_realistic, compute, effort_frontier, least_effort

RUN = {"easy", "long", "threshold", "intervals"}


def default_opts(ctx, **kw):
    return replace(plan_options(None, ctx["race"]["distance_km"], ctx["habits"]), **kw)


def forecast(ctx, opts):
    return compute(ctx, opts, full=False)["predicted_time_s"]


def fmt(s):
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{int(s % 60):02d}"


# ------------------------------------------------------------------ the plan must help, never hurt

# A planned taper keeps endurance (scenario.pre_taper_shape): the formula alone would read its lighter
# weeks as lost endurance, so a short marathon plan forecast slower than racing today.


def known(weeks, km, cases, mark):
    return pytest.param(weeks, km, marks=mark) if (weeks, km) in cases else (weeks, km)


@pytest.mark.parametrize("weeks,km", all_cases())
def test_best_plan_never_slower_than_racing_today(weeks, km):
    """A plan is training on top of today: its forecast is never slower than 'if the race were today'
    in the same conditions."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    _, best = best_realistic(ctx, default_opts(ctx))
    assert approx_le(best, today_time(ctx)), f"best plan {fmt(best)} slower than today {fmt(today_time(ctx))}"


@pytest.mark.parametrize("weeks,km", all_cases())
def test_default_plan_never_slower_than_racing_today(weeks, km):
    ctx = make_ctx(weeks=weeks, distance_km=km)
    t = forecast(ctx, default_opts(ctx))
    assert approx_le(t, today_time(ctx)), f"default plan {fmt(t)} slower than today {fmt(today_time(ctx))}"


@pytest.mark.parametrize("km", [21.0975, 42.195])
def test_more_time_never_makes_the_best_plan_slower(km):
    """With the same runner and conditions, more weeks to the race never give a slower best plan."""
    times = {}
    for weeks in HORIZONS:
        ctx = make_ctx(weeks=weeks, distance_km=km)
        times[weeks] = best_realistic(ctx, default_opts(ctx))[1]
    worse = [(a, b) for a, b in zip(HORIZONS, HORIZONS[1:]) if not approx_le(times[b], times[a])]
    assert not worse, "; ".join(f"{a} wk {fmt(times[a])} → {b} wk {fmt(times[b])}" for a, b in worse)


FRESHNESS_CLIFF = pytest.mark.xfail(strict=True, reason=(
    "known: the freshness penalty is all-or-nothing (2 % below a 10 % form band), so crossing the edge "
    "makes a bigger week look slower"))


@pytest.mark.parametrize("weeks,km", [known(w, d, {(10, 21.0975)}, FRESHNESS_CLIFF) for w, d in all_cases() if w >= 6])
def test_bigger_biggest_week_never_slower(weeks, km):
    """More volume allowed (a bigger biggest week) never makes the forecast slower."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    peaks = [50, 55, 60, 65, 70, 75, 80, 90]
    times = [forecast(ctx, default_opts(ctx, peak_km=float(p))) for p in peaks]
    worse = [(peaks[i], peaks[i + 1]) for i in range(len(peaks) - 1) if not approx_le(times[i + 1], times[i])]
    assert not worse, ", ".join(f"{a}→{b} km: {fmt(times[peaks.index(a)])}→{fmt(times[peaks.index(b)])}" for a, b in worse)


@pytest.mark.parametrize("weeks,km", [(w, d) for w, d in all_cases() if w >= 6])
def test_longer_long_run_never_slower(weeks, km):
    """A longer longest long run never makes the forecast slower."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    top = distance_limits(km)["long_max"]
    longs = [top - 8, top - 6, top - 4, top - 2, top]
    times = [forecast(ctx, default_opts(ctx, long_max_km=float(x))) for x in longs]
    worse = [i for i in range(len(longs) - 1) if not approx_le(times[i + 1], times[i])]
    assert not worse, ", ".join(f"{longs[i]}→{longs[i + 1]} km: {fmt(times[i])}→{fmt(times[i + 1])}" for i in worse)


@pytest.mark.parametrize("weeks,km", [(w, d) for w, d in all_cases() if w >= 6])
def test_front_loaded_never_slower_than_gradual(weeks, km):
    """With the same settings, building up earlier (more running) never forecasts slower."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    g = forecast(ctx, default_opts(ctx, front_loaded=False))
    f = forecast(ctx, default_opts(ctx, front_loaded=True))
    assert approx_le(f, g), f"front-loaded {fmt(f)} slower than gradual {fmt(g)}"


# ------------------------------------------------------------------ safety rules hold in every plan

def plan_weeks(ctx, opts):
    days = plan_days(ctx, opts)
    by = defaultdict(list)
    for d in days:
        by[d["week"]].append(d)
    return _weeks(ctx, opts), by


@pytest.mark.parametrize("weeks,km", all_cases())
@pytest.mark.parametrize("ramp", [6.0, 10.0, 20.0])
@pytest.mark.parametrize("front", [False, True])
def test_long_run_spike_rule(weeks, km, ramp, front):
    """No long run more than 10 % longer than the longest of the previous 4 weeks (Frandsen 2025)."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    targets, by = plan_weeks(ctx, default_opts(ctx, ramp_pct=ramp, front_loaded=front))
    prev = [ctx["long0"]] * 4
    for n in sorted(by):
        longest = max((d.get("planned_km") or 0 for d in by[n] if d["session"] in ("long", "race")
                       and d["day"] < ctx["race"]["race_date"]), default=0)
        assert longest <= LONG_SPIKE * max(prev[-4:]) + 0.1, f"week {n}: {longest:.1f} km after {max(prev[-4:]):.1f}"
        prev.append(longest)


@pytest.mark.parametrize("weeks,km", all_cases())
def test_long_run_at_most_half_the_week(weeks, km):
    ctx = make_ctx(weeks=weeks, distance_km=km)
    targets, by = plan_weeks(ctx, default_opts(ctx))
    for i, w in enumerate(targets):
        if w["long"]:
            assert w["long"] <= LONG_SHARE * w["km"] + 0.1 or w["phase"] in ("taper",), f"week {i + 1}: {w}"


@pytest.mark.parametrize("weeks,km", all_cases())
@pytest.mark.parametrize("ramp", [6.0, 10.0, 15.0])
@pytest.mark.parametrize("front", [False, True])
def test_weekly_increase_and_biggest_week_limits(weeks, km, ramp, front):
    """No week rises more than the weekly-increase limit over the most of the previous 3 weeks, and
    none goes over the biggest-week setting."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    opts = default_opts(ctx, ramp_pct=ramp, front_loaded=front)
    targets = _weeks(ctx, opts)
    prev = [ctx["vol0"]] * 3
    for i, w in enumerate(targets):
        assert w["km"] <= opts.peak_km + 0.5, f"week {i + 1}: {w['km']:.1f} km over the biggest week {opts.peak_km}"
        assert w["km"] <= (1 + ramp / 100) * max(prev[-3:]) + 0.5, f"week {i + 1}: {w['km']:.1f} after {prev[-3:]}"
        prev.append(w["km"])


@pytest.mark.parametrize("weeks,km", all_cases())
@pytest.mark.parametrize("runs", [3, 4, 6])
def test_easy_runs_and_runs_per_week(weeks, km, runs):
    """Easy runs are 2 km up to 3/4 of that week's long run; runs per week never exceed the setting."""
    ctx = make_ctx(weeks=weeks, distance_km=km, runs_per_week=runs)
    opts = default_opts(ctx, runs_per_week=runs)
    _, by = plan_weeks(ctx, opts)
    for n, ds in by.items():
        long = max((d.get("planned_km") or 0 for d in ds if d["session"] == "long"), default=0)
        for d in ds:
            if d["session"] == "easy":
                assert d["planned_km"] >= EASY_MIN_KM - 0.05, f"week {n}: {d['planned_km']} km easy run"
                assert d["planned_km"] <= max(EASY_OF_LONG * long, EASY_SHORT_KM) + 0.05 or not long, f"week {n}: easy {d['planned_km']} vs long {long}"
        n_runs = sum(1 for d in ds if d["session"] in RUN | {"race"})
        assert n_runs <= runs, f"week {n}: {n_runs} runs > {runs}"


@pytest.mark.parametrize("weeks,km", all_cases())
@pytest.mark.parametrize("runs", [4, 5, 6])
def test_runs_per_week_kept_when_the_week_holds_them(weeks, km, runs):
    """Every week has the runs asked for (2 quality sessions, the long run, the rest easy), unless what
    the key sessions leave is under 2 km per easy run."""
    ctx = make_ctx(weeks=weeks, distance_km=km, runs_per_week=runs)
    opts = default_opts(ctx, runs_per_week=runs)
    targets, by = plan_weeks(ctx, opts)
    for i, w in enumerate(targets):
        n = i + 1
        if w["phase"] == "race week" or w.get("tune_up") or (n == 1 and ctx["partial_first"]) or not w["long"]:
            continue
        n_quality = min(opts.quality, runs - 1, 1 if w["phase"] == "recovery" else 2)
        key = sum(d.get("planned_km") or 0 for d in by[n] if d["session"] in ("long", "threshold", "intervals"))
        fits = w["km"] - key >= (runs - 1 - n_quality) * EASY_MIN_KM + 0.1
        got = sum(1 for d in by[n] if d["session"] in RUN)
        if fits:
            assert got == runs, f"week {n} ({w['phase']}, {w['km']:.1f} km, long {w['long']:.1f}): {got} runs, asked {runs}"


@pytest.mark.parametrize("weeks,km", [(w, d) for w, d in all_cases() if w >= 6])
def test_taper_cuts_volume_and_race_week_is_lightest(weeks, km):
    ctx = make_ctx(weeks=weeks, distance_km=km)
    targets = _weeks(ctx, default_opts(ctx))
    peak = max(w["km"] for w in targets)
    taper = [w for w in targets if w["phase"] in ("taper", "race week")]
    assert all(w["km"] < peak for w in taper)
    assert targets[-1]["phase"] == "race week" and targets[-1]["km"] == min(w["km"] for w in taper)
    assert targets[-1]["km"] <= 0.6 * peak + 0.1, "race week should cut volume by 40 % or more (Bosquet 2007)"


# ------------------------------------------------------------------ structure

@pytest.mark.parametrize("n", range(2, 30))
@pytest.mark.parametrize("taper", [1, 2, 3])
def test_phases_match_the_time_left(n, taper):
    phases = _phases(n, taper)
    assert len(phases) == n and phases[-1] == "race week"
    t = min(taper, max(1, n - 1))
    m = n - t
    if m <= 3:
        assert set(phases[:m]) <= {"sharpen"}
    elif m >= 13:
        assert phases.count("peak") == 3 and "base" in phases and "build" in phases
    elif m >= 8:
        assert phases.count("peak") == 2 and "base" in phases


@pytest.mark.parametrize("weeks,km", all_cases())
def test_days_race_and_tune_up(weeks, km):
    """Nothing after race day, nothing on or before today; the race once, on race day; a tune-up
    race only when enabled, on the Sunday 6 weeks before race week."""
    ctx = make_ctx(weeks=weeks, distance_km=km)
    race_date = ctx["race"]["race_date"]
    for tune in (False, True):
        opts = default_opts(ctx, tune_up=tune and weeks >= 12 and km >= 20)
        days = plan_days(ctx, opts)
        assert all(ctx["today"] < d["day"] <= race_date for d in days)
        races = [d for d in days if d["session"] == "race"]
        assert [d["day"] for d in races if d["day"] == race_date] == [race_date]
        tune_ups = [d for d in races if d["day"] != race_date]
        if opts.tune_up:
            race_week_monday = race_date - dt.timedelta(days=race_date.weekday())
            expected = race_week_monday - dt.timedelta(weeks=TUNE_UP_WEEKS_BEFORE) + dt.timedelta(days=6)
            assert [d["day"] for d in tune_ups] == [expected]
        else:
            assert not tune_ups


@pytest.mark.parametrize("km", [21.0975, 42.195])
def test_current_week_fills_to_current_load(km):
    """The current week plans only the days after today; with what was already run it reaches about
    the current load."""
    ctx = make_ctx(weeks=14, distance_km=km, done_this_week=13.0)
    days = plan_days(ctx, default_opts(ctx))
    week1 = [d for d in days if d["week"] == 1]
    assert all(d["day"] > ctx["today"] for d in week1)
    planned = sum(d.get("planned_km") or 0 for d in week1 if d["session"] in RUN)
    assert abs(planned + ctx["done_this_week"] - ctx["vol0"]) <= EASY_MIN_KM + 1


# ------------------------------------------------------------------ the recommendation

@pytest.mark.parametrize("weeks,km", [(w, d) for w, d in all_cases() if w >= 6])
def test_least_effort_plan_reaches_goal_with_no_more_km_than_fastest(weeks, km):
    ctx = make_ctx(weeks=weeks, distance_km=km)
    fast_opts, fast_t = best_realistic(ctx, default_opts(ctx))
    goal = fast_t + 600                     # a goal the fastest safe plan beats by 10 minutes
    ctx["race"]["goal_time_s"] = goal
    found = least_effort(ctx, fast_opts, goal)
    assert found, "a reachable goal must give a least-effort plan"
    opts, r = found
    lim = distance_limits(km)
    assert r["predicted_time_s"] <= goal and r["tsb_in_band"]
    assert r["total_km"] <= compute(ctx, fast_opts, full=False)["total_km"] + 0.5
    assert opts.ramp_pct <= 10 and opts.long_max_km <= lim["long_max"] and opts.taper_weeks in lim["taper"]
    assert opts.peak_km <= ctx["habits"]["peak_default"] + 0.5


@pytest.mark.parametrize("weeks,km", [(w, d) for w, d in all_cases() if w >= 6])
def test_effort_frontier_gets_faster_with_more_running(weeks, km):
    ctx = make_ctx(weeks=weeks, distance_km=km)
    front = effort_frontier(ctx, default_opts(ctx), ctx["race"]["goal_time_s"], None)
    assert len(front) >= 2
    for a, b in zip(front, front[1:]):
        assert b["total_km"] >= a["total_km"] and b["time_s"] < a["time_s"]


def test_deterministic():
    a = compute(make_ctx(), default_opts(make_ctx()))
    b = compute(make_ctx(), default_opts(make_ctx()))
    assert a["result"] == b["result"] and a["days"] == b["days"]


@pytest.mark.parametrize("weeks,km", all_cases())
def test_taper_keeps_endurance(weeks, km):
    """The taper and race week never leave less endurance (marathon shape) than the phase before them,
    and race day uses at least that much."""
    from garmin_sync.scenario import compute
    ctx = make_ctx(weeks=weeks, distance_km=km)
    r = compute(ctx, default_opts(ctx), True)
    phases = r["phases"]
    before = [p for p in phases if p["phase"] not in ("taper", "race week")]
    if not before or not before[-1].get("expected"):
        pytest.skip("no training phase ahead of the taper")
    held = before[-1]["expected"]["shape"]
    # the taper, race week and race day keep the race's hold, measured against race-day VO2max (the
    # shape is relative to it), so allow for its rise over the phase before; race week ends on race day
    for p in phases:
        if p["phase"] in ("taper", "race week") and p.get("expected"):
            assert p["expected"]["shape"] >= held * 0.97, f"{p['phase']}: {p['expected']['shape']:.1f} % < {held:.1f} % before it"
    assert r["shape_race"] >= held * 0.97, f"race day {r['shape_race']:.1f} % < {held:.1f} % before the taper"
    last = phases[-1]
    if last["phase"] == "race week" and last.get("expected") and last["expected"]["race_time_s"] and r["predicted_time_s"]:
        assert abs(last["expected"]["race_time_s"] - r["predicted_time_s"]) <= 0.01 * r["predicted_time_s"], "race week does not end on the race-day forecast"
