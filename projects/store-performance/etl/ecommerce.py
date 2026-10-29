"""Deterministic ecommerce sample data for the Store performance dashboard.

Shaped like a typical ecommerce dataset: users, orders, order_items, products,
plus the lookups those reference (categories, merchants, cities, countries). Two years of orders up to
ANCHOR with growth, a weekend dip and a December peak, and five planted events (EVENTS) that the anomaly
plugin is expected to flag at weekly grain. Magnitudes and SEED were tuned by simulating the method:
every event flags (weakest |z| 4.5) and nothing else does, apart from recovery weeks.
"""
import math
import random
from datetime import date, datetime, time, timedelta, timezone

SEED = 12
START = date(2024, 11, 1)
ANCHOR = datetime(2026, 10, 14, tzinfo=timezone.utc)  # data ends just before this; Oct 2026 is a partial month
END = ANCHOR.date()  # exclusive
BASE_ORDERS = 130  # orders a day at START, before the weekday and season factors
BASE_SIGNUPS = 21  # sign-ups a day at START
GROWTH = 0.35  # a year
HISTORY_DAYS = 365  # customers sign up for a year before the first order, on the same growth curve
CANCEL = 0.04
REFUND = 0.02
WEEKDAY = [1.0, 1.02, 1.03, 1.02, 1.05, 0.85, 0.83]  # Mon..Sun

# The planted events: (first day, last day inclusive, effect).
BLACK_FRIDAY = (date(2025, 11, 28), date(2025, 12, 1), 2.5)  # orders ×, at DISCOUNT_BF
DISCOUNT_BF = 0.30
SIGNUP_SURGE = (date(2026, 2, 9), date(2026, 2, 15), 4.0)  # sign-ups ×
OUTAGE = (date(2026, 3, 10), date(2026, 3, 12), 0.05)  # orders ×
STOCKOUT = (date(2026, 6, 8), date(2026, 6, 28), 0.1)  # Electronics units ×
STRIKE = (date(2026, 8, 3), date(2026, 8, 16), 0.25)  # cancellation chance
EVENTS = {
    "black_friday": BLACK_FRIDAY, "signup_surge": SIGNUP_SURGE, "outage": OUTAGE,
    "stockout": STOCKOUT, "strike": STRIKE,
}

COUNTRIES = [  # id, name, code, share of customers, cities
    (1, "United States", "US", 0.35, ["New York", "Los Angeles", "Chicago", "Houston", "Seattle"]),
    (2, "United Kingdom", "GB", 0.15, ["London", "Manchester", "Birmingham", "Leeds", "Glasgow"]),
    (3, "Germany", "DE", 0.12, ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt"]),
    (4, "Australia", "AU", 0.12, ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"]),
    (5, "Singapore", "SG", 0.10, ["Central", "Jurong", "Tampines", "Woodlands", "Punggol"]),
    (6, "Vietnam", "VN", 0.16, ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho"]),
]
CATEGORIES = [  # id, name, share of items, price range, cost as a share of price, nouns
    (1, "Electronics", 0.18, (60, 900), 0.78, ["Headphones", "Speaker", "Smartwatch", "Tablet", "Camera", "Charger", "Keyboard"]),
    (2, "Fashion", 0.18, (15, 120), 0.45, ["Jacket", "Sneakers", "Dress", "Jeans", "Scarf", "Backpack", "Shirt"]),
    (3, "Home & Kitchen", 0.14, (20, 250), 0.55, ["Blender", "Pan Set", "Lamp", "Rug", "Kettle", "Knife Set", "Pillow"]),
    (4, "Beauty", 0.12, (8, 80), 0.40, ["Serum", "Moisturiser", "Lipstick", "Perfume", "Cleanser", "Mask"]),
    (5, "Sports", 0.10, (20, 300), 0.55, ["Yoga Mat", "Dumbbells", "Running Shoes", "Bike Helmet", "Tent", "Racket"]),
    (6, "Books", 0.10, (8, 40), 0.60, ["Novel", "Cookbook", "Biography", "Atlas", "Comic", "Guide"]),
    (7, "Toys", 0.08, (10, 120), 0.50, ["Puzzle", "Robot Kit", "Doll", "Board Game", "Building Set", "Plush"]),
    (8, "Grocery", 0.10, (3, 30), 0.70, ["Coffee", "Olive Oil", "Tea", "Chocolate", "Granola", "Honey"]),
]
ADJECTIVES = ["Classic", "Pro", "Eco", "Urban", "Nordic", "Everyday", "Premium", "Compact", "Studio", "Wild"]
MERCHANTS = [f"{a} {b}" for a in ["Blue", "Red", "North", "Sun", "Oak", "Silver", "Lotus"] for b in ["Goods", "Store", "Co", "Mart"]][:25]
FIRST = ["An", "Ben", "Chloe", "David", "Emma", "Felix", "Grace", "Hana", "Ivan", "Julia", "Khoa", "Linh", "Mia",
         "Noah", "Olivia", "Peter", "Quinn", "Rosa", "Sam", "Tara", "Uma", "Viet", "Will", "Xuan", "Yara", "Zoe"]
LAST = ["Nguyen", "Smith", "Muller", "Brown", "Tran", "Wilson", "Schmidt", "Taylor", "Le", "Jones", "Wagner", "Tan",
        "Lee", "Pham", "Clark", "Weber", "Lim", "Walker", "Hoang", "King"]


def in_range(day, event):
    return event[0] <= day <= event[1]


def season(day):
    """A December peak (×1.5 at mid-December) with a smaller lift through late November, as a smooth bump."""
    peak = date(day.year, 12, 15)
    if day.month < 6:
        peak = date(day.year - 1, 12, 15)
    days = (day - peak).days
    return 1 + 0.5 * math.exp(-(days / 14) ** 2)


def growth(day):
    return (1 + GROWTH) ** ((day - START).days / 365)


def days():
    day = START
    while day < END:
        yield day
        day += timedelta(days=1)


def at(day, rng):
    """A time on `day`, mostly in the daytime."""
    hour = min(23, max(0, int(rng.gauss(14, 4.5))))
    return datetime.combine(day, time(hour, rng.randrange(60), rng.randrange(60)), tzinfo=timezone.utc)


def generate():
    rng = random.Random(SEED)
    countries = [{"id": c[0], "name": c[1], "code": c[2]} for c in COUNTRIES]
    cities, city_weights = [], []
    for cid, _, _, share, names in COUNTRIES:
        for name in names:
            cities.append({"id": len(cities) + 1, "name": name, "country_id": cid})
            city_weights.append(share / len(names))
    categories = [{"id": c[0], "name": c[1]} for c in CATEGORIES]
    merchants = [{"id": i + 1, "name": name} for i, name in enumerate(MERCHANTS)]

    products, by_category = [], {c[0]: [] for c in CATEGORIES}
    for cat_id, _, share, (lo, hi), margin, nouns in CATEGORIES:
        for _ in range(round(300 * share)):
            price = round(math.exp(rng.uniform(math.log(lo), math.log(hi)))) - 0.01
            product = {
                "id": len(products) + 1, "category_id": cat_id,
                "name": f"{rng.choice(ADJECTIVES)} {rng.choice(nouns)} {len(products) + 1}",
                "merchant_id": rng.randrange(len(merchants)) + 1,
                "created_at": at(START - timedelta(days=rng.randrange(30, 700)), rng),
                "price": round(price, 2), "cost": round(price * margin * rng.uniform(0.9, 1.1), 2),
                "product_image_url": None,
            }
            products.append(product)
            by_category[cat_id].append(product)
    category_ids = [c[0] for c in CATEGORIES]
    category_weights = [c[2] for c in CATEGORIES]
    electronics = CATEGORIES[0][0]

    users = []

    def add_user(signed_up):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        uid = len(users) + 1
        users.append({
            "id": uid, "sign_up_date": signed_up.date(), "sign_up_at": signed_up,
            "first_name": first, "last_name": last, "full_name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower()}{uid}@example.com",
            "birth_date": date(rng.randint(1958, 2006), rng.randint(1, 12), rng.randint(1, 28)),
            "gender": rng.choices(["female", "male", "other"], [0.52, 0.46, 0.02])[0],
            "city_id": rng.choices(cities, city_weights)[0]["id"],
        })

    day = START - timedelta(days=HISTORY_DAYS)
    while day < START:  # the customers who were there before the first order
        for _ in range(round(BASE_SIGNUPS * growth(day) * WEEKDAY[day.weekday()] * rng.lognormvariate(0, 0.08))):
            add_user(at(day, rng))
        day += timedelta(days=1)

    orders, items = [], []
    for day in days():
        # Sign-ups first, so a customer can order on a later day.
        signups = BASE_SIGNUPS * growth(day) * WEEKDAY[day.weekday()] * rng.lognormvariate(0, 0.08)
        if in_range(day, SIGNUP_SURGE):
            signups *= SIGNUP_SURGE[2]
        known = len(users)  # customers who signed up before today
        for _ in range(round(signups)):
            add_user(at(day, rng))

        n = BASE_ORDERS * growth(day) * WEEKDAY[day.weekday()] * season(day) * rng.lognormvariate(0, 0.06)
        if in_range(day, BLACK_FRIDAY):
            n *= BLACK_FRIDAY[2]
        if in_range(day, OUTAGE):
            n *= OUTAGE[2]
        for _ in range(round(n)):
            oid = len(orders) + 1
            created = at(day, rng)
            age = (END - day).days
            cancel = STRIKE[2] if in_range(day, STRIKE) else CANCEL
            if rng.random() < cancel:
                status = "cancelled"
            elif age < 2:
                status = "processing"
            elif age < 6:
                status = "shipped"
            elif age > 14 and rng.random() < REFUND:
                status = "refunded"
            else:
                status = "delivered"
            if in_range(day, BLACK_FRIDAY):
                discount = DISCOUNT_BF
            else:
                discount = rng.choices([0, 0.05, 0.10, 0.15], [0.8, 0.08, 0.08, 0.04])[0]
            orders.append({
                "id": oid, "status": status, "created_at": created,
                "user_id": rng.randrange(known) + 1, "discount": discount,
                "delivery_attempts": 0 if status in ("cancelled", "processing") else rng.choices([1, 2, 3], [0.87, 0.10, 0.03])[0],
            })
            seen = set()
            for _ in range(1 + min(6, int(rng.expovariate(1 / 1.9)))):
                cat = rng.choices(category_ids, category_weights)[0]
                if cat == electronics and in_range(day, STOCKOUT) and rng.random() > STOCKOUT[2]:
                    cat = rng.choices(category_ids[1:], category_weights[1:])[0]
                product = rng.choice(by_category[cat])
                if product["id"] in seen:
                    continue
                seen.add(product["id"])
                items.append({"id": len(items) + 1, "order_id": oid, "product_id": product["id"],
                              "quantity": rng.choices([1, 2, 3], [0.8, 0.15, 0.05])[0]})

    return {"countries": countries, "cities": cities, "categories": categories, "merchants": merchants,
            "products": products, "users": users, "orders": orders, "order_items": items}
