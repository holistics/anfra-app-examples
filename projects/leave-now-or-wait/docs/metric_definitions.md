# Metric definitions — "Leave now or wait?" (APPROVED 2026-10-17)

> STEP 0 deliverable, approved. What-if mechanism: **A1 + B1**. Constant
> `value_of_time_vnd_per_hour` = **30,000**. New raw facts, definitional choices,
> and Layer-5 annualization: all approved as written below.

All logic described here will live in **governed metrics** (AML measures on models
and AQL metrics on the dataset), never in page JavaScript. Derived metrics
reference other metrics/measures with `r(...)`; they never re-derive from raw
columns once a lower metric exists.

---

## How anfra handles what-if / parameters (findings)

I checked the AML type system, the query CLI, the core OpenAPI contract, and the
Data-App SDK:

- AML **does** have a `param` field type (`text|number|date|datetime|truefalse`,
  with optional `allowed_values`) on models.
- **But there is no way to set a param's value at runtime.** The core API's
  `QueryInput` (OpenAPI) accepts only `query`, `dataset`, `lang`, `data_source`;
  the per-query `--input` carries only **filters/conditions, sorts, and date
  drills**; and the App SDK exposes `createFilter` + `createDateDrill` only (no
  `createParam`). So a `param` would be stuck at its default — not interactive.

**Conclusion:** interactive what-if in anfra must be driven by **filters/conditions
over fact tables**. The reader's choices arrive as conditions applied to the AQL;
the metrics read those conditions. This also satisfies the rule that the stress
rates are "stored as facts."

### Options for the two simulation inputs

**A. Chosen interventions** (which projects are "switched on")
- **A1 (recommended): an `active` filter on the `interventions` model.** The reader
  selects intervention rows; the Mayor-mode depth metric applies only the mechanisms
  of the selected rows (via joins to the districts/segments each one targets). Default
  = none selected (so "after" == baseline until the reader picks projects).
- A2: a param listing intervention ids — rejected (not runtime-settable).
- A3: app builds different AQL per selection — rejected (logic would leave the metrics).

**B. `years_from_now`** (0–15, a city-wide stress dial)
- **B1 (recommended): a single-select filter on a `stress_horizons` fact table**
  (one row per year 0–15, carrying the rain/tide/subsidence factors derived from the
  stored annual `climate_rates`). The reader picks a year; the depth metric joins that
  row's factors. Default = 0 (today).
- B2: a numeric param — rejected (not runtime-settable).

> **Decision needed:** approve A1 + B1 (my recommendation), or choose otherwise.

### New raw facts required (facts only — no derived values)

Layer 5 needs targeting/relationship facts the current DB doesn't have. I propose
adding these to `scripts/generate_data.py` (all raw facts):

| table / column | purpose | columns |
| --- | --- | --- |
| `interventions.absorb_first_mm` (new col) | retention pond capacity | mm of rain absorbed |
| `intervention_districts` | which districts a sluice / drainage / retention targets | `intervention_id, district_id` |
| `intervention_segments` | which segments a raised road removes | `intervention_id, segment_id` |
| `district_downstream` | downstream neighbour (retention helps its district + downstream) | `district_id, downstream_district_id` |
| `climate_rates` | annual stress **rates**, stored as facts | `rain_intensity_pct_per_year, tide_rise_m_per_year, subsidence_m_per_year` |
| `stress_horizons` | per-year factors derived from `climate_rates` (the filter target for `years_from_now`) | `years_from_now, rain_factor, tide_add_m, subsidence_m` |

> **Decision needed:** approve these additions (I'll also keep the existing sanity
> checks passing after regenerating).

---

## Governance constants (defined exactly once)

| name | value | where defined | notes |
| --- | --- | --- | --- |
| `flood_threshold_cm` | **20** | one measure/metric, referenced everywhere | "Flooded" = modeled depth ≥ 20 cm (a motorbike stalls). No other metric restates 20. The dependency test flips this one value to 30. |
| `value_of_time_vnd_per_hour` | **30,000** | one measure/metric, referenced only by cost metrics | VND per commuter-hour. One constant. |

### Physical model coefficients (mirror `scripts/generate_data.py`)

These are model logic (not facts), defined once in the modeled-depth measure and
reused by the Mayor-mode version:
`RUNOFF_CM_PER_MM = 0.40`, `SHEET_CM_PER_MM = 0.02`, `DRAIN_HOURS = 1.5`,
`elev_factor = clamp(1.30 − 0.12·elevation_m, 0.20, 1.30)`,
tide backflow `= max(0, tide_level_m − 0.5) · 18 · (3 − elevation_m)/3` for
`near_river AND elevation_m < 3`, else 0; recent rain = trailing **3-hour** sum.

---

## LAYER 1 — Base (recorded facts)

| metric | label | meaning | formula | builds on |
| --- | --- | --- | --- | --- |
| `rainfall_mm` | "Rainfall (mm)" | Avg recorded rainfall per district-hour in scope | `avg(weather_hourly.rainfall_mm)` | raw: `weather_hourly.rainfall_mm` |
| `peak_tide_m` | "Peak tide (m)" | Highest recorded tide level in scope | `max(tide_hourly.tide_level_m)` | raw: `tide_hourly.tide_level_m` |
| `avg_water_depth_cm` | "Avg water depth — recorded (cm)" | Avg sensor-recorded water depth across segment-hours | `avg(segment_readings.water_depth_cm)` | raw: `segment_readings.water_depth_cm` |

---

## LAYER 2 — Modeled depth

| metric | label | meaning | formula | builds on |
| --- | --- | --- | --- | --- |
| `modeled_water_depth_cm` | "Modeled water depth (cm)" | Depth reconstructed from rain, drainage, elevation and tide — mirrors the generator, so the simulation can change it | per segment-hour: `pool_cm + sheet_cm + tide_extra_cm`, where `rain_3h` = trailing-3h sum of district rainfall; `net = rain_3h − drainage_capacity_mm_per_hr·DRAIN_HOURS`; `pool_cm = max(0,net)·RUNOFF·elev_factor`; `sheet_cm = rain_3h·SHEET·elev_factor`; `tide_extra_cm` per the tide-backflow rule. Reported as `avg(...)` over scope. | raw: `weather_hourly`, `tide_hourly`, `road_segments` (drainage, elevation, near_river); constants above |
| `model_error_cm` | "Model error (cm)" | How far the model is from the sensors (modeled − recorded) | `r(modeled_water_depth_cm) − r(avg_water_depth_cm)` (report avg, and avg-absolute for size) | metrics: `modeled_water_depth_cm`, `avg_water_depth_cm` |

*Implementation note:* the trailing-3h rain and the segment-hour level of detail are
the hard part; I'll validate them carefully in Layer 2 before moving on.

---

## LAYER 3 — Flooding (on modeled depth, so the simulation can move it)

The flooding population is **segment-hours**; lengths are summed over that
population so metrics stay additive across districts.

| metric | label | meaning | formula | builds on |
| --- | --- | --- | --- | --- |
| `flood_threshold_cm` | "Flood threshold (cm)" | The single flooded-depth cutoff (20 cm) | constant `20` | — (the one definition) |
| `total_road_km` | "Total road-km (in scope)" | Road length summed over the segment-hours in scope | `sum(road_segments.length_km)` over segment-hours | raw: `road_segments.length_km` |
| `flooded_road_km` | "Flooded road-km" | Road length on flooded segment-hours | `sum(road_segments.length_km) where modeled_water_depth_cm ≥ flood_threshold_cm` | metrics: `modeled_water_depth_cm`, `flood_threshold_cm`; raw length |
| `flood_risk` | "Flood risk (share of road-km)" | Length-weighted share of road flooded | `r(flooded_road_km) / r(total_road_km)` | metrics: `flooded_road_km`, `total_road_km` |
| `flooded_hours` | "Flooded segment-hours" | Count of flooded segment-hours | `count where modeled_water_depth_cm ≥ flood_threshold_cm` | metrics: `modeled_water_depth_cm`, `flood_threshold_cm` |

> **Decision needed:** confirm `flooded_hours` = count of flooded *segment-hours*
> (additive; feeds `flooded_hours_avoided`), vs. "distinct hours with any flooding."

---

## LAYER 4 — Commuter

| metric | label | meaning | formula | builds on |
| --- | --- | --- | --- | --- |
| `route_risk` | "Route flood risk" | Share of a route's road-km flooded at the trip's departure hour | `flooded_route_km / route_km` at `depart_ts`, using the same flooded rule on `modeled_water_depth_cm` restricted to the route's segments | metrics: `modeled_water_depth_cm`, `flood_threshold_cm`; raw: `route_steps`, `road_segments`, `trips.depart_ts` |
| `wet_socks_index` | "Wet-socks index (1–5)" | A friendly 1–5 severity for a commuter | bucket `route_risk`: `≈0→1`, then 2–5 by rising risk (e.g. ≤.1,≤.25,≤.5,>.5) | metric: `route_risk` |
| `commute_delay_min` | "Commute delay (min)" | Recorded travel time above the dry-evening baseline | `avg(trips.travel_minutes) − baseline_travel_min` (baseline = avg travel on dry, unflooded evenings for the same route) | metrics: `baseline_travel_min` (helper); raw: `trips.travel_minutes` |

*Helper:* `baseline_travel_min` = `avg(trips.travel_minutes) where route_risk ≈ 0`
(dry evenings). Hidden metric, used by `commute_delay_min` and Layer 5.

---

## LAYER 5 — Mayor mode

Interventions and `years_from_now` change the **inputs** of modeled depth, giving an
"after" depth that the Layer-3 flooding metrics are re-evaluated on. Mechanisms
(each from the `interventions` row + its targeting facts), applied only to **active**
(selected) interventions:

- **tidal sluice** → multiplies tide backflow by `(1 − combined tide_block_share)` for
  near-river segments in its districts (combined via `1 − ∏(1 − share)`, capped at 1).
- **drainage upgrade** → adds `drainage_boost_mm_per_hr` to a district's drainage, with
  **diminishing returns** for repeats in the same district (each further upgrade ×0.5).
- **retention pond** → absorbs the first `absorb_first_mm` of `rain_3h` in its district
  **and** its downstream district.
- **raised road** → removes its listed segments from flooding (forced not-flooded).
- **`years_from_now`** → `rain_3h ×= rain_factor`, `tide += tide_add_m`,
  `elevation_m −= subsidence_m` (from the selected `stress_horizons` row).

| metric | label | meaning | formula | builds on |
| --- | --- | --- | --- | --- |
| `modeled_water_depth_after_cm` | "Modeled depth — after (cm)" | Modeled depth with active interventions + stress applied to its inputs | Layer-2 formula with adjusted `rain_3h`, `drainage`, `tide`, `elevation`, and raised-road segments excluded | metric: `modeled_water_depth_cm` logic; raw: `interventions` (+ targeting), `stress_horizons` |
| `risk_after_interventions` | "Flood risk — after" | `flood_risk` recomputed on the after-depth | same as `flood_risk` but on `modeled_water_depth_after_cm` | metrics: after-flooding metrics |
| `flooded_hours_avoided` | "Flooded hours avoided" | Baseline minus after | `r(flooded_hours) − r(flooded_hours_after)` | metrics: `flooded_hours`, `flooded_hours_after` |
| `delay_cost_vnd` | "Delay cost (VND)" | Value of commuter time lost to flooding (baseline) | `modeled_delay_hours · value_of_time_vnd_per_hour` | metrics: modeled delay, `value_of_time_vnd_per_hour` |
| `delay_cost_saved_vnd` | "Delay cost saved (VND)" | Baseline cost minus after cost | `r(delay_cost_vnd) − r(delay_cost_after_vnd)` | metrics: `delay_cost_vnd`, after-cost |
| `intervention_roi` | "Intervention ROI" | Benefit per VND spent | `annualized(delay_cost_saved_vnd) / total_chosen_cost_vnd` | metrics: `delay_cost_saved_vnd`; raw: `interventions.cost_billion_vnd` (selected) |
| *benefit by district* | — | `flooded_hours_avoided` / `delay_cost_saved_vnd` grouped by district | (the saved metrics, viewed by `districts.name`) | metrics above + `districts` dimension |

*Modeled delay:* to let interventions change commute cost, delay in Layer 5 is
modeled from route depth (`avg·1.0 + max·0.5`, mirroring the generator) rather than
read from recorded `trips`, so it responds to the "after" depth.

> **Decisions needed on Layer 5:**
> 1. `intervention_roi` annualization: scale the 30-evening saving to a year
>    (×~12), benefit/cost as a ratio (capital cost treated as one-time). OK?
> 2. Modeled (not recorded) delay for the cost metrics — OK?

---

## Implementation notes (as built)

- **Modeled depth** (`modeled_segment_readings`) is a QueryModel — the row-level physics
  (trailing-3h rain window, drainage, tide backflow) that SQL does well; it mirrors
  `generate_data.py`. Flooding/commute/mayor metrics build on it.
- **Governance constants live once in `flood_config`** (a one-row table): `threshold_cm`
  (20) and `value_of_time_vnd_per_hour` (30000). Every QueryModel/metric reads them; the
  dependency test flips `flood_config.threshold_cm` in that single place.
- **Layer 4** uses a `trip_conditions` QueryModel (per-trip rollup) because anfra's
  auto-joins fan out across the trips↔routes↔steps chasm; verified against raw-SQL truth.
- **Layer 5** uses a `scenario_effects` QueryModel: per segment-hour × stress-horizon ×
  intervention, carrying the stressed baseline depth and that intervention's marginal
  relief. What-if inputs are **filters**: `years_from_now` (one horizon; default 0) and
  `intervention_id` (active set; `{0}` = baseline, add ids to switch projects on).
  After-depth = `max(baseline) − sum(active relief)` per segment-hour.
- **Approximations (per the agreed "free-form toggles, approximate" choice):**
  - Interventions combine by **superposition** of per-intervention relief. Each
    intervention's physics is exact; cross-effects (two drainage upgrades in one district
    — the diminishing-returns case — and two sluices on one district) are not modeled.
    With this data only District 7's two drainage upgrades overlap.
  - `delay_cost_saved_vnd` scales baseline delay cost by the **flooded-road-km reduction**
    rather than recomputing per-trip travel under the scenario.
  - `intervention_roi` annualizes the ~30-evening saving (×12); its **magnitude is
    sample-scale** (delay cost is over 400 sample trips, not the full commuter population).
    Add a commuter-scale factor for a realistic figure.

## Checks run per layer (from your spec)

- `anfra validate`, then `anfra query` to show a few results.
- City-wide `flooded_road_km` == sum across districts (additivity).
- `model_error_cm` is small; shown by district.
- Dependency test: set `flood_threshold_cm` to 30, confirm every derived metric
  moves, then set it back.
- After Layer 5: sluice helps most on high-tide evenings; drainage most on
  heavy-rain evenings; both together beat either alone; `years_from_now = 15` with
  no interventions is clearly worse.
