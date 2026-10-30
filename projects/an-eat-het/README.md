# an eat hết

Run a kitchen that tracks everything: menu health, revenue, guests, and every kg of food from farm to plate (reused, composted or thrown away). Spot the courses at risk, cook with what's in season, and make better calls for the kitchen and the planet.

- Demo: https://anfra-uwu.pages.holistics.dev/apps/kitchen
- Author: Kaia Nguyen

A Data App over the `kitchen` dataset: a fine-dining restaurant with a set tasting menu that changes each season. Every number on the page is a metric defined in AML.

## Run it

Needs the `anfra` CLI and Python 3.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/generate_kitchen_data.py   # writes data/kitchen.duckdb
anfra validate
anfra serve                                         # http://127.0.0.1:7878/apps/kitchen
```

## Data

`data/` is not committed. `scripts/generate_kitchen_data.py` builds `data/kitchen.duckdb` from a fixed seed, so every run writes the same restaurant: three years of service across twelve seasonal menus (Winter, Spring, Summer, Autumn) of 12 to 13 courses each, with sales, waste at every step of the kitchen's chain, drink pairings, suppliers and guest ratings. It also writes a temporary `data/waste_flow.csv` while it loads.

Everything is synthetic except the fruit rows of the seasonal calendar. Those are a hand-compiled summary of when Vietnamese fruit is in season, from general public knowledge, and the sources are not cited yet. The vegetable rows are synthetic.

Menu prices, plate costs and waste are plausible, not measured, so do not read them as real kitchen economics.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/kitchen.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/kitchen.dataset.aml` | The metrics and relationships |
| `models/` | AML models over the generated tables |
| `scripts/generate_kitchen_data.py` | The seeded data generator |
| `.anfra/` | Points anfra at the models and at the local DuckDB file |
