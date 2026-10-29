"""Hourly weather for each outdoor activity from Open-Meteo (free, no API key).

One request per activity, at its start position, covering the hours it lasted, in UTC.
Open-Meteo's archive (ERA5 reanalysis) lags about 5 days, so activities from the last week come
from the forecast API (which also serves recent past days) and are re-fetched from the archive
once they are older than ARCHIVE_AFTER_DAYS. Stored as raw.activity_doc kind 'open_meteo'.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import time
import urllib.parse
import urllib.request
from typing import Any, Callable

import psycopg
from psycopg.types.json import Jsonb

log = logging.getLogger("garmin_sync.weather")

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature",
    "wind_speed_10m", "shortwave_radiation", "precipitation",
]
ARCHIVE_AFTER_DAYS = 7
PAUSE_S = 0.15  # stay well under Open-Meteo's 600 requests/minute


def fetch_hourly(lat: float, lon: float, start: dt.datetime, end: dt.datetime) -> dict[str, Any]:
    """Hourly weather at a point between two instants (whole UTC days are requested)."""
    start, end = start.astimezone(dt.timezone.utc), end.astimezone(dt.timezone.utc)
    archive = (dt.datetime.now(dt.timezone.utc) - end).days >= ARCHIVE_AFTER_DAYS
    params = {
        "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}",
        "start_date": start.date().isoformat(), "end_date": end.date().isoformat(),
        "hourly": ",".join(HOURLY), "timezone": "GMT",
    }
    url = f"{ARCHIVE_URL if archive else FORECAST_URL}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(30 * (attempt + 1))
                continue
            raise
    hourly = data.get("hourly") or {}
    # Keep only the hours the activity overlaps.
    lo = start.replace(minute=0, second=0, microsecond=0)
    keep = [i for i, t in enumerate(hourly.get("time") or [])
            if lo <= dt.datetime.fromisoformat(t).replace(tzinfo=dt.timezone.utc) <= end]
    return {
        "source": "open-meteo-archive" if archive else "open-meteo-forecast",
        "final": archive,
        "latitude": data.get("latitude"), "longitude": data.get("longitude"), "elevation": data.get("elevation"),
        "units": data.get("hourly_units"),
        "hourly": {k: [v[i] for i in keep] for k, v in hourly.items()},
    }


def sync_weather(conn: psycopg.Connection, progress: Callable[[str], None]) -> int:
    """Fetch weather for outdoor activities that have none yet, or only a non-final forecast."""
    todo = conn.execute(
        """select a.activity_id,
                  (a.summary->>'startLatitude')::float, (a.summary->>'startLongitude')::float,
                  a.start_time_gmt,
                  a.start_time_gmt + make_interval(secs => coalesce((a.summary->>'elapsedDuration')::float,
                                                                    (a.summary->>'duration')::float, 0))
           from raw.activity a
           left join raw.activity_doc d on d.activity_id = a.activity_id and d.kind = 'open_meteo'
           where a.summary->>'startLatitude' is not null
             and (d.activity_id is null or not coalesce((d.payload->>'final')::boolean, false))
           order by a.start_time_gmt desc"""
    ).fetchall()
    done = 0
    for i, (activity_id, lat, lon, start, end) in enumerate(todo, 1):
        progress(f"Weather {i}/{len(todo)}")
        try:
            payload = fetch_hourly(lat, lon, start, end)
        except Exception as e:  # retried next run
            log.warning("weather for %s: %s", activity_id, e)
            continue
        conn.execute(
            """insert into raw.activity_doc (activity_id, kind, payload) values (%s, 'open_meteo', %s)
               on conflict (activity_id, kind) do update set payload = excluded.payload, fetched_at = now()""",
            (activity_id, Jsonb(payload)),
        )
        conn.commit()
        done += 1
        time.sleep(PAUSE_S)
    return done
