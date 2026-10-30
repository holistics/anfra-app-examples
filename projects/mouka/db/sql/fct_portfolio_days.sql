-- fct_portfolio_days: moved verbatim from models/facts/fct_portfolio_days.model.aml (19 Oct 2026). db/materialize.py runs it
-- once into the table mat_portfolio_days, which the model reads.
WITH d AS (
  SELECT f.date_key, sum(f.value_vnd) AS value_vnd, sum(f.net_flow_vnd) AS net_flow_vnd
  FROM (SELECT * FROM mat_account_days) f
  JOIN accounts a ON a.id = f.account_id
  WHERE a.account_type = 'SECURITIES'
  GROUP BY 1
),
r AS (
  SELECT d.*, lag(value_vnd) OVER (ORDER BY date_key) AS prev_value FROM d
),
bq AS (SELECT quote_date, close FROM quotes WHERE symbol = 'VNINDEX'),
b AS (
  SELECT r.*, bq.close AS bench_close
  FROM r
  ASOF LEFT JOIN bq ON r.date_key >= bq.quote_date
)
SELECT
  date_key, value_vnd,
  coalesce(prev_value, value_vnd - net_flow_vnd)                                     AS prev_value_vnd,
  net_flow_vnd,
  CASE WHEN prev_value > 0 THEN (value_vnd - net_flow_vnd) / prev_value - 1 ELSE 0 END AS daily_return,
  CASE WHEN prev_value > 0 THEN ln((value_vnd - net_flow_vnd) / prev_value) ELSE 0 END AS log_return,
  isodow(date_key) < 6                                                               AS is_trading_day,
  bench_close,
  coalesce(ln(bench_close / lag(bench_close) OVER (ORDER BY date_key)), 0)           AS bench_log_return
FROM b
