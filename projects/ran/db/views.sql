-- Typed views over raw.* : what Anfra's models read. Applied by `garmin-sync` (as garmin_sync,
-- so anfra_reader's default SELECT grant covers them). Dropped and recreated each time, so a
-- column can be renamed or retyped freely.

drop materialized view if exists garmin.activity_marker cascade;
drop materialized view if exists garmin.activity_load cascade;
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'garmin' and c.relname = 'day' and c.relkind = 'm') then
    drop materialized view garmin.day cascade;
  end if;
end $$;
drop view if exists garmin.activity, garmin.lap, garmin.day, garmin.body_composition, garmin.race_prediction, garmin.race,
  garmin.threshold cascade;

-- One row per activity. Units: km, seconds, m/s, bpm, steps/min, metres.
create view garmin.activity as
with hr as (
  -- HRmax for effective VO2max: Garmin's configured value, else the highest recorded.
  select coalesce(
    (select max((z->>'maxHeartRateUsed')::float) from raw.doc d, jsonb_array_elements(d.payload) z
      where d.key = 'hr_zones_config' and jsonb_typeof(d.payload) = 'array'),
    (select max((summary->>'maxHR')::float) from raw.activity)) as hrmax
)
select
  a.activity_id,
  s->>'activityName'                                        as activity_name,
  s->'activityType'->>'typeKey'                             as activity_type,
  (s->'activityType'->>'typeKey') like '%running%'          as is_run,
  case when (s->'activityType'->>'typeKey') like '%running%' then 'Running'
       when (s->'activityType'->>'typeKey') in ('cycling', 'road_biking', 'indoor_cycling', 'mountain_biking') then 'Cycling'
       when (s->'activityType'->>'typeKey') in ('walking', 'hiking') then 'Walking & hiking'
       when (s->'activityType'->>'typeKey') = 'strength_training' then 'Strength'
       else 'Other' end                                     as sport,
  a.start_time_gmt,
  (s->>'startTimeLocal')::timestamp                         as start_time_local,
  (s->>'startTimeLocal')::date                              as start_date,
  left(s->>'startTimeLocal', 16)                            as start_label,
  (s->>'workoutId')::bigint                                 as workout_id,
  s ? 'workoutId'                                           as is_workout,
  s->>'locationName'                                        as location_name,
  (s->>'distance')::float / 1000                            as distance_km,
  (s->>'duration')::float                                   as duration_s,
  (s->>'movingDuration')::float                             as moving_s,
  (s->>'elapsedDuration')::float                            as elapsed_s,
  nullif((s->>'averageSpeed')::float, 0)                    as avg_speed_mps,
  (s->>'duration')::float / nullif((s->>'distance')::float / 1000, 0) as pace_s_per_km,
  nullif((s->>'avgGradeAdjustedSpeed')::float, 0)           as avg_gap_speed_mps,
  (s->>'maxSpeed')::float                                   as max_speed_mps,
  (s->>'averageHR')::float                                  as avg_hr,
  (s->>'maxHR')::float                                      as max_hr,
  (s->>'averageRunningCadenceInStepsPerMinute')::float      as avg_cadence_spm,
  (s->>'elevationGain')::float                              as elevation_gain_m,
  (s->>'elevationLoss')::float                              as elevation_loss_m,
  (s->>'calories')::float                                   as calories,
  (s->>'steps')::float                                      as steps,
  (s->>'activityTrainingLoad')::float                       as training_load,
  (s->>'aerobicTrainingEffect')::float                      as aerobic_te,
  (s->>'anaerobicTrainingEffect')::float                    as anaerobic_te,
  s->>'trainingEffectLabel'                                 as te_label,
  (s->>'vO2MaxValue')::float                                as vo2max,
  (s->>'avgStrideLength')::float                            as avg_stride_cm,
  (s->>'avgVerticalOscillation')::float                     as avg_vert_osc_cm,
  (s->>'avgGroundContactTime')::float                       as avg_gct_ms,
  (s->>'avgPower')::float                                   as avg_power_w,
  coalesce((s->>'hrTimeInZone_1')::float, 0)                as hr_z1_s,
  coalesce((s->>'hrTimeInZone_2')::float, 0)                as hr_z2_s,
  coalesce((s->>'hrTimeInZone_3')::float, 0)                as hr_z3_s,
  coalesce((s->>'hrTimeInZone_4')::float, 0)                as hr_z4_s,
  coalesce((s->>'hrTimeInZone_5')::float, 0)                as hr_z5_s,
  (s->>'lapCount')::int                                     as lap_count,
  coalesce((s->>'pr')::boolean, false)                      as has_pr,
  (s->>'minTemperature')::float                             as min_temp_c,
  (s->>'maxTemperature')::float                             as max_temp_c,
  -- Effective VO2max (Runalyze): Daniels' oxygen cost of the run's average speed, divided by the
  -- %VO2max implied by its average heart rate, %VO2max = (%HRmax - 0.37) / 0.64.
  -- Only runs of 1 km+ and 10 min+ at 63-100 % of HRmax; uncorrected (no race calibration).
  case when (s->'activityType'->>'typeKey') like '%running%'
         and (s->>'distance')::float >= 1000 and (s->>'duration')::float >= 600
         and (s->>'averageHR')::float / hr.hrmax between 0.63 and 1.0
       then (-4.60 + 0.182258 * v.m_per_min + 0.000104 * v.m_per_min ^ 2)
            / (((s->>'averageHR')::float / hr.hrmax - 0.37) / 0.64)
  end                                                       as vo2_effective,
  hr.hrmax                                                  as hr_max_used,
  -- Races the user marked (app.race), and unmarked runs that look like one: a standard distance
  -- (within 4 %), outdoors, at 85 %+ of HRmax on average.
  rc.race_id is not null                                    as is_race,
  rc.race_id,
  rc.name                                                   as race_name,
  rc.distance_km                                            as race_distance_km,
  coalesce(rc.official_time_s, (s->>'duration')::float)     as race_time_s,
  rc.priority                                               as race_priority,
  rc.goal_time_s                                            as race_goal_time_s,
  rc.race_id is null
    and (s->'activityType'->>'typeKey') in ('running', 'trail_running', 'track_running')
    and std.distance_km is not null
    and (s->>'averageHR')::float / hr.hrmax >= 0.85         as is_race_candidate,
  std.distance_km                                           as standard_distance_km,
  -- Weather during the activity: Open-Meteo hourly values averaged over the hours it overlaps,
  -- else Garmin's reading at the start (station-based). Indoor activities (no GPS) have none.
  wx.source                                                 as weather_source,
  wx.temp_c,
  wx.humidity_pct,
  wx.dew_point_c,
  wx.wind_kmh,
  wx.radiation_wm2,
  -- WBGT estimate (Australian Bureau of Meteorology, shade, from temperature and humidity).
  0.567 * wx.temp_c
    + 0.393 * (wx.humidity_pct / 100 * 6.105 * exp(17.27 * wx.temp_c / (237.7 + wx.temp_c)))
    + 3.94                                                  as wbgt_c,
  a.summary->>'startLatitude' is null                       as is_indoor
from raw.activity a
cross join hr
left join app.race rc on rc.activity_id = a.activity_id
left join lateral (
  select d as distance_km from (values (5.0), (10.0), (21.0975), (42.195)) v(d)
  where abs((a.summary->>'distance')::float / 1000 - d) / d < 0.04
) std on true
cross join lateral (select a.summary as s) x
cross join lateral (select (x.s->>'distance')::float / nullif((x.s->>'duration')::float / 60, 0) as m_per_min) v
left join lateral (
  select coalesce(om.source, gw.source) as source,
         coalesce(om.temp_c, gw.temp_c) as temp_c,
         coalesce(om.humidity_pct, gw.humidity_pct) as humidity_pct,
         coalesce(om.dew_point_c, gw.dew_point_c) as dew_point_c,
         coalesce(om.wind_kmh, gw.wind_kmh) as wind_kmh,
         om.radiation_wm2
  from (select 1) one
  left join lateral (
    select d.payload->>'source' as source,
           (select avg(v::float) from jsonb_array_elements_text(d.payload->'hourly'->'temperature_2m') v) as temp_c,
           (select avg(v::float) from jsonb_array_elements_text(d.payload->'hourly'->'relative_humidity_2m') v) as humidity_pct,
           (select avg(v::float) from jsonb_array_elements_text(d.payload->'hourly'->'dew_point_2m') v) as dew_point_c,
           (select avg(v::float) from jsonb_array_elements_text(d.payload->'hourly'->'wind_speed_10m') v) as wind_kmh,
           (select avg(v::float) from jsonb_array_elements_text(d.payload->'hourly'->'shortwave_radiation') v) as radiation_wm2
    from raw.activity_doc d
    where d.activity_id = a.activity_id and d.kind = 'open_meteo'
      and jsonb_array_length(coalesce(d.payload->'hourly'->'temperature_2m', '[]')) > 0
  ) om on true
  left join lateral (
    select 'garmin' as source,
           ((d.payload->>'temp')::float - 32) * 5 / 9 as temp_c,
           (d.payload->>'relativeHumidity')::float as humidity_pct,
           ((d.payload->>'dewPoint')::float - 32) * 5 / 9 as dew_point_c,
           (d.payload->>'windSpeed')::float * 1.609 as wind_kmh
    from raw.activity_doc d
    where d.activity_id = a.activity_id and d.kind = 'weather' and d.payload ? 'temp'
  ) gw on true
  where a.summary->>'startLatitude' is not null
) wx on true;

-- One row per lap (Garmin's lapDTOs: auto-laps or workout steps).
create view garmin.lap as
select
  d.activity_id * 1000 + (l->>'lapIndex')::int              as lap_id,
  d.activity_id,
  (l->>'lapIndex')::int                                     as lap_index,
  (l->>'startTimeGMT')::timestamp at time zone 'UTC'        as start_time_gmt,
  l->>'intensityType'                                       as intensity_type,
  (l->>'wktStepIndex')::int                                 as workout_step,
  (l->>'distance')::float / 1000                            as distance_km,
  (l->>'duration')::float                                   as duration_s,
  (l->>'movingDuration')::float                             as moving_s,
  nullif((l->>'averageSpeed')::float, 0)                    as avg_speed_mps,
  (l->>'duration')::float / nullif((l->>'distance')::float / 1000, 0) as pace_s_per_km,
  nullif((l->>'avgGradeAdjustedSpeed')::float, 0)           as avg_gap_speed_mps,
  (l->>'averageHR')::float                                  as avg_hr,
  (l->>'maxHR')::float                                      as max_hr,
  (l->>'averageRunCadence')::float                          as avg_cadence_spm,
  (l->>'elevationGain')::float                              as elevation_gain_m,
  (l->>'elevationLoss')::float                              as elevation_loss_m,
  (l->>'strideLength')::float                               as stride_cm,
  (l->>'groundContactTime')::float                          as gct_ms,
  (l->>'verticalOscillation')::float                        as vert_osc_cm
from raw.activity_doc d, jsonb_array_elements(d.payload->'lapDTOs') l
where d.kind = 'splits';

-- One row per weigh-in: Garmin's (masses in grams) and those entered in the app.
create view garmin.body_composition as
select
  sample_pk::text                                            as sample_pk,
  to_timestamp((payload->>'timestampGMT')::bigint / 1000.0)  as measured_at,
  (payload->>'calendarDate')::date                           as calendar_date,
  (payload->>'weight')::float / 1000                         as weight_kg,
  (payload->>'bmi')::float                                   as bmi,
  (payload->>'bodyFat')::float                               as body_fat_pct,
  (payload->>'muscleMass')::float / 1000                     as muscle_mass_kg,
  payload->>'sourceType'                                     as source_type,
  null::bigint                                               as weigh_in_id
from raw.body_composition
union all
select 'app:' || weigh_in_id, created_at, measured_on, weight_kg, null, body_fat_pct, null, 'APP', weigh_in_id
from app.weigh_in;

-- D2 threshold: Garmin's lactate-threshold estimates, one row per day any of them changed.
-- Garmin stores the speed in units of 10 m/s.
create view garmin.threshold as
with e as (
  select (x->>'from')::date as calendar_date, k.series, (x->>'value')::float as value
  from raw.doc d
  cross join (values ('heart_rate'), ('speed'), ('power')) k(series)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.payload->k.series) = 'array'
                                               then d.payload->k.series else '[]'::jsonb end) x
  where d.key like 'lactate\_threshold:%'
  union all
  select left(d.payload->'speed_and_heart_rate'->>'calendarDate', 10)::date, k.series, k.value
  from raw.doc d
  cross join lateral (values
    ('heart_rate', (d.payload->'speed_and_heart_rate'->>'heartRate')::float),
    ('speed',      (d.payload->'speed_and_heart_rate'->>'speed')::float),
    ('power',      (d.payload->'power'->>'functionalThresholdPower')::float)) k(series, value)
  where d.key = 'lactate_threshold_latest' and d.payload->'speed_and_heart_rate'->>'calendarDate' is not null
)
select
  calendar_date,
  max(value) filter (where series = 'heart_rate')                          as lthr_bpm,
  max(value) filter (where series = 'speed') * 10                          as lt_speed_mps,
  1000 / nullif(max(value) filter (where series = 'speed') * 10, 0)        as lt_pace_s_per_km,
  max(value) filter (where series = 'power')                               as ftp_w
from e
where value is not null
group by calendar_date;

-- Per-run markers from the per-second samples. Materialized (the sync refreshes it before day).
--   speed_at_easy_hr  median grade-adjusted speed at 77 % HRmax ± 5 bpm (~150 bpm): aerobic
--                     fitness and economy (D1 + D3) on steady runs (no workouts: their recovery
--                     jogs pair slow speed with HR still high from the rep)
--   speed_at_lthr     the same at Garmin's threshold HR of that date ± 3 bpm (D2), from tempo work
--                     Both skip the first 10 min (HR lags pace) and need a minimum time in the band.
--   decoupling_pct    efficiency (speed / HR) of the first half minus the second, as % of the first
--                     (D4 durability); steady runs of 60 min+, no workouts. < 5 % = durable
--   second_half_pct   time of the second half of the distance vs the first, in % (D8 pacing):
--                     positive = slowed down
--   rep_*             workout runs: the main set's pace spread and fade, first reps vs last (D8)
create materialized view garmin.activity_marker as
with run as (
  select a.activity_id, a.start_date, a.is_workout,
         round(0.77 * a.hr_max_used) as easy_hr_ref,
         coalesce((select t.lthr_bpm from garmin.threshold t
                    where t.calendar_date <= a.start_date and t.lthr_bpm is not null
                    order by t.calendar_date desc limit 1),
                  round(0.9 * a.hr_max_used)) as lthr_ref
  from garmin.activity a
  where a.is_run
),
smp as (
  select r.activity_id, r.is_workout, r.easy_hr_ref, r.lthr_ref,
         s.elapsed_s, s.distance_m, s.heart_rate,
         coalesce(s.grade_adj_speed_mps, s.speed_mps) as v,
         least(greatest(s.elapsed_s - lag(s.elapsed_s) over (partition by s.activity_id order by s.seq), 0), 10) as dt
  from run r join garmin.activity_sample s using (activity_id)
),
span as (
  select activity_id, max(elapsed_s) as end_s, max(distance_m) as end_m from smp group by activity_id
),
agg as (
  select m.activity_id, max(m.easy_hr_ref) as easy_hr_ref, max(m.lthr_ref) as lthr_ref,
    percentile_cont(0.5) within group (order by m.v)
      filter (where abs(m.heart_rate - m.easy_hr_ref) <= 5 and m.elapsed_s >= 600 and m.v > 1) as speed_at_easy_hr_mps,
    sum(m.dt) filter (where abs(m.heart_rate - m.easy_hr_ref) <= 5 and m.elapsed_s >= 600 and m.v > 1) / 60 as easy_band_min,
    percentile_cont(0.5) within group (order by m.v)
      filter (where abs(m.heart_rate - m.lthr_ref) <= 3 and m.elapsed_s >= 600 and m.v > 1) as speed_at_lthr_mps,
    sum(m.dt) filter (where abs(m.heart_rate - m.lthr_ref) <= 3 and m.elapsed_s >= 600 and m.v > 1) / 60 as lt_band_min,
    -- durability: halves of the time after the first 10 min
    avg(m.v) filter (where m.elapsed_s >= 600 and m.elapsed_s < (600 + sp.end_s) / 2 and m.v > 1)
      / nullif(avg(m.heart_rate) filter (where m.elapsed_s >= 600 and m.elapsed_s < (600 + sp.end_s) / 2 and m.v > 1), 0) as ef_first,
    avg(m.v) filter (where m.elapsed_s >= (600 + sp.end_s) / 2 and m.v > 1)
      / nullif(avg(m.heart_rate) filter (where m.elapsed_s >= (600 + sp.end_s) / 2 and m.v > 1), 0) as ef_second,
    stddev_pop(m.v) filter (where m.elapsed_s >= 600 and m.v > 1)
      / nullif(avg(m.v) filter (where m.elapsed_s >= 600 and m.v > 1), 0) as speed_cv,
    -- pacing: elapsed time when half the distance was reached
    min(m.elapsed_s) filter (where m.distance_m >= sp.end_m / 2) as half_s,
    max(sp.end_s) as end_s, bool_or(m.is_workout) as is_workout
  from smp m join span sp using (activity_id)
  group by m.activity_id
),
active_lap as (
  select l.*, count(*) over (partition by l.activity_id, l.workout_step) as step_reps
  from garmin.lap l
  where l.intensity_type in ('ACTIVE', 'INTERVAL') and l.duration_s >= 30 and l.distance_km >= 0.1
    and l.activity_id in (select activity_id from run where is_workout)
),
-- The main set: the active step repeated most often (the same rep each time), so ladders and
-- mixed sets compare like with like.
main_step as (
  select distinct on (activity_id) activity_id, workout_step
  from active_lap order by activity_id, step_reps desc, workout_step
),
reps as (
  select l.activity_id,
         count(*) as rep_count,
         stddev_pop(l.pace_s_per_km) / nullif(avg(l.pace_s_per_km), 0) * 100 as rep_pace_cv_pct,
         array_agg(l.pace_s_per_km order by l.lap_index) as paces
  from active_lap l join main_step m on m.activity_id = l.activity_id
                                     and m.workout_step is not distinct from l.workout_step
  group by l.activity_id
  having count(*) >= 3
)
select
  a.activity_id,
  a.easy_hr_ref,
  a.lthr_ref,
  case when a.easy_band_min >= 5 and not a.is_workout and a.speed_cv < 0.25
       then a.speed_at_easy_hr_mps end                                      as speed_at_easy_hr_mps,
  case when a.easy_band_min >= 5 and not a.is_workout and a.speed_cv < 0.25
       then 1000 / nullif(a.speed_at_easy_hr_mps, 0) end                    as easy_hr_pace_s_per_km,
  a.easy_band_min,
  case when a.lt_band_min >= 3 then a.speed_at_lthr_mps end                as speed_at_lthr_mps,
  case when a.lt_band_min >= 3 then 1000 / nullif(a.speed_at_lthr_mps, 0) end as lthr_pace_s_per_km,
  a.lt_band_min,
  case when a.end_s >= 3600 and not a.is_workout and a.speed_cv < 0.15
       then (a.ef_first - a.ef_second) / nullif(a.ef_first, 0) * 100 end   as decoupling_pct,
  case when a.half_s > 0 and a.end_s > a.half_s
       then ((a.end_s - a.half_s) - a.half_s) / a.half_s * 100 end         as second_half_pct,
  r.rep_count,
  r.rep_pace_cv_pct,
  -- mean pace of the last third of the reps vs the first third, in %: positive = faded
  case when r.rep_count >= 3 then
    ((select avg(p) from unnest(r.paces[r.rep_count - r.rep_count / 3 + 1 : r.rep_count]) p)
     / (select avg(p) from unnest(r.paces[1 : greatest(r.rep_count / 3, 1)]) p) - 1) * 100
  end                                                                       as rep_fade_pct
from agg a
left join reps r using (activity_id);

create unique index on garmin.activity_marker (activity_id);

-- Training load per activity: Banister's TRIMP (Banister 1991; Morton, Fitz-Clarke & Banister 1990),
-- built here instead of Garmin's undisclosed load. Materialized; the sync refreshes it before day.
--   HRr   = clamp((HR - HRrest) / (HRmax - HRrest), 0, 1)
--   TRIMP = sum over samples of dt_min * HRr * a * e^(b * HRr), a, b = 0.64, 1.92 (male) or
--           0.86, 1.67 (female), from the Garmin profile's sex
--   dt    = gap to the previous sample, capped at 10 s, so pauses add nothing
--   HRrest: that day's resting HR, else the median over the previous 30 days, else the overall median
--   HRmax:  as garmin.activity (Garmin's configured value)
-- load_source: 'samples' (per-second HR), 'avg_hr' (no usable samples: the same formula on the
-- average HR over the duration, which reads a little low), 'garmin_scaled' (no HR: Garmin's load
-- times the median TRIMP / Garmin-load ratio, to keep the units), 'none' (nothing to go on: 0).
create materialized view garmin.activity_load as
with coef as (
  select case when sex = 'FEMALE' then 0.86 else 0.64 end as a,
         case when sex = 'FEMALE' then 1.67 else 1.92 end as b,
         sex
  from (select coalesce((select upper(payload->'userData'->>'gender') from raw.doc where key = 'user_profile'),
                        'MALE') as sex) x
),
rhr_day as (
  select calendar_date, (payload->>'restingHeartRate')::float as v
  from raw.daily
  where kind = 'user_summary' and (payload->>'restingHeartRate')::float > 0
),
act as (
  select a.activity_id, a.start_date, a.hr_max_used, a.avg_hr, a.duration_s, a.training_load,
         coalesce(
           (select r.v from rhr_day r where r.calendar_date = a.start_date),
           (select percentile_cont(0.5) within group (order by r.v) from rhr_day r
              where r.calendar_date between a.start_date - 30 and a.start_date - 1),
           (select percentile_cont(0.5) within group (order by r.v) from rhr_day r)) as hr_rest
  from garmin.activity a
),
smp as (
  select s.activity_id, s.heart_rate,
         least(greatest(s.elapsed_s - lag(s.elapsed_s) over (partition by s.activity_id order by s.seq), 0), 10) as dt
  from garmin.activity_sample s
),
by_samples as (
  select m.activity_id,
         sum(m.dt / 60.0 * x.hrr * c.a * exp(c.b * x.hrr)) as trimp,
         sum(m.dt) as hr_seconds
  from smp m
  join act on act.activity_id = m.activity_id
  cross join coef c
  cross join lateral (select greatest(least((m.heart_rate - act.hr_rest) / nullif(act.hr_max_used - act.hr_rest, 0), 1), 0) as hrr) x
  where m.heart_rate > 0 and m.dt is not null
  group by m.activity_id
),
first_pass as (
  select act.*,
         case when b.hr_seconds >= 60 then b.trimp
              when act.avg_hr > 0 and act.duration_s > 0 then
                act.duration_s / 60.0 * x.hrr * c.a * exp(c.b * x.hrr)
         end as trimp,
         case when b.hr_seconds >= 60 then 'samples'
              when act.avg_hr > 0 and act.duration_s > 0 then 'avg_hr'
         end as load_source
  from act
  cross join coef c
  left join by_samples b using (activity_id)
  cross join lateral (select greatest(least((act.avg_hr - act.hr_rest) / nullif(act.hr_max_used - act.hr_rest, 0), 1), 0) as hrr) x
),
ratio as (
  select percentile_cont(0.5) within group (order by trimp / training_load) as r
  from first_pass where load_source = 'samples' and training_load > 0 and trimp > 0
)
select
  f.activity_id,
  f.start_date,
  coalesce(f.trimp, f.training_load * (select r from ratio), 0)               as trimp,
  coalesce(f.load_source, case when f.training_load > 0 then 'garmin_scaled' else 'none' end) as load_source,
  f.hr_rest                                                                    as hr_rest_used,
  f.hr_max_used,
  (select sex from coef)                                                       as sex_used,
  f.training_load                                                              as training_load_garmin
from first_pass f;

create unique index on garmin.activity_load (activity_id);

-- One row per calendar day, from the first synced day to today. Materialized (the sync refreshes
-- it): wellness, plus Runalyze-style training calculations on TRIMP (garmin.activity_load);
-- Garmin's own load runs alongside as *_garmin for comparison:
--   atl / ctl     7- and 42-day exponentially weighted load ("fatigue" / "fitness"); tsb = ctl - atl
--   *_pct         as % of the highest value up to that day
--   acwr          acute:chronic ratio, atl / ctl
--   monotony      7-day mean / standard deviation of daily load (capped at 10); strain = 7-day load x monotony
--   easy_load     the load tomorrow that keeps tsb at 0; rest_days when that is negative
--   vo2_effective duration-weighted mean of runs' effective VO2max over the last 30 days
--   marathon_shape 2/3 weekly-km score + 1/3 long-run score (Runalyze's basic endurance), in %
--   lthr_bpm, lt_*  Garmin's threshold (D2) in force that day; lt_speed_own_mps = median speed at
--                   threshold HR in the runner's own runs over 42 days
--   vvo2max_mps     speed at VO2max from Garmin's VO2max (Daniels' oxygen-cost curve, inverted);
--                   lt_fraction = lt_speed / vvo2max: fractional utilisation (D2)
--   flag_*          injury-risk cautions (D10), not predictions: load ramp (acwr > 1.5),
--                   monotony > 2, no day off in 7 days, and resting HR up: its 3-day mean above the
--                   28-day median by 5 bpm and by more than that period's standard deviation
--                   (Garmin's daily resting HR is noisy, so the bar is personal)
create materialized view garmin.day as
with recursive
bounds as (
  select least((select min(calendar_date) from raw.daily),
               (select min((summary->>'startTimeLocal')::date) from raw.activity)) as first_day
),
spine as (
  select generate_series(first_day, current_date, interval '1 day')::date as calendar_date
  from bounds where first_day is not null
),
load as (
  select sp.calendar_date,
         coalesce(sum(al.trimp), 0)                as training_load,
         coalesce(sum(al.training_load_garmin), 0) as training_load_garmin,
         row_number() over (order by sp.calendar_date) as n
  from spine sp
  left join garmin.activity_load al on al.start_date = sp.calendar_date
  group by sp.calendar_date
),
ewma as (
  select calendar_date, n, training_load, training_load_garmin,
         training_load * (1 - exp(-1.0 / 7))         as atl,
         training_load * (1 - exp(-1.0 / 42))        as ctl,
         training_load_garmin * (1 - exp(-1.0 / 7))  as atl_garmin,
         training_load_garmin * (1 - exp(-1.0 / 42)) as ctl_garmin
  from load where n = 1
  union all
  select l.calendar_date, l.n, l.training_load, l.training_load_garmin,
         e.atl + (l.training_load - e.atl) * (1 - exp(-1.0 / 7)),
         e.ctl + (l.training_load - e.ctl) * (1 - exp(-1.0 / 42)),
         e.atl_garmin + (l.training_load_garmin - e.atl_garmin) * (1 - exp(-1.0 / 7)),
         e.ctl_garmin + (l.training_load_garmin - e.ctl_garmin) * (1 - exp(-1.0 / 42))
  from ewma e join load l on l.n = e.n + 1
),
stats as (
  select e.*,
         sum(training_load) over w7                        as load_7d,
         avg(training_load) over w7                        as mean_7d,
         stddev_pop(training_load) over w7                 as sd_7d,
         max(atl) over (order by calendar_date)            as atl_max,
         max(ctl) over (order by calendar_date)            as ctl_max
  from ewma e
  window w7 as (order by calendar_date rows between 6 preceding and current row)
),
runs as (
  select activity_id, start_date, distance_km, duration_s, vo2_effective, vo2max
  from garmin.activity where is_run
),
vo2 as (
  select s.calendar_date,
         (select sum(r.vo2_effective * r.duration_s) / nullif(sum(r.duration_s) filter (where r.vo2_effective is not null), 0)
            from runs r where r.start_date between s.calendar_date - 29 and s.calendar_date
                          and r.vo2_effective is not null)                         as vo2_effective,
         (select r.vo2max from runs r where r.start_date <= s.calendar_date and r.vo2max is not null
            order by r.start_date desc limit 1)                                    as vo2max_garmin,
         (select sum(r.distance_km) from runs r
            where r.start_date between s.calendar_date - 181 and s.calendar_date)  as km_182d
  from stats s
),
shape as (
  select v.*,
         coalesce(v.vo2_effective, v.vo2max_garmin)                                as vo2_for_shape
  from vo2 v
),
marathon as (
  select sh.calendar_date, sh.vo2_effective, sh.vo2max_garmin, sh.km_182d,
         case when sh.vo2_for_shape > 0 then
           100 * (2.0 / 3 * (coalesce(sh.km_182d, 0) / 26) / power(sh.vo2_for_shape, 1.135)
                + 1.0 / 3 * coalesce((
                    select sum((2 - 2.0 * (sh.calendar_date - r.start_date) / 70)
                               * power((r.distance_km - 13) / (ln(sh.vo2_for_shape / 4) * 12 - 13), 2))
                    from runs r
                    where r.start_date between sh.calendar_date - 69 and sh.calendar_date
                      and r.distance_km >= 13), 0) / 10)
         end                                                                        as marathon_shape
  from shape sh
),
thr as (
  select s.calendar_date,
         (select t.lthr_bpm from garmin.threshold t where t.calendar_date <= s.calendar_date
            and t.lthr_bpm is not null order by t.calendar_date desc limit 1)              as lthr_bpm,
         (select t.lt_speed_mps from garmin.threshold t where t.calendar_date <= s.calendar_date
            and t.lt_speed_mps is not null order by t.calendar_date desc limit 1)          as lt_speed_mps,
         (select t.ftp_w from garmin.threshold t where t.calendar_date <= s.calendar_date
            and t.ftp_w is not null order by t.calendar_date desc limit 1)                 as ftp_w,
         (select percentile_cont(0.5) within group (order by k.speed_at_lthr_mps)
            from garmin.activity_marker k join runs r on r.activity_id = k.activity_id
            where r.start_date between s.calendar_date - 41 and s.calendar_date)           as lt_speed_own_mps,
         (select percentile_cont(0.5) within group (order by k.speed_at_easy_hr_mps)
            from garmin.activity_marker k join runs r on r.activity_id = k.activity_id
            where r.start_date between s.calendar_date - 27 and s.calendar_date)           as easy_hr_speed_mps,
         (select b.weight_kg from garmin.body_composition b where b.calendar_date <= s.calendar_date
            and b.weight_kg is not null order by b.calendar_date desc, b.measured_at desc limit 1) as weight_kg,
         (select count(*) from load l where l.calendar_date between s.calendar_date - 6 and s.calendar_date
            and l.training_load = 0)                                                       as days_off_7d
  from stats s
),
w as (
  select calendar_date,
         max(payload::text) filter (where kind = 'user_summary')::jsonb       as us,
         max(payload::text) filter (where kind = 'sleep')::jsonb              as sl,
         max(payload::text) filter (where kind = 'hrv')::jsonb                as hrv,
         max(payload::text) filter (where kind = 'training_readiness')::jsonb as tr
  from raw.daily group by calendar_date
)
select
  s.calendar_date,
  s.training_load,
  s.atl,
  s.ctl,
  s.ctl - s.atl                                                       as tsb,
  s.training_load_garmin,
  s.atl_garmin,
  s.ctl_garmin,
  s.ctl_garmin - s.atl_garmin                                         as tsb_garmin,
  100 * s.atl / nullif(s.atl_max, 0)                                  as atl_pct,
  100 * s.ctl / nullif(s.ctl_max, 0)                                  as ctl_pct,
  s.atl / nullif(s.ctl, 0)                                            as acwr,
  s.load_7d,
  least(s.mean_7d / nullif(s.sd_7d, 0), 10)                           as monotony,
  s.load_7d * least(s.mean_7d / nullif(s.sd_7d, 0), 10)               as strain,
  greatest((s.ctl * exp(-1.0 / 42) - s.atl * exp(-1.0 / 7)) / (exp(-1.0 / 42) - exp(-1.0 / 7)), 0) as easy_load,
  case when s.ctl * exp(-1.0 / 42) < s.atl * exp(-1.0 / 7) and s.ctl > 0
       then ceil(ln(s.atl / s.ctl) / (1.0 / 7 - 1.0 / 42)) end        as rest_days,
  m.vo2_effective,
  m.vo2max_garmin,
  m.km_182d,
  m.marathon_shape,
  t.lthr_bpm,
  t.lt_speed_mps,
  1000 / nullif(t.lt_speed_mps, 0)                                    as lt_pace_s_per_km,
  t.ftp_w,
  t.lt_speed_own_mps,
  1000 / nullif(t.lt_speed_own_mps, 0)                                as lt_pace_own_s_per_km,
  t.easy_hr_speed_mps,
  1000 / nullif(t.easy_hr_speed_mps, 0)                               as easy_hr_pace_s_per_km,
  vv.vvo2max_mps,
  t.lt_speed_mps / nullif(vv.vvo2max_mps, 0)                          as lt_fraction,
  t.weight_kg,
  t.days_off_7d,
  coalesce(s.atl / nullif(s.ctl, 0) > 1.5, false)                     as flag_ramp,
  coalesce(least(s.mean_7d / nullif(s.sd_7d, 0), 10) > 2, false)      as flag_monotony,
  t.days_off_7d = 0                                                   as flag_no_rest,
  coalesce(rhr.mean_3d >= rhr.median_28d + greatest(5, rhr.sd_28d), false) as flag_resting_hr,
  coalesce(s.atl / nullif(s.ctl, 0) > 1.5, false)::int
    + coalesce(least(s.mean_7d / nullif(s.sd_7d, 0), 10) > 2, false)::int
    + (t.days_off_7d = 0)::int
    + coalesce(rhr.mean_3d >= rhr.median_28d + greatest(5, rhr.sd_28d), false)::int as risk_flags,
  (w.us->>'restingHeartRate')::float                                  as resting_hr,
  (w.us->>'totalSteps')::float                                        as steps,
  nullif((w.us->>'averageStressLevel')::float, -1)                    as avg_stress,
  (w.us->>'bodyBatteryHighestValue')::float                           as body_battery_high,
  (w.us->>'bodyBatteryLowestValue')::float                            as body_battery_low,
  (w.us->>'totalKilocalories')::float                                 as total_kcal,
  (w.us->>'activeKilocalories')::float                                as active_kcal,
  (w.us->>'moderateIntensityMinutes')::float                          as moderate_minutes,
  (w.us->>'vigorousIntensityMinutes')::float                          as vigorous_minutes,
  (w.sl->'dailySleepDTO'->>'sleepTimeSeconds')::float                 as sleep_s,
  (w.sl->'dailySleepDTO'->>'deepSleepSeconds')::float                 as deep_sleep_s,
  (w.sl->'dailySleepDTO'->>'lightSleepSeconds')::float                as light_sleep_s,
  (w.sl->'dailySleepDTO'->>'remSleepSeconds')::float                  as rem_sleep_s,
  (w.sl->'dailySleepDTO'->>'awakeSleepSeconds')::float                as awake_sleep_s,
  (w.sl->'dailySleepDTO'->'sleepScores'->'overall'->>'value')::float  as sleep_score,
  (w.hrv->'hrvSummary'->>'lastNightAvg')::float                       as hrv_last_night_ms,
  (w.hrv->'hrvSummary'->>'weeklyAvg')::float                          as hrv_weekly_ms,
  w.hrv->'hrvSummary'->>'status'                                      as hrv_status,
  (w.tr->0->>'score')::float                                          as readiness_score,
  w.tr->0->>'level'                                                   as readiness_level
from stats s
join marathon m using (calendar_date)
join thr t using (calendar_date)
left join w using (calendar_date)
cross join lateral (
  -- Daniels: VO2 = -4.60 + 0.182258 v + 0.000104 v^2 (v in m/min), solved for v
  select (-0.182258 + sqrt(0.182258 ^ 2 + 4 * 0.000104 * (m.vo2max_garmin + 4.60))) / (2 * 0.000104) / 60 as vvo2max_mps
) vv
left join lateral (
  select percentile_cont(0.5) within group (order by v) filter (where d.calendar_date < s.calendar_date - 2) as median_28d,
         stddev_samp(v) filter (where d.calendar_date < s.calendar_date - 2)                               as sd_28d,
         avg(v) filter (where d.calendar_date >= s.calendar_date - 2)                                       as mean_3d
  from raw.daily d, lateral (select (d.payload->>'restingHeartRate')::float as v) x
  where d.kind = 'user_summary' and d.calendar_date between s.calendar_date - 30 and s.calendar_date and v is not null
) rhr on true;

create unique index on garmin.day (calendar_date);


-- Garmin race predictions, one row per day they were computed (yearly range documents plus the
-- latest). Times in seconds.
create view garmin.race_prediction as
select distinct on (calendar_date)
  calendar_date,
  (e->>'time5K')::float            as time_5k_s,
  (e->>'time10K')::float           as time_10k_s,
  (e->>'timeHalfMarathon')::float  as time_half_s,
  (e->>'timeMarathon')::float      as time_marathon_s
from (
  select (e->>'calendarDate')::date as calendar_date, e, d.fetched_at
  from raw.doc d,
       jsonb_array_elements(case jsonb_typeof(d.payload) when 'array' then d.payload
                                                        when 'object' then jsonb_build_array(d.payload)
                                                        else '[]'::jsonb end) e
  where d.key like 'race_predictions%'
) x
where calendar_date is not null and e ? 'time5K'
order by calendar_date, fetched_at desc;

-- Every race the user entered: past (with its activity's result) and upcoming goals.
create view garmin.race as
select
  r.race_id,
  r.activity_id,
  r.race_date,
  r.name,
  r.distance_km,
  r.priority,
  r.notes,
  r.goal_time_s,
  r.goal_time_s / r.distance_km                                         as goal_pace_s_per_km,
  -- Negative = faster than the goal. Upcoming races have no result yet, so none.
  coalesce(r.official_time_s, (a.summary->>'duration')::float) - r.goal_time_s as result_vs_goal_s,
  coalesce(r.official_time_s, (a.summary->>'duration')::float)          as result_time_s,
  coalesce(r.official_time_s, (a.summary->>'duration')::float) / r.distance_km as result_pace_s_per_km,
  r.race_date > current_date or (r.activity_id is null and r.race_date = current_date) as is_upcoming
from app.race r
left join raw.activity a using (activity_id);
