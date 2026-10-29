# The Galaxy Orbit

Mobile app publisher as a living galaxy 🪐

Spot the app to inspect its health, then plan the growth that moves it.

- Demo: https://galaxy-orbit.pages.holistics.dev/
- Video: https://media.holistics.io/anfra/competition-2026/galaxy-orbit.mp4
- Author: Tri Duong

Every app is a planet, grouped by the squad that owns it. Land on one to read its health against the previous period, plan growth goals and the work behind them, follow each campaign from spend to revenue, and meet the squad that runs it. Every number is a live query, and each metric shows its definition and the AQL and SQL behind it.

## Run

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/galaxy-orbit/galaxy-orbit
```

`.anfra/data_sources.yml` opens `data/galaxy-demo-2026.duckdb` read-only with a relative path, so there is nothing to set up.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/galaxy-orbit/galaxy-orbit.html` | The Data App: one HTML file that queries the datasets through the anfra SDK |
| `datasets/galaxy_demo.dataset.aml` | App health, revenue, retention and campaigns |
| `datasets/galaxy_growth.dataset.aml` | The growth journey, from awareness to referral |
| `models/` | AML models over the demo tables |
| `data/galaxy-demo-2026.duckdb` | The data |
| `scripts/seed-galaxy-demo.py`, `scripts/demo-dimensions.json` | How the data was generated, and its inputs |

## Data

Synthetic sample data for a made-up mobile app publisher: apps, squads, campaigns, installs, revenue and retention from 1 January 2023 to 20 October 2026. No real apps, users or revenue.

To regenerate it into a new file (needs `uv`; takes about 6 minutes):

```sh
uv run scripts/seed-galaxy-demo.py --output data/galaxy-demo-new.duckdb
```

The seed is fixed, so the new file matches the shipped one, except `search_visits` in the growth table can differ by 1 from rounding. It also writes two check files into `scripts/`.
