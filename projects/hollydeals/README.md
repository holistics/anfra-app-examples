# HollyDeals

The untold story of every deal 🐸

The weekly sales report, turned from a wall of text into a funnel you can click through, week by week and deal by deal.

- Demo: https://hollydeals-demo.pages.holistics.dev/apps/sales-funnel
- Video: https://media.holistics.io/anfraexample/HollyDealsPublicVideo.mp4
- Author: Vy Huynh

The Report tab shows one week or month at a time: what changed, where the live deals are, every deal week by week, each rep's deals, this month against last, and what customers said and asked for. The Overview tab shows where every deal ended up, what is running now and how the pipeline moved. Click a deal for its page: the story so far, one entry per weekly report, with its assessment, next steps, win chance by week, key contacts and the feedback it raised.

## Run

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/sales-funnel
```

`.anfra/data_sources.yml` opens `data/funnel.duckdb` with a relative path, so there is nothing to set up.

To rebuild the sample data (the generator is seeded, so it writes the same file):

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m etl.build_duckdb      # writes data/funnel.duckdb
```

To run it in Docker, as the demo does:

```sh
docker buildx build --platform linux/amd64 -t hollydeals --load .
docker run --rm -p 7878:7878 hollydeals
```

## Data

Fake data only. `etl/gen_sales.py` generates 40 deals across 22 weekly reports (2026-W21 to 2026-W42), owned by three invented reps. Company, contact and rep names are built from invented syllables, and every paragraph, quote and feedback item comes from templates in the generator. The original app reads Holistics' internal weekly sales reports; that parser and its data are not in this repo. The sample data has no rep photos, so reps show as colored initials.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/sales-funnel.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/sales_funnel.dataset.aml` | Deals, weeks, reports, quotes, feedback and reps, with the funnel metrics |
| `models/sales/` | AML models over the `sales` tables |
| `data/funnel.duckdb` | The sample data |
| `db/sales.sql` | The `sales` schema: tables and views |
| `etl/` | The seeded generator and the script that writes the DuckDB file |
| `Dockerfile`, `entrypoint.sh` | The image the demo runs |
