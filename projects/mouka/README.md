# mouka

The home base for money clarity 🐈

A personal-finance tracker: where the money went, what's coming up, how the investments are doing and where net worth is heading, with every number traceable to the metric behind it.

- Demo: https://mouka.pages.holistics.dev/apps/mouka/app
- Video: https://media.holistics.io/anfra/competition-2026/sugar-free-baby.mp4
- Author: Nhi Tran (team Sugar-free Baby)

mouka reads 18 months of one person's money: card statements, bank texts and emails, budgets, card rewards, term deposits, gold and a brokerage account. It has five pages:

- **Ask AI (preview):** pick a suggested question and it answers from named, governed queries, so its numbers match the pages. Typing your own questions is coming soon.
- **Home:** net worth, spending and investments.
- **Cash flow:** In & out, Transactions, Recurring and Credit.
- **Invest:** performance against the VN-Index, and holdings.
- **Forecast:** net worth ahead with a what-if, and the next 30 days of cash.

Every number can be traced to its metric definition, AML, AQL and SQL. The layout works from a wide screen down to a phone (five frame breakpoints), and a design panel (`\`) edits the look live.

## Run

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/mouka/app  (design gallery: /apps/mouka/ds)
```

`.anfra/data_sources.yml` opens `db/finance.duckdb` read-only with a relative path, so there is nothing to set up. Built and checked on Anfra 0.11.1.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/mouka/` | The Data App: `app.html`, one view file per tab in `js/views/`, the design system in `ds/`. How to change it: [DESIGN.md](apps/mouka/DESIGN.md) |
| `models/`, `datasets/` | The semantic layer: `personal_finance` (67 metrics: spend, income and saving, balances, budgets, card rewards, data quality), `wealth` (63: net worth, projections, holdings, income, performance) and `finance_raw` (the 11 source tables, documented) |
| `docs/semantic-layer.md` | The metric catalog and the design decisions behind it |
| `db/` | The data (`finance.duckdb`) and the deterministic generator that builds it |
| `scripts/` | `gen_definitions.py` (rerun after any AML edit), `gen_icons.py` (vendors [Lucide](https://lucide.dev) icons), `ds_save.py` (the helper that saves looks from the design panel) |
| `tests/` | `check_semantic.py` and `check_wealth.py` reconcile the metrics with plain SQL and a Python replay; `tests/app/` holds the headless browser checks |

## Data

Synthetic. **Pham Thu Ha** is a made-up product designer in Ho Chi Minh City who lives alone. Her data runs from 1 April 2025 to 14 October 2026: salary from a made-up employer, money sent to her mother, a debit card, two credit cards, a bank account with savings pots, term deposits, gold and a brokerage account.

The tables mirror a real personal-finance pipeline, but every value is invented. The money level is set in `db/persona.py`. The shape (category mix, weekday rhythm, transfer and refund rates) comes from jittered aggregate ratios, never from rows. A leak check against the source found no shared description, message body, id, card number or note, and no matching (date, amount) pair beyond round numbers. The calibration and leak-check scripts stay private. Without them, the generator falls back to the persona's default shape.

To rebuild (stop `anfra serve` first, it holds the file lock):

```sh
python3 -m venv db/.venv && db/.venv/bin/pip install -r db/requirements.txt
db/.venv/bin/python -I db/build_duckdb.py --end 2026-10-14
```

A rebuild uses the default shape, so its numbers differ from the shipped file and from the numbers the checks pin.

## Check

```sh
db/.venv/bin/python -I tests/check_semantic.py   # 12 reconciliation checks
db/.venv/bin/python -I tests/check_wealth.py     # 15 checks against a Python replay
cd tests/app && npm install && ./gate.sh m1 m1-ds ask sp inv fc   # with anfra serve up; set CHROME to a Chromium binary
```
