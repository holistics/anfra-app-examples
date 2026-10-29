# Leave now or wait?

For a Ho Chi Minh City evening commuter: is my route flooded right now, and will it get better if I wait? 🌧️

A single-page data app over synthetic HCMC flood data. It reads your route's current water depth and projected travel time, tells you whether to leave now or hold off — and includes a **Mayor mode** what-if simulator that toggles flood-control projects (sluices, drainage, retention ponds, raised roads) and a `years_from_now` climate dial, then shows flooded-km avoided, commute-delay cost saved, and ROI.

- Demo: https://leave-now-or-wait.pages.holistics.dev/apps/flood
- Video: https://media.holistics.io/anfra/demo/AnfraDemoVideo.mp4
- Author: Khue Pham

Every piece of business logic — flood risk, delay, cost, ROI — lives in **governed anfra metrics**, not in page JavaScript. The app's JS only renders D3/SVG and formats values.

## Run

```sh
uv run scripts/generate_data.py   # writes data/flood.duckdb (synthetic, seeded — reproducible)
anfra validate
anfra serve                       # http://127.0.0.1:7878/apps/flood
```

The data source points at `data/flood.duckdb`; copy `.anfra/data_sources.yml.example` to `.anfra/data_sources.yml` if your setup needs it.

## Data

All data is **synthetic and seeded** (so re-running `generate_data.py` reproduces the same database) — no real sensor, map or customer data. The tables hold only raw facts a city would record (rainfall, tide, water depth, trip times, map geometry); every derived number is a governed metric, not a stored column.

The generator lays down a deliberate causal chain so the raw facts correlate the way the real city does:

- Storm cells drift across neighbouring districts and build up over 2–3 hours → `weather_hourly.rainfall_mm`
- Recent rain (last 3h) minus a segment's drainage, plus tide backflow for low, near-river segments (worst in the southern low-lying districts) → `segment_readings.water_depth_cm`
- Deeper water on a route's segments at departure time → `trips.travel_minutes`

HCMC district/street/water geometry lives in `apps/*.geojson` for the map.

## Layout

- `scripts/generate_data.py` is the source of truth; `data/flood.duckdb` is derived and git-ignored. `scripts/sanity_checks/*.sql` assert the causal chain held (rain↔depth, depth↔travel, worst evenings/districts).
- `models/*.model.aml` — 15 base-table models in `flood.model.aml` plus 8 hand-written `@sql` QueryModels (segment readings, route conditions, scenario/intervention effects, recommendations).
- `datasets/flood.dataset.aml` bundles the models with the metrics the app queries.
- `apps/flood.html` is the whole app (one page), served at `/apps/flood`. It uses the Data-App SDK (`createFilter`, `createDateDrill`) for the district/route/date interactions.
- `docs/` — `metric_definitions.md` and `flood_app_context.md` document the metrics and the problem framing.

## How it decides

"Leave now or wait" compares your route's flood + delay metrics at the current hour against the next few hours; if waiting clears enough water to cut the delay, it says wait, otherwise leave. **Mayor mode** re-evaluates the same metrics with chosen interventions applied and the climate dial advanced, and reports the difference as flooded-km avoided, delay-cost saved (value-of-time × commuters), and ROI against each project's cost.
