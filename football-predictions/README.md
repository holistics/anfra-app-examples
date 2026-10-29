# Football Predictions

Football prediction: enjoy Anfra and get rich through honest labour ⚽

A prediction app that shows the numbers and the reasons behind each call (recent form, injuries, suspensions), and every call it got right or wrong.

- Demo: https://football-predictions.pages.holistics.dev/apps/football-predictions/1-matches
- Video: https://media.holistics.io/anfra/competition-2026/football-prediction-app.mp4
- Author: Khai To

A football prediction Data App. The offline seed data is synthetic; the real-data mode uses API-Football. The "AI" is a transparent Poisson model whose every multiplier is stored as a row, so the app can show why each call was made.

## Run

```sh
python3 scripts/seed.py      # writes data/*.csv: two seasons of fixtures, results, events, lineups, absences, odds
python3 scripts/predict.py   # writes data/prediction*.csv: the model, run as of each kickoff
./scripts/load.sh            # loads the CSVs into tables in data/.scratch.duckdb (fast queries)
anfra validate
anfra serve                  # http://127.0.0.1:7878/apps/football-predictions/0-about
```

Re-run all three scripts to regenerate; `seed.py --now 2026-10-14T12:00:00Z` pins which matches count as finished.

## Run with real data (API-Football, replay mode)

The same app on real fixtures from [API-Football v3](https://www.api-football.com) for the Premier League, Serie A and La Liga. The free plan only covers seasons 2022 to 2024, so the script replays: seasons 2023-24 and 2024-25, with `--now 2024-10-15T12:00:00Z` as the pretend today. Fixtures before it are finished with real results, events and lineups; fixtures after it are upcoming with scores hidden.

```sh
export APIFOOTBALL_KEY=...                       # from https://dashboard.api-football.com
python3 scripts/fetch_api_football.py --check    # plan, quota used, and whether the plan can read 2023 and 2024
python3 scripts/fetch_api_football.py --grade 20 # writes data/*.csv in the seed.py layout, plus data/api_predictions.csv
python3 scripts/predict.py --now 2024-10-15T12:00:00Z   # the Poisson model, unchanged, as of the same replay date
./scripts/load.sh
anfra validate
anfra serve
```

- Every API response is cached in `data/api/` (git-ignored). Re-runs cost no quota. The free plan allows 100 requests a day; a full backfill is about 115, so the first run stops at the quota, writes what it has, and finishes when run again the next day.
- `--now` and `--seasons` move the replay. `--days N` is how far after `now` API predictions are fetched (default 10). `--grade N` also fetches API predictions for the N most recent finished fixtures so the Accuracy tab can compare the two models. `--offline` rebuilds the CSVs from the cache without any request.
- Not available from the API, so faked or blank: odds for past fixtures (synthetic rows from points per game, bookmaker `Synthetic (form)`; `predict.py` never reads odds), `players.quality` (constant 1.0, which makes that factor neutral), `attendance` (blank), lineups for upcoming fixtures (each team's last real lineup copied with `is_predicted = 1`, as seed.py does), injury return dates. Players come from lineups and events, not from `/players/squads`, which only knows today's squads.
- The API's `/predictions` is computed from its data at call time, not a pre-match snapshot, so for a 2024 replay it is an approximation.
- `scripts/seed.py` stays as the offline fallback. Running it overwrites the real CSVs; run the fetch script with `--offline` to get them back.

## Layout

- `data/` CSVs are the source of truth; `data/.scratch.duckdb` is derived and git-ignored.
- `models/*.model.aml` are query models over the `raw_*` tables. `matches` joins both team names and the prediction headline in SQL (AQL allows one path into `teams`); `match_form` precomputes each side's last five before kickoff.
- `datasets/football.dataset.aml` bundles them with standings and accuracy metrics.
- `apps/football-predictions/` holds one page per view, `0-about` (the landing page), `1-matches`, `2-leagues`, `3-accuracy`, `4-explore` (a self-building explorer over the governed metrics), listed as a folder in `anfra serve` in that order; the list sorts by file name and shows each page by its `<title>`. `shared.js` holds the queries and renderers, `shared.css` the styles; each page calls `setupFootball(view, title)`.

## Model

λ = league average goals × recent attack × opponent's recent defence × venue × discipline × head-to-head × one factor per absent player. A Poisson grid on (λ home, λ away) gives the headline score, H/D/A, over/under, both-teams-to-score and the goals bars. Confidence is the top outcome's probability plus half its lead over the second.
