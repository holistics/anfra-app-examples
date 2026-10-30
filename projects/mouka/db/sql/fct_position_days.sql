-- fct_position_days: moved verbatim from models/facts/fct_position_days.model.aml (19 Oct 2026). db/materialize.py runs it
-- once into the table mat_position_days, which the model reads.
WITH latest AS (
  SELECT max(d) AS as_of FROM (
    SELECT txn_date AS d FROM transactions
    UNION ALL
    SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) FROM bank_movements
  ) x
),
trades AS (
  SELECT account_id, symbol, CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
         sum(CASE WHEN activity_type IN ('BUY', 'ADD_HOLDING') THEN quantity
                  WHEN activity_type = 'SELL' THEN -quantity ELSE 0 END)                AS dq,
         sum(CASE WHEN activity_type = 'BUY' THEN amount_minor + fee_minor
                  WHEN activity_type = 'ADD_HOLDING' THEN amount_minor ELSE 0 END)      AS cost_in,
         sum(CASE WHEN activity_type = 'SELL' THEN amount_minor - fee_minor ELSE 0 END) AS proceeds
  FROM activities
  WHERE symbol IS NOT NULL
  GROUP BY ALL
),
grid AS (
  SELECT p.account_id, p.symbol,
         CAST(unnest(generate_series(CAST(p.first_d AS TIMESTAMP), CAST(l.as_of AS TIMESTAMP),
                                     INTERVAL 1 DAY)) AS DATE) AS date_key
  FROM (SELECT account_id, symbol, min(d) AS first_d FROM trades GROUP BY ALL) p
  CROSS JOIN latest l
),
cum AS (
  SELECT g.account_id, g.symbol, g.date_key,
         sum(coalesce(t.dq, 0))       OVER w AS quantity,
         sum(coalesce(t.cost_in, 0))  OVER w AS cost_cum,
         sum(coalesce(t.proceeds, 0)) OVER w AS proceeds_cum
  FROM grid g
  LEFT JOIN trades t ON t.account_id = g.account_id AND t.symbol = g.symbol AND t.d = g.date_key
  WINDOW w AS (PARTITION BY g.account_id, g.symbol ORDER BY g.date_key)
),
priced AS (
  SELECT c.*, q.close AS price
  FROM cum c
  ASOF LEFT JOIN quotes q ON q.symbol = c.symbol AND c.date_key >= q.quote_date
)
SELECT
  account_id || ':' || symbol || ':' || strftime(date_key, '%Y-%m-%d')                 AS position_day_key,
  account_id, symbol, date_key, quantity, price,
  quantity * price                                                                      AS market_value_vnd,
  CASE WHEN quantity > 0 THEN cost_cum ELSE 0 END                                       AS book_cost_vnd,
  cost_cum                                                                              AS cost_basis_vnd,
  CASE WHEN quantity > 0 THEN quantity * price - cost_cum ELSE 0 END                    AS unrealized_pnl_vnd,
  CASE WHEN quantity = 0 AND proceeds_cum > 0 THEN proceeds_cum - cost_cum ELSE 0 END   AS realized_pnl_vnd,
  coalesce(lag(quantity) OVER w2, 0) * (price - coalesce(lag(price) OVER w2, price))     AS price_gain_vnd,
  price / nullif(lag(price) OVER w2, 0) - 1                                             AS day_change_pct,
  quantity > 0                                                                          AS is_open,
  date_key = (SELECT as_of FROM latest)                                                 AS is_as_of
FROM priced
WINDOW w2 AS (PARTITION BY account_id, symbol ORDER BY date_key)
