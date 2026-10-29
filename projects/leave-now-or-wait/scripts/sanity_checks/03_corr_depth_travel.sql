WITH route_depth AS (
  SELECT t.id, t.travel_minutes, avg(r.water_depth_cm) AS avg_depth_on_route
  FROM trips t
  JOIN route_steps rs ON rs.route_id = t.route_id
  JOIN segment_readings r ON r.segment_id = rs.segment_id AND r.ts = t.depart_ts
  GROUP BY t.id, t.travel_minutes
)
SELECT round(corr(avg_depth_on_route, travel_minutes), 3) AS corr_depth_vs_travel,
       count(*) AS n_trips
FROM route_depth;
