-- Heart-rate zones of each activity as Garmin counted them: one row per zone, with its bpm range
-- (the zones in force when the activity was recorded) and the time spent in it. Recreated on every
-- migrate (views.sql drops garmin.activity with cascade).
drop view if exists garmin.activity_hr_zone;
create view garmin.activity_hr_zone as
select
  d.activity_id * 10 + (z->>'zoneNumber')::int                                       as zone_id,
  d.activity_id,
  (z->>'zoneNumber')::int                                                            as zone,
  (z->>'zoneLowBoundary')::int                                                       as low_bpm,
  lead((z->>'zoneLowBoundary')::int) over (partition by d.activity_id
                                          order by (z->>'zoneNumber')::int) - 1     as high_bpm,
  coalesce((z->>'secsInZone')::float, 0)                                             as secs
from raw.activity_doc d, jsonb_array_elements(d.payload) z
where d.kind = 'hr_zones' and jsonb_typeof(d.payload) = 'array';
