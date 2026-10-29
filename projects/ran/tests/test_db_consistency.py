"""The plan preview (Python) and the saved plan's forecast (SQL, garmin.race_forecast) must give the
same numbers. Runs against a throwaway copy of the database, never the real one, and only when asked:

    RAN_DB_TESTS=1 uv run pytest tests/test_db_consistency.py
"""

from __future__ import annotations

import os
import re
import subprocess

import psycopg
import pytest

pytestmark = pytest.mark.skipif(os.getenv("RAN_DB_TESTS") != "1", reason="set RAN_DB_TESTS=1 to run against a database copy")
COPY = "garmin_test_copy"


@pytest.fixture(scope="module")
def copy_url():
    from dotenv import load_dotenv
    load_dotenv()
    url = os.environ["DATABASE_URL"]
    subprocess.run(["dropdb", "--if-exists", COPY], check=True)
    subprocess.run(["createdb", "-O", "garmin_sync", COPY], check=True)
    dump = subprocess.run(["pg_dump", "garmin"], check=True, capture_output=True)
    subprocess.run(["psql", "-q", "-v", "ON_ERROR_STOP=1", COPY], input=dump.stdout, check=True, capture_output=True)
    copy = re.sub(r"/garmin$", f"/{COPY}", url)
    assert copy.endswith(f"/{COPY}"), "refusing to run: the copy URL does not point at the copy"
    old, os.environ["DATABASE_URL"] = url, copy
    yield copy
    os.environ["DATABASE_URL"] = old
    subprocess.run(["dropdb", "--if-exists", COPY], check=True)


def test_preview_matches_saved_plan_forecast(copy_url):
    from garmin_sync.planner import generate_plan
    from garmin_sync.scenario import preview
    with psycopg.connect(copy_url) as c:
        races = [r[0] for r in c.execute("select race_id from app.race where race_date > current_date")]
    assert races, "no upcoming race in the copy"
    for race_id in races:
        for options in (None, {"ramp_pct": 8, "runs_per_week": 5}):
            p = preview({"race_id": race_id, **({"options": options} if options else {})})
            generate_plan({"race_id": race_id, "options": p["options"]})
            with psycopg.connect(copy_url) as c:
                t, shape, vo2, tsb = c.execute(
                    "select predicted_time_s, shape_race, vo2_race, race_morning_tsb_share from garmin.race_forecast where race_id = %s",
                    (race_id,)).fetchone()
            r = p["result"]
            assert abs(t - r["predicted_time_s"]) < 1
            assert abs(shape - r["shape_race"]) < 0.01 and abs(vo2 - r["vo2_race"]) < 0.001 and abs(tsb - r["tsb_share"]) < 0.001
