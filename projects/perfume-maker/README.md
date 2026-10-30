# Perfume maker

Be a perfumer: mix your own formula, watch the cost per bottle, then price it to make profit.

- Demo: https://anfra-uwu.pages.holistics.dev/apps/composer
- Author: Kaia Nguyen

A Data App over the `perfume_composer` dataset. Every figure on the page, from ingredient cost to cost per bottle to profit, is a metric defined in AML, and the side panels show each one's definition and what it is built from.

## Run it

Needs the `anfra` CLI and Python 3.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/generate_data.py   # writes data/perfume.duckdb
anfra validate
anfra serve                                 # http://127.0.0.1:7878/apps/composer
```

After you change a metric or model, run `.venv/bin/python scripts/metric_tree.py`. It copies the metric and field definitions from the AML into the one line of `apps/composer.html` that the side panels read.

## Data

`data/perfume.duckdb` is not committed. `scripts/generate_data.py` builds it from a synthetic ingredient library and sample formulas, plus four CSVs in `data/`:

| File | What it holds |
|---|---|
| `ingredient_prices_existing.csv`, `ingredient_prices_new.csv` | Published supplier list prices, one source URL per row |
| `allergen_content.csv` | Typical allergen content from published studies and supplier sheets, one source per row |
| `ifra_51st_category4.csv` | IFRA category 4 limits from the 51st Amendment |

The formulas and the sales side are made up. Use it to learn how the app works, not for real compliance.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/composer.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/perfume_composer.dataset.aml` | The metrics and relationships |
| `models/` | AML models over the generated tables |
| `scripts/` | The data generator and the metric-panel updater |
| `.anfra/` | Points anfra at the models and at the local DuckDB file |
