#!/usr/bin/env python3
"""Generate the Ferryman's Ledger world into data/nether.duckdb.

Dates use the chronological realm epoch documented in nether_calendar.py.
Storage year Y reads as (1000-Y) BC, so all native date arithmetic stays valid.

Schema and intent: product-team/.../underworld/system-design.md section 1.
Seeded and reproducible (AD-9). Mints every identifier once (AD-13).
Produces the truth ledgers only; cases and documents are a separate pass.
"""
import datetime as dt
import hashlib
import os
import random

import duckdb
from nether_calendar import identity_fields, ISSUE_LOCATIONS, PERMIT_ISSUED, PERMIT_EXPIRES

SEED = 20261021
N_PERSONS = 120
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "nether.duckdb")

R = random.Random(SEED)
D = {}  # table name -> list of row dicts


def add(table, row):
    D.setdefault(table, []).append(row)
    return row


def day(y, m=None, d=None):
    m = m or R.randint(1, 12)
    d = d or R.randint(1, 28)
    return dt.date(y, m, d)


def between(a, b):
    """A random date between two dates."""
    return a + dt.timedelta(days=R.randint(0, max(1, (b - a).days)))


# ---------------------------------------------------------------- reference data

PLACES = ["Thrace", "Thessaly", "Boeotia", "Argos", "Corinth",
          "Samos", "Lydia", "Naucratis", "Syracuse"]

# One mint standard per birthplace. The coin check reads this.
MOTIFS = ["owl", "bull", "lyre", "trireme", "olive", "serpent", "horse", "amphora", "bee"]
MARKS = ["A", "ΔE", "ΘΗ", "ΑΡ", "ΚΟ", "ΣΑ", "ΛΥ", "ΝΑ", "ΣΥ"]
RIMS = ["plain", "beaded", "double"]
METALS = ["silver", "bronze", "electrum"]

MALE = ["Kleon", "Nikias", "Lysander", "Theron", "Alkaios", "Demos", "Hieron",
        "Pelias", "Straton", "Eumelos", "Kritias", "Orestes", "Phaedon", "Thales"]
FEMALE = ["Myrrine", "Praxilla", "Kleio", "Theano", "Arete", "Lysis", "Phoebe",
          "Korinna", "Melissa", "Eunoe", "Hagnodike", "Erinna"]
EPITHETS = ["of Thrace", "of Samos", "the elder", "the younger", "son of Hieron",
            "daughter of Theron", "the lame", "the fair", "of the harbour"]

OCCUPATIONS = ["physician", "soldier", "landholder", "priest"]
# Deliberate split: enough of each Book to rank within, soldiers commonest.
OCC_WEIGHTS = [28, 32, 28, 32]

AILMENTS = [("fever", 1), ("wasting", 2), ("the flux", 2), ("a broken limb", 1),
            ("plague", 3), ("childbed", 3), ("wound rot", 3), ("the falling sickness", 2)]
SUBJECTS = ["geometry", "rhetoric", "medicine", "astronomy", "drama", "law", "husbandry"]
TRADES = ["potter", "smith", "weaver", "shipwright", "scribe", "tanner", "stonecutter", "vintner"]
# Callings with no employer: the employment row stands, its business_id is null.
SELF_EMPLOYED = ["musician", "poet", "storyteller"]
DEITIES = ["Demeter", "Apollo", "Athena", "Hermes", "Artemis", "Hades", "Persephone"]
CROPS = ["barley", "olives", "vines", "wheat"]


def h(prefix, n):
    return f"{prefix}{n:04d}"


# ---------------------------------------------------------------- persons

def make_persons():
    used = set()
    for i in range(N_PERSONS):
        pool = MALE if R.random() < 0.55 else FEMALE
        base = R.choice(pool)
        # planted near-collisions: reuse a base name with an epithet
        if base in used and R.random() < 0.7:
            name = f"{base} {R.choice(EPITHETS)}"
        else:
            name = base
            used.add(base)
        birth = day(R.randint(420, 470))
        age = R.randint(22, 78)
        death = day(birth.year + age, R.randint(1, 12), R.randint(1, 28))
        add("person", dict(
            person_id=h("P", i + 1), name=name, birthdate=birth,
            birthplace=R.choice(PLACES), death_date=death,
            gate="East" if R.random() < 0.5 else "West",
        ))

    for i, place in enumerate(PLACES):
        add("obol_standard", dict(
            birthplace=place, emblem=MOTIFS[i], mint_mark=MARKS[i],
            rim=RIMS[i % 3], metal=METALS[i % 3],
            valid_from=dt.date(400, 1, 1), valid_to=None,
        ))


def persons():
    return D["person"]


def era_split(p, trajectory):
    """Return (early_window, late_window) as date pairs around this soul's own death.

    The per-soul era boundary from system-design 2.5: the last ten years of
    *this* life, not a fixed calendar window.
    """
    death = p["death_date"]
    boundary = dt.date(death.year - 10, death.month, death.day)
    start = dt.date(p["birthdate"].year + 20, 1, 1)
    if start >= boundary:
        start = dt.date(boundary.year - 5, 1, 1)
    return (start, boundary), (boundary, death)


# ---------------------------------------------------------------- identity

def make_identity():
    ps = persons()
    for i, p in enumerate(ps):
        # bonds: a spouse for most, plus a parent or sibling
        if R.random() < 0.6:
            other = R.choice(ps)
            if other["person_id"] != p["person_id"]:
                add("relationship", dict(
                    relationship_id=h("R", len(D.get("relationship", [])) + 1),
                    person_a_id=p["person_id"], person_b_id=other["person_id"],
                    bond_type="spouse",
                    bonded_from=day(p["birthdate"].year + R.randint(18, 30)),
                    bonded_to=None))
        if R.random() < 0.5:
            other = R.choice(ps)
            if other["person_id"] != p["person_id"]:
                add("relationship", dict(
                    relationship_id=h("R", len(D.get("relationship", [])) + 1),
                    person_a_id=p["person_id"], person_b_id=other["person_id"],
                    bond_type=R.choice(["parent", "child", "sibling"]),
                    bonded_from=p["birthdate"], bonded_to=None))

        # permits: most valid, a few expired, a few already redeemed
        roll = R.random()
        status = "valid" if roll < 0.78 else ("expired" if roll < 0.92 else "redeemed")
        issued = PERMIT_ISSUED
        add("passage_permit", dict(
            permit_id=h("PM", i + 1), person_id=p["person_id"],
            seal=f"{R.choice(MARKS)}-{R.randint(1000, 9999)}",
            issued_on=issued,
            expires_on=PERMIT_EXPIRES,
            status=status))


# ---------------------------------------------------------------- property

def make_property():
    ps = persons()
    for i in range(80):
        add("asset", dict(asset_id=h("A", i + 1),
                          asset_type=R.choice(["farmstead", "workshop", "vessel", "townhouse", "orchard"]),
                          name=f"the {R.choice(['upper', 'lower', 'old', 'seaward', 'walled'])} "
                               f"{R.choice(['plot', 'yard', 'house', 'grove'])}",
                          location=R.choice(PLACES)))
    n = 0
    for a in D["asset"]:
        owner = R.choice(ps)
        n += 1
        first = day(R.randint(440, 460))
        add("ownership_transaction", dict(
            txn_id=h("T", n), asset_id=a["asset_id"], seller_person_id=None,
            buyer_person_id=owner["person_id"], transacted_on=first,
            price=round(R.uniform(50, 900), 2)))
        for _ in range(R.randint(0, 2)):
            nxt = R.choice(ps)
            n += 1
            first = day(first.year + R.randint(2, 15))
            add("ownership_transaction", dict(
                txn_id=h("T", n), asset_id=a["asset_id"],
                seller_person_id=owner["person_id"], buyer_person_id=nxt["person_id"],
                transacted_on=first, price=round(R.uniform(50, 1400), 2)))
            owner = nxt


# ---------------------------------------------------------------- library

def make_library():
    """The Book of Borrowings. Called last in main(): card holders are an
    independent sample of all persons, not tied to an occupation, so this can
    run after every other Book without reshuffling the rest of the world.
    """
    ps = persons()
    for i, place in enumerate(PLACES[:5]):
        add("library", dict(library_id=h("L", i + 1), name=f"the hall at {place}", location=place))
    for i in range(60):
        add("book", dict(book_id=h("B", i + 1),
                         title=f"On {R.choice(SUBJECTS)}, {R.choice(['book I', 'book II', 'a fragment', 'the greater'])}",
                         author=R.choice(MALE + FEMALE), subject=R.choice(SUBJECTS)))
    for i in range(160):
        b = R.choice(D["book"])
        add("book_copy", dict(copy_id=h("BC", i + 1), book_id=b["book_id"],
                              library_id=R.choice(D["library"])["library_id"]))
    cards = []
    for i, p in enumerate(R.sample(ps, 70)):
        issued = day(p["birthdate"].year + R.randint(16, 30))
        revoked = (None if issued >= p["death_date"] or R.random() < 0.92
                   else between(issued, p["death_date"]))
        c = add("library_card", dict(
            card_id=h("LC", i + 1), person_id=p["person_id"],
            library_id=R.choice(D["library"])["library_id"],
            issued_on=issued, revoked_on=revoked))
        cards.append((c, p))
    n = 0
    for c, p in cards:
        for _ in range(R.randint(0, 14)):
            n += 1
            start = max(c["issued_on"], dt.date(p["birthdate"].year + 16, 1, 1))
            if start >= p["death_date"]:
                continue
            borrowed = between(start, p["death_date"])
            returned = None if R.random() < 0.12 else borrowed + dt.timedelta(days=R.randint(5, 120))
            add("borrowing_record", dict(
                borrow_id=h("BR", n), card_id=c["card_id"],
                copy_id=R.choice(D["book_copy"])["copy_id"],
                borrowed_on=borrowed, returned_on=returned))


# ---------------------------------------------------------------- work

def make_work(assign):
    for i in range(30):
        add("business", dict(business_id=h("BU", i + 1),
                             name=f"the {R.choice(TRADES)}'s house of {R.choice(MALE)}",
                             trade=R.choice(TRADES), location=R.choice(PLACES)))
    n = 0
    for p in persons():
        for _ in range(R.randint(1, 3)):
            n += 1
            started = day(p["birthdate"].year + R.randint(16, 40))
            if started >= p["death_date"]:
                started = dt.date(p["death_date"].year - 5, 1, 1)
            ended = None if R.random() < 0.3 else between(started, p["death_date"])
            role = (assign[p["person_id"]] if R.random() < 0.6
                    else R.choice(TRADES + SELF_EMPLOYED * 2))
            add("employment", dict(
                employment_id=h("E", n), person_id=p["person_id"],
                business_id=None if role in SELF_EMPLOYED
                else R.choice(D["business"])["business_id"],
                role=role, started_on=started, ended_on=ended))


# ---------------------------------------------------------------- conduct Books

def make_healing(folk, assign):
    for i, (nm, sev) in enumerate(AILMENTS):
        add("ailment", dict(ailment_id=h("AI", i + 1), name=nm, severity=sev))
    n = 0
    for p in folk["physician"]:
        early, late = era_split(p, None)
        # Deliberate spread so ranking has a visible top and bottom.
        base = R.uniform(0.35, 0.92)
        traj = R.choice(["improve", "decline", "flat"])
        for window, rate in ((early, base), (late, _shift(base, traj))):
            for _ in range(R.randint(8, 26)):
                n += 1
                ail = R.choice(D["ailment"])
                # a graver ailment is harder to survive
                p_rec = max(0.05, rate - 0.18 * (ail["severity"] - 1))
                outcome = "recovered" if R.random() < p_rec else ("died" if R.random() < 0.6 else "unchanged")
                add("patient_case", dict(
                    patient_case_id=h("PC", n), healer_person_id=p["person_id"],
                    patient_person_id=R.choice(persons())["person_id"],
                    ailment_id=ail["ailment_id"], treated_on=between(*window),
                    outcome=outcome, fee=round(R.uniform(1, 40), 2)))


def _shift(base, traj):
    if traj == "improve":
        return min(0.95, base + R.uniform(0.10, 0.25))
    if traj == "decline":
        return max(0.05, base - R.uniform(0.10, 0.25))
    return base


def make_arms(folk):
    names = ["Ionian", "Samian", "Thracian", "Sicilian", "Lydian", "Boeotian"]
    for i, nm in enumerate(names):
        s = day(R.randint(440, 470))
        add("campaign", dict(campaign_id=h("CP", i + 1), name=f"the {nm} campaign",
                             started_on=s, ended_on=dt.date(s.year + R.randint(1, 4), 12, 1),
                             region=R.choice(PLACES)))
    s = k = 0
    for p in folk["soldier"]:
        early, late = era_split(p, None)
        traj = R.choice(["improve", "decline", "flat"])
        base = R.uniform(2, 9)
        for _ in range(R.randint(1, 3)):
            s += 1
            c = R.choice(D["campaign"])
            add("service", dict(service_id=h("SV", s), person_id=p["person_id"],
                                campaign_id=c["campaign_id"],
                                rank=R.choice(["hoplite", "peltast", "captain", "archer"]),
                                joined_on=c["started_on"],
                                left_on=None if R.random() < 0.3 else c["ended_on"]))
        # killings: trajectory moves the LATE count, which is the era question
        for window, rate in ((early, base), (late, _shift_count(base, traj))):
            for _ in range(int(max(0, R.gauss(rate, 1.5)))):
                k += 1
                # a killing outside a campaign is the "outside battle" case
                outside = R.random() < 0.22
                camp = None if outside else R.choice(D["campaign"])["campaign_id"]
                add("casualty_record", dict(
                    casualty_id=h("CR", k), campaign_id=camp,
                    killer_person_id=p["person_id"],
                    victim_person_id=R.choice(persons())["person_id"],
                    context="outside" if outside else "battle"))


def _shift_count(base, traj):
    if traj == "improve":   # fewer killings late in life
        return max(0.2, base * R.uniform(0.25, 0.5))
    if traj == "decline":
        return base * R.uniform(1.5, 2.5)
    return base


def make_harvest(folk):
    """Harvest is a property of the estate-year, not of the holding.

    Generating it per holding duplicated every row when two people held one
    estate, which would double-count any yield summed across estates.
    """
    for i in range(24):
        add("estate", dict(estate_id=h("ES", i + 1),
                           name=f"the {R.choice(['high', 'river', 'stony', 'wide', 'old'])} land",
                           region=R.choice(PLACES), hectares=round(R.uniform(4, 90), 1)))
    hv = 0
    for est in D["estate"]:
        traj = R.choice(["improve", "decline", "flat"])
        first = R.randint(440, 448)
        for yr in range(first, 480):
            hv += 1
            amount = R.uniform(40, 220)
            if traj == "improve":
                amount *= 1 + (yr - first) * 0.02
            elif traj == "decline":
                amount *= max(0.3, 1 - (yr - first) * 0.02)
            add("harvest_record", dict(harvest_id=h("HV", hv), estate_id=est["estate_id"],
                                       season_year=yr, crop=R.choice(CROPS),
                                       yield_measure=round(amount, 1)))

    # Holdings: who held which estate, when. Mostly one holder per estate so the
    # question stays a plain join rather than a range join.
    hd = 0
    pool = list(folk["landholder"])
    R.shuffle(pool)
    for i, est in enumerate(D["estate"]):
        if not pool:
            break
        p = pool[i % len(pool)]
        hd += 1
        frm = day(max(440, p["birthdate"].year + 20))
        add("holding", dict(holding_id=h("HD", hd), person_id=p["person_id"],
                            estate_id=est["estate_id"], from_date=frm,
                            to_date=None if R.random() < 0.7 else p["death_date"]))


def make_rites(folk):
    for i, d in enumerate(DEITIES):
        add("temple", dict(temple_id=h("TP", i + 1), deity=d, location=R.choice(PLACES)))
    o = oa = 0
    for p in folk["priest"]:
        early, late = era_split(p, None)
        traj = R.choice(["improve", "decline", "flat"])
        for window, piety in ((early, 0.5), (late, 0.5 + (0.3 if traj == "improve" else -0.3 if traj == "decline" else 0))):
            for _ in range(R.randint(4, 16)):
                o += 1
                add("offering", dict(offering_id=h("OF", o), person_id=p["person_id"],
                                     temple_id=R.choice(D["temple"])["temple_id"],
                                     offered_on=between(*window), kind=R.choice(["libation", "grain", "beast", "coin"]),
                                     value=round(R.uniform(1, 60), 2)))
            for _ in range(R.randint(1, 5)):
                oa += 1
                kept = R.random() < max(0.1, min(0.95, piety))
                sworn = between(*window)
                add("oath", dict(oath_id=h("OA", oa), person_id=p["person_id"],
                                 sworn_on=sworn, subject=R.choice(["a debt", "a marriage", "a boundary", "a testimony"]),
                                 kept=kept,
                                 broken_on=None if kept else sworn + dt.timedelta(days=R.randint(10, 900))))


# ---------------------------------------------------------------- the player

def seed_eurydice_person():
    """Fix the player's own row before anything derives from it.

    Her death date is her wedding day. Called before make_identity so her
    permit is issued against the right date.
    """
    p = persons()[0]
    wedding = dt.date(461, 6, 14)
    p.update(name="Eurydice", birthplace="Thrace",
             birthdate=dt.date(439, 4, 2), death_date=wedding, gate="East")
    spouse = persons()[1]
    spouse.update(name="Orpheus", birthplace="Thrace")
    return p, spouse


def seed_eurydice_contradiction(p, spouse):
    """The finale's contradiction, as a fact in the data rather than a script.

    Her permit is already redeemed: a soul who has passed judgment cannot be
    standing at the ferry. The marital record exists but names her spouse only
    through the bond, never on the document.
    """
    wedding = p["death_date"]
    add("relationship", dict(
        relationship_id="R9001", person_a_id=p["person_id"], person_b_id=spouse["person_id"],
        bond_type="spouse", bonded_from=wedding, bonded_to=None))
    for pm in D["passage_permit"]:
        if pm["person_id"] == p["person_id"]:
            pm.update(status="redeemed", issued_on=wedding,
                      expires_on=dt.date(wedding.year + 1, wedding.month, wedding.day))


def seed_eurydice_record():
    """Make her own file say what the finale needs it to say.

    Runs last, after every Book is built, and draws no random numbers, so
    nothing else in the world shifts by a byte.

    Three things the memory board has to be able to produce: a name beginning
    with O, an occupation that is music, and a spouse. The generic passes give
    her a second spouse and give him a trade, and both would make the finale
    answerable two ways, which is worse than hard.
    """
    eury, orph = "P0001", "P0002"
    D["relationship"] = [r for r in D["relationship"]
                         if r["relationship_id"] == "R9001"
                         or (r["person_a_id"] != eury and r["person_b_id"] != eury)]

    # He is remembered for one thing. The register should agree, and a
    # musician works for no house: the employment has no business.
    D["employment"] = [e for e in D["employment"] if e["person_id"] != orph]
    add("employment", dict(employment_id="E9001", person_id=orph,
                           business_id=None, role="musician",
                           started_on=dt.date(441, 3, 9), ended_on=None))


# ---------------------------------------------------------------- write

TYPES = {"person": "person_id", "obol_standard": "birthplace"}


def write():
    if os.path.exists(OUT):
        os.remove(OUT)
    con = duckdb.connect(OUT)
    schema_parts = []
    for name, rows in sorted(D.items()):
        cols = list(rows[0].keys())
        defs = []
        for c in cols:
            vals = [r[c] for r in rows if r[c] is not None]
            v = vals[0] if vals else ""
            t = ("DATE" if isinstance(v, dt.date) else
                 "BOOLEAN" if isinstance(v, bool) else
                 "INTEGER" if isinstance(v, int) else
                 "DOUBLE" if isinstance(v, float) else "VARCHAR")
            defs.append(f'"{c}" {t}')
        con.execute(f'CREATE TABLE {name} ({", ".join(defs)})')
        con.executemany(
            f'INSERT INTO {name} VALUES ({", ".join("?" * len(cols))})',
            [[r[c] for c in cols] for r in rows])
        schema_parts.append(f"{name}:{','.join(cols)}")

    schema_hash = hashlib.sha256("|".join(sorted(schema_parts)).encode()).hexdigest()[:16]
    con.execute("CREATE TABLE game_build (build_id VARCHAR, seed INTEGER, schema_hash VARCHAR, generated_at TIMESTAMP)")
    con.execute("INSERT INTO game_build VALUES (?, ?, ?, now())",
                [f"B-{schema_hash}", SEED, schema_hash])
    con.close()
    return schema_hash


def main():
    make_persons()
    assign = {}
    folk = {o: [] for o in OCCUPATIONS}
    for p in persons():
        occ = R.choices(OCCUPATIONS, OCC_WEIGHTS)[0]
        assign[p["person_id"]] = occ
        folk[occ].append(p)
    eury, orph = seed_eurydice_person()

    make_identity()
    seed_eurydice_contradiction(eury, orph)
    make_property()
    make_work(assign)
    make_healing(folk, assign)
    make_arms(folk)
    make_harvest(folk)
    make_rites(folk)
    seed_eurydice_record()

    # Add reference details after all story-specific birthplace overrides.
    # No random draws: adding a document ID must not reshuffle the world.
    for person in D['person']:
        person.update(identity_fields(person))
    for mint in D['obol_standard']:
        mint.update({f'issue_location_{i}': place for i, place in enumerate(ISSUE_LOCATIONS[mint['birthplace']], 1)})
    for permit in D['passage_permit']:
        permit.update(issued_on=PERMIT_ISSUED, expires_on=PERMIT_EXPIRES)

    # Last: an independent Book, not tied to an occupation. Generating it
    # here keeps every other table's values identical to before it existed.
    make_library()

    schema_hash = write()

    print(f"wrote {OUT}")
    print(f"build B-{schema_hash}  seed {SEED}")
    print(f"{len(D)} tables, {sum(len(v) for v in D.values()):,} rows\n")
    for name in sorted(D):
        print(f"  {name:22} {len(D[name]):>6,}")
    print(f"\n  occupations: " + ", ".join(f"{o} {len(folk[o])}" for o in OCCUPATIONS))
    print(f"  player: {eury['name']} ({eury['person_id']}), spouse {orph['name']} ({orph['person_id']})")


if __name__ == "__main__":
    main()
