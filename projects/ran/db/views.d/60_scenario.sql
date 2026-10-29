-- The Race Planner's model in SQL: from the settings the runner picks to the plan and its race time,
-- read through AQL (models/scenario_*.model.aml). The same chain as the README's causal model:
--
--   settings (runs a week, biggest week, quality sessions, longest long run, weekly increase, taper,
--             build-up, tune-up race, this week's km)
--     -> plan: weeks (scn_weeks), then days (scn_week_days)
--     -> race day: marathon shape (from the plan's km and long runs, the garmin.day formula)
--                  race fitness  (effective VO2max today + vo2_per_ctl x change in 30-day mean CTL)
--                  freshness     (fatigue and fitness carried to race eve with the plan's load)
--     -> time = Daniels(VO2max x shape factor, distance) x calibration x (1 + heat %) x (1 + taper %)
--
-- A port of garmin_sync/planner.py and garmin_sync/scenario.py (kept as the reference: the parity
-- test, tests/test_scenario_sql.py, runs both on the same runners).
--
-- Reading it: every setting is a dimension of garmin.scenario_grid, a cross join of the values each
-- can take. A query filters every setting to one value, and Postgres pushes each filter into its
-- generate_series, so only that one combination is computed. A query that leaves a setting
-- unfiltered computes every value of it (scenario_sweep relies on this for one setting at a time);
-- leaving several unfiltered multiplies, and the reader's statement_timeout stops it.
--
-- What does not change with the settings is computed once per refresh (garmin-sync fit, after the
-- model's constants are fitted): garmin.scenario_context (each upcoming race's inputs) and
-- garmin.scenario_best (the recommended plan per race and runs a week: the slowest search).

drop materialized view if exists garmin.scenario_best cascade;
drop materialized view if exists garmin.scenario_context cascade;
drop view if exists garmin.scenario_grid cascade;
drop type if exists garmin.scn_ctx, garmin.scn_opts, garmin.scn_week, garmin.scn_day cascade;

-- ------------------------------------------------------------------------------------------ types
-- Everything a plan is built from, read once (planner.plan_context + scenario.load).
create type garmin.scn_ctx as (
  today date, start date, n int, vol0 float8, long0 float8, partial bool, done_week float8,
  race_id bigint, race_name text, race_date date, km float8, goal_s float8,
  easy_pace float8, thr_pace float8,
  h_runs int, h_biggest float8, h_peak_default float8, h_start_km float8, h_last_week float8, h_weeks int,
  vo2_today float8, vo2_garmin float8, atl float8, ctl float8, shape_today float8, lt_fraction float8,
  ctl_hist float8[],                 -- CTL from today - 40 (index 1) to today (index 41); null when missing
  prof_kind text[], prof_pace float8[], prof_lpm float8[],
  run_dates date[], run_kms float8[], -- runs from 220 days before race day to today
  fc_pred float8, fc_heat float8, fc_cal float8, fc_band float8, fc_race_wbgt float8, fc_train_wbgt float8,
  fc_has_plan bool,
  atl_days float8, ctl_days float8, band_lo float8, band_hi float8, taper_gain float8,
  fit_b float8, fit_lo float8, fit_hi float8, has_fit bool, decoupling float8
);
-- What the runner controls (planner.PlanOptions).
create type garmin.scn_opts as (
  runs int, peak float8, quality int, long_max float8, ramp float8, taper int, target float8,
  tune bool, start_km float8, front bool
);
create type garmin.scn_week as (km float8, long float8, phase text, tune_up float8);
create type garmin.scn_day as (
  day date, week int, phase text, session text, planned_km float8, planned_min float8, pace float8, notes text
);

-- ------------------------------------------------------------------------------------- constants
-- planner.distance_limits: volume cap, default longest long run, taper weeks the evidence supports.
create or replace function garmin.scn_peak_cap(km float8) returns float8 language sql immutable as
$$ select case when km >= 40 then 90.0 when km >= 20 then 70.0 else 55.0 end $$;
create or replace function garmin.scn_long_max(km float8) returns float8 language sql immutable as
$$ select case when km >= 40 then 32.0 when km >= 20 then 21.0 else 15.0 end $$;
create or replace function garmin.scn_tapers(km float8) returns int[] language sql immutable as
$$ select case when km >= 40 then array[2, 3] else array[1, 2] end $$;
create or replace function garmin.scn_taper_default(km float8) returns int language sql immutable as
$$ select case when km >= 40 then 3 when km >= 20 then 2 else 1 end $$;
create or replace function garmin.scn_tune_up_possible(km float8, weeks int) returns bool language sql immutable as
$$ select km >= 20 and coalesce(weeks, 0) >= 12 $$;

-- planner._pace: 300 -> '5:00'
create or replace function garmin.scn_pace(s float8) returns text language sql immutable as $$
  select case when s is null or s = 0 then '?'
              else (round(s)::int / 60)::text || ':' || lpad((round(s)::int % 60)::text, 2, '0') end $$;

-- Python's round(x, 1), which rounds the double's exact value: 4.55 is stored as 4.5499... and
-- gives 4.5; an exact tie (11.25) goes to even (11.2). Near a tie the exact value decides:
-- x = m / 2^p with m an integer under 2^53, compared with the tie in integers.
create or replace function garmin.scn_r1(x float8) returns float8 language plpgsql immutable as $$
declare y float8 := x * 10; k float8 := floor(x * 10); e int; p int; m numeric; s int;
begin
  if x is null then return null; end if;
  if x <= 0 or abs(y - k - 0.5) > 1e-6 then return round(y) / 10; end if;
  e := floor(ln(x) / ln(2));
  while x * 2.0 ^ (52 - e) >= 2.0 ^ 53 loop e := e + 1; end loop;
  while x * 2.0 ^ (52 - e) < 2.0 ^ 52 loop e := e - 1; end loop;
  p := 52 - e;
  m := (x * 2.0 ^ p)::text::numeric;   -- an integer under 2^53: its shortest text is exact (a plain ::numeric keeps 15 digits)
  s := sign(10 * m - (2 * k::numeric + 1) * power(2::numeric, p - 1));
  return case when s > 0 then (k + 1) / 10 when s < 0 then k / 10
              when k::bigint % 2 = 0 then k / 10 else (k + 1) / 10 end;
end $$;

-- ------------------------------------------------------------------------------------- context
create or replace function garmin.scn_ctx_load(p_race_id bigint) returns garmin.scn_ctx
language plpgsql stable as $$
declare
  c garmin.scn_ctx;
  r record;
  this_monday date;
  last_week float8;
  recent_vol float8; recent_days float8;
  longest float8;
  race_week date;
begin
  c.today := current_date;
  select race_id, name, race_date, distance_km, goal_time_s into r from app.race where race_id = p_race_id;
  if not found or r.race_date <= c.today then return null; end if;
  c.race_id := r.race_id; c.race_name := r.name; c.race_date := r.race_date; c.km := r.distance_km; c.goal_s := r.goal_time_s;
  this_monday := c.today - extract(isodow from c.today)::int + 1;
  -- where the runner is now: the last 2 complete weeks
  select coalesce(sum(distance_km), 0) / 2.0, count(distinct start_date) / 2.0
    into recent_vol, recent_days
    from garmin.activity where is_run and start_date >= this_monday - 14 and start_date < this_monday;
  select coalesce(sum(distance_km), 0) into last_week
    from garmin.activity where is_run and start_date >= this_monday - 7 and start_date < this_monday;
  select coalesce(max(distance_km), 0) into longest
    from garmin.activity where is_run and start_date > c.today - 28 and start_date <= c.today;
  select d.easy_hr_pace_s_per_km, coalesce(d.lt_pace_own_s_per_km, d.lt_pace_s_per_km),
         d.vo2_effective, d.vo2max_garmin, d.atl, d.ctl, d.marathon_shape, d.lt_fraction
    into c.easy_pace, c.thr_pace, c.vo2_today, c.vo2_garmin, c.atl, c.ctl, c.shape_today, c.lt_fraction
    from garmin.day d where d.calendar_date = c.today;
  if c.easy_pace is null then
    select pace_s_per_km into c.easy_pace from garmin.session_profile where kind = 'easy';
  end if;
  c.partial := extract(isodow from c.today) < 7;
  c.start := case when c.partial then this_monday else this_monday + 7 end;
  c.done_week := case when c.partial then
    (select coalesce(sum(distance_km), 0) from garmin.activity where is_run and start_date between this_monday and c.today)
    else 0 end;
  race_week := c.race_date - extract(isodow from c.race_date)::int + 1;
  c.n := (race_week - c.start) / 7 + 1;
  if c.n < 1 then return null; end if;
  select coalesce(max(km), 0) into c.h_biggest from (
    select sum(distance_km) as km from garmin.activity where is_run and start_date > c.today - 365
    group by date_trunc('week', start_date)) x;
  c.vol0 := greatest(recent_vol, last_week);
  c.long0 := case when longest > 0 then longest else 0.25 * greatest(c.vol0, 12.0) end;
  c.h_runs := greatest(3, least(6, floor(recent_days + 0.5)::int));
  c.h_peak_default := least(garmin.scn_peak_cap(c.km),
                            greatest(5 * round(1.25 * c.h_biggest / 5), 5 * round(c.vol0 / 5)));
  c.h_start_km := c.vol0;
  c.h_last_week := case when last_week > 0 then last_week else c.vol0 end;
  c.h_weeks := c.n;
  c.ctl_hist := array(select d.ctl from generate_series(c.today - 40, c.today, interval '1 day') g(t)
                      left join garmin.day d on d.calendar_date = g.t::date order by g.t);
  select array_agg(kind order by kind), array_agg(pace_s_per_km order by kind), array_agg(load_per_min order by kind)
    into c.prof_kind, c.prof_pace, c.prof_lpm from garmin.session_profile;
  select array_agg(start_date order by start_date, activity_id), array_agg(distance_km order by start_date, activity_id)
    into c.run_dates, c.run_kms
    from garmin.activity where is_run and start_date between c.race_date - 220 and c.today;
  select f.predicted_time_s, f.heat_adj_pct, f.calibration, f.band_pct, f.race_wbgt_c, f.training_wbgt_c, f.has_plan
    into c.fc_pred, c.fc_heat, c.fc_cal, c.fc_band, c.fc_race_wbgt, c.fc_train_wbgt, c.fc_has_plan
    from garmin.race_forecast f where f.race_id = p_race_id;
  select max(value) filter (where name = 'atl_days'), max(value) filter (where name = 'ctl_days'),
         max(value) filter (where name = 'tsb_band_low'), max(value) filter (where name = 'tsb_band_high'),
         max(value) filter (where name = 'taper_gain_pct')
    into c.atl_days, c.ctl_days, c.band_lo, c.band_hi, c.taper_gain from garmin.planner_param;
  select value, ci_low, ci_high into c.fit_b, c.fit_lo, c.fit_hi from garmin.model_param where name = 'vo2_per_ctl';
  c.has_fit := found;
  select avg(m.decoupling_pct) into c.decoupling
    from garmin.activity_marker m join garmin.activity a using (activity_id)
    where a.start_date >= current_date - 56 and m.decoupling_pct is not null;
  return c;
end $$;

-- The same context from JSON: the parity test builds its runners in Python (tests/conftest.py).
create or replace function garmin.scn_ctx_json(j jsonb) returns garmin.scn_ctx
language plpgsql immutable as $$
declare c garmin.scn_ctx;
begin
  c.today := (j->>'today')::date; c.start := (j->>'start')::date; c.n := (j->>'n')::int;
  c.vol0 := (j->>'vol0')::float8; c.long0 := (j->>'long0')::float8; c.partial := (j->>'partial')::bool;
  c.done_week := (j->>'done_week')::float8;
  c.race_id := (j->>'race_id')::bigint; c.race_name := j->>'race_name'; c.race_date := (j->>'race_date')::date;
  c.km := (j->>'km')::float8; c.goal_s := (j->>'goal_s')::float8;
  c.easy_pace := (j->>'easy_pace')::float8; c.thr_pace := (j->>'thr_pace')::float8;
  c.h_runs := (j->>'h_runs')::int; c.h_biggest := (j->>'h_biggest')::float8; c.h_peak_default := (j->>'h_peak_default')::float8;
  c.h_start_km := (j->>'h_start_km')::float8; c.h_last_week := (j->>'h_last_week')::float8; c.h_weeks := (j->>'h_weeks')::int;
  c.vo2_today := (j->>'vo2_today')::float8; c.vo2_garmin := (j->>'vo2_garmin')::float8; c.atl := (j->>'atl')::float8;
  c.ctl := (j->>'ctl')::float8; c.shape_today := (j->>'shape_today')::float8; c.lt_fraction := (j->>'lt_fraction')::float8;
  c.ctl_hist := array(select nullif(x, 'null')::float8 from jsonb_array_elements_text(j->'ctl_hist') with ordinality t(x, i) order by i);
  c.prof_kind := array(select x from jsonb_array_elements_text(j->'prof_kind') with ordinality t(x, i) order by i);
  c.prof_pace := array(select x::float8 from jsonb_array_elements_text(j->'prof_pace') with ordinality t(x, i) order by i);
  c.prof_lpm := array(select x::float8 from jsonb_array_elements_text(j->'prof_lpm') with ordinality t(x, i) order by i);
  c.run_dates := array(select x::date from jsonb_array_elements_text(j->'run_dates') with ordinality t(x, i) order by i);
  c.run_kms := array(select x::float8 from jsonb_array_elements_text(j->'run_kms') with ordinality t(x, i) order by i);
  c.fc_pred := (j->>'fc_pred')::float8; c.fc_heat := (j->>'fc_heat')::float8; c.fc_cal := (j->>'fc_cal')::float8;
  c.fc_band := (j->>'fc_band')::float8; c.fc_race_wbgt := (j->>'fc_race_wbgt')::float8;
  c.fc_train_wbgt := (j->>'fc_train_wbgt')::float8; c.fc_has_plan := (j->>'fc_has_plan')::bool;
  c.atl_days := (j->>'atl_days')::float8; c.ctl_days := (j->>'ctl_days')::float8; c.band_lo := (j->>'band_lo')::float8;
  c.band_hi := (j->>'band_hi')::float8; c.taper_gain := (j->>'taper_gain')::float8;
  c.fit_b := (j->>'fit_b')::float8; c.fit_lo := (j->>'fit_lo')::float8; c.fit_hi := (j->>'fit_hi')::float8;
  c.has_fit := coalesce((j->>'has_fit')::bool, false); c.decoupling := (j->>'decoupling')::float8;
  return c;
end $$;

-- ------------------------------------------------------------------------------------- settings
-- planner.plan_options: a setting left null takes the runner's habits and the distance's defaults.
create or replace function garmin.scn_options(c garmin.scn_ctx, p_runs int, p_peak float8, p_quality int,
  p_long_max float8, p_ramp float8, p_taper int, p_front bool, p_tune bool, p_start_km float8, p_target float8)
returns garmin.scn_opts language plpgsql immutable as $$
declare o garmin.scn_opts; possible bool := garmin.scn_tune_up_possible(c.km, c.h_weeks);
begin
  o.runs := coalesce(p_runs, coalesce(nullif(c.h_runs, 0), 4));
  o.peak := coalesce(p_peak, coalesce(nullif(c.h_peak_default, 0), garmin.scn_peak_cap(c.km)));
  o.quality := least(coalesce(p_quality, case when o.runs >= 4 then 2 else 1 end), greatest(o.runs - 1, 0));
  o.long_max := coalesce(p_long_max, garmin.scn_long_max(c.km));
  o.ramp := coalesce(p_ramp, 10.0);
  o.taper := coalesce(p_taper, garmin.scn_taper_default(c.km));
  o.target := p_target;
  o.front := coalesce(p_front, false);
  o.start_km := nullif(garmin.scn_r1(coalesce(p_start_km, c.h_start_km, 0)), 0);
  o.tune := coalesce(p_tune, possible) and possible;
  return o;
end $$;

-- ----------------------------------------------------------------------------------------- weeks
-- planner._phases: the phase of each week, by the time left.
create or replace function garmin.scn_phases(n int, taper int) returns text[] language plpgsql immutable as $$
declare
  t int := least(taper, greatest(1, n - 1));
  m int := n - t; peak_n int; rest int; base_n int; out text[] := '{}';
begin
  if m <= 3 then
    return array_fill('sharpen'::text, array[greatest(m, 0)]) || array_fill('taper'::text, array[t - 1]) || array['race week'];
  end if;
  peak_n := case when m >= 13 then 3 when m >= 6 then 2 when m >= 3 then 1 else 0 end;
  rest := m - peak_n;
  base_n := case when m >= 13 then round(rest * 0.53)::int when m >= 8 then ceil(rest / 2.0)::int else 0 end;
  for i in 0 .. rest - 1 loop
    out := out || case when (i + 1) % 4 = 0 then 'recovery' when i < base_n then 'base' else 'build' end;
  end loop;
  return out || array_fill('peak'::text, array[peak_n]) || array_fill('taper'::text, array[t - 1]) || array['race week'];
end $$;

-- planner._weeks: each week's km, long run and phase.
create or replace function garmin.scn_weeks(c garmin.scn_ctx, o garmin.scn_opts) returns garmin.scn_week[]
language plpgsql immutable as $$
declare
  phases text[] := garmin.scn_phases(c.n, o.taper);
  np int := array_length(phases, 1);
  vol0 float8 := greatest(coalesce(o.start_km, c.vol0), 12.0);
  first_holds bool := coalesce(c.partial, false);
  first_peak int := array_position(phases, 'peak');   -- 1-based
  steps int := 0; target float8; needed float8; ramp float8; long_cap float8 := o.long_max;
  tune_week int; vol float8; longs float8[]; weeks garmin.scn_week[] := '{}'; w garmin.scn_week;
  at_max int := 0; long_steps int; k int := 0; ph text; planned float8; lng float8;
  peak float8; peak_long float8; taper_n int; shares float8[]; race_week bool; m4 float8;
begin
  for i in 1 .. coalesce(first_peak, np) loop
    if phases[i] in ('base', 'build', 'peak') and not (i = 1 and first_holds) then steps := steps + 1; end if;
  end loop;
  target := greatest(o.peak, vol0);
  needed := case when steps > 0 then power(target / vol0, 1.0 / steps) - 1 else 0 end;
  ramp := 1 + case when o.front then o.ramp / 100 else least(o.ramp / 100, greatest(needed, 0)) end;
  -- the tune-up week, 1-based: Python's len(phases) - 1 - 6 is 0-based
  tune_week := case when o.tune then np - 6 else null end;
  vol := vol0;
  longs := array[c.long0, c.long0, c.long0, c.long0];
  long_steps := greatest(1, steps - 4 + case when first_peak is not null then 3 else 0 end);
  for i in 1 .. np loop
    ph := phases[i];
    m4 := (select max(x) from unnest(longs[array_length(longs, 1) - 3 : array_length(longs, 1)]) x);
    if ph = 'sharpen' then
      w := row(vol, least(m4, long_cap, 0.5 * vol), ph, null);
    elsif ph in ('base', 'build', 'peak') then
      if not (i = 1 and first_holds) then
        vol := least(vol * ramp, o.peak);
        k := k + 1;
      end if;
      planned := c.long0 + (long_cap - c.long0) * least(k::float8 / long_steps, 1.0);
      if o.front then planned := long_cap; end if;
      lng := least(m4 * 1.10, long_cap, 0.5 * vol, greatest(planned, longs[array_length(longs, 1)]));
      if lng >= 0.97 * long_cap and not o.front then
        at_max := at_max + 1;
        if at_max % 2 = 0 then lng := 0.75 * long_cap; end if;
      end if;
      w := row(vol, lng, ph, null);
    elsif ph = 'recovery' then
      w := row(vol * 0.75, longs[array_length(longs, 1)] * 0.75, ph, null);
    else
      exit;
    end if;
    if i = tune_week and ph in ('build', 'peak', 'recovery') then
      w := row(w.km * 0.85, null, w.phase, case when c.km >= 40 then 21.0975 else 10.0 end);
    end if;
    weeks := weeks || w;
    longs := longs || coalesce(nullif(w.long, 0), w.tune_up, 0.0);
  end loop;
  peak := coalesce((select max((x).km) from unnest(weeks) x), vol);
  peak_long := coalesce(nullif((select max(coalesce((x).long, 0)) from unnest(weeks) x), 0), c.long0);
  taper_n := np - coalesce(array_length(weeks, 1), 0);
  shares := case
    when c.km >= 40 and taper_n = 3 then array[0.75, 0.55, 0.40]
    when c.km >= 40 and taper_n = 2 then array[0.65, 0.45]
    when c.km >= 40 and taper_n = 1 then array[0.50]
    when c.km < 40 and taper_n = 2 then array[0.80, 0.50]
    when c.km < 40 and taper_n = 1 then array[0.55]
    else array_fill(0.6::float8, array[greatest(taper_n, 0)]) end;
  for j in 1 .. taper_n loop
    race_week := j = taper_n;
    weeks := weeks || row(peak * shares[j], case when race_week then null else peak_long * case when j = 1 then 0.7 else 0.5 end end,
                          case when race_week then 'race week' else 'taper' end, null)::garmin.scn_week;
  end loop;
  return weeks;
end $$;

-- ------------------------------------------------------------------------------------------ days
-- planner._quality: the quality session for a phase (which = 0 first, 1 second).
create or replace function garmin.scn_quality(phase text, which int, q_km float8, lt float8, goal float8)
returns garmin.scn_day language plpgsql immutable as $$
declare
  iv float8 := case when lt is not null and lt <> 0 then lt - 20 end;
  gp_km int := greatest(3, round(q_km * 0.6)::int);
  reps int := greatest(3, least(6, round((q_km - 3) / 1.3)::int));
  tempo int := greatest(15, least(25, 5 * round((q_km - 3) * 4.5 / 5)::int));
  cruise int := case when q_km >= 9 then 3 else 2 end;
  d garmin.scn_day;
begin
  d := case phase || ':' || which
    when 'base:0' then row(null, null, null, 'intervals', null, null, iv, format('Intervals: %s x 1 km at %s/km, 2 min jog (VO2max)', reps, garmin.scn_pace(iv)))
    when 'base:1' then row(null, null, null, 'threshold', null, null, lt, format('Tempo: %s min at threshold %s/km', tempo, garmin.scn_pace(lt)))
    when 'build:0' then row(null, null, null, 'threshold', null, null, lt, format('Cruise intervals: %s x 10 min at threshold %s/km, 2 min jog', cruise, garmin.scn_pace(lt)))
    when 'build:1' then row(null, null, null, 'threshold', null, null, goal, format('Goal pace: %s km at %s/km inside the run', gp_km, garmin.scn_pace(goal)))
    when 'peak:0' then row(null, null, null, 'threshold', null, null, lt, format('Threshold: 2 x 15 min at %s/km, 3 min jog', garmin.scn_pace(lt)))
    when 'peak:1' then row(null, null, null, 'threshold', null, null, goal, format('Goal pace: %s km at %s/km inside the run', gp_km + 2, garmin.scn_pace(goal)))
    when 'taper:0' then row(null, null, null, 'threshold', null, null, goal, format('Sharpener: 3 x 2 km at goal pace %s/km, 2 min jog', garmin.scn_pace(goal)))
    when 'taper:1' then row(null, null, null, 'intervals', null, null, iv, format('Strides and 4 x 1 km at %s/km, full recovery', garmin.scn_pace(iv)))
    when 'sharpen:0' then row(null, null, null, 'threshold', null, null, goal, format('Race pace: 3 x 3 km at goal pace %s/km, 3 min jog', garmin.scn_pace(goal)))
    when 'sharpen:1' then row(null, null, null, 'threshold', null, null, lt, format('Threshold: 2 x 12 min at %s/km, 3 min jog', garmin.scn_pace(lt)))
    when 'recovery:0' then row(null, null, null, 'threshold', null, null, lt, format('Tempo: 15 min at threshold %s/km', garmin.scn_pace(lt)))
    else row(null, null, null, 'threshold', null, null, lt, '') end;
  return d;
end $$;

-- planner._week_days: the seven days of one week. race: the race week's race (null otherwise).
create or replace function garmin.scn_week_days(ws date, w garmin.scn_week, easy_p float8, lt float8, goal_p float8,
  is_race_week bool, c garmin.scn_ctx, o garmin.scn_opts)
returns garmin.scn_day[] language plpgsql immutable as $$
declare
  days garmin.scn_day[] := '{}'; q float8; easy_km float8; others int; slots int[]; n int; i int := 0;
  tk float8; nm text; easy_total float8; n_easy int; n_quality int; q_km float8; long_km float8;
  free int[]; easy_each float8; easy_note text; long_note text; used date[]; sday date; qd garmin.scn_day;
begin
  if w.phase = 'race week' then
    q := garmin.scn_r1(least(8.0, w.km * 0.35));
    easy_km := greatest(w.km - q, 0);
    others := greatest(least(o.runs - 2, floor(easy_km / 2.0)::int), 1);
    days := array[row(ws + 1, null, null, 'threshold', q, null, goal_p,
                      format('Sharpener: 4 x 1 km at goal pace %s/km, 2 min jog', garmin.scn_pace(goal_p)))::garmin.scn_day];
    slots := array(select x from unnest((array[3, 5, 2, 0])[1:others]) x order by x);
    foreach n in array slots loop
      days := days || row(ws + n, null, null, 'easy', garmin.scn_r1(easy_km / others), null, easy_p,
                          'Easy' || case when i = 0 then ', with 4 strides' else '' end)::garmin.scn_day;
      i := i + 1;
    end loop;
    if is_race_week then
      days := days || row(c.race_date, null, null, 'race', c.km, c.goal_s / 60, goal_p,
                          format('%s: goal pace %s/km', c.race_name, garmin.scn_pace(goal_p)))::garmin.scn_day;
      days := array(select x from unnest(days) x where (x).day < c.race_date or (x).session = 'race');
    end if;
    used := array(select (x).day from unnest(days) x);
    for n in 0 .. 6 loop
      if not (ws + n = any(used)) and (not is_race_week or ws + n < c.race_date) then
        days := days || row(ws + n, null, null, 'rest', null, null, null, 'Rest')::garmin.scn_day;
      end if;
    end loop;
    return array(select x from unnest(days) x order by (x).day);
  end if;

  if w.tune_up is not null then
    tk := w.tune_up;
    nm := case when tk > 20 then 'half marathon' else '10K' end;
    q := garmin.scn_r1(least(8.0, w.km * 0.2));
    easy_total := greatest(w.km - tk - q, 0);
    n_easy := least(greatest(o.runs - 2, 0), floor(easy_total / 2.0)::int);
    days := array[
      row(ws + 1, null, null, 'threshold', q, null, lt,
          format('Tempo: 15 min at threshold %s/km, the week''s only hard session', garmin.scn_pace(lt)))::garmin.scn_day,
      row(ws + 6, null, null, 'race', garmin.scn_r1(tk), null, case when lt is not null then lt + 10 end,
          format('Tune-up race: a %s as a hard, even effort (about %s/km). Mark it as a race afterwards: its result recalibrates your forecast',
                 nm, garmin.scn_pace(case when lt is not null then lt + 10 end)))::garmin.scn_day];
    slots := array(select x from unnest((array[2, 3, 0, 4])[1:n_easy]) x order by x);
    foreach n in array slots loop
      days := days || row(ws + n, null, null, 'easy', garmin.scn_r1(easy_total / n_easy), null, easy_p, 'Easy, conversational (Z2)')::garmin.scn_day;
    end loop;
    used := array(select (x).day from unnest(days) x);
    for n in 0 .. 6 loop
      if not (ws + n = any(used)) then
        days := days || row(ws + n, null, null, 'rest', null, null, null,
                            case when n <> 5 then 'Rest' else 'Rest before the tune-up race' end)::garmin.scn_day;
      end if;
    end loop;
    return array(select x from unnest(days) x order by (x).day);
  end if;

  n_quality := least(o.quality, o.runs - 1, case when w.phase = 'recovery' then 1 else 2 end);
  q_km := garmin.scn_r1(least(case when w.phase in ('build', 'peak', 'sharpen') then 12.0 else 10.0 end, w.km * 0.2)
                        * case when w.phase = 'taper' then 0.7 else 1 end);
  long_km := case when w.long is not null and w.long <> 0 then garmin.scn_r1(w.long) else 0.0 end;
  for qi in 0 .. n_quality - 1 loop
    qd := garmin.scn_quality(w.phase, qi, q_km, lt, goal_p);
    days := days || row(ws + (array[1, 3])[qi + 1], null, null, qd.session, q_km, null, qd.pace, qd.notes)::garmin.scn_day;
  end loop;
  easy_km := greatest(w.km - long_km - q_km * n_quality, 0);
  n_easy := least(greatest(o.runs - 1 - n_quality, 0), floor(easy_km / 2.0 + 1e-6)::int);
  free := ((array[1, 3])[n_quality + 1 : 2] || array[5, 2, 0, 4])[1:n_easy];
  easy_each := case when n_easy > 0 then least(easy_km / n_easy, greatest(0.75 * long_km, 5.0)) else 0 end;
  easy_note := case when easy_each < 5.0
    then format('Easy, conversational (Z2). Flexible: any free day, or add these %s km to a quality day''s warm-up or cool-down',
                to_char(easy_each, 'FM9990.0'))
    else 'Easy, conversational (Z2). Flexible: any free day' end;
  foreach n in array array(select x from unnest(free) x order by x) loop
    days := days || row(ws + n, null, null, 'easy', garmin.scn_r1(easy_each), null, easy_p, easy_note)::garmin.scn_day;
  end loop;
  long_note := 'Long run, easy and steady (durability)';
  if w.phase = 'sharpen' and goal_p is not null then
    long_note := format('Long run, easy; last %s km at goal pace %s/km', least(5, round(long_km * 0.25)::int), garmin.scn_pace(goal_p));
  elsif w.phase = 'peak' and goal_p is not null then
    long_note := format('Long run, easy; last %s km at goal pace %s/km', least(10, round(long_km * 0.3)::int), garmin.scn_pace(goal_p));
  elsif w.phase = 'build' and goal_p is not null then
    long_note := format('Long run, easy; last %s km at goal pace %s/km', least(6, round(long_km * 0.2)::int), garmin.scn_pace(goal_p));
  end if;
  days := days || row(ws + 6, null, null, 'long', long_km, null, easy_p, long_note)::garmin.scn_day;
  used := array(select (x).day from unnest(days) x);
  sday := (select ws + x from unnest(array[4, 0, 2]) with ordinality t(x, k) where not (ws + x = any(used)) order by k limit 1);
  if sday is not null then
    days := days || row(sday, null, null, 'strength', null, 35, null, 'Strength & plyometrics, 30-40 min (economy)')::garmin.scn_day;
    used := used || sday;
  end if;
  for n in 0 .. 6 loop
    if not (ws + n = any(used)) then
      days := days || row(ws + n, null, null, 'rest', null, null, null, 'Rest')::garmin.scn_day;
    end if;
  end loop;
  return array(select x from unnest(days) x order by (x).day);
end $$;

-- planner._fill_current_week: the current week's days up to today are history; easy runs fill what
-- is left of the week's target after what was already run.
create or replace function garmin.scn_fill_week(days garmin.scn_day[], target float8, done float8, today date)
returns garmin.scn_day[] language plpgsql immutable as $$
declare
  ahead garmin.scn_day[] := array(select x from unnest(days) x where (x).day > today order by (x).day);
  long_km float8 := coalesce((select sum(coalesce((x).planned_km, 0)) from unnest(ahead) x where (x).session = 'long'), 0);
  quality_km float8 := coalesce((select sum(coalesce((x).planned_km, 0)) from unnest(ahead) x where (x).session in ('threshold', 'intervals')), 0);
  n_easy int := (select count(*) from unnest(ahead) x where (x).session = 'easy');
  fill float8 := greatest(target - done - long_km - quality_km, 0);
  cap float8 := greatest(0.75 * long_km, 5.0);
  out garmin.scn_day[] := '{}'; d garmin.scn_day; km float8;
begin
  foreach d in array ahead loop
    if d.session = 'easy' then
      km := garmin.scn_r1(least(fill / n_easy, cap));
      if km >= 2.0 then d.planned_km := km;
      else d := row(d.day, null, null, 'rest', null, null, null, 'Rest'); end if;
    end if;
    out := out || d;
  end loop;
  return out;
end $$;

-- planner.plan_days: the plan's days, from the current week (days after today) or next Monday to race
-- day, each with its week's phase and number. scales: week -> factor on the threshold pace.
create or replace function garmin.scn_days(c garmin.scn_ctx, o garmin.scn_opts, scales float8[] default null)
returns garmin.scn_day[] language plpgsql immutable as $$
declare
  weeks garmin.scn_week[] := garmin.scn_weeks(c, o);
  nw int := coalesce(array_length(weeks, 1), 0);
  target float8 := coalesce(o.target, c.goal_s);
  goal_p float8 := case when target is not null and target <> 0 then target / c.km end;
  out garmin.scn_day[] := '{}'; wk garmin.scn_day[]; s float8; d garmin.scn_day;
begin
  for i in 1 .. nw loop
    s := coalesce(scales[i], 1.0);
    wk := garmin.scn_week_days(c.start + (i - 1) * 7, weeks[i], c.easy_pace,
                               case when c.thr_pace is not null then c.thr_pace * s end, goal_p, i = nw, c, o);
    if i = 1 and c.partial then
      wk := garmin.scn_fill_week(wk, weeks[i].km, c.done_week, c.today);
    end if;
    foreach d in array wk loop
      d.phase := weeks[i].phase; d.week := i;
      out := out || d;
    end loop;
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------------------------- the forecast
-- scenario.marathon_shape: Runalyze's marathon shape on a day, from 26 weeks of km and 10 weeks of
-- runs of 13 km or more, relative to VO2max.
create or replace function garmin.scn_shape(dates date[], kms float8[], on_day date, vo2 float8)
returns float8 language plpgsql immutable as $$
declare wk float8 := 0; lg float8 := 0; den float8; t date; k float8;
begin
  if vo2 is null or vo2 <= 4 then return null; end if;
  den := ln(vo2 / 4) * 12 - 13;
  for i in 1 .. coalesce(array_length(dates, 1), 0) loop
    t := dates[i]; k := kms[i];
    if t between on_day - 181 and on_day then wk := wk + k; end if;
    if t between on_day - 69 and on_day and k >= 13 then
      lg := lg + (2 - 2.0 * (on_day - t) / 70) * power((k - 13) / den, 2);
    end if;
  end loop;
  return 100 * (2.0 / 3 * (wk / 26) / power(vo2, 1.135) + 1.0 / 3 * lg / 10);
end $$;

-- the mean of a CTL path over the 30 days ending on `on_day`; path index 1 = base
create or replace function garmin.scn_ctl30(path float8[], base date, on_day date) returns float8
language sql immutable as $$
  select avg(path[(on_day - base) + 1 - i]) from generate_series(0, 29) i
  where (on_day - base) + 1 - i between 1 and coalesce(array_length(path, 1), 0) $$;

-- The plan's days with their estimated km, minutes and load (scenario._estimate).
create or replace function garmin.scn_est(c garmin.scn_ctx, d garmin.scn_day, out km_est float8, out min_est float8, out load float8)
language plpgsql immutable as $$
declare i int := array_position(c.prof_kind, d.session); pace float8; lpm float8;
begin
  pace := case when i is not null then c.prof_pace[i] end;
  lpm := coalesce(case when i is not null then c.prof_lpm[i] end, 0);
  km_est := case when d.session in ('rest', 'strength') then null
                 when d.planned_km is not null then d.planned_km
                 when d.planned_min is not null and d.planned_min <> 0 and pace is not null and pace <> 0 then d.planned_min * 60 / pace end;
  min_est := case when d.session = 'rest' then 0
                  when d.planned_min is not null then d.planned_min
                  when d.planned_km is not null and d.planned_km <> 0 and pace is not null then d.planned_km * pace / 60 else 0 end;
  load := coalesce(min_est, 0) * lpm;
end $$;

-- scenario.compute: the chain for one set of settings. p_full = false: only what the sweeps need.
create or replace function garmin.scn_compute(c garmin.scn_ctx, o garmin.scn_opts, p_full bool default true)
returns jsonb language plpgsql immutable as $$
declare
  days garmin.scn_day[]; nd int; e record;
  km_est float8[]; min_est float8[]; lds float8[];
  eve date := c.race_date - 1; base date := c.today - 40;
  path float8[]; nhist int; atl float8 := coalesce(c.atl, 0); ctl float8 := coalesce(c.ctl, 0);
  ld float8; t date; fit_atl float8[] := '{}'; fit_ctl float8[] := '{}';
  b float8 := case when c.has_fit then coalesce(c.fit_b, 0) else 0 end;
  c_now float8; c_eve float8; dctl float8; vo2 float8; vo2_shape float8;
  scales float8[]; nweeks int; fams text[]; wphase text[]; wstart date[]; last float8 := 1.0; first int; st date; v float8;
  any_scale bool := false;
  tsb_share float8; in_band bool; taper_adj float8;
  pdates date[]; pkms float8[]; shape float8; pre date; shape_pre float8; sv float8;
  cal float8 := coalesce(nullif(c.fc_cal, 0), 1.0); heat float8 := coalesce(c.fc_heat, 0.0); k float8; sf float8;
  t_full float8; t_shape float8; predicted float8;
  total_km float8 := 0; week_km float8[]; peak_wk float8; long_run float8 := 0;
  result jsonb;
  -- full
  weeks jsonb := '[]'; phases jsonb := '[]'; daysj jsonb := '[]'; fitness jsonb := '[]';
  wk record; ph record; prev_km float8; run_km float8; held float8; s_end float8; v_end float8; endd date;
  keep float8; vo2_lo float8; vo2_hi float8; f_end_ctl float8; f_end_atl float8; idx int;
begin
  days := garmin.scn_days(c, o);
  nd := coalesce(array_length(days, 1), 0);

  -- fatigue and fitness carried to race eve with the plan's load (garmin.projection)
  nhist := coalesce(array_length(c.ctl_hist, 1), 0);
  path := c.ctl_hist || array_fill(null::float8, array[greatest(eve - c.today, 0)]);
  km_est := '{}'; min_est := '{}'; lds := '{}';
  for i in 1 .. nd loop
    e := garmin.scn_est(c, days[i]);
    km_est := km_est || e.km_est; min_est := min_est || e.min_est; lds := lds || e.load;
  end loop;
  t := c.today;
  while t < eve loop
    t := t + 1;
    ld := coalesce((select sum(lds[i]) from generate_series(1, nd) i where (days[i]).day = t), 0);
    atl := atl + (ld - atl) * (1 - exp(-1 / c.atl_days));
    ctl := ctl + (ld - ctl) * (1 - exp(-1 / c.ctl_days));
    path[(t - base) + 1] := ctl;
    fit_atl := fit_atl || atl; fit_ctl := fit_ctl || ctl;
  end loop;

  c_now := garmin.scn_ctl30(c.ctl_hist, base, c.today);

  -- session paces follow the fitness projected at the start of each phase (taper keeps the last)
  nweeks := coalesce((select max((x).week) from unnest(days) x), 0);
  wphase := array(select (select (days[i]).phase from generate_subscripts(days, 1) i where (days[i]).week = w order by i limit 1)
                  from generate_series(1, nweeks) w);
  wstart := array(select (select min((x).day) from unnest(days) x where (x).week = w) from generate_series(1, nweeks) w);
  fams := '{}';
  for i in 1 .. nweeks loop
    fams := fams || case when wphase[i] = 'recovery' and i > 1 then fams[i - 1] else wphase[i] end;
  end loop;
  scales := '{}';
  for i in 1 .. nweeks loop
    if fams[i] in ('taper', 'race week') then scales := scales || last; continue; end if;
    first := i;
    while first > 1 and fams[first - 1] = fams[i] loop first := first - 1; end loop;
    st := wstart[first]; st := st - extract(isodow from st)::int + 1;
    v := case when c.vo2_today is not null then
           c.vo2_today + b * coalesce(garmin.scn_ctl30(path, base, st) - c_now, 0) end;
    last := case when v is not null and v <> 0 and c.vo2_today is not null then c.vo2_today / v else 1.0 end;
    scales := scales || last;
    if abs(last - 1) > 1e-4 then any_scale := true; end if;
  end loop;
  if any_scale then
    days := garmin.scn_days(c, o, scales);
    nd := coalesce(array_length(days, 1), 0);
    km_est := '{}'; min_est := '{}'; lds := '{}';
    for i in 1 .. nd loop
      e := garmin.scn_est(c, days[i]);
      km_est := km_est || e.km_est; min_est := min_est || e.min_est; lds := lds || e.load;
    end loop;
  end if;
  tsb_share := case when ctl <> 0 then (ctl - atl) / ctl end;
  in_band := tsb_share is not null and tsb_share between c.band_lo and c.band_hi;
  taper_adj := case when tsb_share is not null and tsb_share < c.band_lo then c.taper_gain else 0.0 end;

  -- race fitness on race day
  c_eve := garmin.scn_ctl30(path, base, eve);
  dctl := case when c_now is not null and c_eve is not null then c_eve - c_now else 0 end;
  vo2 := case when c.vo2_today is not null then c.vo2_today + b * dctl end;
  vo2_shape := coalesce(c.vo2_today, c.vo2_garmin, 0) + b * dctl;

  -- marathon shape on race eve: runs so far plus the plan's runs (a tune-up race included)
  pdates := coalesce(c.run_dates, '{}'); pkms := coalesce(c.run_kms, '{}');
  for i in 1 .. nd loop
    if (days[i]).day > c.today and (days[i]).day < c.race_date and (days[i]).session not in ('rest', 'strength')
       and km_est[i] is not null and km_est[i] <> 0 then
      pdates := pdates || (days[i]).day; pkms := pkms || km_est[i];
    end if;
  end loop;
  shape := garmin.scn_shape(pdates, pkms, eve, vo2_shape);
  -- a planned taper keeps endurance: the higher of race eve and the 3 weeks before the taper
  pre := (select min((x).day) - 1 from unnest(days) x where (x).phase in ('taper', 'race week'));
  shape_pre := null;
  if pre is not null then
    for kk in 0 .. 2 loop
      if c.today < pre - 7 * kk and pre - 7 * kk < eve then
        sv := garmin.scn_shape(pdates, pkms, pre - 7 * kk, vo2_shape);
        if sv is not null and (shape_pre is null or sv > shape_pre) then shape_pre := sv; end if;
      end if;
    end loop;
  end if;
  if shape is not null and shape_pre is not null then shape := greatest(shape, shape_pre); end if;

  k := cal * (1 + heat / 100) * (1 + taper_adj / 100);
  sf := garmin.shape_factor(shape, c.km);
  t_full := case when vo2 is not null and vo2 <> 0 then garmin.daniels_time_s(vo2, c.km) end;
  t_shape := case when vo2 is not null and vo2 <> 0 then garmin.daniels_time_s(vo2 * sf, c.km) end;
  predicted := t_shape * k;
  week_km := array_fill(0.0::float8, array[greatest(nweeks, 1)]);
  for i in 1 .. nd loop
    if (days[i]).session in ('easy', 'long', 'threshold', 'intervals') or ((days[i]).session = 'race' and (days[i]).day < c.race_date) then
      if (days[i]).day > c.today then total_km := total_km + coalesce(km_est[i], 0); end if;
      week_km[(days[i]).week] := week_km[(days[i]).week] + coalesce(km_est[i], 0);
    end if;
    if (days[i]).session = 'long' then long_run := greatest(long_run, coalesce(km_est[i], 0)); end if;
  end loop;
  if c.partial and nweeks >= 1 then week_km[1] := week_km[1] + coalesce(c.done_week, 0); end if;
  peak_wk := (select max(x) from unnest(week_km) x);
  result := jsonb_build_object('predicted_time_s', predicted, 'shape_race', shape, 'vo2_race', vo2, 'tsb_in_band', in_band,
                               'total_km', total_km, 'peak_week_km', peak_wk, 'long_run_km', long_run);
  if not p_full then return result; end if;

  -- weeks (scenario._weeks_summary)
  prev_km := null;
  for w in 1 .. nweeks loop
    select min((days[i]).day) as first_day,
           sum(case when (days[i]).session in ('easy', 'long', 'threshold', 'intervals') then coalesce(km_est[i], 0) else 0 end) as run_km,
           max(case when (days[i]).session = 'long' then coalesce(km_est[i], 0) end) as long_km,
           count(*) filter (where (days[i]).session in ('easy', 'long', 'threshold', 'intervals', 'race')) as runs,
           count(*) filter (where (days[i]).session in ('threshold', 'intervals')) as quality,
           coalesce(sum(case when (days[i]).session = 'race' then coalesce(km_est[i], 0) end), 0) as race_km,
           sum(lds[i]) as load
      into wk
      from generate_subscripts(days, 1) i where (days[i]).week = w;
    run_km := wk.run_km + case when w = 1 and c.partial then coalesce(c.done_week, 0) else 0 end;
    weeks := weeks || jsonb_build_object(
      'week', w, 'week_start', wk.first_day - extract(isodow from wk.first_day)::int + 1, 'phase', wphase[w],
      'km', run_km, 'done_km', case when w = 1 and c.partial and coalesce(c.done_week, 0) <> 0 then c.done_week end,
      'long_km', wk.long_km, 'runs', wk.runs, 'quality', wk.quality, 'race_km', wk.race_km, 'load', wk.load,
      'ramp_pct', case when prev_km is not null and prev_km <> 0 then (run_km / prev_km - 1) * 100 end);
    prev_km := run_km;
  end loop;

  -- days
  for i in 1 .. nd loop
    daysj := daysj || jsonb_build_object('day', (days[i]).day, 'week', (days[i]).week, 'phase', (days[i]).phase,
      'session', (days[i]).session, 'planned_km', (days[i]).planned_km, 'planned_min', (days[i]).planned_min,
      'km_est', km_est[i], 'target_pace_s_per_km', (days[i]).pace, 'notes', (days[i]).notes);
  end loop;

  -- phases (scenario._phases) and what each should leave you with at its last day
  held := null;
  for ph in
    with w as (
      select (x->>'week')::int as week, (x->>'week_start')::date as ws, x->>'phase' as phase, (x->>'km')::float8 as km,
             (x->>'long_km')::float8 as long_km, (x->>'runs')::int as runs, (x->>'quality')::int as quality
      from jsonb_array_elements(weeks) x),
    f as (select w.*, case when phase = 'recovery' and week > 1 then null else phase end as fam0 from w),
    g as (select f.*, (array_remove(array_agg(fam0) over (order by week), null))[
                         array_length(array_remove(array_agg(fam0) over (order by week), null), 1)] as fam from f),
    h as (select g.*, case when fam is distinct from lag(fam) over (order by week) then 1 else 0 end as brk from g),
    b as (select h.*, sum(brk) over (order by week) as blk from h)
    select blk, min(fam) as fam, min(week) as from_week, max(week) as to_week, min(ws) as start, max(ws) + 6 as end_day,
           array_agg(week order by week) filter (where phase = 'recovery') as rec_weeks,
           coalesce(array_agg(week order by week) filter (where phase <> 'recovery'), array_agg(week order by week)) as ws_weeks
    from b group by blk order by blk
  loop
    endd := least(ph.end_day, eve);
    idx := endd - c.today;
    f_end_ctl := case when idx between 1 and coalesce(array_length(fit_ctl, 1), 0) then fit_ctl[idx] end;
    f_end_atl := case when idx between 1 and coalesce(array_length(fit_atl, 1), 0) then fit_atl[idx] end;
    v_end := case when c.vo2_today is not null then c.vo2_today + b * coalesce(garmin.scn_ctl30(path, base, endd) - c_now, 0) end;
    s_end := garmin.scn_shape(
      array(select pdates[i] from generate_series(1, coalesce(array_length(pdates, 1), 0)) i where pdates[i] <= endd),
      array(select pkms[i] from generate_series(1, coalesce(array_length(pdates, 1), 0)) i where pdates[i] <= endd),
      endd, coalesce(c.vo2_today, c.vo2_garmin, 0) + case when v_end is not null and c.vo2_today is not null then v_end - c.vo2_today else 0 end);
    if ph.fam in ('taper', 'race week') then
      keep := coalesce(shape_pre, held);
      if s_end is not null and keep is not null and pre is not null and pre > c.today then s_end := greatest(s_end, keep); end if;
    else
      held := s_end;
    end if;
    phases := phases || (
      select jsonb_build_object(
        'phase', ph.fam,
        'title', case ph.fam when 'sharpen' then 'Sharpen: hold and get race-ready' when 'base' then 'Base: aerobic volume and VO2max'
                   when 'build' then 'Build: threshold and marathon-specific' when 'peak' then 'Peak: the biggest weeks'
                   when 'taper' then 'Taper: freshness' when 'race week' then 'Race week' else initcap(ph.fam) end,
        'purpose', case ph.fam when 'sharpen' then 'Keep the fitness you have and rehearse race pace'
                   when 'base' then 'Endurance: more weekly km and longer long runs raise the marathon shape (volume, durability); short intervals keep VO2max moving'
                   when 'build' then 'Threshold: the share of VO2max you can hold for hours, plus race-specific long runs'
                   when 'peak' then 'The most endurance before the taper: the marathon shape peaks here'
                   when 'taper' then 'Freshness: fatigue falls faster than fitness, so you race rested'
                   when 'race week' then 'Arrive fresh' else '' end,
        'from_week', ph.from_week, 'to_week', ph.to_week, 'start', ph.start, 'end', ph.end_day,
        'km_from', (select (x->>'km')::float8 from jsonb_array_elements(weeks) x where (x->>'week')::int = ph.ws_weeks[1]),
        'km_to', (select (x->>'km')::float8 from jsonb_array_elements(weeks) x where (x->>'week')::int = ph.ws_weeks[array_length(ph.ws_weeks, 1)]),
        'long_to', (select (x->>'long_km')::float8 from jsonb_array_elements(weeks) x where (x->>'week')::int = any(ph.ws_weeks) and (x->>'long_km') is not null
                    order by (x->>'week')::int desc limit 1),
        'recovery_weeks', coalesce(to_jsonb(ph.rec_weeks), '[]'),
        'expected', jsonb_build_object(
          'on', endd, 'vo2', v_end, 'shape', s_end,
          'threshold_pace_s_per_km', case when c.thr_pace is not null and v_end is not null and v_end <> 0 and c.vo2_today is not null
                                          then c.thr_pace * c.vo2_today / v_end end,
          'race_time_s', case when v_end is not null and v_end <> 0
                              then garmin.daniels_time_s(v_end * garmin.shape_factor(s_end, c.km), c.km) * cal * (1 + heat / 100) end,
          'ctl', f_end_ctl, 'atl', f_end_atl,
          'form_share', case when f_end_ctl is not null and f_end_ctl <> 0 then (f_end_ctl - f_end_atl) / f_end_ctl end)));
  end loop;

  vo2_lo := case when c.has_fit and c.vo2_today is not null and c.fit_lo is not null then c.vo2_today + c.fit_lo * dctl end;
  vo2_hi := case when c.has_fit and c.vo2_today is not null and c.fit_hi is not null then c.vo2_today + c.fit_hi * dctl end;
  return result || jsonb_build_object(
    'options', jsonb_build_object('runs_per_week', o.runs, 'peak_km', o.peak, 'quality', o.quality, 'long_max_km', o.long_max,
                                  'ramp_pct', o.ramp, 'taper_weeks', o.taper, 'target_time_s', o.target, 'tune_up', o.tune,
                                  'start_km', o.start_km, 'front_loaded', o.front),
    'result', jsonb_build_object(
      'predicted_time_s', predicted, 'band_pct', c.fc_band, 'now_time_s', c.fc_pred, 'now_has_plan', c.fc_has_plan,
      'daniels_time_s', t_full, 'daniels_shape_time_s', t_shape, 'time_if_shape_met_s', t_full * k,
      'calibration', cal, 'heat_adj_pct', heat, 'taper_adj_pct', taper_adj, 'k', k,
      'vo2_today', c.vo2_today, 'vo2_race', vo2,
      'vo2_race_range', case when vo2_lo is not null and vo2_hi is not null then jsonb_build_array(least(vo2_lo, vo2_hi), greatest(vo2_lo, vo2_hi)) end,
      'vo2_per_ctl', b, 'ctl30_today', c_now, 'ctl30_race', c_eve,
      'shape_today', c.shape_today, 'shape_race', shape, 'shape_needed', power(c.km, 1.23), 'shape_factor', sf,
      'tsb_share', tsb_share, 'tsb_in_band', in_band, 'tsb_band', jsonb_build_array(c.band_lo, c.band_hi),
      'race_wbgt_c', c.fc_race_wbgt, 'training_wbgt_c', c.fc_train_wbgt, 'decoupling_pct', c.decoupling,
      'lt_fraction', c.lt_fraction, 'threshold_pace_today', c.thr_pace),
    'weeks', weeks, 'phases', phases, 'days', daysj);
end $$;

-- ------------------------------------------------------------------------- the recommended plan
-- scenario.best_realistic: the fastest plan with every setting in its safe zone and race-morning
-- freshness in the band, runs a week kept; when none lands in the band, the fastest one.
create or replace function garmin.scn_best_realistic(c garmin.scn_ctx, o garmin.scn_opts, out best garmin.scn_opts, out best_t float8)
language plpgsql immutable as $$
declare
  lm float8 := garmin.scn_long_max(c.km); td int := garmin.scn_taper_default(c.km);
  tapers int[] := array[td] || array(select x from unnest(garmin.scn_tapers(c.km)) x where x <> td);
  fallback garmin.scn_opts := o; fallback_t float8 := 'infinity'; x garmin.scn_opts; r jsonb; t float8;
  ramp int; lng float8; q int; tp int; fr bool;
begin
  best := o; best_t := 'infinity';
  foreach fr in array array[false, true] loop
    foreach ramp in array array[10, 8, 6] loop
      foreach lng in array array(select distinct v from unnest(array[lm - 6, lm - 3, lm]) v order by v desc) loop
        foreach q in array array(select distinct v from unnest(array[least(2, o.runs - 1), least(1, o.runs - 1)]) v order by v desc) loop
          foreach tp in array tapers loop
            x := o; x.ramp := ramp; x.long_max := lng; x.quality := q; x.taper := tp; x.front := fr;
            r := garmin.scn_compute(c, x, false);
            t := coalesce((r->>'predicted_time_s')::float8, 'infinity');
            if (r->>'tsb_in_band')::bool and t < best_t - 1 then best := x; best_t := t; end if;
            if t < fallback_t - 1 then fallback := x; fallback_t := t; end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  if best_t = 'infinity' then best := fallback; best_t := fallback_t; end if;
  if best_t = 'infinity' then best_t := null; end if;
end $$;

-- scenario.least_effort: the plan that reaches the goal with the least running, every setting safe,
-- race morning fresh; for each combination the smallest biggest week that still reaches the goal,
-- by bisection. Null when no safe plan reaches the goal.
create or replace function garmin.scn_least_effort(c garmin.scn_ctx, o garmin.scn_opts, goal float8,
  out best garmin.scn_opts, out found_any bool)
language plpgsql immutable as $$
declare
  lm float8 := garmin.scn_long_max(c.km); td int := garmin.scn_taper_default(c.km);
  tapers int[] := array[td] || array(select x from unnest(garmin.scn_tapers(c.km)) x where x <> td);
  peak_hi float8 := coalesce(nullif(c.h_peak_default, 0), garmin.scn_peak_cap(c.km));
  peak_lo float8 := greatest(15, floor(c.vol0));
  x garmin.scn_opts; y garmin.scn_opts; r jsonb; lo float8; hi float8; mid float8;
  key_km float8; key_q int; key_hi float8; best_km float8; best_q int; best_hi float8;
  ramp float8; lng float8; q int; tp int; fr bool;
begin
  found_any := false;
  foreach fr in array array[false, true] loop
    foreach ramp in array array[6.0, 8.0, 10.0] loop
      foreach lng in array array(select distinct v from unnest(array[lm - 6, lm - 4, lm - 2, lm]) v order by v) loop
        foreach q in array array(select distinct v from unnest(array[least(1, o.runs - 1), least(2, o.runs - 1)]) v order by v) loop
          foreach tp in array tapers loop
            x := o; x.ramp := ramp; x.long_max := lng; x.quality := q; x.taper := tp; x.peak := peak_hi; x.front := fr;
            if not garmin.scn_reaches(c, x, goal) then continue; end if;
            lo := peak_lo; hi := peak_hi;
            y := x; y.peak := lo;
            if garmin.scn_reaches(c, y, goal) then hi := lo; end if;
            while hi - lo > 1 loop
              mid := floor((lo + hi) / 2);
              y := x; y.peak := mid;
              if garmin.scn_reaches(c, y, goal) then hi := mid; else lo := mid; end if;
            end loop;
            x.peak := hi;
            r := garmin.scn_compute(c, x, false);
            if not ((r->>'predicted_time_s')::float8 <= goal and (r->>'tsb_in_band')::bool) then continue; end if;
            key_km := round((r->>'total_km')::float8); key_q := q; key_hi := hi;
            if not found_any or (key_km, key_q, key_hi) < (best_km, best_q, best_hi) then
              best := x; best_km := key_km; best_q := key_q; best_hi := key_hi; found_any := true;
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

create or replace function garmin.scn_reaches(c garmin.scn_ctx, o garmin.scn_opts, goal float8) returns bool
language plpgsql immutable as $$
declare r jsonb := garmin.scn_compute(c, o, false);
begin
  return coalesce((r->>'predicted_time_s')::float8 <= goal and (r->>'tsb_in_band')::bool, false);
end $$;

-- The recommended plan for a race and runs a week, and the target it sets (scenario.preview and
-- scenario._target): the least running that reaches the goal; when no safe plan reaches it, the
-- fastest safe plan.
create or replace function garmin.scn_best(c garmin.scn_ctx, p_runs int) returns jsonb
language plpgsql immutable as $$
declare
  habits garmin.scn_opts := garmin.scn_options(c, p_runs, null, null, null, null, null, null, null, null, null);
  fast garmin.scn_opts; fast_t float8; easy garmin.scn_opts; easy_found bool := false; best garmin.scn_opts;
  fullr jsonb; res jsonb; best_t float8; goal float8 := c.goal_s; now_t float8 := c.fc_pred;
  t jsonb; g float8; vdot float8; f float8; target_t float8; reachable bool; rec record;
begin
  rec := garmin.scn_best_realistic(c, habits);
  fast := rec.best; fast_t := rec.best_t;
  if goal is not null and fast_t is not null and fast_t <= goal then
    rec := garmin.scn_least_effort(c, fast, goal);
    easy := rec.best; easy_found := rec.found_any;
  end if;
  best := case when easy_found then easy else fast end;
  fullr := garmin.scn_compute(c, best, true);
  res := fullr->'result';
  best_t := (res->>'predicted_time_s')::float8;
  t := jsonb_build_object(
    'goal_time_s', goal, 'best_time_s', best_t, 'best_options', fullr->'options',
    'best_shape', res->'shape_race', 'best_vo2', res->'vo2_race', 'best_total_km', fullr->'total_km',
    'best_peak_km', (select max((x->>'km')::float8) from jsonb_array_elements(fullr->'weeks') x),
    'now_time_s', now_t, 'now_has_plan', c.fc_has_plan,
    'now_is_best', coalesce(now_t is not null and best_t is not null and abs(now_t - best_t) <= 60, false),
    'saved_faster_than_safe', coalesce(now_t is not null and best_t is not null and c.fc_has_plan and now_t < best_t - 60, false),
    'little_time', (c.race_date - c.today) < 35);
  if goal is null or best_t is null then
    reachable := null; target_t := best_t;
  else
    reachable := best_t <= goal + 30;
    target_t := case when reachable then goal else best_t end;
    g := goal / (res->>'k')::float8;
    vdot := garmin.daniels_vdot(g, c.km);
    f := case when (res->>'vo2_race') is not null then vdot / (res->>'vo2_race')::float8 end;
    t := t || jsonb_build_object(
      'goal_vdot_full_shape', vdot, 'goal_vo2_at_best_shape', vdot / (res->>'shape_factor')::float8,
      'goal_shape_at_best_vo2', case when f between 0.6 and 1 then power(c.km, 1.23) - (1 - (f - 0.6) / 0.4) * 100 end,
      'goal_needs_more_than_full_shape', coalesce(f > 1, false));
  end if;
  if easy_found then reachable := true; target_t := goal; end if;
  return t || jsonb_build_object(
    'reachable', reachable, 'target_time_s', target_t, 'fastest_time_s', fast_t,
    'fastest_total_km', (garmin.scn_compute(c, fast, false))->'total_km', 'least_effort', easy_found);
end $$;

-- ---------------------------------------------------------------------------------- the sweeps
-- scenario.control_space and scenario._zones: for each setting, the race time at each of its
-- values with the others held, and the evidence's zone (green safe, amber caution, red injury risk;
-- a value that leaves race morning outside the freshness band is a caution too).
create or replace function garmin.scn_sweep(c garmin.scn_ctx, o garmin.scn_opts, target float8)
returns table (key text, ord int, label text, unit text, life bool, risk_note text, current_value float8,
               value float8, time_s float8, shape float8, vo2 float8, zone text, fresh bool, reaches bool)
language plpgsql immutable as $$
declare
  lm float8 := garmin.scn_long_max(c.km);
  long_hi int := case when c.km >= 40 then 36 when c.km >= 20 then 26 else 20 end;
  big float8 := coalesce(c.h_biggest, 0);
  safe_peak float8 := case when big > 0 then 1.25 * big else garmin.scn_peak_cap(c.km) end;
  last float8 := coalesce(nullif(c.h_last_week, 0), nullif(c.h_start_km, 0), 40.0);
  tapers int[] := garmin.scn_tapers(c.km);
  possible bool := garmin.scn_tune_up_possible(c.km, c.h_weeks);
  keys text[] := array['start_km', 'ramp_pct', 'peak_km', 'long_max_km', 'runs_per_week', 'quality', 'taper_weeks', 'front_loaded']
                 || case when possible then array['tune_up'] else '{}'::text[] end;
  vals float8[]; cur float8; x garmin.scn_opts; r jsonb; amber bool; red bool; t float8; kk text; i int := 0; v float8;
begin
  foreach kk in array keys loop
    i := i + 1;
    key := kk; ord := i; life := kk = 'runs_per_week';
    cur := case kk when 'start_km' then o.start_km when 'ramp_pct' then o.ramp when 'peak_km' then o.peak
             when 'long_max_km' then o.long_max when 'runs_per_week' then o.runs when 'quality' then o.quality
             when 'taper_weeks' then o.taper when 'front_loaded' then o.front::int when 'tune_up' then o.tune::int end;
    current_value := cur;
    label := case kk when 'start_km' then 'This week' when 'ramp_pct' then 'Weekly increase' when 'peak_km' then 'Biggest week'
               when 'long_max_km' then 'Longest long run' when 'runs_per_week' then 'Runs per week'
               when 'quality' then 'Quality sessions a week' when 'taper_weeks' then 'Taper' when 'front_loaded' then 'Build-up'
               else 'Tune-up race' end;
    unit := case kk when 'start_km' then ' km' when 'ramp_pct' then ' %' when 'peak_km' then ' km' when 'long_max_km' then ' km'
              when 'taper_weeks' then ' wk' else '' end;
    risk_note := case kk
      when 'start_km' then format('more than 10 %% over last week (%s km) is the usual caution; over 20 %% raised injuries in the next 3 weeks (Damsted 2019)', round(last))
      when 'ramp_pct' then 'over 10 % is the usual caution; over 20 % a week raised injuries in the next 3 weeks (Damsted 2019)'
      when 'peak_km' then format('well beyond your biggest week of the last year (%s km): your body has not carried that load yet', round(big))
      when 'long_max_km' then format('beyond %s km, the usual cap for this distance, the recovery cost grows faster than the benefit (weak evidence). Each long run stays within 10 %% of your longest of the past 4 weeks (Frandsen 2025)', round(lm))
      when 'runs_per_week' then '7 runs leaves no rest day'
      when 'quality' then '0 leaves threshold and VO2max to volume alone; more than 2 hard sessions a week is a common caution'
      when 'taper_weeks' then format('the evidence favours %s weeks for this distance (Bosquet 2007)', array_to_string(tapers, '–'))
      when 'front_loaded' then 'gradual: biggest week at the peak, long runs alternating, less total running; front-loaded: biggest week as early as the weekly increase allows, the longest long run every week, more running. Both stay inside the injury limits; no study compares them'
      else 'a race 6 weeks out checks the forecast against reality; it costs a lighter week' end;
    vals := case kk
      when 'start_km' then array(select generate_series((5 * floor(last * 0.8 / 5))::int, floor(last * 1.3)::int, 5)::float8)
      when 'ramp_pct' then array(select generate_series(4, 24, 2)::float8)
      when 'peak_km' then array(select generate_series(30, garmin.scn_peak_cap(c.km)::int, 5)::float8)
                          || case when coalesce(c.h_peak_default, 0) > 0 then array[floor(c.h_peak_default)] else '{}'::float8[] end
      when 'long_max_km' then array(select generate_series(case when c.km >= 20 then 10 else 8 end, long_hi, 2)::float8)
      when 'runs_per_week' then array[3, 4, 5, 6, 7]::float8[]
      when 'quality' then array[0, 1, 2]::float8[]
      when 'taper_weeks' then tapers::float8[]
      else array[0, 1]::float8[] end;
    vals := array(select distinct u from unnest(vals || cur) u where u is not null order by u);
    foreach v in array vals loop
      x := o;
      case kk
        when 'start_km' then x.start_km := v; when 'ramp_pct' then x.ramp := v; when 'peak_km' then x.peak := v;
        when 'long_max_km' then x.long_max := v; when 'runs_per_week' then x.runs := v::int;
        when 'quality' then x.quality := v::int; when 'taper_weeks' then x.taper := v::int;
        when 'front_loaded' then x.front := v <> 0; else x.tune := v <> 0;
      end case;
      r := garmin.scn_compute(c, x, false);
      t := (r->>'predicted_time_s')::float8;
      red := case kk when 'start_km' then v > last * 1.20 + 0.5 when 'ramp_pct' then v > 20 else false end;
      amber := case kk when 'start_km' then v > last * 1.10 + 0.5 when 'ramp_pct' then v > 10
                 when 'peak_km' then v > safe_peak + 0.5 when 'long_max_km' then v > lm + 0.5
                 when 'runs_per_week' then v >= 7 when 'quality' then v = 0
                 when 'taper_weeks' then not (v::int = any(tapers)) else false end;
      value := v; time_s := t; shape := (r->>'shape_race')::float8; vo2 := (r->>'vo2_race')::float8;
      fresh := (r->>'tsb_in_band')::bool;
      zone := case when red then 'red' when amber or not fresh then 'amber' else 'green' end;
      reaches := coalesce(target is not null and t is not null and t <= target + 30, false);
      return next;
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------------------- per refresh: inputs
-- Each upcoming race's inputs, and its recommended plan per runs a week (3 to 7). Refreshed by
-- garmin-sync fit (model.refresh_scenarios), after the model's constants are fitted.
create materialized view garmin.scenario_context as
select race_id, ctx
from (select r.race_id, garmin.scn_ctx_load(r.race_id) as ctx from app.race r where r.race_date > current_date) x
where ctx is not null;
create unique index on garmin.scenario_context (race_id);

create materialized view garmin.scenario_best as
select s.race_id, n.runs as runs_per_week, n.runs = (s.ctx).h_runs as is_habit, b.best as target,
       (b.best->'best_options'->>'peak_km')::float8      as peak_km,
       (b.best->'best_options'->>'quality')::int         as quality,
       (b.best->'best_options'->>'long_max_km')::float8  as long_max_km,
       (b.best->'best_options'->>'ramp_pct')::float8     as ramp_pct,
       (b.best->'best_options'->>'taper_weeks')::int     as taper_weeks,
       (b.best->'best_options'->>'front_loaded')::bool::int as front_loaded,
       (b.best->'best_options'->>'tune_up')::bool::int   as tune_up,
       (b.best->'best_options'->>'start_km')::numeric    as start_km,
       (b.best->>'target_time_s')::float8                as target_time_s,
       (b.best->>'best_time_s')::float8                  as best_time_s,
       (b.best->>'fastest_time_s')::float8               as fastest_time_s,
       (b.best->>'reachable')::bool                      as reachable
from garmin.scenario_context s
cross join generate_series(3, 7) n(runs)
cross join lateral (select garmin.scn_best(s.ctx, n.runs) as best) b;
create unique index on garmin.scenario_best (race_id, runs_per_week);

-- ------------------------------------------------------------------------- per query: the grid
-- Every value each setting can take; a query filters each to one (see the top of this file).
create view garmin.scenario_grid as
select s.race_id, runs.v as runs_per_week, peak.v as peak_km, quality.v as quality, long_max.v as long_max_km,
       ramp.v as ramp_pct, taper.v as taper_weeks, front.v as front_loaded, tune.v as tune_up, start.v as start_km
from (select race_id from garmin.scenario_context) s
cross join generate_series(3, 7) runs(v)
cross join generate_series(15, 160) peak(v)
cross join generate_series(0, 2) quality(v)
cross join generate_series(8, 42) long_max(v)
cross join generate_series(0, 30) ramp(v)
cross join generate_series(1, 3) taper(v)
cross join generate_series(0, 1) front(v)
cross join generate_series(0, 1) tune(v)
cross join generate_series(10.0, 160.0, 0.1) start(v);

-- One scenario, all of it: the plan, its forecast, and the target from the recommended plan.
create or replace function garmin.scn_scenario(p_race_id bigint, p_runs int, p_peak float8, p_quality int, p_long_max float8,
  p_ramp float8, p_taper int, p_front int, p_tune int, p_start_km float8)
returns jsonb language plpgsql stable as $$
declare c garmin.scn_ctx; tgt jsonb; o garmin.scn_opts; r jsonb;
begin
  c := (select s.ctx from garmin.scenario_context s where s.race_id = p_race_id);
  if c is null then return null; end if;
  select target into tgt from garmin.scenario_best where race_id = p_race_id and runs_per_week = p_runs;
  o := garmin.scn_options(c, p_runs, p_peak, p_quality, p_long_max, p_ramp, p_taper, p_front <> 0, p_tune <> 0, p_start_km,
                          (tgt->>'target_time_s')::float8);
  r := garmin.scn_compute(c, o, true);
  return r || jsonb_build_object('target', tgt, 'weeks_to_race', (c.race_date - c.today) / 7.0, 'today', c.today,
                                 'race', jsonb_build_object('race_id', c.race_id, 'name', c.race_name, 'race_date', c.race_date,
                                                            'distance_km', c.km, 'goal_time_s', c.goal_s));
end $$;

create or replace function garmin.scn_scenario_sweep(p_race_id bigint, p_runs int, p_peak float8, p_quality int, p_long_max float8,
  p_ramp float8, p_taper int, p_front int, p_tune int, p_start_km float8)
returns table (key text, ord int, label text, unit text, life bool, risk_note text, current_value float8,
               value float8, time_s float8, shape float8, vo2 float8, zone text, fresh bool, reaches bool)
language plpgsql stable as $$
declare c garmin.scn_ctx; tgt jsonb; o garmin.scn_opts;
begin
  c := (select s.ctx from garmin.scenario_context s where s.race_id = p_race_id);
  if c is null then return; end if;
  select target into tgt from garmin.scenario_best where race_id = p_race_id and runs_per_week = p_runs;
  o := garmin.scn_options(c, p_runs, p_peak, p_quality, p_long_max, p_ramp, p_taper, p_front <> 0, p_tune <> 0, p_start_km,
                          (tgt->>'target_time_s')::float8);
  return query select * from garmin.scn_sweep(c, o, (tgt->>'target_time_s')::float8);
end $$;
