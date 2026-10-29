SELECT d.name AS district,
       round(avg(r.water_depth_cm), 2) AS avg_depth_cm,
       round(quantile_cont(r.water_depth_cm, 0.95), 1) AS p95_depth_cm
FROM segment_readings r
JOIN road_segments s ON s.id = r.segment_id
JOIN districts d ON d.id = s.district_id
GROUP BY d.name
ORDER BY avg_depth_cm DESC
LIMIT 3;
