"""A synthetic runner for demos: `garmin-sync demo-data [--db garmin_demo] [--seed N]`.

The runner is fictional and simulated *from the causal model in the README*, with known
parameters, so a demo can show the model recovering them. Everything is written in the shapes
the Garmin sync stores (raw.activity summaries, lapDTOs, Open-Meteo hourly documents, daily
summaries, threshold / race-prediction documents, per-second samples), so every view, model and
app works on it unchanged. No network access and no real person's data: all values come from the
simulation below. Runs follow real streets and park paths in Ho Chi Minh City (demo_routes.json,
built once by scripts/demo_routes.py from OpenStreetMap, © OpenStreetMap contributors, ODbL),
with the city's flat ground, bridges, turns, crossings and GPS noise.

The true parameters are stored in raw.doc 'demo_truth'. The database is marked as a demo
(raw.sync_state 'demo_database'), and the Garmin sync refuses to write into it.

What the simulation encodes (all parameters in TRUTH):
- Load: Banister TRIMP from each run's HR stream (female weighting, 0.86·e^(1.67x)).
- D1 VO2max: vo2_base + k1·fitness − k2·fatigue, fitness / fatigue = EWMA of daily TRIMP with
  time constants tau_fitness / tau_fatigue (deliberately not the textbook 42 / 7).
- D2 threshold: fraction of VO2max = f_base + f_gain·min(1, minutes run at threshold effort or
  harder (tempo, reps, races) in 42 days / f_ref).
- D3 economy: speed multiplier 1 + econ_gain·min(1, strength sessions in 70 days / econ_ref).
- D4 durability: decoupling % = dec_floor + dec_amp·exp(−long-run km in 56 days / dec_scale),
  plus heat_drift per °C WBGT above 28. HR rises through the run; speed does not.
- D6 heat: speed at a given effort drops heat_pct_per_c % per °C WBGT above heat_ref_c.
- HR = HRmax·(0.64·%VO2max + 0.37) (the relation the effective-VO2max view inverts).
- Races: Daniels time at an effective VDOT, slowed by heat and (HM/M) durability, ±1 % execution.
"""

from __future__ import annotations

import bisect
import datetime as dt
import json
import math
import os
import random
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from .sync import apply_sql

TZ_OFFSET = dt.timedelta(hours=7)  # local time = UTC+7 (as the real runner's)
SAMPLE_DT = 2  # seconds between stream samples (Garmin's smart recording is 1-5 s)
ID_BASE = 10_000_000_000

TRUTH: dict[str, Any] = {
    "sex": "FEMALE",
    "hr_max": 188,
    "hr_rest_base": 55,
    "weight_kg_start": 55.6,
    "weight_kg_end": 53.9,
    "trimp_a": 0.86,
    "trimp_b": 1.67,
    "vo2_base": 38.0,
    "k1_fitness": 0.15,
    "k2_fatigue": 0.06,
    "tau_fitness_days": 38,
    "tau_fatigue_days": 9,
    "f_base": 0.79,
    "f_gain": 0.07,
    "f_ref_threshold_min_42d": 180,
    "econ_gain": 0.04,
    "econ_ref_strength_70d": 16,
    "dec_floor_pct": 1.5,
    "dec_amp_pct": 6.0,
    "dec_scale_km": 80,
    "dec_long_run_min_km": 16,
    "heat_pct_per_c": 0.7,
    "heat_ref_c": 18.0,
    "heat_drift_pct_per_c": 0.25,
    "garmin_vo2_bias": 2.5,
    "race_execution_sd_pct": 1.0,
}

# Where the runner runs: real routes (see the module docstring). Treadmill runs have no route.
ROUTES = {r["id"]: r for r in json.loads(Path(__file__).with_name("demo_routes.json").read_text())["routes"]}
EASY_ROUTES = ["riverside_park", "canal_path", "tao_dan", "le_van_tam"]
LONG_ROUTES = ["riverside_long", "canal_path"]
QUALITY_ROUTES = ["stadium_track", "canal_path", "riverside_park"]
RACE_ROUTE = "riverside_long"
STREET_ROUTES = {"riverside_long", "canal_path", "tao_dan"}  # crossings: the runner slows to a walk now and then


# ---------------------------------------------------------------------------------- physiology
def o2_cost(v_mpm: float) -> float:
    """Daniels: oxygen cost (ml/kg/min) of running at v metres per minute."""
    return -4.60 + 0.182258 * v_mpm + 0.000104 * v_mpm ** 2


def speed_for_cost(cost: float) -> float:
    """Inverse of o2_cost, in m/s."""
    a, b, c = 0.000104, 0.182258, -4.60 - cost
    return (-b + math.sqrt(b * b - 4 * a * c)) / (2 * a) / 60


def pct_sustainable(t_min: float) -> float:
    """Daniels: fraction of VO2max sustainable for t minutes."""
    return 0.8 + 0.1894393 * math.exp(-0.012778 * t_min) + 0.2989558 * math.exp(-0.1932605 * t_min)


def daniels_time(vdot: float, dist_m: float) -> float:
    """Race time (s) for a VDOT over a distance, by bisection."""
    lo, hi = dist_m / 600, dist_m / 40  # minutes
    for _ in range(60):
        mid = (lo + hi) / 2
        if o2_cost(dist_m / mid) / pct_sustainable(mid) > vdot:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2 * 60


def wbgt(temp_c: float, rh: float) -> float:
    e = rh / 100 * 6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))
    return 0.567 * temp_c + 0.393 * e + 3.94


@dataclass
class Segment:
    metres: float
    effort: float | None = None  # fraction of VO2max
    speed: float | None = None  # m/s, overrides effort
    intensity: str = "INTERVAL"
    step: int | None = None
    split: float = 0.0  # linear speed change over the segment (+0.02 = 1 % faster at start)


@dataclass
class Session:
    kind: str  # easy | long | intervals | tempo | race | strength | recovery
    name: str
    start_local: dt.datetime
    segments: list[Segment] = field(default_factory=list)
    indoor: bool = False
    workout: dict[str, Any] | None = None
    race: dict[str, Any] | None = None
    duration_s: float = 0  # strength only
    route: str | None = None  # a key of ROUTES; None indoors


# ---------------------------------------------------------------------------------- the plan
@dataclass
class RaceDef:
    week: int
    distance_km: float
    name: str
    priority: str
    marked: bool = True


def plan_weeks(rng: random.Random, n_weeks: int, races: list[RaceDef]) -> dict[int, float]:
    race_weeks = {r.week: r for r in races}
    km: dict[int, float] = {}
    for w in range(n_weeks):
        base = 22 + 36 * (w / max(n_weeks - 1, 1)) ** 0.9
        k = base
        if w % 4 == 3:
            k *= 0.72
        if w in (46, 47):
            k *= 0.15  # two weeks away (holiday)
        if w in race_weeks:
            k *= 0.6
        elif w + 1 in race_weeks:
            k *= 0.82
        elif w - 1 in race_weeks:
            k *= 0.7
        km[w] = k * rng.uniform(0.93, 1.07)
    return km


def build_sessions(rng: random.Random, start: dt.date, today: dt.date, races: list[RaceDef]
                   ) -> tuple[list[Session], set[dt.date]]:
    n_weeks = (today - start).days // 7 + 1
    weekly = plan_weeks(rng, n_weeks, races)
    race_by_week = {r.week: r for r in races}
    strength_weeks = set(range(26, 61)) | set(range(78, n_weeks))
    illness = set()
    for w0 in (14, 58, 88):
        d0 = start + dt.timedelta(weeks=w0, days=rng.randint(0, 3))
        illness |= {d0 + dt.timedelta(days=i) for i in range(4)}
    sessions: list[Session] = []
    qcycle = 0
    for w in range(n_weeks):
        monday = start + dt.timedelta(weeks=w)
        km = weekly[w]
        race = race_by_week.get(w)
        long_km = min(max(0.32 * km, 12), 32)
        q_km = max(0.2 * km, 6)
        easy_total = max(km - long_km - q_km, 6)
        days: dict[int, tuple[str, float]] = {1: ("quality", q_km), 2: ("easy", 0.38 * easy_total),
                                              3: ("easy", 0.34 * easy_total), 5: ("easy", 0.28 * easy_total),
                                              6: ("long", long_km)}
        if km < 26:
            days.pop(3)
        if race:
            days[6] = ("race", race.distance_km)
            days[1] = ("quality", min(q_km, 8))
            days.pop(5, None)
        for wd in range(7):
            day = monday + dt.timedelta(days=wd)
            if day >= today or day in illness:
                continue
            if w in strength_weeks and wd in (0, 3) and rng.random() > 0.1:
                st = dt.datetime.combine(day, dt.time(18, 0)) + dt.timedelta(minutes=rng.randint(0, 40))
                sessions.append(Session("strength", "Strength", st, duration_s=rng.randint(35, 50) * 60))
            if wd not in days:
                continue
            kind, dist = days[wd]
            if kind != "race" and rng.random() < 0.06:
                continue  # missed
            if kind == "race":
                st = dt.datetime.combine(day, dt.time(5, 0))
                if race.distance_km > 30:
                    st = dt.datetime.combine(day, dt.time(4, 30))
                name = race.name if race.marked else "Sunday 10K"
                sessions.append(Session("race", name, st, race={"def": race}, route=RACE_ROUTE))
            elif kind == "long":
                st = dt.datetime.combine(day, dt.time(5, 0)) + dt.timedelta(minutes=rng.randint(0, 25))
                rid = rng.choice(LONG_ROUTES)
                sessions.append(Session("long", f"{ROUTES[rid]['place']} Long Run", st, route=rid,
                                        segments=[Segment(dist * 1000, effort=rng.uniform(0.66, 0.71))]))
            elif kind == "easy":
                morning = rng.random() < 0.6
                st = dt.datetime.combine(day, dt.time(5, 30) if morning else dt.time(18, 15)) + dt.timedelta(minutes=rng.randint(0, 30))
                indoor = rng.random() < 0.1
                dist = max(dist, 4) * rng.uniform(0.9, 1.1)
                rid = None if indoor else rng.choice(EASY_ROUTES)
                sessions.append(Session("easy", "Treadmill Running" if indoor else f"{ROUTES[rid]['place']} Running",
                                        st, indoor=indoor, route=rid,
                                        segments=[Segment(dist * 1000, effort=rng.uniform(0.62, 0.69))]))
            else:
                st = dt.datetime.combine(day, dt.time(18, 30)) + dt.timedelta(minutes=rng.randint(0, 15))
                qcycle += 1
                sessions.append(quality_session(rng, st, dist, qcycle, len(sessions)))
    sessions.sort(key=lambda s: s.start_local)
    return sessions, illness


def quality_session(rng: random.Random, st: dt.datetime, total_km: float, n: int, wid: int) -> Session:
    kind = ("intervals", "tempo", "intervals400")[n % 3]
    wu = Segment(2500, effort=0.6, intensity="WARMUP", step=0)
    cd = Segment(2000, effort=0.58, intensity="COOLDOWN", step=3)
    if kind == "tempo":
        reps, rep_m, rec_m, effort, label = 3, 2000, 400, None, "Tempo 3 x 2 km"
    elif kind == "intervals":
        reps, rep_m, rec_m, effort, label = 6, 800, 400, 0.97, "Intervals 6 x 800 m"
    else:
        reps, rep_m, rec_m, effort, label = 8, 400, 200, 1.0, "Intervals 8 x 400 m"
    segs = [wu]
    for i in range(reps):
        segs.append(Segment(rep_m, effort=effort, intensity="ACTIVE", step=1))
        if i < reps - 1:
            segs.append(Segment(rec_m, effort=0.5, intensity="RECOVERY", step=2))
    segs.append(cd)
    workout_id = 900_000_000 + wid
    workout = {
        "workoutId": workout_id, "workoutName": label, "sportType": {"sportTypeKey": "running"},
        "workoutSegments": [{"segmentOrder": 1, "workoutSteps": [
            {"type": "ExecutableStepDTO", "stepOrder": 1, "stepType": {"stepTypeKey": "warmup"},
             "endCondition": {"conditionTypeKey": "distance"}, "endConditionValue": 2500.0,
             "targetType": {"workoutTargetTypeKey": "no.target"}},
            {"type": "RepeatGroupDTO", "stepOrder": 2, "numberOfIterations": reps, "workoutSteps": [
                {"type": "ExecutableStepDTO", "stepOrder": 3, "stepType": {"stepTypeKey": "interval"},
                 "endCondition": {"conditionTypeKey": "distance"}, "endConditionValue": float(rep_m),
                 "targetType": {"workoutTargetTypeKey": "pace.zone"}},
                {"type": "ExecutableStepDTO", "stepOrder": 4, "stepType": {"stepTypeKey": "recovery"},
                 "endCondition": {"conditionTypeKey": "distance"}, "endConditionValue": float(rec_m),
                 "targetType": {"workoutTargetTypeKey": "no.target"}}]},
            {"type": "ExecutableStepDTO", "stepOrder": 5, "stepType": {"stepTypeKey": "cooldown"},
             "endCondition": {"conditionTypeKey": "distance"}, "endConditionValue": 2000.0,
             "targetType": {"workoutTargetTypeKey": "no.target"}}]}],
    }
    rid = rng.choice(QUALITY_ROUTES)
    return Session("tempo" if kind == "tempo" else "intervals", f"{ROUTES[rid]['place']} - {label}", st,
                   segments=segs, workout=workout, route=rid)


def _m(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (b[0] - a[0]) * 111_320
    dx = (b[1] - a[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


class Course:
    """Where a run is along its route. A loop laps the route from its start; an out-and-back turns
    where it brings the runner back to the start at the planned distance (several times over a
    long run). Gives position, elevation, the grade in the running direction, and how much a turn
    or the turnaround slows the runner."""

    def __init__(self, route: dict[str, Any], total_m: float):
        pts = route["points"]
        self.lat = [p[0] for p in pts]
        self.lon = [p[1] for p in pts]
        self.ele = [p[2] for p in pts]
        self.cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            self.cum.append(self.cum[-1] + _m((a[0], a[1]), (b[0], b[1])))
        self.length = self.cum[-1]
        self.loop = route["kind"] == "loop"
        self.turn = self.length if self.loop else total_m / (2 * max(1, math.ceil(total_m / (2 * self.length))))
        # corners: a heading change over 55 degrees
        self.corners: list[float] = []
        for i in range(1, len(pts) - 1):
            h1 = math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
            h2 = math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])
            if abs((h2 - h1 + math.pi) % (2 * math.pi) - math.pi) > math.radians(55):
                self.corners.append(self.cum[i])

    def _interp(self, arr: list[float], x: float) -> float:
        i = min(max(bisect.bisect_right(self.cum, x) - 1, 0), len(self.cum) - 2)
        span = self.cum[i + 1] - self.cum[i]
        f = (x - self.cum[i]) / span if span else 0.0
        return arr[i] + (arr[i + 1] - arr[i]) * f

    def at(self, d: float) -> tuple[float, float, float, float, float]:
        if self.loop:
            x, sign, s = d % self.length, 1.0, 0.0
        else:
            s = d % (2 * self.turn)
            x, sign = (s, 1.0) if s <= self.turn else (2 * self.turn - s, -1.0)
        ele = self._interp(self.ele, x)
        grade = sign * (self._interp(self.ele, min(x + 5, self.length)) - self._interp(self.ele, max(x - 5, 0))) / 10
        slow = 1.0
        if not self.loop and (abs(s - self.turn) < 8 or (d > 8 and s < 8)):
            slow = 0.55   # the turnaround
        else:
            k = bisect.bisect_left(self.corners, x - 6)
            if k < len(self.corners) and abs(self.corners[k] - x) < 6:
                slow = 0.88
        return self._interp(self.lat, x), self._interp(self.lon, x), ele, grade, slow


def climb(elev: list[float]) -> tuple[float, float]:
    """Ascent and descent of a recorded elevation series, as a watch counts them: smoothed over 10
    samples, and a rise or fall counts once it passes 0.5 m (so barometer noise adds up only a little)."""
    if len(elev) < 2:
        return 0.0, 0.0
    sm = [sum(elev[max(0, i - 5):i + 5]) / len(elev[max(0, i - 5):i + 5]) for i in range(len(elev))]
    up = down = 0.0
    ref = sm[0]
    for e in sm[1:]:
        if e - ref >= 0.5:
            up += e - ref
            ref = e
        elif ref - e >= 0.5:
            down += ref - e
            ref = e
    return round(up, 0), round(down, 0)


# ---------------------------------------------------------------------------------- weather
def weather_at(rng: random.Random, local: dt.datetime) -> tuple[float, float]:
    """Temperature (°C) and humidity (%) for a tropical city: dry season Dec-Apr, warm afternoons."""
    m = local.month
    base = {12: 24.0, 1: 23.5, 2: 24.5, 3: 26.5, 4: 28.0, 5: 28.0}.get(m, 26.5)
    rh = 66.0 if m in (12, 1, 2, 3, 4) else 82.0
    h = local.hour + local.minute / 60
    diurnal = 4.5 * max(0.0, math.sin(math.pi * (h - 6) / 14)) if 6 <= h <= 20 else 0.0
    t = base + diurnal + rng.gauss(0, 1.1)
    rh = min(98.0, max(40.0, rh - 2.2 * diurnal + rng.gauss(0, 5)))
    return t, rh


# ---------------------------------------------------------------------------------- simulation
class Runner:
    def __init__(self, rng: random.Random, start: dt.date):
        self.rng = rng
        self.start = start
        self.fitness = 45.0
        self.fatigue = 45.0
        self.daily_load: dict[dt.date, float] = {}
        self.threshold_min: list[tuple[dt.date, float]] = []
        self.strength_days: list[dt.date] = []
        self.long_runs: list[tuple[dt.date, float]] = []
        self.rhr: dict[dt.date, float] = {}
        self.history: dict[dt.date, tuple[float, float]] = {}  # day -> (fitness, fatigue) that morning
        self.illness: set[dt.date] = set()
        self._day: dt.date | None = None

    def advance_to(self, day: dt.date) -> None:
        """Bring fitness / fatigue to the morning of `day` (loads up to the day before)."""
        while self._day is None or self._day < day:
            prev = self.start - dt.timedelta(days=1) if self._day is None else self._day
            load = self.daily_load.get(prev, 0.0)
            self.fitness += (load - self.fitness) * (1 - math.exp(-1 / TRUTH["tau_fitness_days"]))
            self.fatigue += (load - self.fatigue) * (1 - math.exp(-1 / TRUTH["tau_fatigue_days"]))
            self._day = prev + dt.timedelta(days=1)
            self.history[self._day] = (self.fitness, self.fatigue)

    def state_on(self, day: dt.date) -> tuple[float, float]:
        self.advance_to(day)
        return self.history[day]

    def vo2(self, day: dt.date | None = None) -> float:
        fit, fat = (self.fitness, self.fatigue) if day is None else self.state_on(day)
        return TRUTH["vo2_base"] + TRUTH["k1_fitness"] * fit - TRUTH["k2_fatigue"] * fat

    def fraction(self, day: dt.date) -> float:
        q = sum(m for d, m in self.threshold_min if 0 < (day - d).days <= 42)
        return TRUTH["f_base"] + TRUTH["f_gain"] * min(1.0, q / TRUTH["f_ref_threshold_min_42d"])

    def economy(self, day: dt.date) -> float:
        s = sum(1 for d in self.strength_days if 0 < (day - d).days <= 70)
        return 1 + TRUTH["econ_gain"] * min(1.0, s / TRUTH["econ_ref_strength_70d"])

    def decoupling(self, day: dt.date) -> float:
        lr = sum(km for d, km in self.long_runs if 0 < (day - d).days <= 56)
        return TRUTH["dec_floor_pct"] + TRUTH["dec_amp_pct"] * math.exp(-lr / TRUTH["dec_scale_km"])

    def resting_hr(self, day: dt.date) -> float:
        """Resting HR that morning: lower with fitness, higher with fatigue, noisy (no illness)."""
        if day not in self.rhr:
            fit, fat = self.state_on(day)
            self.rhr[day] = (TRUTH["hr_rest_base"] - 0.06 * (fit - 60) + 0.08 * (fat - fit)
                             + self.rng.gauss(0, 2.6))
        return self.rhr[day]


def heat_factor(w: float) -> float:
    return 1 - TRUTH["heat_pct_per_c"] / 100 * max(0.0, w - TRUTH["heat_ref_c"])


def simulate_run(rng: random.Random, r: Runner, s: Session, aid: int) -> dict[str, Any]:
    """Per-sample stream, laps and summary for one run."""
    day = s.start_local.date()
    r.advance_to(day)
    vo2, f, econ, dec = r.vo2(), r.fraction(day), r.economy(day), r.decoupling(day)
    hr_max, hr_rest = TRUTH["hr_max"], r.resting_hr(day)
    t_air, rh = weather_at(rng, s.start_local)
    w = 21.0 if s.indoor else wbgt(t_air, rh)
    heat = heat_factor(w)
    dec_run = dec + TRUTH["heat_drift_pct_per_c"] * max(0.0, w - 28)

    segments = s.segments
    race_info = None
    if s.kind == "race":
        rd: RaceDef = s.race["def"]
        d_m = rd.distance_km * 1000
        vdot = vo2 * econ * (f / 0.82) ** 0.3
        t = daniels_time(vdot, d_m) / heat
        if rd.distance_km >= 21:
            t *= 1 + dec / 100 * 0.4 * rd.distance_km / 21.0975
        t *= 1 + rng.gauss(0, TRUTH["race_execution_sd_pct"] / 100)
        split = 0.01 + (dec / 100 * 0.5 if rd.distance_km >= 21 else 0.0)
        segments = [Segment(d_m, speed=d_m / t, split=split)]
        race_info = {"time_s": t, "effort": min(0.98, pct_sustainable(t / 60)), "vdot": vdot, "wbgt": w}
    for seg in segments:
        if seg.effort is None and seg.speed is None:
            seg.effort = f  # tempo at threshold

    course = None if s.indoor or not s.route else Course(ROUTES[s.route], sum(seg.metres for seg in s.segments)
                                                         if s.kind != "race" else s.race["def"].distance_km * 1000)
    street = s.route in STREET_ROUTES and s.kind != "race"
    gps_y = gps_x = baro = 0.0
    walk_left = 0.0

    rows: list[tuple] = []
    laps: list[dict[str, Any]] = []
    elapsed, dist, hr = 0.0, 0.0, hr_rest + 35
    noise = 0.0
    total_planned = sum(seg.metres for seg in segments)
    est_total_s = sum(seg.metres / (seg.speed or speed_for_cost(seg.effort * vo2 * econ) * heat) for seg in segments)
    seq = 0
    hard_s = 0.0  # time at threshold effort or harder
    start_utc = s.start_local - TZ_OFFSET
    rep_no = 0
    auto_lap_next = 1000.0
    lap_start = {"t": 0.0, "d": 0.0, "i": 0, "intensity": None, "step": None}

    def close_lap(intensity: str, step: int | None) -> None:
        i0, i1 = lap_start["i"], len(rows)
        seg_rows = rows[i0:i1]
        if not seg_rows:
            return
        dur = elapsed - lap_start["t"]
        dd = dist - lap_start["d"]
        hrs = [x[5] for x in seg_rows]
        lap = {
            "lapIndex": len(laps) + 1, "startTimeGMT": (start_utc + dt.timedelta(seconds=lap_start["t"])).strftime("%Y-%m-%dT%H:%M:%S.0"),
            "distance": round(dd, 1), "duration": round(dur, 1), "movingDuration": round(dur, 1), "elapsedDuration": round(dur, 1),
            "averageSpeed": round(dd / dur, 3) if dur else 0, "avgGradeAdjustedSpeed": round(dd / dur, 3) if dur else 0,
            "averageHR": round(sum(hrs) / len(hrs)), "maxHR": round(max(hrs)),
            "averageRunCadence": round(sum(x[7] for x in seg_rows) / len(seg_rows), 1),
            "elevationGain": climb([x[8] for x in seg_rows])[0], "elevationLoss": climb([x[8] for x in seg_rows])[1],
            "intensityType": intensity,
            "strideLength": round(sum(x[12] for x in seg_rows) / len(seg_rows), 1),
            "groundContactTime": round(sum(x[14] for x in seg_rows) / len(seg_rows), 1),
            "verticalOscillation": round(sum(x[13] for x in seg_rows) / len(seg_rows), 2),
        }
        if step is not None:
            lap["wktStepIndex"] = step
        laps.append(lap)
        lap_start.update(t=elapsed, d=dist, i=i1)

    for seg in segments:
        if seg.intensity == "ACTIVE":
            rep_no += 1
        if seg.speed is not None:
            v_target = seg.speed
            effort = race_info["effort"] if race_info else 0.9
        else:
            fade = 1 - (0.004 + 0.0004 * max(0.0, r.fatigue - r.fitness)) * max(0, rep_no - 1) if seg.intensity == "ACTIVE" else 1
            v_target = speed_for_cost(seg.effort * vo2 * econ) * heat * fade
            effort = seg.effort
        seg_start = dist
        while dist - seg_start < seg.metres:
            x = (dist - seg_start) / seg.metres
            noise = 0.85 * noise + rng.gauss(0, 0.012)
            v = max(0.8, v_target * (1 + seg.split / 2 - seg.split * x) * (1 + noise))
            lat = lon = None
            elev, hill, ease = 5.0, 1.0, 1.0
            if course is not None:
                lat, lon, elev, grade, slow = course.at(dist)
                # uphill costs about 3 % of speed per 1 % of grade, downhill gives back less
                hill = min(1.08, max(0.85, 1 - 3.0 * grade if grade > 0 else 1 - 1.2 * grade))
                if street and seg.intensity != "ACTIVE":
                    if walk_left <= 0 and rng.random() < SAMPLE_DT / 1500:
                        walk_left = rng.uniform(6, 20)   # a crossing: walk until the light changes
                    if walk_left > 0:
                        walk_left -= SAMPLE_DT
                        slow = min(slow, 1.1 / max(v, 1.1))
                v = max(0.8 if slow > 0.5 else 0.5, v * hill * slow)
                ease = slow   # walking or turning: the effort (and, with a lag, HR) eases
                gps_y = 0.9 * gps_y + rng.gauss(0, 0.6)
                gps_x = 0.9 * gps_x + rng.gauss(0, 0.6)
                lat += gps_y / 111_320
                lon += gps_x / (111_320 * math.cos(math.radians(lat)))
                baro = 0.99 * baro + rng.gauss(0, 0.045)
                elev = round(elev + baro, 1)
            elapsed += SAMPLE_DT
            dist += v * SAMPLE_DT
            if effort >= f - 0.04:
                hard_s += SAMPLE_DT
            frac_run = max(0.0, (elapsed - 600) / max(est_total_s - 600, 1))
            drift = 1 + 2 * dec_run / 100 * min(frac_run, 1.2) if est_total_s > 1200 else 1
            # Drift flattens as HR nears its maximum (a race cannot drift past HRmax)
            base_hr = hr_max * (0.64 * effort * (0.55 + 0.45 * ease) + 0.37)
            room = hr_max * 0.985 - base_hr
            target_hr = base_hr + room * math.tanh(base_hr * (drift - 1) / room) if room > 1 else base_hr
            tau = 25 if target_hr > hr else 40
            hr += (target_hr - hr) * (1 - math.exp(-SAMPLE_DT / tau))
            hr_obs = min(hr_max, hr + rng.gauss(0, 1.2))
            cad = 150 + 7.5 * v + rng.gauss(0, 1.5)
            stride = v / (cad / 60) * 100
            seq += 1
            v_obs = v * (1 + rng.gauss(0, 0.02)) if course is not None else v   # GPS speed jitter
            rows.append((aid, seq, start_utc.replace(tzinfo=dt.timezone.utc) + dt.timedelta(seconds=elapsed),
                         elapsed, dist, round(hr_obs), v_obs, cad, elev, 1.55 * TRUTH["weight_kg_start"] * v * 1.0,
                         lat, lon, stride, 8.6 - 0.25 * v + rng.gauss(0, 0.2), 300 - 19 * v + rng.gauss(0, 4),
                         v_obs / hill, (t_air if not s.indoor else 22.0) + 3.5))
            if s.workout is None and dist >= auto_lap_next:
                close_lap("INTERVAL", None)
                auto_lap_next += 1000
        if s.workout is not None:
            close_lap(seg.intensity, seg.step)
    if s.workout is None:
        close_lap("INTERVAL", None)

    # Training load (TRIMP) and bookkeeping for the model's state
    a, b = TRUTH["trimp_a"], TRUTH["trimp_b"]
    trimp = 0.0
    zones = [0.0] * 5
    for x in rows:
        hrr = min(max((x[5] - hr_rest) / (hr_max - hr_rest), 0.0), 1.0)
        trimp += SAMPLE_DT / 60 * hrr * a * math.exp(b * hrr)
        z = min(4, max(0, int((x[5] / hr_max - 0.5) / 0.1)))
        zones[z] += SAMPLE_DT
    r.daily_load[day] = r.daily_load.get(day, 0.0) + trimp
    thr_min = hard_s / 60
    r.threshold_min.append((day, thr_min))
    if dist / 1000 >= TRUTH["dec_long_run_min_km"]:
        r.long_runs.append((day, dist / 1000))

    hrs = [x[5] for x in rows]
    speeds = [x[6] for x in rows]
    avg_hr = sum(hrs) / len(hrs)
    te = min(5.0, 1.0 + trimp / 45)
    label = ("RECOVERY" if te < 2 else "BASE" if s.kind in ("easy", "long") else
             "TEMPO" if s.kind == "tempo" else "VO2MAX" if s.kind == "intervals" else "LACTATE_THRESHOLD")
    summary: dict[str, Any] = {
        "activityId": aid,
        "activityName": s.name,
        "activityType": {"typeKey": "treadmill_running" if s.indoor else "running"},
        "startTimeLocal": s.start_local.strftime("%Y-%m-%d %H:%M:%S"),
        "startTimeGMT": start_utc.strftime("%Y-%m-%d %H:%M:%S"),
        "locationName": None if course is None else ROUTES[s.route]["district"],
        "distance": round(dist, 1), "duration": round(elapsed, 1), "movingDuration": round(elapsed, 1),
        "elapsedDuration": round(elapsed, 1), "averageSpeed": round(dist / elapsed, 3),
        "avgGradeAdjustedSpeed": round(dist / elapsed, 3), "maxSpeed": round(max(speeds), 3),
        "averageHR": round(avg_hr), "maxHR": round(max(hrs)),
        "averageRunningCadenceInStepsPerMinute": round(sum(x[7] for x in rows) / len(rows), 1),
        "elevationGain": climb([x[8] for x in rows])[0] if course else 0.0,
        "elevationLoss": climb([x[8] for x in rows])[1] if course else 0.0,
        "calories": round(1.0 * TRUTH["weight_kg_start"] * dist / 1000), "steps": round(sum(x[7] for x in rows) * SAMPLE_DT / 60),
        "activityTrainingLoad": round(trimp * 1.12 * rng.uniform(0.92, 1.08), 1),
        "aerobicTrainingEffect": round(te, 1), "anaerobicTrainingEffect": round(min(4.0, 0.3 + (thr_min / 12)), 1),
        "trainingEffectLabel": label,
        "avgStrideLength": round(sum(x[12] for x in rows) / len(rows), 1),
        "avgVerticalOscillation": round(sum(x[13] for x in rows) / len(rows), 2),
        "avgGroundContactTime": round(sum(x[14] for x in rows) / len(rows), 1),
        "avgPower": round(sum(x[9] for x in rows) / len(rows)),
        **{f"hrTimeInZone_{i + 1}": zones[i] for i in range(5)},
        "lapCount": len(laps),
        "minTemperature": round(min(x[16] for x in rows), 1), "maxTemperature": round(max(x[16] for x in rows), 1),
    }
    if not s.indoor:
        summary["startLatitude"], summary["startLongitude"] = rows[0][10], rows[0][11]
        summary["vO2MaxValue"] = round(vo2 + TRUTH["garmin_vo2_bias"])
    if s.workout is not None:
        summary["workoutId"] = s.workout["workoutId"]
    return {"summary": summary, "rows": rows, "laps": laps, "weather": (t_air, rh), "race": race_info,
            "state": {"vo2": vo2, "f": f, "econ": econ, "dec": dec, "wbgt": w}}


def simulate_strength(rng: random.Random, r: Runner, s: Session, aid: int) -> dict[str, Any]:
    day = s.start_local.date()
    r.advance_to(day)
    hr_rest = r.resting_hr(day)
    avg_hr = 100 + rng.uniform(-6, 8)
    hrr = (avg_hr - hr_rest) / (TRUTH["hr_max"] - hr_rest)
    trimp = s.duration_s / 60 * hrr * TRUTH["trimp_a"] * math.exp(TRUTH["trimp_b"] * hrr)
    r.daily_load[day] = r.daily_load.get(day, 0.0) + trimp
    r.strength_days.append(day)
    start_utc = s.start_local - TZ_OFFSET
    return {"summary": {
        "activityId": aid, "activityName": "Strength", "activityType": {"typeKey": "strength_training"},
        "startTimeLocal": s.start_local.strftime("%Y-%m-%d %H:%M:%S"), "startTimeGMT": start_utc.strftime("%Y-%m-%d %H:%M:%S"),
        "distance": 0.0, "duration": float(s.duration_s), "movingDuration": float(s.duration_s) * 0.6,
        "elapsedDuration": float(s.duration_s), "averageHR": round(avg_hr), "maxHR": round(avg_hr + 30),
        "calories": round(s.duration_s / 60 * 6), "activityTrainingLoad": round(trimp * 1.1, 1),
        "aerobicTrainingEffect": 1.2, "anaerobicTrainingEffect": 1.8, "trainingEffectLabel": "RECOVERY",
        "hrTimeInZone_1": s.duration_s * 0.6, "hrTimeInZone_2": s.duration_s * 0.3, "hrTimeInZone_3": s.duration_s * 0.1,
    }}


# ---------------------------------------------------------------------------------- writing
def _db_url(name: str) -> str:
    return re.sub(r"/[^/?]+(\?|$)", f"/{name}\\1", os.environ["DATABASE_URL"], count=1)


def _psql(db: str, sql: str) -> None:
    subprocess.run(["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", db], input=sql, text=True, check=True,
                   stdout=subprocess.DEVNULL)


def create_database(db: str) -> None:
    """(Re)create the database with the same owner, schemas and read grants as setup_local_db.sh.
    Uses the local Postgres superuser (psql/createdb on PATH), like that script."""
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", db) or db == "garmin":
        raise SystemExit(f"refusing to (re)create database {db!r}: use a lowercase name other than 'garmin'")
    subprocess.run(["dropdb", "--if-exists", "--force", db], check=True)
    subprocess.run(["createdb", "-O", "garmin_sync", db], check=True)
    _psql(db, f"""
create schema if not exists raw authorization garmin_sync;
create schema if not exists garmin authorization garmin_sync;
create schema if not exists app authorization garmin_sync;
revoke all on database {db} from public;
grant connect on database {db} to anfra_reader;
grant usage on schema garmin, app to anfra_reader;
alter default privileges for role garmin_sync in schema app grant select on tables to anfra_reader;
alter default privileges for role garmin_sync in schema garmin grant select on tables to anfra_reader;
""")


def generate(db: str = "garmin_demo", seed: int = 7, weeks: int = 104, goal_weeks: int = 13,
             next_race_days: int | None = None, goal_time_s: int | None = None) -> dict[str, Any]:
    t0 = time.time()
    rng = random.Random(seed)
    today = dt.date.today()
    start = today - dt.timedelta(days=today.weekday()) - dt.timedelta(weeks=weeks)
    races = [
        RaceDef(18, 10.0, "Riverside 10K", "B"),
        RaceDef(36, 21.0975, "Delta Half Marathon", "A"),
        RaceDef(62, 10.0, "Night Run 10K", "B"),
        RaceDef(84, 21.0975, "Coastal Half Marathon", "A"),
        RaceDef(95, 10.0, "Sunday 10K", "C", marked=False),
    ]
    sessions, illness = build_sessions(rng, start, today, races)
    runner = Runner(rng, start)
    runner.illness = illness

    create_database(db)
    url = _db_url(db)
    with psycopg.connect(url) as conn:
        apply_sql(conn)
        conn.execute("insert into raw.sync_state (key, value) values ('demo_database', '1'), ('activities_full_listed', '1')")

        activities, docs, race_rows = [], [], []
        race_truth: list[dict[str, Any]] = []
        lt_entries: list[dict[str, Any]] = []
        last_lt_date: dt.date | None = None
        n_samples = 0
        for i, s in enumerate(sessions):
            aid = ID_BASE + i + 1
            if s.kind == "strength":
                out = simulate_strength(rng, runner, s, aid)
                activities.append((aid, out["summary"]))
                continue
            out = simulate_run(rng, runner, s, aid)
            out_rows = out["rows"]
            docs.append((aid, "splits", {"activityId": aid, "lapDTOs": out["laps"]}))
            if s.workout is not None:
                docs.append((aid, "workout", s.workout))
            if not s.indoor:
                docs.append((aid, "open_meteo", open_meteo_doc(rng, s, out["summary"], *out["weather"])))
            if out["race"] is not None:
                rd: RaceDef = s.race["def"]
                if rd.marked:
                    race_rows.append((aid, s.start_local.date(), f"{rd.name} {s.start_local.year}", rd.distance_km,
                                      round(out["summary"]["duration"] - rng.uniform(3, 15)), rd.priority))
                    race_truth.append({"name": race_rows[-1][2], "date": race_rows[-1][1].isoformat(),
                                       "distance_km": rd.distance_km, "official_time_s": race_rows[-1][4],
                                       "true_vdot": round(out["race"]["vdot"], 2), "wbgt_c": round(out["race"]["wbgt"], 1),
                                       "true_vo2max": round(out["state"]["vo2"], 2), "true_fraction": round(out["state"]["f"], 3),
                                       "true_economy": round(out["state"]["econ"], 3),
                                       "true_decoupling_pct": round(out["state"]["dec"], 2)})
            # Garmin updates its threshold estimate after some hard sessions
            day = s.start_local.date()
            if s.kind in ("tempo", "intervals", "race") and (last_lt_date is None or (day - last_lt_date).days >= 18):
                st = out["state"]
                # Garmin estimates it from the session itself, so in that session's heat
                v_lt = speed_for_cost(st["f"] * st["vo2"] * st["econ"]) * heat_factor(st["wbgt"])
                lthr = round(TRUTH["hr_max"] * (0.64 * st["f"] + 0.37))
                lt_entries.append({"date": day, "speed": v_lt / 10, "hr": lthr, "power": round(1.55 * 55 * v_lt * 1.25)})
                last_lt_date = day
            with conn.cursor() as cur:
                cur.execute("insert into raw.activity (activity_id, start_time_gmt, summary) values (%s, %s, %s)",
                            (aid, (s.start_local - TZ_OFFSET).replace(tzinfo=dt.timezone.utc), Jsonb(out["summary"])))
                with cur.copy(
                    """copy garmin.activity_sample (activity_id, seq, sample_time, elapsed_s, distance_m, heart_rate,
                         speed_mps, cadence_spm, elevation_m, power_w, latitude, longitude, stride_length_cm,
                         vertical_osc_cm, ground_contact_ms, grade_adj_speed_mps, temperature_c) from stdin"""
                ) as cp:
                    for row in out_rows:
                        cp.write_row(row)
            n_samples += len(out_rows)
        with conn.cursor() as cur:
            for aid, summary in activities:  # strength sessions (runs went in with their samples)
                start_gmt = dt.datetime.strptime(summary["startTimeGMT"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
                cur.execute("insert into raw.activity (activity_id, start_time_gmt, summary) values (%s, %s, %s)",
                            (aid, start_gmt, Jsonb(summary)))
            cur.executemany("insert into raw.activity_doc (activity_id, kind, payload) values (%s, %s, %s)",
                            [(a, k, Jsonb(p)) for a, k, p in docs])
            cur.executemany(
                """insert into app.race (activity_id, race_date, name, distance_km, official_time_s, priority)
                   values (%s, %s, %s, %s, %s, %s)""", race_rows)

            # Upcoming goal marathon, goal_weeks out on a Sunday (13 by default; a dawn race: WBGT about
            # 25.5 °C), with a goal 3-8 minutes under what today's fitness predicts: the planner has to
            # find the gap.
            runner.advance_to(today)
            race_day = today + dt.timedelta(days=(6 - today.weekday()) % 7 + 7 * goal_weeks)
            race_wbgt = 25.5
            pred = daniels_time(runner.vo2() * runner.economy(today) * (runner.fraction(today) / 0.82) ** 0.3, 42195)
            pred = pred / heat_factor(race_wbgt) * (1 + runner.decoupling(today) / 100 * 0.4 * 2)
            goal = goal_time_s or math.floor((pred - 180) / 300) * 300 - 1  # e.g. 3:29:59
            cur.execute("""insert into app.race (race_date, name, distance_km, goal_time_s, priority, notes)
                           values (%s, %s, 42.195, %s, 'A', 'Goal race')""",
                        (race_day, f"Harbour City Marathon {race_day.year}", goal))
            # Optionally a 10K soon (the demo video's "race next week"), with no goal time: Ran names the target.
            if next_race_days:
                cur.execute("""insert into app.race (race_date, name, distance_km, priority, notes)
                               values (%s, %s, 10, 'B', 'Next week')""",
                            (today + dt.timedelta(days=next_race_days + (6 - (today.weekday() + next_race_days) % 7) % 7),
                             f"Riverside 10K {today.year}"))   # the first Sunday at least that far out

            daily_docs(cur, rng, runner, start, today)
            single_docs(cur, rng, runner, start, today, lt_entries)
            body_composition(cur, rng, start, today)
            truth = {**TRUTH, "seed": seed, "generated_on": today.isoformat(), "history_start": start.isoformat(),
                     "goal_race": {"date": race_day.isoformat(), "goal_time_s": goal, "assumed_wbgt_c": race_wbgt,
                                   "prediction_from_today_s": round(pred)},
                     "races": race_truth,
                     "race_time_model": "daniels_time(vo2max*economy*(fraction/0.82)^0.3, d) / heat_factor(wbgt)"
                                        " * (1 + decoupling%/100*0.4*d/21.0975 for d >= 21 km) * N(1, 1%)",
                     "unmarked_race": "Sunday 10K in week 95 (left unmarked so the app suggests it)"}
            cur.execute("insert into raw.doc (key, payload) values ('demo_truth', %s)", (Jsonb(truth),))
            cur.execute("""insert into raw.sync_run (started_at, finished_at, status, trigger, new_activities, days_synced, message)
                           values (now() - interval '1 minute', now(), 'ok', 'demo', %s, %s, 'Synthetic runner generated')""",
                        (len(sessions), (today - start).days + 1))
        conn.commit()
        from .markers import sync_best_efforts
        from .model import fit_safely
        from .sync import DERIVED_VIEWS
        for name in DERIVED_VIEWS:
            conn.execute(f"refresh materialized view {name}")
        conn.commit()
        # What a sync would compute after its refresh: best efforts, then the model fit.
        sync_best_efforts(conn, lambda _msg: None)
        fit_safely(conn, lambda _msg: None)
        counts = {t: conn.execute(f"select count(*) from {t}").fetchone()[0] for t in
                  ("raw.activity", "raw.activity_doc", "garmin.activity_sample", "raw.daily", "raw.doc",
                   "raw.body_composition", "app.race", "app.weigh_in")}
    return {"database": db, "seconds": round(time.time() - t0, 1), "sessions": len(sessions), "samples": n_samples,
            "counts": counts}


def open_meteo_doc(rng: random.Random, s: Session, summary: dict[str, Any], t_air: float, rh: float) -> dict[str, Any]:
    start = dt.datetime.strptime(summary["startTimeGMT"], "%Y-%m-%d %H:%M:%S")
    end = start + dt.timedelta(seconds=summary["elapsedDuration"])
    hours = []
    h = start.replace(minute=0, second=0)
    while h <= end:
        hours.append(h)
        h += dt.timedelta(hours=1)
    temps = [round(t_air + 0.5 * i + rng.gauss(0, 0.2), 1) for i in range(len(hours))]
    rhs = [round(max(35, rh - 2 * i + rng.gauss(0, 1)), 0) for i in range(len(hours))]
    dews = [round(t - (100 - r_) / 5, 1) for t, r_ in zip(temps, rhs)]
    return {
        "source": "open-meteo-archive", "final": True, "latitude": round(summary["startLatitude"], 2),
        "longitude": round(summary["startLongitude"], 2), "elevation": 6.0,
        "units": {"time": "iso8601", "temperature_2m": "°C", "relative_humidity_2m": "%", "dew_point_2m": "°C",
                  "apparent_temperature": "°C", "wind_speed_10m": "km/h", "shortwave_radiation": "W/m²", "precipitation": "mm"},
        "hourly": {
            "time": [x.strftime("%Y-%m-%dT%H:%M") for x in hours],
            "temperature_2m": temps, "relative_humidity_2m": rhs, "dew_point_2m": dews,
            "apparent_temperature": [round(t + 3, 1) for t in temps],
            "wind_speed_10m": [round(rng.uniform(3, 12), 1) for _ in hours],
            "shortwave_radiation": [0.0 if x.hour + 7 < 6 or x.hour + 7 > 18 else round(rng.uniform(50, 500)) for x in hours],
            "precipitation": [0.0 for _ in hours],
        },
    }


def daily_docs(cur, rng: random.Random, r: Runner, start: dt.date, today: dt.date) -> None:
    rows = []
    # The colds that kept the runner from running: resting HR up from the day before, for a week
    illness_bump: dict[dt.date, float] = {}
    for d0 in sorted(r.illness):
        if d0 - dt.timedelta(days=1) not in r.illness:
            for i, bump in enumerate((5, 8, 9, 8, 6, 4, 2)):
                illness_bump[d0 + dt.timedelta(days=i - 1)] = bump
    d = start
    hrv_week: list[float] = []
    while d <= today:
        fit, fat = r.state_on(d)
        rhr = round(r.resting_hr(d) + illness_bump.get(d, 0))
        stress = fat - fit
        steps = int(rng.gauss(9000, 2500) + 1000 * (r.daily_load.get(d, 0) > 0))
        hrv = max(25.0, 62 - 0.15 * stress - 1.2 * illness_bump.get(d, 0) + rng.gauss(0, 6))
        hrv_week = (hrv_week + [hrv])[-7:]
        sleep = max(4.5, rng.gauss(7.1, 0.7)) * 3600
        rows.append((d, "user_summary", {
            "calendarDate": d.isoformat(), "restingHeartRate": rhr, "totalSteps": max(steps, 1500),
            "averageStressLevel": max(10, round(28 + 0.2 * stress + rng.gauss(0, 6))),
            "bodyBatteryHighestValue": min(100, round(85 - 0.3 * stress + rng.gauss(0, 7))),
            "bodyBatteryLowestValue": max(5, round(20 + rng.gauss(0, 6))),
            "totalKilocalories": round(1750 + r.daily_load.get(d, 0) * 4 + rng.gauss(0, 80)),
            "activeKilocalories": round(250 + r.daily_load.get(d, 0) * 4 + rng.gauss(0, 60)),
            "moderateIntensityMinutes": max(0, round(r.daily_load.get(d, 0) * 0.3 + rng.gauss(10, 8))),
            "vigorousIntensityMinutes": max(0, round(r.daily_load.get(d, 0) * 0.2)),
        }))
        rows.append((d, "sleep", {"dailySleepDTO": {
            "calendarDate": d.isoformat(), "sleepTimeSeconds": round(sleep), "deepSleepSeconds": round(sleep * 0.18),
            "lightSleepSeconds": round(sleep * 0.55), "remSleepSeconds": round(sleep * 0.22),
            "awakeSleepSeconds": round(rng.uniform(300, 1800)),
            "sleepScores": {"overall": {"value": max(40, min(98, round(60 + (sleep / 3600 - 6) * 12 + rng.gauss(0, 6))))}}}}))
        rows.append((d, "hrv", {"hrvSummary": {
            "calendarDate": d.isoformat(), "lastNightAvg": round(hrv), "weeklyAvg": round(sum(hrv_week) / len(hrv_week)),
            "status": "BALANCED" if hrv > 50 else "UNBALANCED" if hrv > 40 else "LOW"}}))
        d += dt.timedelta(days=1)
    cur.executemany("insert into raw.daily (calendar_date, kind, payload) values (%s, %s, %s)",
                    [(a, b, Jsonb(c)) for a, b, c in rows])


def single_docs(cur, rng: random.Random, r: Runner, start: dt.date, today: dt.date, lt: list[dict[str, Any]]) -> None:
    hr_max = TRUTH["hr_max"]
    lthr = lt[-1]["hr"] if lt else round(hr_max * 0.9)
    zones = {f"zone{i}Floor": round(hr_max * p) for i, p in zip(range(1, 6), (0.5, 0.6, 0.7, 0.8, 0.9))}
    docs: dict[str, Any] = {
        "hr_zones_config": [
            {"sport": "DEFAULT", "trainingMethod": "HR_MAX_BASED", "maxHeartRateUsed": hr_max,
             "restingHeartRateUsed": TRUTH["hr_rest_base"], "lactateThresholdHeartRateUsed": lthr, **zones},
            {"sport": "RUNNING", "trainingMethod": "HR_MAX_BASED", "maxHeartRateUsed": hr_max,
             "restingHeartRateUsed": TRUTH["hr_rest_base"], "lactateThresholdHeartRateUsed": lthr, **zones},
        ],
        "user_profile": {"id": 1, "userData": {"gender": TRUTH["sex"], "weight": TRUTH["weight_kg_end"] * 1000,
                                               "height": 162.0, "measurementSystem": "metric"}, "sourceType": "DEMO"},
    }
    # Threshold history, per calendar year, as Garmin's range endpoint returns it
    by_year: dict[int, dict[str, list]] = {}
    for e in lt:
        y = by_year.setdefault(e["date"].year, {"power": [], "speed": [], "heart_rate": []})
        for series, value in (("power", e["power"]), ("speed", e["speed"]), ("heart_rate", e["hr"])):
            y[series].append({"from": e["date"].isoformat(), "until": e["date"].isoformat(), "value": value,
                              "series": "running", "updatedDate": e["date"].isoformat()})
    for year, payload in by_year.items():
        docs[f"lactate_threshold:{year}"] = payload
    if lt:
        last = lt[-1]
        docs["lactate_threshold_latest"] = {
            "speed_and_heart_rate": {"speed": last["speed"], "heartRate": last["hr"],
                                     "calendarDate": f"{last['date'].isoformat()}T19:00:00.0"},
            "power": {"functionalThresholdPower": last["power"], "calendarDate": f"{last['date'].isoformat()}T19:00:00.0",
                      "weight": TRUTH["weight_kg_end"]},
        }
    # Garmin race predictions: Daniels times from Garmin's (optimistic, heat-blind) VO2max, daily
    preds: dict[int, list] = {}
    d = start + dt.timedelta(days=21)
    latest = None
    while d <= today:
        v = r.vo2(d) + TRUTH["garmin_vo2_bias"]
        p = {"userId": 1, "calendarDate": d.isoformat(), "fromCalendarDate": d.isoformat(), "toCalendarDate": d.isoformat(),
             **{k: round(daniels_time(v, m)) for k, m in (("time5K", 5000), ("time10K", 10000),
                                                           ("timeHalfMarathon", 21097.5), ("timeMarathon", 42195))}}
        preds.setdefault(d.year, []).append(p)
        latest = p
        d += dt.timedelta(days=1)
    for year, payload in preds.items():
        docs[f"race_predictions:{year}"] = payload
    if latest:
        docs["race_predictions_latest"] = latest
    cur.executemany("insert into raw.doc (key, payload) values (%s, %s)", [(k, Jsonb(v)) for k, v in docs.items()])


def body_composition(cur, rng: random.Random, start: dt.date, today: dt.date) -> None:
    n_days = (today - start).days
    rows, d, i = [], start + dt.timedelta(days=3), 0
    while d <= today - dt.timedelta(days=10):
        x = (d - start).days / n_days
        kg = TRUTH["weight_kg_start"] + (TRUTH["weight_kg_end"] - TRUTH["weight_kg_start"]) * x + rng.gauss(0, 0.3)
        ts = dt.datetime.combine(d, dt.time(6, 30)) - TZ_OFFSET
        i += 1
        rows.append((f"demo-{i}", {"timestampGMT": int(ts.replace(tzinfo=dt.timezone.utc).timestamp() * 1000),
                                   "calendarDate": d.isoformat(), "weight": round(kg * 1000), "bmi": round(kg / 1.62 ** 2, 1),
                                   "bodyFat": round(23 - 2 * x + rng.gauss(0, 0.6), 1), "muscleMass": round(kg * 0.42 * 1000),
                                   "sourceType": "INDEX_SCALE"}))
        d += dt.timedelta(days=rng.randint(14, 28))
    cur.executemany("insert into raw.body_composition (sample_pk, payload) values (%s, %s)",
                    [(k, Jsonb(v)) for k, v in rows])
    for back in (6, 1):  # two recent weigh-ins entered in the app
        cur.execute("insert into app.weigh_in (measured_on, weight_kg) values (%s, %s)",
                    (today - dt.timedelta(days=back), round(TRUTH["weight_kg_end"] + rng.gauss(0, 0.2), 1)))
