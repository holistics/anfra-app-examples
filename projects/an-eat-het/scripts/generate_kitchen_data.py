"""Build data/kitchen.duckdb: three years of a fine-dining tasting-menu restaurant, its menus, sales, waste and guest ratings.

Twelve seasonal menus (Winter Dec-Feb, Spring Mar-May, Summer Jun-Aug, Autumn Sep-Nov), 12-13 courses each. Every guest
eats every course. Most courses belong to one season and come back when that season does, with a few swapped; two
signature courses stay on every menu, and each menu carries one course over from another season.

Everything is synthetic except the fruit rows of the seasonal calendar, a hand-compiled summary of when Vietnamese fruit
is in season (general public knowledge, sources still to be cited); the vegetable and other rows are synthetic.
Fixed seed, so a rebuild is byte for byte the same.

The waste cycle (suppliers, waste_flow, reuse_links) is generated from the per-ingredient waste of the main loop, with
its own random generators, so every other table is identical with or without it.
"""
import datetime as dt
import math
import os
import random
import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "kitchen.duckdb")
rng = random.Random(2026)

LAST_DAY = dt.date(2026, 10, 15)
M = lambda *a: list(a)

# name, category, cost USD/kg, in-season months, shoulder months, trim share (prep waste); None months = year-round
ING = [
    ("Mango", "fruit", 2.2, M(3, 4, 5, 6), M(2, 7), 0.30),
    ("Mangosteen", "fruit", 4.5, M(5, 6, 7, 8), M(4, 9), 0.55),
    ("Rambutan", "fruit", 3.0, M(5, 6, 7, 8), M(4, 9), 0.45),
    ("Lychee", "fruit", 5.5, M(5, 6, 7), M(4, 8), 0.40),
    ("Longan", "fruit", 3.2, M(6, 7, 8), M(5, 9), 0.40),
    ("Pomelo", "fruit", 2.0, M(1, 2, 8, 9, 10), M(7, 11, 12), 0.45),
    ("Mandarin", "fruit", 2.8, M(12, 1, 2), M(11, 3), 0.25),
    ("Durian", "fruit", 6.0, M(5, 6, 7, 8), M(4, 9), 0.65),
    ("Jackfruit", "fruit", 1.8, M(4, 5, 6, 7, 8), M(3, 9), 0.50),
    ("Dragon Fruit", "fruit", 2.0, M(5, 6, 7, 8, 9), M(4, 10), 0.30),
    ("Strawberry", "fruit", 6.0, M(12, 1, 2, 3), M(11, 4), 0.08),
    ("Persimmon", "fruit", 4.0, M(10, 11, 12), M(9, 1), 0.15),
    ("Passion Fruit", "fruit", 5.0, M(12, 1, 2, 3, 4), M(11, 5), 0.45),
    ("Avocado", "fruit", 4.5, M(7, 8, 9), M(6, 10), 0.30),
    ("Soursop", "fruit", 3.5, M(6, 7, 8), M(5, 9), 0.35),
    ("Bamboo Shoot", "vegetable", 2.5, M(6, 7, 8, 9, 10), M(5, 11), 0.40),
    ("Lotus Root", "vegetable", 3.0, M(9, 10, 11, 12), M(8, 1), 0.25),
    ("Pumpkin Flower", "vegetable", 3.5, M(4, 5, 6, 7, 8), M(3, 9), 0.15),
    ("Water Spinach", "vegetable", 1.2, M(6, 7, 8, 9, 10), M(5, 11), 0.20),
    ("Tomato", "vegetable", 1.5, M(11, 12, 1, 2, 3), M(10, 4), 0.10),
    ("Sweet Potato", "vegetable", 1.4, M(11, 12, 1, 2), M(10, 3), 0.12),
    ("Taro", "vegetable", 2.0, M(10, 11, 12, 1, 2), M(9, 3), 0.15),
    ("Green Rice", "grain", 5.0, M(9, 10, 11), M(8, 12), 0.0),
    ("Lotus Seed", "vegetable", 7.0, M(9, 10, 11), M(8, 12), 0.25),
    ("Water Lily Bud", "vegetable", 4.0, M(9, 10, 11), M(8, 12), 0.10),
    ("Sesbania Flower", "vegetable", 5.0, M(9, 10, 11), M(8, 12), 0.05),
    ("Wild Mushroom", "vegetable", 14.0, M(6, 7, 8, 9), M(5, 10), 0.10),
    ("Corn", "vegetable", 1.2, M(4, 5, 6), M(3, 7), 0.30),
    ("Turmeric", "herb", 4.0, M(11, 12, 1), M(10, 2), 0.10),
    ("Mud Crab", "protein", 18.0, M(10, 11, 12, 1, 2), M(9, 3), 0.60),
    ("Duck", "protein", 9.0, M(11, 12, 1, 2), M(10, 3), 0.30),
    ("Jasmine Rice", "grain", 1.6, None, None, 0.0),
    ("Glutinous Rice", "grain", 2.3, None, None, 0.0),
    ("Rice Noodles", "grain", 2.0, None, None, 0.0),
    ("Pork Belly", "protein", 7.5, None, None, 0.12),
    ("Beef Short Rib", "protein", 14.0, None, None, 0.25),
    ("Free-range Chicken", "protein", 6.5, None, None, 0.20),
    ("Quail", "protein", 9.0, None, None, 0.20),
    ("Sea Bass", "protein", 12.0, None, None, 0.35),
    ("Grouper", "protein", 16.0, None, None, 0.35),
    ("Tiger Prawn", "protein", 15.0, None, None, 0.35),
    ("Squid", "protein", 9.0, None, None, 0.25),
    ("Tofu", "protein", 2.2, None, None, 0.03),
    ("Banana Blossom", "vegetable", 2.0, None, None, 0.30),
    ("Egg", "pantry", 3.5, None, None, 0.05),
    ("Coconut Milk", "pantry", 2.5, None, None, 0.0),
    ("Palm Sugar", "pantry", 3.0, None, None, 0.0),
    ("Fish Sauce", "pantry", 3.0, None, None, 0.0),
    ("Cacao", "pantry", 12.0, None, None, 0.0),
    ("Lemongrass", "herb", 1.5, None, None, 0.30),
    ("Pandan", "herb", 3.0, None, None, 0.20),
    ("Mixed Herbs", "herb", 6.0, None, None, 0.15),
]
ING_ID = {r[0]: i + 1 for i, r in enumerate(ING)}

# course name, kind, price USD, {ingredient: kg per plate}
SIGNATURE = [
    ("Pho Consomme, Beef Tendon", "Soup", 16, {"Beef Short Rib": .06, "Rice Noodles": .03, "Mixed Herbs": .01, "Lemongrass": .005}),
    ("Mango Sticky Rice", "Dessert", 12, {"Mango": .08, "Glutinous Rice": .05, "Coconut Milk": .04, "Palm Sugar": .01}),
]
POOLS = {
    "Winter": [
        ("Mandarin & Prawn Crudo", "Starter", 15, {"Tiger Prawn": .05, "Mandarin": .03, "Mixed Herbs": .01}),
        ("Tomato Consomme, Crab", "Soup", 14, {"Tomato": .12, "Mud Crab": .04, "Mixed Herbs": .01}),
        ("Turmeric-cured Sea Bass", "Fish", 24, {"Sea Bass": .08, "Turmeric": .01, "Coconut Milk": .03}),
        ("Roast Duck, Persimmon", "Meat", 30, {"Duck": .12, "Persimmon": .05, "Palm Sugar": .01}),
        ("Taro & Coconut Veloute", "Soup", 12, {"Taro": .08, "Coconut Milk": .05}),
        ("Sweet Potato, Fermented Chilli", "Vegetable", 13, {"Sweet Potato": .10, "Fish Sauce": .01, "Mixed Herbs": .01}),
        ("Mud Crab, Pomelo Salad", "Starter", 18, {"Mud Crab": .06, "Pomelo": .04, "Mixed Herbs": .01}),
        ("Strawberry & Basil Sorbet", "Dessert", 12, {"Strawberry": .08, "Palm Sugar": .01}),
        ("Passion Fruit Tart", "Dessert", 12, {"Passion Fruit": .06, "Egg": .03, "Coconut Milk": .02}),
        ("Pomelo Granita", "Pre-dessert", 8, {"Pomelo": .08, "Palm Sugar": .01}),
        ("Beef Cheek, Tomato", "Meat", 32, {"Beef Short Rib": .12, "Tomato": .05}),
        ("Squid, Tomato Jam", "Starter", 14, {"Squid": .07, "Tomato": .04}),
        ("Mandarin Petit Fours", "Petit four", 6, {"Mandarin": .02, "Cacao": .01, "Palm Sugar": .005}),
    ],
    "Spring": [
        ("Corn Veloute, Prawn", "Soup", 13, {"Corn": .10, "Tiger Prawn": .04, "Coconut Milk": .03}),
        ("Stuffed Pumpkin Flower", "Starter", 13, {"Pumpkin Flower": .06, "Tofu": .04, "Mixed Herbs": .01}),
        ("Mango Squid Ceviche", "Starter", 15, {"Squid": .06, "Mango": .05, "Mixed Herbs": .01}),
        ("Young Jackfruit, Coconut", "Vegetable", 13, {"Jackfruit": .10, "Coconut Milk": .04, "Lemongrass": .01}),
        ("Grilled Grouper, Corn", "Fish", 26, {"Grouper": .09, "Corn": .05, "Lemongrass": .01}),
        ("Quail, Lychee", "Meat", 28, {"Quail": .10, "Lychee": .04, "Palm Sugar": .01}),
        ("Dragon Fruit Sea Bass Ceviche", "Starter", 16, {"Sea Bass": .06, "Dragon Fruit": .05}),
        ("Mangosteen Sorbet", "Dessert", 11, {"Mangosteen": .08, "Palm Sugar": .01}),
        ("Rambutan & Lychee Salad", "Pre-dessert", 9, {"Rambutan": .04, "Lychee": .04, "Mixed Herbs": .01}),
        ("Durian Ice Cream", "Dessert", 13, {"Durian": .07, "Coconut Milk": .04}),
        ("Pork Belly, Mango Pickle", "Meat", 27, {"Pork Belly": .12, "Mango": .04}),
        ("Banana Blossom Salad", "Vegetable", 12, {"Banana Blossom": .08, "Tiger Prawn": .03}),
        ("Pandan Petit Fours", "Petit four", 6, {"Pandan": .02, "Coconut Milk": .01, "Palm Sugar": .005}),
    ],
    "Summer": [
        ("Wild Mushroom Broth", "Soup", 14, {"Wild Mushroom": .08, "Mixed Herbs": .01}),
        ("Bamboo Shoot, Free-range Chicken", "Meat", 24, {"Bamboo Shoot": .08, "Free-range Chicken": .12}),
        ("Water Spinach, Garlic Egg", "Vegetable", 11, {"Water Spinach": .10, "Egg": .03}),
        ("Avocado, Cold Prawn", "Starter", 15, {"Avocado": .06, "Tiger Prawn": .04}),
        ("Soursop Sorbet", "Pre-dessert", 8, {"Soursop": .08, "Palm Sugar": .01}),
        ("Longan Jelly", "Dessert", 11, {"Longan": .06, "Coconut Milk": .03}),
        ("Durian Mille-feuille", "Dessert", 13, {"Durian": .06, "Egg": .03, "Coconut Milk": .02}),
        ("Lychee Granita", "Pre-dessert", 8, {"Lychee": .07}),
        ("Grilled Sea Bass, Bamboo", "Fish", 25, {"Sea Bass": .10, "Bamboo Shoot": .04}),
        ("Pumpkin Flower Tempura", "Starter", 13, {"Pumpkin Flower": .06, "Tofu": .04}),
        ("Young Jackfruit Curry", "Meat", 22, {"Jackfruit": .12, "Coconut Milk": .06, "Lemongrass": .01}),
        ("Dragon Fruit Salad, Squid", "Starter", 14, {"Dragon Fruit": .05, "Squid": .05}),
        ("Longan Petit Fours", "Petit four", 6, {"Longan": .02, "Cacao": .01}),
    ],
    "Autumn": [
        ("Lotus Root & Prawn Salad", "Starter", 15, {"Lotus Root": .08, "Tiger Prawn": .04, "Pomelo": .03}),
        ("Green Rice, Sea Bass", "Fish", 25, {"Sea Bass": .09, "Green Rice": .03}),
        ("Sesbania Flower, Egg", "Vegetable", 11, {"Sesbania Flower": .05, "Egg": .03, "Fish Sauce": .005}),
        ("Lotus Seed Veloute", "Soup", 12, {"Lotus Seed": .06, "Coconut Milk": .05}),
        ("Water Lily Bud, Squid", "Starter", 14, {"Water Lily Bud": .06, "Squid": .05}),
        ("Mud Crab, Persimmon", "Fish", 28, {"Mud Crab": .08, "Persimmon": .03}),
        ("Roast Duck, Taro", "Meat", 30, {"Duck": .12, "Taro": .05}),
        ("Pomelo Sorbet", "Pre-dessert", 8, {"Pomelo": .08, "Palm Sugar": .01}),
        ("Persimmon Panna Cotta", "Dessert", 12, {"Persimmon": .06, "Coconut Milk": .06}),
        ("Green Rice Pudding", "Dessert", 11, {"Green Rice": .05, "Coconut Milk": .05, "Palm Sugar": .01}),
        ("Bamboo Shoot Chicken", "Meat", 24, {"Bamboo Shoot": .06, "Free-range Chicken": .12}),
        ("Wild Mushroom, Egg Yolk", "Starter", 15, {"Wild Mushroom": .08, "Egg": .03}),
        ("Lotus Petit Fours", "Petit four", 6, {"Lotus Seed": .02, "Cacao": .01}),
    ],
}
COOK_RATE = {"Soup": .05, "Starter": .05, "Fish": .07, "Meat": .09, "Vegetable": .05, "Dessert": .04, "Pre-dessert": .03, "Petit four": .04}
# guests by calendar month: Tet and the dry-season tourists lift Dec-Feb, the rainy months are quieter
MONTH_DEMAND = {1: 1.15, 2: 1.20, 3: 1.05, 4: 0.95, 5: 0.88, 6: 0.85, 7: 0.90, 8: 0.88, 9: 0.95, 10: 1.02, 11: 1.10, 12: 1.25}
# the order a tasting menu is eaten in; course numbers follow it
KIND_ORDER = ["Starter", "Soup", "Vegetable", "Fish", "Meat", "Pre-dessert", "Dessert", "Petit four"]
PLATE_RATE = {"Soup": .04, "Starter": .035, "Fish": .05, "Meat": .055, "Vegetable": .035, "Dessert": .04, "Pre-dessert": .03, "Petit four": .055}

SEASONS = {"Winter": (12, 1, 2), "Spring": (3, 4, 5), "Summer": (6, 7, 8), "Autumn": (9, 10, 11)}
ORDER = ["Winter", "Spring", "Summer", "Autumn"]
PRICE_INDEX = {"in_season": 1.0, "shoulder": 1.12, "out_of_season": 1.45}
SPOIL = {"in_season": 0.015, "shoulder": 0.04, "out_of_season": 0.11}
TRIM_UP = {"in_season": 1.0, "shoulder": 1.1, "out_of_season": 1.35}
SCORE = {"in_season": 1.0, "shoulder": 0.5, "out_of_season": 0.0}
COST_SCALE = 6.0  # premium sourcing: a plate costs about a quarter of its price

# Suppliers: name, region, kind, is_local, ingredients bought from them
SUPPLIERS = [
    ("Da Lat Highland Farm", "Da Lat", "farm", True, ["Strawberry", "Persimmon", "Tomato", "Mixed Herbs"]),
    ("Da Lat Root Growers", "Da Lat", "farm", True, ["Sweet Potato", "Taro", "Turmeric", "Corn"]),
    ("Lam Dong Mushroom Farm", "Da Lat", "farm", True, ["Wild Mushroom", "Bamboo Shoot"]),
    ("Lam Dong Durian Grove", "Da Lat", "farm", True, ["Durian", "Jackfruit", "Avocado", "Passion Fruit"]),
    ("Mekong Orchard Co-op", "Mekong Delta", "farm", True, ["Mango", "Mangosteen", "Rambutan", "Lychee", "Longan", "Pomelo", "Mandarin", "Dragon Fruit", "Soursop"]),
    ("Ben Tre Coconut Growers", "Mekong Delta", "farm", True, ["Coconut Milk", "Palm Sugar", "Pandan", "Lemongrass"]),
    ("Dong Thap Vegetable Garden", "Mekong Delta", "farm", True, ["Water Spinach", "Lotus Root", "Lotus Seed", "Water Lily Bud", "Sesbania Flower", "Banana Blossom", "Pumpkin Flower"]),
    ("Dong Thap Rice Farm", "Mekong Delta", "farm", True, ["Jasmine Rice", "Glutinous Rice", "Green Rice", "Rice Noodles"]),
    ("Ca Mau Crab Fishery", "Mekong Delta", "fishery", True, ["Mud Crab", "Tiger Prawn"]),
    ("Nha Trang Fishery", "Central coast", "fishery", True, ["Sea Bass", "Grouper", "Squid", "Fish Sauce"]),
    ("Dong Nai Free-range Farm", "Central coast", "farm", True, ["Free-range Chicken", "Quail", "Duck", "Egg", "Pork Belly"]),
    ("Binh Duong Tofu Makers", "Central coast", "farm", True, ["Tofu"]),
    ("Imported Meat and Pantry", "Imported", "importer", False, ["Beef Short Rib", "Cacao"]),
]
SUPPLIER_OF = {n: i + 1 for i, sp in enumerate(SUPPLIERS) for n in sp[4]}
assert set(SUPPLIER_OF) == {r[0] for r in ING}, "every ingredient needs a supplier"

# Where waste goes, by what the ingredient is and the stage it is lost at: (reused, compost, feed, landfill).
# Reused: stock from bones and shells, cordial and powder from peel, fond, staff meal. Feed: safe, unsalted scraps only.
FOODGROUP = {"Mud Crab": "seafood", "Tiger Prawn": "seafood", "Sea Bass": "seafood", "Grouper": "seafood", "Squid": "seafood"}
def group(name, category):
    return FOODGROUP.get(name) or ("meat" if category == "protein" else category)
DEST = {
    "prep": {"seafood": (.60, .20, .10, .10), "meat": (.55, .15, .20, .10), "fruit": (.35, .40, .20, .05), "vegetable": (.25, .40, .30, .05),
             "herb": (.40, .50, .00, .10), "grain": (.10, .30, .30, .30), "pantry": (.10, .30, .30, .30)},
    "cooking": {"seafood": (.55, .10, .10, .25), "meat": (.60, .08, .12, .20), "fruit": (.40, .25, .20, .15), "vegetable": (.40, .25, .20, .15),
                "herb": (.30, .30, .00, .40), "grain": (.20, .20, .30, .30), "pantry": (.30, .15, .10, .45)},
    "plate": {"seafood": (.00, .20, .25, .55), "meat": (.00, .20, .25, .55), "fruit": (.00, .30, .40, .30), "vegetable": (.00, .30, .40, .30),
              "herb": (.00, .50, .00, .50), "grain": (.00, .20, .40, .40), "pantry": (.00, .20, .20, .60)},
    "storage": {g: (.10, .55, .20, .15) for g in ("seafood", "meat", "fruit", "vegetable", "herb", "grain", "pantry")},
    "farm": {g: (.00, .55, .35, .10) for g in ("seafood", "meat", "fruit", "vegetable", "herb", "grain", "pantry")},
}
FARM_LOSS = {"farm": .07, "fishery": .03, "importer": .02}   # share of what the kitchen needs, lost before it arrives


def status(ing, month):
    inn, sho = ING[ing - 1][3], ING[ing - 1][4]
    if inn is None or month in inn:
        return "in_season"
    return "shoulder" if month in sho else "out_of_season"


def menu_windows():
    """12 menus: Winter 2024 (Dec 2023 - Feb 2024) through Autumn 2026."""
    out, y, i = [], 2023, 0
    for n in range(12):
        s = ORDER[i]
        first = SEASONS[s][0]
        start = dt.date(y, first, 1)
        nm = first + 3
        end = dt.date(y + (1 if nm > 12 else 0), (nm - 1) % 12 + 1, 1) - dt.timedelta(days=1)
        label_year = y + (1 if s == "Winter" else 0)
        out.append((n + 1, label_year, s, start, end))
        y += 1 if nm > 12 else 0
        i = (i + 1) % 4
    return out


def main():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    if os.path.exists(DB):
        os.remove(DB)
    con = duckdb.connect(DB)

    concepts = {}  # name -> (id, kind, price, ings)
    def concept(c):
        if c[0] not in concepts:
            concepts[c[0]] = (len(concepts) + 1, c[1], c[2], c[3])
        return concepts[c[0]]

    menus = menu_windows()
    menu_rows, dish_rows, di_rows, cal_rows = [], [], [], []
    for ing_id in range(1, len(ING) + 1):
        for m in range(1, 13):
            st = status(ing_id, m)
            cal_rows.append((ing_id, m, st, PRICE_INDEX[st]))

    dish_id = 0
    dish_meta = {}
    for menu in menus:
        mid, year, season, start, end = menu
        menu_rows.append((mid, year, season, start, end))
        pool = POOLS[season]
        petit = pool[-1]
        own = rng.sample(pool[:-1], 9)
        others = [c for s2, p in POOLS.items() if s2 != season for c in p[:-1]]
        carry = rng.choice(others)
        courses = list(SIGNATURE) + own + [carry, petit]
        if rng.random() < 0.4:  # some menus run twelve courses
            courses.remove(rng.choice(own))
        served = sorted(range(len(courses)), key=lambda i: KIND_ORDER.index(courses[i][1]))
        course_no = {i: k + 1 for k, i in enumerate(served)}
        for i, c in enumerate(courses):
            cid, kind, base_price, ings = concept(c)
            dish_id += 1
            price = round(base_price * (1 + 0.035 * (year - 2023)) * rng.uniform(0.98, 1.03), 1)
            dish_rows.append((dish_id, cid, mid, c[0], kind, price, course_no[i]))
            dish_meta[dish_id] = (c, menu, price)
            for n_, q in ings.items():
                di_rows.append((dish_id, ING_ID[n_], q))

    menu_price = {}  # what one guest pays for the set menu: the sum of its course prices
    for r in dish_rows:
        menu_price[r[2]] = menu_price.get(r[2], 0) + r[5]
    con.execute("create table menus (menu_id int, year int, season varchar, start_date date, end_date date, menu_price double)")
    con.executemany("insert into menus values (?,?,?,?,?,?)", [(*r, round(menu_price[r[0]], 1)) for r in menu_rows])
    con.execute("create table dish_concepts (concept_id int, concept_name varchar)")
    con.executemany("insert into dish_concepts values (?,?)", [(v[0], k) for k, v in concepts.items()])
    con.execute("create table dishes (dish_id int, concept_id int, menu_id int, name varchar, category varchar, price double, course_no int)")
    con.executemany("insert into dishes values (?,?,?,?,?,?,?)", dish_rows)
    con.execute("create table ingredients (ingredient_id int, name varchar, category varchar, unit_cost double, is_seasonal boolean, trim_share double, supplier_id int)")
    con.executemany("insert into ingredients values (?,?,?,?,?,?,?)",
                    [(i + 1, r[0], r[1], round(r[2] * COST_SCALE, 2), r[3] is not None, r[5], SUPPLIER_OF[r[0]]) for i, r in enumerate(ING)])
    con.execute("create table suppliers (supplier_id int, name varchar, region varchar, kind varchar, is_local boolean)")
    con.executemany("insert into suppliers values (?,?,?,?,?)", [(i + 1, sp[0], sp[1], sp[2], sp[3]) for i, sp in enumerate(SUPPLIERS)])
    con.execute("create table dish_ingredients (dish_id int, ingredient_id int, qty_per_plate double)")
    con.executemany("insert into dish_ingredients values (?,?,?)", di_rows)
    con.execute("create table seasonal_calendar (ingredient_id int, month int, status varchar, price_index double)")
    con.executemany("insert into seasonal_calendar values (?,?,?,?)", cal_rows)

    # Covers per service day, shared by every course on that day's menu: a set tasting menu.
    wd = [0.85, 0.9, 0.95, 1.05, 1.25, 1.4, 1.1]  # Mon..Sun
    covers_by_day = {}
    day = menus[0][3]
    while day <= LAST_DAY:
        years_in = (day - dt.date(2023, 12, 1)).days / 365
        m_start = next(m[3] for m in menus if m[3] <= day <= m[4])
        launch = 1 + 0.15 * max(0.0, 1 - (day - m_start).days / 21)  # a new menu pulls guests in for its first three weeks
        base = 36 * wd[day.weekday()] * (1 + 0.10 * years_in) * MONTH_DEMAND[day.month] * launch
        event = rng.random()  # now and then a private dinner fills the room, or a storm empties it
        base *= 1.35 if event < 0.04 else 0.5 if event > 0.985 else 1.0
        covers_by_day[day] = max(8, round(rng.gauss(base, base * 0.08)))
        day += dt.timedelta(days=1)

    con.execute("create table service_day (date date, menu_id int, covers int)")
    con.executemany("insert into service_day values (?,?,?)", [
        (d, next(m[0] for m in menus if m[3] <= d <= m[4]), c) for d, c in covers_by_day.items()])

    # Drinks pairings: three offers sold on top of the set menu. They use their own random generator, so nothing
    # generated elsewhere moves when this changes.
    prng = random.Random(20261016)
    OFFERS = [("Wine pairing", "wine", .55, .30), ("Reserve wine pairing", "reserve", .90, .35), ("Non-alcoholic pairing", "non_alcoholic", .35, .12)]
    pairing_rows, pairing_meta, pid = [], {}, 0
    for menu in menus:
        for name, kind, price_share, cost_share in OFFERS:
            pid += 1
            price = round(menu_price[menu[0]] * price_share * prng.uniform(0.97, 1.03))
            cost = round(price * cost_share * prng.uniform(0.9, 1.1), 2)
            pairing_rows.append((pid, menu[0], name, kind, price, cost))
            pairing_meta[(menu[0], kind)] = (pid, price, cost)
    span = (LAST_DAY - menus[0][3]).days
    pair_day_rows = []
    for d, covers in covers_by_day.items():
        mid = next(m[0] for m in menus if m[3] <= d <= m[4])
        t = (d - menus[0][3]).days / span
        weekend = 1.3 if d.weekday() in (4, 5) else 1.0   # Fri and Sat
        rate = {"wine": 0.47 - 0.06 * t, "reserve": 0.11 * weekend, "non_alcoholic": 0.10 + 0.16 * t}   # non-alcoholic grows over the three years
        guests = {k: max(0, round(covers * r * prng.gauss(1, 0.08))) for k, r in rate.items()}
        total = sum(guests.values())
        if total > covers:   # a guest takes at most one pairing
            guests = {k: int(g * covers / total) for k, g in guests.items()}
        for kind, g in guests.items():
            pair_id, price, cost = pairing_meta[(mid, kind)]
            pair_day_rows.append((d, pair_id, g, round(g * price, 2), round(g * cost, 2)))
    con.execute("create table pairings (pairing_id int, menu_id int, name varchar, kind varchar, price double, cost_per_guest double)")
    con.executemany("insert into pairings values (?,?,?,?,?,?)", pairing_rows)
    con.execute("create table pairing_day (date date, pairing_id int, guests int, revenue double, cost double)")
    con.executemany("insert into pairing_day values (?,?,?,?,?)", pair_day_rows)

    # Drinks ordered separately: glasses, bottles, cocktails, coffee, tea, water. A pairing already includes the drinks,
    # so only guests without one order. Its own random generator again.
    drng = random.Random(20261017)
    paired, kind_of = {}, {r[0]: r[3] for r in pairing_rows}
    by_kind = {}
    for d, pair_id, g, rev, cost in pair_day_rows:
        paired[d] = paired.get(d, 0) + g
        by_kind[(d, kind_of[pair_id])] = g
    order_rows = []
    for d, covers in covers_by_day.items():
        years_in = (d - menus[0][3]).days / 365
        orderers = min(covers - paired[d], round((covers - paired[d]) * 0.65 * drng.gauss(1, 0.06)))
        orders = round(orderers * 2.1 * drng.gauss(1, 0.05))
        price = 22 * (1 + 0.035 * years_in) * drng.uniform(0.97, 1.03)
        order_rows.append((d, orderers, orders, round(orders * price, 2), round(orders * price * 0.24 * drng.uniform(0.95, 1.05), 2)))
    con.execute("create table drink_orders (date date, guests int, orders int, revenue double, cost double)")
    con.executemany("insert into drink_orders values (?,?,?,?,?)", order_rows)

    # Drinks waste, in litres and USD, by cause. Some of it is reused: wine dregs go to vinegar and cooking, trim becomes
    # cordial for the non-alcoholic pairing. Own random generator.
    wrng = random.Random(20261018)
    CAUSES = [("open_bottle", "Open bottle loss", 38, 0.4), ("returned", "Returned glasses", 30, 0.0), ("faulty", "Corked or faulty", 55, 0.6),
              ("expired", "Expired stock", 35, 0.0), ("trim", "Garnish and trim", 8, 0.7)]
    waste_rows = []
    for d, covers in covers_by_day.items():
        wine_guests = by_kind[(d, "wine")] + by_kind[(d, "reserve")]
        orderers = next(o for o in order_rows if o[0] == d)[1]
        litres = {
            "open_bottle": wine_guests * 0.08 * wrng.gauss(1, 0.2),
            "returned": paired[d] * 0.02 * wrng.gauss(1, 0.3),
            "faulty": 0.75 if wrng.random() < 0.06 else 0.0,
            "expired": (wrng.uniform(1.5, 3.5) if d.day == 1 else 0.0),
            "trim": (by_kind[(d, "non_alcoholic")] + orderers) * 0.05 * wrng.gauss(1, 0.2),
        }
        for key, label, per_l, reuse in CAUSES:
            l = max(0.0, litres[key])
            if l > 0:
                waste_rows.append((d, label, round(l, 2), round(l * per_l, 2), round(l * reuse, 2)))
    con.execute("create table drink_waste (date date, cause varchar, litres double, cost double, reused_litres double)")
    con.executemany("insert into drink_waste values (?,?,?,?,?)", waste_rows)

    appeal = {}
    rows = []
    ing_rows = []   # per course, day and ingredient: what the main loop wasted, kept for the waste cycle
    for did, (c, menu, price) in dish_meta.items():
        ings = c[3]
        kind = c[1]
        cook_rate, plate_rate = COOK_RATE[kind], PLATE_RATE[kind]
        appeal[c[0]] = appeal.get(c[0], min(4.9, max(3.7, rng.gauss(4.45, 0.22))))
        day = menu[3]
        end = min(menu[4], LAST_DAY)
        while day <= end:
            month = day.month
            covers = covers_by_day[day]
            fit = sum(SCORE[status(ING_ID[n_], month)] for n_ in ings) / len(ings)
            learning = 1.15 - 0.30 * (day - menus[0][3]).days / (LAST_DAY - menus[0][3]).days  # the kitchen wastes less as it learns
            qty = max(1, round(covers * rng.uniform(0.94, 1.0)))
            prep = cook = plate = spoil = 0.0
            pc = cc = plc = sc = 0.0
            for n_, q in ings.items():
                iid = ING_ID[n_]
                st = status(iid, month)
                cost = ING[iid - 1][2] * COST_SCALE * PRICE_INDEX[st]
                p = q * ING[iid - 1][5] * TRIM_UP[st] * qty * rng.uniform(0.9, 1.1) * learning
                ck = q * cook_rate * qty * rng.uniform(0.85, 1.15) * learning
                pl = q * plate_rate * qty * rng.uniform(0.5, 1.6) * learning
                sp = q * SPOIL[st] * (1.6 if ING[iid - 1][1] in ("fruit", "vegetable", "herb") else 1) \
                    * max(qty, covers * 0.6) * rng.lognormvariate(-0.2, 0.7) * learning
                prep += p; cook += ck; plate += pl; spoil += sp
                ing_rows.append((day, did, iid, st, p, ck, pl, sp, cost, qty, q))
                pc += p * cost; cc += ck * cost; plc += pl * cost; sc += sp * cost
            count = max(1, round(qty * 0.4))
            mean = min(5.0, max(3.0, appeal[c[0]] - 0.45 * (1 - fit) + rng.gauss(0, 0.12)))
            rows.append((day, did, qty, round(qty * price, 2),
                         round(prep, 3), round(cook, 3), round(plate, 3), round(spoil, 3),
                         round(pc, 2), round(cc, 2), round(plc, 2), round(sc, 2),
                         round(count * mean, 2), count))
            day += dt.timedelta(days=1)
    con.execute("""create table dish_day (date date, dish_id int, qty_sold int, revenue double,
        prep_qty double, cooking_qty double, plate_qty double, spoilage_qty double,
        prep_cost double, cooking_cost double, plate_cost double, spoilage_cost double,
        rating_total double, rating_count int)""")
    con.executemany("insert into dish_day values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)

    # The waste cycle. Each kilo the main loop wasted is split by where it went. Own random generators.
    frng = random.Random(20261019)
    span_days = (LAST_DAY - menus[0][3]).days
    cat = {i + 1: r[1] for i, r in enumerate(ING)}
    name = {i + 1: r[0] for i, r in enumerate(ING)}
    kind_of_ing = {i + 1: SUPPLIERS[SUPPLIER_OF[r[0]] - 1][2] for i, r in enumerate(ING)}
    STAGE_OF = (("prep", 4), ("cooking", 5), ("plate", 6), ("storage", 7))
    flow_path = os.path.join(os.path.dirname(DB), "waste_flow.csv")
    flows = 0
    with open(flow_path, "w") as f:
        for day, did, iid, st, p, ck, pl, sp, cost, qty, q in ing_rows:
            t = (day - menus[0][3]).days / span_days
            g = group(name[iid], cat[iid])
            for stage, k in STAGE_OF:
                kg = (p, ck, pl, sp)[k - 4]
                shares = list(DEST[stage][g])
                shares[3] *= (1.25 - 0.45 * t) * (1.5 if st == "out_of_season" else 1.0)   # the kitchen diverts more as it learns; imports and off-season stock go to waste more
                shares = [max(0.0, x * frng.gauss(1, 0.12)) for x in shares]
                tot = sum(shares)
                for dest, sh in zip(("reused", "compost", "feed", "landfill"), shares):
                    if sh > 0:
                        f.write(f"{day},{did},{iid},{stage},{dest},{kg * sh / tot:.6f},{kg * sh / tot * cost:.5f}\n")
                        flows += 1
            # loss on the farm before the food reaches the kitchen: not charged to the kitchen
            kg = q * qty * FARM_LOSS[kind_of_ing[iid]] * (1.4 if st == "out_of_season" else 1.0) * frng.uniform(0.6, 1.4)
            shares = [max(0.0, x * frng.gauss(1, 0.1)) for x in DEST["farm"][g]]
            tot = sum(shares)
            for dest, sh in zip(("reused", "compost", "feed", "landfill"), shares):
                if sh > 0:
                    f.write(f"{day},{did},{iid},farm,{dest},{kg * sh / tot:.6f},{kg * sh / tot * cost:.5f}\n")
                    flows += 1
    con.execute("create table waste_flow (date date, dish_id int, ingredient_id int, stage varchar, destination varchar, kg double, cost double)")
    con.execute(f"copy waste_flow from '{flow_path}' (format csv)")
    os.remove(flow_path)

    # Where the reused kilos go: a course on the same menu or the non-alcoholic pairing. Shares add to 1 per source and ingredient.
    dishes_of = {}
    for r in dish_rows:
        dishes_of.setdefault(r[2], []).append(r)
    reuse_rows = []
    used = {(r[0], r[1]) for r in con.execute("select distinct dish_id, ingredient_id from waste_flow where destination = 'reused' and stage <> 'farm'").fetchall()}
    for did in sorted({d for d, _ in used}):
        mid = dish_meta[did][1][0]
        menu_courses = [r for r in dishes_of[mid] if r[0] != did]
        nonalc = pairing_meta[(mid, "non_alcoholic")][0]
        def pick(kinds):
            cands = [r for r in menu_courses if r[4] in kinds]
            return cands[0][0] if cands else None
        for iid in sorted(i for d, i in used if d == did):
            g = group(name[iid], cat[iid])
            if g in ("seafood", "meat"):
                plan = [("course", pick(("Soup",)), .7), ("course", pick(("Vegetable", "Starter")), .3)]
            elif g == "fruit":
                plan = [("course", pick(("Petit four",)), .4), ("course", pick(("Pre-dessert", "Dessert")), .3), ("pairing", nonalc, .3)]
            elif g == "vegetable":
                plan = [("course", pick(("Soup",)), .5), ("pairing", nonalc, .3), ("course", pick(("Vegetable", "Starter")), .2)]
            elif g == "herb":
                plan = [("pairing", nonalc, .6), ("course", pick(("Starter", "Fish")), .4)]
            else:
                plan = [("staff_meal", None, 1.0)]
            plan = [(k, t_, s_) for k, t_, s_ in plan if k == "staff_meal" or t_ is not None]
            total = sum(s_ for _, _, s_ in plan) or 1.0
            if not plan:
                plan = [("staff_meal", None, 1.0)]; total = 1.0
            for k, t_, s_ in plan:
                target = {"staff_meal": "Staff meal", "pairing": "Non-alcoholic pairing"}.get(k) or next(r[3] for r in dish_rows if r[0] == t_)
                reuse_rows.append((did, iid, name[iid], k, t_, target, round(s_ / total, 4)))
    con.execute("create table reuse_links (source_dish_id int, ingredient_id int, ingredient varchar, target_kind varchar, target_id int, target_name varchar, kg_share double)")
    con.executemany("insert into reuse_links values (?,?,?,?,?,?,?)", reuse_rows)

    # Reconciliation: the cycle must add up to the kitchen's own waste figures, stage by stage.
    bad = con.execute("""
        with f as (
            select date, dish_id,
                sum(kg) filter (where stage = 'prep') pk, sum(cost) filter (where stage = 'prep') pc,
                sum(kg) filter (where stage = 'cooking') ck, sum(cost) filter (where stage = 'cooking') cc,
                sum(kg) filter (where stage = 'plate') lk, sum(cost) filter (where stage = 'plate') lc,
                sum(kg) filter (where stage = 'storage') sk, sum(cost) filter (where stage = 'storage') sc
            from waste_flow group by 1, 2)
        select count(*) from dish_day d join f using (date, dish_id)
        where abs(d.prep_qty - coalesce(pk, 0)) > .001 or abs(d.cooking_qty - coalesce(ck, 0)) > .001
           or abs(d.plate_qty - coalesce(lk, 0)) > .001 or abs(d.spoilage_qty - coalesce(sk, 0)) > .001
           or abs(d.prep_cost - coalesce(pc, 0)) > .01 or abs(d.cooking_cost - coalesce(cc, 0)) > .01
           or abs(d.plate_cost - coalesce(lc, 0)) > .01 or abs(d.spoilage_cost - coalesce(sc, 0)) > .01""").fetchone()[0]
    missing = con.execute("select count(*) from dish_day d where not exists (select 1 from waste_flow w where w.date = d.date and w.dish_id = d.dish_id)").fetchone()[0]
    assert bad == 0 and missing == 0, f"waste_flow does not reconcile with dish_day: {bad} mismatched days, {missing} missing"
    for t in ("menus", "dish_concepts", "dishes", "ingredients", "dish_ingredients", "seasonal_calendar", "dish_day", "service_day", "pairings", "pairing_day", "drink_orders", "drink_waste", "suppliers", "waste_flow", "reuse_links"):
        print(t, con.execute(f"select count(*) from {t}").fetchone()[0])
    con.close()


if __name__ == "__main__":
    main()
