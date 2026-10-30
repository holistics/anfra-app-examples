# ETA Risk Control Tower

Which shipments will miss their promised date, and how much value is at risk.

- Demo: https://eta-tracking-live.pages.holistics.dev/apps/eta-control-tower
- Video: https://media.holistics.io/anfracompetition/EtaControlTowerVideo.mp4
- Author: Vy Huynh

A freight forwarder's control tower. A map shows the active shipments by lane, with arc width for the value at risk. Around it are value at risk now, delayed orders, ETA slips and on-time rate, the shipment journey stage by stage, live alerts, ETA slips by stage, the orders likely to slip and the customers at risk. Click a port, lane, stage or bar to filter; click an order for its ETA history and journey. Every number opens "How it's calculated": its definition from the semantic layer, the filters in effect, the query that ran and the orders behind it.

## Run

Needs Docker and Python 3.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
scripts/load_data.sh     # starts Postgres on localhost:5442, creates schema logistics, loads the generated shipments
anfra validate
anfra serve              # http://127.0.0.1:7878/apps/eta-control-tower
```

`.anfra/data_sources.yml` points at the Postgres in `docker-compose.yml`; its user and password exist only in that local container. `docker compose down -v` removes it.

## Data

Generated sample data only. `etl/logistics.py` is seeded, so every run writes the same 3,002 ocean and air shipments for 40 invented customers across 20 ports, with their stage events and risk events. Carriers and customers are invented names. The data is generated for 14 Oct 2026, and the views in `db/logistics.sql` move every timestamp by the time since then, so the demo always looks live.

Three stories are planted for the demo to find:

- Customs congestion at Los Angeles, building over the last 3 weeks.
- One carrier, Meridian Line, with vessel rollovers trending up over the last 4 weeks.
- Order ORD-48213 at the head of the alerts feed, and ORD-51002 on the watchlist.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/eta-control-tower.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/shipment_risk.dataset.aml` | Shipments, stage events and risk events, with the ETA metrics |
| `models/logistics/` | AML models over the `logistics` tables and views |
| `db/logistics.sql` | The `logistics` schema, with the views that keep it live |
| `etl/` | The seeded generator and the loader |
| `docker-compose.yml`, `scripts/load_data.sh` | The local Postgres and the script that fills it |
