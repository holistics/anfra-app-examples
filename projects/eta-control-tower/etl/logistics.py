"""Deterministic sample freight data for the ETA Risk Control Tower.

Every time is relative to ANCHOR, the "now" the data is generated for. The views in
db/logistics.sql move every timestamp by now() - ANCHOR, so the demo always looks live.
"""
import itertools
import math
import random
from datetime import datetime, timedelta, timezone

ANCHOR = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
SEED = 7
N_GENERATED = 3000
BOOKING_SKEW = 1.3  # above 1 puts more bookings near the anchor; raise it for more active shipments
NEWEST_GENERATED = timedelta(hours=2)  # generated events stay older than this, so ORD-48213 heads the feed
WEEK = timedelta(days=7)

STAGES = ["Booked", "Origin pickup", "Origin port", "In transit", "Destination port", "Customs", "Final-mile", "Delivered"]
NOMINAL = {  # planned hours in each stage before Delivered
    "ocean": {"Booked": 24, "Origin pickup": 48, "Origin port": 72, "In transit": 480,
              "Destination port": 72, "Customs": 48, "Final-mile": 48},
    "air": {"Booked": 12, "Origin pickup": 24, "Origin port": 12, "In transit": 24,
            "Destination port": 12, "Customs": 24, "Final-mile": 24},
}
BUFFER_HOURS = {"ocean": 72, "air": 24}  # promised = original ETA + buffer

# (stage, risk factor): (chance it is raised while a shipment is in the stage, chance it moves the ETA, mean slip hours)
RISKS = {
    ("Origin pickup", "Equipment shortage"): (0.06, 0.50, 18),
    ("Origin pickup", "Weather"): (0.04, 0.40, 12),
    ("Origin port", "Port congestion"): (0.10, 0.55, 30),
    ("Origin port", "Vessel rollover"): (0.08, 0.80, 72),  # ocean only
    ("Origin port", "Missing docs"): (0.05, 0.45, 20),
    ("In transit", "Weather"): (0.08, 0.50, 24),
    ("Destination port", "Port congestion"): (0.12, 0.55, 30),
    ("Destination port", "Weather"): (0.04, 0.35, 12),
    ("Customs", "Customs inspection"): (0.12, 0.50, 30),
    ("Customs", "Missing docs"): (0.15, 0.64, 28),
    ("Final-mile", "Weather"): (0.04, 0.35, 8),
    ("Final-mile", "Equipment shortage"): (0.05, 0.45, 10),
}

# Story 1: customs congestion at Los Angeles, building over the last 3 weeks.
LA = "USLAX"
STORY_LA_CUSTOMS = {2: 0.5, 1: 0.75, 0: 0.95}  # weeks before the anchor -> chance of a customs inspection
STORY_LA_SLIP = (0.95, 84)  # chance it moves the ETA, mean slip hours
# Story 2: one carrier's vessel rollovers trend up over the last 4 weeks.
STORY_CARRIER = "Meridian Line"
STORY_ROLLOVER = 0.30
# Story 3 and the headline alert; the watchlist hit.
HEADLINE = "ORD-48213"
WATCHED = "ORD-51002"

KEY_CUSTOMERS = ["Northwind Retail", "Bluepeak Electronics", "Larkspur Home", "Ironwood Motors", "Summit Apparel", "Cobalt Pharma"]
STANDARD_CUSTOMERS = [f"{a} {b}" for a in ["Alder", "Birch", "Cedar", "Delta", "Ember", "Fable", "Granite", "Harbor",
                                           "Indigo", "Juniper", "Kestrel", "Lumen", "Maple", "Nova", "Orchid",
                                           "Pioneer", "Quartz"]
                      for b in ["Foods", "Trading"]]
REGIONS = ["North America", "Europe", "Oceania"]
ORIGINS = [("CNSHA", "Shanghai", "China"), ("CNNGB", "Ningbo", "China"), ("CNYTN", "Yantian", "China"),
           ("SGSIN", "Singapore", "Singapore"), ("KRPUS", "Busan", "South Korea"),
           ("VNSGN", "Ho Chi Minh City", "Vietnam"), ("VNHPH", "Haiphong", "Vietnam"),
           ("TWKHH", "Kaohsiung", "Taiwan"), ("INNSA", "Nhava Sheva", "India"), ("JPTYO", "Tokyo", "Japan")]
DESTS = [("USLAX", "Los Angeles", "United States", "North America"), ("USLGB", "Long Beach", "United States", "North America"),
         ("USNYC", "New York", "United States", "North America"), ("USSAV", "Savannah", "United States", "North America"),
         ("USHOU", "Houston", "United States", "North America"), ("NLRTM", "Rotterdam", "Netherlands", "Europe"),
         ("DEHAM", "Hamburg", "Germany", "Europe"), ("BEANR", "Antwerp", "Belgium", "Europe"),
         ("GBFXT", "Felixstowe", "United Kingdom", "Europe"), ("AUSYD", "Sydney", "Australia", "Oceania")]
DEST_WEIGHTS = [20, 10, 10, 8, 7, 12, 10, 8, 8, 7]
OCEAN_CARRIERS = ["Meridian Line", "Pacific Crest", "Oceanic Star", "Harbor Bridge", "Atlas Maritime"]
AIR_CARRIERS = ["SkyFreight", "Aerolink Cargo", "Northstar Air"]
# Port locations (lat, lon), to about 0.01 degrees: the map places lanes and shipments with them.
COORDS = {
    "CNSHA": (31.23, 121.49), "CNNGB": (29.87, 121.55), "CNYTN": (22.57, 114.27), "SGSIN": (1.26, 103.84),
    "KRPUS": (35.10, 129.04), "VNSGN": (10.77, 106.70), "VNHPH": (20.86, 106.68), "TWKHH": (22.61, 120.28),
    "INNSA": (18.95, 72.95), "JPTYO": (35.62, 139.78),
    "USLAX": (33.74, -118.27), "USLGB": (33.75, -118.19), "USNYC": (40.68, -74.04), "USSAV": (32.08, -81.09),
    "USHOU": (29.73, -95.27), "NLRTM": (51.95, 4.14), "DEHAM": (53.54, 9.98), "BEANR": (51.26, 4.40),
    "GBFXT": (51.96, 1.35), "AUSYD": (-33.97, 151.21),
}


def weeks_ago(t):
    """Whole weeks between t and the anchor: 0 is the last 7 days."""
    return (ANCHOR - t) // WEEK


def ports():
    rows = [{"code": c, "name": n, "country": k, "region": "Asia"} for c, n, k in ORIGINS]
    rows += [{"code": c, "name": n, "country": k, "region": r} for c, n, k, r in DESTS]
    return [{**row, "lat": COORDS[row["code"]][0], "lon": COORDS[row["code"]][1]} for row in rows]


def stage_nominal():
    """NOMINAL as rows, so the database can say how far a shipment is through its current stage."""
    return [{"mode": mode, "stage": stage, "hours": hours} for mode, stages in NOMINAL.items() for stage, hours in stages.items()]


def customers():
    names = [(n, "key") for n in KEY_CUSTOMERS] + [(n, "standard") for n in STANDARD_CUSTOMERS]
    return [{"id": i + 1, "name": n, "segment": s, "region": REGIONS[i % 3]} for i, (n, s) in enumerate(names)]


def odds(stage, factor, ship, entered):
    """The base odds for a risk, raised where a planted story says so."""
    p_raise, p_slip, mean = RISKS[(stage, factor)]
    w = weeks_ago(entered)
    if (stage, factor) == ("Customs", "Customs inspection") and ship["dest_port"] == LA and w in STORY_LA_CUSTOMS:
        p_raise = STORY_LA_CUSTOMS[w]
        p_slip, mean = STORY_LA_SLIP
    if (stage, factor) == ("Origin port", "Vessel rollover") and ship["carrier"] == STORY_CARRIER and w < 4:
        p_raise = STORY_ROLLOVER
    return p_raise, p_slip, mean


def random_risks(rng, ship, stage, entered, nominal):
    """[(hours after entering the stage, risk factor, slip hours)], in time order."""
    out = []
    for st, factor in RISKS:
        if st != stage or (factor == "Vessel rollover" and ship["mode"] != "ocean"):
            continue
        p_raise, p_slip, mean = odds(st, factor, ship, entered)
        if rng.random() >= p_raise:
            continue
        after = rng.uniform(0, 0.8 * nominal)
        slip = max(1, round(rng.uniform(0.5, 1.5) * mean)) if rng.random() < p_slip else 0
        out.append((after, factor, slip))
    return sorted(out)


def simulate(rng, ship, ids, plan=None):
    """Walk one shipment through its stages up to the anchor; fill its ETAs, stage and delivery.

    plan, for a crafted order, is {stage: [(hours after entry, risk factor, slip hours)]} and replaces the random risks.
    Returns (stage_events, risk_events).
    """
    mode = ship["mode"]
    t = ship["booked_at"]
    eta = t + timedelta(hours=sum(NOMINAL[mode].values()))
    ship["original_eta"] = eta
    newest = ANCHOR - (timedelta(0) if plan is not None else NEWEST_GENERATED)
    stages, events = [], []
    for stage in STAGES[:-1]:
        nominal = NOMINAL[mode][stage]
        risks = plan.get(stage, []) if plan is not None else random_risks(rng, ship, stage, t, nominal)
        slipped = 0
        for after, factor, slip in risks:
            raised = t + timedelta(hours=after)
            if raised > newest:
                continue
            new_eta = eta + timedelta(hours=slip)
            events.append({"id": next(ids["risk"]), "shipment_id": ship["id"], "raised_at": raised, "stage": stage,
                           "risk_factor": factor, "previous_eta": eta, "new_eta": new_eta, "slip_hours": slip})
            eta, slipped = new_eta, slipped + slip
        exited = t + timedelta(hours=nominal + slipped)
        stages.append({"id": next(ids["stage"]), "shipment_id": ship["id"], "stage": stage, "entered_at": t,
                       "exited_at": exited if exited <= ANCHOR else None})
        if exited > ANCHOR:
            ship.update(current_stage=stage, current_eta=eta, delivered_at=None)
            return stages, events
        t = exited
    stages.append({"id": next(ids["stage"]), "shipment_id": ship["id"], "stage": "Delivered", "entered_at": t,
                   "exited_at": None})
    ship.update(current_stage="Delivered", current_eta=eta, delivered_at=t)
    return stages, events


def crafted(first_id, custs):
    """The two named orders: (shipment, plan, buffer hours)."""
    by_name = {c["name"]: c["id"] for c in custs}
    return [
        ({"id": first_id, "order_ref": HEADLINE, "customer_id": by_name["Northwind Retail"], "mode": "ocean",
          "carrier": "Pacific Crest", "origin_port": "CNSHA", "dest_port": LA, "goods_value_usd": 420000.00,
          "booked_at": ANCHOR - timedelta(hours=726)},  # enters Customs 10h before the anchor
         {"Destination port": [(6, "Port congestion", 20)], "Customs": [(9, "Missing docs", 36)]}, 48),
        ({"id": first_id + 1, "order_ref": WATCHED, "customer_id": by_name["Cedar Foods"], "mode": "ocean",
          "carrier": "Oceanic Star", "origin_port": "VNSGN", "dest_port": "USLGB", "goods_value_usd": 310000.00,
          "booked_at": ANCHOR - timedelta(hours=702)},  # enters Customs 6h before the anchor
         {"Customs": [(3, "Missing docs", 0)]}, 12),
    ]


def generate(seed=SEED, n=N_GENERATED):
    rng = random.Random(seed)
    custs = customers()
    key = {c["id"] for c in custs if c["segment"] == "key"}
    ids = {"risk": itertools.count(1), "stage": itertools.count(1)}
    shipments, stage_events, risk_events = [], [], []

    def add(ship, plan, buffer):
        st, ev = simulate(rng, ship, ids, plan)
        ship["promised_at"] = ship["original_eta"] + timedelta(hours=buffer)
        shipments.append(ship)
        stage_events.extend(st)
        risk_events.extend(ev)

    for i in range(n):
        mode = "ocean" if rng.random() < 0.7 else "air"
        customer = rng.choice(custs)
        base = 120_000 if mode == "ocean" else 60_000
        ship = {
            "id": i + 1,
            "order_ref": f"ORD-{30001 + i}",
            "customer_id": customer["id"],
            "mode": mode,
            "carrier": rng.choice(OCEAN_CARRIERS if mode == "ocean" else AIR_CARRIERS),
            "origin_port": rng.choice(ORIGINS)[0],
            "dest_port": rng.choices(DESTS, weights=DEST_WEIGHTS)[0][0],
            "goods_value_usd": round(rng.lognormvariate(math.log(base), 0.6) * (2 if customer["id"] in key else 1), 2),
            "booked_at": ANCHOR - timedelta(minutes=round(365 * 24 * 60 * rng.random() ** BOOKING_SKEW)),
        }
        add(ship, None, BUFFER_HOURS[mode])
    for ship, plan, buffer in crafted(n + 1, custs):
        add(ship, plan, buffer)
    return {"customers": custs, "ports": ports(), "stage_nominal": stage_nominal(), "shipments": shipments,
            "stage_events": stage_events, "risk_events": risk_events}
