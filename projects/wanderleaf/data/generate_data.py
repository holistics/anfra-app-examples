"""Generate the synthetic Wanderleaf Books dataset as a DuckDB file.

Fictional fleet of five book caravans in the fictional town of Driftmouth Bay.
One caravan is at each of the five spots every trading day, so recorded demand
exists for every spot on every day (this powers the "hindsight" reveal).

Story days pinned to exact values:
  * Sat 2025-06-14: rain everywhere, cruise ship in port. Juniper at the Harbour
    takes 612 GBP (38 of 40 books sold, 46 requested). Hazel takes 680 at Old Town.
  * Sat 2024-06-15: the same Saturday last year (sunny, no ship), fleet 1,661.

Usage:  pip install duckdb numpy  &&  python generate_data.py  [output path]
"""
import sys
import datetime as dt
from pathlib import Path

import duckdb
import numpy as np

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("wanderleaf.duckdb")
rng = np.random.default_rng(14)

START, END = dt.date(2024, 1, 1), dt.date(2025, 9, 30)

GENRES = ["Mystery", "Travel", "Romance", "Children's", "History", "Cookery",
          "Fantasy", "Poetry", "Nature", "Sci-fi", "Philosophy"]
PRICE = {"Mystery": 15, "Travel": 18, "Romance": 14, "Children's": 12, "History": 20,
         "Cookery": 22, "Fantasy": 18, "Poetry": 14, "Nature": 16, "Sci-fi": 15, "Philosophy": 17}

# Public-domain titles (metadata only).
BOOKS = {
    "Mystery": [("The Moonstone", "Wilkie Collins", 1868), ("The Woman in White", "Wilkie Collins", 1859),
                ("The Hound of the Baskervilles", "Arthur Conan Doyle", 1902), ("A Study in Scarlet", "Arthur Conan Doyle", 1887),
                ("The Sign of the Four", "Arthur Conan Doyle", 1890), ("The Mysterious Affair at Styles", "Agatha Christie", 1920),
                ("The Secret Adversary", "Agatha Christie", 1922), ("The Innocence of Father Brown", "G. K. Chesterton", 1911),
                ("The Riddle of the Sands", "Erskine Childers", 1903), ("The Thirty-Nine Steps", "John Buchan", 1915)],
    "Travel": [("Travels with a Donkey in the Cévennes", "Robert Louis Stevenson", 1879), ("An Inland Voyage", "Robert Louis Stevenson", 1878),
               ("The Innocents Abroad", "Mark Twain", 1869), ("A Tramp Abroad", "Mark Twain", 1880),
               ("Following the Equator", "Mark Twain", 1897), ("Around the World in Eighty Days", "Jules Verne", 1872),
               ("Eothen", "A. W. Kinglake", 1844), ("Italian Hours", "Henry James", 1909)],
    "Romance": [("Pride and Prejudice", "Jane Austen", 1813), ("Persuasion", "Jane Austen", 1817), ("Emma", "Jane Austen", 1815),
                ("Jane Eyre", "Charlotte Brontë", 1847), ("Wuthering Heights", "Emily Brontë", 1847),
                ("North and South", "Elizabeth Gaskell", 1855), ("A Room with a View", "E. M. Forster", 1908),
                ("The Enchanted April", "Elizabeth von Arnim", 1922), ("Far from the Madding Crowd", "Thomas Hardy", 1874)],
    "Children's": [("Just So Stories", "Rudyard Kipling", 1902), ("The Wind in the Willows", "Kenneth Grahame", 1908),
                   ("The Secret Garden", "Frances Hodgson Burnett", 1911), ("Alice's Adventures in Wonderland", "Lewis Carroll", 1865),
                   ("The Velveteen Rabbit", "Margery Williams", 1922), ("The Railway Children", "E. Nesbit", 1906),
                   ("Black Beauty", "Anna Sewell", 1877), ("Treasure Island", "Robert Louis Stevenson", 1883),
                   ("The Jungle Book", "Rudyard Kipling", 1894)],
    "History": [("A Child's History of England", "Charles Dickens", 1851), ("The History of the Decline and Fall of the Roman Empire", "Edward Gibbon", 1776),
                ("A Short History of the English People", "J. R. Green", 1874), ("The French Revolution", "Thomas Carlyle", 1837),
                ("Eminent Victorians", "Lytton Strachey", 1918), ("Parallel Lives", "Plutarch", 100)],
    "Cookery": [("Modern Cookery for Private Families", "Eliza Acton", 1845), ("Mrs Beeton's Book of Household Management", "Isabella Beeton", 1861),
                ("The Art of Cookery Made Plain and Easy", "Hannah Glasse", 1747), ("The Compleat Housewife", "Eliza Smith", 1727),
                ("The Boston Cooking-School Cook Book", "Fannie Farmer", 1896), ("The Physiology of Taste", "Jean Anthelme Brillat-Savarin", 1825)],
    "Fantasy": [("Phantastes", "George MacDonald", 1858), ("The Princess and the Goblin", "George MacDonald", 1872),
                ("The Wonderful Wizard of Oz", "L. Frank Baum", 1900), ("The King of Elfland's Daughter", "Lord Dunsany", 1924),
                ("The Well at the World's End", "William Morris", 1896), ("Gulliver's Travels", "Jonathan Swift", 1726)],
    "Poetry": [("Lyrical Ballads", "William Wordsworth and Samuel Taylor Coleridge", 1798), ("Leaves of Grass", "Walt Whitman", 1855),
               ("Songs of Innocence and of Experience", "William Blake", 1794), ("A Shropshire Lad", "A. E. Housman", 1896),
               ("Goblin Market", "Christina Rossetti", 1862), ("Sonnets from the Portuguese", "Elizabeth Barrett Browning", 1850)],
    "Nature": [("The Natural History of Selborne", "Gilbert White", 1789), ("Walden", "Henry David Thoreau", 1854),
               ("The Voyage of the Beagle", "Charles Darwin", 1839), ("My First Summer in the Sierra", "John Muir", 1911),
               ("Wild Wales", "George Borrow", 1862)],
    "Sci-fi": [("The Time Machine", "H. G. Wells", 1895), ("The War of the Worlds", "H. G. Wells", 1898),
               ("Twenty Thousand Leagues Under the Seas", "Jules Verne", 1870), ("Frankenstein", "Mary Shelley", 1818),
               ("The Lost World", "Arthur Conan Doyle", 1912), ("Herland", "Charlotte Perkins Gilman", 1915)],
    "Philosophy": [("Meditations", "Marcus Aurelius", 180), ("Letters from a Stoic", "Seneca", 65), ("Enchiridion", "Epictetus", 125),
                   ("Essays", "Michel de Montaigne", 1580), ("On Liberty", "John Stuart Mill", 1859), ("Utopia", "Thomas More", 1516)],
}

SPOTS = [  # id, name, area_type, map_x, map_y, base demand (books/day), rain effect, ship lift, conversion
    (1, "Harbour", "harbour", 600, 604, 26, -0.08, 0.40, 0.062),
    (2, "Old Town Square", "old town", 700, 362, 30, -0.05, 0.10, 0.060),
    (3, "Saturday Market", "market", 985, 522, 20, -0.34, 0.05, 0.050),
    (4, "University", "campus", 1060, 142, 18, -0.12, 0.00, 0.055),
    (5, "Lighthouse", "landmark", 150, 286, 7, -0.45, 0.00, 0.050),
]
MIX = {
    1: [.24, .19, .14, .11, .08, .06, .05, .04, .04, .03, .02],
    2: [.18, .08, .11, .07, .23, .13, .05, .05, .04, .03, .03],
    3: [.13, .07, .16, .18, .06, .22, .05, .03, .06, .02, .02],
    4: [.10, .04, .06, .01, .09, .02, .26, .07, .05, .18, .12],
    5: [.09, .15, .07, .12, .06, .02, .04, .21, .20, .01, .03],
}
CARAVANS = [  # id, name, crate_capacity, has_awning, home spot
    (1, "Juniper", 40, True, 1), (2, "Hazel", 60, True, 2), (3, "Bramble", 40, True, 3),
    (4, "Sorrel", 40, False, 4), (5, "Wren", 20, True, 5),
]
SEASON = {1: .55, 2: .6, 3: .75, 4: .9, 5: 1.0, 6: 1.2, 7: 1.35, 8: 1.35, 9: 1.0, 10: .8, 11: .6, 12: .75}
RAIN_P = {1: .45, 2: .4, 3: .38, 4: .33, 5: .28, 6: .3, 7: .22, 8: .25, 9: .3, 10: .4, 11: .48, 12: .45}


def weekday_factor(spot_id, d):
    wd = d.weekday()  # Mon=0 ... Sun=6
    if spot_id == 3:
        return 2.0 if wd == 5 else 0.55
    if spot_id == 4:
        return 0.6 if wd >= 5 else 1.25
    if spot_id in (1, 5):
        return 1.35 if wd >= 5 else 0.9
    return 1.3 if wd == 5 else 0.95


def weather_for(d):
    if rng.random() < RAIN_P[d.month]:
        return "storm" if rng.random() < 0.12 else "rain"
    return "cloud" if rng.random() < 0.4 else "sun"


def weather_mult(eff, w):
    return {"sun": 1.0, "cloud": 1 + eff / 2, "rain": 1 + eff, "storm": 1 + 1.5 * eff}[w]


# Events: cruise ships, the Lantern Festival, exam weeks.
ship_days = set()
for year in (2024, 2025):
    for month, n in ((5, 3), (6, 6), (7, 11), (8, 8), (9, 4)):
        days = [dt.date(year, month, x) for x in range(1, 29)]
        for i in rng.choice(len(days), n, replace=False):
            ship_days.add(days[i])
ship_days.add(dt.date(2025, 6, 14))
ship_days.discard(dt.date(2024, 6, 15))
festival = {dt.date(y, 8, 4) + dt.timedelta(k) for y in (2024, 2025) for k in range(14)}
exams = {dt.date(y, m, dd) + dt.timedelta(k) for y in (2024, 2025) for (m, dd) in ((5, 13), (6, 9)) for k in range(12)}

book_rows, by_genre, bid = [], {g: [] for g in GENRES}, 1
for g in GENRES:
    for title, author, year in BOOKS[g]:
        book_rows.append((bid, title, author, g, year, PRICE[g]))
        by_genre[g].append(bid)
        bid += 1

# Customers: regulars per spot plus casual visitors.
cust_rows, regulars = [], {s[0]: [] for s in SPOTS}
cid = 1
for s in SPOTS:
    for _ in range({1: 30, 2: 40, 3: 25, 4: 20, 5: 10}[s[0]]):
        first = START + dt.timedelta(int(rng.integers(0, 200)))
        cust_rows.append((cid, first, s[0], True))
        regulars[s[0]].append(cid)
        cid += 1
casual_start = cid
for _ in range(6000):
    cust_rows.append((cid, START + dt.timedelta(int(rng.integers(0, 600))), int(rng.integers(1, 6)), False))
    cid += 1

trading, loads, requests, sales, events = [], [], [], [], []
sale_id = 1


def allocate(total, shares):
    raw = np.array(shares) * total
    base = np.floor(raw).astype(int)
    for i in np.argsort(-(raw - base))[: total - base.sum()]:
        base[i] += 1
    return base


def record_sales(d, spot_id, caravan_id, sold, target=None):
    global sale_id
    rows = []
    for gi, n in enumerate(sold):
        g = GENRES[gi]
        for _ in range(int(n)):
            book = int(rng.choice(by_genre[g]))
            minute = int(rng.integers(0, 420))
            ts = dt.datetime.combine(d, dt.time(10)) + dt.timedelta(minutes=minute)
            if rng.random() < 0.3 and regulars[spot_id]:
                cust = int(rng.choice(regulars[spot_id]))
            else:
                cust = int(rng.integers(casual_start, cid))
            rows.append([sale_id, ts, spot_id, caravan_id, book, cust, 1, float(PRICE[g])])
            sale_id += 1
    if target is not None and rows:
        diff = target - sum(r[7] for r in rows)
        rows[-1][7] = round(rows[-1][7] + diff, 2)  # small discount or surcharge line to hit the pinned total
    sales.extend(tuple(r) for r in rows)


STORY = {
    dt.date(2025, 6, 14): {"weather": "rain", "targets": {2: 680, 3: 274, 4: 198, 5: 61}, "visitors": {1: 702, 2: 690, 3: 380, 4: 240, 5: 90}},
    dt.date(2024, 6, 15): {"weather": "sun", "targets": {1: 518, 2: 455, 3: 388, 4: 204, 5: 96}, "visitors": {1: 590, 2: 520, 3: 640, 4: 300, 5: 130}},
}
HARBOUR_STORY_LOADED = [12, 10, 6, 5, 3, 2, 2, 0, 0, 0, 0]
HARBOUR_STORY_REQUESTS = [15, 11, 5, 7, 4, 2, 1, 1, 0, 0, 0]

d = START
while d <= END:
    story = STORY.get(d)
    plan = {c[4]: c for c in CARAVANS}
    if not story and rng.random() < 0.15:  # occasional swaps between two spots
        a, b = rng.choice([1, 2, 3, 4, 5], 2, replace=False)
        plan[a], plan[b] = plan[b], plan[a]
    wx = story["weather"] if story else weather_for(d)
    for (sid, name, _, _, _, base, eff, lift, conv) in SPOTS:
        car = plan[sid]
        ev = "none"
        if d in ship_days and sid in (1, 2):
            ev = "cruise ship"
        elif d in festival and sid == 3:
            ev = "festival"
        elif d in exams and sid == 4:
            ev = "exam week"
        if story and sid == 1 and d == dt.date(2025, 6, 14):
            req = np.array(HARBOUR_STORY_REQUESTS)
            loaded_g = np.array(HARBOUR_STORY_LOADED)
            sold = np.minimum(req, loaded_g)
            record_sales(d, sid, car[0], sold)
            visitors = story["visitors"][sid]
        elif story:
            target = story["targets"][sid]
            avg_price = sum(m * PRICE[g] for m, g in zip(MIX[sid], GENRES))
            total = max(1, round(target / avg_price))
            req = allocate(total, MIX[sid])
            loaded_g = allocate(car[2], MIX[sid])
            loaded_g = np.maximum(loaded_g, req if car[2] >= total else loaded_g)
            sold = np.minimum(req, loaded_g)
            record_sales(d, sid, car[0], sold, target=target)
            visitors = story["visitors"][sid]
        else:
            m = base * SEASON[d.month] * weekday_factor(sid, d) * weather_mult(eff, wx)
            if not car[3] and wx in ("rain", "storm"):
                m *= 0.85
            if ev == "cruise ship":
                m *= 1 + lift
            elif ev == "festival":
                m *= 1.6
            elif ev == "exam week":
                m *= 1.3
            total = int(rng.poisson(max(m, 0.5)))
            req = rng.multinomial(total, MIX[sid])
            noisy = np.clip(np.array(MIX[sid]) * rng.normal(1, 0.25, len(GENRES)), 0.001, None)
            loaded_g = allocate(car[2], noisy / noisy.sum())
            sold = np.minimum(req, loaded_g)
            record_sales(d, sid, car[0], sold)
            visitors = int(round(max(total, 1) / (conv * rng.normal(1, 0.08))))
        trading.append((d, sid, car[0], wx, ev, visitors))
        for gi, g in enumerate(GENRES):
            requests.append((d, sid, g, int(req[gi])))
            if loaded_g[gi] > 0:
                ids = by_genre[g]
                per = allocate(int(loaded_g[gi]), [1 / len(ids)] * len(ids))
                for b, n in zip(ids, per):
                    if n:
                        loads.append((d, car[0], b, int(n)))
        if ev != "none":
            events.append((d, sid, ev, {"cruise ship": "Cruise ship in port", "festival": "Lantern Festival on the market field", "exam week": "University exam week"}[ev]))
    d += dt.timedelta(1)

if OUT.exists():
    OUT.unlink()
con = duckdb.connect(str(OUT))
con.execute("CREATE TABLE spots (spot_id INTEGER PRIMARY KEY, name VARCHAR, area_type VARCHAR, map_x INTEGER, map_y INTEGER)")
con.executemany("INSERT INTO spots VALUES (?, ?, ?, ?, ?)", [s[:5] for s in SPOTS])
con.execute("CREATE TABLE caravans (caravan_id INTEGER PRIMARY KEY, name VARCHAR, crate_capacity INTEGER, has_awning BOOLEAN)")
con.executemany("INSERT INTO caravans VALUES (?, ?, ?, ?)", [c[:4] for c in CARAVANS])
con.execute("CREATE TABLE books (book_id INTEGER PRIMARY KEY, title VARCHAR, author VARCHAR, genre VARCHAR, first_published INTEGER, list_price DECIMAL(8,2))")
con.executemany("INSERT INTO books VALUES (?, ?, ?, ?, ?, ?)", book_rows)
con.execute("CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, first_visit_date DATE, home_spot_id INTEGER, is_regular BOOLEAN)")
con.executemany("INSERT INTO customers VALUES (?, ?, ?, ?)", cust_rows)
con.execute("CREATE TABLE trading_days (date DATE, spot_id INTEGER, caravan_id INTEGER, weather VARCHAR, event VARCHAR, visitors INTEGER)")
con.executemany("INSERT INTO trading_days VALUES (?, ?, ?, ?, ?, ?)", trading)
con.execute("CREATE TABLE crate_loads (date DATE, caravan_id INTEGER, book_id INTEGER, units_loaded INTEGER)")
con.executemany("INSERT INTO crate_loads VALUES (?, ?, ?, ?)", loads)
con.execute("CREATE TABLE genre_requests (date DATE, spot_id INTEGER, genre VARCHAR, requests INTEGER)")
con.executemany("INSERT INTO genre_requests VALUES (?, ?, ?, ?)", requests)
con.execute("CREATE TABLE sales (sale_id INTEGER PRIMARY KEY, sold_at TIMESTAMP, spot_id INTEGER, caravan_id INTEGER, book_id INTEGER, customer_id INTEGER, units INTEGER, net_revenue DECIMAL(10,2))")
con.executemany("INSERT INTO sales VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sales)
con.execute("CREATE TABLE events_calendar (date DATE, spot_id INTEGER, event_type VARCHAR, description VARCHAR)")
con.executemany("INSERT INTO events_calendar VALUES (?, ?, ?, ?)", events)
con.close()
print(f"Wrote {OUT}: {len(trading)} trading days, {len(sales)} sales, {len(requests)} request rows, {len(loads)} crate-load rows")
