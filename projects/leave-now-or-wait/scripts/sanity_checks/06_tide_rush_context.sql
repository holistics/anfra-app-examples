-- Does the daily high tide ever land in the evening rush window? (design check)
WITH daily AS (
  SELECT CAST(ts AS DATE) AS evening,
         arg_max(hour(ts), tide_level_m) AS tide_high_hour
  FROM tide_hourly
  GROUP BY 1
)
SELECT count(*) AS evenings,
       count(*) FILTER (WHERE tide_high_hour BETWEEN 17 AND 19) AS peak_at_rush,
       count(*) FILTER (WHERE tide_high_hour BETWEEN 15 AND 22) AS peak_in_evening
FROM daily;
