"""The synthetic investment layer: Wealthfolio-shaped accounts, assets, quotes and activities.

    import invest
    q = invest.quotes(start, end)        # {symbol: {date: close}}, business days only
    rows = invest.build(gen, linked)     # {"accounts": [...], "assets": [...], "quotes": [...], "activities": [...]}

Every value is invented. Prices are seeded random walks from persona.ASSETS (plausible VN
levels, no real series). invest.py has its own RNG seeds, so the cash ledger's streams are
untouched by anything here.
"""
from __future__ import annotations

import math
import random
from datetime import date, datetime, time, timedelta, timezone

import persona as P

VN = timezone(timedelta(hours=7))


def at(d: date, h: int, m: int = 0) -> datetime:
    return datetime.combine(d, time(h, m), VN)


def next_bday(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    last = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28, 31, 30, 31, 30,
            31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, last))


def price_on(series: dict[date, float], d: date) -> float:
    """The last close on or before d: weekends carry Friday's close."""
    first = min(series)
    while d not in series:
        if d < first:
            raise KeyError(f"no quote on or before {d}")
        d -= timedelta(days=1)
    return series[d]


def quotes(start: date, end: date) -> dict[str, dict[date, float]]:
    rng = random.Random(P.SEED + 11)
    d0 = start - timedelta(days=14)
    days = [d0 + timedelta(i) for i in range((end - d0).days + 1)]
    days = [d for d in days if d.weekday() < 5]
    dt = 1 / 250
    out: dict[str, dict[date, float]] = {}
    for sym, a in P.ASSETS.items():
        p, series = float(a["start"]), {}
        for d in days:
            series[d] = round(round(p / a["tick"]) * a["tick"], 2)
            p *= math.exp((a["drift"] - a["vol"] ** 2 / 2) * dt + a["vol"] * math.sqrt(dt) * rng.gauss(0, 1))
        out[sym] = series
    return out


def asset_rows() -> list[dict]:
    return [{"symbol": s, "name": a["name"], "asset_class": a["asset_class"], "asset_sub_class": a["sub_class"],
             "currency": "VND", "sector": a["sector"], "country": a["country"]} for s, a in P.ASSETS.items()]


def quote_rows(q: dict[str, dict[date, float]]) -> list[dict]:
    return [{"symbol": s, "quote_date": d, "close": c, "currency": "VND", "source": "synthetic"}
            for s, series in q.items() for d, c in sorted(series.items())]


def build(gen, linked: list) -> dict[str, list[dict]]:
    """Accounts, assets, quotes and activities. `linked` = [(bank_movements.id, Move with .meta)]."""
    import heapq
    from collections import defaultdict

    rng = random.Random(P.SEED + 12)
    q, start, end = gen.q, gen.start, gen.end
    t0 = at(start, 9)
    acts: list[dict] = []

    def add(account, kind, ts, amount, *, symbol=None, qty=None, price=None, fee=0, currency="VND",
            comment=None, movement=None, opening=False):
        acts.append({"account_id": account, "symbol": symbol, "activity_type": kind, "activity_date": ts,
                     "quantity": qty, "unit_price": price, "amount_minor": int(amount), "fee_minor": int(fee),
                     "currency": currency, "comment": comment, "source_movement_id": movement,
                     "is_opening": opening})

    # the state on the first data day
    hold: dict[tuple[str, str], float] = defaultdict(float)
    for acct, sym, qty, cost in P.OPENING_HOLDINGS:
        add(acct, "ADD_HOLDING", t0, qty * cost, symbol=sym, qty=qty, price=cost, comment="Số dư đầu kỳ",
            opening=True)
        hold[(acct, sym)] += qty
    add("ssi", "DEPOSIT", t0, P.OPENING_SSI_CASH, comment="Tiền mặt đầu kỳ", opening=True)
    add("usd", "DEPOSIT", t0, P.OPENING_USD_CENTS, currency="USD", comment="USD tiền mặt đầu kỳ", opening=True)
    td = P.OPENING_TD
    principal, opened = td["principal"], start - timedelta(days=td["opened_days_before"])
    add("deposits", "DEPOSIT", t0, principal, comment="Sổ tiết kiệm 12 tháng (tự gia hạn)", opening=True)
    k = 1
    while (anniv := add_months(opened, 12 * k)) <= end:
        if anniv > start:
            interest = int(principal * td["rate"] // 1000 * 1000)
            add("deposits", "INTEREST", at(anniv, 8), interest, comment="Lãi sổ 12 tháng, gửi tiếp")
            principal += interest
        k += 1

    # flows from the ledger, plus the SSI account's own life (buys, dividends, the sale)
    events: list[tuple] = []
    seq = 0

    def push(ts, kind, payload):
        nonlocal seq
        seq += 1
        heapq.heappush(events, (ts, seq, kind, payload))

    for mid, e in linked:
        m = e.meta
        if m["kind"] == "ssi_deposit":
            add("ssi", "DEPOSIT", e.ts, e.amount, movement=mid, comment="Nạp tiền từ TCB")
            push(e.ts, "ssi_cash", e.amount)
        elif m["kind"] == "gold_buy":
            add("gold", "DEPOSIT", e.ts, e.amount, movement=mid, comment="Chuyển tiền mua vàng")
            add("gold", "BUY", e.ts + timedelta(minutes=2), m["qty"] * m["price"], symbol="SJC", qty=m["qty"],
                price=m["price"], comment=f"Mua {m['qty']} chỉ SJC")
            hold[("gold", "SJC")] += m["qty"]
        elif m["kind"] == "td_open":
            add("deposits", "DEPOSIT", e.ts, m["principal"], movement=mid, comment=e.description)
        elif m["kind"] == "td_close":
            add("deposits", "INTEREST", e.ts - timedelta(minutes=1), m["interest"], movement=mid,
                comment="Lãi tiết kiệm khi tất toán")
            add("deposits", "WITHDRAWAL", e.ts, m["principal"] + m["interest"], movement=mid, comment=e.description)

    for sym, month, dps in P.DIVIDENDS:
        for y in range(start.year, end.year + 1):
            ex = next_bday(date(y, month, 15))
            if start < ex <= end:
                push(at(ex, 9), "ex_div", (sym, dps, ex))
    for sym, months_before in P.SELLS:
        d = next_bday(add_months(end.replace(day=1), -months_before))
        if start < d <= end:
            push(at(d, 10, 30), "sell", sym)

    cash, sold = float(P.OPENING_SSI_CASH), set()
    while events:
        ts, _, kind, payload = heapq.heappop(events)
        if kind == "ssi_cash":
            cash += payload
            d = next_bday(ts.date() + timedelta(days=rng.randint(1, 3)))
            if d <= end:
                push(at(d, 10, rng.randrange(15, 59)), "buy", None)
        elif kind == "buy":
            budget = cash * 0.97
            names = [s for s in P.BUY_WEIGHTS if s not in sold]
            picks = []
            for _ in range(1 if budget < 15_000_000 else 2):
                if not names:
                    break
                s = rng.choices(names, [P.BUY_WEIGHTS[x] for x in names])[0]
                picks.append(s)
                names.remove(s)
            for s in picks:
                px = price_on(q[s], ts.date())
                lot = P.LOTS.get(s, 100)
                qty = int(budget / len(picks) // (px * (1 + P.BROKER_FEE)) // lot * lot)
                if qty <= 0:
                    continue
                gross = int(qty * px)
                fee = round(gross * P.BROKER_FEE)
                add("ssi", "BUY", ts, gross, symbol=s, qty=qty, price=px, fee=fee, comment=f"Mua {qty:,} {s}")
                cash -= gross + fee
                hold[("ssi", s)] += qty
        elif kind == "ex_div":
            sym, dps, ex = payload
            qty = hold[("ssi", sym)]
            pay = next_bday(ex + timedelta(days=14))
            if qty > 0 and pay <= end:
                push(at(pay, 9, 5), "div_pay", (sym, int(round(qty * dps * (1 - P.DIVIDEND_TAX))), dps))
        elif kind == "div_pay":
            sym, net, dps = payload
            add("ssi", "DIVIDEND", ts, net, symbol=sym, comment=f"Cổ tức tiền mặt {sym} {dps:,}đ/cp")
            cash += net
        elif kind == "sell":
            qty = hold[("ssi", payload)]
            if qty > 0:
                px = price_on(q[payload], ts.date())
                gross = int(qty * px)
                fee = round(gross * P.BROKER_FEE)
                add("ssi", "SELL", ts, gross, symbol=payload, qty=qty, price=px, fee=fee,
                    comment=f"Bán toàn bộ {payload}")
                cash += gross - fee
                hold[("ssi", payload)] = 0
                sold.add(payload)

    acts.sort(key=lambda a: (a["activity_date"], a["account_id"], a["activity_type"]))
    accounts = [{"id": i, "name": n, "account_type": t, "account_group": g, "currency": c, "src": s,
                 "is_active": True, "created_at": t0 - timedelta(days=400)} for i, n, t, g, c, s in P.ACCOUNTS]
    return {"accounts": accounts, "assets": asset_rows(), "quotes": quote_rows(q),
            "activities": [{"id": f"act-{i:05d}", **a} for i, a in enumerate(acts, 1)]}
