WITH evening_depth AS (
  SELECT CAST(ts AS DATE) AS evening,
         round(avg(water_depth_cm), 2) AS avg_depth_cm,
         round(max(water_depth_cm), 1) AS max_depth_cm
  FROM segment_readings
  GROUP BY 1
),
tide_peak AS (
  SELECT CAST(ts AS DATE) AS evening,
         arg_max(hour(ts), tide_level_m) AS tide_high_hour,
         round(max(tide_level_m), 2) AS tide_high_m
  FROM tide_hourly
  GROUP BY 1
)
SELECT e.evening,
       e.avg_depth_cm,
       e.max_depth_cm,
       p.tide_high_hour,
       p.tide_high_m,
       (p.tide_high_hour BETWEEN 17 AND 19) AS tide_high_at_rush
FROM evening_depth e
JOIN tide_peak p USING (evening)
ORDER BY e.avg_depth_cm DESC
LIMIT 3;
