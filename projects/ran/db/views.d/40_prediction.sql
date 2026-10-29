-- Ran's own race predictions per day, from the same causal model as the planner's forecast
-- (garmin.race_forecast), for a race run today in the conditions the runner trains in:
--   time = Daniels(effective VO2max x shape factor(marathon shape, distance), distance)
--          x calibration to the runner's races (garmin-sync fit: calibration_daniels_shape_heat)
-- No heat term (race WBGT = training WBGT), no taper. The band is the method's mean absolute error
-- on the runner's marked races, each predicted from earlier races only.
drop view if exists garmin.race_prediction_own cascade;

create view garmin.race_prediction_own as
with k as (
  select max(value) filter (where name = 'calibration_daniels_shape_heat')     as cal,
         max(n)     filter (where name = 'calibration_daniels_shape_heat')     as cal_n,
         max(value) filter (where name = 'mape_daniels_shape_heat_calibrated') as band
  from garmin.model_param
)
select
  d.calendar_date,
  d.vo2_effective,
  d.marathon_shape,
  coalesce(k.cal, 1.0)                                                                              as calibration,
  k.cal_n                                                                                           as calibration_races,
  k.band                                                                                            as band_pct,
  garmin.daniels_time_s(d.vo2_effective * garmin.shape_factor(d.marathon_shape, 5), 5) * coalesce(k.cal, 1.0)                as time_5k_s,
  garmin.daniels_time_s(d.vo2_effective * garmin.shape_factor(d.marathon_shape, 10), 10) * coalesce(k.cal, 1.0)              as time_10k_s,
  garmin.daniels_time_s(d.vo2_effective * garmin.shape_factor(d.marathon_shape, 21.0975), 21.0975) * coalesce(k.cal, 1.0)    as time_half_s,
  garmin.daniels_time_s(d.vo2_effective * garmin.shape_factor(d.marathon_shape, 42.195), 42.195) * coalesce(k.cal, 1.0)      as time_marathon_s
from garmin.day d cross join k
where d.vo2_effective is not null;
