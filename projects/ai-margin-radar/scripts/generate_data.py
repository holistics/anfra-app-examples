"""Generate synthetic data for "Inkwell", a fictional indie AI writing app.

Writes data/inkwell.duckdb with Stripe-like billing and per-customer LLM usage.
Everything is synthetic. Run: uv run --with duckdb --with numpy --with pandas scripts/generate_data.py

The story baked into the data:
- Oct 2025 to Sep 2026, plus Oct 2026 to date (a partial month, as a live app would have).
- On 2026-06-01 Inkwell launches "Agent mode" on a frontier model. Revenue keeps growing,
  but a small group of heavy users on flat plans pushes LLM cost up faster than revenue.
- Billing has the usual mess: launch coupons, failed payments, refunds, Stripe fees that
  are not returned on refunds.
"""

import datetime as dt
import pathlib
import random

import duckdb
import numpy as np
import pandas as pd

SEED = 42
START = dt.date(2025, 10, 1)
END = dt.date(2026, 10, 12)  # last day with data (today - 1)
AGENT_LAUNCH = dt.date(2026, 6, 1)

rng = np.random.default_rng(SEED)
random.seed(SEED)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "inkwell.duckdb"

plans = pd.DataFrame(
    [
        ("free", "Free", 0.0, 1),
        ("starter", "Starter", 12.0, 2),
        ("pro", "Pro", 29.0, 3),
        ("team", "Team", 99.0, 4),
    ],
    columns=["plan_id", "plan_name", "monthly_price_usd", "sort_order"],
)
PRICE = dict(zip(plans.plan_id, plans.monthly_price_usd))

# USD per million tokens
llm_models = pd.DataFrame(
    [
        ("mini", "Mini (fast)", "Provider A", 0.40, 1.60),
        ("standard", "Standard", "Provider B", 3.00, 15.00),
        ("frontier", "Frontier (reasoning)", "Provider B", 15.00, 75.00),
    ],
    columns=["model_id", "model_name", "provider", "input_usd_per_mtok", "output_usd_per_mtok"],
)

# feature -> (model, mean input tokens/request, mean output tokens/request)
FEATURES = {
    "rewrite": ("mini", 1500, 400),
    "summarize": ("mini", 6000, 300),
    "chat": ("standard", 3000, 600),
    "agent": ("frontier", 30000, 2500),
}

FIRST = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Ethan", "Ivy", "Lucas", "Nora", "Leo", "Maya", "Owen",
         "Aria", "Kai", "Lena", "Theo", "Ruby", "Finn", "Hana", "Omar", "Sofia", "Minh", "Priya", "Jonas",
         "Elif", "Mateo", "Yuki", "Chloe", "Arjun", "Freya", "Diego", "Anya", "Sam", "Tara", "Felix", "Linh"]
LAST = ["Nguyen", "Smith", "Garcia", "Kim", "Müller", "Rossi", "Tanaka", "Patel", "Silva", "Novak",
        "Cohen", "Larsen", "Dubois", "Okafor", "Chen", "Walsh", "Haddad", "Ivanova", "Moreau", "Sato",
        "Berg", "Costa", "Ali", "Fischer", "Reyes", "Andersen", "Park", "Lopez", "Hughes", "Tran"]
COUNTRIES = [("US", 0.34), ("GB", 0.10), ("DE", 0.09), ("IN", 0.08), ("CA", 0.06), ("FR", 0.05),
             ("AU", 0.05), ("BR", 0.05), ("NL", 0.04), ("VN", 0.04), ("JP", 0.04), ("ES", 0.03),
             ("SG", 0.03)]
CHANNELS = [("Product Hunt", 0.12), ("Organic search", 0.30), ("X / Twitter", 0.18),
            ("Reddit", 0.10), ("Newsletter", 0.12), ("Referral", 0.18)]
PLAN_MIX = [("free", 0.46), ("starter", 0.26), ("pro", 0.21), ("team", 0.07)]
MONTHLY_CHURN = {"free": 0.12, "starter": 0.065, "pro": 0.04, "team": 0.022}


def pick(pairs):
    values, weights = zip(*pairs)
    return random.choices(values, weights=weights)[0]


def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    last = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return dt.date(y, m, min(d.day, last))


# --- customers -----------------------------------------------------------------------------
customers = []
day = START
cid = 1000
while day <= END:
    months_in = (day.year - START.year) * 12 + day.month - START.month
    daily_signups = rng.poisson(3.2 * (1.07 ** months_in))
    if day == dt.date(2026, 3, 17):  # a Product Hunt launch day spike
        daily_signups += 70
    for _ in range(daily_signups):
        cid += 1
        plan = pick(PLAN_MIX)
        channel = "Product Hunt" if day == dt.date(2026, 3, 17) else pick(CHANNELS)
        # usage intensity: lognormal with a heavy tail; ~4% of paid users are power users
        intensity = float(rng.lognormal(0.0, 0.7))
        power_user = plan != "free" and rng.random() < 0.045
        if power_user:
            intensity *= float(rng.uniform(8, 25))
        # churn: walk month by month
        churned_at = None
        m = 1
        while True:
            check = add_months(day, m)
            if check > END:
                break
            p = MONTHLY_CHURN[plan] * (0.6 if power_user else 1.0)
            if rng.random() < p:
                churned_at = check
                break
            m += 1
        coupon = None
        if plan != "free":
            r = rng.random()
            if day < dt.date(2026, 1, 1) and r < 0.30:
                coupon = "LAUNCH50"  # 50% off the first 3 invoices
            elif channel == "Product Hunt" and r < 0.5:
                coupon = "PH30"  # 30% off the first 3 invoices
            elif r < 0.04:
                coupon = "FRIENDS100"  # free forever, friends and family
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        customers.append(dict(
            customer_id=cid,
            customer_name=name,
            email=f"{name.split()[0].lower()}.{cid}@example.com",
            country_code=pick(COUNTRIES),
            acquisition_channel=channel,
            plan_id=plan,
            coupon_code=coupon,
            signed_up_at=day,
            churned_at=churned_at,
            seats=int(rng.integers(3, 9)) if plan == "team" else 1,
            _intensity=intensity,
            _power=power_user,
        ))
    day += dt.timedelta(days=1)

# --- invoices ------------------------------------------------------------------------------
invoices = []
iid = 500000
for c in customers:
    if c["plan_id"] == "free":
        continue
    n = 0
    bill = c["signed_up_at"]
    while bill <= END and (c["churned_at"] is None or bill < c["churned_at"]):
        iid += 1
        gross = PRICE[c["plan_id"]]
        discount = 0.0
        if c["coupon_code"] == "LAUNCH50" and n < 3:
            discount = round(gross * 0.5, 2)
        elif c["coupon_code"] == "PH30" and n < 3:
            discount = round(gross * 0.3, 2)
        elif c["coupon_code"] == "FRIENDS100":
            discount = gross
        due = round(gross - discount, 2)
        r = rng.random()
        if due == 0:
            status = "paid"
        elif r < 0.035:
            status = "failed"
        elif r < 0.055:
            status = "refunded"
        else:
            status = "paid"
        paid = due if status in ("paid", "refunded") else 0.0
        fee = round(paid * 0.029 + 0.30, 2) if paid > 0 else 0.0
        refunded = paid if status == "refunded" else 0.0
        invoices.append(dict(
            invoice_id=f"in_{iid}",
            customer_id=c["customer_id"],
            plan_id=c["plan_id"],
            invoiced_on=bill,
            gross_amount_usd=gross,
            discount_usd=discount,
            amount_paid_usd=paid,
            refunded_usd=refunded,
            stripe_fee_usd=fee,
            status=status,
            coupon_code=c["coupon_code"] if discount > 0 else None,
        ))
        n += 1
        bill = add_months(c["signed_up_at"], n)

# --- LLM usage, one row per customer, day, feature ------------------------------------------
BASE_REQ = {  # mean requests per active day, per feature, by plan
    "free": {"rewrite": 3.0, "summarize": 0.8, "chat": 0.0, "agent": 0.0},
    "starter": {"rewrite": 5.0, "summarize": 1.5, "chat": 2.0, "agent": 0.0},
    "pro": {"rewrite": 6.0, "summarize": 2.0, "chat": 5.0, "agent": 0.0},
    "team": {"rewrite": 14.0, "summarize": 5.0, "chat": 12.0, "agent": 0.0},
}
AGENT_REQ = {"free": 0.0, "starter": 0.0, "pro": 0.25, "team": 0.6}  # runs per active day
ACTIVE_P = {"free": 0.22, "starter": 0.45, "pro": 0.60, "team": 0.75}

usage = []
uid = 0
for c in customers:
    plan = c["plan_id"]
    last = min(END, (c["churned_at"] - dt.timedelta(days=1)) if c["churned_at"] else END)
    d = c["signed_up_at"]
    intensity = c["_intensity"]
    # free users drift away after a few weeks
    while d <= last:
        if plan == "free" and (d - c["signed_up_at"]).days > 45 and rng.random() < 0.7:
            d += dt.timedelta(days=1)
            continue
        weekend = d.weekday() >= 5
        if rng.random() < ACTIVE_P[plan] * (0.55 if weekend else 1.0) * (1.4 if c["_power"] else 1.0):
            for feature, (model, mean_in, mean_out) in FEATURES.items():
                if feature == "agent":
                    if d < AGENT_LAUNCH:
                        continue
                    # adoption ramps up over the first two months after launch
                    ramp = min(1.0, ((d - AGENT_LAUNCH).days + 10) / 60)
                    lam = AGENT_REQ[plan] * ramp * (intensity ** 1.1)
                else:
                    lam = BASE_REQ[plan][feature] * intensity
                if lam <= 0:
                    continue
                req = int(rng.poisson(lam))
                if req == 0:
                    continue
                in_tok = int(sum(rng.gamma(4.0, mean_in / 4.0, size=min(req, 50))) * (req / min(req, 50)))
                out_tok = int(sum(rng.gamma(4.0, mean_out / 4.0, size=min(req, 50))) * (req / min(req, 50)))
                uid += 1
                usage.append((uid, c["customer_id"], d, feature, model, req, in_tok, out_tok))
        d += dt.timedelta(days=1)

usage_df = pd.DataFrame(usage, columns=["usage_id", "customer_id", "used_on", "feature", "model_id",
                                        "requests", "input_tokens", "output_tokens"])
customers_df = pd.DataFrame(customers).drop(columns=["_intensity", "_power"])
invoices_df = pd.DataFrame(invoices)
dates_df = pd.DataFrame({"date_key": pd.date_range(START, END, freq="D").date})

country_names = {"US": "United States", "GB": "United Kingdom", "DE": "Germany", "IN": "India",
                 "CA": "Canada", "FR": "France", "AU": "Australia", "BR": "Brazil", "NL": "Netherlands",
                 "VN": "Vietnam", "JP": "Japan", "ES": "Spain", "SG": "Singapore"}
customers_df["country"] = customers_df.country_code.map(country_names)

OUT.parent.mkdir(exist_ok=True)
if OUT.exists():
    OUT.unlink()
con = duckdb.connect(str(OUT))
for name, df in [("plans", plans), ("llm_models", llm_models), ("customers", customers_df),
                 ("invoices", invoices_df), ("llm_usage", usage_df), ("dim_dates", dates_df)]:
    con.register("df", df)
    con.execute(f"create table {name} as select * from df")
    con.unregister("df")
con.close()

print(f"customers={len(customers_df)} invoices={len(invoices_df)} usage_rows={len(usage_df)} -> {OUT}")
