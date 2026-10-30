"""Deterministic generator for the synthetic cspipeline replica. Stdlib only.

    from generate import generate
    tables = generate(end=date(2026, 10, 14))   # {table name: [row dict, ...]}

Same seed + same end date -> byte-identical output. The SHAPE comes from
db/private/calibration.json when present (dimensionless ratios measured on the
real data, see db/private/calibrate.py) and from persona.DEFAULT_SHAPE when
not; every share is jittered +-15% so the copy never mirrors the source mix.
The LEVEL comes from persona.SALARY_BASE. No real row, string or id is read.

The simulation is a cash ledger, so the books agree with each other:
card cycles -> statements -> card payments from the debit account; Timo tops
itself up from TCB when it runs low; savings and investments come out of the
month's real surplus; MAX VIB points follow the 8% rate rung.
"""
from __future__ import annotations

import calendar
import hashlib
import heapq
import itertools
import json
import math
import random
import string
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import persona as P
import invest

VN = timezone(timedelta(hours=7))
HERE = Path(__file__).resolve().parent
CAL_PATH = HERE / "private" / "calibration.json"
SAL = P.SALARY_BASE


# --------------------------------------------------------------------------- helpers

def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def months(start: date, end: date):
    d = start.replace(day=1)
    while d <= end:
        yield d
        d = add_months(d, 1)


def weighted(rng: random.Random, weights: dict):
    keys = list(weights)
    return rng.choices(keys, [weights[k] for k in keys])[0]


def lognormal(rng: random.Random, median: float, sigma: float) -> float:
    return median * math.exp(rng.gauss(0, sigma))


def round_amount(rng: random.Random, x: float, p_round_1000: float, floor: int = 5_000) -> int:
    x = max(x, floor)
    step = 1000 if rng.random() < p_round_1000 else 100
    return int(round(x / step) * step)


def code(rng: random.Random, n: int = 6) -> str:
    return "".join(rng.choices(string.ascii_uppercase + string.digits, k=n))


def pick_day(rng: random.Random, d0: date, d1: date, weekday_w: list[float]) -> date:
    days = [d0 + timedelta(i) for i in range((d1 - d0).days + 1)]
    return rng.choices(days, [weekday_w[d.weekday()] + 1e-9 for d in days])[0]


def pick_ts(rng: random.Random, d: date, hour_w: list[float], seconds: bool = False) -> datetime:
    h = rng.choices(range(24), [w + 1e-9 for w in hour_w])[0]
    return datetime.combine(d, time(h, rng.randrange(60), rng.randrange(60) if seconds else 0), VN)


def at(d: date, h: int, m: int = 0, s: int = 0) -> datetime:
    return datetime.combine(d, time(h, m, s), VN)


def sha(payload: str) -> str:
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def money(n: int) -> str:
    return f"{n:,}"


class Ids:
    """Unique fake Gmail ids / chat.db guids."""

    def __init__(self, rng: random.Random):
        self.rng, self.seen = rng, set()

    def gmail(self) -> str:
        while (v := f"{self.rng.getrandbits(64):016x}") in self.seen:
            pass
        self.seen.add(v)
        return v

    def guid(self) -> str:
        while (v := str(uuid.UUID(int=self.rng.getrandbits(128), version=4)).upper()) in self.seen:
            pass
        self.seen.add(v)
        return v


# --------------------------------------------------------------------------- shape

def _norm(d: dict) -> dict:
    s = sum(d.values()) or 1.0
    return {k: v / s for k, v in d.items()}


class Shape:
    """Calibrated (or default) shape, jittered once with its own seed."""

    def __init__(self, cal: dict | None, jit: random.Random):
        self.calibrated = cal is not None
        cal = cal or {}
        d = P.DEFAULT_SHAPE
        j = lambda x: x * jit.uniform(0.85, 1.15)  # noqa: E731

        rows = cal.get("spend_rows_per_month", {})
        self.rows = {s: (j(rows[s]["mean"]) if s in rows else j(m), (rows.get(s, {}).get("cv") or cv))
                     for s, (m, cv) in d["rows"].items()}

        mix = cal.get("category_mix", {}).get("credit", {})
        card_mix, card_amount, p_round = {}, {}, {}
        for tag, default_share in d["card_mix"].items():
            c = mix.get(tag)
            enough = c is not None and c["n"] >= 8
            card_mix[tag] = j(c["count_share"] if enough else default_share)
            med, sig = (c["median"], c["log_sigma"]) if enough else d["card_amount"][tag]
            card_amount[tag] = (j(med), min(max(sig or 0.6, 0.35), 1.2))
            p_round[tag] = (c["round_1000"] if enough else 0.3)
        self.card_mix = _norm(card_mix)
        self.card_amount = card_amount
        self.p_round = p_round
        sub = mix.get("Subscription", {}).get("count_share", 0.15)
        self.sub_share = min(max(sub, 0.05), 0.25)

        wd, hr = cal.get("weekday_share", {}), cal.get("hour_share", {})
        self.weekday = {s: [j(x) for x in wd.get(s, d["weekday"])] for s in d["rows"]}
        self.hour = {s: [j(x) for x in hr.get(s, hr.get("vib_credit", d["hour"]))] for s in d["rows"]}

        extras = cal.get("card_extras", {})
        self.refund_rate = j(extras.get("credit", {}).get("refund_rate") or 0.02)
        self.reversed_rate = j(extras.get("vib_credit", {}).get("reversed_rate") or 0.05)

        sal = cal.get("salary", {})
        self.salary_day = int(round(sal.get("day_of_month_median") or 25))

        flows = cal.get("debit_flows", {})
        tcb, timo = flows.get("tcb_debit", {}), flows.get("timo", {})
        self.invest_median = j(tcb.get("investment", {}).get("median") or 0.39)
        self.savings_median = j(tcb.get("savings", {}).get("median") or 1.9)
        self.pot_in = (j(timo.get("internal", {}).get("per_month") or 2.5),
                       j(timo.get("internal", {}).get("median") or 0.056))
        credits = cal.get("credit_buckets", {})
        self.pot_out = (j(credits.get("timo", {}).get("pot_withdraw", {}).get("per_month") or 2.9),
                        j(credits.get("timo", {}).get("pot_withdraw", {}).get("median") or 0.083))
        other_c = credits.get("tcb_debit", {}).get("other", {})
        self.friend_credits = (max(0.5, j((other_c.get("per_month") or 4.0) - 2.0)),
                               j(other_c.get("median") or 0.007))
        timo_other = timo.get("other", {})
        self.timo_median = j(timo_other.get("median") or P.TIMO_MEDIAN_RATIO)

        budgets = {(b["scope_type"], b["scope_value"]): b["limit"] for b in cal.get("budgets", [])}
        self.shopee_budget = budgets.get(("category", "Shopee"), 0.19)


def load_calibration() -> dict | None:
    return json.loads(CAL_PATH.read_text()) if CAL_PATH.exists() else None


# --------------------------------------------------------------------------- models

@dataclass
class Card:
    card: str                    # 'tcb' | 'vib'
    d: date
    description: str
    amount: int                  # native minor units (VND, or USD cents on VIB)
    currency: str
    vnd: int
    kind: str                    # spend | refund | payment | fee | reward
    merchant: str | None = None
    tag: str | None = None
    legacy: str = "Other"
    ts: datetime | None = None
    tag_known: bool = False
    cat_source: str = "auto"
    reversed: bool = False
    note: str | None = None
    source: str | None = None
    external_id: str | None = None
    fx_rate: float | None = None
    statement_key: tuple | None = None


@dataclass(order=True)
class Move:
    ts: datetime
    seq: int
    source: str = field(compare=False)
    direction: str = field(compare=False)
    amount: int = field(compare=False)
    description: str = field(compare=False)
    kind: str = field(compare=False)            # spend | transfer | income | marker
    tag: str | None = field(default=None, compare=False)
    flow: str | None = field(default=None, compare=False)       # manual annotation flow
    category: str | None = field(default=None, compare=False)   # annotation category
    cat_source: str = field(default="auto", compare=False)
    note: str | None = field(default=None, compare=False)
    pot: str | None = field(default=None, compare=False)
    balance: int | None = field(default=None, compare=False)
    meta: dict | None = field(default=None, compare=False)      # investment layer link, see invest.py


# --------------------------------------------------------------------------- generator

class Gen:
    def __init__(self, end: date):
        self.rng = random.Random(P.SEED)
        self.ids = Ids(random.Random(P.SEED + 2))
        self.shape = Shape(load_calibration(), random.Random(P.SEED + 1))
        self.end = end
        self.end_ts = at(end, 23, 59, 59)
        self.start = add_months(end.replace(day=1), -P.MONTHS_OF_HISTORY)
        self.vib_open = add_months(end.replace(day=1), -P.VIB_OPEN_MONTHS_BEFORE_END).replace(day=16)
        self.seq = itertools.count()
        self.fx = self._fx_series()
        self.q = invest.quotes(self.start, self.end)   # own RNG: the cash streams are untouched
        self.cards: list[Card] = []
        self.timo: list[Move] = []
        self.tcb: list[Move] = []
        self.tcb_fixed: list[Move] = []

    # ---- reference data
    def _fx_series(self) -> dict[date, float]:
        rng = random.Random(P.SEED + 3)
        d, r, out = self.start - timedelta(days=10), 25_350.0, {}
        days = (self.end - d).days + 1
        drift = (26_300 - r) / days
        for _ in range(days):
            r += drift + rng.gauss(0, 22)
            out[d] = round(r, 0)
            d += timedelta(days=1)
        return out

    def _season(self, m: date) -> float:
        return {1: 1.15, 2: 1.1, 11: 1.12, 12: 1.15}.get(m.month, 1.0)

    def _card_src(self, card: str) -> str:
        return "credit" if card == "tcb" else "vib_credit"

    # ---- cards
    def _describe(self, tmpl: str, card: str) -> str:
        rng = self.rng
        desc = tmpl.format(ref=code(rng), br=rng.choice(P.BRANCHES), n=rng.randint(100, 999))
        if card == "tcb" and not desc.endswith("USA"):
            desc += " HO CHI MINH VNM"
        return desc

    def _cat_source(self, tag: str) -> str:
        if tag in ("Mèo", "Tiết kiệm", "Đầu tư"):
            return "user"
        return "auto" if self.rng.random() < 0.85 else "user"

    def card_spend(self) -> None:
        rng, sh = self.rng, self.shape
        for m in months(self.start, self.end):
            m1 = min(month_end(m), self.end)
            frac = ((m1 - m).days + 1) / calendar.monthrange(m.year, m.month)[1]
            mean, cv = sh.rows["credit"]
            n = round(mean * (1 - sh.sub_share) * max(0.35, rng.gauss(1, cv * 0.6)) * frac * self._season(m))
            for _ in range(n):
                tag = weighted(rng, sh.card_mix)
                entries = P.CATALOG[tag]
                merchant, tmpl, _, scale, legacy = rng.choices(entries, [e[2] for e in entries])[0]
                med, sig = sh.card_amount[tag]
                base = med * scale * SAL
                amount = round_amount(rng, min(lognormal(rng, base, sig), base * 12), sh.p_round[tag], 10_000)
                d = pick_day(rng, m, m1, sh.weekday["credit"])
                vib = d >= self.vib_open and rng.random() < P.VIB_TAGS.get(tag, 0.0)
                card = "vib" if vib else "tcb"
                if vib:
                    d = pick_day(rng, max(m, self.vib_open), m1, sh.weekday["vib_credit"])
                c = Card(card=card, d=d, description=self._describe(tmpl, card), amount=amount,
                         currency="VND", vnd=amount, kind="spend", merchant=merchant, tag=tag,
                         legacy=legacy, tag_known=tag == "Mèo" or rng.random() < 0.92, cat_source=self._cat_source(tag))
                if vib:
                    c.ts = pick_ts(rng, d, sh.hour["vib_credit"])
                    c.reversed = rng.random() < sh.reversed_rate * (1.4 if tag in ("Shopee", "Đi lại") else 0.4)
                self.cards.append(c)

    def subscriptions(self) -> None:
        rng = self.rng
        for i, m in enumerate(months(self.start, self.end)):
            for merchant, desc, day, price, ccy, card, tag, offset in P.SUBSCRIPTIONS:
                if i < offset:
                    continue
                d = m.replace(day=min(day + rng.choice((0, 0, 0, 1)), month_end(m).day))
                if d > self.end:
                    continue
                if card == "vib" and d < self.vib_open:
                    card = "tcb"
                if merchant == "NETFLIX" and i >= P.NETFLIX_PRICE_RISE[0]:
                    price = P.NETFLIX_PRICE_RISE[1]
                base = dict(merchant=merchant, tag=tag, legacy=P.LEGACY[tag], tag_known=True, cat_source="auto")
                if ccy == "USD":
                    rate = self.fx[d]
                    vnd = int(round(price * rate))
                    if card == "tcb":
                        self.cards.append(Card(card="tcb", d=d, description=f"[{price:.2f} USD] {desc}",
                                               amount=vnd, currency="VND", vnd=vnd, kind="spend", **base))
                        fee = int(round(vnd * 0.011))
                        self.cards.append(Card(card="tcb", d=d, description=f"PHI GIAO DICH NGOAI TE {merchant}",
                                               amount=fee, currency="VND", vnd=fee, kind="fee", merchant=merchant,
                                               tag="Khác", legacy="Other", tag_known=rng.random() < 0.9))
                    else:
                        self.cards.append(Card(card="vib", d=d, ts=pick_ts(rng, d, self.shape.hour["vib_credit"]),
                                               description=desc, amount=int(round(price * 100)), currency="USD",
                                               vnd=vnd, fx_rate=rate, kind="spend", **base))
                else:
                    c = Card(card=card, d=d, description=self._describe(desc, card) if card == "tcb" else desc,
                             amount=price, currency="VND", vnd=price, kind="spend", **base)
                    if card == "vib":
                        c.ts = pick_ts(rng, d, self.shape.hour["vib_credit"])
                    self.cards.append(c)
            # small app-store charges
            merchant, desc, tag = P.APPLE_SMALL
            for _ in range(rng.choice((1, 2, 2, 3))):
                d = pick_day(rng, m, min(month_end(m), self.end), self.shape.weekday["credit"])
                amount = rng.choice((19_000, 25_000, 29_000, 49_000, 99_000))
                self.cards.append(Card(card="tcb", d=d, description=f"{desc} HO CHI MINH VNM", amount=amount,
                                       currency="VND", vnd=amount, kind="spend", merchant=merchant, tag=tag,
                                       legacy=P.LEGACY[tag], tag_known=rng.random() < 0.92))

    def refunds(self) -> None:
        rng = self.rng
        pool = [c for c in self.cards if c.card == "tcb" and c.kind == "spend"
                and c.tag in ("Shopee", "Ăn uống", "Khác")]
        p = self.shape.refund_rate * len([c for c in self.cards if c.card == "tcb"]) / max(len(pool), 1)
        for c in pool:
            if rng.random() >= p:
                continue
            d = c.d + timedelta(days=rng.randint(3, 14))
            if d > self.end:
                continue
            amount = c.vnd if rng.random() < 0.7 else int(round(c.vnd * 0.5 / 100) * 100)
            self.cards.append(Card(card="tcb", d=d, description=f"TRA LAI HANG HOA {c.merchant} {code(rng)}",
                                   amount=-amount, currency="VND", vnd=-amount, kind="refund",
                                   merchant=c.merchant, tag=c.tag, legacy=c.legacy, tag_known=True,
                                   cat_source="auto"))

    # ---- statements, payments, cycles
    def tcb_statements(self) -> None:
        rng = self.rng
        closes = [m.replace(day=P.TCB_CLOSE_DAY) for m in months(self.start, self.end)
                  if m.replace(day=P.TCB_CLOSE_DAY) <= self.end]
        self.tcb_closes = closes
        last = closes[-1]
        # TCB rows exist only once their PDF statement has arrived.
        self.cards = [c for c in self.cards if not (c.card == "tcb" and c.d > last)]
        self.tcb_payments: list[tuple[date, int, int]] = []  # (pay date, from debit, from timo)
        self.statements: list[dict] = []
        prev_close, outstanding = None, 0
        for close in closes:
            # The previous statement's payment rows were appended last iteration and
            # fall in this cycle, so `outstanding` nets them here.
            in_cycle = [c for c in self.cards if c.card == "tcb" and c.d <= close
                        and (prev_close is None or c.d > prev_close)]
            for c in in_cycle:
                c.statement_key = ("TCB", close)
            outstanding += sum(c.vnd for c in in_cycle)
            self.statements.append({"bank": "TCB", "close": close, "outstanding": outstanding,
                                    "period_start": min((c.d for c in in_cycle), default=close)})
            # Pay this statement in full before the due date, in the next cycle.
            pay = close + timedelta(days=rng.randint(17, 23))
            if pay <= self.end and outstanding > 0:
                timo_part = 0
                if rng.random() < 0.25:
                    timo_part = min(outstanding, rng.choice((2, 3, 4, 5)) * 1_000_000)
                debit_part = outstanding - timo_part
                timo_day = pay - timedelta(days=rng.randint(1, 4))
                self.tcb_payments.append((pay, debit_part, timo_part, timo_day))
                for amt, desc, dd in ((debit_part, "THANH TOAN NO THE TIN DUNG", pay),
                                      (timo_part, "THANH TOAN NO THE - CHUYEN KHOAN TU TIMO", timo_day)):
                    if amt > 0 and dd <= last:
                        self.cards.append(Card(card="tcb", d=dd, description=desc, amount=-amt, currency="VND",
                                               vnd=-amt, kind="payment"))
            prev_close = close

    def vib_cycles(self) -> None:
        rng = self.rng
        self.vib_repayments: list[tuple[date, int]] = []
        close = add_months(self.vib_open, 1).replace(day=P.VIB_CLOSE_DAY)
        self.vib_cycle_summary = []
        while close <= self.end:
            start = add_months(close, -1) + timedelta(days=1)
            rows = [c for c in self.cards if c.card == "vib" and c.kind == "spend" and start <= c.d <= close]
            spend = sum(c.vnd for c in rows if not c.reversed)
            points = min(P.VIB_RATE_REWARD, spend * P.VIB_RATE_REWARD // P.VIB_RATE_THRESHOLD)
            rewards_in = sum(-c.vnd for c in self.cards if c.kind == "reward" and start <= c.d <= close)
            self.vib_cycle_summary.append((close, spend, points))
            rd = close + timedelta(days=rng.randint(2, 7))
            if points > 0 and rd <= self.end:
                self.cards.append(Card(card="vib", d=rd, ts=pick_ts(rng, rd, self.shape.hour["vib_credit"]),
                                       description=P.REWARD_DESCRIPTION, amount=-points, currency="VND",
                                       vnd=-points, kind="reward", source="vib_reward"))
            pay = close + timedelta(days=rng.randint(8, 12))
            owed = max(0, spend - rewards_in)
            if pay <= self.end and owed > 0:
                self.vib_repayments.append((pay, owed))
            close = add_months(close, 1)

    # ---- Timo
    def timo_sim(self) -> None:
        rng, sh = self.rng, self.shape
        events: list[Move] = []
        pots = dict(P.POT_OPENING)
        all_pots = P.POTS
        mean, cv = sh.rows["timo"]
        for i, m in enumerate(months(self.start, self.end)):
            m1 = min(month_end(m), self.end)
            frac = ((m1 - m).days + 1) / calendar.monthrange(m.year, m.month)[1]
            for _ in range(round(mean * max(0.3, rng.gauss(1, cv * 0.6)) * frac)):
                tag = weighted(rng, P.TIMO_MIX)
                entries = P.CATALOG[tag]
                merchant = rng.choices(entries, [e[2] for e in entries])[0][0]
                amount = round_amount(rng, min(lognormal(rng, sh.timo_median * SAL, 1.0), 3_000_000), 0.9, 15_000)
                d = pick_day(rng, m, m1, sh.weekday["timo"])
                events.append(Move(pick_ts(rng, d, sh.hour["timo"]), next(self.seq), "timo_email", "D", amount,
                                   f"Thanh toan QR {merchant} - {code(rng, 8)}", "spend", tag=tag,
                                   category=tag if (tag == "Mèo" or rng.random() < 0.85) else None,
                                   cat_source=self._cat_source(tag)))
            n_in = sum(rng.random() < sh.pot_in[0] / 3 for _ in range(3))
            for _ in range(n_in):
                d = m.replace(day=min(rng.choice((1, 2, 3, 26, 27, 28)), m1.day))
                if d > self.end:
                    continue
                pot = rng.choice(all_pots)
                amt = rng.choice((500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000))
                events.append(Move(pick_ts(rng, d, sh.hour["timo"]), next(self.seq), "timo_email", "D", amt,
                                   f"Money Pot - Contribute to {pot}", "transfer", pot=pot))
            n_out = sum(rng.random() < sh.pot_out[0] / 4 for _ in range(4))
            for _ in range(n_out):
                d = pick_day(rng, m, m1, sh.weekday["timo"])
                pot = rng.choice(all_pots)
                amt = int(round(lognormal(rng, sh.pot_out[1] * SAL, 0.6) / 100_000) * 100_000)
                events.append(Move(pick_ts(rng, d, sh.hour["timo"]), next(self.seq), "timo_email", "C", amt,
                                   f"Money Pot - Withdraw from {pot}", "transfer", pot=pot))
            if rng.random() < 0.55:
                d = m.replace(day=min(rng.randint(26, 28), m1.day))
                if d <= self.end:
                    events.append(Move(at(d, rng.randint(19, 22), rng.randrange(60)), next(self.seq),
                                       "timo_email", "C", P.TIMO_TOPUP,
                                       f"{P.PERSONA_NAME} chuyen tien tu TCB", "topup"))
            if i == 5:  # one 3-month term deposit
                d = m.replace(day=10)
                events.append(Move(at(d, 20, 15), next(self.seq), "timo_email", "D", 10_000_000,
                                   "Transfer from Spend to TD 3 thang", "transfer",
                                   meta={"kind": "td_open", "principal": 10_000_000}))
                md = d + timedelta(days=92)
                if md <= self.end:
                    events.append(Move(at(md, 8, 5), next(self.seq), "timo_email", "C", 10_112_000,
                                       "TAT TOAN TIET KIEM 3 thang", "transfer",
                                       meta={"kind": "td_close", "principal": 10_000_000, "interest": 112_000}))
        for _, _, timo_part, timo_day in self.tcb_payments:
            if timo_part > 0:
                events.append(Move(at(timo_day, rng.randint(19, 22), rng.randrange(60)), next(self.seq),
                                   "timo_email", "D", timo_part, f"{P.PERSONA_NAME} tra no credit TCB", "transfer"))

        # Chronological pass: pots stay non-negative, Spend tops up from TCB when short.
        # Emitted rows keep non-decreasing timestamps and get a fresh seq in emit
        # order, so sorting by (ts, seq) replays the running-balance chain exactly.
        heap = list(events)
        heapq.heapify(heap)
        bal, out, last_ts = P.OPENING_TIMO, [], at(self.start, 0)
        while heap:
            e = heapq.heappop(heap)
            if e.ts > self.end_ts:
                continue
            if e.pot and e.direction == "C":
                e.amount = min(e.amount, pots[e.pot] // 100_000 * 100_000)
                if e.amount < 300_000:
                    continue
                pots[e.pot] -= e.amount
            elif e.pot:
                pots[e.pot] += e.amount
            if e.direction == "D" and bal - e.amount < 100_000:
                need = e.amount - bal + 100_000
                t = min(e.ts, max(last_ts, e.ts - timedelta(minutes=rng.randint(4, 40))))
                for _ in range(math.ceil(need / P.TIMO_TOPUP)):
                    top = Move(t, next(self.seq), "timo_email", "C", P.TIMO_TOPUP,
                               f"{P.PERSONA_NAME} chuyen tien tu TCB", "topup")
                    bal += top.amount
                    top.balance = bal
                    out.append(top)
            bal += e.amount if e.direction == "C" else -e.amount
            e.balance = bal
            e.seq = next(self.seq)
            last_ts = e.ts
            out.append(e)
        self.timo = out

    # ---- TCB debit
    def tcb_sim(self) -> None:
        rng, sh = self.rng, self.shape
        ev: list[Move] = []

        def add(ts, direction, amount, desc, kind, **kw):
            if ts <= self.end_ts:
                ev.append(Move(ts, next(self.seq), "tcb_sms", direction, amount, desc, kind, **kw))

        self.paydays = []
        for i, m in enumerate(months(self.start, self.end)):
            m1 = min(month_end(m), self.end)
            for _ in range(sum(rng.random() < sh.friend_credits[0] / 3 for _ in range(3))):
                d = pick_day(rng, m, m1, sh.weekday["tcb_debit"])
                amt = int(round(lognormal(rng, sh.friend_credits[1] * SAL, 0.6) / 10_000) * 10_000) or 50_000
                reason = rng.choice(("an trua", "tien grab", "cafe", "qua sinh nhat", "tien phim"))
                add(pick_ts(rng, d, sh.hour["tcb_debit"], True), "C", amt,
                    f"{rng.choice(P.FRIEND_NAMES)} chuyen tien {reason}", "income")
            # payday
            pd = m.replace(day=min(sh.salary_day, month_end(m).day))
            while pd.weekday() >= 5:
                pd -= timedelta(days=1)
            years = sum(1 for mm in months(self.start, m) if mm.month == 1 and mm != self.start.replace(day=1))
            salary = int(round(SAL * (1 + P.SALARY_RAISE_PCT) ** years / 1000) * 1000)
            add(at(pd, rng.randint(10, 15), rng.randrange(60), rng.randrange(60)), "C", salary,
                f"{P.EMPLOYER} TRA LUONG T{m.month:02d}/{m.year}", "income", category=None)
            if m.month == 1:
                add(at(pd, 16, rng.randrange(60), rng.randrange(60)), "C", int(salary * P.TET_BONUS_MONTHS),
                    f"{P.EMPLOYER} THUONG TET {m.year}", "income")
            if m.month == 7:
                add(at(pd, 16, rng.randrange(60), rng.randrange(60)), "C", int(salary * P.MIDYEAR_BONUS_MONTHS),
                    f"{P.EMPLOYER} THUONG GIUA NAM {m.year}", "income")
            self.paydays.append(pd)
            md = pd + timedelta(days=rng.randint(1, 2))
            add(at(md, rng.randint(8, 21), rng.randrange(60), rng.randrange(60)), "D", P.MOM_AMOUNT,
                f"{P.PERSONA_NAME} chuyen tien gui me", "spend", category="Khác", cat_source="user")
            # bills
            evn = int(round(lognormal(rng, 0.02 * SAL * (1.3 if m.month in (4, 5, 6, 7) else 1.0), 0.15) / 100) * 100)
            add(at(m.replace(day=min(rng.randint(8, 12), m1.day)), rng.randint(9, 21), rng.randrange(60),
                   rng.randrange(60)), "D", evn, f"EVNHCMC THANH TOAN TIEN DIEN PE{rng.randint(10**9, 10**10 - 1)}",
                "spend", tag="Hoá đơn", category="Hoá đơn", cat_source="auto")
            phone = rng.choice((179_000, 199_000, 219_000, 249_000))
            add(at(m.replace(day=min(rng.randint(10, 15), m1.day)), rng.randint(9, 21), rng.randrange(60),
                   rng.randrange(60)), "D", phone, f"VIETTEL TRA SAU {code(rng, 8)}",
                "spend", tag="Hoá đơn", category="Hoá đơn", cat_source="auto")
            for tag, (per_month, med, sig) in P.TCB_DEBIT_SPEND.items():
                if tag == "Hoá đơn":
                    continue
                for _ in range(sum(rng.random() < per_month / 3 for _ in range(3))):
                    entries = P.CATALOG[tag]
                    merchant, tmpl, _, _, _ = rng.choices(entries, [e[2] for e in entries])[0]
                    amt = round_amount(rng, lognormal(rng, med * SAL, sig), 0.95, 50_000)
                    d = pick_day(rng, m, m1, sh.weekday["tcb_debit"])
                    desc = "QR - " + tmpl.format(ref=code(rng), br=rng.choice(P.BRANCHES), n=rng.randint(100, 999))
                    known = rng.random() < 0.85
                    add(pick_ts(rng, d, sh.hour["tcb_debit"], True), "D", amt, desc, "spend", tag=tag,
                        category=tag if known else None, cat_source=self._cat_source(tag))
            if rng.random() < 0.2:  # an untagged self-send to review
                d = pick_day(rng, m, m1, sh.weekday["tcb_debit"])
                add(pick_ts(rng, d, sh.hour["tcb_debit"], True), "D", rng.randint(3, 30) * 100_000,
                    f"{P.PERSONA_NAME} chuyen tien", "spend")
            if i % 9 == 4:
                d = m.replace(day=min(25, m1.day))
                add(at(d, 6, 0, rng.randrange(60)), "C", rng.randint(20, 90) * 1000,
                    "THANH TOAN LAI TAI KHOAN THANH TOAN", "income")
            # the discretionary decision runs three days after payday
            add(at(pd + timedelta(days=3), 21, 30), "D", 0, "", "marker")

        for pay, debit_part, _, _ in self.tcb_payments:
            if debit_part > 0:
                add(at(pay, rng.randint(8, 12), rng.randrange(60), rng.randrange(60)), "D", debit_part,
                    "THANH TOAN NO THE TIN DUNG", "transfer")
        for pay, owed in self.vib_repayments:
            add(at(pay, rng.randint(8, 12), rng.randrange(60), rng.randrange(60)), "D", owed,
                f"{P.PERSONA_NAME} TT the tin dung VIB {P.VIB_CARD_LAST4}", "transfer", flow="othercard",
                cat_source="user")
        for t in self.timo:
            if t.kind == "topup":
                add(t.ts - timedelta(seconds=rng.randint(20, 90)), "D", P.TIMO_TOPUP,
                    f"{P.PERSONA_NAME} chuyen tien sang Timo", "transfer")

        heap = list(ev)
        heapq.heapify(heap)
        bal, out, deposit_until, invest_toggle = P.OPENING_TCB, [], None, 0
        while heap:
            e = heapq.heappop(heap)
            if e.kind == "marker":
                upcoming = sum(x.amount for x in heap if x.direction == "D" and x.kind != "marker"
                               and x.ts <= e.ts + timedelta(days=35))
                free = bal - upcoming - int(0.8 * SAL)
                d = e.ts.date()
                if (deposit_until is None or d > deposit_until) and free > 1.0 * SAL:
                    amt = min(int(free * 0.8) // 10_000_000 * 10_000_000, int(sh.savings_median * SAL) // 10_000_000 * 10_000_000)
                    if amt >= 30_000_000:
                        heapq.heappush(heap, Move(e.ts, next(self.seq), "tcb_sms", "D", amt,
                                                  f"MO TIET KIEM ONLINE KY HAN 6 THANG {code(rng, 8)}", "transfer",
                                                  flow="savings", category="Tiết kiệm", cat_source="user",
                                                  meta={"kind": "td_open", "principal": amt}))
                        deposit_until = d + timedelta(days=182)
                        if deposit_until <= self.end:
                            interest = int(amt * 0.055 / 2 // 1000 * 1000)
                            heapq.heappush(heap, Move(at(deposit_until, 7, 30, 12), next(self.seq), "tcb_sms",
                                                      "C", amt + interest,
                                                      f"TAT TOAN TIET KIEM ONLINE {code(rng, 8)}", "income",
                                                      meta={"kind": "td_close", "principal": amt,
                                                            "interest": interest}))
                        continue
                if free > 0.5 * SAL and rng.random() < 0.65:
                    amt = int(min(max(lognormal(rng, sh.invest_median * SAL, 0.35), 5_000_000), free) // 100_000 * 100_000)
                    invest_toggle ^= 1
                    if invest_toggle:  # gold: whole chỉ at that day's SJC price
                        px = int(invest.price_on(self.q["SJC"], e.ts.date()))
                        qty = max(1, amt // px)
                        while qty > 0 and qty * px > free:
                            qty -= 1
                        if qty == 0:
                            continue
                        amt = qty * px
                        desc, meta = (f"{P.PERSONA_NAME} chuyen tien mua vang SJC",
                                      {"kind": "gold_buy", "qty": qty, "price": px})
                    else:
                        desc, meta = f"NAP TIEN TK CHUNG KHOAN SSI {code(rng, 8)}", {"kind": "ssi_deposit"}
                    heapq.heappush(heap, Move(e.ts + timedelta(minutes=5), next(self.seq), "tcb_sms", "D", amt,
                                              desc, "transfer", flow="investment", category="Đầu tư",
                                              cat_source="user", meta=meta))
                continue
            bal += e.amount if e.direction == "C" else -e.amount
            e.balance = bal
            e.seq = next(self.seq)
            out.append(e)
        self.tcb = out
        self.min_balance = {"tcb_sms": min(e.balance for e in out),
                            "timo_email": min(e.balance for e in self.timo)}

    # ---- tables
    def tables(self) -> dict[str, list[dict]]:
        rng = self.rng
        T: dict[str, list[dict]] = {k: [] for k in (
            "statements", "transactions", "fx_rates", "bank_movements", "annotations", "budgets",
            "cashback_milestones", "assets", "quotes", "accounts", "activities")}

        # statements: TCB from the cycles, VIB one synthetic per calendar month with rows
        st_rows = []
        for st in self.statements:
            gid = self.ids.gmail()
            close = st["close"]
            fetched = at(close + timedelta(days=1), 9, rng.randrange(10), rng.randrange(60))
            out = st["outstanding"]
            st_rows.append({
                "key": ("TCB", close), "gmail_msg_id": gid, "bank": "TCB", "card_last4": P.TCB_CARD_LAST4,
                "period_start": st["period_start"], "period_end": close,
                "pdf_path": f"data/statements/{gid}__SaoKeTheTinDung_{close:%Y%m}.pdf",
                "fetched_at": fetched, "parsed_at": fetched + timedelta(minutes=2),
                "outstanding_balance_minor": out,
                "min_payment_minor": int(round(max(out, 0) * P.TCB_MIN_PAYMENT_RATIO / 1000) * 1000),
                "payment_due_date": close + timedelta(days=P.TCB_DUE_AFTER_DAYS), "synthetic": False,
            })
        vib_months = sorted({c.d.replace(day=1) for c in self.cards if c.card == "vib"})
        for m in vib_months:
            first = min((c.ts for c in self.cards if c.card == "vib" and c.d.replace(day=1) == m and c.ts),
                        default=at(m, 9))
            st_rows.append({
                "key": ("VIB", m), "gmail_msg_id": f"synthetic:vib_email:{P.VIB_CARD_LAST4}:{m:%Y-%m}",
                "bank": "VIB", "card_last4": P.VIB_CARD_LAST4, "period_start": m, "period_end": month_end(m),
                "pdf_path": "synthetic://email-alerts", "fetched_at": first + timedelta(minutes=3),
                "parsed_at": first + timedelta(minutes=3), "outstanding_balance_minor": None,
                "min_payment_minor": None, "payment_due_date": None, "synthetic": True,
            })
        for c in self.cards:
            if c.card == "vib":
                c.statement_key = ("VIB", c.d.replace(day=1))
        st_rows.sort(key=lambda s: (s["period_end"], s["bank"]))
        st_id = {}
        for i, s in enumerate(st_rows, 1):
            st_id[s.pop("key")] = i
            T["statements"].append({"id": i, **s})
        fetched_by_id = {s["id"]: s["fetched_at"] for s in T["statements"]}

        # transactions
        tx = []
        for c in self.cards:
            sid = st_id[c.statement_key]
            if c.card == "vib":
                c.source = c.source or "vib_email"
                c.external_id = self.ids.gmail()
                row_hash = sha(f"{c.source}|{c.external_id}|0")
                categorized = c.ts + timedelta(minutes=15)
            else:
                row_hash = sha(f"{c.d.isoformat()}|{c.description}|{c.amount}|{c.currency}")
                categorized = fetched_by_id[sid] + timedelta(minutes=3)
            tx.append((c, {
                "statement_id": sid, "row_hash": row_hash, "txn_date": c.d,
                "posted_date": (c.d + timedelta(days=rng.randint(1, 2))) if c.card == "tcb" else None,
                "description": c.description, "merchant": c.merchant, "amount_minor": c.amount,
                "currency": c.currency, "amount_vnd_minor": c.vnd if c.currency != "VND" else None,
                "fx_rate": c.fx_rate, "fx_rate_date": c.d if c.fx_rate else None,
                "category": P.LEGACY.get(c.tag, c.legacy) if c.tag else c.legacy,
                "category_source": "rule" if rng.random() < 0.8 else "ollama", "categorized_at": categorized,
                "source": c.source if c.card == "vib" else None, "external_id": c.external_id,
                "occurred_at": c.ts,
            }))
        tx.sort(key=lambda p: (p[1]["statement_id"], p[1]["txn_date"], p[1]["occurred_at"] or at(p[1]["txn_date"], 0),
                               p[1]["description"]))
        seen_keys = set()
        for i, (c, row) in enumerate(tx, 1):
            key = (row["statement_id"], row["row_hash"])
            if key in seen_keys:
                raise RuntimeError(f"duplicate card row key {key}")
            seen_keys.add(key)
            T["transactions"].append({"id": i, **row})

        # card annotations
        ann = []
        for c, row in tx:
            if c.kind in ("payment", "reward"):
                continue
            cat, cat_src = None, "user"
            if c.reversed:
                cat, cat_src = "Đã hoàn", "wf"
            elif c.tag_known and c.tag:
                cat, cat_src = c.tag, c.cat_source
            if cat is None:
                continue
            base_ts = c.ts or at(c.d, 12)
            ann.append({"target_kind": "card", "statement_id": row["statement_id"], "row_hash": row["row_hash"],
                        "source": None, "external_id": None, "flow": None,
                        "note": rng.choice(P.NOTES) if rng.random() < 0.02 else None,
                        "updated_at": base_ts + timedelta(days=rng.randint(1, 10), hours=rng.randint(0, 9)),
                        "category": cat, "category_source": cat_src})

        # bank movements + account annotations
        linked: list[tuple[int, Move]] = []
        moves = sorted(self.tcb + self.timo, key=lambda e: (e.ts, e.seq))
        for i, e in enumerate(moves, 1):
            ext = self.ids.guid() if e.source == "tcb_sms" else self.ids.gmail()
            legacy = P.LEGACY.get(e.tag, "Other") if e.tag else "Other"
            if e.source == "tcb_sms":
                sign = "-" if e.direction == "D" else "+"
                raw = (f"Techcombank thong bao\nTai khoan Thanh toan: {P.TCB_ACCOUNT_REF}\n"
                       f"So tien: {sign} VND {money(e.amount)}\nSo du: VND {money(e.balance)}\n{e.description}")
                acct, pv = P.TCB_ACCOUNT_REF, "tcb_sms.v2"
            else:
                verb = "debited" if e.direction == "D" else "credited"
                raw = (f"Dear {P.PERSONA_NAME},\nYour Spend Account has been {verb} {money(e.amount)} VND on "
                       f"{e.ts:%d/%m/%Y %H:%M}.\nYour Current Balance is: {money(e.balance)} VND\n"
                       f"Transaction Description: {e.description}\nThank you for using Timo.")
                acct, pv = P.TIMO_ACCOUNT_REF, "timo.v2"
            T["bank_movements"].append({
                "id": i, "source": e.source, "external_id": ext, "account_ref": acct, "occurred_at": e.ts,
                "direction": e.direction, "amount_minor": e.amount, "currency": "VND",
                "running_balance_minor": e.balance, "counterparty": e.description, "description": e.description,
                "raw_body": raw, "parser_version": pv, "category": legacy, "category_source": "rule",
                "categorized_at": e.ts + timedelta(minutes=rng.randint(1, 20)),
            })
            if e.meta:
                linked.append((i, e))
            if e.category or e.flow:
                ann.append({"target_kind": "account", "statement_id": None, "row_hash": None, "source": e.source,
                            "external_id": ext, "flow": e.flow,
                            "note": rng.choice(P.NOTES) if e.kind == "spend" and rng.random() < 0.02 else None,
                            "updated_at": e.ts + timedelta(days=rng.randint(0, 6), hours=rng.randint(1, 9)),
                            "category": e.category, "category_source": e.cat_source if e.category else "user"})
        ann.sort(key=lambda a: a["updated_at"])
        T["annotations"] = [{"id": i, **a} for i, a in enumerate(ann, 1)]

        # fx
        T["fx_rates"] = [{"currency": "USD", "rate_date": d, "vnd_per_unit": r, "source": "vcb-public"}
                         for d, r in sorted(self.fx.items())]

        # budgets (ratios of the salary, rounded to 100k)
        created = at(self.start + timedelta(days=3), 21, 10)
        budgets = [("category", "Shopee", self.shape.shopee_budget, False),
                   ("category", "Ăn uống", 0.09, False), ("category", "Đi lại", 0.06, False),
                   ("category", "Subscription", 0.035, False), ("category", "Mèo", 0.03, False),
                   ("category", "Khác", 0.08, True), ("source", "vib_credit", 0.33, False)]
        T["budgets"] = [{"id": i, "scope_type": st, "scope_value": sv, "period": "monthly",
                         "limit_minor": int(round(r * SAL / 100_000) * 100_000), "warn_pct": 80, "active": True,
                         "created_at": created + timedelta(minutes=i), "overflow_buffer": buf}
                        for i, (st, sv, r, buf) in enumerate(budgets, 1)]

        # cashback ladder: the 8% rate rung is live; the old step rungs are history
        made = at(self.vib_open - timedelta(days=2), 22, 0)
        ladder = [(i, t, r, "step", False, None, None) for i, (t, r) in enumerate(P.VIB_OLD_STEPS, 1)]
        ladder.append((3, P.VIB_RATE_THRESHOLD, P.VIB_RATE_REWARD, "rate", True,
                       date.fromisoformat(P.VIB_RATE_VALID_THROUGH), "Pro"))
        T["cashback_milestones"] = [
            {"id": i, "src": "vib_credit", "ordinal": o, "threshold_minor": t, "reward_minor": r,
             "period": "monthly", "active": act, "created_at": made + timedelta(days=0 if o < 3 else 30),
             "cycle_close_day": P.VIB_CLOSE_DAY, "accrual": acc, "valid_through": vt, "plan_name": plan}
            for i, (o, t, r, acc, act, vt, plan) in enumerate(ladder, 1)]

        T.update(invest.build(self, linked))
        return T


def generate(end: date | None = None) -> tuple[dict[str, list[dict]], dict]:
    g = Gen(end or date.today())
    g.card_spend()
    g.subscriptions()
    g.refunds()
    g.tcb_statements()
    g.vib_cycles()
    g.timo_sim()
    g.tcb_sim()
    meta = {"start": g.start, "end": g.end, "vib_open": g.vib_open, "calibrated": g.shape.calibrated,
            "vib_cycles": g.vib_cycle_summary, "min_balance": g.min_balance}
    return g.tables(), meta
