-- Sample e-commerce data for the anfra demo. Re-runnable: drops and recreates.
DROP TABLE IF EXISTS sessions, order_items, orders, products, customers, countries;

CREATE TABLE customers (
  id         int PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL,
  country    text NOT NULL,
  created_at date NOT NULL
);

CREATE TABLE products (
  id       int PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(10,2) NOT NULL
);

CREATE TABLE orders (
  id          int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id),
  status      text NOT NULL,
  ordered_at  date NOT NULL
);

CREATE TABLE order_items (
  id         int PRIMARY KEY,
  order_id   int NOT NULL REFERENCES orders(id),
  product_id int NOT NULL REFERENCES products(id),
  quantity   int NOT NULL
);

INSERT INTO products (id, name, category, price) VALUES
  (1, 'Widget',        'Hardware',    19.99),
  (2, 'Gadget',        'Hardware',    49.50),
  (3, 'Gizmo',         'Hardware',    99.00),
  (4, 'Sprocket',      'Parts',        4.25),
  (5, 'Flange',        'Parts',        7.80),
  (6, 'Analytics Pro', 'Software',   299.00),
  (7, 'Dashboard Kit', 'Software',   149.00),
  (8, 'Support Plan',  'Services',   500.00);

-- Deterministic "random" data so reseeding gives the same numbers.
-- Wrapped in DO (not a bare SELECT) so web SQL runners that stop at the first result set keep going.
DO $$ BEGIN PERFORM setseed(0.42); END $$;

INSERT INTO customers (id, name, email, country, created_at)
SELECT i,
       'Customer ' || i,
       'customer' || i || '@example.com',
       (ARRAY['Vietnam','Singapore','United States','Germany','Japan','Australia'])[1 + floor(random() * 6)::int],
       DATE '2025-01-01' + floor(random() * 365)::int
FROM generate_series(1, 200) AS i;

INSERT INTO orders (id, customer_id, status, ordered_at)
SELECT i,
       1 + floor(random() * 200)::int,
       (ARRAY['completed','completed','completed','shipped','cancelled'])[1 + floor(random() * 5)::int],
       DATE '2025-06-01' + floor(random() * 480)::int
FROM generate_series(1, 1500) AS i;

INSERT INTO order_items (id, order_id, product_id, quantity)
SELECT row_number() OVER (),
       o.id,
       1 + floor(random() * 8)::int,
       1 + floor(random() * 5)::int
FROM orders o
CROSS JOIN LATERAL generate_series(1, 1 + floor(random() * 3)::int + (o.id * 0)) AS n;

-- ===== Gallery additions: countries, order times and sessions =====
-- Everything below is deterministic (hashint8, no random()), so the rows above keep their values.
-- h(i, salt): a stable pseudo-random number in [0, 1).
CREATE FUNCTION pg_temp.h(i bigint, salt int) RETURNS numeric
  LANGUAGE sql IMMUTABLE AS $f$ SELECT abs(hashint8(i * 1000 + salt))::numeric / 2147483648 $f$;

-- One row per country: ISO code, region, UTC offset, map position and a monthly revenue target.
CREATE TABLE countries (
  name           text PRIMARY KEY,
  code           char(2) NOT NULL,
  region         text NOT NULL,
  utc_offset     int NOT NULL,
  latitude       numeric(7,4) NOT NULL,
  longitude      numeric(7,4) NOT NULL,
  monthly_target numeric(10,2) NOT NULL
);
INSERT INTO countries (name, code, region, utc_offset, latitude, longitude, monthly_target) VALUES
  ('Australia',     'AU', 'APAC',     10, -25.2744, 133.7751, 20000),
  ('Germany',       'DE', 'Europe',    1,  51.1657,  10.4515, 13000),
  ('Japan',         'JP', 'APAC',      9,  36.2048, 138.2529,  8000),
  ('Singapore',     'SG', 'APAC',      8,   1.3521, 103.8198, 17000),
  ('United States', 'US', 'Americas', -5,  39.8283, -98.5795, 14000),
  ('Vietnam',       'VN', 'APAC',      7,  14.0583, 108.2772, 12000);

ALTER TABLE customers ADD COLUMN country_code char(2);
UPDATE customers cu SET country_code = c.code FROM countries c WHERE c.name = cu.country;
ALTER TABLE customers ALTER COLUMN country_code SET NOT NULL;

-- ordered_ts: the order's instant in UTC. ordered_at stays the customer's local date; the local
-- time is between 08:00 and 22:59, so in UTC some orders fall on the day before or after.
ALTER TABLE orders ADD COLUMN ordered_ts timestamp;
UPDATE orders o
SET ordered_ts = o.ordered_at
  + make_interval(hours => 8 + floor(pg_temp.h(o.id, 1) * 15)::int, mins => floor(pg_temp.h(o.id, 2) * 60)::int)
  - make_interval(hours => c.utc_offset)
FROM customers cu JOIN countries c ON c.name = cu.country
WHERE cu.id = o.customer_id;
ALTER TABLE orders ALTER COLUMN ordered_ts SET NOT NULL;

-- sessions: website visits. reached_step is the furthest step: 1 visit, 2 viewed a product,
-- 3 added to cart, 4 started checkout, 5 ordered. Every order has one session that reached step 5.
CREATE TABLE sessions (
  id           int PRIMARY KEY,
  started_at   timestamp NOT NULL,
  country      text NOT NULL REFERENCES countries(name),
  channel      text NOT NULL,
  reached_step int NOT NULL,
  order_id     int REFERENCES orders(id)
);
INSERT INTO sessions (id, started_at, country, channel, reached_step, order_id)
SELECT o.id,
       o.ordered_ts - make_interval(mins => 5 + floor(pg_temp.h(o.id, 3) * 35)::int),
       cu.country,
       (ARRAY['Organic','Paid search','Email','Social'])[1 + floor(pg_temp.h(o.id, 4) * 4)::int],
       5,
       o.id
FROM orders o JOIN customers cu ON cu.id = o.customer_id;
INSERT INTO sessions (id, started_at, country, channel, reached_step, order_id)
SELECT 1500 + i,
       TIMESTAMP '2025-06-01' + make_interval(secs => floor(pg_temp.h(i, 5) * 480 * 86400)::int),
       (ARRAY['Australia','Germany','Japan','Singapore','United States','Vietnam'])[1 + floor(pg_temp.h(i, 6) * 6)::int],
       (ARRAY['Organic','Organic','Paid search','Paid search','Email','Social'])[1 + floor(pg_temp.h(i, 7) * 6)::int],
       CASE WHEN pg_temp.h(i, 8) < 0.55 THEN 1 WHEN pg_temp.h(i, 8) < 0.80 THEN 2 WHEN pg_temp.h(i, 8) < 0.92 THEN 3 ELSE 4 END,
       NULL
FROM generate_series(1, 12000) AS i;

ALTER TABLE customers ADD CONSTRAINT customers_country_fkey FOREIGN KEY (country) REFERENCES countries(name);

-- ===== Gallery additions, round 2: a product hierarchy and order discounts =====
-- products: category › subcategory › product, plus a brand, for deeper drill-downs.
ALTER TABLE products ADD COLUMN subcategory text, ADD COLUMN brand text;
UPDATE products SET subcategory = v.subcategory, brand = v.brand
FROM (VALUES
  (1, 'Components',  'Acme'),
  (2, 'Devices',     'Acme'),
  (3, 'Devices',     'Globex'),
  (4, 'Fasteners',   'Initech'),
  (5, 'Fittings',    'Initech'),
  (6, 'Analytics',   'Globex'),
  (7, 'Dashboards',  'Initech'),
  (8, 'Support',     'Acme')
) AS v(id, subcategory, brand)
WHERE products.id = v.id;
ALTER TABLE products ALTER COLUMN subcategory SET NOT NULL, ALTER COLUMN brand SET NOT NULL;

-- orders.discount_pct: the discount on the whole order. 70% of orders have none, 20% get 5%, 10% get 10%.
-- Revenue stays gross (quantity × list price); net revenue applies the discount.
ALTER TABLE orders ADD COLUMN discount_pct numeric(4,1);
UPDATE orders SET discount_pct = CASE WHEN pg_temp.h(id, 9) < 0.70 THEN 0 WHEN pg_temp.h(id, 9) < 0.90 THEN 5 ELSE 10 END;
ALTER TABLE orders ALTER COLUMN discount_pct SET NOT NULL;
