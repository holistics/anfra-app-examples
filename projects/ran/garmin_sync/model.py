"""Fits the causal model's parameters to the runner's data and checks race-time predictions.

Run at the end of every sync and by `garmin-sync fit`. Rewrites garmin.model_param,
garmin.heat_fit_point and garmin.prediction_check (db/schema.d/40_model.sql).

1. Heat (D6). Pace at a fixed easy HR (garmin.activity_marker) on steady outdoor runs, regressed on
   WBGT with a piecewise-linear time trend (fitness drift) and log duration (cardiac drift):
       log(speed) = a + b * (WBGT - ref) + trend(date) + c * log(duration)
   heat_pct_per_c = (exp(-b) - 1) * 100: how much slower per degree C of WBGT at the same HR.
   95 % interval from a bootstrap over runs. Two checks are stored next to it: the same fit with
   CTL in place of the trend, and efficiency (grade-adjusted speed / HR) over all steady runs.

2. Predictions (validation). For each past race with a result, each method predicts its time from
   data up to the day before, and the error is stored. Methods: Daniels/VDOT from effective
   VO2max and from Garmin's VO2max (raw, and heat-adjusted from the WBGT of the 30 days of runs
   the estimate came from to the race's WBGT); Garmin's race prediction the day before; Riegel
   (exponent 1.06) from the previous race (raw and heat-adjusted); Tanda for marathons.
   The causal-model forecast the planner uses is `daniels_shape_heat`: effective VO2max (D1)
   scaled by Runalyze's marathon-shape factor for the distance (volume), then Daniels, then heat
   (D6); calibrated to the runner's earlier races like the others.

3. Race fitness response (Layer 2, D1). How effective VO2max follows training load over a block:
       VO2(t + 84 d) - VO2(t) = a + b * (CTL30(t + 84 d) - CTL30(t))
   with CTL30 the 30-day mean of fitness (CTL), on windows starting every 7 days. b = vo2_per_ctl, used
   by the planner to project race-day VO2max from a plan; 95 % interval by bootstrap over windows. A
   WBGT term came out with the wrong sign (season confounds it), so it is left out.
"""

from __future__ import annotations

import datetime as dt
import logging
import math
import os
from typing import Any, Callable

import numpy as np
import psycopg
from psycopg.types.json import Jsonb

log = logging.getLogger("garmin_sync.model")

BOOTSTRAP = 2000
KNOT_DAYS = 180          # spacing of the fitness-trend knots
RIEGEL = 1.06
# Ely et al. 2007 (5-25 C WBGT): top men ~0.9 % slower per 5 C (from 1.7 % to 4.5 % over the
# quartiles); slower finishers more, ~3.2 % per 5 C for 300th place (secondary sources).
LIT_ELITE_PCT_PER_C = 0.9 / 5
LIT_SLOWER_PCT_PER_C = 3.2 / 5
# Methods also scored after calibration to the runner: each prediction is scaled by the mean
# actual / predicted ratio of the same method over the runner's earlier races (never later ones).
CALIBRATE = {
    "daniels_vo2_effective": "Daniels · effective VO2max, calibrated",
    "daniels_vo2max_garmin": "Daniels · Garmin VO2max, calibrated",
    "garmin_prediction": "Garmin race prediction, calibrated",
    "daniels_shape": "Daniels · effective VO2max x marathon shape, calibrated",
    "daniels_shape_heat": "Causal model · VO2max x marathon shape + heat, calibrated",
}
PREDICTED_DISTANCES = {"time_5k_s": 5.0, "time_10k_s": 10.0, "time_half_s": 21.0975, "time_marathon_s": 42.195}


# ---------------------------------------------------------------- heat

def _design(days: np.ndarray, wbgt_c: np.ndarray, log_dur: np.ndarray, ref: float,
            knots: np.ndarray, extra: np.ndarray | None = None) -> np.ndarray:
    cols = [np.ones_like(days), wbgt_c - ref, log_dur - log_dur.mean()]
    if extra is not None:
        cols.append(extra - extra.mean())
    else:
        cols.append(days / 365.0)
        cols += [np.maximum(days - k, 0) / 365.0 for k in knots]
    return np.column_stack(cols)


def _ols(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    return beta, y - x @ beta


def _pct_slower(b: float) -> float:
    return (math.exp(-b) - 1) * 100


def _bootstrap(x: np.ndarray, y: np.ndarray, seed: int = 7) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    n = len(y)
    draws = []
    for _ in range(BOOTSTRAP):
        i = rng.integers(0, n, n)
        beta, *_ = np.linalg.lstsq(x[i], y[i], rcond=None)
        draws.append(_pct_slower(beta[1]))
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return float(lo), float(hi)


def fit_heat(conn: psycopg.Connection) -> dict[str, Any]:
    rows = conn.execute(
        """select a.activity_id, a.start_date, a.wbgt_c, a.duration_s, m.speed_at_easy_hr_mps,
                  a.avg_gap_speed_mps, a.avg_hr, a.hr_max_used, d.ctl
           from garmin.activity a
           join garmin.activity_marker m using (activity_id)
           left join garmin.day d on d.calendar_date = a.start_date
           where a.is_run and not a.is_indoor and not a.is_workout and a.wbgt_c is not null
             and a.duration_s >= 1200
           order by a.start_date"""
    ).fetchall()
    params: dict[str, Any] = {}
    easy = [r for r in rows if r[4]]
    if len(easy) < 30:
        log.warning("heat fit: only %s runs with a pace at easy HR; skipped", len(easy))
        return params

    start = easy[0][1]
    days = np.array([(r[1] - start).days for r in easy], float)
    wbgt = np.array([r[2] for r in easy], float)
    log_dur = np.log(np.array([r[3] for r in easy], float))
    y = np.log(np.array([r[4] for r in easy], float))
    ref = float(np.median(wbgt))
    knots = np.arange(KNOT_DAYS, days.max(), KNOT_DAYS)
    x = _design(days, wbgt, log_dur, ref, knots)
    beta, resid = _ols(x, y)
    lo, hi = _bootstrap(x, y)
    r2 = 1 - resid.var() / y.var()
    heat = _pct_slower(beta[1])
    method = (f"log pace-at-easy-HR speed ~ WBGT + fitness trend (knots every {KNOT_DAYS} days) + log duration; "
              f"steady outdoor runs of 20 min+; {BOOTSTRAP} bootstrap resamples")
    params["heat_pct_per_c"] = (heat, lo, hi, len(y), method)
    params["heat_ref_wbgt_c"] = (ref, None, None, len(y), "median WBGT of the runs in the heat fit")
    params["heat_r2"] = (float(r2), None, None, len(y), "share of variance explained by the whole heat fit")
    params["heat_resid_sd_pct"] = (float(resid.std() * 100), None, None, len(y),
                                   "spread of runs around the fit, in % of speed")
    params["heat_wbgt_min_c"] = (float(wbgt.min()), None, None, len(y), "coolest run in the fit")
    params["heat_wbgt_max_c"] = (float(wbgt.max()), None, None, len(y), "hottest run in the fit")

    # Partial residuals for the chart: everything but the heat term removed, as % slower in pace.
    heat_part = beta[1] * (wbgt - ref)
    partial = resid + heat_part
    points = [(r[0], r[1], r[2], 1000 / r[4], (math.exp(-p) - 1) * 100, (math.exp(-h) - 1) * 100)
              for r, p, h in zip(easy, partial, heat_part)]

    # Check 0: no fitness control at all, to show how much fitness drift confounds heat.
    x0 = np.column_stack([np.ones_like(wbgt), wbgt - ref])
    b0, _ = _ols(x0, y)
    lo0, hi0 = _bootstrap(x0, y)
    params["heat_pct_per_c_naive"] = (_pct_slower(b0[1]), lo0, hi0, len(y),
                                      "check: WBGT alone, no fitness trend (confounded: fitness rose while cooler runs became rarer or vice versa)")

    # Check 1: CTL in place of the time trend.
    ctl_rows = [(d, w, ld, yy, r[8]) for r, d, w, ld, yy in zip(easy, days, wbgt, log_dur, y) if r[8] is not None]
    if len(ctl_rows) >= 30:
        d2, w2, l2, y2, c2 = (np.array(v, float) for v in zip(*ctl_rows))
        x2 = _design(d2, w2, l2, ref, knots, extra=c2)
        b2, _ = _ols(x2, y2)
        lo2, hi2 = _bootstrap(x2, y2)
        params["heat_pct_per_c_ctl"] = (_pct_slower(b2[1]), lo2, hi2, len(y2),
                                        "check: the same fit with CTL (Banister fitness) in place of the time trend")

    # Check 2: efficiency over all steady runs (more runs, but HR is free to vary).
    eff = [r for r in rows if r[5] and r[6] and r[7]]
    if len(eff) >= 30:
        d3 = np.array([(r[1] - start).days for r in eff], float)
        w3 = np.array([r[2] for r in eff], float)
        l3 = np.log(np.array([r[3] for r in eff], float))
        y3 = np.log(np.array([r[5] / r[6] for r in eff], float))
        intensity = np.array([r[6] / r[7] for r in eff], float)
        x3 = np.column_stack([_design(d3, w3, l3, ref, knots), intensity - intensity.mean()])
        b3, _ = _ols(x3, y3)
        lo3, hi3 = _bootstrap(x3, y3)
        params["heat_pct_per_c_efficiency"] = (_pct_slower(b3[1]), lo3, hi3, len(y3),
                                               "check: log(grade-adjusted speed / HR) ~ WBGT + trend + log duration + %HRmax, all steady outdoor runs")

    params["lit_heat_pct_per_c_elite"] = (LIT_ELITE_PCT_PER_C, None, None, None,
                                          "Ely et al. 2007: top men, ~0.9 % per 5 C WBGT over 5-25 C")
    params["lit_heat_pct_per_c_slower"] = (LIT_SLOWER_PCT_PER_C, None, None, None,
                                           "Ely et al. 2007 as summarised: 300th-place men, ~3.2 % per 5 C (secondary source)")

    conn.execute("delete from garmin.heat_fit_point")
    conn.cursor().executemany(
        """insert into garmin.heat_fit_point (activity_id, start_date, wbgt_c, pace_s_per_km, heat_adj_pct, fitted_pct)
           values (%s, %s, %s, %s, %s, %s)""",
        points,
    )
    return params


# ---------------------------------------------------------------- predictions

def daniels_demand(v_m_per_min: float) -> float:
    return -4.60 + 0.182258 * v_m_per_min + 0.000104 * v_m_per_min ** 2


def daniels_fraction(t_min: float) -> float:
    return 0.8 + 0.1894393 * math.exp(-0.012778 * t_min) + 0.2989558 * math.exp(-0.1932605 * t_min)


def daniels_time_s(vdot: float, distance_km: float) -> float | None:
    """Race time at which Daniels' VDOT for the distance equals vdot (bisection on minutes)."""
    if not vdot or vdot <= 0:
        return None
    metres = distance_km * 1000
    f = lambda t: daniels_demand(metres / t) / daniels_fraction(t) - vdot  # decreasing in t
    lo, hi = 1.0, 1000.0
    if f(lo) < 0 or f(hi) > 0:
        return None
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) > 0 else (lo, mid)
    return (lo + hi) / 2 * 60


def shape_factor(shape_pct: float | None, distance_km: float) -> float:
    """Runalyze (Prognosis/VO2max.php): the share of effective VO2max usable over a distance given
    the marathon shape. Needed shape = distance^1.23 %; each point missing costs 0.4 % of VO2max,
    down to 60 %."""
    if shape_pct is None:
        return 1.0
    needed = distance_km ** 1.23
    return min(1.0, 0.6 + 0.4 * max(0.0, 1 - (needed - shape_pct) / 100))


def riegel(time_s: float, from_km: float, to_km: float) -> float:
    return time_s * (to_km / from_km) ** RIEGEL


def tanda_time_s(km_per_week: float, train_pace_s_per_km: float) -> float:
    """Tanda 2011: marathon pace (s/km) = 17.1 + 140.0 exp(-0.0053 K) + 0.55 P."""
    return (17.1 + 140.0 * math.exp(-0.0053 * km_per_week) + 0.55 * train_pace_s_per_km) * 42.195


def check_predictions(conn: psycopg.Connection, heat_pct_per_c: float | None) -> list[tuple]:
    races = conn.execute(
        """select r.race_id, r.race_date, r.name, r.distance_km, r.result_time_s, a.wbgt_c
           from garmin.race r left join garmin.activity a on a.activity_id = r.activity_id
           where not r.is_upcoming and r.result_time_s is not null
           order by r.race_date"""
    ).fetchall()
    heat = (lambda w_from, w_to: (1 + heat_pct_per_c / 100) ** (w_to - w_from)) if heat_pct_per_c is not None else None
    out: list[tuple] = []

    def add(race, method, label, predicted, inputs):
        if predicted is None or not math.isfinite(predicted):
            return
        actual = race[4]
        err = (predicted - actual) / actual * 100
        out.append((race[0], method, label, predicted, actual, err, abs(err), Jsonb(inputs)))

    for race in races:
        race_id, day, _, km, actual, race_wbgt = race
        before = day - dt.timedelta(days=1)
        d = conn.execute(
            "select vo2_effective, vo2max_garmin, marathon_shape from garmin.day where calendar_date = %s", (before,)
        ).fetchone() or (None, None, None)
        train_wbgt = conn.execute(
            """select percentile_cont(0.5) within group (order by wbgt_c) from garmin.activity
               where is_run and not is_indoor and wbgt_c is not null and start_date between %s and %s""",
            (day - dt.timedelta(days=30), before),
        ).fetchone()[0]
        can_heat = heat and race_wbgt is not None and train_wbgt is not None

        for key, label, vo2 in (("daniels_vo2_effective", "Daniels · effective VO2max", d[0]),
                                ("daniels_vo2max_garmin", "Daniels · Garmin VO2max", d[1])):
            t = daniels_time_s(vo2, km) if vo2 else None
            add(race, key, label, t, {"vo2": vo2})
            if t and can_heat:
                add(race, f"{key}_heat", f"{label} + heat", t * heat(train_wbgt, race_wbgt),
                    {"vo2": vo2, "train_wbgt_c": train_wbgt, "race_wbgt_c": race_wbgt})
        if d[0]:
            sf = shape_factor(d[2], km)
            t = daniels_time_s(d[0] * sf, km)
            inputs = {"vo2": d[0], "marathon_shape": d[2], "shape_factor": sf}
            add(race, "daniels_shape", "Daniels · effective VO2max x marathon shape", t, inputs)
            if t and can_heat:
                add(race, "daniels_shape_heat", "Causal model · VO2max x marathon shape + heat",
                    t * heat(train_wbgt, race_wbgt), {**inputs, "train_wbgt_c": train_wbgt, "race_wbgt_c": race_wbgt})

        pred = conn.execute(
            """select calendar_date, time_5k_s, time_10k_s, time_half_s, time_marathon_s
               from garmin.race_prediction where calendar_date <= %s order by calendar_date desc limit 1""",
            (before,),
        ).fetchone()
        if pred:
            cols = dict(zip(["time_5k_s", "time_10k_s", "time_half_s", "time_marathon_s"], pred[1:]))
            col = min((c for c in cols if cols[c]), key=lambda c: abs(math.log(PREDICTED_DISTANCES[c] / km)), default=None)
            if col:
                add(race, "garmin_prediction", "Garmin race prediction",
                    riegel(cols[col], PREDICTED_DISTANCES[col], km),
                    {"predicted_on": pred[0].isoformat(), "from": col, "from_s": cols[col]})

        prev = conn.execute(
            """select r.race_id, r.name, r.distance_km, r.result_time_s, a.wbgt_c
               from garmin.race r left join garmin.activity a on a.activity_id = r.activity_id
               where r.race_date < %s and r.result_time_s is not null and not r.is_upcoming
               order by r.race_date desc limit 1""",
            (day,),
        ).fetchone()
        if prev:
            t = riegel(prev[3], prev[2], km)
            inputs = {"from_race_id": prev[0], "from_race": prev[1], "from_km": prev[2], "from_s": prev[3]}
            add(race, "riegel_prev_race", "Riegel · previous race", t, inputs)
            if heat and race_wbgt is not None and prev[4] is not None:
                add(race, "riegel_prev_race_heat", "Riegel · previous race + heat", t * heat(prev[4], race_wbgt),
                    {**inputs, "from_wbgt_c": prev[4], "race_wbgt_c": race_wbgt})

        if abs(km - 42.195) < 0.5:
            k, p = conn.execute(
                """select sum(distance_km) / 8, sum(duration_s) / nullif(sum(distance_km), 0)
                   from garmin.activity where is_run and start_date between %s and %s""",
                (day - dt.timedelta(days=56), before),
            ).fetchone()
            if k and p:
                add(race, "tanda", "Tanda (marathon)", tanda_time_s(k, p), {"km_per_week": k, "train_pace_s_per_km": p})

    # Calibrated variants, walking the races in date order so only earlier ones inform each.
    ratios: dict[str, list[float]] = {m: [] for m in CALIBRATE}
    by_race: dict[int, list[tuple]] = {}
    for row in out:
        by_race.setdefault(row[0], []).append(row)
    calibrated: list[tuple] = []
    for race in races:
        for row in by_race.get(race[0], []):
            method = row[1]
            if method not in CALIBRATE:
                continue
            prior = ratios[method]
            if prior:
                factor = sum(prior) / len(prior)
                predicted = row[3] * factor
                err = (predicted - row[4]) / row[4] * 100
                calibrated.append((race[0], f"{method}_calibrated", CALIBRATE[method], predicted, row[4], err, abs(err),
                                   Jsonb({"raw_s": row[3], "factor": factor, "earlier_races": len(prior)})))
            prior.append(row[4] / row[3])
    return out + calibrated


def prediction_params(checks: list[tuple]) -> dict[str, Any]:
    """For the planner: each calibrated method's current factor (over all races), and the method
    with the lowest mean absolute error (its error is the planner's uncertainty band)."""
    params: dict[str, Any] = {}
    by_method: dict[str, list[tuple]] = {}
    for row in checks:
        by_method.setdefault(row[1], []).append(row)
    for method in CALIBRATE:
        rows = by_method.get(method, [])
        if rows:
            ratios = np.array([r[4] / r[3] for r in rows])
            params[f"calibration_{method}"] = (
                float(ratios.mean()), float(ratios.min()), float(ratios.max()), len(rows),
                f"mean actual / predicted of {method} over all marked races (range in the interval columns)")
        cal = [r for r in by_method.get(f"{method}_calibrated", [])]
        if cal:
            errs = np.array([r[6] for r in cal])
            params[f"mape_{method}_calibrated"] = (
                float(errs.mean()), float(errs.min()), float(errs.max()), len(cal),
                f"mean absolute error of {method}, calibrated on earlier races only, over the races it predicted")
    # Rank on the races every candidate covers, so methods are compared like with like.
    scored = {m: rows for m, rows in by_method.items() if len(rows) >= 3}
    if scored:
        common = set.intersection(*({r[0] for r in rows} for rows in scored.values()))
        if len(common) >= 3:
            mape = {m: float(np.mean([r[6] for r in rows if r[0] in common])) for m, rows in scored.items()}
            best = min(mape, key=mape.get)
            errs = np.array([r[5] for r in scored[best] if r[0] in common])
            params["best_prediction_mape_pct"] = (
                mape[best], float(errs.min()), float(errs.max()), len(common),
                f"{best}: lowest mean absolute error on the {len(common)} races every method predicts "
                f"(interval columns = its smallest and largest signed error, %)")
    return params


# ---------------------------------------------------------------- entry points

VO2_HORIZON_DAYS = 84


def fit_vo2_response(conn: psycopg.Connection) -> dict[str, Any]:
    rows = conn.execute(
        """select calendar_date, vo2_effective,
                  avg(ctl) over (order by calendar_date rows between 29 preceding and current row) as ctl30
           from garmin.day order by calendar_date"""
    ).fetchall()
    by = {r[0]: r for r in rows}
    x, y = [], []
    for day, v, c30 in rows[::7]:
        e = by.get(day + dt.timedelta(days=VO2_HORIZON_DAYS))
        if v is not None and c30 and e and e[1] is not None and e[2]:
            x.append([1.0, e[2] - c30])
            y.append(e[1] - v)
    if len(y) < 20:
        return {}
    xa, ya = np.array(x), np.array(y)
    coef = np.linalg.lstsq(xa, ya, rcond=None)[0]
    rng = np.random.default_rng(7)
    boot = [np.linalg.lstsq(xa[i], ya[i], rcond=None)[0][1] for i in (rng.integers(0, len(ya), len(ya)) for _ in range(BOOTSTRAP))]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    mae = float(np.mean(np.abs(ya - xa @ coef)))
    mae0 = float(np.mean(np.abs(ya)))
    return {
        "vo2_per_ctl": (float(coef[1]), float(lo), float(hi), len(ya),
                        f"change in effective VO2max over {VO2_HORIZON_DAYS} days per point of change in 30-day mean CTL; "
                        "windows every 7 days; 95 % bootstrap interval"),
        "vo2_response_mae": (mae, None, None, len(ya),
                             f"mean abs error of that {VO2_HORIZON_DAYS}-day projection (VO2max points)"),
        "vo2_response_mae_no_change": (mae0, None, None, len(ya),
                                       "the same error assuming VO2max does not change, for comparison"),
    }


def fit(conn: psycopg.Connection, progress: Callable[[str], None] = lambda _: None) -> dict[str, Any]:
    progress("Fitting the model")
    params = fit_heat(conn)
    params.update(fit_vo2_response(conn))
    heat = params.get("heat_pct_per_c", (None,))[0]
    checks = check_predictions(conn, heat)
    params.update(prediction_params(checks))
    conn.execute("delete from garmin.model_param")
    conn.cursor().executemany(
        "insert into garmin.model_param (name, value, ci_low, ci_high, n, method) values (%s, %s, %s, %s, %s, %s)",
        [(k, *v) for k, v in params.items()],
    )
    conn.execute("delete from garmin.prediction_check")
    conn.cursor().executemany(
        """insert into garmin.prediction_check
             (race_id, method, method_label, predicted_s, actual_s, error_pct, abs_error_pct, inputs)
           values (%s, %s, %s, %s, %s, %s, %s, %s)""",
        checks,
    )
    conn.commit()
    refresh_scenarios(conn)
    return {"params": {k: v[:3] for k, v in params.items()}, "prediction_checks": len(checks)}


SCENARIO_VIEWS = ("garmin.scenario_context", "garmin.scenario_best")


def refresh_scenarios(conn: psycopg.Connection) -> None:
    """The Race Planner's per-race inputs and recommended plans (db/views.d/60_scenario.sql): they
    read the constants just fitted, so they refresh after the fit, not with the derived views."""
    for name in SCENARIO_VIEWS:
        if conn.execute("select to_regclass(%s)", (name,)).fetchone()[0]:
            conn.execute(f"refresh materialized view {name}")
    conn.commit()


def fit_safely(conn: psycopg.Connection, progress: Callable[[str], None]) -> None:
    """The sync's last step: a failed fit is logged, never fails the sync."""
    try:
        fit(conn, progress)
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        log.warning("model fit failed: %s", e)


def main() -> dict[str, Any]:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        return fit(conn)
