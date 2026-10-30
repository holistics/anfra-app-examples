-- ETA Risk Control Tower: schema `logistics`. Rebuilt by scripts/load_data.sh.
DROP SCHEMA IF EXISTS logistics CASCADE;
CREATE SCHEMA logistics;

CREATE FUNCTION logistics.stage_seq(stage text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['Booked', 'Origin pickup', 'Origin port', 'In transit', 'Destination port',
                              'Customs', 'Final-mile', 'Delivered'], stage)
$$;

CREATE TABLE logistics.meta (anchor_at timestamptz NOT NULL);
CREATE TABLE logistics.customers (
  id int PRIMARY KEY,
  name text NOT NULL,
  segment text NOT NULL CHECK (segment IN ('key', 'standard')),
  region text NOT NULL
);
CREATE TABLE logistics.ports (
  code text PRIMARY KEY, name text NOT NULL, country text NOT NULL, region text NOT NULL,
  lat numeric(8, 5) NOT NULL, lon numeric(8, 5) NOT NULL
);
-- Nominal hours per stage and mode, from the generator's NOMINAL: how far a shipment is through its current stage.
CREATE TABLE logistics.stage_nominal (
  mode text NOT NULL CHECK (mode IN ('ocean', 'air')),
  stage text NOT NULL CHECK (logistics.stage_seq(stage) IS NOT NULL),
  hours int NOT NULL CHECK (hours > 0),
  PRIMARY KEY (mode, stage)
);
CREATE TABLE logistics.shipments (
  id int PRIMARY KEY,
  order_ref text NOT NULL UNIQUE,
  customer_id int NOT NULL REFERENCES logistics.customers,
  mode text NOT NULL CHECK (mode IN ('ocean', 'air')),
  carrier text NOT NULL,
  origin_port text NOT NULL REFERENCES logistics.ports,
  dest_port text NOT NULL REFERENCES logistics.ports,
  goods_value_usd numeric(12, 2) NOT NULL,
  booked_at timestamptz NOT NULL,
  promised_at timestamptz NOT NULL,
  original_eta timestamptz NOT NULL,
  current_eta timestamptz NOT NULL,
  current_stage text NOT NULL CHECK (logistics.stage_seq(current_stage) IS NOT NULL),
  delivered_at timestamptz
);
CREATE TABLE logistics.stage_events (
  id int PRIMARY KEY,
  shipment_id int NOT NULL REFERENCES logistics.shipments,
  stage text NOT NULL CHECK (logistics.stage_seq(stage) IS NOT NULL),
  entered_at timestamptz NOT NULL,
  exited_at timestamptz
);
CREATE TABLE logistics.risk_events (
  id int PRIMARY KEY,
  shipment_id int NOT NULL REFERENCES logistics.shipments,
  raised_at timestamptz NOT NULL,
  stage text NOT NULL CHECK (logistics.stage_seq(stage) IS NOT NULL),
  risk_factor text NOT NULL,
  previous_eta timestamptz NOT NULL,
  new_eta timestamptz NOT NULL,
  slip_hours numeric(6, 1) NOT NULL CHECK (slip_hours >= 0)
);
CREATE INDEX ON logistics.stage_events (shipment_id);
CREATE INDEX ON logistics.risk_events (shipment_id);

-- The "always live" views: every timestamp moves by now() - anchor_at. Ages (weeks_ago) are measured from the anchor,
-- so they don't change as the clock moves.
CREATE VIEW logistics.v_shipments AS
SELECT s.id, s.order_ref, s.customer_id, s.mode, s.carrier, s.origin_port, s.dest_port, s.goods_value_usd,
  s.booked_at + x.shift AS booked_at,
  s.promised_at + x.shift AS promised_at,
  s.original_eta + x.shift AS original_eta,
  s.current_eta + x.shift AS current_eta,
  s.current_stage,
  logistics.stage_seq(s.current_stage) AS current_stage_seq,
  s.delivered_at + x.shift AS delivered_at,
  floor(extract(epoch FROM m.anchor_at - s.delivered_at) / 604800)::int AS delivered_weeks_ago,
  d.stage AS delay_stage,  -- the stage of the largest slip (latest on a tie): where the order's value at risk counts
  logistics.stage_seq(d.stage) AS delay_stage_seq,
  -- Scalar subqueries, not joins: Postgres skips them for queries that don't ask for these columns.
  (SELECT e.entered_at FROM logistics.stage_events e WHERE e.shipment_id = s.id AND e.stage = s.current_stage) + x.shift AS stage_entered_at,
  -- time in the current stage over its nominal hours, capped at 1; measured from the anchor, so it doesn't drift
  CASE WHEN s.delivered_at IS NULL THEN least(1, greatest(0,
    extract(epoch FROM m.anchor_at - (SELECT e.entered_at FROM logistics.stage_events e WHERE e.shipment_id = s.id AND e.stage = s.current_stage)) / 3600
    / (SELECT sn.hours FROM logistics.stage_nominal sn WHERE sn.mode = s.mode AND sn.stage = s.current_stage))) END AS stage_progress
FROM logistics.shipments s
CROSS JOIN logistics.meta m
CROSS JOIN LATERAL (SELECT now() - m.anchor_at AS shift) x
LEFT JOIN LATERAL (
  SELECT r.stage FROM logistics.risk_events r
  WHERE r.shipment_id = s.id AND r.slip_hours > 0
  ORDER BY r.slip_hours DESC, r.raised_at DESC
  LIMIT 1
) d ON true;

CREATE VIEW logistics.v_stage_events AS
SELECT e.id, e.shipment_id, e.stage, logistics.stage_seq(e.stage) AS stage_seq,
  e.entered_at + x.shift AS entered_at,
  e.exited_at + x.shift AS exited_at
FROM logistics.stage_events e
CROSS JOIN logistics.meta m
CROSS JOIN LATERAL (SELECT now() - m.anchor_at AS shift) x;

CREATE VIEW logistics.v_risk_events AS
SELECT r.id, r.shipment_id,
  r.raised_at + x.shift AS raised_at,
  floor(extract(epoch FROM m.anchor_at - r.raised_at) / 604800)::int AS weeks_ago,
  r.stage, logistics.stage_seq(r.stage) AS stage_seq, r.risk_factor,
  r.previous_eta + x.shift AS previous_eta,
  r.new_eta + x.shift AS new_eta,
  r.slip_hours,
  -- open: at the shipment's current stage, shipment active and on time, ETA not moved
  (r.stage = s.current_stage AND s.delivered_at IS NULL AND s.current_eta <= s.promised_at AND r.slip_hours = 0) AS is_open
FROM logistics.risk_events r
JOIN logistics.shipments s ON s.id = r.shipment_id
CROSS JOIN logistics.meta m
CROSS JOIN LATERAL (SELECT now() - m.anchor_at AS shift) x;

-- One view per port role, holding only the ports shipments use in that role, so a port filter offers no dead options.
CREATE VIEW logistics.v_origin_ports AS
SELECT p.* FROM logistics.ports p WHERE p.code IN (SELECT origin_port FROM logistics.shipments);

CREATE VIEW logistics.v_dest_ports AS
SELECT p.* FROM logistics.ports p WHERE p.code IN (SELECT dest_port FROM logistics.shipments);
