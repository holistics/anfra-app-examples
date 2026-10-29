-- Best efforts with their run's context. Recreated on every migrate (views.sql drops
-- garmin.activity with cascade, which would remove it anyway).
--   is_pb      no faster outdoor effort at this distance before this run (a personal best when run)
--   rank_all   rank among outdoor runs at this distance, 1 = all-time best
-- Treadmill and other indoor efforts are kept but never ranked: their distance comes from a
-- foot pod or the belt setting, not GPS.
drop view if exists garmin.best_effort_run;
create view garmin.best_effort_run as
select
  e.activity_id * 10 + array_position(array[1, 5, 10, 21.0975, 42.195]::float[], e.distance_km) as effort_id,
  e.activity_id,
  e.distance_km,
  case e.distance_km when 1 then '1K' when 5 then '5K' when 10 then '10K'
                     when 21.0975 then 'Half marathon' when 42.195 then 'Marathon' end           as distance_label,
  e.time_s,
  e.time_s / e.distance_km                                                                      as pace_s_per_km,
  e.start_s,
  e.start_m,
  e.avg_hr,
  a.start_date,
  a.start_time_gmt,
  a.activity_name,
  a.wbgt_c,
  a.is_indoor,
  case when not a.is_indoor then
    not exists (select 1 from garmin.best_effort p join raw.activity pa using (activity_id)
                where p.distance_km = e.distance_km and p.time_s < e.time_s
                  and pa.start_time_gmt < a.start_time_gmt
                  and pa.summary->>'startLatitude' is not null)
  end                                                                                           as is_pb,
  case when not a.is_indoor then
    rank() over (partition by e.distance_km, a.is_indoor order by e.time_s)
  end                                                                                           as rank_all
from garmin.best_effort e
join garmin.activity a using (activity_id);
