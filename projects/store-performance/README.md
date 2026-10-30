# Store performance

Spot unusual weeks in revenue, orders and customers, then see where the change happened.

- Demo: https://store-performance-live.pages.holistics.dev/apps/store-performance
- Video: https://media.holistics.io/anfracompetition/AnomalyPluginVideo.mp4
- Author: Vy Huynh

An online store's dashboard with anomaly detection on every trend. The headline numbers compare with the same period last year, and revenue, orders, new customers and cancellation rate each have a weekly trend. The anomaly plugin (`apps/_lib/anfra-anomaly.js`) flags the weeks that fall outside the expected range and shows where that expected value comes from. Revenue by category, by country and the top products show where a change happened.

## Run

Needs Docker and Python 3.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
scripts/load_data.sh     # starts Postgres on localhost:5441, creates schema ecommerce, loads the generated store
anfra validate
anfra serve              # http://127.0.0.1:7878/apps/store-performance
```

`.anfra/data_sources.yml` points at the Postgres in `docker-compose.yml`; its user and password exist only in that local container. `docker compose down -v` removes it.

## Data

Generated sample data only. `etl/ecommerce.py` is seeded, so every run writes the same store: two years of orders up to 14 Oct 2026 (about 126,000 orders from 27,000 customers in 6 countries), with growth, a weekend dip, a December peak and five planted events for the anomaly plugin to find:

| Event | When | Effect |
|---|---|---|
| Black Friday | 28 Nov to 1 Dec 2025 | Orders ×2.5 at a 30% discount |
| Sign-up surge | 9 to 15 Feb 2026 | Sign-ups ×4 |
| Outage | 10 to 12 Mar 2026 | Orders almost stop |
| Stockout | 8 to 28 Jun 2026 | Electronics units ×0.1 |
| Courier strike | 3 to 16 Aug 2026 | Cancellations up |

Customer names are drawn from short name lists and every email is at example.com.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/store-performance.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `apps/_lib/anfra-anomaly.js` | The anomaly plugin the app loads |
| `datasets/ecommerce.dataset.aml` | Orders, customers and products, with the store metrics |
| `models/ecommerce/` | AML models over the `ecommerce` tables |
| `db/ecommerce.sql` | The `ecommerce` schema |
| `etl/` | The seeded generator and the loader |
| `docker-compose.yml`, `scripts/load_data.sh` | The local Postgres and the script that fills it |
