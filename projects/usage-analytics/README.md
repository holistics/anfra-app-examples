# Usage analytics

A plugin for admins: which dashboards and metrics get used, which don't, and who has gone quiet.

- Demo: https://thang-lk.pages.holistics.dev/apps/usage-xray
- Video: https://media.holistics.io/anfra/competition-2026/usage-analytics.mp4
- Author: Thang Kim

It answers six questions: which dashboards matter most (ranked by views), which can be retired (not opened in the last N days, including ones never opened), which metrics nobody queries, whether usage is growing or fading, who is using it, and who has gone quiet. Install it and it works straight away.

Anfra does not record usage today, so the app reads a synthetic log shaped like what a server-side request log could be.

## Run it

Needs the `anfra` CLI.

```sh
cp .anfra/data_sources.yml.example .anfra/data_sources.yml   # then set the absolute path to samples/usage/data/usage.duckdb
anfra serve
```

Then open `apps/usage-xray`. The app is a single page, `apps/usage-xray.html`, with its helpers in `apps/_lib/`. The `usage` Dataset is `datasets/usage.dataset.aml`, over the models in `models/usage/`.

## Data

Synthetic only. `samples/usage/data/usage.duckdb` is a fictional 180-day log (22 Apr to 20 Oct 2026) of 40 made-up people at a made-up gym, 14 dashboards and 45 metrics, with emails on `pulsegym.example`. `samples/usage/db/build_duckdb.py` regenerates it from a seeded script, and `samples/usage/README.md` lists the stories planted in it. No real usage data is included.
