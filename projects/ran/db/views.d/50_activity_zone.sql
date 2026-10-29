-- Each run's distance and time per heart-rate zone and per pace zone, from its per-second samples:
-- the run-distance chart stacks its bars by zone. Materialized (the sync refreshes it, after
-- garmin.day). Recreated on every migrate.
--   kind 'hr'    Garmin's heart-rate zones of that run (garmin.activity_hr_zone), 1 warm-up .. 5 max
--   kind 'pace'  grade-adjusted pace, smoothed over 15 samples, against the threshold pace of that day
--                (Garmin's, else your own): 1 recovery (slower than 1.35 x threshold pace),
--                2 endurance (1.16-1.35), 3 tempo (1.04-1.16), 4 threshold (0.98-1.04), 5 VO2max
--                (0.92-0.98), 6 anaerobic (faster); the bands the activity detail uses
--   zone 0       no heart rate, no zones or no threshold for that sample
-- A sample counts the distance and time since the one before (GPS jumps over 100 m and gaps over
-- 10 s left out), so a run's zones add up to about its distance.
drop materialized view if exists garmin.activity_zone;
create materialized view garmin.activity_zone as
with smp as (
  select s.activity_id, a.start_date, s.heart_rate,
         avg(nullif(coalesce(s.grade_adj_speed_mps, s.speed_mps), 0)) over w15                  as v15,
         greatest(s.distance_m - lag(s.distance_m) over w, 0)                                   as dm,
         least(greatest(s.elapsed_s - lag(s.elapsed_s) over w, 0), 10)                          as dt
  from garmin.activity a
  join garmin.activity_sample s using (activity_id)
  where a.is_run
  window w as (partition by s.activity_id order by s.seq),
         w15 as (partition by s.activity_id order by s.seq rows between 14 preceding and current row)
),
bounds as (
  select activity_id,
         max(low_bpm) filter (where zone = 2) as b2, max(low_bpm) filter (where zone = 3) as b3,
         max(low_bpm) filter (where zone = 4) as b4, max(low_bpm) filter (where zone = 5) as b5
  from garmin.activity_hr_zone group by activity_id
),
z as (
  select s.activity_id,
         case when s.dm > 100 then 0 else s.dm end as dm,
         coalesce(s.dt, 0) as dt,
         case when s.heart_rate is null or b.b2 is null then 0
              when s.heart_rate >= b.b5 then 5 when s.heart_rate >= b.b4 then 4
              when s.heart_rate >= b.b3 then 3 when s.heart_rate >= b.b2 then 2 else 1 end           as hr_zone,
         case when t.ts is null or s.v15 is null then 0
              when t.ts / s.v15 < 0.92 then 6 when t.ts / s.v15 < 0.98 then 5
              when t.ts / s.v15 < 1.04 then 4 when t.ts / s.v15 < 1.16 then 3
              when t.ts / s.v15 < 1.35 then 2 else 1 end                                              as pace_zone
  from smp s
  left join bounds b using (activity_id)
  left join (select calendar_date, coalesce(lt_speed_mps, lt_speed_own_mps) as ts from garmin.day) t
         on t.calendar_date = s.start_date
)
select activity_id * 100 + 10 + hr_zone as zone_id, activity_id, 'hr' as kind, hr_zone as zone,
       sum(coalesce(dm, 0)) / 1000 as km, sum(dt) as secs
from z group by activity_id, hr_zone
union all
select activity_id * 100 + 20 + pace_zone, activity_id, 'pace', pace_zone,
       sum(coalesce(dm, 0)) / 1000, sum(dt)
from z group by activity_id, pace_zone;

create unique index on garmin.activity_zone (zone_id);
create index on garmin.activity_zone (activity_id);
