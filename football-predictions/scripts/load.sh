#!/bin/sh
# Load data/*.csv into tables (raw_<name>) in the scratch DuckDB file, so every query reads a table
# instead of re-parsing CSVs. Run after scripts/seed.py and scripts/predict.py. Needs anfra on PATH;
# runs through the warm server when `anfra serve` is up, directly otherwise.
set -e
cd "$(dirname "$0")/.."
for f in data/*.csv; do
  name=$(basename "$f" .csv)
  [ "$name" = "crests" ] && continue
  anfra query --lang sql -s football "CREATE OR REPLACE TABLE raw_$name AS SELECT * FROM read_csv('$f')" > /dev/null
  echo "raw_$name"
done
# logos: data/crests.csv (team, league, crest_url) is hand-maintained and applied on top
if [ -f data/crests.csv ]; then
  anfra query --lang sql -s football "UPDATE raw_teams SET crest_url = c.crest_url FROM read_csv('data/crests.csv') c WHERE c.team = raw_teams.name AND c.crest_url <> ''" > /dev/null
  echo "crests applied: $(anfra query --lang sql -s football "SELECT count(*) AS n FROM raw_teams WHERE crest_url <> ''" | grep -A1 records | tail -1 | sed "s/[^0-9]//g") teams with a logo"
fi
