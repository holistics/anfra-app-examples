# The Galaxy Orbit

Mobile app publisher as a living galaxy. Spot the app to inspect its health, then plan the growth that moves it.

- Demo: https://galaxy-orbit.pages.holistics.dev/
- Video: https://media.holistics.io/anfra/competition-2026/galaxy-orbit.mp4
- Author: Tri Duong

Each app in the portfolio is a planet, grouped by the squad that owns it. Land on one to see its health against the previous period, plan growth goals and initiatives, follow its campaigns, and meet its squad.

## Run it

```sh
./scripts/load.sh   # writes .anfra/data_sources.yml if missing, loads data/*.parquet into data/galaxy-demo.duckdb
anfra validate
anfra serve         # http://127.0.0.1:7878/apps/galaxy-orbit/galaxy-orbit
```

| Path | What it is |
|---|---|
| `apps/galaxy-orbit/galaxy-orbit.html` | The Data App: one HTML file that queries the datasets through the anfra SDK |
| `datasets/galaxy_demo.dataset.aml` | App health, revenue, retention and campaigns |
| `datasets/galaxy_growth.dataset.aml` | The growth journey: awareness to referral |
| `models/` | AML models over the demo tables |
| `data/*.parquet` | The data, one file per table |
| `scripts/load.sh` | Builds the local DuckDB file from the Parquet files |
| `scripts/seed-galaxy-demo.py` | How the data was generated (deterministic) |

## Data

Synthetic sample data for a made-up mobile app publisher: apps, squads, campaigns, installs, revenue and retention from 1 January 2023 to 20 October 2026. No real apps, users or revenue. `scripts/seed-galaxy-demo.py` regenerates it from `scripts/demo-dimensions.json`.
