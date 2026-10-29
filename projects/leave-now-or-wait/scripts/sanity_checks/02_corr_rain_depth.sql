SELECT round(corr(w.rainfall_mm, r.water_depth_cm), 3) AS corr_rainfall_vs_depth,
       count(*) AS n_rows
FROM segment_readings r
JOIN road_segments s ON s.id = r.segment_id
JOIN weather_hourly w ON w.district_id = s.district_id AND w.ts = r.ts;
