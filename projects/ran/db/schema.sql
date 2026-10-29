-- Tables the sync writes. Applied by `garmin-sync` on every run, so it must stay idempotent.
--
-- raw.*    Garmin's JSON responses as received, one row per object. Never edited by hand.
-- garmin.* What Anfra reads: typed views over raw.* (db/views.sql), plus the parsed
--          per-second streams, which are too large to keep as JSON.

create schema if not exists raw;
create schema if not exists garmin;

-- One row per activity, from the activity list (get_activities_by_date).
create table if not exists raw.activity (
  activity_id     bigint primary key,
  start_time_gmt  timestamptz not null,
  summary         jsonb not null,
  fetched_at      timestamptz not null default now()
);

-- Per-activity documents: kind = 'splits' (laps, get_activity_splits)
-- or 'details_meta' (the stream's metric descriptors, without the samples).
create table if not exists raw.activity_doc (
  activity_id  bigint not null references raw.activity on delete cascade,
  kind         text not null,
  payload      jsonb,
  fetched_at   timestamptz not null default now(),
  primary key (activity_id, kind)
);

-- One row per day and endpoint: kind = 'user_summary', 'sleep', 'hrv', 'max_metrics',
-- 'training_readiness', 'training_status'.
create table if not exists raw.daily (
  calendar_date  date not null,
  kind           text not null,
  payload        jsonb,
  fetched_at     timestamptz not null default now(),
  primary key (calendar_date, kind)
);

-- Weigh-ins / body composition samples (get_body_composition -> dateWeightList).
create table if not exists raw.body_composition (
  sample_pk    text primary key,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now()
);

-- Each sync run, for the app's "last synced" and for debugging.
create table if not exists raw.sync_run (
  id              bigserial primary key,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running',  -- running | ok | error
  trigger         text,                              -- cli | app
  new_activities  int not null default 0,
  days_synced     int not null default 0,
  message         text
);

-- Per-second samples parsed from get_activity_details. One row per sample.
create table if not exists garmin.activity_sample (
  activity_id         bigint not null references raw.activity on delete cascade,
  seq                 int not null,
  sample_time         timestamptz,
  elapsed_s           double precision,   -- moving/timer seconds since start
  distance_m          double precision,
  heart_rate          double precision,
  speed_mps           double precision,
  cadence_spm         double precision,   -- steps per minute (both feet)
  elevation_m         double precision,
  power_w             double precision,
  latitude            double precision,
  longitude           double precision,
  stride_length_cm    double precision,
  vertical_osc_cm     double precision,
  ground_contact_ms   double precision,
  primary key (activity_id, seq)
);
alter table garmin.activity_sample
  add column if not exists grade_adj_speed_mps double precision,
  add column if not exists temperature_c       double precision;

-- One-off and per-year documents: key = 'personal_records', 'race_predictions:2025', ...
create table if not exists raw.doc (
  key         text primary key,
  payload     jsonb,
  fetched_at  timestamptz not null default now()
);

-- Small sync bookkeeping (e.g. whether the full activity list has been fetched once).
create table if not exists raw.sync_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- A single-column key for Anfra (samples per activity stay well under 1e6).
alter table garmin.activity_sample
  add column if not exists sample_id bigint generated always as (activity_id * 1000000 + seq) stored;

-- ---------------------------------------------------------------------------------------------
-- app.*: what the user enters in the Data Apps (written through the sync server), as opposed to
-- raw.* which only the Garmin sync writes.
create schema if not exists app;

-- Races: past ones link to their activity; upcoming goal races have no activity yet.
create table if not exists app.race (
  race_id          bigserial primary key,
  activity_id      bigint unique references raw.activity on delete set null,
  race_date        date not null,
  name             text not null,
  distance_km      double precision not null,     -- official distance (5, 10, 21.0975, 42.195, ...)
  official_time_s  double precision,              -- chip time; null = use the activity's timer time
  priority         text not null default 'B' check (priority in ('A', 'B', 'C')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table app.race add column if not exists goal_time_s double precision;  -- the runner's target time


-- Weigh-ins entered in the app (Garmin's own are in raw.body_composition).
create table if not exists app.weigh_in (
  weigh_in_id   bigserial primary key,
  measured_on   date not null,
  weight_kg     double precision not null check (weight_kg between 20 and 300),
  body_fat_pct  double precision check (body_fat_pct between 2 and 70),
  notes         text,
  created_at    timestamptz not null default now()
);
