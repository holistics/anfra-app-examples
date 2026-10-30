"""Generate the synthetic table behind the "Business metrics" dataset.

Output: metric-layers-v9.duckdb next to this script. Nothing in it is real.
Seed is fixed, so every run gives the same file.
Grain: one row per day x channel x device, 2024-01-01 to 2025-12-31 (24 months).

Run:
    ../.venv/bin/python generate_metric_layers.py
"""

import datetime as dt
import math
import os
import random

import duckdb

SEED = 7
START = dt.date(2024, 1, 1)
END = dt.date(2025, 12, 31)
CHANNELS = {  # name: (traffic weight, base conversion, spend per session)
    "direct": (0.17, 0.040, 0.0),
    "referral": (0.09, 0.030, 0.0),
    "organic search": (0.30, 0.032, 0.0),
    "paid social": (0.34, 0.026, 0.12),
    "email": (0.10, 0.052, 0.04),
}
# Planted story, last 6 months (2025-07-01 to 2025-12-31), ramping in linearly:
# paid social sessions, paid social conversion, marketing cost per session, mobile conversion.
STORY_START = dt.date(2025, 7, 1)
PAID_SESSIONS_DROP = 0.65
PAID_CONV_DROP = 0.30
PAID_COST_RISE = 0.60
MOBILE_CONV_DROP = 0.06
DEVICES = {"mobile": (0.58, 0.85), "desktop": (0.34, 1.20), "tablet": (0.08, 0.95)}

rng = random.Random(SEED)
rows = []
d = START
while d <= END:
    t = (d - START).days
    trend = 1 + 0.16 * t / 730  # steady growth, about +8% a year
    season = 1 + 0.02 * math.sin(2 * math.pi * (d.timetuple().tm_yday - 60) / 365)
    ramp = max(0.0, min(1.0, ((d - STORY_START).days + 1) / 184)) ** 0.3
    weekday = 1.08 if d.weekday() >= 5 else 1.0
    for ch, (cw, conv, spend) in CHANNELS.items():
        for dev, (dw, dm) in DEVICES.items():
            paid = ch == "paid social"
            base = 3000 * cw * dw * trend * season * weekday
            if paid:
                base *= 1 - PAID_SESSIONS_DROP * ramp
            sessions = max(1, round(base * rng.uniform(0.85, 1.15)))
            cm = dm * (1 - MOBILE_CONV_DROP * ramp if dev == "mobile" else 1)
            if paid:
                cm *= 1 - PAID_CONV_DROP * ramp
            orders = max(0, round(sessions * conv * cm * rng.uniform(0.85, 1.15)))
            upo = rng.uniform(1.8, 2.4)
            units = round(orders * upo)
            list_price = rng.uniform(38, 46) * (1 + 0.02 * t / 730)
            list_sales = round(units * list_price, 2)
            disc_rate = rng.uniform(0.06, 0.14) 
            discount = round(list_sales * disc_rate, 2)
            net = list_sales - discount
            product_cost = round(net * rng.uniform(0.42, 0.50), 2)
            shipping = round(orders * rng.uniform(1.6, 2.2) + 16 * trend, 2)  # half fixed carrier cost
            marketing = round(sessions * spend * (1 + PAID_COST_RISE * ramp if paid else 1) * rng.uniform(0.9, 1.1), 2)
            # Distinct customers per day: 70% to 85% of orders (some buy twice, some not at all).
            # New customers follow traffic; returning customers are the rest.
            cust = round(orders * rng.uniform(0.70, 0.85))
            new_c = min(cust, round(sessions * 0.012 * rng.uniform(0.85, 1.15)))
            ret_c = cust - new_c
            support = round((new_c + ret_c) * rng.uniform(0.2, 0.4) + 16 * trend, 2)  # mostly fixed team cost
            rows.append((d, ch, dev, sessions, orders, units, list_sales, discount,
                         product_cost, shipping, marketing, support, new_c, ret_c))
    d += dt.timedelta(days=1)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metric-layers-v9.duckdb")
if os.path.exists(out):
    os.remove(out)
con = duckdb.connect(out)
con.execute("""create table daily_metrics (
    metric_date date, channel varchar, device varchar,
    sessions integer, orders integer, units integer,
    list_sales decimal(14,2), discount decimal(14,2),
    product_cost decimal(14,2), shipping_cost decimal(14,2),
    marketing_cost decimal(14,2), support_cost decimal(14,2),
    new_customers integer, returning_customers integer)""")
con.executemany("insert into daily_metrics values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
print(con.execute("select count(*), min(metric_date), max(metric_date) from daily_metrics").fetchall())
con.close()
