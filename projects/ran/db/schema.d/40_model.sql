-- Fitted model results (garmin_sync/model.py rewrites them at the end of each sync, or with
-- `garmin-sync fit`). Tables, not views: the fit runs in Python (numpy).

-- One row per fitted or reference parameter, e.g. heat_pct_per_c.
create table if not exists garmin.model_param (
  name        text primary key,
  value       double precision,
  ci_low      double precision,          -- 95 % interval (bootstrap) when the fit gives one
  ci_high     double precision,
  n           int,                       -- observations behind the value
  method      text,                      -- how it was obtained, in words
  fitted_at   timestamptz not null default now()
);

-- One row per (past race, prediction method): what the method would have predicted from the
-- data available the day before the race, against the result.
create table if not exists garmin.prediction_check (
  race_id        bigint not null,
  method         text not null,          -- key, e.g. daniels_vo2_effective
  method_label   text not null,          -- for display
  predicted_s    double precision not null,
  actual_s       double precision not null,
  error_pct      double precision not null,  -- (predicted - actual) / actual, in %: positive = predicted too slow
  abs_error_pct  double precision not null,
  inputs         jsonb,                  -- what the prediction used (VO2max, source race, WBGT, ...)
  fitted_at      timestamptz not null default now(),
  primary key (race_id, method)
);
alter table garmin.prediction_check
  add column if not exists check_id text generated always as (race_id::text || ':' || method) stored;

-- The heat fit's data: one row per run used, with its pace at a fixed HR after removing the
-- fitted fitness trend and duration effect (heat_adj_pct: % slower than the run's expected pace
-- at the reference WBGT; the heat line is heat_pct_per_c x (wbgt_c - reference)).
create table if not exists garmin.heat_fit_point (
  activity_id    bigint primary key,
  start_date     date not null,
  wbgt_c         double precision not null,
  pace_s_per_km  double precision not null,   -- pace at easy HR, as measured
  heat_adj_pct   double precision not null,   -- partial residual incl. the heat term, in % of pace
  fitted_pct     double precision not null,   -- the fitted heat line at this WBGT, in %
  fitted_at      timestamptz not null default now()
);
