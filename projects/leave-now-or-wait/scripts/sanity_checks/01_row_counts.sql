SELECT 'districts' AS table_name, count(*) AS rows FROM districts
UNION ALL SELECT 'road_segments', count(*) FROM road_segments
UNION ALL SELECT 'weather_hourly', count(*) FROM weather_hourly
UNION ALL SELECT 'tide_hourly', count(*) FROM tide_hourly
UNION ALL SELECT 'segment_readings', count(*) FROM segment_readings
UNION ALL SELECT 'routes', count(*) FROM routes
UNION ALL SELECT 'route_steps', count(*) FROM route_steps
UNION ALL SELECT 'trips', count(*) FROM trips
UNION ALL SELECT 'interventions', count(*) FROM interventions
ORDER BY table_name;
