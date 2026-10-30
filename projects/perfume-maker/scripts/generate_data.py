"""Build data/perfume.duckdb: a curated, synthetic ingredient library and sample formulas.

Costs, strengths and IFRA limits are plausible, not sourced. Do not use for real compliance.
"""
import csv
import os
import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "perfume.duckdb")

# name, tier, cost_per_ml (USD), strength 1-10, longevity_hours, ifra_max_pct, {family: weight}
ING = [
    ("Bergamot", "top", 0.9, 4, 1.0, 2.0, {"citrus": 0.8, "fresh": 0.2}),
    ("Lemon", "top", 0.5, 4, 0.7, 3.0, {"citrus": 0.9, "fresh": 0.1}),
    ("Grapefruit", "top", 0.6, 4, 0.8, 4.0, {"citrus": 0.8, "fresh": 0.2}),
    ("Mandarin", "top", 0.5, 3, 0.8, 5.0, {"citrus": 0.8, "gourmand": 0.2}),
    ("Pink Pepper", "top", 2.5, 6, 1.5, 3.0, {"spicy": 0.7, "citrus": 0.3}),
    ("Lavender", "top", 0.8, 5, 1.5, 8.0, {"fresh": 0.6, "floral": 0.4}),
    ("Cardamom", "top", 3.0, 6, 2.0, 2.5, {"spicy": 0.8, "fresh": 0.2}),
    ("Aldehyde C-12", "top", 0.4, 7, 1.5, 1.0, {"fresh": 0.8, "floral": 0.2}),
    ("Peppermint", "top", 0.4, 6, 1.0, 2.0, {"fresh": 1.0}),
    ("Basil", "top", 1.5, 5, 1.2, 1.5, {"fresh": 0.6, "spicy": 0.4}),
    ("Jasmine Absolute", "heart", 12.0, 8, 6.0, 4.0, {"floral": 0.85, "gourmand": 0.15}),
    ("Rose Otto", "heart", 25.0, 7, 5.0, 3.0, {"floral": 0.7, "spicy": 0.15, "citrus": 0.15}),
    ("Ylang-Ylang", "heart", 1.8, 7, 5.0, 4.0, {"floral": 0.7, "gourmand": 0.3}),
    ("Geranium", "heart", 2.0, 6, 4.0, 5.0, {"floral": 0.6, "fresh": 0.4}),
    ("Neroli", "heart", 14.0, 5, 3.5, 4.0, {"floral": 0.6, "citrus": 0.4}),
    ("Iris Butter", "heart", 40.0, 5, 6.0, 5.0, {"floral": 0.5, "woody": 0.3, "amber": 0.2}),
    ("Violet Leaf", "heart", 6.0, 4, 3.5, 3.0, {"floral": 0.5, "fresh": 0.5}),
    ("Hedione", "heart", 0.35, 3, 4.0, 20.0, {"floral": 0.6, "fresh": 0.4}),
    ("Tuberose", "heart", 18.0, 9, 7.0, 2.0, {"floral": 0.8, "gourmand": 0.2}),
    ("Clary Sage", "heart", 1.2, 5, 4.0, 6.0, {"fresh": 0.5, "floral": 0.3, "woody": 0.2}),
    ("Sandalwood", "base", 9.0, 5, 24.0, 10.0, {"woody": 0.7, "amber": 0.3}),
    ("Cedarwood", "base", 0.4, 5, 12.0, 15.0, {"woody": 1.0}),
    ("Vetiver", "base", 3.5, 7, 20.0, 8.0, {"woody": 0.7, "fresh": 0.3}),
    ("Patchouli", "base", 1.5, 8, 24.0, 10.0, {"woody": 0.6, "amber": 0.4}),
    ("Oakmoss", "base", 1.0, 6, 16.0, 0.1, {"woody": 0.6, "fresh": 0.4}),
    ("Ambroxan", "base", 2.0, 8, 30.0, 12.0, {"amber": 0.6, "woody": 0.4}),
    ("White Musk", "base", 0.8, 5, 18.0, 15.0, {"amber": 0.5, "fresh": 0.3, "floral": 0.2}),
    ("Vanilla", "base", 3.0, 6, 20.0, 10.0, {"gourmand": 0.7, "amber": 0.3}),
    ("Tonka Bean", "base", 2.5, 6, 18.0, 5.0, {"gourmand": 0.6, "amber": 0.4}),
    ("Oud", "base", 60.0, 10, 36.0, 3.0, {"woody": 0.5, "amber": 0.3, "spicy": 0.2}),
    # name, tier, cost_per_ml (USD), strength 1-10, longevity_hours, ifra_max_pct, {family: weight}
    ("Green Apple", "top", 0.6, 4, 0.8, 6.0, {"fruity": 0.7, "green": 0.3}),
    ("Pear", "top", 0.7, 3, 1.0, 6.0, {"fruity": 0.8, "gourmand": 0.2}),
    ("Calone", "top", 0.8, 5, 2.0, 8.0, {"aquatic": 0.8, "fresh": 0.2}),
    ("Ginger", "top", 2.2, 6, 2.0, 3.0, {"spicy": 0.6, "fresh": 0.2, "woody": 0.2}),
    ("Galbanum", "top", 4.5, 7, 3.0, 1.0, {"green": 0.8, "woody": 0.2}),
    ("Cinnamon", "heart", 2.0, 7, 5.0, 0.5, {"spicy": 0.8, "gourmand": 0.2}),
    ("Black Pepper", "heart", 1.8, 6, 3.0, 2.0, {"spicy": 0.9, "woody": 0.1}),
    ("Incense", "heart", 5.0, 6, 8.0, 5.0, {"woody": 0.5, "spicy": 0.3, "amber": 0.2}),
    ("Coffee", "heart", 3.0, 5, 6.0, 5.0, {"gourmand": 0.8, "woody": 0.2}),
    ("Seaweed Absolute", "heart", 4.0, 5, 6.0, 3.0, {"aquatic": 0.6, "green": 0.4}),
    ("Cacao", "base", 2.5, 5, 14.0, 8.0, {"gourmand": 0.8, "amber": 0.2}),
    ("Benzoin", "base", 1.5, 5, 20.0, 5.0, {"amber": 0.7, "gourmand": 0.3}),
    ("Labdanum", "base", 3.0, 7, 28.0, 5.0, {"amber": 0.7, "leather": 0.2, "woody": 0.1}),
    ("Iso E Super", "base", 0.5, 3, 18.0, 20.0, {"woody": 1.0}),
]
# Advanced-only ingredients: the same tuple, appended after the core library so the core ids do not move.
ING_X = [
    ("Yuzu", "top", 3.0, 5, 1.2, 3.0, {"citrus": 0.9, "fresh": 0.1}),
    ("Lychee", "top", 1.8, 4, 1.2, 6.0, {"fruity": 0.8, "floral": 0.2}),
    ("Pineapple", "top", 1.2, 5, 1.0, 6.0, {"fruity": 0.9, "gourmand": 0.1}),
    ("Blackcurrant", "top", 4.0, 6, 2.0, 3.0, {"fruity": 0.6, "green": 0.3, "woody": 0.1}),
    ("Juniper Berry", "top", 2.0, 5, 2.0, 4.0, {"woody": 0.4, "fresh": 0.4, "green": 0.2}),
    ("Eucalyptus", "top", 0.6, 6, 1.0, 5.0, {"fresh": 0.9, "green": 0.1}),
    ("Rosemary", "top", 1.0, 5, 1.5, 4.0, {"fresh": 0.5, "green": 0.4, "woody": 0.1}),
    ("Sea Salt", "top", 2.0, 4, 2.0, 8.0, {"aquatic": 0.8, "fresh": 0.2}),
    ("Ozone", "top", 1.0, 5, 1.0, 8.0, {"aquatic": 0.5, "fresh": 0.5}),
    ("Coconut", "heart", 3.5, 4, 6.0, 5.0, {"gourmand": 0.7, "fruity": 0.2, "floral": 0.1}),
    ("Osmanthus", "heart", 30.0, 7, 8.0, 2.0, {"floral": 0.6, "fruity": 0.3, "leather": 0.1}),
    ("Saffron", "heart", 80.0, 8, 8.0, 0.5, {"spicy": 0.5, "leather": 0.3, "amber": 0.2}),
    ("Nutmeg", "heart", 2.5, 6, 4.0, 3.0, {"spicy": 0.8, "woody": 0.2}),
    ("Clove", "heart", 2.0, 7, 5.0, 0.5, {"spicy": 0.9, "woody": 0.1}),
    ("Lily of the Valley", "heart", 5.0, 5, 4.0, 5.0, {"floral": 0.8, "fresh": 0.2}),
    ("Freesia", "heart", 4.0, 4, 3.0, 5.0, {"floral": 0.7, "fruity": 0.2, "fresh": 0.1}),
    ("Mimosa", "heart", 20.0, 5, 6.0, 4.0, {"floral": 0.6, "gourmand": 0.2, "green": 0.2}),
    ("Magnolia", "heart", 8.0, 5, 5.0, 5.0, {"floral": 0.7, "fruity": 0.2, "citrus": 0.1}),
    ("Black Tea", "heart", 6.0, 5, 6.0, 5.0, {"green": 0.4, "woody": 0.3, "gourmand": 0.3}),
    ("Almond", "heart", 2.5, 5, 6.0, 5.0, {"gourmand": 0.8, "floral": 0.2}),
    ("Fir Balsam", "heart", 1.5, 6, 6.0, 5.0, {"woody": 0.5, "fresh": 0.3, "green": 0.2}),
    ("Tobacco Leaf", "base", 5.0, 7, 16.0, 2.0, {"woody": 0.3, "gourmand": 0.3, "leather": 0.2, "amber": 0.2}),
    ("Honey", "base", 4.0, 6, 14.0, 2.0, {"gourmand": 0.8, "amber": 0.2}),
    ("Myrrh", "base", 6.0, 6, 22.0, 5.0, {"amber": 0.6, "spicy": 0.2, "woody": 0.2}),
    ("Cashmeran", "base", 3.0, 5, 20.0, 6.0, {"woody": 0.6, "amber": 0.4}),
    ("Ambergris", "base", 45.0, 6, 30.0, 5.0, {"amber": 0.6, "aquatic": 0.2, "woody": 0.2}),
    ("Caramel", "base", 2.0, 5, 12.0, 5.0, {"gourmand": 0.9, "amber": 0.1}),
]
# Advanced-only ingredients, round two: priced from published supplier catalogues (data/ingredient_prices_new.csv, one source per row; Licorice and Rice
# have no published price and say so there). The IFRA limit slot is overwritten below from the real Standards. Appended after ING_X so no id moves.
PRICE = {}
with open(os.path.join(ROOT, "data", "ingredient_prices_new.csv")) as fh:
    for r in csv.DictReader(fh):
        PRICE[r["ingredient"]] = float(r["usd_per_ml"])
ING_X2 = [
    ('Leather', 'base', PRICE['Leather'], 9, 24.0, 100.0, {'leather': 0.8, 'woody': 0.1, 'green': 0.1}),
    ('Castoreum', 'base', PRICE['Castoreum'], 8, 30.0, 100.0, {'leather': 0.5, 'amber': 0.4, 'woody': 0.1}),
    ('Ambrette Seed', 'base', PRICE['Ambrette Seed'], 6, 18.0, 100.0, {'amber': 0.5, 'fruity': 0.3, 'floral': 0.2}),
    ('Muscone', 'base', PRICE['Muscone'], 6, 36.0, 100.0, {'amber': 0.6, 'gourmand': 0.2, 'floral': 0.2}),
    ('Civet', 'base', PRICE['Civet'], 8, 30.0, 100.0, {'leather': 0.4, 'amber': 0.3, 'floral': 0.3}),
    ('Galaxolide', 'base', PRICE['Galaxolide'], 5, 30.0, 100.0, {'amber': 0.5, 'floral': 0.3, 'fresh': 0.2}),
    ('Fig', 'heart', PRICE['Fig'], 5, 6.0, 100.0, {'green': 0.4, 'fruity': 0.3, 'gourmand': 0.2, 'woody': 0.1}),
    ('Plum', 'heart', PRICE['Plum'], 5, 6.0, 100.0, {'fruity': 0.7, 'gourmand': 0.2, 'amber': 0.1}),
    ('Peach', 'heart', PRICE['Peach'], 4, 6.0, 100.0, {'fruity': 0.7, 'gourmand': 0.3}),
    ('Bitter Orange', 'top', PRICE['Bitter Orange'], 4, 1.2, 100.0, {'citrus': 0.8, 'green': 0.2}),
    ('Thyme', 'top', PRICE['Thyme'], 6, 2.0, 100.0, {'fresh': 0.4, 'green': 0.3, 'spicy': 0.3}),
    ('Cypress', 'heart', PRICE['Cypress'], 5, 5.0, 100.0, {'woody': 0.5, 'fresh': 0.3, 'green': 0.2}),
    ('Peony', 'heart', PRICE['Peony'], 4, 4.0, 100.0, {'floral': 0.8, 'fresh': 0.2}),
    ('Carnation', 'heart', PRICE['Carnation'], 6, 6.0, 100.0, {'floral': 0.5, 'spicy': 0.5}),
    ('Rose Absolute', 'heart', PRICE['Rose Absolute'], 7, 6.0, 100.0, {'floral': 0.8, 'spicy': 0.1, 'amber': 0.1}),
    ('Guaiac Wood', 'base', PRICE['Guaiac Wood'], 5, 20.0, 100.0, {'woody': 0.6, 'leather': 0.2, 'amber': 0.2}),
    ('Star Anise', 'heart', PRICE['Star Anise'], 6, 4.0, 100.0, {'spicy': 0.6, 'gourmand': 0.3, 'fresh': 0.1}),
    ('Cumin', 'heart', PRICE['Cumin'], 8, 4.0, 100.0, {'spicy': 0.8, 'green': 0.1, 'leather': 0.1}),
    ('Coriander', 'top', PRICE['Coriander'], 5, 2.0, 100.0, {'spicy': 0.5, 'fresh': 0.3, 'citrus': 0.2}),
    ('Palo Santo', 'heart', PRICE['Palo Santo'], 5, 8.0, 100.0, {'woody': 0.6, 'citrus': 0.2, 'fresh': 0.2}),
    ('Rum', 'heart', PRICE['Rum'], 5, 6.0, 100.0, {'gourmand': 0.6, 'amber': 0.3, 'fruity': 0.1}),
    ('Licorice', 'heart', PRICE['Licorice'], 5, 8.0, 100.0, {'gourmand': 0.6, 'spicy': 0.2, 'green': 0.2}),
    ('Rice', 'base', PRICE['Rice'], 3, 12.0, 100.0, {'gourmand': 0.7, 'amber': 0.2, 'woody': 0.1}),
]
ADVANCED = {n for n, *_r in ING_X + ING_X2}
ING = ING + ING_X + ING_X2
# Real prices for the older ingredients (data/ingredient_prices_existing.csv, one source per row). Where the published material was only a proxy or a
# dilution, or no price was found, the row says KEPT ESTIMATE and the earlier estimate stays.
REAL = {}
with open(os.path.join(ROOT, "data", "ingredient_prices_existing.csv")) as fh:
    for r in csv.DictReader(fh):
        if r["material_priced"] != "(not applied)":
            REAL[r["ingredient"]] = float(r["usd_per_ml"])
ING = [(n, t, REAL.get(n, c), *rest) for n, t, c, *rest in ING]
NAMES = {n: i + 1 for i, (n, *_r) in enumerate(ING)}

# name, bottle_ml, units, concentration_pct, retail_price, packaging_cost, {ingredient: pct of concentrate}
FORMULAS = [
    ("Citrus Cologne", 50, 200, 5, 38, 4.0,
     {"Bergamot": 25, "Lemon": 15, "Grapefruit": 15, "Lavender": 8, "Neroli": 7, "Vetiver": 10, "White Musk": 15, "Cedarwood": 5}),
    ("Rose Garden EDP", 50, 100, 15, 95, 6.0,
     {"Bergamot": 8, "Pink Pepper": 4, "Rose Otto": 18, "Geranium": 10, "Jasmine Absolute": 8, "Sandalwood": 20, "White Musk": 16, "Ambroxan": 8, "Patchouli": 8}),
    ("Night Oud", 30, 60, 22, 180, 9.0,
     {"Cardamom": 6, "Pink Pepper": 5, "Rose Otto": 8, "Tuberose": 5, "Oud": 14, "Patchouli": 14, "Vanilla": 16, "Tonka Bean": 12, "Ambroxan": 12, "Sandalwood": 8}),
    ("Green Vetiver", 100, 150, 12, 70, 5.0,
     {"Grapefruit": 12, "Basil": 6, "Lavender": 6, "Violet Leaf": 10, "Clary Sage": 10, "Vetiver": 28, "Cedarwood": 12, "Oakmoss": 4, "White Musk": 12}),
    ("Vanilla Amber", 50, 120, 18, 85, 5.0,
     {"Mandarin": 10, "Ylang-Ylang": 10, "Hedione": 8, "Vanilla": 28, "Tonka Bean": 14, "Ambroxan": 18, "White Musk": 12}),
    ("White Floral", 50, 80, 15, 110, 6.0,
     {"Aldehyde C-12": 3, "Bergamot": 10, "Neroli": 10, "Jasmine Absolute": 12, "Tuberose": 10, "Ylang-Ylang": 8, "Hedione": 12, "Iris Butter": 5, "Sandalwood": 15, "White Musk": 15}),
]

os.makedirs(os.path.dirname(DB), exist_ok=True)
if os.path.exists(DB):
    os.remove(DB)
con = duckdb.connect(DB)
con.execute("""create table ingredients (ingredient_id integer, name varchar, tier varchar,
  cost_per_ml double, strength integer, longevity_hours double, ifra_max_pct double)""")
con.execute("create table ingredient_families (ingredient_id integer, family varchar, weight double)")
con.execute("""create table formulas (formula_id integer, name varchar, bottle_ml integer, units integer,
  concentration_pct double, retail_price double, packaging_cost double)""")
con.execute("create table formula_lines (formula_id integer, ingredient_id integer, pct double)")

for i, (name, tier, cost, strength, hours, ifra, fam) in enumerate(ING, 1):
    assert abs(sum(fam.values()) - 1) < 1e-9, name
    con.execute("insert into ingredients values (?,?,?,?,?,?,?)", [i, name, tier, cost, strength, hours, ifra])
    for f, w in fam.items():
        con.execute("insert into ingredient_families values (?,?,?)", [i, f, w])
for fid, (name, bml, units, conc, price, pack, lines) in enumerate(FORMULAS, 1):
    assert sum(lines.values()) == 100, (name, sum(lines.values()))
    con.execute("insert into formulas values (?,?,?,?,?,?,?)", [fid, name, bml, units, conc, price, pack])
    for ing, pct in lines.items():
        con.execute("insert into formula_lines values (?,?,?)", [fid, NAMES[ing], pct])
print({t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in
       ["ingredients", "ingredient_families", "formulas", "formula_lines"]})

# --- Draft composer: every (ingredient, parts) the stepper can pick, in half-part steps, and every batch setting. ---
con.execute("create table draft_options (option_id integer, ingredient_id integer, parts double, k integer)")
con.execute("""insert into draft_options
  select row_number() over (), ingredient_id, step / 2.0, 1 from ingredients, range(0, 21) t(step)""")
PRICE_MIN, PRICE_MAX, PRICE_STEP = 50, 200, 10  # the retail prices the composer allows
PACKAGING = {10: 2.0, 30: 4.0, 50: 5.0, 100: 8.0}
FILLING_LABOR = {10: 0.5, 30: 0.8, 50: 1.0, 100: 1.5}  # per bottle: fill, cap, label, box
ETHANOL_PER_ML = 0.015  # perfumer's alcohol, per ml of bottle that is not concentrate
# Scale: suppliers discount ingredients and packaging on bigger orders, and every run has a fixed setup. Synthetic.
VOLUME_MULT = {50: 1.00, 80: 1.00, 100: 0.95, 120: 0.95, 150: 0.95, 200: 0.92, 300: 0.90, 500: 0.86}  # price paid vs list, by bottles in the batch
SETUP_COST = 300.0  # per batch: line clearing, a stability and fill test, the first labels run
SHIP_DIRECT = {10: 3.5, 30: 5.0, 50: 6.0, 100: 8.0}  # per bottle sent to a customer, by bottle size
SHIP_WHOLESALE = {10: 0.6, 30: 0.8, 50: 1.0, 100: 1.5}  # per bottle in a bulk shipment to a shop
SAMPLE_PER_BOTTLE = 1.0  # samples and discovery sets: one 2 ml vial for every two bottles in the batch, about $2 a vial
con.execute("create table settings (setting_id integer, bottle_ml integer, concentration_pct integer, units integer, retail_price integer, packaging_cost double, labor_cost double, ethanol_cost_per_ml double, volume_mult double, setup_cost double, ship_direct double, ship_wholesale double, sample_cost double, k integer)")
n = 0
for bml in PACKAGING:
    for conc in (5, 10, 15, 20, 25):
        for units in (50, 80, 100, 120, 150, 200, 300, 500):
            for price in range(PRICE_MIN, PRICE_MAX + 1, PRICE_STEP):
                n += 1
                con.execute("insert into settings values (?,?,?,?,?,?,?,?,?,?,?,?,?,1)", [n, bml, conc, units, price, PACKAGING[bml], FILLING_LABOR[bml], ETHANOL_PER_ML,
                            VOLUME_MULT[units], SETUP_COST, SHIP_DIRECT[bml], SHIP_WHOLESALE[bml], SAMPLE_PER_BOTTLE])

# --- Advanced mode: business assumptions. One row per combination of the dropdowns the Business card offers
# (packaging, channel mix, marketing, returns, target margin); the page leaves exactly one. Synthetic. ---
con.execute("""create table business_options (business_id integer, packaging_tier varchar, packaging_mult double,
  dtc_pct integer, wholesale_discount_pct integer, platform_fee_pct double, marketing_usd integer, returns_pct integer,
  target_margin_pct integer, ifra_testing double, design_cost double, k integer)""")
b = 0
for tier, mult in (("Standard", 1.0), ("Premium", 1.8)):
    for dtc in (100, 70, 40, 0):
        for mkt in (0, 500, 1000, 2500, 5000, 10000):  # launch marketing budget, dollars
            for ret in (2, 5, 10):
                for tm in (40, 50, 60, 70):
                    b += 1
                    con.execute("insert into business_options values (?,?,?,?,?,?,?,?,?,?,?,1)",
                                [b, tier, mult, dtc, 50, 3.5, mkt, ret, tm, 800.0, 1200.0])
print({t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in ["draft_options", "settings", "business_options"]})

# --- Ingredient copy and illustration keys, shown in the composer's hover card. ---
DESC = {
    "Bergamot": ("citrus", "Bright, sparkling citrus peel with a soft floral edge. The classic opening of an eau de cologne."),
    "Lemon": ("citrus", "Sharp, clean and juicy. Lifts a blend at once, then is gone within minutes."),
    "Grapefruit": ("citrus", "Zesty and slightly bitter, with a juicy, modern sparkle."),
    "Mandarin": ("citrus", "Sweet, soft orange peel. Friendlier and rounder than lemon."),
    "Pink Pepper": ("peppercorn", "Dry, rosy spice with a citrus twist. Adds a tingle to the opening."),
    "Lavender": ("sprig", "Herbal, clean and calming, with a hint of flowers. A fougère staple."),
    "Cardamom": ("pod", "Warm, cool and spicy at once, with a green, slightly sweet edge."),
    "Aldehyde C-12": ("sparkle", "Sparkling, soapy and metallic, like crisp linen. Makes florals feel lifted."),
    "Peppermint": ("mint", "Cool, sharp and minty. A fast burst of freshness."),
    "Basil": ("sprig", "Green, peppery and herbal, with a faint anise sweetness."),
    "Jasmine Absolute": ("jasmine", "Rich, creamy white flower with a heady, honeyed depth. Costly and powerful."),
    "Rose Otto": ("rose", "Deep, honeyed rose with a hint of spice. The heart of classic perfumery."),
    "Ylang-Ylang": ("ylang", "Sweet, creamy and tropical, with a banana-custard softness."),
    "Geranium": ("geranium", "Green, minty rose. Fills out a floral without the cost of rose."),
    "Neroli": ("blossom", "Orange blossom: honeyed, bright and slightly bitter. Clean and luminous."),
    "Iris Butter": ("iris", "Powdery, buttery and cool, like lipstick and suede. Among the most prized materials."),
    "Violet Leaf": ("violet", "Green, watery and slightly metallic, like cut stems."),
    "Hedione": ("sparkle", "Airy, transparent jasmine. Adds radiance without weight."),
    "Tuberose": ("tuberose", "Opulent, creamy white flower with a narcotic, rubbery edge. Very strong."),
    "Clary Sage": ("sprig", "Herbal, musky and slightly sweet, like hay and tea."),
    "Sandalwood": ("logrings", "Creamy, soft and milky wood. Smooth and long-lasting."),
    "Cedarwood": ("logrings", "Dry, pencil-shaving wood. Clean, light and inexpensive."),
    "Vetiver": ("grass", "Earthy, smoky roots with a green, rooty freshness."),
    "Patchouli": ("leaf", "Dark, earthy and sweet, like damp soil and cocoa. Strong and lasting."),
    "Oakmoss": ("moss", "Damp forest floor: mossy, earthy and bitter. The backbone of chypres."),
    "Ambroxan": ("crystal", "Warm, mineral amber with a salty skin-like glow. Extremely long-lasting."),
    "White Musk": ("musk", "Soft, clean and skin-like, like warm laundry. Makes a blend feel close to the body."),
    "Vanilla": ("vanilla", "Sweet, creamy and warm. Comforting and rounded."),
    "Tonka Bean": ("tonka", "Sweet hay, almond and vanilla. Cosy and slightly nutty."),
    "Oud": ("oud", "Dark, resinous wood with a smoky, animal edge. Rare and very costly."),
}
con.execute("alter table ingredients add column motif varchar")
con.execute("alter table ingredients add column description varchar")
for name, (motif, desc) in DESC.items():
    con.execute("update ingredients set motif = ?, description = ? where name = ?", [motif, desc, name])

DESC2 = {
    "Green Apple": ("fruit", "Crisp, tart and juicy, like biting into a fresh apple. Bright and playful."),
    "Pear": ("fruit", "Soft, juicy and lightly sweet. Rounder and gentler than apple."),
    "Calone": ("drop", "Cool sea air and salt spray. Clean, airy and slightly mineral."),
    "Ginger": ("root", "Zesty, warm and peppery, with a fresh, lemony bite."),
    "Galbanum": ("leaf", "Intensely green, like crushed stems and sap. Sharp, bitter and vivid."),
    "Cinnamon": ("sticks", "Warm, sweet spice with a glowing, slightly fiery heat. Use sparingly."),
    "Black Pepper": ("peppercorn", "Dry, hot and woody spice. Adds bite and a touch of smoke."),
    "Incense": ("smoke", "Cool, smoky resin like a church after service. Calm and a little mystic."),
    "Coffee": ("tonka", "Roasted, bittersweet and dark, with a rich, slightly smoky depth."),
    "Seaweed Absolute": ("moss", "Briny, green and mineral, like a rock pool at low tide."),
    "Cacao": ("tonka", "Dark, dusty chocolate. Rich, warm and mildly bitter."),
    "Benzoin": ("oud", "Warm, sweet and balsamic, like vanilla and cinnamon in resin."),
    "Labdanum": ("oud", "Sticky, leathery amber with animal warmth. Deep and long-lasting."),
    "Iso E Super": ("crystal", "Smooth, dry, cedar-like wood with a velvety, almost invisible glow."),
}
for name, (motif, desc) in DESC2.items():
    con.execute("update ingredients set motif = ?, description = ? where name = ?", [motif, desc, name])
DESC3 = {
    "Yuzu": ("citrus", "Tart, floral Japanese citrus. Sharper and greener than mandarin."),
    "Lychee": ("fruit", "Juicy, rosy and lightly sweet. A glossy fruit note."),
    "Pineapple": ("fruit", "Sunny, tangy and tropical. Bright and playful."),
    "Blackcurrant": ("fruit", "Tart, dark berry with a green, almost catty edge."),
    "Juniper Berry": ("peppercorn", "Crisp, piney and gin-like. Cool and slightly resinous."),
    "Eucalyptus": ("mint", "Cool, camphorous and medicinal. An icy blast of fresh air."),
    "Rosemary": ("sprig", "Herbal, camphor-fresh and slightly woody. Clean and aromatic."),
    "Sea Salt": ("crystal", "Dry, mineral salt on warm skin. Airy and a little sweet."),
    "Ozone": ("sparkle", "Clean, metallic air after a storm. Cold and weightless."),
    "Coconut": ("pod", "Creamy, milky and sunny, like coconut water and suncream."),
    "Osmanthus": ("blossom", "Apricot, suede and tea. A rare, rich floral."),
    "Saffron": ("sticks", "Leathery, metallic and golden. Rare and extremely costly."),
    "Nutmeg": ("pod", "Warm, sweet and slightly woody spice. Rounder than pepper."),
    "Clove": ("sticks", "Hot, sweet and medicinal spice. Powerful, so use sparingly."),
    "Lily of the Valley": ("jasmine", "Fresh, dewy and green-floral. A clean spring bouquet."),
    "Freesia": ("ylang", "Light, peppery floral with a hint of citrus. Soft and airy."),
    "Mimosa": ("sparkle", "Powdery, honeyed yellow blossom. Soft and sunny."),
    "Magnolia": ("rose", "Creamy, lemony floral. Full and elegant."),
    "Black Tea": ("leaf", "Smoky, tannic and slightly sweet, like a steeped cup."),
    "Almond": ("tonka", "Marzipan-sweet, nutty and soft. Cosy and slightly powdery."),
    "Fir Balsam": ("grass", "Resinous pine needles and cold forest air. Fresh and green."),
    "Tobacco Leaf": ("leaf", "Dry, sweet, hay-like leaf. Warm and slightly honeyed."),
    "Honey": ("drop", "Sweet, waxy and golden. Rich and slightly animalic."),
    "Myrrh": ("oud", "Bitter, balsamic resin. Warm, medicinal and long-lasting."),
    "Cashmeran": ("musk", "Soft, spicy woody musk with a cashmere-like warmth."),
    "Ambergris": ("crystal", "Salty, sweet and marine-animal. Rare, rich and very long-lasting."),
    "Caramel": ("drop", "Burnt sugar, warm and sticky. Sweet and comforting."),
}
con.execute("alter table ingredients add column diffusion double")
con.execute("alter table ingredients add column level varchar")
for name, (motif, desc) in DESC3.items():
    con.execute("update ingredients set motif = ?, description = ? where name = ?", [motif, desc, name])
DESC4 = {
    'Leather': ('smoke', 'Dry, smoky suede with a touch of tar. Very strong: a drop goes a long way.'),
    'Castoreum': ('oud', 'Warm, sweet leather with an animal depth. A classic in old leather and chypre perfumes.'),
    'Ambrette Seed': ('musk', 'A plant musk: soft, skin-like and a little like pear and brandy. Smooth and long-lasting.'),
    'Muscone': ('musk', 'The warm, soft, furry musk once taken from deer. Today made in the lab. Clings to skin for days.'),
    'Civet': ('oud', 'A dirty, honeyed animal note that, in tiny amounts, makes flowers feel alive. Today a lab-made base.'),
    'Galaxolide': ('musk', 'Clean, sweet, floral musk like fresh laundry. The musk in most modern perfumes.'),
    'Fig': ('fruit', 'Green leaf, milky fruit and a little coconut. Built from lab materials, since the natural leaf is banned.'),
    'Plum': ('fruit', 'Dark, jammy, slightly boozy fruit. Rich and round.'),
    'Peach': ('fruit', 'Velvety, creamy fruit skin. Soft and sweet.'),
    'Bitter Orange': ('citrus', 'Sharp, slightly bitter orange peel. Drier and more grown-up than mandarin.'),
    'Thyme': ('sprig', 'Herbal, warm and slightly medicinal. A fougere and Mediterranean note.'),
    'Cypress': ('logrings', 'Dry, resinous green wood with a cool, clean edge.'),
    'Peony': ('rose', 'Dewy, airy pink petals with a green, watery freshness.'),
    'Carnation': ('blossom', 'Spicy, clove-like flower. Warm and a little peppery.'),
    'Rose Absolute': ('rose', 'Deep, honeyed rose with a rich, waxy body. Fuller and warmer than rose otto.'),
    'Guaiac Wood': ('logrings', 'Smoky, tea-like wood with a soft rose edge. Warm and creamy.'),
    'Star Anise': ('sticks', 'Sweet liquorice-like spice. Warm and sticky.'),
    'Cumin': ('pod', 'Hot, earthy, almost sweaty spice. Powerful: a little adds skin-like warmth.'),
    'Coriander': ('peppercorn', 'Fresh, citrusy spice with a green, woody lift.'),
    'Palo Santo': ('logrings', 'Sweet, minty wood with a lemony edge, like incense and pine.'),
    'Rum': ('drop', 'Warm, boozy sweetness: caramel, oak and dark fruit.'),
    'Licorice': ('root', 'Sweet, dark and herbal, with a hint of anise.'),
    'Rice': ('tonka', 'Soft, milky, slightly powdery grain. A cosy, clean skin note.'),
}
for name, (motif, desc) in DESC4.items():
    con.execute("update ingredients set motif = ?, description = ? where name = ?", [motif, desc, name])
# How far an ingredient radiates from the skin, 1 to 10 (sillage). Light, airy molecules carry; heavy resins and woods sit close. Synthetic.
DIFFUSION = {"Bergamot": 7, "Lemon": 8, "Grapefruit": 7, "Mandarin": 6, "Pink Pepper": 7, "Lavender": 5, "Cardamom": 6, "Aldehyde C-12": 9, "Peppermint": 8, "Basil": 5,
    "Jasmine Absolute": 6, "Rose Otto": 5, "Ylang-Ylang": 6, "Geranium": 5, "Neroli": 6, "Iris Butter": 3, "Violet Leaf": 5, "Hedione": 9, "Tuberose": 7, "Clary Sage": 4,
    "Sandalwood": 3, "Cedarwood": 4, "Vetiver": 4, "Patchouli": 4, "Oakmoss": 3, "Ambroxan": 9, "White Musk": 5, "Vanilla": 4, "Tonka Bean": 4, "Oud": 4,
    "Green Apple": 7, "Pear": 6, "Calone": 8, "Ginger": 7, "Galbanum": 6, "Cinnamon": 6, "Black Pepper": 7, "Incense": 5, "Coffee": 4, "Seaweed Absolute": 5,
    "Cacao": 3, "Benzoin": 3, "Labdanum": 4, "Iso E Super": 9,
    "Yuzu": 7, "Lychee": 6, "Pineapple": 7, "Blackcurrant": 6, "Juniper Berry": 6, "Eucalyptus": 8, "Rosemary": 6, "Sea Salt": 6, "Ozone": 8, "Coconut": 4, "Osmanthus": 5,
    "Saffron": 5, "Nutmeg": 6, "Clove": 6, "Lily of the Valley": 7, "Freesia": 6, "Mimosa": 5, "Magnolia": 6, "Black Tea": 4, "Almond": 4, "Fir Balsam": 6,
    "Tobacco Leaf": 4, "Honey": 3, "Myrrh": 3, "Cashmeran": 7, "Ambergris": 6, "Caramel": 3}
DIFFUSION.update({'Leather': 4, 'Castoreum': 3, 'Ambrette Seed': 4, 'Muscone': 5, 'Civet': 3, 'Galaxolide': 6, 'Fig': 5, 'Plum': 5, 'Peach': 5, 'Bitter Orange': 7, 'Thyme': 5, 'Cypress': 5, 'Peony': 6, 'Carnation': 5, 'Rose Absolute': 5, 'Guaiac Wood': 3, 'Star Anise': 6, 'Cumin': 5, 'Coriander': 7, 'Palo Santo': 5, 'Rum': 5, 'Licorice': 4, 'Rice': 3})
assert set(DIFFUSION) == set(NAMES), set(NAMES) ^ set(DIFFUSION)
for name, d in DIFFUSION.items():
    con.execute("update ingredients set diffusion = ?, level = ? where name = ?", [d, "advanced" if name in ADVANCED else "core", name])
assert con.execute("select count(*) from ingredients where motif is null").fetchone()[0] == 0
print(con.execute("select count(*) from ingredients").fetchone()[0], "ingredients")

# --- Advanced mode, Market view: past launches. Synthetic. Only what a brand would have on file is stored: each
# launch's family mix, concentration, price, marketing, direct share and bottles sold each of its first 24 months. What
# price, concentration, marketing and channel are worth, which calendar months are busy, the closest launches, the
# forecast and its accuracy are all computed (views below, models in the repo). ---
import math
import random
from datetime import date

rng = random.Random(20261014)
ARCHETYPES = {  # family mix, and how well launches of this kind sell
    "citrus cologne": ({"citrus": .5, "fresh": .2, "woody": .15, "amber": .1, "floral": .05}, 1.0),
    "fresh aquatic": ({"aquatic": .4, "fresh": .3, "citrus": .15, "woody": .1, "green": .05}, .9),
    "rose floral": ({"floral": .55, "fruity": .1, "amber": .15, "woody": .1, "spicy": .1}, 1.2),
    "white floral": ({"floral": .6, "fresh": .1, "gourmand": .1, "amber": .1, "woody": .1}, 1.0),
    "woody spice": ({"woody": .45, "spicy": .25, "amber": .15, "leather": .05, "citrus": .1}, .9),
    "amber gourmand": ({"amber": .4, "gourmand": .35, "woody": .1, "spicy": .1, "floral": .05}, 1.3),
    "oud leather": ({"woody": .3, "leather": .25, "amber": .2, "spicy": .2, "gourmand": .05}, .6),
    "green fruity": ({"green": .3, "fruity": .3, "fresh": .2, "citrus": .15, "floral": .05}, .8),
    "vanilla musk": ({"gourmand": .35, "amber": .3, "floral": .15, "woody": .1, "fresh": .1}, 1.2),
}
# How the world works in this made-up data. The page never reads these: the views below measure them back from the launches.
# Marketing is a dollar budget with diminishing returns: sales follow ln(1 + budget / $1,000), so the first dollars matter most.
TRUE_PRICE, TRUE_MARKETING, TRUE_DIRECT, TRUE_CONC = -1.2, 0.18, -0.006, 0.04
# Each family sells best around its own month, by this much (log swing): fresh and floral scents in spring and summer, warm ones in autumn and winter.
SEASON_FAMILY = {"citrus": (7, .55), "fresh": (6, .50), "aquatic": (7, .60), "fruity": (6, .45), "green": (5, .40), "floral": (5, .40),
                 "spicy": (11, .50), "gourmand": (12, .60), "amber": (12, .55), "woody": (10, .45), "leather": (11, .50)}
OWN = "Your house"
HOUSES = {OWN: 1.0, "Atelier Nord": 1.3, "Maison Verte": 0.8, "Orsay & Fils": 1.5, "Lumen Parfums": 0.9, "Casa Ambra": 1.1}
ADJ = ["Velvet", "Noir", "Solstice", "Harbour", "Linen", "Ember", "Dune", "Opal", "Saffron", "Tidal", "Cedar", "Moss", "Silk", "Halo", "Rue", "Atlas", "Vesper", "Marble", "Ivory", "Smoke", "Amber", "Salt", "Dawn", "Orchid", "Fern"]
NOUN = ["Garden", "Hour", "Coast", "Room", "Orchard", "Study", "Lane", "Bloom", "Ritual", "Court", "Tide", "Veil", "Grove", "Letter", "Source", "House", "Season", "Field"]
PRICES = (40, 60, 80, 100, 150, 200)
CONCS = (5, 10, 15, 20, 25)
con.execute("create table launches (launch_id integer, name varchar, house varchar, launched date, price integer, concentration_pct integer, marketing_usd integer, marketing_lm double, direct_pct integer)")
con.execute("create table launch_families (launch_id integer, family varchar, share double)")
con.execute("create table launch_sales (launch_id integer, month_no integer, bottles integer)")
names, lid = set(), 0
plan = [(OWN, 40)] + [(h, 28) for h in HOUSES if h != OWN]
for house, count in plan:
    tier = rng.randrange(1, 4) if house != OWN else 2  # the house's usual price point
    for _ in range(count):
        lid += 1
        while True:
            nm = f"{rng.choice(ADJ)} {rng.choice(NOUN)}"
            if nm not in names:
                names.add(nm); break
        arch, appeal = ARCHETYPES[rng.choice(list(ARCHETYPES))]
        mix = {f: w * math.exp(rng.gauss(0, .35)) for f, w in arch.items()}
        other = rng.choice(["citrus", "fruity", "fresh", "aquatic", "green", "floral", "spicy", "gourmand", "amber", "woody", "leather"])
        mix[other] = mix.get(other, 0) + .05
        tot = sum(mix.values()); mix = {f: round(100 * w / tot, 1) for f, w in mix.items()}
        mix[max(mix, key=mix.get)] = round(mix[max(mix, key=mix.get)] + 100 - sum(mix.values()), 1)
        pidx = max(0, min(5, tier + rng.choice([-1, 0, 0, 1])))
        price = PRICES[pidx]
        conc = CONCS[max(0, min(4, round(pidx * 0.8 + rng.gauss(0, 0.9))))]  # dearer launches tend to be stronger, not always
        mkt, direct = rng.choice([0, 500, 1000, 1000, 2500, 5000, 10000]), rng.choice([100, 70, 70, 40, 0])
        mkt_lm = math.log(1 + mkt / 1000.0)
        launched = date(2021 + rng.randrange(0, 4), rng.randrange(1, 13), 1)  # early enough to have a full two years of sales
        if launched > date(2024, 9, 1): launched = date(2024, 9, 1)
        total = (220 * appeal * HOUSES[house] * math.exp(rng.gauss(0, .22)) * (price / 80) ** TRUE_PRICE
                 * math.exp(TRUE_MARKETING * (mkt_lm - 1.0) + TRUE_DIRECT * (direct - 70) + TRUE_CONC * (conc - 15)))
        def season(c):  # a launch is as seasonal as the families it is made of
            return sum(sh / 100 * math.exp(SEASON_FAMILY[f][1] * math.cos(2 * math.pi * (c - SEASON_FAMILY[f][0]) / 12)) for f, sh in mix.items())
        shape = [(.45 + 1.6 * math.exp(-k / 2.5)) * math.exp(-.02 * k) * season(  # a launch spike that settles, then keeps fading about 2% a month
            (launched.month + k - 1) % 12 + 1) for k in range(24)]
        con.execute("insert into launches values (?,?,?,?,?,?,?,?,?)", [lid, nm, house, launched, price, conc, mkt, mkt_lm, direct])
        for f, sh in mix.items():
            con.execute("insert into launch_families values (?,?,?)", [lid, f, sh])
        for k in range(24):  # the total is the first year's; the second year follows from the same curve
            con.execute("insert into launch_sales values (?,?,?)", [lid, k + 1, max(1, round(total * shape[k] / sum(shape[:12]) * math.exp(rng.gauss(0, .1))))])

# --- Derived from the launches every time (views, not stored numbers) ---
# Each launch's months placed on the calendar.
con.execute("""create view launch_monthly as
select s.launch_id, s.month_no, ((month(l.launched) + s.month_no - 2) % 12) + 1 as calendar_month, s.bottles
from launch_sales s join launches l using (launch_id)""")
# How seasonal each scent family is: how far a launch's calendar month sits above its own level and the usual ramp-up curve, averaged
# over the launches, each counting by the share of the family in it. Centred, so 1.00 is an average month for the family.
con.execute("""create view family_season as
with m as (select launch_id, month_no, calendar_month, ln(bottles) as ls from launch_monthly),
a as (select launch_id, avg(ls) as a from m group by 1),
f as (select m.month_no, avg(m.ls - a.a) as f from m join a using (launch_id) group by 1),
dev as (select m.launch_id, m.calendar_month, avg(m.ls - a.a - f.f) as dv from m join a using (launch_id) join f using (month_no) group by 1, 2),
h as (select lf.family, d.calendar_month, sum(lf.share * d.dv) / sum(lf.share) as h from dev d join launch_families lf using (launch_id) group by 1, 2)
select family, calendar_month, exp(h - avg(h) over (partition by family)) as factor from h""")
# A launch's own seasonality: the average of its families' factors, weighted by their share of it.
con.execute("""create view launch_season as
select lf.launch_id, fs.calendar_month, sum(lf.share / 100.0 * fs.factor) as factor
from launch_families lf join family_season fs using (family) group by 1, 2""")
# Each launch with its calendar taken out. Past month 24, which is as far as the launches have run, each launch is carried on from the
# average of its own months 19 to 24 (calendar taken out), fading at the monthly rate measured across all launches between their months
# 7 to 12 and 19 to 24. The rate is measured; that it holds past month 24 is an assumption, not data.
con.execute("""create view launch_deseason as
with base as (
  select m.launch_id, m.month_no, m.bottles / s.factor as bottles_adj
  from launch_monthly m join launch_season s on s.launch_id = m.launch_id and s.calendar_month = m.calendar_month),
tail as (select launch_id, avg(bottles_adj) as rate from base where month_no between 19 and 24 group by 1),
mid as (select launch_id, avg(bottles_adj) as rate from base where month_no between 7 and 12 group by 1),
fade as (select exp(avg(ln(t.rate / m.rate)) / 12.0) as d from tail t join mid m using (launch_id)),
allm as (
  select launch_id, month_no, bottles_adj from base
  union all
  select t.launch_id, x.month_no, t.rate * pow(f.d, x.month_no - 21.5) from tail t cross join fade f cross join range(25, 61) x(month_no))
select launch_id, month_no, bottles_adj, sum(bottles_adj) over (partition by launch_id order by month_no) as cum_adj from allm""")
# Each launch as if it had come out in each calendar month: its calendar-free months put back on the calendar from there, with its own seasonality.
con.execute("""create view launch_release_curve as
with r as (select d.launch_id, d.month_no, d.bottles_adj, x.release_month, ((x.release_month + d.month_no - 2) % 12) + 1 as c
           from launch_deseason d cross join range(1, 13) x(release_month)),
s as (select r.launch_id, r.release_month, r.month_no, r.bottles_adj * ls.factor as b
      from r join launch_season ls on ls.launch_id = r.launch_id and ls.calendar_month = r.c)
select launch_id, release_month, month_no, sum(b) over (partition by launch_id, release_month order by month_no) as cum_release from s""")
# What price, marketing, direct share and concentration are worth: a regression of log first-year bottles (calendar removed) on each.
# Solved from the sums by Cramer's rule, with the determinants written out here.
def det(m):
    n = len(m)
    if n == 1: return m[0][0]
    return " + ".join(("" if j % 2 == 0 else "-") + f"{m[0][j]} * ({det([row[:j] + row[j + 1:] for row in m[1:]])})" for j in range(n))
X = ["ln(l.price)", "l.marketing_lm", "l.direct_pct", "l.concentration_pct"]
names_b = ["b_price", "b_marketing", "b_direct", "b_conc"]
n = len(X)
S = [[f"s{min(i, j) + 1}{max(i, j) + 1}" for j in range(n)] for i in range(n)]
T = [f"t{i + 1}" for i in range(n)]
sums = ", ".join([f"sum((x{i + 1}-m{i + 1})*(x{j + 1}-m{j + 1})) as s{i + 1}{j + 1}" for i in range(n) for j in range(i, n)] + [f"sum((x{i + 1}-m{i + 1})*(y-my)) as t{i + 1}" for i in range(n)])
coefs = ", ".join(f"({det([[T[i] if j == k else S[i][j] for j in range(n)] for i in range(n)])}) / dt as {names_b[k]}" for k in range(n))
con.execute(f"""create view launch_effects as
with d as (select {', '.join(f'{X[i].replace("l.", "l.")} as x{i + 1}' for i in range(n))}, ln(s.cum_adj) as y
           from launches l join launch_deseason s on s.launch_id = l.launch_id and s.month_no = 12),
m as (select {', '.join(f'avg(x{i + 1}) as m{i + 1}' for i in range(n))}, avg(y) as my from d),
c as (select {sums} from d, m),
q as (select *, {det(S)} as dt from c)
select 1 as k, {coefs} from q""")
con.execute("create table price_points (price integer, k integer)")  # every retail price the composer allows, so the price table never depends on the chosen price
for pr in range(PRICE_MIN, PRICE_MAX + 1, PRICE_STEP):
    con.execute("insert into price_points values (?, 1)", [pr])
print({t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in ["launches", "launch_families", "launch_sales", "price_points", "family_season"]})
print("effects (price, marketing, direct, concentration):", con.execute("select b_price, b_marketing, b_direct, b_conc from launch_effects").fetchone(), "true:", (TRUE_PRICE, TRUE_MARKETING, TRUE_DIRECT, TRUE_CONC))
print("family peaks, measured vs built in:", {f: (max(range(1, 13), key=lambda c: v[c]), SEASON_FAMILY[f][0]) for f in SEASON_FAMILY
      for v in [dict(con.execute("select calendar_month, factor from family_season where family = ?", [f]).fetchall())]})


# --- Step 5, chemistry. Synthetic. ---
# Structure: the share of the blend (by parts) each note usually takes in a balanced perfume.
con.execute("create table structure_targets (tier varchar, lo_pct double, hi_pct double, note varchar)")
for row in [("top", 15, 30, "The first impression: bright, but gone within a couple of hours."),
            ("heart", 30, 45, "The body of the scent, once the top has lifted."),
            ("base", 30, 50, "What stays on skin: it anchors the blend and sets how long it lasts.")]:
    con.execute("insert into structure_targets values (?,?,?,?)", list(row))

# Accords: named combinations of ingredients that smell like one thing together, with the parts that recreate it.
ACCORDS = {
    "Petrichor": ("Wet earth after the first rain.", {"Vetiver": 2, "Oakmoss": 1, "Patchouli": 1, "Seaweed Absolute": 1}),
    "Green tea": ("Cool, leafy and lightly bitter, like a steeped cup.", {"Bergamot": 2, "Violet Leaf": 1, "Hedione": 2, "White Musk": 1}),
    "Sea breeze": ("Salt air over cold water.", {"Calone": 2, "Grapefruit": 1, "Seaweed Absolute": 1, "Ambroxan": 1}),
    "Classic cologne": ("A clean, sparkling citrus splash.", {"Bergamot": 3, "Lemon": 2, "Neroli": 1, "Cedarwood": 1}),
    "Rose garden": ("Dewy rose with a green, peppery edge.", {"Rose Otto": 2, "Geranium": 1, "Pink Pepper": 1, "Patchouli": 1}),
    "White floral": ("A heady bouquet of white petals.", {"Jasmine Absolute": 2, "Tuberose": 1, "Ylang-Ylang": 1, "Neroli": 1}),
    "Vanilla amber": ("Warm, sweet and enveloping.", {"Vanilla": 3, "Tonka Bean": 2, "Benzoin": 1, "Ambroxan": 1}),
    "Suede": ("Soft, powdery leather.", {"Iris Butter": 1, "Tobacco Leaf": 1, "Labdanum": 1}),
    "Chai spice": ("Warm milky spice, like a cup of chai.", {"Cardamom": 1, "Cinnamon": 1, "Ginger": 1, "Vanilla": 2}),
    "Orchard fruit": ("Crisp apple and juicy pear.", {"Green Apple": 2, "Pear": 2, "Mandarin": 1, "Hedione": 1}),
    "Temple smoke": ("Cool incense and resin.", {"Incense": 2, "Benzoin": 1, "Cedarwood": 1}),
    "Dark oud": ("Smoky, resinous and animalic.", {"Oud": 1, "Patchouli": 2, "Vanilla": 1, "Pink Pepper": 1}),
    "Coconut cream": ("Creamy coconut with warm vanilla.", {"Coconut": 2, "Vanilla": 2, "Almond": 1, "Tonka Bean": 1}),
    "Osmanthus tea": ("Apricot-skin flower over black tea.", {"Osmanthus": 2, "Black Tea": 2, "Bergamot": 1, "Yuzu": 1}),
    "Tobacco honey": ("Sweet, dry leaf with golden honey.", {"Tobacco Leaf": 2, "Honey": 1, "Vanilla": 1, "Myrrh": 1}),
    "Saffron rose": ("Spiced, leathery rose.", {"Saffron": 1, "Rose Otto": 2, "Oud": 1, "Patchouli": 1}),
    "Fresh air": ("Clean, cold air after a storm.", {"Ozone": 2, "Sea Salt": 1, "Calone": 1, "Cashmeran": 1}),
    "Lychee rose": ("A juicy, modern rose.", {"Lychee": 2, "Rose Otto": 2, "Blackcurrant": 1, "Hedione": 1}),
    "Pine forest": ("Cold needles and resin.", {"Fir Balsam": 2, "Juniper Berry": 1, "Cedarwood": 1, "Eucalyptus": 1}),
    "Tropical fruit": ("Sun-warm pineapple and lychee.", {"Pineapple": 2, "Coconut": 1, "Lychee": 1, "Mandarin": 1}),
    "Leather jacket": ("Worn, smoky leather.", {"Leather": 1, "Castoreum": 1, "Guaiac Wood": 1, "Labdanum": 1}),
    "Fougere": ("Lavender, herbs and moss: the classic barbershop.", {"Lavender": 2, "Thyme": 1, "Cypress": 1, "Oakmoss": 1, "Bergamot": 1}),
    "Fruity chypre": ("Velvety fruit over moss and earth.", {"Peach": 2, "Plum": 1, "Bergamot": 2, "Patchouli": 1, "Oakmoss": 1}),
    "Peony bouquet": ("Dewy pink petals, light and airy.", {"Peony": 2, "Rose Absolute": 1, "Freesia": 1, "Hedione": 1}),
    "Boozy gourmand": ("Rum-soaked vanilla and dark sweetness.", {"Rum": 2, "Vanilla": 2, "Tonka Bean": 1, "Licorice": 1}),
    "Skin musk": ("Warm, soft, clean skin.", {"Muscone": 1, "Ambrette Seed": 1, "Galaxolide": 1, "White Musk": 2}),
}

# Why each ingredient is in its accord: the part of the smell it supplies.
WHY = {
    "Petrichor": {"Vetiver": "Damp, rooty earth.", "Oakmoss": "Mossy forest-floor wetness.", "Patchouli": "Dark, wet soil.", "Seaweed Absolute": "A mineral, briny edge."},
    "Green tea": {"Bergamot": "Bright, slightly bitter citrus lift.", "Violet Leaf": "Cool, cut-leaf green.", "Hedione": "Airy, transparent freshness.", "White Musk": "A clean, soft, skin-like base."},
    "Sea breeze": {"Calone": "The watery, ozonic core.", "Grapefruit": "A sparkling citrus spray.", "Seaweed Absolute": "Briny salt.", "Ambroxan": "Mineral, salty warmth that lingers."},
    "Classic cologne": {"Bergamot": "Rounded, sparkling citrus.", "Lemon": "Sharp, zesty top.", "Neroli": "Smooth, honeyed orange blossom.", "Cedarwood": "A dry woody backbone."},
    "Rose garden": {"Rose Otto": "The dewy rose heart.", "Geranium": "Green, minty rose leaf.", "Pink Pepper": "A peppery sparkle.", "Patchouli": "Earthy depth under the petals."},
    "White floral": {"Jasmine Absolute": "Heady, indolic petals.", "Tuberose": "Creamy, narcotic white flower.", "Ylang-Ylang": "Custardy, banana-like sweetness.", "Neroli": "A fresh orange-blossom lift."},
    "Vanilla amber": {"Vanilla": "Sweet, creamy warmth.", "Tonka Bean": "Almond and hay sweetness.", "Benzoin": "Balsamic resin that reads as vanilla.", "Ambroxan": "A dry, radiant amber."},
    "Suede": {"Iris Butter": "Powdery, cool, rooty softness.", "Tobacco Leaf": "Dry, leathery smoke.", "Labdanum": "Warm, leathery resin."},
    "Chai spice": {"Cardamom": "Cool, eucalyptus-like spice.", "Cinnamon": "Hot, sweet spice.", "Ginger": "A zesty, warm bite.", "Vanilla": "Milky sweetness."},
    "Orchard fruit": {"Green Apple": "Crisp and tart.", "Pear": "Juicy and soft.", "Mandarin": "Sweet citrus.", "Hedione": "Airy lift that keeps the fruit fresh."},
    "Temple smoke": {"Incense": "Cool, smoky resin.", "Benzoin": "Sweet balsamic resin.", "Cedarwood": "Dry wood."},
    "Dark oud": {"Oud": "Smoky, animalic wood.", "Patchouli": "Dark, earthy bulk.", "Vanilla": "Sweetness that softens the smoke.", "Pink Pepper": "A dry spark."},
    "Coconut cream": {"Coconut": "Creamy coconut.", "Vanilla": "Warm sweetness.", "Almond": "A nutty, marzipan note.", "Tonka Bean": "Sweet hay and almond."},
    "Osmanthus tea": {"Osmanthus": "Apricot-skin flower.", "Black Tea": "Dry, tannic leaf.", "Bergamot": "Bright citrus lift.", "Yuzu": "Tart, aromatic citrus."},
    "Tobacco honey": {"Tobacco Leaf": "Sweet, dry leaf.", "Honey": "Golden, waxy sweetness.", "Vanilla": "Creamy warmth.", "Myrrh": "Bitter, resinous depth."},
    "Saffron rose": {"Saffron": "Leathery, metallic spice.", "Rose Otto": "The rose heart.", "Oud": "Smoky wood.", "Patchouli": "Earthy depth."},
    "Fresh air": {"Ozone": "Cold, electric air.", "Sea Salt": "Clean mineral salt.", "Calone": "Watery freshness.", "Cashmeran": "A soft, musky, woody haze."},
    "Lychee rose": {"Lychee": "Juicy, grape-like fruit.", "Rose Otto": "The rose heart.", "Blackcurrant": "Tart, jammy fruit.", "Hedione": "Airy transparency."},
    "Pine forest": {"Fir Balsam": "Cold needles and resin.", "Juniper Berry": "Dry, gin-like green.", "Cedarwood": "Dry wood.", "Eucalyptus": "Cool, camphor freshness."},
    "Tropical fruit": {"Pineapple": "Sweet, sharp fruit.", "Coconut": "Creamy sun-lotion warmth.", "Lychee": "Juicy floral fruit.", "Mandarin": "Sweet citrus."},
    "Leather jacket": {"Leather": "Dry, smoky suede.", "Castoreum": "Warm, animal sweetness.", "Guaiac Wood": "Smoky, tea-like wood.", "Labdanum": "Sticky, leathery resin."},
    "Fougere": {"Lavender": "Clean, herbal calm.", "Thyme": "A warm, medicinal herb.", "Cypress": "Dry green wood.", "Oakmoss": "Mossy, earthy base.", "Bergamot": "Bright citrus opening."},
    "Fruity chypre": {"Peach": "Velvety fruit skin.", "Plum": "Dark, jammy fruit.", "Bergamot": "Sparkling citrus.", "Patchouli": "Earthy depth.", "Oakmoss": "Damp, mossy base."},
    "Peony bouquet": {"Peony": "Dewy pink petals.", "Rose Absolute": "A warm, honeyed rose.", "Freesia": "Light, peppery floral.", "Hedione": "Airy lift."},
    "Boozy gourmand": {"Rum": "Warm, boozy oak.", "Vanilla": "Creamy sweetness.", "Tonka Bean": "Sweet hay and almond.", "Licorice": "A dark, anise edge."},
    "Skin musk": {"Muscone": "Warm, furry musk.", "Ambrette Seed": "A soft plant musk.", "Galaxolide": "Clean, sweet musk.", "White Musk": "Soft laundry freshness."},
}
for _a, _r in ACCORDS.items():
    assert set(WHY[_a]) == set(_r[1]), _a
con.execute("create table accords (accord_id integer, name varchar, blurb varchar)")
con.execute("create table accord_parts (accord_id integer, ingredient_id integer, parts double, why varchar)")
for aid, (nm, (blurb, recipe)) in enumerate(ACCORDS.items(), 1):
    con.execute("insert into accords values (?,?,?)", [aid, nm, blurb])
    for ing, parts in recipe.items():
        con.execute("insert into accord_parts values (?,?,?,?)", [aid, NAMES[ing], parts, WHY[nm][ing]])
print({t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in ["structure_targets", "accords", "accord_parts"]})

# Interactions: pairs of ingredients that lift each other (boost) or fight (clash). Synthetic rules of thumb from classic perfumery pairings.
PAIRS = [
    ("Hedione", "Jasmine Absolute", "boost", "Hedione makes jasmine airy and radiant."), ("Hedione", "Neroli", "boost", "Lifts neroli into a bright, transparent cloud."),
    ("Hedione", "Bergamot", "boost", "Spreads the citrus further."), ("Hedione", "Rose Otto", "boost", "Opens rose into a fresher, dewier petal."),
    ("Ambroxan", "Cedarwood", "boost", "Adds glow and reach to a dry wood."), ("Ambroxan", "Vetiver", "boost", "Gives earthy roots a clean, salty lift."),
    ("Ambroxan", "Sandalwood", "boost", "Warms and spreads creamy wood."), ("Iso E Super", "Vetiver", "boost", "A velvety wood halo around vetiver."),
    ("Iso E Super", "Sandalwood", "boost", "Smooths and spreads sandalwood."), ("Aldehyde C-12", "Rose Otto", "boost", "Aldehydes add sparkle to rose."),
    ("Aldehyde C-12", "Jasmine Absolute", "boost", "Sparkle over jasmine."), ("Aldehyde C-12", "Iris Butter", "boost", "A bright top over powdery iris."),
    ("Vanilla", "Tonka Bean", "boost", "Two sweet notes that deepen each other."), ("Vanilla", "Benzoin", "boost", "Balsamic warmth under the vanilla."),
    ("Vanilla", "Coconut", "boost", "Creamy and warm."), ("Almond", "Tonka Bean", "boost", "Marzipan and hay: cosy and soft."),
    ("Honey", "Tobacco Leaf", "boost", "A classic sweet tobacco."), ("Bergamot", "Lavender", "boost", "The classic fougere opening."),
    ("Bergamot", "Oakmoss", "boost", "The classic chypre opening."), ("Oakmoss", "Labdanum", "boost", "The chypre base."),
    ("Patchouli", "Labdanum", "boost", "Earthy and resinous, each deepening the other."), ("Rose Otto", "Patchouli", "boost", "Rose and patchouli: dark and classic."),
    ("Rose Otto", "Pink Pepper", "boost", "Pepper wakes rose up."), ("Rose Otto", "Lychee", "boost", "A fruity, modern rose."),
    ("Saffron", "Oud", "boost", "Leathery spice over resin."), ("Saffron", "Rose Otto", "boost", "Spiced rose."),
    ("Oud", "Patchouli", "boost", "Deepens the dark woods."), 
    ("Calone", "Grapefruit", "boost", "Salty, sparkling citrus."), ("Calone", "Ambroxan", "boost", "Marine freshness with a mineral glow."),
    ("Ozone", "Sea Salt", "boost", "Cold air over salt water."), ("Osmanthus", "Black Tea", "boost", "Apricot-skin flower over tea."),
    ("Black Tea", "Bergamot", "boost", "Citrus brightens the tea."), ("Coconut", "Tuberose", "boost", "A creamy white flower."),
    ("Cashmeran", "White Musk", "boost", "Soft, warm skin."), ("Ginger", "Cardamom", "boost", "A bright, warm spice."),
    ("Oud", "Calone", "clash", "Heavy resin drowns the watery freshness."), ("Oud", "Lemon", "clash", "Sharp citrus against dark resin."),
    ("Cinnamon", "Peppermint", "clash", "Hot spice against cold menthol."), ("Peppermint", "Vanilla", "clash", "Menthol cuts the sweetness."),
    ("Eucalyptus", "Vanilla", "clash", "Medicinal cool against sweet cream."), ("Eucalyptus", "Honey", "clash", "Camphor against honey."),
    
    ("Galbanum", "Vanilla", "clash", "Sharp green against sweet cream."),
    ("Cacao", "Calone", "clash", "Dark chocolate against sea air."), ("Coffee", "Lily of the Valley", "clash", "Roast against a dewy floral."),
    ("Tobacco Leaf", "Ozone", "clash", "Dry leaf against cold air."), ("Honey", "Ozone", "clash", "Sticky sweet against clean air."),
    ("Oakmoss", "Pineapple", "clash", "Damp moss against bright tropical fruit."), ("Incense", "Pineapple", "clash", "Smoke against bright tropical fruit."),
    ("Seaweed Absolute", "Vanilla", "clash", "Briny against sweet."),
    ("Leather", "Castoreum", "boost", "Smoke and sweet animal warmth: a full leather."), ("Civet", "Jasmine Absolute", "boost", "A trace of civet makes jasmine feel alive."),
    ("Muscone", "White Musk", "boost", "Deepens a clean musk with warm skin."), ("Rum", "Vanilla", "boost", "Boozy cream."),
    ("Star Anise", "Licorice", "boost", "Two anise notes stacking into dark sweetness."), ("Thyme", "Lavender", "boost", "The herbal heart of a fougere."),
    ("Carnation", "Rose Absolute", "boost", "A spicy-sweet old rose."), ("Peach", "Plum", "boost", "Stone fruit that rounds each other."),
    ("Fig", "Coconut", "boost", "Milky green fruit."), ("Peony", "Hedione", "boost", "Airy, dewy petals."),
    ("Cumin", "Calone", "clash", "Sweaty spice against cold sea air."), ("Leather", "Ozone", "clash", "Dark smoke against clean air."),
    ("Rum", "Eucalyptus", "clash", "Boozy sweetness against medicinal cool."),
]
con.execute("create table ingredient_pairs (a_id integer, b_id integer, kind varchar, note varchar)")
for a, b, kind, note in PAIRS:
    con.execute("insert into ingredient_pairs values (?,?,?,?)", [NAMES[a], NAMES[b], kind, note])
# Fragrance allergens: the EU makes a brand name these on the label once one passes 0.001% of a leave-on product. How much of each an ingredient holds is
# published typical content from GC-MS studies and supplier sheets (data/allergen_content.csv, one source per row). Natural oils vary with crop and origin, so
# these are typical values, not a specification. Where nothing was found the ingredient has no row and counts as holding none; that under-declares (basil,
# tuberose, iris, violet leaf, mimosa, saffron, frankincense, oakmoss, vanilla and other absolutes were looked for and not found). Single chemicals and accords hold none.
ALLERGENS = {}
with open(os.path.join(os.path.dirname(DB), "allergen_content.csv")) as fh:
    for r in csv.DictReader(fh):
        ALLERGENS.setdefault(r["ingredient"], {})[r["allergen"]] = float(r["typical_pct"])
assert set(ALLERGENS) <= set(NAMES), set(ALLERGENS) - set(NAMES)
con.execute("create table ingredient_allergens (ingredient_id integer, allergen varchar, pct double)")
for name, held in ALLERGENS.items():
    for allergen, pct in held.items():
        con.execute("insert into ingredient_allergens values (?,?,?)", [NAMES[name], allergen, pct])
# Bergamot is taken as the furocoumarin-free grade perfumers use, so it is not held to the expressed oil's 0.4% (IFRA Standard 087).
# IFRA limits, category 4 (fine fragrance), from the IFRA Standards, 51st Amendment (data/ifra_51st_category4.csv, taken from IFRA's own overview file).
# An ingredient's limit is the lowest of: its own Standard (when it has one), and what a restricted constituent allows (the constituent's limit over how much of
# the ingredient it makes up). A prohibited material gets 0. No Standard means no restriction: 100, shown as "no limit". Constituent contents are the rounded
# synthetic figures above, so the derived limits are estimates. Contributions from other ingredients are not added up.
with open(os.path.join(os.path.dirname(DB), "ifra_51st_category4.csv")) as fh:
    STD = {r["standard"]: r for r in csv.DictReader(fh)}
OWN_STD = {"Lemon": "092", "Grapefruit": "091", "Jasmine Absolute": "049", "Ylang-Ylang": "084", "Oakmoss": "067", "Black Tea": "079",
           "Iso E Super": "068", "Bitter Orange": "088", "Cumin": "090"}
# Restricted constituents that are not on the EU allergen list: (Standard, share of the ingredient in %, where the share comes from). IFRA's own annex on
# contributions from other sources gives the natural-oil shares; the three bases have no published composition, so their shares are assumptions.
DERIVED_STD = {
    "Star Anise": [("099", 3.3, "estragole is about 3.3% of the oil (IFRA annex)")],
    "Rose Absolute": [("100", 0.43, "methyl eugenol is about 0.43% of the absolute (IFRA annex)"), ("021", 7.08, "citral is about 7% of the absolute (IFRA annex)")],
    "Cypress": [("197", 0.74, "cedrene is about 0.74% of the oil (IFRA annex)")],
    "Ambrette Seed": [("202", 0.5, "farnesal is about 0.5% of the absolute (IFRA annex)")],
    "Plum": [("077", 3.0, "assumed: a plum base holds about 3% damascones")],
    "Peony": [("241", 10.0, "assumed: a peony base holds about 10% peonile")],
}
CONSTITUENT_STD = {"Coumarin": "023", "Eugenol": "035", "Isoeugenol": "048", "Citral": "021", "Geraniol": "037", "Citronellol": "022", "Cinnamal": "018",
                   "Farnesol": "036", "Benzyl Benzoate": "009", "Hydroxycitronellal": "043"}
con.execute("alter table ingredients add column ifra_basis varchar")
for name in NAMES:
    best = (100.0, "No IFRA restriction")
    if name in OWN_STD:
        r = STD["IFRA_STD_" + OWN_STD[name]]
        if r["category4_pct"] == "":
            best = (0.0, f"Prohibited by IFRA: {r['name']}")
        else:
            best = (float(r["category4_pct"]), f"IFRA Standard: {r['name']}")
    for std, pct, why in DERIVED_STD.get(name, []):
        r = STD["IFRA_STD_" + std]; lim = round(float(r["category4_pct"]) / (pct / 100), 2)
        if lim < best[0]:
            best = (min(lim, 100.0), f"{r['name']} is limited to {r['category4_pct']}% by IFRA, and {why}")
    for allergen, pct in ALLERGENS.get(name, {}).items():
        if allergen in CONSTITUENT_STD:
            r = STD["IFRA_STD_" + CONSTITUENT_STD[allergen]]; lim = round(float(r["category4_pct"]) / (pct / 100), 2)
            if lim < best[0]:
                best = (min(lim, 100.0), f"{allergen} is limited to {r['category4_pct']}% by IFRA, and this is about {pct:g}% {allergen.lower()}")
    con.execute("update ingredients set ifra_max_pct = ?, ifra_basis = ? where name = ?", [best[0], best[1], name])
print(con.execute("select count(*) filter (where ifra_max_pct = 0), count(*) filter (where ifra_max_pct < 100 and ifra_max_pct > 0), count(*) filter (where ifra_max_pct >= 100) from ingredients").fetchone(), "prohibited / limited / no limit")
print({t: con.execute(f"select count(*) from {t}").fetchone()[0] for t in ["ingredients", "accords", "accord_parts", "ingredient_pairs", "ingredient_allergens"]})
