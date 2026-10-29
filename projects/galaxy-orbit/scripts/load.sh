#!/bin/sh
# Build data/galaxy-demo.duckdb from data/*.parquet (one table per file), so the app queries tables.
# Writes .anfra/data_sources.yml first if it is missing. Needs anfra on PATH; runs through the warm
# server when `anfra serve` is up, directly otherwise.
set -e
cd "$(dirname "$0")/.."
if [ ! -f .anfra/data_sources.yml ]; then
  mkdir -p .anfra
  cat > .anfra/data_sources.yml <<'EOF'
data_sources:
  galaxy_demo:
    type: duckdb
    connection:
      path: data/galaxy-demo.duckdb
EOF
  echo "wrote .anfra/data_sources.yml"
fi
for f in data/*.parquet; do
  name=$(basename "$f" .parquet)
  anfra query --lang sql -s galaxy_demo "CREATE OR REPLACE TABLE $name AS SELECT * FROM read_parquet('$f')" > /dev/null
  echo "$name"
done
