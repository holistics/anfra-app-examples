"""Reconcile the `wealth` dataset against an independent Python replay of the source tables.

    db/.venv/bin/python -I tests/check_wealth.py

The reference replays `activities`, `quotes`, `fx_rates`, `bank_movements` and the card rows in
plain Python: no AML, no window SQL. Then it compares AQL metrics with it. Stop `anfra serve` first.
"""
from __future__ import annotations

import math
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_semantic import aql, check, day, num, results, sql  # noqa: E402

DS = "wealth"


def w(query: str, tz: str | None = None) -> list[dict]:
    return aql(query, DS, tz)


def truthy(v) -> bool:
    return v in (True, "true", "1", 1)


def between(a: date, b: date) -> str:
    return f"filters {{ dim_dates.date_key matches @({a.isoformat()} - {b.isoformat()}) }}"


class Book:
    """The independent valuation: every account as of the end of a local day."""

    def __init__(self) -> None:
        self.acts = sql("""SELECT account_id, symbol, activity_type, is_opening,
                                  CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
                                  quantity, amount_minor, fee_minor, currency
                           FROM activities ORDER BY activity_date, id""")
        for a in self.acts:
            a["d"] = day(a["d"])
        self.quotes: dict[str, list[tuple[date, float]]] = defaultdict(list)
        for r in sql("SELECT symbol, quote_date, close FROM quotes ORDER BY symbol, quote_date"):
            self.quotes[r["symbol"]].append((day(r["quote_date"]), num(r["close"])))
        self.fx = [(day(r["rate_date"]), num(r["v"])) for r in
                   sql("SELECT rate_date, vnd_per_unit AS v FROM fx_rates WHERE currency = 'USD' ORDER BY rate_date")]
        self.accounts = {r["id"]: r for r in sql("SELECT id, account_type, src, currency FROM accounts")}
        self.bank: dict[str, list[tuple[date, float, str, float]]] = defaultdict(list)
        for r in sql("""SELECT CASE source WHEN 'tcb_sms' THEN 'tcb_debit' ELSE 'timo' END AS src,
                               CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
                               running_balance_minor AS b, direction, amount_minor AS a
                        FROM bank_movements ORDER BY occurred_at, id"""):
            self.bank[r["src"]].append((day(r["d"]), num(r["b"]), r["direction"], num(r["a"])))
        self.cards: dict[str, list[tuple[date, float]]] = defaultdict(list)
        for r in sql("""SELECT CASE bank WHEN 'TCB' THEN 'credit' ELSE 'vib_credit' END AS src,
                               txn_date AS d, amount_minor AS a FROM card_transactions_tagged
                        WHERE NOT (bank = 'TCB' AND description ILIKE 'THANH TOAN NO THE%')"""):
            self.cards[r["src"]].append((day(r["d"]), num(r["a"])))
        for r in sql("""SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d, amount_minor AS a
                        FROM account_movements_resolved WHERE flow = 'settlement' AND direction = 'D'"""):
            self.cards["credit"].append((day(r["d"]), -num(r["a"])))
        for r in sql("""SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d, amount_minor AS a
                        FROM account_movements_resolved WHERE flow = 'othercard' AND direction = 'D'"""):
            self.cards["vib_credit"].append((day(r["d"]), -num(r["a"])))
        self.as_of = day(sql("""SELECT max(d) AS d FROM (SELECT txn_date AS d FROM transactions UNION ALL
                                SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) FROM bank_movements)""")[0]["d"])
        self.start = min(a["d"] for a in self.acts if truthy(a["is_opening"]))

    @staticmethod
    def last(series: list[tuple[date, float]], d: date) -> float | None:
        v = None
        for x, val in series:
            if x > d:
                break
            v = val
        return v

    def price(self, sym: str, d: date) -> float:
        return self.last(self.quotes[sym], d)

    def positions(self, d: date) -> tuple[dict, dict, dict]:
        qty, cost, proceeds = defaultdict(float), defaultdict(float), defaultdict(float)
        for a in self.acts:
            if a["d"] > d or not a["symbol"]:
                continue
            k = (a["account_id"], a["symbol"])
            t, n, amt, fee = a["activity_type"], num(a["quantity"]), num(a["amount_minor"]), num(a["fee_minor"])
            if t in ("BUY", "ADD_HOLDING"):
                qty[k] += n
                cost[k] += amt + (fee if t == "BUY" else 0)
            elif t == "SELL":
                qty[k] -= n
                proceeds[k] += amt - fee
        return qty, cost, proceeds

    def cash(self, account: str, d: date) -> float:
        c = 0.0
        for a in self.acts:
            if a["account_id"] != account or a["d"] > d:
                continue
            t, amt, fee = a["activity_type"], num(a["amount_minor"]), num(a["fee_minor"])
            c += {"DEPOSIT": amt, "WITHDRAWAL": -amt, "BUY": -(amt + fee), "SELL": amt - fee,
                  "DIVIDEND": amt, "INTEREST": amt}.get(t, 0.0)
        if self.accounts[account]["currency"] == "USD":
            c = c / 100 * self.last(self.fx, d)
        return c

    def account_value(self, account: str, d: date) -> float:
        t = self.accounts[account]
        if t["account_type"] == "CREDIT_CARD":
            return -sum(v for x, v in self.cards[t["src"]] if x <= d)
        if t["src"]:
            rows = self.bank[t["src"]]
            seen = [b for x, b, _, _ in rows if x <= d]
            if seen:
                return seen[-1]
            _, b0, dr, a0 = rows[0]
            return b0 - (a0 if dr == "C" else -a0)
        qty, _, _ = self.positions(d)
        held = sum(n * self.price(s, d) for (acc, s), n in qty.items() if acc == account)
        return self.cash(account, d) + held

    def net_worth(self, d: date) -> float:
        return sum(self.account_value(a, d) for a in self.accounts)


BOOK: Book | None = None


def book() -> Book:
    global BOOK
    if BOOK is None:
        BOOK = Book()
    return BOOK


# ------------------------------------------------------------------ checks

def w1_holdings() -> None:
    b = book()
    qty, cost, proceeds = b.positions(b.as_of)
    rows = {r["s"]: r for r in w("""explore {
      dimensions { s: dim_assets.symbol }
      measures { q: holding_quantity, p: holding_price, v: holding_value, c: holding_book_cost,
                 u: holding_unrealized, r: holding_realized } }""")}
    bad = []
    for (acc, s), n in qty.items():
        g, px = rows.get(s, {}), b.price(s, b.as_of)
        want = {"q": n, "p": px, "v": n * px, "c": cost[(acc, s)] if n > 0 else 0,
                "u": n * px - cost[(acc, s)] if n > 0 else 0,
                "r": proceeds[(acc, s)] - cost[(acc, s)] if n == 0 and proceeds[(acc, s)] > 0 else 0}
        bad += [f"{s}.{k} {g.get(k)} vs {v:,.2f}" for k, v in want.items() if abs(num(g.get(k)) - v) > 0.5]
    totals = w("explore { measures { v: holdings_value, n: holdings_count } }")[0]
    want_v = sum(n * b.price(s, b.as_of) for (_, s), n in qty.items())
    want_n = sum(1 for n in qty.values() if n > 0)
    if abs(num(totals["v"]) - want_v) > 1 or num(totals["n"]) != want_n:
        bad.append(f"totals {totals} vs value {want_v:,.0f}, count {want_n}")
    closed = [s for (_, s), n in qty.items() if n == 0]
    check("w1. holdings at the as-of date = replay of activities × latest close; closed positions realize P&L",
          not bad, "; ".join(bad[:4]) or f"{want_n} open, closed {closed}, ₫{want_v:,.0f}")


def w7_income() -> None:
    got = {str(r["m"])[:7]: r for r in w("""explore {
      dimensions { m: dim_dates.date_key | month() }
      measures { d: dividend_income, i: interest_income, t: investment_income } }""")}
    ref = defaultdict(lambda: defaultdict(float))
    for r in sql("""SELECT strftime(CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), '%Y-%m') AS m,
                           activity_type AS t, sum(amount_minor) AS a
                    FROM activities WHERE activity_type IN ('DIVIDEND', 'INTEREST') GROUP BY 1, 2"""):
        ref[r["m"]]["d" if r["t"] == "DIVIDEND" else "i"] += num(r["a"])
    bad = []
    for m in sorted(set(ref) | {k for k, v in got.items() if num(v["t"])}):
        g, x = got.get(m, {}), ref.get(m, {})
        for k in ("d", "i"):
            if abs(num(g.get(k)) - x.get(k, 0.0)) > 0.5:
                bad.append(f"{m} {k} {g.get(k)} vs {x.get(k, 0.0):,.0f}")
        if abs(num(g.get("t")) - x.get("d", 0.0) - x.get("i", 0.0)) > 0.5:
            bad.append(f"{m} total {g.get('t')}")
    check("w7. dividend and interest income per month = DIVIDEND and INTEREST activities", not bad,
          "; ".join(bad[:4]) or f"{len(ref)} months with income")


def w9_activities() -> None:
    got = {r["t"]: num(r["n"]) for r in w("explore { dimensions { t: fct_activities.activity_type } measures { n: activities_count } }")}
    ref = {r["t"]: num(r["n"]) for r in sql("SELECT activity_type AS t, count(*) AS n FROM activities GROUP BY 1")}
    check("w9. activities by type = the activities table", got == ref, f"semantic {got} vs table {ref}")


def w2_cash() -> None:
    b = book()
    got = {r["a"]: num(r["c"]) for r in w("""explore {
      dimensions { a: dim_accounts.account_id } measures { c: fct_account_days | max_by(fct_account_days.cash_vnd, fct_account_days.date_key) } }""")}
    bad = []
    for acc, t in b.accounts.items():
        if t["src"]:
            continue
        want = b.cash(acc, b.as_of)
        if abs(got.get(acc, 0.0) - want) > 1:
            bad.append(f"{acc} {got.get(acc)} vs {want:,.0f}")
    total = num(w("explore { measures { c: cash_balance } }")[0]["c"])
    want_total = sum(b.cash(a, b.as_of) for a, t in b.accounts.items() if not t["src"]) + \
        sum(b.account_value(a, b.as_of) for a, t in b.accounts.items() if t["src"] and t["account_type"] == "CASH")
    if abs(total - want_total) > 2:
        bad.append(f"cash_balance {total:,.0f} vs {want_total:,.0f}")
    check("w2. cash per investment account (USD at the latest rate) and total cash = replay", not bad,
          "; ".join(bad[:4]) or f"cash ₫{want_total:,.0f}")


def w3_accounts() -> None:
    b = book()
    got = {r["a"]: num(r["v"]) for r in w("explore { dimensions { a: dim_accounts.account_id } measures { v: account_value } }")}
    bad = [f"{a} {got.get(a)} vs {b.account_value(a, b.as_of):,.0f}" for a in b.accounts
           if abs(got.get(a, 0.0) - b.account_value(a, b.as_of)) > 1]
    check("w3. every account's value at the as-of date = replay (bank = last running balance, cards = debt)",
          not bad, "; ".join(bad[:4]) or ", ".join(f"{a} ₫{v:,.0f}" for a, v in sorted(got.items())))


def w4_curve() -> None:
    b = book()
    sample = sorted({b.start, b.start + timedelta(days=37), date(b.as_of.year, 1, 1), b.as_of - timedelta(days=45),
                     b.as_of - timedelta(days=1), b.as_of} - {None})
    sample += [d for d in (b.as_of - timedelta(days=i) for i in range(3, 10)) if d.weekday() == 6][:1]
    got = {day(r["d"]): num(r["n"]) for r in w(f"""explore {{
      dimensions {{ d: dim_dates.date_key }} measures {{ n: net_worth_daily }}
      {between(b.start, b.as_of)} }}""")}
    bad = [f"{d} {got.get(d)} vs {b.net_worth(d):,.0f}" for d in sample if abs(got.get(d, 0.0) - b.net_worth(d)) > 2]
    check("w4. net worth on sampled days (incl. a Sunday and the first day) = full replay of every account",
          not bad, "; ".join(bad[:4]) or f"{len(sample)} days match")


def day_gain(b: Book, d: date) -> float:
    """Market move on yesterday's positions + dividends and interest booked that day."""
    qty, _, _ = b.positions(d - timedelta(days=1))
    move = sum(n * (b.price(s, d) - b.price(s, d - timedelta(days=1))) for (_, s), n in qty.items() if n)
    return move + sum(num(a["amount_minor"]) for a in b.acts
                      if a["d"] == d and a["activity_type"] in ("DIVIDEND", "INTEREST"))


def assets(b: Book, d: date) -> float:
    return sum(b.account_value(a, d) for a, t in b.accounts.items() if t["account_type"] != "CREDIT_CARD")


def w5_networth() -> None:
    b = book()
    bad = []
    gain_day = next(d for d in (b.as_of - timedelta(days=i) for i in range(30, 60))
                    if d.weekday() < 5 and abs(day_gain(b, d)) > 1)
    for a, z in ((b.start, b.as_of), (date(b.as_of.year, 1, 1), b.as_of), (b.as_of - timedelta(days=90), b.as_of),
                 (gain_day, b.as_of)):
        r = w(f"""explore {{ measures {{ nw: net_worth, s: net_worth_start, ch: net_worth_change,
                  g: investment_gains, sv: saved_from_income, dc: debt_change }} {between(a, z)} }}""")[0]
        if abs(num(r["nw"]) - b.net_worth(z)) > 2 or abs(num(r["s"]) - b.net_worth(a)) > 2:
            bad.append(f"{a}..{z} end {r['nw']} vs {b.net_worth(z):,.0f}, start {r['s']} vs {b.net_worth(a):,.0f}")
        if abs(num(r["g"]) + num(r["sv"]) + num(r["dc"]) - num(r["ch"])) > 1:
            bad.append(f"{a}..{z} drivers don't sum: {r}")
        # start = the first day after its movements, so the gains are those of the days after it
        g = sum(day_gain(b, a + timedelta(days=i)) for i in range(1, (z - a).days + 1))
        sv = assets(b, z) - assets(b, a) - g
        dc = (b.net_worth(z) - b.net_worth(a)) - (assets(b, z) - assets(b, a))
        for k, want in (("g", g), ("sv", sv), ("dc", dc)):
            if abs(num(r[k]) - want) > 2:
                bad.append(f"{a}..{z} {k} {r[k]} vs replay {want:,.0f}")
    check("w5. net worth end/start and the three drivers = replay (incl. a range starting on a market-move day)",
          not bad, "; ".join(bad[:3]) or f"4 ranges (one from {gain_day})")


def w8_timezone() -> None:
    q = "explore { dimensions { m: dim_dates.date_key | month() } measures { n: net_worth, h: holdings_value } }"
    # rows come back unordered (the explore has no sort): compare month by month
    a, b = ({r["m"]: r for r in w(q, tz=z)} for z in ("Etc/UTC", "Asia/Ho_Chi_Minh"))
    check("w8. monthly net worth and holdings do not depend on the query timezone", a == b,
          f"{len(a)} months identical" if a == b else "results differ between Etc/UTC and Asia/Ho_Chi_Minh")


def w11_portfolio_identity() -> None:
    r = w("explore { measures { a: assets_value, p: portfolio_value } }")[0]
    check("w11. portfolio value (holdings + cash) = assets value (every non-card account)",
          abs(num(r["a"]) - num(r["p"])) <= 1, f"assets {r['a']} vs portfolio {r['p']}")


def w6_performance() -> None:
    b = book()
    sec = [a for a, t in b.accounts.items() if t["account_type"] == "SECURITIES"]
    days = [b.start + timedelta(i) for i in range((b.as_of - b.start).days + 1)]
    value = {d: sum(b.account_value(a, d) for a in sec) for d in days}
    flow = defaultdict(float)
    for a in b.acts:
        if a["account_id"] in sec and not truthy(a["is_opening"]):
            flow[a["d"]] += {"DEPOSIT": 1, "WITHDRAWAL": -1}.get(a["activity_type"], 0) * num(a["amount_minor"])
    ret = {}
    for i, d in enumerate(days):
        prev = value[days[i - 1]] if i else 0.0
        ret[d] = (value[d] - flow[d]) / prev - 1 if prev > 0 else 0.0
    bench = {d: b.price("VNINDEX", d) for d in days}

    def ref(a: date, z: date) -> dict:
        win = [d for d in days if a <= d <= z]
        idx, peak, dd, growth = 1.0, 1.0, 0.0, 1.0
        for d in win:
            idx *= 1 + ret[d]
            peak = max(peak, idx)
            dd = min(dd, idx / peak - 1)
            growth *= (bench[d] / bench[d - timedelta(days=1)]) if d != b.start else 1.0
        trading = [ret[d] for d in win if d.weekday() < 5]
        return {"twr": idx - 1, "dd": dd, "bench": growth - 1,
                "vol": statistics.stdev(trading) * math.sqrt(250) if len(trading) > 1 else None}

    bad = []
    down = next(d for d in days[::-1][20:] if ret[d] < -0.002)
    for a, z in ((b.start, b.as_of), (b.as_of - timedelta(days=90), b.as_of), (down, down), (down, b.as_of)):
        g = w(f"""explore {{ measures {{ twr: twr, dd: max_drawdown, bench: benchmark_return, vol: volatility }}
                  {between(a, z)} }}""")[0]
        r = ref(a, z)
        for k in ("twr", "dd", "bench", "vol"):
            if r[k] is not None and abs(num(g[k]) - r[k]) > 1e-6:
                bad.append(f"{a}..{z} {k} {g[k]} vs {r[k]:.8f}")
    check("w6. TWR, max drawdown, VN-Index return and volatility = Python chain-linking of daily values",
          not bad, "; ".join(bad[:4]) or f"ALL twr {ref(b.start, b.as_of)['twr']:.2%}")


def w10_spending_tab() -> None:
    r = aql("explore { measures { n: untagged_spend_lines, net: cash_flow_net, i: income, s: spend } }",
            "personal_finance")[0]
    ref = num(sql("""SELECT (SELECT count(*) FROM card_transactions_tagged WHERE amount_minor > 0 AND category IS NULL)
                          + (SELECT count(*) FROM account_movements_resolved WHERE is_spend AND category IS NULL) AS n""")[0]["n"])
    ok = num(r["n"]) == ref and abs(num(r["net"]) - (num(r["i"]) - num(r["s"]))) < 1
    check("w10. Spending tab: uncategorized spend lines = SQL count; net = income − spend", ok,
          f"untagged {r['n']} vs {ref:.0f}; net {r['net']}")


def w12_by_account() -> None:
    b = book()
    qty, cost, _ = b.positions(b.as_of)
    got = {r["a"]: r for r in w("""explore { dimensions { a: dim_accounts.account_id }
      measures { h: account_holdings, c: account_book_cost, p: portfolio_value, n: account_holdings_count } }""")}
    bad = []
    for acc, t in b.accounts.items():
        if t["account_type"] == "CREDIT_CARD":
            continue
        h = sum(n * b.price(s, b.as_of) for (x, s), n in qty.items() if x == acc)
        want = {"h": h, "c": sum(cost[(x, s)] for (x, s), n in qty.items() if x == acc and n > 0),
                "p": b.account_value(acc, b.as_of), "n": sum(1 for (x, _), n in qty.items() if x == acc and n > 0)}
        g = got.get(acc, {})
        bad += [f"{acc}.{k} {g.get(k)} vs {v:,.0f}" for k, v in want.items() if abs(num(g.get(k)) - v) > 1]
    check("w12. holdings, book cost, open positions and portfolio value broken down by account = replay", not bad,
          "; ".join(bad[:4]) or ", ".join(f"{a} ₫{num(r['h']):,.0f}" for a, r in sorted(got.items()) if num(r["h"])))


def w13_tcb_debt() -> None:
    b = book()
    stmts = [(day(r["e"]), num(r["o"])) for r in sql("""SELECT period_end AS e, outstanding_balance_minor AS o
                                                         FROM statements WHERE bank = 'TCB' ORDER BY period_end""")]
    rows = [(day(r["d"]), num(r["a"])) for r in sql("""SELECT txn_date AS d, amount_minor AS a FROM card_transactions_tagged
                                                        WHERE bank = 'TCB' AND description NOT ILIKE 'THANH TOAN NO THE%'""")]
    paid = [(day(r["d"]), num(r["a"])) for r in sql("""SELECT CAST(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) AS d,
                                                              amount_minor AS a FROM account_movements_resolved
                                                       WHERE flow = 'settlement' AND direction = 'D'""")]

    def owed(d: date) -> float:
        """The last statement's outstanding, plus new card rows, minus bill payments made since it closed."""
        closed = [(e, o) for e, o in stmts if e <= d]
        e0, o0 = closed[-1] if closed else (date.min, 0.0)
        return o0 + sum(a for x, a in rows if e0 < x <= d) - sum(a for x, a in paid if e0 < x <= d)

    got = {day(r["d"]): num(r["v"]) for r in w(f"""explore {{ dimensions {{ d: dim_dates.date_key }}
      measures {{ v: account_value }}
      filters {{ dim_dates.date_key matches @({b.start.isoformat()} - {b.as_of.isoformat()}), dim_accounts.account_id == 'credit' }} }}""")}
    days = [b.start + timedelta(i) for i in range((b.as_of - b.start).days + 1)]
    bad = [f"{d} {got.get(d)} vs {-owed(d):,.0f}" for d in days if abs(got.get(d, 0.0) + owed(d)) > 1]
    check("w13. TCB Visa debt every day = last statement's outstanding + new rows − bill payments since (no double count)",
          not bad, "; ".join(bad[:4]) or f"{len(days)} days, as-of owed ₫{owed(b.as_of):,.0f}")


def w14_income_running_total() -> None:
    rows = w("""explore { dimensions { m: dim_dates.date_key | month() }
      measures { i: investment_income, cum: investment_income | running_total(dim_dates.date_key) } sorts { m asc } }""")
    ref, run, bad = defaultdict(float), 0.0, []
    for r in sql("""SELECT strftime(CAST(activity_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE), '%Y-%m') AS m, sum(amount_minor) AS a
                    FROM activities WHERE activity_type IN ('DIVIDEND', 'INTEREST') GROUP BY 1"""):
        ref[r["m"]] = num(r["a"])
    for r in rows:
        m = str(r["m"])[:7]
        run += ref.get(m, 0.0)
        if abs(num(r["cum"]) - run) > 0.5:
            bad.append(f"{m} cum {r['cum']} vs {run:,.0f}")
    check("w14. investment income's running total by month = cumulative DIVIDEND + INTEREST activities", not bad,
          "; ".join(bad[:4]) or f"{len(rows)} months, ends at ₫{run:,.0f}")


def w15_projection() -> None:
    """Forecast's straight line: pace = change / tracked days x 30.4375, projected = net worth + pace x months."""
    b = book()
    bad = []
    # the app's 1Y pace window (WF.changeRange('1Y'): from the same day a year ago), so the Forecast hero's own p1 is tested
    one_year = date(b.as_of.year - 1, b.as_of.month, min(b.as_of.day, 28 if b.as_of.month == 2 else b.as_of.day))
    for a, z in ((b.start, b.as_of), (one_year if one_year > b.start else b.start, b.as_of)):
        r = w(f"""explore {{ measures {{ nw: net_worth, ch: net_worth_change, pace: net_worth_monthly_pace,
                  p1: net_worth_projected_1y, p3: net_worth_projected_3y, p5: net_worth_projected_5y, p10: net_worth_projected_10y }} {between(a, z)} }}""")[0]
        days = (z - a).days + 1
        pace = (b.net_worth(z) - b.net_worth(a)) / days * 30.4375
        if abs(num(r["pace"]) - pace) > 2:
            bad.append(f"{a}..{z} pace {r['pace']} vs replay {pace:,.0f}")
        for k, months in (("p1", 12), ("p3", 36), ("p5", 60), ("p10", 120)):
            want = b.net_worth(z) + pace * months
            if abs(num(r[k]) - want) > 2 * months:
                bad.append(f"{a}..{z} {k} {r[k]} vs replay {want:,.0f}")
    check("w15. monthly pace = change / tracked days x 30.4375 and projected 1/3/5/10y = net worth + pace x months (ALL, last 12 months)",
          not bad, "; ".join(bad[:3]) or "2 windows x 5 numbers")


CHECKS = [w1_holdings, w2_cash, w3_accounts, w4_curve, w5_networth, w6_performance, w7_income, w8_timezone, w9_activities, w10_spending_tab, w11_portfolio_identity, w12_by_account, w13_tcb_debt, w14_income_running_total, w15_projection]


def main() -> None:
    print("wealth checks")
    for c in CHECKS:
        try:
            c()
        except Exception as e:  # a crash is a failure, not a skip
            check(c.__name__, False, f"{type(e).__name__}: {str(e)[:600]}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"RESULT: {'PASS' if not failed else 'FAIL'} ({len(results) - len(failed)}/{len(results)})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
