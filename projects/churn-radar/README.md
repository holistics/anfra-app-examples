# Churn Radar

Flags the customers likely to leave and why, then ranks the best action to keep each one. The sequel to AI Margin Radar.

- Demo: https://ai-margin-radar.pages.holistics.dev/apps/churn-radar (password protected)
- Video: Coming soon

## Run it

```sh
uv run --with "duckdb<2" --with numpy --with pandas scripts/generate_data.py   # writes data/inkwell.duckdb
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/churn-radar
```

`.anfra/data_sources.yml` opens `data/inkwell.duckdb` with a relative path, so there is nothing else to set up. Pin `duckdb<2`: DuckDB 2.0 writes a file format anfra cannot open yet.

## Data

Synthetic, written by `scripts/generate_data.py` (seeded): the same fictional "Inkwell", continued to 2027-01-10. On 2026-10-01 Inkwell applies AI Margin Radar's pricing rules, margin recovers, and some customers start to leave because of the rules. No real customer or internal data.

## Copilot (optional)

The optional copilot works like AI Margin Radar's: `node scripts/ai-proxy.mjs` with `OPENAI_API_KEY` in a git-ignored `.env.local`. The key stays on your machine.
