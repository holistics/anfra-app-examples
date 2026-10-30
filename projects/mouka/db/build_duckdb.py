"""Build db/finance.duckdb from generate.py, assert the invariants, swap it in.

    db/.venv/bin/python -I db/build_duckdb.py [--end YYYY-MM-DD]

Writes finance.duckdb.tmp, checks it, then os.replace()s it over finance.duckdb.
Stop `anfra serve` first: it holds an exclusive lock on the file.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import persona as P  # noqa: E402
from generate import generate  # noqa: E402
from materialize import materialize  # noqa: E402

DB = HERE / "finance.duckdb"
TABLES = ("statements", "transactions", "fx_rates", "bank_movements", "annotations", "budgets",
          "cashback_milestones", "assets", "quotes", "accounts", "activities")

# Each query returns the number of violations; all must be 0.
INVARIANTS = {
    "card annotation joins a transaction": """
        SELECT count(*) FROM annotations a WHERE target_kind = 'card' AND NOT EXISTS (
          SELECT 1 FROM transactions t WHERE t.statement_id = a.statement_id AND t.row_hash = a.row_hash)""",
    "account annotation joins a movement": """
        SELECT count(*) FROM annotations a WHERE target_kind = 'account' AND NOT EXISTS (
          SELECT 1 FROM bank_movements m WHERE m.source = a.source AND m.external_id = a.external_id)""",
    "one annotation per card row (ux_annotations_card)": """
        SELECT count(*) - count(DISTINCT (statement_id, row_hash)) FROM annotations WHERE target_kind = 'card'""",
    "one annotation per account row (ux_annotations_account)": """
        SELECT count(*) - count(DISTINCT (source, external_id)) FROM annotations WHERE target_kind = 'account'""",
    "transactions.statement_id exists": """
        SELECT count(*) FROM transactions t WHERE NOT EXISTS (SELECT 1 FROM statements s WHERE s.id = t.statement_id)""",
    "row_hash unique where source IS NOT NULL (ux_transactions_email_row_hash)": """
        SELECT count(*) - count(DISTINCT row_hash) FROM transactions WHERE source IS NOT NULL""",
    "one synthetic VIB statement per month": """
        SELECT count(*) FROM (SELECT card_last4, period_start FROM statements WHERE synthetic
                              GROUP BY 1, 2 HAVING count(*) > 1)""",
    "every row inside its statement period": """
        SELECT count(*) FROM transactions t JOIN statements s ON s.id = t.statement_id
        WHERE t.txn_date NOT BETWEEN s.period_start AND s.period_end""",
    "TCB outstanding chains: prev + this statement's rows": """
        WITH s AS (SELECT id, outstanding_balance_minor o,
                          lag(outstanding_balance_minor) OVER (ORDER BY period_end) p
                   FROM statements WHERE bank = 'TCB'),
             r AS (SELECT statement_id, sum(amount_minor) n FROM transactions GROUP BY 1)
        SELECT count(*) FROM s LEFT JOIN r ON r.statement_id = s.id WHERE s.o <> coalesce(s.p, 0) + coalesce(r.n, 0)""",
    "running balance chains per account": """
        WITH o AS (SELECT running_balance_minor b,
                          CASE direction WHEN 'C' THEN amount_minor ELSE -amount_minor END d,
                          lag(running_balance_minor) OVER (PARTITION BY source ORDER BY occurred_at, id) p
                   FROM bank_movements)
        SELECT count(*) FROM o WHERE p IS NOT NULL AND b <> p + d""",
    "no negative account balance": "SELECT count(*) FROM bank_movements WHERE running_balance_minor < 0",
    "'Đã hoàn' rows leave card_transactions_tagged": """
        SELECT abs((SELECT count(*) FROM transactions) - (SELECT count(*) FROM card_transactions_tagged)
                   - (SELECT count(*) FROM annotations WHERE target_kind = 'card' AND category = 'Đã hoàn'))""",
    "'Đã hoàn' rows leave unified_movements": """
        SELECT abs((SELECT count(*) FROM transactions)
                   - (SELECT count(*) FROM unified_movements WHERE kind = 'card')
                   - (SELECT count(*) FROM annotations WHERE target_kind = 'card' AND category = 'Đã hoàn'))""",
    "exactly one overflow-buffer category budget": """
        SELECT abs(count(*) FILTER (WHERE overflow_buffer AND scope_type = 'category') - 1) FROM budgets""",
    "a rate ladder has exactly one active rung per src": """
        SELECT count(*) FROM (SELECT src FROM cashback_milestones WHERE active GROUP BY src
                              HAVING bool_or(accrual = 'rate') AND count(*) <> 1)""",
    "persona top-ups classify as flow 'timo'": """
        SELECT count(*) FROM account_movements_resolved
        WHERE source = 'tcb_sms' AND description ILIKE '%chuyen tien sang Timo%' AND flow <> 'timo'""",
    "persona mom transfers classify as flow 'mom'": """
        SELECT count(*) FROM account_movements_resolved
        WHERE source = 'tcb_sms' AND description ILIKE '%gui me%' AND flow <> 'mom'""",
    "card settlements are not spend": """
        SELECT count(*) FROM account_movements_resolved
        WHERE description ILIKE '%thanh toan no the tin dung%' AND is_spend""",
    "Timo times are minute precision": """
        SELECT count(*) FROM bank_movements WHERE source = 'timo_email' AND second(occurred_at) <> 0""",
    "no chi chung left (the persona lives alone)": """
        SELECT count(*) FROM bank_movements
        WHERE description ILIKE '%chi chung%' OR description ILIKE 'Shared Pot%'""",
    "every asset has a close on every business day": """
        WITH days AS (SELECT CAST(unnest(generate_series(
                         CAST((SELECT min(quote_date) FROM quotes) AS TIMESTAMP),
                         CAST((SELECT max(quote_date) FROM quotes) AS TIMESTAMP), INTERVAL 1 DAY)) AS DATE) AS d)
        SELECT count(*) FROM assets s CROSS JOIN days
        WHERE isodow(d) < 6 AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.symbol = s.symbol AND q.quote_date = d)""",
    "prices are positive and quotes skip weekends": """
        SELECT count(*) FROM quotes WHERE close <= 0 OR isodow(quote_date) > 5""",
    "a funded deposit equals its bank movement": """
        SELECT count(*) FROM activities a JOIN bank_movements m ON m.id = a.source_movement_id
        WHERE a.activity_type = 'DEPOSIT' AND a.amount_minor <> m.amount_minor""",
    "every investment or savings transfer funds exactly one deposit": """
        SELECT count(*) FROM account_movements_resolved r
        WHERE r.direction = 'D' AND r.flow IN ('investment', 'savings')
          AND (SELECT count(*) FROM activities a
               WHERE a.source_movement_id = r.id AND a.activity_type = 'DEPOSIT') <> 1""",
    "a maturity withdraws principal plus interest": """
        SELECT count(*) FROM bank_movements m
        WHERE m.description ILIKE '%TAT TOAN TIET KIEM%'
          AND m.amount_minor <> coalesce((SELECT sum(amount_minor) FROM activities a
                                          WHERE a.source_movement_id = m.id AND a.activity_type = 'WITHDRAWAL'), -1)""",
    "investment cash never goes negative": """
        WITH d AS (SELECT account_id, activity_date, id,
                     CASE activity_type WHEN 'DEPOSIT' THEN amount_minor WHEN 'WITHDRAWAL' THEN -amount_minor
                          WHEN 'BUY' THEN -(amount_minor + fee_minor) WHEN 'SELL' THEN amount_minor - fee_minor
                          WHEN 'DIVIDEND' THEN amount_minor WHEN 'INTEREST' THEN amount_minor ELSE 0 END AS delta
                   FROM activities)
        SELECT count(*) FROM (SELECT sum(delta) OVER (PARTITION BY account_id ORDER BY activity_date, id) AS bal
                              FROM d) WHERE bal < 0""",
    "no position goes negative and a SELL closes it": """
        WITH d AS (SELECT account_id, symbol, activity_date, id, activity_type,
                     CASE WHEN activity_type IN ('BUY', 'ADD_HOLDING') THEN quantity
                          WHEN activity_type = 'SELL' THEN -quantity ELSE 0 END AS dq
                   FROM activities WHERE symbol IS NOT NULL),
             r AS (SELECT *, sum(dq) OVER (PARTITION BY account_id, symbol ORDER BY activity_date, id) AS qty FROM d)
        SELECT count(*) FROM r WHERE qty < 0 OR (activity_type = 'SELL' AND qty <> 0)""",
    "a sold symbol is never bought again": """
        SELECT count(*) FROM activities b JOIN activities s ON s.symbol = b.symbol AND s.account_id = b.account_id
        WHERE s.activity_type = 'SELL' AND b.activity_type = 'BUY' AND b.activity_date > s.activity_date""",
    "trades happen at the latest close": """
        SELECT count(*) FROM activities a
        WHERE a.activity_type IN ('BUY', 'SELL')
          AND a.unit_price <> (SELECT q.close FROM quotes q WHERE q.symbol = a.symbol
                               AND q.quote_date <= CAST(a.activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
                               ORDER BY q.quote_date DESC LIMIT 1)""",
    "each symbol lives in one account; gold is whole chỉ": """
        SELECT (SELECT count(*) FROM (SELECT symbol FROM activities WHERE symbol IS NOT NULL
                                      GROUP BY 1 HAVING count(DISTINCT account_id) > 1))
             + (SELECT count(*) FROM activities WHERE symbol = 'SJC' AND quantity <> floor(quantity))""",
    "every activity names a known account and asset": """
        SELECT count(*) FROM activities a
        WHERE NOT EXISTS (SELECT 1 FROM accounts c WHERE c.id = a.account_id)
           OR (a.symbol IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets s WHERE s.symbol = a.symbol))""",
}

SUMMARY = """
WITH card AS (
    SELECT date_trunc('month', txn_date) m, bank, amount_minor amt
    FROM card_transactions_tagged WHERE amount_minor > 0),
acct AS (
    SELECT date_trunc('month', occurred_at) m, * FROM account_movements_resolved),
months AS (SELECT DISTINCT m FROM acct)
SELECT strftime(mo.m, '%Y-%m') AS month,
  (SELECT sum(amount_minor) FROM acct a WHERE a.m = mo.m AND a.direction = 'C'
     AND (a.description ILIKE '%TRA LUONG%' OR a.description ILIKE '%THUONG%')) / 1e6 AS income,
  (SELECT sum(amt) FROM card c WHERE c.m = mo.m AND bank = 'TCB') / 1e6 AS tcb_card,
  (SELECT sum(amt) FROM card c WHERE c.m = mo.m AND bank = 'VIB') / 1e6 AS vib_card,
  (SELECT sum(amount_minor) FROM acct a WHERE a.m = mo.m AND is_spend AND src = 'tcb_debit') / 1e6 AS debit,
  (SELECT sum(amount_minor) FROM acct a WHERE a.m = mo.m AND is_spend AND src = 'timo') / 1e6 AS timo,
  ((SELECT coalesce(sum(amt), 0) FROM card c WHERE c.m = mo.m)
   + (SELECT coalesce(sum(amount_minor), 0) FROM acct a WHERE a.m = mo.m AND is_spend)) / 1e6 AS spend,
  (SELECT sum(amount_minor) FROM acct a WHERE a.m = mo.m AND flow IN ('savings', 'investment')) / 1e6 AS saved,
  (SELECT running_balance_minor FROM bank_movements b
     WHERE b.source = 'tcb_sms' AND date_trunc('month', b.occurred_at) = mo.m
     ORDER BY occurred_at DESC, id DESC LIMIT 1) / 1e6 AS tcb_balance
FROM months mo ORDER BY 1
"""


def build(end: date) -> None:
    tables, meta = generate(end)
    tmp = DB.with_suffix(".duckdb.tmp")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    con.execute("SET TimeZone = 'Asia/Ho_Chi_Minh'")
    ddl = (HERE / "schema.duckdb.sql").read_text()
    for key in ("MOM_AMOUNT", "TIMO_TOPUP", "PERSONA_NAME"):
        ddl = ddl.replace("{{" + key + "}}", str(getattr(P, key)))
    con.execute(ddl)
    for t in TABLES:
        rows = tables[t]
        cols = list(rows[0])
        con.executemany(f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                        [tuple(r[c] for c in cols) for r in rows])

    print(f"synthetic data {meta['start']} .. {meta['end']} (MAX VIB from {meta['vib_open']}); "
          f"shape: {'calibrated' if meta['calibrated'] else 'persona defaults'}")
    print("rows: " + ", ".join(f"{t} {con.execute(f'SELECT count(*) FROM {t}').fetchone()[0]}" for t in TABLES))
    n_act, n_sym = con.execute("SELECT count(*), count(DISTINCT symbol) FROM activities").fetchone()
    print(f"investments: {n_act} activities, {n_sym} symbols traded or held")

    failed = []
    for name, sql in INVARIANTS.items():
        n = con.execute(sql).fetchone()[0]
        if n:
            failed.append(f"  ✗ {name}: {n}")
    print(f"invariants: {len(INVARIANTS) - len(failed)}/{len(INVARIANTS)} hold")
    if failed:
        con.close()
        tmp.unlink()
        raise SystemExit("\n".join(failed))

    print("\nmonth    income  tcb_card vib_card  debit  timo   spend  sp/inc  saved  tcb_bal")
    for r in con.execute(SUMMARY).fetchall():
        month, income, tcb, vib, debit, timo, spend, saved, bal = r
        f = lambda x: f"{(x or 0):6.1f}"  # noqa: E731
        ratio = (spend / income) if income else 0
        print(f"{month}  {f(income)}  {f(tcb)}  {f(vib)}  {f(debit)} {f(timo)} {f(spend)}  {ratio:5.2f} "
              f"{f(saved)}  {f(bal)}")
    print("(tr đồng)\nMAX VIB cycles (close, spend tr, points):",
          ", ".join(f"{c:%d/%m} {s / 1e6:.1f} {p:,}" for c, s, p in meta["vib_cycles"]))
    materialize(con)   # the day-grain investment facts, as tables (db/materialize.py)
    con.close()
    os.replace(tmp, DB)
    print(f"\nwrote {DB}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", type=date.fromisoformat, default=date.today())
    build(ap.parse_args().end)
