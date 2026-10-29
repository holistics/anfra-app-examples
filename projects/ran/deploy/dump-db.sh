#!/usr/bin/env bash
# The sample database the deploy image carries: a synthetic runner (garmin_sync/demo.py) up to today,
# with a starter plan for its marathon. Run before each `docker build`: the image's data ends the day
# this ran.
#
#   deploy/dump-db.sh            # (re)creates garmin_deploy, then writes deploy/build/demo.dump
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB=garmin_deploy
cd "$ROOT"
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL%/garmin}/$DB"
case "$DATABASE_URL" in */$DB) ;; *) echo "DATABASE_URL does not end in /garmin" >&2; exit 1;; esac

.venv/bin/garmin-sync demo-data --db "$DB" --seed 7 --goal-weeks 9 --next-race-days 5 --goal 3:39:59
race=$(psql "$DATABASE_URL" -Atc "select race_id from app.race where race_date > current_date and distance_km > 40 limit 1")
.venv/bin/python -c "from garmin_sync.planner import generate_plan; print(generate_plan({'race_id': $race}))"
# the planner's per-race inputs read the saved plan's forecast: refresh them after the plan is saved
.venv/bin/python -c "import os, psycopg; from garmin_sync.model import refresh_scenarios; refresh_scenarios(psycopg.connect(os.environ['DATABASE_URL']))"

mkdir -p deploy/build
pg_dump -d "$DATABASE_URL" -Fc --no-owner --no-privileges -f deploy/build/demo.dump
ls -lh deploy/build/demo.dump
