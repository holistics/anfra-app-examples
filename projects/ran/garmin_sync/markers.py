"""Best efforts: the fastest 1K, 5K, 10K, half and full marathon inside each run.

Computed from the per-second samples (garmin.activity_sample) and stored in garmin.best_effort, so
races are not the only points to validate a prediction against. Time is the watch's timer time
(elapsed_s stops when the watch is paused), as in a race result.

For each start sample a two-pointer finds where the distance first reaches start + D, and the end
time is interpolated linearly between the two samples around it. GPS glitches are removed first:
a step implying more than MAX_SPEED_MPS adds no distance, which can only make an effort slower.
garmin.best_effort_done records which runs were computed, so a run without any qualifying effort
is not recomputed on the next sync.
"""

from __future__ import annotations

import logging
from typing import Callable

import psycopg

log = logging.getLogger("garmin_sync.markers")

DISTANCES_KM = (1.0, 5.0, 10.0, 21.0975, 42.195)
MAX_SPEED_MPS = 7.0      # faster than any step a runner makes; anything above is a GPS jump
MAX_EFFORT_MPS = 6.5     # an effort averaging more than this (2:34 /km) is not believable


def clean_distance(t: list[float], d: list[float], half_window: int = 5) -> list[float]:
    """Cumulative distance with backwards steps and GPS jumps removed. The watch writes distance in
    uneven chunks (0 m, then 9 m), so a single 1 s step is not judged alone: a step is a jump only
    when the speed over the samples around it (± half_window) is also implausible."""
    n = len(d)
    out = [0.0] * n
    for i in range(1, n):
        dd, dt = d[i] - d[i - 1], t[i] - t[i - 1]
        ok = dd > 0
        if ok and (dt <= 0 or dd / dt > MAX_SPEED_MPS):
            lo, hi = max(i - 1 - half_window, 0), min(i + half_window, n - 1)
            span_t = t[hi] - t[lo]
            ok = span_t > 0 and (d[hi] - d[lo]) / span_t <= MAX_SPEED_MPS
        out[i] = out[i - 1] + (dd if ok else 0.0)
    return out


def best_efforts(t: list[float], d: list[float], hr: list[float | None]) -> list[dict]:
    """Fastest window per distance. t: timer seconds, d: metres (both increasing), hr per sample."""
    n = len(t)
    if n < 2:
        return []
    d = clean_distance(t, d)
    # Prefix sums for the mean HR of a window (samples with HR only).
    hr_sum, hr_cnt = [0.0] * (n + 1), [0] * (n + 1)
    for i, h in enumerate(hr):
        hr_sum[i + 1] = hr_sum[i] + (h or 0.0)
        hr_cnt[i + 1] = hr_cnt[i] + (1 if h else 0)
    found = []
    for km in DISTANCES_KM:
        target = km * 1000
        if d[-1] < target:
            break
        best = None
        j = 1
        for i in range(n - 1):
            goal = d[i] + target
            if j <= i:
                j = i + 1
            while j < n and d[j] < goal:
                j += 1
            if j >= n:
                break
            # interpolate the moment the distance reaches goal, between samples j-1 and j
            span = d[j] - d[j - 1]
            frac = (goal - d[j - 1]) / span if span > 0 else 1.0
            end = t[j - 1] + frac * (t[j] - t[j - 1])
            secs = end - t[i]
            if secs > 0 and (best is None or secs < best[0]):
                best = (secs, i, j)
        if best is None:
            continue
        secs, i, j = best
        if target / secs > MAX_EFFORT_MPS:
            continue
        cnt = hr_cnt[j + 1] - hr_cnt[i]
        found.append({
            "distance_km": km, "time_s": secs, "start_s": t[i], "start_m": d[i],
            "avg_hr": (hr_sum[j + 1] - hr_sum[i]) / cnt if cnt else None,
        })
    return found


def sync_best_efforts(conn: psycopg.Connection, progress: Callable[[str], None] = lambda m: None) -> int:
    """Compute best efforts for runs with samples that have not been computed yet."""
    todo = [r[0] for r in conn.execute(
        """select a.activity_id
           from raw.activity a
           where a.summary->'activityType'->>'typeKey' like '%running%'
             and exists (select 1 from garmin.activity_sample s where s.activity_id = a.activity_id)
             and not exists (select 1 from garmin.best_effort_done x where x.activity_id = a.activity_id)
           order by a.start_time_gmt desc"""
    ).fetchall()]
    for k, activity_id in enumerate(todo, 1):
        if k % 25 == 1:
            progress(f"Best efforts {k}/{len(todo)}")
        rows = conn.execute(
            """select elapsed_s, distance_m, heart_rate from garmin.activity_sample
               where activity_id = %s and elapsed_s is not null and distance_m is not null
               order by seq""",
            (activity_id,),
        ).fetchall()
        efforts = best_efforts([r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows])
        conn.execute("delete from garmin.best_effort where activity_id = %s", (activity_id,))
        for e in efforts:
            conn.execute(
                """insert into garmin.best_effort (activity_id, distance_km, time_s, start_s, start_m, avg_hr)
                   values (%s, %s, %s, %s, %s, %s)""",
                (activity_id, e["distance_km"], e["time_s"], e["start_s"], e["start_m"], e["avg_hr"]),
            )
        conn.execute(
            """insert into garmin.best_effort_done (activity_id, efforts) values (%s, %s)
               on conflict (activity_id) do update set efforts = excluded.efforts, computed_at = now()""",
            (activity_id, len(efforts)),
        )
        conn.commit()
    return len(todo)
