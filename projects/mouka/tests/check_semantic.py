"""Reconcile the semantic layer (AML/AQL) against independent references.

    db/.venv/bin/python -I tests/check_semantic.py

Each check runs AQL through `anfra query -d <dataset>` and compares it with a reference built
outside the semantic layer: direct SQL on the replica (`anfra query --lang sql -s finance`), or a
Python port of cspipeline's own rules (cashback.py, store.budget_progress).
Stop `anfra serve` first if it holds the DuckDB lock. Exits 1 when any check fails.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "db"))
import persona as P  # noqa: E402  (fictional constants: the employer and friend names)

ANFRA = shutil.which("anfra") or str(Path.home() / ".anfra/bin/anfra")
results: list[tuple[str, bool, str]] = []


# ------------------------------------------------------------------ plumbing

def _run(args: list[str], query: str, tz: str | None = None) -> list[dict]:
    cmd = [ANFRA, "query", *args] + (["--timezone", tz] if tz else [])
    p = subprocess.run(cmd, input=query, capture_output=True, text=True, cwd=ROOT)
    if p.returncode:
        raise RuntimeError(f"anfra query failed:\n{query}\n{p.stdout[-1500:]}{p.stderr[-1500:]}")
    res = yaml.safe_load(p.stdout).get("result") or {}
    fields = res.get("fields", [])
    return [dict(zip(fields, r)) for r in res.get("records") or []]


def aql(query: str, dataset: str = "personal_finance", tz: str | None = None) -> list[dict]:
    return _run(["-d", dataset], query, tz)


def sql(query: str) -> list[dict]:
    return _run(["--lang", "sql", "-s", "finance"], query)


def num(v) -> float:
    return 0.0 if v is None else float(v)


def day(v) -> date:
    return date.fromisoformat(str(v)[:10])


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"\n        {detail}" if detail else ""))


def diff(a: dict, b: dict, tol: float = 0.5) -> list[str]:
    keys = sorted(set(a) | set(b))
    return [f"{k}: semantic {a.get(k)} vs reference {b.get(k)}"
            for k in keys if abs(num(a.get(k)) - num(b.get(k))) > tol]


def shift_month(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    return d.replace(year=d.year + y, month=m + 1)


# ------------------------------------------------------------------ checks

def c1_grain() -> None:
    got = aql("explore { measures { n: lines, ids: fct_ledger | count_distinct(fct_ledger.line_id) } }")[0]
    ref = sql("""SELECT (SELECT count(*) FROM card_transactions_tagged)
                      + (SELECT count(*) FROM bank_movements) AS n""")[0]
    ok = num(got["n"]) == num(ref["n"]) == num(got["ids"])
    check("1. fct_ledger grain: one row per card line (Đã hoàn excluded) + account movement",
          ok, f"{int(num(got['n']))} lines, {int(num(got['ids']))} distinct ids, reference {int(num(ref['n']))}")


SPEND_REF = """
WITH s AS (
  SELECT strftime(txn_date, '%Y-%m') AS m,
         CASE bank WHEN 'TCB' THEN 'credit' WHEN 'VIB' THEN 'vib_credit' END AS src, amount_minor AS amt
  FROM card_transactions_tagged WHERE amount_minor > 0
  UNION ALL
  SELECT strftime(CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), '%Y-%m'), src, amount_minor
  FROM account_movements_resolved WHERE is_spend
)
SELECT m, src, sum(amt) AS spend FROM s GROUP BY 1, 2 ORDER BY 1, 2
"""
SPEND_AQL = """
explore {
  dimensions { m: dim_dates.date_key | month(), s: dim_sources.src }
  measures { spend: spend }
  sorts { m ASC, s ASC }
}
"""


def c2_spend() -> None:
    got = {(str(r["m"])[:7], r["s"]): r["spend"] for r in aql(SPEND_AQL) if num(r["spend"])}
    ref = {(r["m"], r["src"]): r["spend"] for r in sql(SPEND_REF)}
    bad = diff(got, ref)
    check("2. spend per month and source = cspipeline Tiền ra (card purchases + is_spend account debits)",
          not bad, "; ".join(bad[:4]) or f"{len({m for m, _ in ref})} months × {len({s for _, s in ref})} sources, "
          f"{sum(num(v) for v in ref.values()):,.0f} ₫ total")


def c3_additivity() -> None:
    total = num(aql("explore { measures { s: spend } }")[0]["s"])
    by_cat = sum(num(r["s"]) for r in aql("explore { dimensions { c: dim_categories.category } measures { s: spend } }"))
    by_src = sum(num(r["s"]) for r in aql("explore { dimensions { x: dim_sources.src } measures { s: spend } }"))
    ok = abs(total - by_cat) < 1 and abs(total - by_src) < 1
    check("3. Σ category = Σ source = spend", ok,
          f"spend {total:,.0f} · categories {by_cat:,.0f} · sources {by_src:,.0f}")


def _reward_reference() -> tuple[dict, dict, dict, date]:
    """Python port of cspipeline cashback.period_bounds / _reward_at / milestone_progress."""
    rung = sql("""SELECT cycle_close_day AS cd, threshold_minor AS th, reward_minor AS rw
                  FROM cashback_milestones WHERE src = 'vib_credit' AND active AND accrual = 'rate'""")[0]
    cd, th, rw = int(num(rung["cd"])), int(num(rung["th"])), int(num(rung["rw"]))
    as_of = day(sql("""SELECT max(d) AS d FROM (SELECT txn_date AS d FROM transactions UNION ALL
                       SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) FROM bank_movements)""")[0]["d"])

    def cycle_end(d: date) -> date:
        end = d.replace(day=cd)
        return shift_month(end, 1) if d.day > cd else end

    spend: dict[date, int] = defaultdict(int)
    for r in sql("SELECT txn_date, amount_minor FROM card_transactions_tagged WHERE bank = 'VIB' AND amount_minor > 0"):
        spend[cycle_end(day(r["txn_date"]))] += int(num(r["amount_minor"]))
    earned = {e: min(rw, max(0, s) * rw // th) for e, s in spend.items()}
    paid: dict[date, int] = defaultdict(int)
    for r in sql("SELECT txn_date, amount_minor FROM transactions WHERE source = 'vib_reward'"):
        d = day(r["txn_date"])
        closed = d.replace(day=cd) if d.day > cd else shift_month(d.replace(day=cd), -1)
        paid[closed] += -int(num(r["amount_minor"]))

    cur_end = cycle_end(as_of)
    start = shift_month(cur_end, -1) + timedelta(days=1)
    days_in = (cur_end - start).days + 1
    elapsed, left = (as_of - start).days + 1, (cur_end - as_of).days
    actual = spend.get(cur_end, 0)
    projected = actual * days_in // elapsed
    gap = max(0, th - actual)
    current = {
        "qual": actual, "pts": earned.get(cur_end, 0),
        "per_day": -(-gap // (left + 1)) if gap else 0,
        "proj": projected, "proj_pts": min(rw, projected * rw // th), "gap": gap,
        "status": "maxed" if actual >= th else ("behind" if projected < th else "on_pace"),
    }
    return earned, paid, {"end": cur_end, **current}, as_of


def c4_rewards() -> None:
    earned, paid, cur, as_of = _reward_reference()
    rows = aql("""explore {
      dimensions { end: dim_reward_cycles.cycle_end, cur: dim_reward_cycles.is_current }
      measures { pts: points_earned, paid: points_paid, qual: reward_qualifying_spend, per_day: daily_spend_needed,
                 proj: projected_cycle_spend, proj_pts: projected_points, gap: cap_gap, status: reward_status }
      sorts { end ASC } }""")
    got = {day(r["end"]): r for r in rows}
    bad = diff({k: v["pts"] for k, v in got.items()}, {k: v for k, v in earned.items()})
    closed = [e for e in earned if e < as_of]
    bad += [f"cycle {e} paid {got[e]['paid']} vs earned {earned[e]}" for e in closed
            if abs(num(got[e]["paid"]) - earned[e]) > 0.5 and e in paid]
    bad += [f"cycle {e} cashed out in data {paid[e]} vs earned {earned[e]}" for e in closed
            if e in paid and paid[e] != earned[e]]
    c = got.get(cur["end"])
    if c is None:
        bad.append(f"current cycle {cur['end']} missing")
    else:
        for k in ("qual", "pts", "per_day", "proj", "proj_pts", "gap"):
            if abs(num(c[k]) - cur[k]) > 0.5:
                bad.append(f"current {k}: semantic {c[k]} vs cashback.py {cur[k]}")
        if c["status"] != cur["status"]:
            bad.append(f"current status {c['status']} vs {cur['status']}")
    check("4. MAX VIB points per cycle = cashback._reward_at; cash-outs = points; pace = milestone_progress",
          not bad, "; ".join(bad[:4]) or
          f"{len(earned)} cycles, {sum(earned.values()):,} points; current cycle {cur['end']}: "
          f"₫{cur['per_day']:,}/day to the cap, status {cur['status']}")


def c5_savings() -> None:
    """surplus = income − (spend − refunds − friend paybacks); savings rate = surplus ÷ income.
    The reference reads persona.py and the generator's literals, not the AML flow rules."""
    friends = " OR ".join(f"description ILIKE '{n}%'" for n in P.FRIEND_NAMES)
    local_m = "strftime(CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), '%Y-%m')"
    ref: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in sql(f"""SELECT {local_m} AS m, sum(amount_minor) AS v FROM bank_movements WHERE direction = 'C'
                     AND (description ILIKE '%{P.EMPLOYER}%' OR description ILIKE 'THANH TOAN LAI%') GROUP BY 1"""):
        ref[r["m"]]["income"] += num(r["v"])
    for r in sql(SPEND_REF):
        ref[r["m"]]["spend"] += num(r["spend"])
    for r in sql("""SELECT strftime(txn_date, '%Y-%m') AS m, -sum(amount_minor) AS v FROM card_transactions_tagged
                    WHERE description ILIKE 'TRA LAI HANG HOA%' GROUP BY 1"""):
        ref[r["m"]]["refunds"] += num(r["v"])
    for r in sql(f"""SELECT {local_m} AS m, sum(amount_minor) AS v FROM bank_movements
                     WHERE direction = 'C' AND ({friends}) GROUP BY 1"""):
        ref[r["m"]]["friends"] += num(r["v"])
    got = {str(r["m"])[:7]: r for r in aql("""explore {
      dimensions { m: dim_dates.date_key | month() }
      measures { surplus: surplus, rate: savings_rate }
      sorts { m ASC } }""")}
    bad = []
    for m, x in sorted(ref.items()):
        surplus = x["income"] - (x["spend"] - x["refunds"] - x["friends"])
        g = got.get(m, {})
        if abs(num(g.get("surplus")) - surplus) > 0.5:
            bad.append(f"{m} surplus {g.get('surplus')} vs {surplus:,.0f}")
        rate = surplus / x["income"] if x["income"] else None
        if (rate is None) != (g.get("rate") is None) or (rate is not None and abs(num(g["rate"]) - rate) > 1e-9):
            bad.append(f"{m} savings_rate {g.get('rate')} vs {rate}")
    inc = sum(x["income"] for x in ref.values())
    total = inc - sum(x["spend"] - x["refunds"] - x["friends"] for x in ref.values())
    check("5. surplus and savings rate per month = income − (spend − refunds − friend paybacks), from persona.py",
          not bad, "; ".join(bad[:4]) or f"{len(ref)} months; whole period ₫{total:,.0f} saved, "
          f"{total / inc:.1%} of income")


def c6_budgets() -> None:
    b = aql("""explore {
      dimensions { m: dim_dates.date_key | month(), t: fct_budget_months.scope_type, v: fct_budget_months.scope_value,
                   buf: fct_budget_months.is_buffer }
      measures { lim: budget_limit, raw: budget_raw_spent, spent: budget_spent, moved: budget_overflow_to_buffer }
      sorts { m ASC } }""")
    cat = {(str(r["m"])[:7], r["c"]): num(r["s"]) for r in aql(
        "explore { dimensions { m: dim_dates.date_key | month(), c: dim_categories.category } measures { s: spend } }")}
    src = {(str(r["m"])[:7], r["c"]): num(r["s"]) for r in aql(
        "explore { dimensions { m: dim_dates.date_key | month(), c: dim_sources.src } measures { s: spend } }")}
    moved_by_month: dict[str, float] = defaultdict(float)
    for r in b:
        moved_by_month[str(r["m"])[:7]] += num(r["moved"])
    bad = []
    for r in b:
        m, t, v = str(r["m"])[:7], r["t"], r["v"]
        raw, lim, spent, moved = num(r["raw"]), num(r["lim"]), num(r["spent"]), num(r["moved"])
        want_raw = cat.get((m, v), 0) if t == "category" else src.get((m, v), 0)
        if abs(raw - want_raw) > 0.5:
            bad.append(f"{m} {t}:{v} raw {raw} vs spend {want_raw}")
        if t == "category" and r["buf"] in (True, "true"):
            want_spent = raw + moved_by_month[m]
        elif t == "category":
            want_spent = min(raw, lim)
            if abs(moved - max(0.0, raw - lim)) > 0.5:
                bad.append(f"{m} {v} moved {moved} vs {max(0.0, raw - lim)}")
        else:
            want_spent = raw
        if abs(spent - want_spent) > 0.5:
            bad.append(f"{m} {t}:{v} spent {spent} vs {want_spent}")
    check("6. budgets = store.budget_progress: raw = spend in scope, categories cap, excess lands in the buffer",
          not bad, "; ".join(bad[:4]) or f"{len(b)} budget-months")


def c7_balances() -> None:
    got = {r["src"]: num(r["bal"]) for r in aql(
        "explore { dimensions { src: dim_sources.src } measures { bal: account_balance } }") if r["bal"] is not None}
    ref = {("tcb_debit" if r["source"] == "tcb_sms" else "timo"): num(r["b"]) for r in sql("""
        SELECT source, running_balance_minor AS b FROM bank_movements
        QUALIFY row_number() OVER (PARTITION BY source ORDER BY occurred_at DESC, id DESC) = 1""")}
    total = num(aql("explore { measures { t: total_cash } }")[0]["t"])
    bad = diff(got, ref)
    if abs(total - sum(ref.values())) > 0.5:
        bad.append(f"total_cash {total} vs {sum(ref.values())}")
    check("7. account balance = last running balance per account; total cash = their sum", not bad,
          "; ".join(bad) or ", ".join(f"{k} ₫{v:,.0f}" for k, v in sorted(ref.items())))


def c8_taxonomy() -> None:
    rows = aql("""explore { dimensions { g: fct_ledger.flow_group, s: fct_ledger.is_spend, k: fct_ledger.line_kind }
                            measures { n: lines } }""")
    other = sum(num(r["n"]) for r in rows if r["g"] == "other")
    mismatch = [r for r in rows if (r["g"] == "spend") != (r["s"] in (True, "true"))]
    cash_in = num(aql("explore { measures { c: cash_in } }")[0]["c"])
    ref_in = num(sql("SELECT sum(amount_minor) AS s FROM bank_movements WHERE direction = 'C'")[0]["s"])
    bad = []
    if other:
        bad.append(f"{int(other)} lines fall in flow_group 'other'")
    if mismatch:
        bad.append(f"flow_group spend ≠ is_spend on {mismatch[:3]}")
    if abs(cash_in - ref_in) > 0.5:
        bad.append(f"cash_in {cash_in} vs SQL {ref_in}")
    check("8. every line has a flow group; spend group ⇔ is_spend; cash_in = all account credits", not bad,
          "; ".join(bad) or f"{len({r['g'] for r in rows})} flow groups, 0 unclassified")


def c9_raw_counts() -> None:
    tables = ("statements", "transactions", "bank_movements", "annotations", "budgets",
              "cashback_milestones", "fx_rates", "accounts", "assets", "quotes", "activities")
    got = aql("explore { measures { " + ", ".join(f"{t}: raw_{t}.row_count" for t in tables) + " } }", "finance_raw")[0]
    ref = sql("SELECT " + ", ".join(f"(SELECT count(*) FROM {t}) AS {t}" for t in tables))[0]
    bad = diff(got, ref)
    check("9. finance_raw row counts = source tables", not bad, "; ".join(bad) or
          ", ".join(f"{t} {int(num(ref[t]))}" for t in tables))


def c10_timezone() -> None:
    a = aql(SPEND_AQL, tz="Etc/UTC")
    b = aql(SPEND_AQL, tz="Asia/Ho_Chi_Minh")
    shifted = num(sql("""SELECT count(*) AS n FROM bank_movements
                         WHERE CAST(occurred_at AS DATE) <> CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)""")[0]["n"])
    check("10. monthly figures do not depend on the query timezone (dates are local in SQL)", a == b,
          f"{int(shifted)} account movements fall on a different day in UTC; results identical under both zones"
          if a == b else "results differ between Etc/UTC and Asia/Ho_Chi_Minh")


def c11_income() -> None:
    """Every credit from the persona's employer is income; every friend's transfer is a payback,
    and nothing else is. The reference reads persona.py, not the AML rules."""
    got = {r["t"]: r for r in aql("""explore {
      dimensions { t: fct_ledger.flow_type }
      measures { n: lines, amt: fct_ledger | sum(fct_ledger.amount_vnd) }
      filters { fct_ledger.flow_group in ['income', 'reimbursement'] } }""")}
    emp = sql(f"""SELECT count(*) AS n, sum(amount_minor) AS amt FROM bank_movements
                  WHERE direction = 'C' AND description ILIKE '%{P.EMPLOYER}%'""")[0]
    friends = " OR ".join(f"description ILIKE '{n}%'" for n in P.FRIEND_NAMES)
    friend = sql(f"""SELECT count(*) AS n, sum(amount_minor) AS amt FROM bank_movements
                     WHERE direction = 'C' AND ({friends})""")[0]
    employer_income = sum(num(got.get(t, {}).get("amt")) for t in ("salary", "bonus"))
    employer_lines = sum(num(got.get(t, {}).get("n")) for t in ("salary", "bonus"))
    bad = []
    if (employer_lines, employer_income) != (num(emp["n"]), num(emp["amt"])):
        bad.append(f"salary+bonus {employer_lines:.0f} lines ₫{employer_income:,.0f} vs employer credits "
                   f"{num(emp['n']):.0f} lines ₫{num(emp['amt']):,.0f}")
    pb = got.get("friend_payback", {})
    if (num(pb.get("n")), num(pb.get("amt"))) != (num(friend["n"]), num(friend["amt"])):
        bad.append(f"friend_payback {pb.get('n')} vs friend credits {friend['n']}")
    if extra := set(got) - {"salary", "bonus", "interest", "friend_payback"}:
        bad.append(f"unexpected income/reimbursement types {sorted(extra)}")
    if not num(got.get("bonus", {}).get("n")):
        bad.append("no bonus lines classified")
    check("11. every employer credit is salary or bonus; every friend credit is a friend payback", not bad,
          "; ".join(bad) or f"{num(emp['n']):.0f} employer credits (₫{num(emp['amt']):,.0f}, "
          f"{num(got['bonus']['n']):.0f} bonuses), {num(friend['n']):.0f} friend paybacks")


def c12_cash_ahead() -> None:
    """Forecast › Next 30 days: every expected movement of spendable cash, rebuilt from the series it comes from."""
    bad = []
    a = day(aql("explore { measures { d: data_as_of } }")[0]["d"])
    ev = aql("explore { dimensions { d: fct_cash_ahead.event_date, k: fct_cash_ahead.kind, l: fct_cash_ahead.label, det: fct_cash_ahead.detail, a: fct_cash_ahead.amount_vnd } }")
    inside = lambda d: 0 < (d - a).days <= 30  # noqa: E731
    # payday = each fct_recurring salary series due in the window
    sal = aql("explore { dimensions { d: fct_recurring.next_due, a: fct_recurring.expected_vnd } filters { fct_recurring.kind == 'income' } }")
    want = sorted((day(r["d"]), num(r["a"])) for r in sal if inside(day(r["d"])))
    got = sorted((day(r["d"]), num(r["a"])) for r in ev if r["k"] == "income")
    if want != got:
        bad.append(f"paydays {got} vs fct_recurring {want}")
    # each card's payment: about a month of that card's spending (its last 90 days of card lines, per day × 30.4375),
    # on the day of month its last payment from the bank went out (MAX VIB: othercard, TCB Visa: settlement)
    card_lines = aql("explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, src: fct_ledger.src, sp: fct_ledger.spend_vnd } filters { fct_ledger.line_kind == 'card' } }")
    pay_lines = aql("explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, pf: fct_ledger.pipeline_flow, src: fct_ledger.src } filters { fct_ledger.pipeline_flow in ['othercard', 'settlement'] } }")
    unpaid_tcb = []
    for label, card, flow in (("MAX VIB", "vib_credit", "othercard"), ("TCB Visa", "credit", "settlement")):
        cl = [r for r in card_lines if r["src"] == card]
        last = max(day(r["d"]) for r in cl)
        rate = sum(num(r["sp"]) for r in cl if day(r["d"]) > last - timedelta(days=90)) / 90
        pl = sorted(day(r["d"]) for r in pay_lines if r["pf"] == flow and r["src"] in ("tcb_debit", "timo") and a - timedelta(days=92) < day(r["d"]) <= a)
        got_c = [(day(r["d"]), num(r["a"])) for r in ev if r["l"] == label]
        if len(pl) < 2:
            continue
        lp = pl[-1]
        nxt = next(d for d in (m.replace(day=min(lp.day, (shift_month(m, 1) - timedelta(days=1)).day))
                               for m in (shift_month(lp.replace(day=1), k) for k in range(0, 3))) if d > a)
        want_c = [(nxt, -round(rate * 30.4375))] if inside(nxt) else []
        if label == "TCB Visa" and any(r["l"] == "TCB Visa" and r["k"] == "card" and "Statement" in str(r.get("det", "")) for r in ev):
            continue  # a known unpaid statement replaces the estimate (checked below)
        if [(d, round(v)) for d, v in got_c] != want_c:
            bad.append(f"{label} {got_c} vs {want_c} (₫{rate:,.0f} a day)")
    # family: the latest money sent to family, again on its day of month
    fam = aql("explore { dimensions { d: fct_ledger.line_date, a: fct_ledger.amount_vnd } filters { fct_ledger.flow_type == 'family_support' } sorts { d desc } }")
    if fam:
        last = day(fam[0]["d"])
        # the same day of month in the next months (clamped to the month's last day), the first one after the as-of date
        days = [m.replace(day=min(last.day, (shift_month(m, 1) - timedelta(days=1)).day))
                for m in (shift_month(last.replace(day=1), k) for k in range(1, 4))]
        nxt = next(d for d in days if d > a)
        want_f = [(nxt, -num(fam[0]["a"]))] if inside(nxt) else []
        got_f = sorted((day(r["d"]), num(r["a"])) for r in ev if r["k"] == "family")
        if got_f != want_f:
            bad.append(f"family {got_f} vs {want_f}")
    # TCB Visa: a statement due in the window, minus the bank payments to the card since it closed
    st = aql("explore { dimensions { pe: fct_card_statements.period_end, due: fct_card_statements.payment_due_date, b: fct_card_statements.outstanding_balance_vnd } filters { fct_card_statements.src == 'credit' } }")
    pays = aql("explore { dimensions { id: fct_ledger.line_id, d: fct_ledger.line_date, a: fct_ledger.amount_vnd } filters { fct_ledger.pipeline_flow == 'settlement' } }")
    want_t = []
    for r in st:
        if r["due"] is None or r["b"] is None or not inside(day(r["due"])):
            continue
        left = num(r["b"]) - sum(num(p["a"]) for p in pays if day(r["pe"]) < day(p["d"]) <= a)
        if left > 0:
            want_t.append((day(r["due"]), -left))
    got_t = sorted((day(r["d"]), num(r["a"])) for r in ev if r["l"] == "TCB Visa" and "Statement" in str(r["det"]))
    if got_t != sorted(want_t):
        bad.append(f"TCB Visa {got_t} vs {want_t}")
    # the 30-day expectation, over the last 90 days: total cash + in − out − everyday × 30
    z0 = a - timedelta(days=89)
    f = f"filters {{ dim_dates.date_key >= @{z0}, dim_dates.date_key <= @{a} }}"
    k = aql(f"explore {{ measures {{ t: total_cash, i: cash_ahead_in_30d, o: cash_ahead_out_30d, e: everyday_spend_daily, x: cash_expected_30d }} {f} }}")[0]
    lines = aql(f"explore {{ dimensions {{ id: fct_ledger.line_id, a: fct_ledger.amount_vnd }} filters {{ fct_ledger.flow_type == 'account_spend', fct_ledger.src in ['tcb_debit', 'timo'], fct_ledger.line_date >= @{z0}, fct_ledger.line_date <= @{a} }} }}")
    every = sum(num(r["a"]) for r in lines) / 90
    if abs(num(k["e"]) - every) > 0.5:
        bad.append(f"everyday a day {k['e']} vs {every:,.0f}")
    ins = sum(num(r["a"]) for r in ev if num(r["a"]) > 0)
    outs = -sum(num(r["a"]) for r in ev if num(r["a"]) < 0)
    if abs(num(k["i"]) - ins) > 0.5 or abs(num(k["o"]) - outs) > 0.5:
        bad.append(f"in/out {k['i']}/{k['o']} vs events {ins:,.0f}/{outs:,.0f}")
    want_x = num(k["t"]) + ins - outs - every * 30
    if abs(num(k["x"]) - want_x) > 1:
        bad.append(f"cash_expected_30d {k['x']} vs {want_x:,.0f}")
    check("12. cash ahead: paydays = fct_recurring, each card = a month of its spending on its payment day, family on its day of month, unpaid TCB Visa; "
          "in 30 days = total cash + in − out − everyday a day × 30", not bad,
          "; ".join(bad[:3]) or f"{len(ev)} events, ₫{num(k['x']):,.0f} in 30 days")


def main() -> None:
    print(f"semantic layer checks: {ROOT.name}")
    for c in (c1_grain, c2_spend, c3_additivity, c4_rewards, c5_savings, c6_budgets, c7_balances,
              c8_taxonomy, c9_raw_counts, c10_timezone, c11_income, c12_cash_ahead):
        try:
            c()
        except Exception as e:  # a crash is a failure, not a skip
            check(c.__name__, False, f"{type(e).__name__}: {str(e)[:600]}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"RESULT: {'PASS' if not failed else 'FAIL'} ({len(results) - len(failed)}/{len(results)})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
