-- Best efforts: the fastest 1K / 5K / 10K / half / marathon inside each run (garmin_sync/markers.py).
-- Times are timer seconds, interpolated at the window's end; start_s / start_m locate the window.
create table if not exists garmin.best_effort (
  activity_id  bigint not null references raw.activity on delete cascade,
  distance_km  double precision not null,
  time_s       double precision not null,
  start_s      double precision,   -- timer seconds into the run where the window starts
  start_m      double precision,   -- metres into the run (glitch-cleaned distance)
  avg_hr       double precision,
  primary key (activity_id, distance_km)
);

-- Runs already computed (with or without a qualifying effort), so a sync only does new ones.
create table if not exists garmin.best_effort_done (
  activity_id  bigint primary key references raw.activity on delete cascade,
  efforts      int not null,
  computed_at  timestamptz not null default now()
);
