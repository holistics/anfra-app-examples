# Metric log

A plugin for Metric Tree & Decompose. It keeps a running history for each metric.

- Demo: https://anfra-metric-log-demo.pages.holistics.dev/
- Author: Kaia Nguyen

When you find out why a metric moved, you log the decision you made next to it. Definition changes appear on the same timeline in plain language: what changed, who approved it and when. When the metric dips again, you can see what happened and what you did about it last time, without digging through docs, threads and git history.

It is a concept: no sign-in (a "Viewing as" switcher), simulated drafts for three sentences, and Slack sends nothing.

## Run it

Needs the `anfra` CLI and Node 20+.

```sh
npm install
npx anfra-metric-log check
npx anfra-metric-log serve     # http://127.0.0.1:7900, starts anfra serve for ./demo if needed
```

See `docs/index.html` for the walkthrough and config. To use it on your own Anfra repo, set `anfra.repo`, your people, `defaults` for owner and approver, and `canvas.date` per dataset in `anfra-metric-log.yml`.

## Data

Synthetic only. `demo/` is an Anfra repo over a made-up shop (orders, refunds and costs in DuckDB, 2025-06-01 to 2026-10-19). `demo/scripts/seed.sql` regenerates `demo/data/shop.duckdb`, and the events in `demo/scripts/history.json` are built in on purpose. The people (Lily, Mark, Hannah and others) are fictional, and their faces are drawn from [Open Peeps](https://www.openpeeps.com/) by Pablo Stanley (CC0) through [DiceBear](https://www.dicebear.com/styles/open-peeps/) (MIT).
