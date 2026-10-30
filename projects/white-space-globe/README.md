# White Space Globe

Decide where to expand next year 🌍

A 3D globe of a B2B SaaS company's customers against the size of each market: where it is strong, where the biggest untapped revenue is, and what stands in the way.

- Demo: https://anfra-heidi.pages.holistics.dev/apps/DIY/coverage-globe
- Video: https://media.holistics.io/anfra/competition-2026/white-space-globe.mp4
- Author: Di Hoang

Switch the globe between customers, ARR, share of market, untapped revenue and rating, then zoom from the world into countries, US states and cities. Size vs strength plots every market by how much is left against how much the company holds, with the blockers customers name in reviews. Every number opens to its definition, its lineage down to the tables, and the query behind it.

## Run it

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/white-space-globe/white-space-globe
```

`.anfra/data_sources.yml` opens `data/arcfield.duckdb` read-only with a relative path, so there is nothing to set up.

The map needs anfra 0.11.1, the version the demo runs. On anfra 0.13.5 and 0.14.2 every number loads, but the map stays on "Loading map…": anfra's app sandbox blocks the web worker MapLibre draws with.

## Data

Arcfield is a made-up company. Its customers, subscriptions and reviews are synthetic, generated with a fixed seed from January 2019 to 30 September 2026, with generic names and no real companies. The size of each market is public: Eurostat, OECD and World Bank firm counts and GDP, Natural Earth boundaries and cities, and US state GDP from the BEA. `data/raw/README.md` lists every source and its licence.

To rebuild the data (needs `uv`; it writes the same file):

```sh
uv run scripts/coverage-globe/seed.py              # from the files in data/raw/
uv run scripts/coverage-globe/seed.py --refresh    # downloads the public sources again first
```

## What is in this folder

| Path | What it is |
|---|---|
| `apps/white-space-globe/white-space-globe.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/global_sales.dataset.aml` | Customers, ARR, penetration, white space, ratings and review themes by market |
| `models/arcfield/` | AML models over the Arcfield tables and the market sizes |
| `data/arcfield.duckdb` | The data |
| `data/raw/` | The public sources the seed reads |
| `scripts/coverage-globe/seed.py` | How the data was generated |
