# Wanderleaf

A travelling bookshop's sales: find where the money went missing, then replay that real past day with a different crate of books.

- Demo: https://wanderleaf.pages.holistics.dev (password: `book`)
- Author: Son Hoang

[![Watch the Wanderleaf video](https://img.youtube.com/vi/p5FuJlnMzeI/maxresdefault.jpg)](https://www.youtube.com/watch?v=p5FuJlnMzeI)

A Data App with two tabs over the `wanderleaf` dataset. **Overview** shows the shop's sales for a chosen period against the previous one: by spot, genre and weather, with the sales it missed when the crate ran out. Click any number to see the days behind it. **Play a day** puts you in one caravan on a past day. You pick a spot and pack a 40-book crate from a forecast, then that day's recorded customers arrive and you see how your crate would have done. Every figure on both tabs is a metric defined in AML, and "How it works" shows the definitions.

## Run it

Needs the `anfra` CLI and Python 3.

```sh
pip install duckdb numpy
python3 data/generate_data.py               # writes data/wanderleaf.duckdb, seeded so every run gives the same data
cp .anfra/data_sources.yml.example .anfra/data_sources.yml   # then set the absolute path to data/wanderleaf.duckdb
anfra validate
anfra serve                                 # http://127.0.0.1:7878/apps/wanderleaf
```

## Data

All of it is made up. `data/generate_data.py` builds a fictional town, Driftmouth Bay, with five spots (Harbour, Old Town Square, Saturday Market, University, Lighthouse), daily weather, cruise ships and events, and about 50,000 sales from January 2024 to September 2025. The book titles are public-domain works, used only as catalogue entries. The town art in `apps/shared/art/town/` is designed by Freepik.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/wanderleaf.html` | The Data App, one HTML file that queries the dataset through the anfra SDK |
| `apps/shared/` | Its scripts, styles, map and art |
| `datasets/`, `models/` | The AML dataset, metrics and models |
| `data/generate_data.py` | The data generator |
| `tools/` | Scripts that draw the map and the player avatars |
| `deploy/` | Container image for the demo: `anfra serve` behind a Caddy password page |
