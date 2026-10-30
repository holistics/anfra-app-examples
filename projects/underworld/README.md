# Underworld

You work the identity desk at Charon's ferry. A soul arrives with papers, and the papers are a claim — the Books are the only thing that knows better, and every verdict is a live query against them.

- Demo: https://anfra-amyra.pages.holistics.dev/apps/nether-v4/realm
- Video: https://media.holistics.io/demo/nether-trailer-preview.mp4
- Author: Amyra Nguyen

A narrative Data App built as an identity-verification game. Each of fifty arriving souls carries four claims (identity, permit, a supporting record, and a coin whose mint should match their birthplace), and every check resolves against the semantic layer rather than a precomputed answer: edit the world's data and cases re-grade on the next run, with no regeneration step.

## Run it

```sh
python3 scripts/generate_nether_data.py   # writes data/nether.duckdb: 120 souls, permits, records and mint standards, seeded for reproducibility
anfra validate
anfra serve                                # http://127.0.0.1:7878/apps/nether-v4/realm
```

`apps/nether-v4/data/cases.json` and `cases-easy.json` (the fifty/twenty souls who arrive and the papers they carry) ship pre-built. To regenerate them after changing the world data:

```sh
anfra serve &                              # the cases generator reads the world through the running server
python3 scripts/generate_nether_cases.py
```

`scripts/generate_nether_aml.py` scaffolds `models/*.model.aml` from the duckdb schema; the committed models are already hand-finished, so you only need it if you add tables.

## Data

Entirely invented: a fantasy afterlife bureaucracy (places, names, coin designs), not a historical reference. `scripts/generate_nether_data.py` seeds the world with a fixed random seed, so the same run always produces the same data. No real customer or internal data is used anywhere in this app.
