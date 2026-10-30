# HolyNews

Slack, as a newspaper 🗞️

A company's Slack turned into a newspaper: what everyone applauded, what is heating up, what blew over, and how the office feels, for today, this week or this month.

- Demo: https://anfra-heidi.pages.holistics.dev/apps/DIY/holynews
- Video: https://media.holistics.io/anfra/competition-2026/holynews.mp4
- Author: Di Hoang

The front page leads with the most applauded post and the work topics heating up against their usual level. Each story opens to how it unfolded day by day, its mood, key themes and the teams talking, with a link back to every moment in Slack. Company, Business, Trending and Life & Leisure each get their own page. Topics are ranked by departments and channels, never by person.

## Run it

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/holynews/holynews
```

`.anfra/data_sources.yml` opens `data/holynews.duckdb` read-only with a relative path, so there is nothing to set up.

## Data

HolyGood is a stand-in company. Its Slack activity is synthetic: about 830,000 messages in 42 public channels from 19 May to 15 October 2026, with the posts, reactions and summaries the paper prints. Slack links point to a made-up workspace. The product launches are real Holistics release notes, with stills from them. Three leisure photos (the coffee machine, the office cats and the grass jelly) are office photos from the team. The other photos and the new joiners' portraits come from Wikimedia Commons, credited in `apps/holynews/holynews-photos/CREDITS.tsv` and under each photo.

The photos are embedded in the HTML. The files and their credits are in `apps/holynews/holynews-photos/`.

To rebuild the data (needs `uv` and `node`; it writes the same file):

```sh
uv run scripts/holynews/seed.py
```

The seed reads its story numbers from the design sketch, `docs/holynews/reference/holynews-sketch.html`.

## What is in this folder

| Path | What it is |
|---|---|
| `apps/holynews/holynews.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `apps/holynews/holynews-photos/` | The photos and their credits |
| `datasets/holynews.dataset.aml` | Messages, posts, reactions, topics, people and clubs |
| `models/holynews/` | AML models over the Slack tables |
| `data/holynews.duckdb` | The data |
| `scripts/holynews/seed.py` | How the data was generated |
| `docs/holynews/reference/holynews-sketch.html` | The design sketch the seed reads |
