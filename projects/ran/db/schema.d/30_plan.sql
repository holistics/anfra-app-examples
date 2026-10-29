-- Training plan toward a race (Phase 4): one planned session per day, written by the Race Planner
-- through the sync server (garmin_sync/planner.py). Past days are kept, so planned vs done stays.
create table if not exists app.plan_day (
  plan_day_id           bigserial primary key,
  race_id               bigint not null references app.race on delete cascade,
  day                   date not null,
  session               text not null check (session in ('rest', 'easy', 'long', 'threshold', 'intervals', 'strength', 'race')),
  planned_km            double precision check (planned_km between 0 and 200),
  planned_min           double precision check (planned_min between 0 and 1440),
  target_pace_s_per_km  double precision check (target_pace_s_per_km between 120 and 1200),
  target_hr             double precision check (target_hr between 60 and 230),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (race_id, day)
);

-- The plan phase of each day (base, build, recovery, peak, taper, race week, sharpen), so the saved
-- plan's session paces can be brought up to date at the start of each phase.
alter table app.plan_day add column if not exists phase text;

