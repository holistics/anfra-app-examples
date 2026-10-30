# Love Line

Where love gets lost 💔

A dating app's funnel told as a metro line: of every 1,000 profiles members see, how many lead to a date or a number, and why riders get off at each stop.

- Demo: https://anfra-heidi.pages.holistics.dev/apps/DIY/love-line
- Video: https://media.holistics.io/anfra/competition-2026/love-line.mp4
- Author: Di Hoang

Guess the answer first, then ride the line. Each stop (right swipe, match, first message, reply, conversation, off the app) asks why people get off there and answers with findings: who likes back, which profile traits win a right swipe, which first messages get a reply. The profile card at the right-swipe stop lets you tick traits and watch the chance change. Every number opens to its definition and the query behind it.

## Run it

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/love-line/love-line
```

`.anfra/data_sources.yml` opens `data/loveline.duckdb` read-only with a relative path, so there is nothing to set up.

## Data

Synthetic sample data: 15,000 invented members in Hanoi, Ho Chi Minh City and Da Nang, about 1 million swipes over 12 weeks (23 July to 14 October 2026), the matches they made and how each chat went. Message content exists only as categories and invented example lines. Avatars are "Avatar Illustration System" by Micah Lanier (CC BY 4.0), drawn with DiceBear.

To rebuild the data (needs `uv`; it writes the same file):

```sh
uv run scripts/love-line/seed.py
uv run scripts/love-line/check.py     # prints each story beat next to its target
```

## What is in this folder

| Path | What it is |
|---|---|
| `apps/love-line/love-line.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/love_line.dataset.aml` | Members, swipes, matches and chats, with the funnel metrics |
| `models/loveline/` | AML models over the dating tables |
| `data/loveline.duckdb` | The data |
| `scripts/love-line/` | How the data was generated, and a check of its story |
