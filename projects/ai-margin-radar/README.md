# AI Margin Radar

Finds the customers whose AI usage costs more than they pay, and tests the pricing rules that fix the margin.

- Demo: https://ai-margin-radar.pages.holistics.dev/apps/ai-margin-radar
- Video: Coming soon

## Run it

```sh
uv run --with "duckdb<2" --with numpy --with pandas scripts/generate_data.py   # writes data/inkwell.duckdb
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/ai-margin-radar
```

`.anfra/data_sources.yml` opens `data/inkwell.duckdb` with a relative path, so there is nothing else to set up. Pin `duckdb<2`: DuckDB 2.0 writes a file format anfra cannot open yet.

## Data

Synthetic, written by `scripts/generate_data.py` (seeded): "Inkwell", a fictional AI writing app, Oct 2025 to Oct 2026. Agent mode (a frontier model) launches on 2026-06-01 and gross margin drops from about 80% to about 60%. No real customer or internal data.

## Margin copilot (optional AI assistant)

The app has a chat drawer ("Ask the margin copilot") that reads the dashboard, suggests scenarios, tunes the rules and fixes single customers from plain-language commands. It uses OpenAI through a small local proxy, so the API key stays on your machine and never reaches the browser.

```sh
echo 'OPENAI_API_KEY=sk-...' > .env.local    # git-ignored. Optional: OPENAI_MODEL=gpt-5-mini
node scripts/ai-proxy.mjs                   # listens on 127.0.0.1:7879
```

The assistant never writes SQL and never sees raw tables. It works through tools that read the governed numbers already on the page and move the same sliders a person can move, so every number it quotes traces back to a metric definition.

## What is where

- `models/`: one model per table, plus `revenue_daily`, which spreads each invoice over the days it pays for so a month's revenue lines up with that month's usage.
- `datasets/unit_economics.dataset.aml`: every metric the app shows (revenue kept, LLM cost, payment fees, gross margin, unprofitable customers, margin lost to them).
- `apps/ai-margin-radar.html`: the app. The what-if simulator starts from the governed per-customer numbers and applies the slider assumptions in the browser.

## Modeling notes

- Revenue, LLM usage and invoices each join customers and the calendar one way only, so revenue and cost never cross-join.
- The invoice-date relationship to the calendar is inactive. Billing metrics (discounts, failed payments, refunds) switch it on with `with_relationships()`. When it was active, "unprofitable customers by month" built its customer list from invoices and missed customers whose month was paid for by the previous month's invoice (32 instead of 35 for September 2026).

## Run it in a container, with the copilot

`deploy/` builds one image: `anfra serve` on loopback behind a small Go gateway (`deploy/gateway`). The gateway is the only public port. It forwards only what the app needs (the app's own AQL, no raw SQL or MCP) and serves the copilot's OpenAI calls at `/ai`, so the key stays on the server. Without a key the app works and the copilot shows as offline.

```sh
uv run --with "duckdb<2" --with numpy --with pandas scripts/generate_data.py   # the image copies data/inkwell.duckdb
deploy/build.sh ai-margin-radar:local                        # needs Go and podman
podman run --rm -p 8080:8080 -e OPENAI_API_KEY=sk-... ai-margin-radar:local
```

Open http://127.0.0.1:8080. Optional: `OPENAI_MODEL` (default `gpt-5-mini`) and `OPENAI_REASONING_EFFORT` (default `low`). Pass the key at run time, never bake it into the image.

