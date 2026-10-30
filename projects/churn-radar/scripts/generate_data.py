"""Synthetic data for "Inkwell" (fictional AI writing app), the Churn Radar edition.

Same company as AI Margin Radar, continued to 2027-01-10. On 2026-10-01 Inkwell applies the margin
copilot's rules: Team plans get 50 Agent runs per month, 60% of chat moves to the cheaper Mini model.
Margin recovers, and then:
  - Team customers who keep hitting the cap disengage for a few weeks, then cancel or downgrade to Pro
    (Pro has no cap, so downgrading is the escape hatch);
  - chat-heavy Pro customers churn a little more ("chat answers got worse");
  - everyone else behaves as before.
Customers who have decided to leave use the product less in the weeks before they cancel, which is the
early-warning signal the app looks for.

    uv run --with duckdb --with numpy --with pandas python scripts/generate_data.py
"""

import datetime as dt
import pathlib
import random

import duckdb
import numpy as np
import pandas as pd

SEED = 7
START = dt.date(2025, 10, 1)
END = dt.date(2027, 1, 10)            # "today" in this world
AGENT_LAUNCH = dt.date(2026, 6, 1)
RULES = dt.date(2026, 10, 1)          # the margin rules go live
TEAM_CAP = 50                         # Agent runs per customer per calendar month, Team only
CHAT_TO_MINI = 0.60                   # share of chat requests routed to Mini after RULES
DAY = dt.timedelta(days=1)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "inkwell.duckdb"
top = np.random.default_rng(SEED)
random.seed(SEED)

plans = pd.DataFrame(
    [("free", "Free", 0.0, 1), ("starter", "Starter", 12.0, 2), ("pro", "Pro", 29.0, 3), ("team", "Team", 99.0, 4)],
    columns=["plan_id", "plan_name", "monthly_price_usd", "sort_order"],
)
PRICE = dict(zip(plans.plan_id, plans.monthly_price_usd))
llm_models = pd.DataFrame(
    [("mini", "Mini (fast)", "Provider A", 0.40, 1.60), ("standard", "Standard", "Provider B", 3.00, 15.00),
     ("frontier", "Frontier (reasoning)", "Provider B", 15.00, 75.00)],
    columns=["model_id", "model_name", "provider", "input_usd_per_mtok", "output_usd_per_mtok"],
)
FEATURES = {"rewrite": ("mini", 1500, 400), "summarize": ("mini", 6000, 300), "chat": ("standard", 3000, 600), "agent": ("frontier", 30000, 2500)}
BASE_REQ = {
    "free": {"rewrite": 3.0, "summarize": 0.8, "chat": 0.0},
    "starter": {"rewrite": 5.0, "summarize": 1.5, "chat": 2.0},
    "pro": {"rewrite": 6.0, "summarize": 2.0, "chat": 5.0},
    "team": {"rewrite": 14.0, "summarize": 5.0, "chat": 12.0},
}
AGENT_REQ = {"free": 0.0, "starter": 0.0, "pro": 0.25, "team": 0.6}
ACTIVE_P = {"free": 0.22, "starter": 0.45, "pro": 0.60, "team": 0.75}
BASE_CHURN = {"starter": 0.065, "pro": 0.04, "team": 0.022}

FIRST = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Ethan", "Ivy", "Lucas", "Nora", "Leo", "Maya", "Owen", "Aria", "Kai", "Lena", "Theo",
         "Ruby", "Finn", "Hana", "Omar", "Sofia", "Minh", "Priya", "Jonas", "Elif", "Mateo", "Yuki", "Chloe", "Arjun", "Freya", "Diego",
         "Anya", "Sam", "Tara", "Felix", "Linh"]
LAST = ["Nguyen", "Smith", "Garcia", "Kim", "Müller", "Rossi", "Tanaka", "Patel", "Silva", "Novak", "Cohen", "Larsen", "Dubois", "Okafor",
        "Chen", "Walsh", "Haddad", "Ivanova", "Moreau", "Sato", "Berg", "Costa", "Ali", "Fischer", "Reyes", "Andersen", "Park", "Lopez",
        "Hughes", "Tran"]
COUNTRIES = [("United States", 0.34), ("United Kingdom", 0.10), ("Germany", 0.09), ("India", 0.08), ("Canada", 0.06), ("France", 0.05),
             ("Australia", 0.05), ("Brazil", 0.05), ("Netherlands", 0.04), ("Vietnam", 0.04), ("Japan", 0.04), ("Spain", 0.03), ("Singapore", 0.03)]
CHANNELS = [("Product Hunt", 0.12), ("Organic search", 0.30), ("X / Twitter", 0.18), ("Reddit", 0.10), ("Newsletter", 0.12), ("Referral", 0.18)]
PLAN_MIX = [("free", 0.46), ("starter", 0.26), ("pro", 0.21), ("team", 0.07)]
BASE_REASONS = [("Too expensive", 0.35), ("Not using it enough", 0.30), ("Switched to another tool", 0.20), ("Project ended", 0.15)]


def pick(pairs, rng):
    v, w = zip(*pairs)
    return v[rng.choice(len(v), p=np.array(w) / sum(w))]


def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    last = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return dt.date(y, m, min(d.day, last))


customers, invoices, usage, caps, events = [], [], [], [], []
ids = {"invoice": 500000, "usage": 0, "event": 0}


def event(cid, day, kind, frm, to, mrr, reason=None):
    ids["event"] += 1
    events.append(dict(event_id=ids["event"], customer_id=cid, event_date=day, event_type=kind, from_plan=frm, to_plan=to,
                       mrr_change_usd=round(mrr, 2), reason=reason))


def simulate(cid, signup, plan, rng, persona=None):
    """One customer from signup to END: invoices, daily usage, cap hits, plan changes, cancellation."""
    intensity = float(rng.lognormal(0.0, 0.7))
    power = plan in ("pro", "team") and rng.random() < 0.06
    if power:
        intensity *= float(rng.uniform(8, 25))
    if persona:
        intensity = persona.get("intensity", intensity)
        power = True
    coupon = None
    if plan != "free":
        r = rng.random()
        if signup < dt.date(2026, 1, 1) and r < 0.30:
            coupon = "LAUNCH50"
        elif r < 0.04:
            coupon = "FRIENDS100"
    if persona:
        coupon = None
    seats = int(rng.integers(3, 9)) if plan == "team" else 1
    event(cid, signup, "signup", None, plan, PRICE[plan])

    status, churned_at, cancel_reason = "active", None, None
    # leave_on: a decided future cancellation; until then usage fades over the last weeks
    leave_on, leave_reason, leave_kind = None, None, None
    period_start, n = signup, 0
    month_runs = {}  # (y, m) -> agent runs used this calendar month
    blocked_in_period = 0
    chat_heavy = False
    while period_start <= END:
        period_end = add_months(signup, n + 1)
        # ---- bill this period
        if plan != "free":
            ids["invoice"] += 1
            gross = PRICE[plan] * (1 if plan != "team" else 1)
            discount = gross * 0.5 if coupon == "LAUNCH50" and n < 3 else gross if coupon == "FRIENDS100" else 0.0
            due = round(gross - discount, 2)
            r = rng.random()
            stat = "paid" if due == 0 else "failed" if r < 0.035 else "refunded" if r < 0.055 else "paid"
            paid = due if stat in ("paid", "refunded") else 0.0
            invoices.append(dict(invoice_id=f"in_{ids['invoice']}", customer_id=cid, plan_id=plan, invoiced_on=period_start,
                                 gross_amount_usd=gross, discount_usd=round(discount, 2), amount_paid_usd=paid,
                                 refunded_usd=paid if stat == "refunded" else 0.0,
                                 stripe_fee_usd=round(paid * 0.029 + 0.30, 2) if paid > 0 else 0.0, status=stat,
                                 coupon_code=coupon if discount > 0 else None))
        # ---- use the product, day by day
        blocked_in_period, chat_req, all_req = 0, 0, 0
        d = period_start
        while d < period_end and d <= END and (leave_on is None or d < leave_on):
            fade = 1.0
            if leave_on is not None:
                left = (leave_on - d).days
                if left < 35:
                    fade = max(0.1, left / 35)
            if plan == "free" and (d - signup).days > 45 and rng.random() < 0.7:
                d += DAY
                continue
            weekend = d.weekday() >= 5
            if rng.random() < ACTIVE_P[plan] * (0.55 if weekend else 1.0) * (1.4 if power else 1.0) * fade:
                for feature, (model, mean_in, mean_out) in FEATURES.items():
                    if feature == "agent":
                        if d < AGENT_LAUNCH:
                            continue
                        ramp = min(1.0, ((d - AGENT_LAUNCH).days + 10) / 60)
                        lam = AGENT_REQ[plan] * ramp * (intensity ** 1.1)
                    else:
                        lam = BASE_REQ[plan][feature] * intensity
                    req = int(rng.poisson(lam)) if lam > 0 else 0
                    if req == 0:
                        continue
                    if feature == "agent" and plan == "team" and d >= RULES:
                        key = (d.year, d.month)
                        used = month_runs.get(key, 0)
                        allowed = max(0, min(req, TEAM_CAP - used))
                        month_runs[key] = used + allowed
                        if req > allowed:
                            caps.append(dict(customer_id=cid, event_date=d, blocked_runs=req - allowed))
                            blocked_in_period += req - allowed
                        req = allowed
                        if req == 0:
                            continue
                    all_req += req
                    if feature == "chat":
                        chat_req += req
                    parts = [(model, req)]
                    if feature == "chat" and d >= RULES:
                        to_mini = int(rng.binomial(req, CHAT_TO_MINI))
                        parts = [("standard", req - to_mini), ("mini", to_mini)]
                    for mdl, k in parts:
                        if k == 0:
                            continue
                        s = min(k, 50)
                        tin = int(rng.gamma(4.0, mean_in / 4.0, size=s).sum() * k / s)
                        tout = int(rng.gamma(4.0, mean_out / 4.0, size=s).sum() * k / s)
                        ids["usage"] += 1
                        usage.append((ids["usage"], cid, d, feature, mdl, k, tin, tout))
            d += DAY
        chat_heavy = all_req > 0 and chat_req / all_req > 0.33

        # ---- end of period: leave, downgrade, or stay
        if leave_on is not None and leave_on <= period_end:
            if leave_on > END:
                break
            if leave_kind == "downgrade":
                event(cid, leave_on, "downgrade", "team", "pro", PRICE["pro"] - PRICE["team"], leave_reason)
                plan, leave_on, leave_reason, leave_kind = "pro", None, None, None
                persona = None  # the persona's story ends with the downgrade
            else:
                status, churned_at, cancel_reason = "cancelled", leave_on, leave_reason
                event(cid, leave_on, "cancel", plan, None, -PRICE[plan], leave_reason)
                break
        if plan != "free" and leave_on is None and period_end <= END + dt.timedelta(days=60):
            hazard = BASE_CHURN[plan] * (0.6 if power else 1.0)
            reason = pick(BASE_REASONS, rng)
            kind = "cancel"
            if period_start >= RULES or period_end > RULES:
                if plan == "team" and blocked_in_period > 0:
                    # the cap hurts: heavier hitters are likelier to leave
                    hazard += min(0.75, 0.25 + blocked_in_period / 120)
                    reason = "Hit the Agent run cap" if rng.random() < 0.85 else "Switched to another tool"
                    kind = "downgrade" if rng.random() < 0.35 else "cancel"
                    if kind == "downgrade":
                        reason = "Pro has no Agent cap"
                elif plan == "pro" and chat_heavy:
                    hazard += 0.045
                    if rng.random() < 0.6:
                        reason = "Chat answers got worse"
            if persona and persona.get("leave"):
                hazard = 1.0 if period_end >= persona["leave_after"] else 0.0
                reason, kind = persona.get("reason", reason), persona.get("kind", "cancel")
            if persona and persona.get("stay"):
                hazard = 0.0
            if rng.random() < hazard:
                # decide now, cancel 2-5 weeks later; usage fades meanwhile
                leave_on = period_end + dt.timedelta(days=int(rng.integers(14, 36)))
                if persona and persona.get("leave_on"):
                    leave_on = persona["leave_on"]
                leave_reason, leave_kind = reason, kind
        if plan == "free" and rng.random() < 0.12:
            status, churned_at = "cancelled", period_end
            break
        period_start, n = period_end, n + 1

    return dict(customer_id=cid, plan_id=plan, coupon_code=coupon, seats=seats, status=status, churned_at=churned_at,
                cancel_reason=cancel_reason, leave_on=leave_on if leave_on and leave_on > END else None, _power=power)


# Named people the story follows. Noah: the heavy Team user from AI Margin Radar, now hitting the cap
# and fading (decided to leave, cancels after END), so he tops the Monday list.
PERSONAS = {
    1099: dict(name="Noah Ivanova", plan="team", signup=dt.date(2025, 11, 14), intensity=34.0, leave=True,
               leave_after=dt.date(2026, 12, 14), leave_on=dt.date(2027, 1, 17), reason="Hit the Agent run cap"),
    2110: dict(name="Finn Müller", plan="team", signup=dt.date(2026, 2, 3), intensity=28.0, leave=True,
               leave_after=dt.date(2026, 10, 3), reason="Hit the Agent run cap"),
    1415: dict(name="Hana Hughes", plan="team", signup=dt.date(2025, 12, 20), intensity=22.0, leave=True,
               leave_after=dt.date(2026, 10, 20), kind="downgrade", reason="Pro has no Agent cap"),
    1463: dict(name="Ava Tanaka", plan="pro", signup=dt.date(2026, 1, 9), intensity=20.0, leave=True,
               leave_after=dt.date(2026, 11, 9), reason="Chat answers got worse"),
}

day, cid = START, 1000
while day <= END:
    months_in = (day.year - START.year) * 12 + day.month - START.month
    # after the rules, word of mouth from power users dries up: signups stop growing
    months_in = min(months_in, (RULES.year - START.year) * 12 + RULES.month - START.month)
    for _ in range(top.poisson(3.2 * (1.07 ** months_in) * (0.85 if day >= RULES else 1.0)) + (70 if day == dt.date(2026, 3, 17) else 0)):
        cid += 1
        rng = np.random.default_rng([SEED, cid])
        persona = PERSONAS.get(cid)
        plan = persona["plan"] if persona else pick(PLAN_MIX, rng)
        signup = persona["signup"] if persona else day
        name = persona["name"] if persona else f"{FIRST[rng.integers(len(FIRST))]} {LAST[rng.integers(len(LAST))]}"
        channel = "Product Hunt" if day == dt.date(2026, 3, 17) else pick(CHANNELS, rng)
        c = simulate(cid, signup, plan, rng, persona)
        c.update(customer_name=name, email=f"{name.split()[0].lower()}.{cid}@example.com", country=pick(COUNTRIES, rng),
                 acquisition_channel=channel, signed_up_at=signup, signup_plan_id=plan)
        customers.append(c)
    day += DAY

customers_df = pd.DataFrame(customers).drop(columns=["_power"])
usage_df = pd.DataFrame(usage, columns=["usage_id", "customer_id", "used_on", "feature", "model_id", "requests", "input_tokens", "output_tokens"])
dates_df = pd.DataFrame({"date_key": pd.date_range(START, END, freq="D").date})
settings = pd.DataFrame([dict(as_of_date=END, rules_effective_date=RULES, team_agent_cap=TEAM_CAP, chat_to_mini_pct=int(CHAT_TO_MINI * 100))])

OUT.parent.mkdir(exist_ok=True)
if OUT.exists():
    OUT.unlink()
con = duckdb.connect(str(OUT))
for name, df in [("plans", plans), ("llm_models", llm_models), ("customers", customers_df), ("invoices", pd.DataFrame(invoices)),
                 ("llm_usage", usage_df), ("cap_events", pd.DataFrame(caps)), ("subscription_events", pd.DataFrame(events)),
                 ("dim_dates", dates_df), ("settings", settings)]:
    con.register("df", df)
    con.execute(f"create table {name} as select * from df")
    con.unregister("df")
con.close()
print(f"customers={len(customers_df)} invoices={len(invoices)} usage={len(usage_df)} cap_events={len(caps)} events={len(events)}")
