#!/usr/bin/env bash
# Start the local Postgres, create schema `logistics` and load the generated shipments into it.
# Needs Docker and a Python with requirements.txt installed (.venv is used when present).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
docker compose up -d --wait db
docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U eta -d eta < db/logistics.sql
"$PY" -m etl.load_logistics
