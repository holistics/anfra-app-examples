-- fct_account_days: moved verbatim from models/facts/fct_account_days.model.aml (19 Oct 2026). db/materialize.py runs it
-- once into the table mat_account_days, which the model reads.
WITH latest AS (
  SELECT max(d) AS as_of FROM (
    SELECT txn_date AS d FROM transactions
    UNION ALL
    SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) FROM bank_movements
  ) x
),
days AS (
  SELECT CAST(unnest(generate_series(
           CAST((SELECT min(CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE))
                 FROM activities WHERE is_opening) AS TIMESTAMP),
           CAST((SELECT as_of FROM latest) AS TIMESTAMP), INTERVAL 1 DAY)) AS DATE) AS date_key
),
act AS (
  SELECT account_id, CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
         sum(CASE activity_type WHEN 'DEPOSIT' THEN amount_minor WHEN 'WITHDRAWAL' THEN -amount_minor
                  WHEN 'BUY' THEN -(amount_minor + fee_minor) WHEN 'SELL' THEN amount_minor - fee_minor
                  WHEN 'DIVIDEND' THEN amount_minor WHEN 'INTEREST' THEN amount_minor ELSE 0 END)   AS cash_delta,
         sum(CASE WHEN is_opening THEN 0 WHEN activity_type = 'DEPOSIT' THEN amount_minor
                  WHEN activity_type = 'WITHDRAWAL' THEN -amount_minor ELSE 0 END)                  AS flow,
         sum(CASE WHEN activity_type IN ('DIVIDEND', 'INTEREST') THEN amount_minor ELSE 0 END)     AS income
  FROM activities
  GROUP BY ALL
),
inv AS (
  SELECT a.id AS account_id, a.currency, d.date_key,
         sum(coalesce(x.cash_delta, 0)) OVER (PARTITION BY a.id ORDER BY d.date_key) AS cash_native,
         coalesce(x.flow, 0) AS flow_native, coalesce(x.income, 0) AS income_native
  FROM accounts a
  CROSS JOIN days d
  LEFT JOIN act x ON x.account_id = a.id AND x.d = d.date_key
  WHERE a.src IS NULL
),
fx AS (SELECT rate_date, vnd_per_unit FROM fx_rates WHERE currency = 'USD'),
inv_vnd AS (
  SELECT i.account_id, i.date_key,
         CASE WHEN i.currency = 'USD' THEN i.cash_native / 100.0 * f.vnd_per_unit ELSE i.cash_native END     AS cash_vnd,
         CASE WHEN i.currency = 'USD' THEN i.flow_native / 100.0 * f.vnd_per_unit ELSE i.flow_native END     AS flow_vnd,
         CASE WHEN i.currency = 'USD' THEN i.income_native / 100.0 * f.vnd_per_unit ELSE i.income_native END AS income_vnd
  FROM inv i
  ASOF LEFT JOIN fx f ON i.date_key >= f.rate_date
),
pos AS (
  SELECT account_id, date_key, sum(market_value_vnd) AS holdings_vnd, sum(book_cost_vnd) AS book_cost_vnd,
         sum(price_gain_vnd) AS price_gain_vnd, count(*) FILTER (WHERE quantity > 0) AS open_positions
  FROM mat_position_days
  GROUP BY ALL
),
bank_day AS (
  SELECT CASE source WHEN 'tcb_sms' THEN 'tcb_debit' ELSE 'timo' END AS src,
         CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
         arg_max(running_balance_minor, epoch_ms(occurred_at) * 100000 + id) AS bal
  FROM bank_movements
  GROUP BY ALL
),
bank_open AS (
  SELECT CASE source WHEN 'tcb_sms' THEN 'tcb_debit' ELSE 'timo' END AS src,
         arg_min(running_balance_minor - CASE direction WHEN 'C' THEN amount_minor ELSE -amount_minor END,
                 epoch_ms(occurred_at) * 100000 + id) AS opening
  FROM bank_movements
  GROUP BY ALL
),
bank AS (
  SELECT a.id AS account_id, d.date_key,
         coalesce(last_value(b.bal IGNORE NULLS) OVER (PARTITION BY a.id ORDER BY d.date_key), o.opening) AS cash_vnd
  FROM accounts a
  CROSS JOIN days d
  LEFT JOIN bank_day b ON b.src = a.src AND b.d = d.date_key
  LEFT JOIN bank_open o ON o.src = a.src
  WHERE a.account_type = 'CASH' AND a.src IS NOT NULL
),
card_rows AS (
  SELECT CASE bank WHEN 'TCB' THEN 'credit' ELSE 'vib_credit' END AS src, txn_date AS d, amount_minor AS delta
  FROM card_transactions_tagged
  WHERE NOT (bank = 'TCB' AND description ILIKE 'THANH TOAN NO THE%')
  UNION ALL
  SELECT 'credit', CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), -amount_minor
  FROM account_movements_resolved
  WHERE flow = 'settlement' AND direction = 'D'
  UNION ALL
  SELECT 'vib_credit', CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), -amount_minor
  FROM account_movements_resolved
  WHERE flow = 'othercard' AND direction = 'D'
),
cards AS (
  SELECT a.id AS account_id, d.date_key,
         -sum(coalesce(c.delta, 0)) OVER (PARTITION BY a.id ORDER BY d.date_key) AS value_vnd
  FROM accounts a
  CROSS JOIN days d
  LEFT JOIN (SELECT src, d, sum(delta) AS delta FROM card_rows GROUP BY ALL) c
         ON c.src = a.src AND c.d = d.date_key
  WHERE a.account_type = 'CREDIT_CARD'
),
u AS (
  SELECT i.account_id, i.date_key, i.cash_vnd + coalesce(p.holdings_vnd, 0) AS value_vnd, i.cash_vnd,
         coalesce(p.holdings_vnd, 0) AS holdings_vnd, coalesce(p.book_cost_vnd, 0) AS book_cost_vnd,
         i.flow_vnd AS net_flow_vnd, i.income_vnd, coalesce(p.price_gain_vnd, 0) AS price_gain_vnd,
         coalesce(p.open_positions, 0) AS open_positions
  FROM inv_vnd i
  LEFT JOIN pos p ON p.account_id = i.account_id AND p.date_key = i.date_key
  UNION ALL
  SELECT account_id, date_key, cash_vnd, cash_vnd, 0, 0, 0, 0, 0, 0 FROM bank
  UNION ALL
  SELECT account_id, date_key, value_vnd, 0, 0, 0, 0, 0, 0, 0 FROM cards
)
SELECT account_id || ':' || strftime(date_key, '%Y-%m-%d') AS account_day_key, account_id, date_key,
       value_vnd, cash_vnd, holdings_vnd, book_cost_vnd, net_flow_vnd, income_vnd, price_gain_vnd,
       open_positions, date_key = (SELECT as_of FROM latest) AS is_as_of
FROM u
