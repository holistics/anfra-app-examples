# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "duckdb==1.4.2",
#   "numpy>=1.26,<3",
# ]
# ///
"""
Generate synthetic data for the "Leave now or wait?" app (Ho Chi Minh City flooding).

Design rule: tables hold ONLY raw facts — what sensors, maps and trip meters would
record. No derived values (flood risk, delay, cost of flooding). Those become
governed metrics later. The one job of this script is to lay down a *causal chain*
so the raw facts are correlated the way the real city is:

    storm cells drift across neighbouring districts and build up over 2-3 hours
        -> weather_hourly.rainfall_mm
    recent rain (last 3h) minus a segment's drainage, plus tide backflow for low,
    near-river segments (worst in the southern low-lying districts)
        -> segment_readings.water_depth_cm
    deeper water on a route's segments at departure time
        -> trips.travel_minutes

Everything is seeded, so re-running reproduces the same database.
Run with:  uv run scripts/generate_data.py
"""

from __future__ import annotations

import datetime as dt
import math
import shutil
import tempfile
from pathlib import Path

import duckdb
import numpy as np

SEED = 42
rng = np.random.default_rng(SEED)

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "flood.duckdb"

# --- Time grid: 30 October-2026 evenings, hourly 15:00..23:00 inclusive --------
DATES = [dt.date(2026, 10, d) for d in range(1, 31)]  # Oct 1..30 -> 30 evenings
HOURS = list(range(15, 24))                            # 15,16,...,23  (9 hours)
RUSH = range(17, 20)                                   # 17:00-19:00 rush window


def ts(date: dt.date, hour: int) -> dt.datetime:
    return dt.datetime(date.year, date.month, date.day, hour)


# --- Districts -----------------------------------------------------------------
# tile_(row,col): a coarse 3x4 map grid. row grows going south; the southern row
# is the low-lying, flood-prone belt. `severity` (0..1, not stored) is a lowland
# score that biases each district's segment elevation, drainage and river access.
# Binh Thanh sits in the central row but hugs the Saigon river, so it scores high.
DISTRICTS = [
    # name,          tile_row, tile_col, severity
    ("District 12",  0, 0, 0.35),
    ("Go Vap",       0, 1, 0.30),
    ("Tan Binh",     0, 2, 0.40),
    ("Thu Duc",      0, 3, 0.35),
    ("Binh Tan",     1, 0, 0.45),
    ("Phu Nhuan",    1, 1, 0.30),
    ("Binh Thanh",   1, 2, 0.75),
    ("District 1",   1, 3, 0.50),
    ("District 8",   2, 0, 0.85),
    ("District 4",   2, 1, 0.70),
    ("District 7",   2, 2, 0.95),
    ("Nha Be",       2, 3, 1.00),
]

districts = []        # rows for the table
dist_tile = {}        # id -> (row, col)
dist_sev = {}         # id -> severity
dist_name = {}        # id -> name
for i, (name, row, col, sev) in enumerate(DISTRICTS, start=1):
    districts.append((i, name, row, col))
    dist_tile[i] = (row, col)
    dist_sev[i] = sev
    dist_name[i] = name

DISTRICT_IDS = [d[0] for d in districts]
CENTRAL = {"District 1", "Binh Thanh", "Phu Nhuan"}  # heavier traffic

# --- Road segments -------------------------------------------------------------
STREETS = [
    "Nguyen Hue", "Le Loi", "Dien Bien Phu", "Nguyen Thi Minh Khai", "Vo Van Kiet",
    "Nguyen Huu Canh", "Pham Van Dong", "Xo Viet Nghe Tinh", "Truong Sa", "Hoang Sa",
    "Nguyen Van Linh", "Huynh Tan Phat", "Le Van Luong", "Nguyen Huu Tho",
    "Cach Mang Thang Tam", "Ba Thang Hai", "Ly Thuong Kiet", "Hong Bang",
    "An Duong Vuong", "Kinh Duong Vuong", "Quang Trung", "Phan Van Tri",
    "Le Quang Dinh", "Ung Van Khiem", "Dinh Bo Linh", "Nguyen Xi", "Quoc Huong",
    "Mai Chi Tho", "Do Xuan Hop", "Le Van Viet",
]

road_segments = []                 # rows for the table
seg_of_district: dict[int, list[int]] = {d: [] for d in DISTRICT_IDS}
seg_district: dict[int, int] = {}
seg_elev: dict[int, float] = {}
seg_drain: dict[int, float] = {}
seg_river: dict[int, bool] = {}
seg_traffic: dict[int, int] = {}
seg_len: dict[int, float] = {}

seg_id = 0
for did in DISTRICT_IDS:
    sev = dist_sev[did]
    n_seg = int(rng.integers(10, 16))  # 10..15 per district
    streets = list(rng.choice(STREETS, size=n_seg, replace=False))
    for k in range(n_seg):
        seg_id += 1
        # Low-lying (high severity) -> lower elevation, weaker drainage, more river.
        elevation = float(np.clip(9.0 * (1 - sev) + 1.0 + rng.normal(0, 1.2), 0.3, 14.0))
        drainage = float(np.clip(20.0 + 35.0 * (1 - sev) + rng.normal(0, 6.0), 8.0, 70.0))
        near_river = bool(rng.random() < min(0.9, 0.15 + 0.75 * sev))
        length_km = float(np.round(rng.uniform(0.3, 3.0), 2))
        base_traffic = rng.uniform(300, 4000)
        if dist_name[did] in CENTRAL:
            base_traffic = min(5000, base_traffic * 1.3)
        traffic = int(round(base_traffic))
        name = f"{streets[k]}"

        road_segments.append(
            (seg_id, did, name, length_km, round(elevation, 2),
             round(drainage, 2), near_river, traffic)
        )
        seg_of_district[did].append(seg_id)
        seg_district[seg_id] = did
        seg_elev[seg_id] = elevation
        seg_drain[seg_id] = drainage
        seg_river[seg_id] = near_river
        seg_traffic[seg_id] = traffic
        seg_len[seg_id] = length_km

# --- Weather: storm cells drifting across neighbouring tiles --------------------
# rainfall[(district_id, ts)] = mm. Each evening gets a regime (dry/light/heavy);
# storms are cells with a position that drifts one tile-step per hour along a fixed
# heading, an intensity that ramps up over 2-3 hours then decays, and a Gaussian
# spatial footprint, so neighbouring districts share the storm and totals build up.
rainfall: dict[tuple[int, dt.datetime], float] = {}

TILE_POS = {did: np.array(dist_tile[did], dtype=float) for did in DISTRICT_IDS}


def temporal_profile(local_h: int, ramp: int, decay: int) -> float:
    """Intensity multiplier at `local_h` hours after a cell starts (ramp then decay)."""
    if local_h < 0:
        return 0.0
    if local_h < ramp:                      # build up to the peak
        return (local_h + 1) / ramp
    if local_h < ramp + decay:              # decay after the peak
        return max(0.0, 1.0 - (local_h - ramp + 1) / (decay + 1))
    return 0.0


for date in DATES:
    r = rng.random()
    if r < 0.30:
        regime = "dry"
        n_cells = 0
    elif r < 0.70:
        regime = "light"
        n_cells = int(rng.integers(1, 3))   # 1..2
    else:
        regime = "heavy"
        n_cells = int(rng.integers(2, 4))   # 2..3

    cells = []
    for _ in range(n_cells):
        origin = TILE_POS[int(rng.choice(DISTRICT_IDS))].copy()
        start_h = int(rng.integers(15, 21))             # starts 15:00..20:00
        ramp = int(rng.choice([2, 3]))                  # build over 2-3 hours
        decay = int(rng.choice([2, 3]))
        heading = rng.normal(0, 1, size=2)              # drift direction (tiles/hr)
        if regime == "light":
            peak = float(rng.uniform(4, 12))
        else:
            peak = float(rng.uniform(15, 45))
        spread = float(rng.uniform(0.9, 1.4))           # footprint radius in tiles
        cells.append((origin, start_h, ramp, decay, heading, peak, spread))

    for h in HOURS:
        t = ts(date, h)
        for did in DISTRICT_IDS:
            pos = TILE_POS[did]
            total = 0.0
            for origin, start_h, ramp, decay, heading, peak, spread in cells:
                local_h = h - start_h
                tp = temporal_profile(local_h, ramp, decay)
                if tp <= 0:
                    continue
                center = origin + heading * max(0, local_h)   # cell drifts each hour
                d2 = float(np.sum((pos - center) ** 2))
                spatial = math.exp(-d2 / (2 * spread ** 2))
                total += peak * tp * spatial
            # small background noise; a touch of drizzle even on light evenings
            total += abs(rng.normal(0, 0.25))
            rainfall[(did, t)] = round(max(0.0, total), 1)

# --- Tide: one citywide mixed-semidiurnal series (~12.42h cycle) ----------------
# Computed from absolute time, so the clock-time of the high tide drifts day to day;
# on some evenings a high lands right in the rush-hour window. Generated for the full
# 24 hours of each evening's day so the day's true high-tide hour is recorded (not
# clipped to the 15:00-23:00 window), while depth only ever reads the evening hours.
tide: dict[dt.datetime, float] = {}
EPOCH = dt.datetime(2026, 10, 1, 0, 0)
PHI1 = float(rng.uniform(0, 2 * math.pi))
PHI2 = float(rng.uniform(0, 2 * math.pi))
for date in DATES:
    for h in range(24):
        t = ts(date, h)
        H = (t - EPOCH).total_seconds() / 3600.0
        level = (
            0.90 * math.sin(2 * math.pi * H / 12.42 + PHI1)      # semidiurnal
            + 0.35 * math.sin(2 * math.pi * H / 24.84 + PHI2)    # diurnal inequality
            + rng.normal(0, 0.03)
        )
        tide[t] = round(level, 3)

# --- Segment water depth: the causal core --------------------------------------
# depth = thin sheet-flow film proportional to recent rain (so rain registers even
#         on well-drained roads), plus pooling runoff once recent rain beats the
#         segment's drainage, damped by elevation, plus tide backflow for low
#         near-river segments, plus a little sensor noise.
RUNOFF_CM_PER_MM = 0.40     # cm of pooled water per net mm of rain (past drainage)
SHEET_CM_PER_MM = 0.02      # cm of surface film per mm of recent rain (always)
DRAIN_HOURS = 1.5           # how many hours of drainage offset the 3h accumulation
TIDE_CM_PER_M = 18.0        # cm of backflow per m of tide above threshold
TIDE_THRESHOLD_M = 0.5
segment_readings = []
depth_at: dict[tuple[int, dt.datetime], float] = {}

# per (district, date) hourly rainfall series for the 3-hour window lookup
for seg in range(1, seg_id + 1):
    did = seg_district[seg]
    elev = seg_elev[seg]
    drain = seg_drain[seg]
    river = seg_river[seg]
    elev_factor = float(np.clip(1.30 - 0.12 * elev, 0.20, 1.30))  # low -> pools more
    for date in DATES:
        for h in HOURS:
            t = ts(date, h)
            rain_3h = sum(
                rainfall.get((did, ts(date, hh)), 0.0)
                for hh in (h, h - 1, h - 2) if hh in HOURS
            )
            net_mm = rain_3h - drain * DRAIN_HOURS
            pool_depth = max(0.0, net_mm) * RUNOFF_CM_PER_MM * elev_factor
            sheet_depth = rain_3h * SHEET_CM_PER_MM * elev_factor
            rain_depth = pool_depth + sheet_depth

            tide_extra = 0.0
            if river and elev < 3.0:
                over = max(0.0, tide[t] - TIDE_THRESHOLD_M)
                tide_extra = over * TIDE_CM_PER_M * ((3.0 - elev) / 3.0)

            depth = rain_depth + tide_extra + rng.normal(0, 0.5)
            depth = round(max(0.0, depth), 1)
            segment_readings.append((seg, t, depth))
            depth_at[(seg, t)] = depth

# --- Routes & route steps ------------------------------------------------------
# A few commuter pairs, all heading into the centre (District 1), 2-3 preset
# routes each, as ordered lists of segments through plausible in-between districts.
name_to_id = {dist_name[d]: d for d in DISTRICT_IDS}
PAIRS = [
    ("Nha Be", "District 1"),
    ("District 7", "District 1"),
    ("Thu Duc", "District 1"),
    ("Binh Tan", "District 1"),
]

routes = []
route_steps = []
route_segments: dict[int, list[int]] = {}
route_id = 0

for src_name, dst_name in PAIRS:
    src = name_to_id[src_name]
    dst = name_to_id[dst_name]
    src_pos = np.array(dist_tile[src], dtype=float)
    dst_pos = np.array(dist_tile[dst], dtype=float)
    mid = (src_pos + dst_pos) / 2.0
    # candidate in-between districts, nearest to the midpoint first
    betweens = sorted(
        (d for d in DISTRICT_IDS if d not in (src, dst)),
        key=lambda d: np.sum((np.array(dist_tile[d], dtype=float) - mid) ** 2),
    )
    n_routes = int(rng.integers(2, 4))  # 2..3 routes
    for rr in range(n_routes):
        route_id += 1
        inter = betweens[rr % len(betweens)]
        steps: list[int] = []
        steps += list(rng.choice(seg_of_district[src], size=2, replace=False))
        steps += list(rng.choice(seg_of_district[inter],
                                 size=int(rng.integers(1, 3)), replace=False))
        steps += list(rng.choice(seg_of_district[dst], size=2, replace=False))
        steps = [int(s) for s in steps]
        route_name = f"{src_name} -> {dst_name} via {dist_name[inter]} (opt {rr + 1})"
        routes.append((route_id, src, dst, route_name))
        for order, s in enumerate(steps, start=1):
            route_steps.append((route_id, order, s))
        route_segments[route_id] = steps

ALL_ROUTE_IDS = [r[0] for r in routes]

# --- Trips: travel time rises with water on the route at departure -------------
CITY_SPEED_KMH = 22.0
N_TRIPS = 400
trips = []
for tid in range(1, N_TRIPS + 1):
    rid = int(rng.choice(ALL_ROUTE_IDS))
    date = DATES[int(rng.integers(0, len(DATES)))]
    hour = int(rng.integers(15, 23))          # depart 15:00..22:00 (reading exists)
    depart = ts(date, hour)
    segs = route_segments[rid]

    length_km = sum(seg_len[s] for s in segs)
    base_min = length_km / CITY_SPEED_KMH * 60.0
    mean_traffic = np.mean([seg_traffic[s] for s in segs])
    traffic_factor = float(mean_traffic) / 4000.0 * 0.5     # up to ~+50%

    depths = [depth_at[(s, depart)] for s in segs]
    avg_depth = float(np.mean(depths))
    max_depth = float(np.max(depths))
    water_min = avg_depth * 1.0 + max_depth * 0.5          # water is a strong delay

    travel = base_min * (1 + traffic_factor) + water_min + rng.normal(0, 1.5)
    travel = round(max(base_min * 0.8, travel), 1)
    trips.append((tid, rid, depart, travel))

# --- Interventions (scenario facts, not computed outcomes) ---------------------
# Columns: id, name, type, cost_billion_vnd, drainage_boost_mm_per_hr,
#          tide_block_share (0-1), absorb_first_mm (retention capacity).
# Each type carries only the levers its own mechanism uses; the others are 0.
interventions = [
    (1, "Nhieu Loc-Thi Nghe tidal sluice",     "tidal sluice",    2800.0,  0.0, 0.70,  0.0),
    (2, "District 7 trunk drainage upgrade",    "drainage upgrade", 650.0, 28.0, 0.00,  0.0),
    (3, "Nha Be-District 7 tidal sluice gate",  "tidal sluice",    1500.0,  0.0, 0.80,  0.0),
    (4, "Binh Thanh retention pond",            "retention pond",   420.0,  0.0, 0.00, 30.0),
    (5, "Huynh Tan Phat road raising",          "raised road",      900.0,  0.0, 0.00,  0.0),
    (6, "District 8 canal drainage upgrade",    "drainage upgrade", 540.0, 22.0, 0.00,  0.0),
    (7, "Thu Thiem retention pond",             "retention pond",   380.0,  0.0, 0.00, 25.0),
    (8, "Nguyen Huu Canh road raising",         "raised road",      720.0,  0.0, 0.00,  0.0),
    (9, "District 7 secondary drainage upgrade","drainage upgrade", 430.0, 20.0, 0.00,  0.0),
]

# Which districts each sluice / drainage / retention targets (raised roads target
# segments instead, below). Names resolved to ids; surrogate id per row for AML PKs.
_interv_district_names = {
    1: ["Binh Thanh", "Phu Nhuan", "District 1", "Tan Binh"],
    2: ["District 7"],
    3: ["Nha Be", "District 7"],
    4: ["Binh Thanh"],
    6: ["District 8"],
    7: ["Thu Duc"],
    9: ["District 7"],
}
intervention_districts = []
_idid = 0
for iid, dnames in _interv_district_names.items():
    for dn in dnames:
        _idid += 1
        intervention_districts.append((_idid, iid, name_to_id[dn]))


def _lowest_near_river_segments(district_name: str, k: int) -> list[int]:
    """The k lowest, most river-exposed segments of a district (what a road-raising
    project would target first)."""
    did = name_to_id[district_name]
    ranked = sorted(
        seg_of_district[did],
        key=lambda s: (0 if seg_river[s] else 1, seg_elev[s]),
    )
    return ranked[:k]


# Which segments each raised-road project lifts out of flooding.
_interv_segment_targets = {
    5: _lowest_near_river_segments("District 7", 2) + _lowest_near_river_segments("Nha Be", 2),
    8: _lowest_near_river_segments("Binh Thanh", 3),
}
intervention_segments = []
_isid = 0
for iid, segs in _interv_segment_targets.items():
    for s in segs:
        _isid += 1
        intervention_segments.append((_isid, iid, int(s)))

# Downstream neighbour of each district = the district one tile to the south.
# A retention pond helps its own district and its downstream district.
pos_to_id = {dist_tile[d]: d for d in DISTRICT_IDS}
district_downstream = []
_ddid = 0
for d in DISTRICT_IDS:
    row, col = dist_tile[d]
    down = pos_to_id.get((row + 1, col))
    if down is not None:
        _ddid += 1
        district_downstream.append((_ddid, d, down))

# Annual stress rates, stored as facts (one row). Climate + subsidence.
RAIN_PCT_PER_YEAR = 1.5       # +1.5% rain intensity per year
TIDE_RISE_M_PER_YEAR = 0.01   # +1 cm sea level per year
SUBSIDENCE_M_PER_YEAR = 0.02  # -2 cm ground elevation per year (HCMC subsides fast)
climate_rates = [(1, RAIN_PCT_PER_YEAR, TIDE_RISE_M_PER_YEAR, SUBSIDENCE_M_PER_YEAR)]

# Per-horizon factors derived from the rates above (the filter target for the
# years_from_now what-if input, 0..15). Linear in years, for interpretability.
stress_horizons = []
for y in range(0, 16):
    stress_horizons.append((
        y,
        round(1.0 + RAIN_PCT_PER_YEAR / 100.0 * y, 4),   # rain_factor
        round(TIDE_RISE_M_PER_YEAR * y, 4),              # tide_add_m
        round(SUBSIDENCE_M_PER_YEAR * y, 4),             # subsidence_m
    ))

# Governance constants, defined exactly once in a one-row config table so every
# QueryModel and metric reads the same values: the flooded-depth threshold and the
# value of commuter time. Change them here (or UPDATE this row) for the dependency
# test and all derived metrics move together.
FLOOD_THRESHOLD_CM = 20.0
VALUE_OF_TIME_VND_PER_HOUR = 30000.0
# Each sample trip stands for this many real commuter-trips (the 400 trips are a
# tiny sample of the city's evening commute); scales delay cost and ROI to city size.
COMMUTER_SCALE = 150000.0
flood_config = [(1, FLOOD_THRESHOLD_CM, VALUE_OF_TIME_VND_PER_HOUR, COMMUTER_SCALE)]

# --- Write the DuckDB database -------------------------------------------------
# Build on local disk first, then publish the finished single file to data/.
# DuckDB's WAL does many tiny random writes; doing that straight onto a slow or
# network-backed folder (e.g. a OneDrive-synced dir, or a Docker bind mount) can be
# pathologically slow, whereas copying one finished file across is fast.
build_dir = tempfile.mkdtemp(prefix="flood_build_")
build_path = Path(build_dir) / "flood.duckdb"

con = duckdb.connect(str(build_path))
con.execute("""
CREATE TABLE districts (
    id INTEGER, name VARCHAR, tile_row INTEGER, tile_col INTEGER
);
CREATE TABLE road_segments (
    id INTEGER, district_id INTEGER, name VARCHAR, length_km DOUBLE,
    elevation_m DOUBLE, drainage_capacity_mm_per_hr DOUBLE,
    near_river BOOLEAN, traffic_volume_per_hr INTEGER
);
CREATE TABLE weather_hourly (
    id INTEGER, district_id INTEGER, ts TIMESTAMP, rainfall_mm DOUBLE
);
CREATE TABLE tide_hourly (
    ts TIMESTAMP, tide_level_m DOUBLE
);
CREATE TABLE segment_readings (
    id INTEGER, segment_id INTEGER, ts TIMESTAMP, water_depth_cm DOUBLE
);
CREATE TABLE routes (
    id INTEGER, from_district_id INTEGER, to_district_id INTEGER, name VARCHAR
);
CREATE TABLE route_steps (
    id INTEGER, route_id INTEGER, step_order INTEGER, segment_id INTEGER
);
CREATE TABLE trips (
    id INTEGER, route_id INTEGER, depart_ts TIMESTAMP, travel_minutes DOUBLE
);
CREATE TABLE interventions (
    id INTEGER, name VARCHAR, type VARCHAR, cost_billion_vnd DOUBLE,
    drainage_boost_mm_per_hr DOUBLE, tide_block_share DOUBLE, absorb_first_mm DOUBLE
);
CREATE TABLE intervention_districts (
    id INTEGER, intervention_id INTEGER, district_id INTEGER
);
CREATE TABLE intervention_segments (
    id INTEGER, intervention_id INTEGER, segment_id INTEGER
);
CREATE TABLE district_downstream (
    id INTEGER, district_id INTEGER, downstream_district_id INTEGER
);
CREATE TABLE climate_rates (
    id INTEGER, rain_intensity_pct_per_year DOUBLE,
    tide_rise_m_per_year DOUBLE, subsidence_m_per_year DOUBLE
);
CREATE TABLE stress_horizons (
    years_from_now INTEGER, rain_factor DOUBLE, tide_add_m DOUBLE, subsidence_m DOUBLE
);
CREATE TABLE flood_config (
    id INTEGER, threshold_cm DOUBLE, value_of_time_vnd_per_hour DOUBLE,
    commuter_scale DOUBLE
);
""")

weather_rows = [(i, did, t, mm) for i, ((did, t), mm) in enumerate(rainfall.items(), 1)]
tide_rows = [(t, lv) for t, lv in tide.items()]
segment_readings = [(i, seg, t, depth)
                    for i, (seg, t, depth) in enumerate(segment_readings, 1)]
route_steps = [(i, rid, o, s) for i, (rid, o, s) in enumerate(route_steps, 1)]


_NP = {
    "int": "int64", "float": "float64", "bool": "bool",
    "str": object, "ts": "datetime64[us]",
}


def bulk_insert(table: str, rows: list, spec: list[tuple[str, str]]) -> None:
    """Insert rows by registering a dict of NumPy column arrays, then INSERT ... SELECT.
    This is vectorised (~40k rows in milliseconds); row-by-row executemany is ~1000x
    slower here, so it is deliberately avoided. `spec` is [(column, kind), ...]."""
    if not rows:
        return
    cols = list(zip(*rows))
    staging = {
        name: np.array(col, dtype=_NP[kind])
        for (name, kind), col in zip(spec, cols)
    }
    con.register("_staging", staging)
    con.execute(f"INSERT INTO {table} SELECT * FROM _staging")
    con.unregister("_staging")


bulk_insert("districts", districts,
            [("id", "int"), ("name", "str"), ("tile_row", "int"), ("tile_col", "int")])
bulk_insert("road_segments", road_segments,
            [("id", "int"), ("district_id", "int"), ("name", "str"),
             ("length_km", "float"), ("elevation_m", "float"),
             ("drainage_capacity_mm_per_hr", "float"), ("near_river", "bool"),
             ("traffic_volume_per_hr", "int")])
bulk_insert("weather_hourly", weather_rows,
            [("id", "int"), ("district_id", "int"), ("ts", "ts"), ("rainfall_mm", "float")])
bulk_insert("tide_hourly", tide_rows, [("ts", "ts"), ("tide_level_m", "float")])
bulk_insert("segment_readings", segment_readings,
            [("id", "int"), ("segment_id", "int"), ("ts", "ts"), ("water_depth_cm", "float")])
bulk_insert("routes", routes,
            [("id", "int"), ("from_district_id", "int"),
             ("to_district_id", "int"), ("name", "str")])
bulk_insert("route_steps", route_steps,
            [("id", "int"), ("route_id", "int"), ("step_order", "int"), ("segment_id", "int")])
bulk_insert("trips", trips,
            [("id", "int"), ("route_id", "int"),
             ("depart_ts", "ts"), ("travel_minutes", "float")])
bulk_insert("interventions", interventions,
            [("id", "int"), ("name", "str"), ("type", "str"),
             ("cost_billion_vnd", "float"), ("drainage_boost_mm_per_hr", "float"),
             ("tide_block_share", "float"), ("absorb_first_mm", "float")])
bulk_insert("intervention_districts", intervention_districts,
            [("id", "int"), ("intervention_id", "int"), ("district_id", "int")])
bulk_insert("intervention_segments", intervention_segments,
            [("id", "int"), ("intervention_id", "int"), ("segment_id", "int")])
bulk_insert("district_downstream", district_downstream,
            [("id", "int"), ("district_id", "int"), ("downstream_district_id", "int")])
bulk_insert("climate_rates", climate_rates,
            [("id", "int"), ("rain_intensity_pct_per_year", "float"),
             ("tide_rise_m_per_year", "float"), ("subsidence_m_per_year", "float")])
bulk_insert("stress_horizons", stress_horizons,
            [("years_from_now", "int"), ("rain_factor", "float"),
             ("tide_add_m", "float"), ("subsidence_m", "float")])
bulk_insert("flood_config", flood_config,
            [("id", "int"), ("threshold_cm", "float"),
             ("value_of_time_vnd_per_hour", "float"), ("commuter_scale", "float")])

counts = []
for tbl in ("districts", "road_segments", "weather_hourly", "tide_hourly",
            "segment_readings", "routes", "route_steps", "trips", "interventions",
            "intervention_districts", "intervention_segments", "district_downstream",
            "climate_rates", "stress_horizons", "flood_config"):
    n = con.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
    counts.append((tbl, n))
con.close()  # checkpoints the WAL into the file and releases it

# Publish the finished database to data/flood.duckdb.
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
for leftover in (DB_PATH, DB_PATH.with_suffix(DB_PATH.suffix + ".wal")):
    if leftover.exists():
        leftover.unlink()
shutil.copyfile(build_path, DB_PATH)
shutil.rmtree(build_dir, ignore_errors=True)

print(f"Wrote {DB_PATH}")
for tbl, n in counts:
    print(f"  {tbl:<18} {n:>7,} rows")
