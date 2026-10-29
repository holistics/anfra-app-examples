-- Race Planner (Phase 4): the plan, its projection to race day, and an interim race forecast.
-- Built only on garmin.day.training_load / atl / ctl / tsb ("the load", whatever it is computed
-- from) and garmin.activity, so it holds when the load model changes.
drop view if exists garmin.planner_param, garmin.activity_session, garmin.session_profile, garmin.plan_day,
  garmin.plan_week, garmin.projection, garmin.race_forecast, garmin.race_limiter cascade;

-- Every constant the planner uses, in one place, with where it comes from.
create view garmin.planner_param (name, value, description) as values
  ('atl_days',        7.0,   'Fatigue time constant (days); the same as garmin.day'),
  ('ctl_days',        42.0,  'Fitness time constant (days); the same as garmin.day'),
  ('tsb_band_low',    0.10,  'Race-morning form target, low end, as a share of fitness (TSB / CTL). Allen & Coggan''s +15 to +25 TSS at a typical CTL of 60 to 100, made scale-free so it holds for any load metric'),
  ('tsb_band_high',   0.30,  'Race-morning form target, high end, as a share of fitness (TSB / CTL)'),
  ('heat_pct_per_c',  0.5,   'Interim heat penalty: % slower per °C WBGT. Ely et al. 2007: elite men slow ~0.9 % per 5 °C, slower runners more; to be replaced by the personal coefficient (Stream D)'),
  ('forecast_band_pct', 2.5, 'Interim ± band on the forecast, in %. Tanda 2011 SEE ~4 min, 2022 RMSE 5.4 min (~2.5 % at 3:35); to be replaced by validated error on marked races (Stream D)'),
  ('taper_gain_pct',  2.0,   'Taper (D5): % faster with a taper that lands race-morning form in the band. Bosquet 2007 meta-analysis (2-week taper, 41 to 60 % less volume); Mujika & Padilla 2003 report ~3 % (0.5 to 6 %). Applied only when the plan misses the band, since the calibration already reflects how this runner usually tapers'),
  ('riegel_exponent', 1.06,  'Riegel 1981: T2 = T1 x (D2 / D1)^1.06, to carry Garmin''s nearest prediction to another distance'),
  ('ramp_max_pct',    10.0,  'Caution when planned weekly km rises more than this over the most of the previous 3 weeks, so returning after a recovery week is not a ramp (common 10 % guideline; weak evidence, a caution only)'),
  ('long_max_share',  0.45,  'Caution when the long run exceeds this share of the week''s km. 30 % is a common heuristic, but at 35 to 65 km/week it would cap marathon long runs at 10 to 20 km; established marathon plans run ~35 to 45 %'),
  ('long_max_km',     32.0,  'Longest planned long run for a marathon (km); 21 for a half, 15 below');

-- Each activity as the kind of session it was, for profiles and planned vs done.
--   long: a run of 90 min+; intervals / threshold: from Garmin's training-effect label; strength.
create view garmin.activity_session as
select
  a.activity_id,
  a.start_date,
  case
    when a.sport = 'Strength' then 'strength'
    when not a.is_run then 'other'
    when a.is_race then 'race'
    when a.duration_s >= 90 * 60 then 'long'
    when a.te_label in ('VO2MAX', 'SPEED', 'ANAEROBIC_CAPACITY') then 'intervals'
    when a.te_label in ('LACTATE_THRESHOLD', 'TEMPO') then 'threshold'
    else 'easy'
  end                     as kind,
  a.is_run,
  a.distance_km,
  a.duration_s / 60       as minutes,
  a.pace_s_per_km,
  a.wbgt_c,
  a.is_indoor
from garmin.activity a;

-- The runner's own profile per kind of session over the last 365 days: typical pace, and load per
-- minute. Load per minute comes from days with a single activity, from garmin.day.training_load,
-- so it is in the units of whatever the load model is.
create view garmin.session_profile as
with yr as (
  select s.*, count(*) over (partition by s.start_date) as n_day
  from garmin.activity_session s
  where s.start_date >= current_date - 365
),
one as (
  select s.kind, d.training_load / nullif(s.minutes, 0) as load_per_min
  from yr s
  join garmin.day d on d.calendar_date = s.start_date
  where s.minutes >= 10 and s.n_day = 1
),
lpm as (
  select kind, count(*) as n_load, percentile_cont(0.5) within group (order by load_per_min) as load_per_min
  from one group by kind
),
pace as (
  select kind, count(*) as n_runs,
         sum(minutes * 60) / nullif(sum(distance_km), 0) as pace_s_per_km
  from garmin.activity_session
  where start_date >= current_date - 365 and is_run and distance_km > 0
  group by kind
),
kinds(kind, fallback) as (values
  ('easy', 'easy'), ('long', 'easy'), ('threshold', 'easy'), ('intervals', 'threshold'),
  ('strength', 'strength'), ('race', 'threshold'), ('rest', 'rest'))
select
  k.kind,
  case when k.kind = 'rest' then 0
       else coalesce(case when l.n_load >= 3 then l.load_per_min end, lf.load_per_min) end   as load_per_min,
  case when k.kind in ('rest', 'strength') then null
       else coalesce(case when p.n_runs >= 3 then p.pace_s_per_km end, pf.pace_s_per_km) end as pace_s_per_km,
  coalesce(l.n_load, 0)                                                                      as n_load_days,
  coalesce(p.n_runs, 0)                                                                      as n_runs
from kinds k
left join lpm l on l.kind = k.kind
left join lpm lf on lf.kind = k.fallback
left join pace p on p.kind = k.kind
left join pace pf on pf.kind = k.fallback;

-- One row per planned day, with its estimated load and, once the day has come, what was done (D8).
create view garmin.plan_day as
with p as (
  select pd.*, sp.pace_s_per_km as kind_pace, sp.load_per_min
  from app.plan_day pd
  join garmin.session_profile sp on sp.kind = pd.session
),
est as (
  select p.*,
         case when session in ('rest', 'strength') then null
              else coalesce(planned_km, planned_min * 60 / nullif(kind_pace, 0)) end            as km_est,
         case when session = 'rest' then 0
              else coalesce(planned_min, planned_km * kind_pace / 60) end                      as min_est
  from p
),
done as (
  select s.start_date,
         count(*) filter (where s.is_run)                          as runs,
         sum(s.distance_km) filter (where s.is_run)                as km,
         sum(s.minutes) filter (where s.is_run)                    as run_min,
         count(*) filter (where s.kind = 'strength')               as strength,
         sum(s.minutes)                                            as all_min,
         string_agg(a.activity_name, ' + ' order by a.start_time_gmt) as names,
         min(s.activity_id) filter (where s.is_run)                as first_run_id
  from garmin.activity_session s join garmin.activity a using (activity_id)
  group by s.start_date
)
select
  e.plan_day_id,
  e.race_id,
  e.day,
  date_trunc('week', e.day)::date                                  as week_start,
  extract(isodow from e.day)::int                                  as weekday,
  e.session,
  e.planned_km,
  e.planned_min,
  e.km_est,
  e.min_est,
  e.target_pace_s_per_km,
  e.target_hr,
  e.notes,
  coalesce(e.min_est, 0) * coalesce(e.load_per_min, 0)            as est_load,
  e.day > current_date                                             as is_future,
  d.runs                                                           as done_runs,
  d.km                                                             as done_km,
  d.run_min                                                        as done_run_min,
  d.run_min * 60 / nullif(d.km, 0)                                 as done_pace_s_per_km,
  d.names                                                          as done_names,
  d.first_run_id                                                   as done_activity_id,
  case
    when e.day > current_date then 'planned'
    when e.session = 'rest' then case when coalesce(d.runs, 0) > 0 then 'extra' else 'rested' end
    when e.session = 'strength' then case when coalesce(d.strength, 0) > 0 then 'done'
                                          when e.day = current_date then 'today' else 'missed' end
    when coalesce(d.runs, 0) = 0 then case when e.day = current_date then 'today' else 'missed' end
    when e.km_est > 0 and d.km >= 0.8 * e.km_est then 'done'
    when e.km_est is null and d.run_min >= 0.8 * e.min_est then 'done'
    else 'partial'
  end                                                              as status,
  -- Whole-run pace vs the target: only for sessions run at one pace (warm-ups would skew the others).
  case when e.session in ('easy', 'long', 'race') and e.target_pace_s_per_km is not null and d.km > 0
       then d.run_min * 60 / d.km - e.target_pace_s_per_km end    as pace_vs_target_s
from est e
left join done d on d.start_date = e.day;

-- One row per race and planned week: volume, long run, quality, ramp and cautions.
create view garmin.plan_week as
with w as (
  select race_id, week_start,
         sum(km_est) filter (where session <> 'race')                      as planned_km,
         sum(km_est) filter (where session = 'race')                       as race_km,
         max(km_est) filter (where session = 'long')                       as long_km,
         count(*) filter (where session in ('threshold', 'intervals'))     as quality_sessions,
         count(*) filter (where session not in ('rest'))                   as sessions,
         sum(est_load)                                                     as est_load,
         sum(coalesce(done_km, 0))                                         as done_km,
         bool_and(not is_future)                                           as is_past
  from garmin.plan_day
  group by race_id, week_start
),
actual as (
  select date_trunc('week', start_date)::date as week_start, sum(distance_km) as km
  from garmin.activity where is_run group by 1
),
k as (select max(value) filter (where name = 'ramp_max_pct') as ramp_max,
             max(value) filter (where name = 'long_max_share') as long_max from garmin.planner_param)
select
  w.race_id * 100000 + (w.week_start - date '2000-01-03') / 7                 as plan_week_id,
  w.race_id,
  w.week_start,
  w.planned_km,
  w.race_km,
  w.long_km,
  w.long_km / nullif(w.planned_km, 0)                                          as long_share,
  w.quality_sessions,
  w.sessions,
  w.est_load,
  w.done_km,
  ref.km                                                                       as ref_week_km,
  (w.planned_km / nullif(ref.km, 0) - 1) * 100                                 as ramp_pct,
  -- rounded, so a planned step of exactly the limit is not a caution
  coalesce(round(((w.planned_km / nullif(ref.km, 0) - 1) * 100)::numeric) > k.ramp_max, false) as flag_ramp,
  coalesce(round((w.long_km / nullif(w.planned_km, 0))::numeric, 2) > k.long_max, false)          as flag_long,
  (r.race_date - w.week_start) / 7                                             as weeks_to_race
from w
cross join k
join app.race r on r.race_id = w.race_id
-- the most of the previous 3 weeks: planned where a plan exists, else what was run
left join lateral (
  select max(coalesce(pw.planned_km, pa.km)) as km
  from generate_series(1, 3) g(n)
  left join w pw on pw.race_id = w.race_id and pw.week_start = w.week_start - 7 * g.n
  left join actual pa on pa.week_start = w.week_start - 7 * g.n
) ref on true;

-- Daily load, fatigue, fitness and form per upcoming race: the last 8 weeks as they happened
-- (garmin.day), then today's values carried forward through race day with the planned load.
create view garmin.projection as
with recursive
k as (select max(value) filter (where name = 'atl_days') as atl_days,
             max(value) filter (where name = 'ctl_days') as ctl_days,
             max(value) filter (where name = 'tsb_band_low') as band_low,
             max(value) filter (where name = 'tsb_band_high') as band_high
      from garmin.planner_param),
races as (select race_id, race_date from app.race where race_date > current_date),
planned as (select race_id, day, sum(est_load) as load from garmin.plan_day where day > current_date group by 1, 2),
fwd as (
  select r.race_id, d.calendar_date, d.training_load as load, d.atl, d.ctl, false as is_projected
  from races r join garmin.day d on d.calendar_date = current_date
  union all
  select f.race_id, f.calendar_date + 1, coalesce(p.load, 0),
         f.atl + (coalesce(p.load, 0) - f.atl) * (1 - exp(-1 / k.atl_days)),
         f.ctl + (coalesce(p.load, 0) - f.ctl) * (1 - exp(-1 / k.ctl_days)),
         true
  from fwd f
  cross join k
  join races r on r.race_id = f.race_id
  left join planned p on p.race_id = f.race_id and p.day = f.calendar_date + 1
  where f.calendar_date < r.race_date
),
past as (
  select r.race_id, d.calendar_date, d.training_load as load, d.atl, d.ctl, false as is_projected
  from races r join garmin.day d on d.calendar_date between current_date - 56 and current_date - 1
)
select
  x.race_id * 100000 + (x.calendar_date - date '2000-01-01')   as projection_id,
  x.race_id,
  x.calendar_date,
  x.is_projected,
  x.load,
  x.atl,
  x.ctl,
  x.ctl - x.atl                                                as tsb,
  (x.ctl - x.atl) / nullif(x.ctl, 0)                           as tsb_share,
  k.band_low * x.ctl                                           as tsb_target_low,
  k.band_high * x.ctl                                          as tsb_target_high,
  r.race_date - x.calendar_date                                as days_to_race
from (select * from fwd union all select * from past) x
cross join k
join races r on r.race_id = x.race_id;

-- Daniels & Gilbert (1979): the race time a VDOT gives over a distance (bisection on minutes),
-- and the VDOT a race time shows. The same formulas as garmin_sync/model.py.
create or replace function garmin.daniels_time_s(vdot double precision, km double precision)
returns double precision language plpgsql immutable as $$
declare lo double precision := 1; hi double precision := 1000; mid double precision; v double precision;
begin
  if vdot is null or vdot <= 0 or km is null or km <= 0 then return null; end if;
  for i in 1..60 loop
    mid := (lo + hi) / 2;
    v := km * 1000 / mid;
    if (-4.60 + 0.182258 * v + 0.000104 * v * v)
       / (0.8 + 0.1894393 * exp(-0.012778 * mid) + 0.2989558 * exp(-0.1932605 * mid)) > vdot
    then lo := mid; else hi := mid; end if;
  end loop;
  return (lo + hi) / 2 * 60;
end $$;

create or replace function garmin.daniels_vdot(time_s double precision, km double precision)
returns double precision language sql immutable as $$
  select (-4.60 + 0.182258 * v + 0.000104 * v * v)
         / (0.8 + 0.1894393 * exp(-0.012778 * tm) + 0.2989558 * exp(-0.1932605 * tm))
  from (select time_s / 60.0 as tm, km * 1000 / (time_s / 60.0) as v) x
  where time_s > 0 and km > 0 $$;

-- Runalyze (Prognosis/VO2max.php): the share of effective VO2max usable over a distance given the
-- marathon shape. Needed shape = distance^1.23 %; each point missing costs 0.4 % of VO2max, to 60 %.
create or replace function garmin.shape_factor(shape double precision, km double precision)
returns double precision language sql immutable as $$
  select case when shape is null then 1.0
              else least(1.0, 0.6 + 0.4 * greatest(0.0, 1 - (power(km, 1.23) - shape) / 100)) end $$;

-- Race forecast per upcoming race, from the README's causal model:
--   time = Daniels(effective VO2max x shape factor, distance)     D1 (with D3 inside it), Volume
--          x calibration to the runner's own races                 what is constant about them
--          x (1 + heat % per °C x (race WBGT - training WBGT))      D6
--          x (1 + taper gain if the plan misses the form band)      D5
--   Effective VO2max: today's (garmin.day). Marathon shape: today's, or with a plan, on race eve
--   from the runs so far plus the plan's runs. Calibration and the band: garmin-sync fit, which
--   checks this exact method on every marked race from earlier races only
--   (mape_daniels_shape_heat_calibrated). Heat: race = mean WBGT of past outdoor runs in the race
--   month starting 03:00 to 08:59; training = monthly WBGT over the 8 weeks before the race.
--   Comparisons kept: Garmin's prediction (raw and calibrated) and, for a marathon with a plan,
--   Tanda 2011 from the plan: Pm (s/km) = 17.1 + 140 e^(-0.0053 K) + 0.55 P.
create view garmin.race_forecast as
with fitted as (select max(value) filter (where name = 'heat_pct_per_c')                      as heat,
                       max(value) filter (where name = 'mape_daniels_shape_heat_calibrated')  as band,
                       max(value) filter (where name = 'mape_daniels_shape_calibrated')       as band_no_heat,
                       max(value) filter (where name = 'calibration_daniels_shape_heat')      as cal,
                       max(n)     filter (where name = 'calibration_daniels_shape_heat')      as cal_n,
                       max(value) filter (where name = 'calibration_garmin_prediction')       as garmin_cal,
                       max(value) filter (where name = 'vo2_per_ctl')                         as vo2_per_ctl
                from garmin.model_param),
k as (select coalesce(f.heat, max(p.value) filter (where p.name = 'heat_pct_per_c'))    as heat,
             coalesce(f.band, max(p.value) filter (where p.name = 'forecast_band_pct')) as band,
             f.band_no_heat,
             f.heat is not null                                                         as heat_fitted,
             f.band is not null                                                         as band_fitted,
             coalesce(f.cal, 1.0)                                                       as cal,
             f.cal_n,
             f.garmin_cal,
             coalesce(f.vo2_per_ctl, 0)                                                 as vo2_per_ctl,
             max(p.value) filter (where p.name = 'riegel_exponent')                     as riegel,
             max(p.value) filter (where p.name = 'taper_gain_pct')                      as taper_gain,
             max(p.value) filter (where p.name = 'tsb_band_low')                        as band_low
      from garmin.planner_param p cross join fitted f
      group by f.heat, f.band, f.band_no_heat, f.cal, f.cal_n, f.garmin_cal, f.vo2_per_ctl),
r as (select race_id, name, race_date, distance_km, goal_time_s, race_date - 63 as w_from, race_date - 7 as w_to,
             exists (select 1 from app.plan_day p where p.race_id = app.race.race_id and p.day > current_date) as has_plan
      from app.race where race_date > current_date),
win as (
  -- km and minutes of running per day of the Tanda window: done up to today, planned after
  select r.race_id,
         sum(coalesce(a.km, 0) + coalesce(pl.km, 0))     as km,
         sum(coalesce(a.mins, 0) + coalesce(pl.mins, 0)) as mins,
         count(*) filter (where g.d > current_date and pl.n = 0) as unplanned_days
  from r
  cross join lateral (select gs::date as d from generate_series(r.w_from, r.w_to, interval '1 day') gs) g
  left join lateral (select sum(distance_km) as km, sum(minutes) as mins from garmin.activity_session
                     where is_run and start_date = g.d and g.d <= current_date) a on true
  left join lateral (select sum(km_est) filter (where session not in ('rest', 'strength')) as km,
                            sum(min_est) filter (where session not in ('rest', 'strength')) as mins,
                            count(*) as n
                     from garmin.plan_day p where p.race_id = r.race_id and p.day = g.d and g.d > current_date) pl on true
  group by r.race_id
),
clim as (
  select extract(month from a.start_time_local)::int as m,
         avg(a.wbgt_c) as wbgt_all,
         avg(a.wbgt_c) filter (where extract(hour from a.start_time_local) between 3 and 8) as wbgt_early,
         count(*) filter (where extract(hour from a.start_time_local) between 3 and 8) as n_early
  from garmin.activity a where a.is_run and not a.is_indoor and a.wbgt_c is not null
  group by 1
),
heat as (
  select r.race_id,
         (select coalesce(c.wbgt_early, c.wbgt_all) from clim c where c.m = extract(month from r.race_date)) as race_wbgt,
         (select coalesce(c.n_early, 0) from clim c where c.m = extract(month from r.race_date))            as race_wbgt_n,
         (select avg(c.wbgt_all) from generate_series(r.w_from, r.w_to, interval '1 day') g(day)
            join clim c on c.m = extract(month from g.day))                                                 as training_wbgt
  from r
),
garmin_pred as (
  select time_5k_s, time_10k_s, time_half_s, time_marathon_s
  from garmin.race_prediction order by calendar_date desc limit 1
),
today as (
  select vo2_effective, coalesce(vo2_effective, vo2max_garmin) as vo2_for_shape, marathon_shape
  from garmin.day where calendar_date = current_date
),
-- Race fitness on race day (Layer 2): with a plan, today's effective VO2max moved by vo2_per_ctl x the
-- change in 30-day mean fitness (CTL) from today to race eve (garmin-sync fit). Without one, today's.
dv as (
  select r.race_id,
         case when r.has_plan then k.vo2_per_ctl * (
           (select avg(p.ctl) from garmin.projection p
             where p.race_id = r.race_id and p.calendar_date between r.race_date - 30 and r.race_date - 1)
           - (select avg(d.ctl) from garmin.day d where d.calendar_date between current_date - 29 and current_date))
         else 0 end as vo2_change
  from r cross join k
),
-- Runs so far plus the plan's runs: the marathon shape on race eve (the garmin.day formula). A
-- planned taper keeps endurance: the race uses the higher of the shape on race eve and the best of
-- the day before the taper (or race week) starts and the same weekday 1 and 2 weeks earlier, counting
-- only days still ahead (scenario.pre_taper_shape).
pre as (
  select r.race_id, (select min(p.day) - 1 from app.plan_day p
                      where p.race_id = r.race_id and p.phase in ('taper', 'race week')) as pre_taper
  from r
),
runs as (
  select r.race_id, a.start_date as d, a.distance_km as km
  from r join garmin.activity a on a.is_run and a.start_date between r.race_date - 220 and current_date
  union all
  select p.race_id, p.day, p.km_est
  from garmin.plan_day p join r using (race_id)
  -- a tune-up race counts (the race itself is on race day, outside the window)
  where p.day > current_date and p.day < r.race_date and p.session not in ('rest', 'strength') and p.km_est > 0
),
shape_on as (
  select r.race_id, o.on_d,
         100 * (2.0 / 3 * (coalesce(sum(x.km) filter (where x.d between o.on_d - 181 and o.on_d), 0) / 26)
                  / power(t.vo2_for_shape + dv.vo2_change, 1.135)
              + 1.0 / 3 * coalesce(sum((2 - 2.0 * (o.on_d - x.d) / 70)
                                       * power((x.km - 13) / (ln((t.vo2_for_shape + dv.vo2_change) / 4) * 12 - 13), 2))
                                   filter (where x.d between o.on_d - 69 and o.on_d and x.km >= 13), 0) / 10)
           as s
  from r join pre using (race_id) cross join today t join dv using (race_id)
  cross join lateral (select r.race_date - 1 union all
                      select pre.pre_taper - 7 * k from generate_series(0, 2) k
                      where pre.pre_taper - 7 * k > current_date and pre.pre_taper - 7 * k < r.race_date - 1) o(on_d)
  left join runs x on x.race_id = r.race_id
  where o.on_d is not null
  group by r.race_id, o.on_d, t.vo2_for_shape, dv.vo2_change
),
shape as (
  select race_id, max(s) as shape_planned from shape_on group by race_id
),
base as (
  select r.*, w.km / 8 as tanda_k, w.mins * 60 / nullif(w.km, 0) as tanda_p, w.unplanned_days,
         h.race_wbgt, h.race_wbgt_n, h.training_wbgt,
         t.vo2_effective, dv.vo2_change, t.vo2_effective + dv.vo2_change as vo2_race, t.marathon_shape as shape_today,
         case when r.has_plan then s.shape_planned else t.marathon_shape end as shape_race,
         (select gt * power(r.distance_km / dk, k.riegel)
            from garmin_pred gp,
                 lateral (values (5.0, gp.time_5k_s), (10.0, gp.time_10k_s), (21.0975, gp.time_half_s), (42.195, gp.time_marathon_s)) v(dk, gt)
            where gt is not null order by abs(ln(r.distance_km / dk)) limit 1)                               as garmin_time_s
  from r join win w using (race_id) join heat h using (race_id) join shape s using (race_id) join dv using (race_id)
  cross join today t cross join k
),
m as (
  select b.*,
         garmin.shape_factor(b.shape_race, b.distance_km)                                           as shape_factor,
         garmin.daniels_time_s(b.vo2_race, b.distance_km)                                          as daniels_time_s,
         garmin.daniels_time_s(b.vo2_race * garmin.shape_factor(b.shape_race, b.distance_km), b.distance_km) as daniels_shape_time_s,
         coalesce(k.heat * (b.race_wbgt - b.training_wbgt), 0)                                      as heat_adj_pct,
         case when b.has_plan and p.tsb_share < k.band_low then k.taper_gain else 0 end              as taper_adj_pct,
         p.tsb, p.tsb_share, p.ctl
  from base b cross join k
  left join garmin.projection p on p.race_id = b.race_id and p.calendar_date = b.race_date - 1
)
select
  m.race_id,
  m.name,
  m.race_date,
  m.distance_km,
  m.goal_time_s,
  m.has_plan,
  m.vo2_effective,
  m.vo2_change,
  m.vo2_race,
  m.shape_today,
  m.shape_race,
  power(m.distance_km, 1.23)                                                      as shape_needed,
  m.shape_factor,
  m.daniels_time_s,
  m.daniels_shape_time_s,
  k.cal                                                                           as calibration,
  k.cal_n                                                                         as calibration_races,
  m.daniels_shape_time_s * k.cal                                                  as model_base_time_s,
  m.tanda_k                                                                       as tanda_km_per_week,
  m.tanda_p                                                                       as tanda_pace_s_per_km,
  m.unplanned_days,
  case when m.distance_km between 40 and 45 and m.tanda_k > 0 then
    (17.1 + 140 * exp(-0.0053 * m.tanda_k) + 0.55 * m.tanda_p) * m.distance_km end as tanda_time_s,
  m.garmin_time_s,
  m.garmin_time_s * k.garmin_cal                                                  as garmin_calibrated_time_s,
  k.heat_fitted,
  k.band_fitted,
  m.race_wbgt                                                                     as race_wbgt_c,
  m.race_wbgt_n,
  m.training_wbgt                                                                 as training_wbgt_c,
  m.heat_adj_pct,
  m.taper_adj_pct,
  case when m.daniels_shape_time_s is not null
       then 'Causal model: effective VO2max x marathon shape (Daniels, Runalyze), calibrated to your races, heat- and taper-adjusted'
       else 'Garmin prediction (Riegel), calibrated to your races, heat-adjusted (no effective VO2max yet)' end as method,
  coalesce(m.daniels_shape_time_s * k.cal, m.garmin_time_s * coalesce(k.garmin_cal, 1))
    * (1 + m.heat_adj_pct / 100) * (1 + m.taper_adj_pct / 100)                    as predicted_time_s,
  -- the same with the marathon shape the distance needs: what the volume gap costs
  m.daniels_time_s * k.cal * (1 + m.heat_adj_pct / 100) * (1 + m.taper_adj_pct / 100) as time_if_shape_met_s,
  k.band                                                                          as band_pct,
  k.band_no_heat                                                                  as band_no_heat_pct,
  m.tsb                                                                           as race_morning_tsb,
  m.tsb_share                                                                     as race_morning_tsb_share,
  m.ctl                                                                           as race_morning_ctl,
  m.tsb_share between (select value from garmin.planner_param where name = 'tsb_band_low')
                  and (select value from garmin.planner_param where name = 'tsb_band_high') as race_morning_in_band,
  -- Where the runner stands today (planner step 1): the same model on today's effective VO2max and
  -- marathon shape, in the race's conditions, no plan and no taper: "if the race were today".
  garmin.daniels_time_s(m.vo2_effective, m.distance_km)                           as today_daniels_time_s,
  garmin.shape_factor(m.shape_today, m.distance_km)                               as today_shape_factor,
  garmin.daniels_time_s(m.vo2_effective * garmin.shape_factor(m.shape_today, m.distance_km), m.distance_km) as today_daniels_shape_time_s,
  garmin.daniels_time_s(m.vo2_effective * garmin.shape_factor(m.shape_today, m.distance_km), m.distance_km)
    * k.cal * (1 + coalesce(k.heat * (m.race_wbgt - rt.wbgt), m.heat_adj_pct) / 100) as today_time_s,
  -- today's heat: the race's expected heat against what the runner actually trained in (last 8 weeks)
  rt.wbgt                                                                         as today_training_wbgt_c,
  coalesce(k.heat * (m.race_wbgt - rt.wbgt), m.heat_adj_pct)                      as today_heat_adj_pct,
  -- the current load: the last 2 complete weeks, and the longest run of the last 4 weeks
  (select sum(a.distance_km) / 2 from garmin.activity a
    where a.is_run and a.start_date >= date_trunc('week', current_date)::date - 14
      and a.start_date < date_trunc('week', current_date)::date)                  as recent_week_km,
  (select max(a.distance_km) from garmin.activity a
    where a.is_run and a.start_date > current_date - 28)                          as longest_4w_km
from m
cross join k
cross join (select avg(a.wbgt_c) as wbgt from garmin.activity a
            where a.is_run and not a.is_indoor and a.wbgt_c is not null
              and a.start_date > current_date - 56) rt;

-- What limits each upcoming race, determinant by determinant (README causal model): today's value
-- against its target, how much is missing, how long it typically takes to move, and a priority.
--   direction    'max' higher is better, 'min' lower is better, 'band' between target and target_high
--   pct_missing  how far from the target, as a % of the target (max) or of the value (min, band)
--   importance   3 high, 2 medium, 1 low, for the race distance (README Layer 1)
--   weeks_lo/hi  typical weeks of the right training to close the gap (rules of thumb, in `how`)
--   closable     the low end fits before race day
--   time_cost_s  what the gap costs on the forecast (garmin.race_forecast); null where the
--                determinant is not a term of the forecast (D2, D4: diagnostics inside VO2max/shape)
--   priority     1 = first: limiting, then importance x gap (gap capped at 50 %), then longest to move
create view garmin.race_limiter as
with fc as materialized (select * from garmin.race_forecast),
r as (
  select r.race_id, r.distance_km, r.race_date, r.goal_time_s, r.race_date - current_date as days_to_race,
         case when r.distance_km >= 40 then 'M' when r.distance_km >= 20 then 'H' else 'S' end as dist,
         exists (select 1 from app.plan_day p where p.race_id = r.race_id and p.day > current_date) as has_plan,
         -- The effective VO2max the goal needs once the marathon shape is there: the goal time with
         -- the forecast's calibration, heat and taper taken out, through Daniels & Gilbert.
         garmin.daniels_vdot(r.goal_time_s / (f.calibration * (1 + f.heat_adj_pct / 100) * (1 + f.taper_adj_pct / 100)),
                             r.distance_km) as goal_vdot
  from app.race r
  left join fc f on f.race_id = r.race_id
  where r.race_date > current_date
),
today as (select * from garmin.day where calendar_date = current_date),
band as (select max(value) filter (where name = 'tsb_band_low') * 100 as lo,
                max(value) filter (where name = 'tsb_band_high') * 100 as hi from garmin.planner_param),
dec as (
  select avg(m.decoupling_pct) as decoupling, count(*) as n
  from garmin.activity_marker m join garmin.activity a using (activity_id)
  where a.start_date >= current_date - 56 and m.decoupling_pct is not null
),
rows as (
  select r.race_id, 1 as ord, 'D1' as determinant, 'Race fitness (effective VO2max vs what the goal needs, volume in place)' as label,
         'fitness' as kind, 'max' as direction, 'ml/kg/min' as unit,
         t.vo2_effective as value, r.goal_vdot as target, null::float as target_high,
         case r.dist when 'M' then 3 when 'H' then 3 else 3 end as importance,
         ceil(r.goal_vdot - t.vo2_effective) * 4 as weeks_lo, ceil(r.goal_vdot - t.vo2_effective) * 6 as weeks_hi,
         'One interval session a week (5 to 6 x 1 km at 5K effort, or 4 to 5 x 3 min hard) on top of steady volume. '
         || 'Rule of thumb: about 1 VDOT point per 4 to 6 weeks of consistent training (Daniels).' as how,
         null::bigint as n
  from r cross join today t
  union all
  select r.race_id, 2, 'Volume', 'Endurance volume (marathon shape)', 'fitness', 'max', '%',
         t.marathon_shape, power(r.distance_km, 1.23), null,
         case r.dist when 'M' then 3 when 'H' then 2 else 1 end,
         greatest(4, round(13 * (1 - t.marathon_shape / power(r.distance_km, 1.23)))),
         greatest(8, round(26 * (1 - t.marathon_shape / power(r.distance_km, 1.23)))),
         'Raise weekly km by up to 10 % a week with a lighter week every 4th, and one long run a week growing about 2 km. '
         || 'The shape counts the last 26 weeks of km and 10 weeks of long runs, so it climbs slowly (Runalyze: needed = distance^1.23 %).',
         null
  from r cross join today t
  union all
  select r.race_id, 3, 'D4', 'Durability (HR drift on long runs, last 8 weeks)', 'fitness', 'min', '%',
         dec.decoupling, 5.0, null,
         case r.dist when 'M' then 3 when 'H' then 2 else 1 end,
         6, 12,
         'One long steady run a week at easy HR, growing toward race duration, fuelled as on race day. '
         || 'Under 5 % drift = durable; it responds over 6 to 12 weeks (Hunter & Muniz-Pumares 2025).',
         dec.n
  from r cross join dec
  union all
  select r.race_id, 4, 'D2', 'Threshold (fractional utilisation: threshold / VO2max speed)', 'fitness', 'max', '%',
         t.lt_fraction * 100, 80.0, null,
         case r.dist when 'M' then 2 else 3 end,
         4, 8,
         '1 to 2 threshold sessions a week: 20 to 30 min tempo, or 3 x 10 min cruise intervals at threshold HR. '
         || 'Threshold moves within 4 to 8 weeks.',
         null
  from r cross join today t
  union all
  select f.race_id, 5, 'D5', 'Race-morning freshness (form, % of fitness)', 'plan', 'band', '%',
         case when r.has_plan then f.race_morning_tsb_share * 100 end, band.lo, band.hi,
         2, 1, 3,
         case when r.has_plan then '' else 'No plan yet: the taper in a plan sets this. ' end
         || 'Taper: cut volume 41 to 60 % over the last 2 to 3 weeks and keep the intensity (Bosquet 2007).',
         null
  from fc f join r using (race_id) cross join band
  union all
  select f.race_id, 6, 'D6', 'Race-day heat (WBGT)', 'condition', 'min', '°C',
         f.race_wbgt_c, greatest(25.0, f.training_wbgt_c), null,
         case when abs(coalesce(f.heat_adj_pct, 0)) >= 2 then 2 else 1 end,
         1, 2,
         case when f.training_wbgt_c >= f.race_wbgt_c then 'You already train in this heat or hotter, so you are acclimatised. '
              else 'Train in the heat for 10 to 14 days before the race (Périard 2015). ' end
         || 'On race day: start conservatively and drink to a plan.',
         f.race_wbgt_n
  from fc f
),
scored as (
  select x.*, r.days_to_race, r.race_date,
         case when x.value is null or x.target is null then null
              when x.direction = 'max' then greatest(0, (x.target - x.value) / nullif(x.target, 0) * 100)
              when x.direction = 'min' then greatest(0, (x.value - x.target) / nullif(x.value, 0) * 100)
              when x.value < x.target then (x.target - x.value) / nullif(x.target, 0) * 100
              when x.value > x.target_high then (x.value - x.target_high) / nullif(x.value, 0) * 100
              else 0 end as pct_missing
  from rows x join r using (race_id)
)
select
  race_id * 100 + ord                                              as limiter_id,
  race_id, ord, determinant, label, kind, direction, unit, value, target, target_high,
  pct_missing,
  coalesce(pct_missing > 0.5, false)                               as limiting,
  importance,
  case when pct_missing > 0.5 then weeks_lo end                    as weeks_lo,
  case when pct_missing > 0.5 then weeks_hi end                    as weeks_hi,
  days_to_race / 7.0                                               as weeks_to_race,
  case when pct_missing > 0.5 then weeks_lo * 7 <= days_to_race end as closable,
  case when pct_missing > 0.5 then greatest(current_date, scored.race_date - (weeks_hi * 7)::int) end as start_by,
  row_number() over (partition by race_id
                     order by coalesce(pct_missing > 0.5, false) desc,
                              importance * least(coalesce(pct_missing, 0), 50) desc,
                              case when pct_missing > 0.5 then weeks_hi end desc nulls last, ord) as priority,
  case when pct_missing > 0.5 then
    case determinant
      when 'Volume' then f.predicted_time_s - f.time_if_shape_met_s
      when 'D1'     then f.time_if_shape_met_s - r2.goal_time_s
      when 'D5'     then f.predicted_time_s * f.taper_adj_pct / (100 + f.taper_adj_pct)
      when 'D6'     then greatest(0, f.predicted_time_s * f.heat_adj_pct / (100 + f.heat_adj_pct))
    end end                                                        as time_cost_s,
  how                                                              as advice,
  n
from scored
left join fc f using (race_id)
left join app.race r2 using (race_id);
