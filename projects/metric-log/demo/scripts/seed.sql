-- Synthetic shop, 2025-06-01 to 2026-10-19. The events in demo/scripts/history.json are built in on purpose,
-- so every seeded entry's number agrees with its headline. One row of `plan` per day.
CREATE OR REPLACE TEMP TABLE plan AS
SELECT
  day,
  CAST(greatest(1, round((5 + (day - DATE '2025-06-01') / 505.0)
    * (CASE WHEN dayofweek(day) IN (0, 6) THEN 1.2 ELSE 1 END) * mult
    + (CAST(hash(day) % 5 AS INTEGER) - 2) * 0.5)) AS BIGINT) AS n,
  price, refund_rate, basket
FROM (
  SELECT
    day,
    CASE WHEN day BETWEEN DATE '2025-11-27' AND DATE '2025-12-01' THEN 3.0   -- Black Friday 2025
         WHEN day BETWEEN DATE '2025-07-28' AND DATE '2025-08-10' THEN 2.2   -- summer sale 2025, 30% off
         WHEN day BETWEEN DATE '2026-07-27' AND DATE '2026-08-09' THEN 1.3   -- summer sale 2026, 15% off
         WHEN day BETWEEN DATE '2026-09-21' AND DATE '2026-09-27' THEN 0.6   -- payment outage
         WHEN day BETWEEN DATE '2026-09-28' AND DATE '2026-10-04' THEN 1.5   -- viral post
         ELSE 1.0 END AS mult,
    CASE WHEN day BETWEEN DATE '2025-11-27' AND DATE '2025-12-01' THEN 0.75
         WHEN day BETWEEN DATE '2025-07-28' AND DATE '2025-08-10' THEN 0.70
         WHEN day BETWEEN DATE '2026-07-27' AND DATE '2026-08-09' THEN 0.85
         ELSE 1.0 END AS price,
    CASE WHEN day BETWEEN DATE '2025-11-27' AND DATE '2025-12-01' THEN 25   -- Black Friday returns
         WHEN day BETWEEN DATE '2026-08-10' AND DATE '2026-08-23' THEN 25   -- courier delays
         WHEN day BETWEEN DATE '2026-10-05' AND DATE '2026-10-11' THEN 25   -- second return wave
         WHEN day > DATE '2026-10-11' THEN 6                                -- free returns ended
         ELSE 12 END AS refund_rate,
    CASE WHEN day BETWEEN DATE '2025-11-27' AND DATE '2025-12-01' THEN 0.7  -- small Black Friday baskets
         WHEN day >= DATE '2026-09-01' THEN 1.15                            -- bundles launched
         ELSE 1.0 END AS basket
  FROM (SELECT CAST(d AS DATE) AS day FROM range(DATE '2025-06-01', DATE '2026-10-20', INTERVAL 1 DAY) t(d))
);

-- list_amount is the price before any sale; costs follow it, so a deeper discount means a thinner margin.
CREATE OR REPLACE TABLE orders AS
SELECT
  i AS order_id,
  day AS order_date,
  CASE WHEN h % 100 < refund_rate THEN 'refunded' WHEN h % 100 < refund_rate + 6 THEN 'cancelled' ELSE 'completed' END AS status,
  round(list_amount * price, 2) AS amount,
  list_amount,
  CASE WHEN hash(i * 11) % 10 < 5 THEN 'web' WHEN hash(i * 11) % 10 < 8 THEN 'app' ELSE 'marketplace' END AS channel,
  CASE WHEN hash(i * 17) % 10 < 4 THEN 'apparel' WHEN hash(i * 17) % 10 < 7 THEN 'home' ELSE 'beauty' END AS category
FROM (
  SELECT i, day, price, refund_rate, hash(i) % 1000 AS h, round((20 + hash(i * 7 + 3) % 180) * basket, 2) AS list_amount
  FROM (SELECT p.*, row_number() OVER (ORDER BY day, k) AS i FROM (SELECT *, unnest(range(n)) AS k FROM plan) p)
);

CREATE OR REPLACE TABLE refunds AS
SELECT
  row_number() OVER (ORDER BY order_id) AS refund_id,
  order_id,
  order_date + CAST(3 + hash(order_id * 19) % 12 AS INTEGER) AS refund_date,
  amount
FROM orders WHERE status = 'refunded';

CREATE OR REPLACE TABLE costs AS
SELECT
  order_id AS cost_id,
  order_id,
  round(list_amount * (0.35 + (hash(order_id * 13) % 20) / 100.0), 2) AS product_cost,
  CAST(3 + (hash(order_id * 5) % 6) AS DOUBLE) AS shipping_cost
FROM orders WHERE status <> 'cancelled';
