-- fct_cash_ahead: moved verbatim from models/facts/fct_cash_ahead.model.aml (19 Oct 2026). db/materialize.py runs it once
-- into the table mat_cash_ahead, which the model reads; fct_ledger, fct_recurring and fct_card_statements are its query models, as
-- temporary views built from their AML.
WITH l AS (SELECT * FROM fct_ledger),
rec AS (SELECT * FROM fct_recurring),
cs AS (SELECT * FROM fct_card_statements),
as_of_d AS (SELECT max(line_date) AS d FROM l),
pay AS (
  SELECT r.next_due AS event_date, 'income' AS kind, 'Payday' AS label, r.merchant_display AS detail,
         r.expected_vnd AS amount_vnd, r.src
  FROM rec r
  WHERE r.kind = 'income'
),
rep_l AS (
  SELECT l.*, CASE WHEN l.flow_type = 'family_support' THEN 'family' ELSE 'card' END AS kind,
         CASE WHEN l.flow_type = 'family_support' THEN l.merchant_display
              WHEN l.pipeline_flow = 'othercard' THEN 'MAX VIB' ELSE 'TCB Visa' END AS series
  FROM l CROSS JOIN as_of_d a
  WHERE l.line_date > a.d - INTERVAL 3 MONTH AND l.line_date <= a.d
    AND l.src IN ('tcb_debit', 'timo')
    AND (l.flow_type = 'family_support' OR l.pipeline_flow IN ('othercard', 'settlement'))
),
rep AS (
  SELECT kind, series, max_by(src, line_date) AS src, max(line_date) AS last_date, max_by(amount_vnd, line_date) AS last_vnd
  FROM rep_l
  GROUP BY kind, series
  HAVING count(*) >= 2
),
rep_next AS (
  SELECT r.*,
         (SELECT min(c) FROM (
            SELECT least(CAST(m + to_days(day(r.last_date) - 1) AS DATE), last_day(m)) AS c   -- a 31st into a 30-day month clamps (make_date would throw)
            FROM (SELECT CAST(date_trunc('month', a.d) + to_months(k) AS DATE) AS m FROM range(0, 3) t(k)) mm
          ) cc WHERE c > a.d) AS next_due
  FROM rep r CROSS JOIN as_of_d a
),
card_rate AS (
  -- each card's spending a day over its last 90 days of card lines (card lines can stop before the as-of date:
  -- data_complete_through), so a month of it is what the next payment is likely to be
  SELECT c.src, sum(c.spend_vnd) / 90.0 AS per_day
  FROM l c
  WHERE c.line_kind = 'card' AND c.line_date > (SELECT max(x.line_date) FROM l x WHERE x.src = c.src AND x.line_kind = 'card') - INTERVAL 90 DAY
  GROUP BY c.src
),
stmt AS (
  SELECT s.payment_due_date AS event_date,
         s.outstanding_balance_vnd - coalesce((
           -- the bank side of each payment (pipeline_flow settlement): card lines stop at data_complete_through, bank lines don't
           SELECT sum(p.amount_vnd) FROM l p
           WHERE p.src IN ('tcb_debit', 'timo') AND p.pipeline_flow = 'settlement' AND p.line_date > s.period_end AND p.line_date <= a.d), 0) AS left_vnd
  FROM cs s CROSS JOIN as_of_d a
  WHERE s.src = 'credit' AND s.payment_due_date > a.d AND s.outstanding_balance_vnd IS NOT NULL
),
ev AS (
  SELECT event_date, kind, label, detail, amount_vnd, src FROM pay
  UNION ALL
  SELECT next_due, 'family', series, 'Sent after payday', -last_vnd, src FROM rep_next WHERE kind = 'family'
  UNION ALL
  SELECT r.next_due, 'card', r.series, 'About a month of card spending', -round(cr.per_day * 30.4375), r.src
  FROM rep_next r JOIN card_rate cr ON cr.src = CASE r.series WHEN 'MAX VIB' THEN 'vib_credit' ELSE 'credit' END
  WHERE r.kind = 'card' AND cr.per_day > 0
    AND NOT (r.series = 'TCB Visa' AND EXISTS (SELECT 1 FROM stmt WHERE left_vnd > 0))   -- a known statement replaces the estimate
  UNION ALL
  SELECT event_date, 'card', 'TCB Visa', 'Statement due', -left_vnd, 'tcb_debit' FROM stmt WHERE left_vnd > 0
)
SELECT ev.kind || ' · ' || ev.label || ' · ' || CAST(ev.event_date AS VARCHAR) AS event_key, ev.*,
       a.d AS as_of_date, datediff('day', a.d, ev.event_date) AS days_ahead
FROM ev CROSS JOIN as_of_d a
WHERE ev.event_date > a.d AND datediff('day', a.d, ev.event_date) <= 30
