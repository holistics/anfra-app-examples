"""Generate synthetic e-commerce data for the anfra competition demo.

Output: ecommerce.duckdb next to this script. All data is synthetic.
Seed is fixed, so every run produces the same file.

Tables: customers, products, sessions, orders, order_items.
Planted driver: Vietnam mobile e-wallet checkouts fail in 2025 Q4.
See README.md in this folder.

Run:
    ../.venv/bin/python generate_ecommerce.py
"""

import datetime as dt
import math
import os
import random

import duckdb

SEED = 42
START = dt.date(2024, 1, 1)
END = dt.date(2025, 12, 31)  # inclusive, two years of daily data
N_CUSTOMERS = 8000
N_PRODUCTS = 80

COUNTRIES = {  # name: (code, weight, conversion multiplier)
    "Vietnam": ("VN", 0.30, 1.00),
    "United States": ("US", 0.22, 1.10),
    "Singapore": ("SG", 0.12, 1.05),
    "Japan": ("JP", 0.12, 0.95),
    "Australia": ("AU", 0.12, 1.00),
    "Germany": ("DE", 0.12, 0.98),
}
DEVICES = {"mobile": (0.58, 0.022), "desktop": (0.30, 0.030), "tablet": (0.12, 0.025)}
CHANNELS = {  # name: weight
    "organic search": 0.30,
    "paid social": 0.25,
    "email": 0.12,
    "direct": 0.20,
    "referral": 0.13,
}
PAYMENTS_BY_DEVICE = {
    "mobile": [("card", 0.30), ("ewallet", 0.45), ("cod", 0.25)],
    "desktop": [("card", 0.70), ("ewallet", 0.15), ("cod", 0.15)],
    "tablet": [("card", 0.60), ("ewallet", 0.25), ("cod", 0.15)],
}
CATEGORIES = ["apparel", "home", "beauty", "electronics", "grocery", "sports"]

# Planted story
DRIVER_COUNTRY = "Vietnam"
DRIVER_DEVICE = "mobile"
DRIVER_PAYMENT = "ewallet"
DRIVER_START = dt.date(2025, 10, 1)  # start of 2025 Q4, the last quarter
DRIVER_LOSS = 0.90  # share of driver-segment e-wallet checkouts that fail

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ecommerce.duckdb")


def weighted(rng, items):
    total = sum(w for _, w in items)
    r = rng.random() * total
    acc = 0.0
    for value, w in items:
        acc += w
        if r <= acc:
            return value
    return items[-1][0]


def poisson(rng, lam):
    """Normal approximation for large lambda, exact for small."""
    if lam < 30:
        limit, k, p = math.exp(-lam), 0, 1.0
        while True:
            p *= rng.random()
            if p <= limit:
                return k
            k += 1
    return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))


def build_customers(rng):
    rows = []
    span = (END - START).days
    for cid in range(1, N_CUSTOMERS + 1):
        country = weighted(rng, [(c, v[1]) for c, v in COUNTRIES.items()])
        signup = START + dt.timedelta(days=rng.randint(0, span))
        segment = weighted(rng, [("new", 0.5), ("returning", 0.35), ("loyal", 0.15)])
        rows.append((cid, country, signup, segment))
    return rows


def build_products(rng):
    rows = []
    for pid in range(1, N_PRODUCTS + 1):
        cat = CATEGORIES[(pid - 1) % len(CATEGORIES)]
        price = round(rng.uniform(5, 250), 2)
        rows.append((pid, f"{cat} item {pid:03d}", cat, price))
    return rows


def main():
    rng = random.Random(SEED)
    customers = build_customers(rng)
    products = build_products(rng)
    by_country = {}
    for cid, country, _, _ in customers:
        by_country.setdefault(country, []).append(cid)

    sessions_rows, order_rows, item_rows = [], [], []
    order_id = 0
    item_id = 0
    days = (END - START).days + 1

    for d in range(days):
        day = START + dt.timedelta(days=d)
        weekend = 1.15 if day.weekday() >= 5 else 1.0
        growth = 1.0 + 0.25 * (d / days)  # gentle growth over two years
        in_driver_window = day >= DRIVER_START

        for country, (code, cw, cmult) in COUNTRIES.items():
            for device, (dw, conv) in DEVICES.items():
                for channel, chw in CHANNELS.items():
                    lam = 3000 * cw * dw * chw * weekend * growth
                    n_sessions = poisson(rng, lam)
                    if n_sessions == 0:
                        continue
                    sessions_rows.append((day, country, device, channel, n_sessions))

                    p_conv = conv * cmult
                    for _ in range(n_sessions):
                        if rng.random() >= p_conv:
                            continue
                        payment = weighted(rng, PAYMENTS_BY_DEVICE[device])
                        if (
                            in_driver_window
                            and country == DRIVER_COUNTRY
                            and device == DRIVER_DEVICE
                            and payment == DRIVER_PAYMENT
                            and rng.random() < DRIVER_LOSS
                        ):
                            continue  # planted: checkout fails, no order recorded

                        order_id += 1
                        cid = rng.choice(by_country[country])
                        ts = dt.datetime.combine(day, dt.time()) + dt.timedelta(
                            seconds=rng.randint(0, 86399)
                        )
                        cancelled = rng.random() < 0.03
                        refunded = (not cancelled) and rng.random() < 0.04
                        status = "cancelled" if cancelled else "completed"
                        order_rows.append(
                            (order_id, cid, ts, day, country, device, channel,
                             payment, status, refunded)
                        )
                        for _ in range(rng.choice([1, 1, 1, 2, 2, 3])):
                            item_id += 1
                            pid, _, _, price = rng.choice(products)
                            qty = rng.choice([1, 1, 1, 2, 3])
                            item_rows.append(
                                (item_id, order_id, pid, qty, price,
                                 round(qty * price, 2))
                            )

    if os.path.exists(OUT):
        os.remove(OUT)
    con = duckdb.connect(OUT)
    con.execute(
        "CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, country VARCHAR, "
        "signup_date DATE, segment VARCHAR)"
    )
    con.execute(
        "CREATE TABLE products (product_id INTEGER PRIMARY KEY, product_name VARCHAR, "
        "category VARCHAR, list_price DECIMAL(10,2))"
    )
    con.execute(
        "CREATE TABLE sessions (session_date DATE, country VARCHAR, device VARCHAR, "
        "channel VARCHAR, sessions INTEGER)"
    )
    con.execute(
        "CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer_id INTEGER, "
        "order_ts TIMESTAMP, order_date DATE, country VARCHAR, device VARCHAR, "
        "channel VARCHAR, payment_method VARCHAR, status VARCHAR, is_refunded BOOLEAN)"
    )
    con.execute(
        "CREATE TABLE order_items (order_item_id INTEGER PRIMARY KEY, order_id INTEGER, "
        "product_id INTEGER, quantity INTEGER, unit_price DECIMAL(10,2), "
        "line_amount DECIMAL(12,2))"
    )
    con.executemany("INSERT INTO customers VALUES (?, ?, ?, ?)", customers)
    con.executemany("INSERT INTO products VALUES (?, ?, ?, ?)", products)
    con.executemany("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)", sessions_rows)
    con.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", order_rows)
    con.executemany("INSERT INTO order_items VALUES (?, ?, ?, ?, ?, ?)", item_rows)

    for t in ["customers", "products", "sessions", "orders", "order_items"]:
        n = con.sql(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"{t:12s} {n:>8,d} rows")
    con.close()
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
