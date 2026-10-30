"""The papers a soul carries beyond the identity declaration, the permit and the obol,
and the schedule that decides how many of them a case gets.

A paper is a CLAIM written once here (AD-4); its check is a QUERY run at play time (AD-3).
Nothing in this file's output is a number the game is graded against, except that a paper
that is meant to be honest must say what the Books say, so the generator reads the Books
(through `sql`, passed in) to write it.

Three kinds, by what the player has to do to check them:

  lookup   one record, compared field by field            deed, letter, oath, receipt
  cross    a lookup plus a rule against a second record   muster
  calc     a number the Books have to add up              tally, licence

Rules: docs/knowledge/logic/papers.md
"""

import collections

# ------------------------------------------------------------------ the schedule

# Two sizes of game. Easy is short: four souls a day, and the judges sit from day 3.
MODES = {
    "hard": {"days": 10, "per_day": 5, "ferry_days": 3, "file": "cases", "global": "NetherCases"},
    "easy": {"days": 5, "per_day": 4, "ferry_days": 2, "file": "cases-easy", "global": "NetherCasesEasy"},
}

LOOKUP = ["deed", "letter", "oath", "receipt"]
CROSS = ["muster"]
CALC = ["tally", "licence"]
KIND_OF = {**{t: "lookup" for t in LOOKUP}, **{t: "cross" for t in CROSS}, **{t: "calc" for t in CALC}}


def band(day):
    """Day 1 teaches the lookup, day 2 adds the cross-check, day 3 on adds the calculation."""
    return 1 if day == 1 else 2 if day == 2 else 3


def is_hard_slot(slot):
    """The 4th and 5th soul of a day carry the extra paper (easy has only a 4th)."""
    return slot >= 4


def plan(day, slot):
    """What a case at (day, slot) carries beyond the three standard papers.

    L is a lookup paper, X the cross-check paper, C a calculation paper.

      band 1   one lookup;                    the 4th and 5th: two
      band 2   two lookups;                   the 4th and 5th: two lookups and a cross-check
      band 3   three papers;                  the 4th and 5th: three papers and a calculation
    """
    b, hard = band(day), is_hard_slot(slot)
    if b == 1:
        return ["L", "L"] if hard else ["L"]
    if b == 2:
        return ["L", "L", "X"] if hard else ["L", "L"]
    return ["L", "L", "L", "C"] if hard else ["L", "L", "L"]


# ------------------------------------------------------------------ the records

class Records:
    """Every record a paper can be made from, read once from the Books."""

    def __init__(self, sql):
        rows = lambda q: sql(q)
        self.asset = {r["asset_id"]: r for r in rows("select * from asset")}
        self.business = {r["business_id"]: r for r in rows("select * from business")}
        self.campaign = {r["campaign_id"]: r for r in rows("select * from campaign order by campaign_id")}
        self.temple = {r["temple_id"]: r for r in rows("select * from temple")}
        self.txn = collections.defaultdict(list)
        for r in rows("select * from ownership_transaction order by txn_id"):
            self.txn[r["buyer_person_id"]].append(r)
        self.employment = collections.defaultdict(list)
        for r in rows("select * from employment order by employment_id"):
            self.employment[r["person_id"]].append(r)
        self.oath = collections.defaultdict(list)
        for r in rows("select * from oath order by oath_id"):
            self.oath[r["person_id"]].append(r)
        self.offering = collections.defaultdict(list)
        for r in rows("select * from offering order by offering_id"):
            self.offering[r["person_id"]].append(r)
        self.service = collections.defaultdict(list)
        for r in rows("select * from service order by service_id"):
            self.service[r["person_id"]].append(r)
        # Battle kills on a campaign the soul served: the tally a discharge can state.
        self.kills = collections.defaultdict(list)
        for r in rows(
                "select c.killer_person_id p, c.campaign_id k, count(distinct c.casualty_id) n from casualty_record c "
                "join service s on s.person_id = c.killer_person_id and s.campaign_id = c.campaign_id "
                "where c.context = 'battle' group by 1, 2 order by 1, 2"):
            self.kills[r["p"]].append((r["k"], int(r["n"])))
        # Cases a healer took in a year: what a licence can state.
        self.treated = collections.defaultdict(list)
        for r in rows("select healer_person_id p, strftime(treated_on, '%Y') y, count(*) n from patient_case "
                      "group by 1, 2 order by 1, 2"):
            self.treated[r["p"]].append((r["y"], int(r["n"])))
        self.roles = sorted({e["role"] for es in self.employment.values() for e in es})
        self.ranks = sorted({s["rank"] for ss in self.service.values() for s in ss})
        self.subjects = sorted({o["subject"] for os in self.oath.values() for o in os})
        self.kinds = sorted({o["kind"] for os in self.offering.values() for o in os})

    def available(self, kind, person_id):
        """The records this soul has for a paper kind, as (key, record) pairs."""
        if kind == "deed":
            return [(t["txn_id"], t) for t in self.txn.get(person_id, [])]
        if kind == "letter":
            return [(e["employment_id"], e) for e in self.employment.get(person_id, [])]
        if kind == "oath":
            return [(o["oath_id"], o) for o in self.oath.get(person_id, [])]
        if kind == "receipt":
            return [(o["offering_id"], o) for o in self.offering.get(person_id, [])]
        if kind == "muster":
            return [(s["service_id"], s) for s in self.service.get(person_id, [])]
        if kind == "tally":
            return [(f"{k}", (k, n)) for k, n in self.kills.get(person_id, [])]
        if kind == "licence":
            return [(y, (y, n)) for y, n in self.treated.get(person_id, [])]
        return []

    def count(self, kind, person_id):
        return len(self.available(kind, person_id))


def day(value):
    return str(value)[:10] if value not in (None, "") else "—"


def shift_years(value, years):
    year, month, rest = str(value)[:10].split("-")
    return f"{int(year) + years:04d}-{month}-{rest}"


def esc(value):
    return str(value).replace("'", "''")


def explore(dimensions, filters):
    body = ",\n".join(f"    {alias}: {field}" for alias, field in dimensions)
    return f"explore {{\n  dimensions {{\n{body},\n  }}\n  filters {{ {filters} }}\n}}"


# -------------------------------------------------------------------- the builders
# Each returns (document, check). The document is what is printed; the check is the
# query that finds its record and how to compare. Field names a pair uses are the
# document's on the left and the query's alias on the right.

def build_deed(pid, key, t, recs):
    asset = recs.asset.get(t["asset_id"], {})
    doc = {"doc_type": "deed", "txn_id": t["txn_id"], "asset": asset.get("name", "—"),
           "asset_type": asset.get("asset_type", "—"), "location": asset.get("location", "—"),
           "seller": t["seller_person_id"] or "—", "transacted_on": day(t["transacted_on"]),
           "price": round(float(t["price"]), 2)}
    aql = explore([("txn_id", "nether_ownership_transaction.txn_id"), ("asset", "nether_asset.name"),
                   ("asset_type", "nether_asset.asset_type"), ("location", "nether_asset.location"),
                   ("seller", "nether_ownership_transaction.seller_person_id"),
                   ("transacted_on", "nether_ownership_transaction.transacted_on"),
                   ("price", "nether_ownership_transaction.price")],
                  f"nether_ownership_transaction.txn_id is '{esc(t['txn_id'])}'")
    return doc, {"kind": "record", "dataset": "nether_property", "ledger": "nether_ownership_transaction",
                 "prompt": "Does the deed match the Book of Holdings?", "bind": {"txn_id": t["txn_id"]}, "aql": aql,
                 "compare": [{"doc_field": f, "record_field": f} for f in
                             ("asset", "asset_type", "location", "seller", "transacted_on", "price")],
                 "absent_is_conflict": True}


def build_letter(pid, key, e, recs):
    business = recs.business.get(e["business_id"]) if e["business_id"] else None
    doc = {"doc_type": "letter", "employment_id": e["employment_id"], "role": e["role"],
           "employer": business["name"] if business else "—",
           "self_employed": business is None,
           "trade": business["trade"] if business else "—",
           "started_on": day(e["started_on"]), "ended_on": day(e["ended_on"])}
    # A self-employed soul answered to no house: the paper's employer line is empty, as the Book's is.
    aql = explore([("employment_id", "nether_employment.employment_id"), ("role", "nether_employment.role"),
                   ("employer", "nether_business.name"), ("trade", "nether_business.trade"),
                   ("started_on", "nether_employment.started_on"), ("ended_on", "nether_employment.ended_on")],
                  f"nether_employment.employment_id is '{esc(e['employment_id'])}'")
    check = {"kind": "record", "dataset": "nether_work", "ledger": "nether_employment",
             "prompt": "Does the letter match the Book of Trades?", "bind": {"employment_id": e["employment_id"]},
             "aql": aql,
             "compare": [{"doc_field": f, "record_field": f} for f in ("role", "employer", "trade", "started_on", "ended_on")],
             "absent_is_conflict": True}
    return doc, check


def build_oath(pid, key, o, recs):
    doc = {"doc_type": "oath", "oath_id": o["oath_id"], "subject": o["subject"], "sworn_on": day(o["sworn_on"]),
           "kept": bool(o["kept"] in (True, "true", "True", 1, "1")), "broken_on": day(o["broken_on"])}
    aql = explore([("oath_id", "nether_oath.oath_id"), ("subject", "nether_oath.subject"),
                   ("sworn_on", "nether_oath.sworn_on"), ("kept", "nether_oath.kept"),
                   ("broken_on", "nether_oath.broken_on")],
                  f"nether_oath.oath_id is '{esc(o['oath_id'])}'")
    return doc, {"kind": "record", "dataset": "nether_rites", "ledger": "nether_oath",
                 "prompt": "Does the tablet match the Book of Religion?", "bind": {"oath_id": o["oath_id"]}, "aql": aql,
                 "compare": [{"doc_field": f, "record_field": f} for f in ("subject", "sworn_on", "kept", "broken_on")],
                 "absent_is_conflict": True}


def build_receipt(pid, key, o, recs):
    temple = recs.temple.get(o["temple_id"], {})
    doc = {"doc_type": "receipt", "offering_id": o["offering_id"], "deity": temple.get("deity", "—"),
           "temple_location": temple.get("location", "—"), "kind": o["kind"], "value": round(float(o["value"]), 2),
           "offered_on": day(o["offered_on"])}
    aql = explore([("offering_id", "nether_offering.offering_id"), ("deity", "nether_temple.deity"),
                   ("temple_location", "nether_temple.location"), ("kind", "nether_offering.kind"),
                   ("value", "nether_offering.value"), ("offered_on", "nether_offering.offered_on")],
                  f"nether_offering.offering_id is '{esc(o['offering_id'])}'")
    return doc, {"kind": "record", "dataset": "nether_rites", "ledger": "nether_offering",
                 "prompt": "Does the receipt match the Book of Religion?", "bind": {"offering_id": o["offering_id"]},
                 "aql": aql,
                 "compare": [{"doc_field": f, "record_field": f} for f in
                             ("deity", "temple_location", "kind", "value", "offered_on")],
                 "absent_is_conflict": True}


def build_muster(pid, key, s, recs):
    campaign = recs.campaign.get(s["campaign_id"], {})
    doc = {"doc_type": "muster", "service_id": s["service_id"], "campaign": campaign.get("name", "—"),
           "rank": s["rank"], "joined_on": day(s["joined_on"]), "left_on": day(s["left_on"])}
    aql = explore([("service_id", "nether_service.service_id"), ("rank", "nether_service.rank"),
                   ("joined_on", "nether_service.joined_on"), ("left_on", "nether_service.left_on"),
                   ("campaign", "nether_campaign.name"), ("campaign_started", "nether_campaign.started_on"),
                   ("campaign_ended", "nether_campaign.ended_on")],
                  f"nether_service.service_id is '{esc(s['service_id'])}'")
    return doc, {"kind": "record", "dataset": "nether_arms", "ledger": "nether_service",
                 "prompt": "Does the muster roll match the Book of Battle, and sit inside the campaign?",
                 "bind": {"service_id": s["service_id"]}, "aql": aql,
                 "compare": [{"doc_field": f, "record_field": f} for f in ("campaign", "rank", "joined_on", "left_on")],
                 # The cross-check: the dates on the paper must lie inside the campaign's own dates.
                 "rule": {"within": {"from": "joined_on", "to": "left_on",
                                     "window_start": "campaign_started", "window_end": "campaign_ended"}},
                 "absent_is_conflict": True}


def build_tally(pid, key, record, recs):
    campaign_id, kills = record
    campaign = recs.campaign.get(campaign_id, {})
    doc = {"doc_type": "tally", "campaign_id": campaign_id, "campaign": campaign.get("name", "—"), "killed": kills}
    aql = ("explore {\n  dimensions { subject: nether_person.person_id }\n  measures { v: killed_in_battle }\n"
           f"  filters {{ nether_person.person_id is '{esc(pid)}', "
           f"nether_casualty_record.campaign_id is '{esc(campaign_id)}' }}\n}}")
    return doc, {"kind": "measure", "dataset": "nether_arms", "ledger": "nether_casualty_record",
                 "prompt": "Does the tally match the Book of Battle?", "bind": {"person_id": pid, "campaign_id": campaign_id},
                 "aql": aql, "field": "v", "compare": [{"doc_field": "killed", "record_field": "v"}],
                 "absent_is_conflict": False}


def build_licence(pid, key, record, recs):
    year, cases = record
    doc = {"doc_type": "licence", "year": year, "treated": cases}
    start, end = f"{year}-01-01", f"{int(year) + 1:04d}-01-01"
    aql = ("explore {\n  dimensions { subject: nether_person.person_id }\n  measures { v: patients_treated }\n"
           f"  filters {{ nether_person.person_id is '{esc(pid)}', and(nether_patient_case.treated_on >= "
           f"cast('{start}', 'date'), nether_patient_case.treated_on < cast('{end}', 'date')) }}\n}}")
    return doc, {"kind": "measure", "dataset": "nether_healing", "ledger": "nether_patient_case",
                 "prompt": "Does the licence match the Book of Healthcare?", "bind": {"person_id": pid, "year": year},
                 "aql": aql, "field": "v", "compare": [{"doc_field": "treated", "record_field": "v"}],
                 "absent_is_conflict": False}


BUILDERS = {"deed": build_deed, "letter": build_letter, "oath": build_oath, "receipt": build_receipt,
            "muster": build_muster, "tally": build_tally, "licence": build_licence}


# -------------------------------------------------------------------- choosing papers

def choose(plan_tokens, band_no, person_id, rng, recs, calc=None):
    """The (type, key) of each paper this soul can carry for the plan, or None if they cannot.

    Calculation first (the scarce one), then the cross-check, then lookups: different
    types before the same type twice, because a soul with one oath and two employments
    is more interesting with a deed and a letter than with two letters."""
    taken, picks = set(), []

    def take(kind):
        options = [(k, r) for k, r in recs.available(kind, person_id) if (kind, k) not in taken]
        if not options:
            return False
        key, record = rng.choice(options)
        taken.add((kind, key))
        picks.append((kind, key, record))
        return True

    if "C" in plan_tokens:
        # `calc` names the calculation paper wanted, so the two kinds take turns across the queue.
        options = [t for t in (CALC if calc is None else [calc]) if recs.count(t, person_id)]
        if not options or not take(rng.choice(options)):
            return None
    lookups = plan_tokens.count("L")
    if "X" in plan_tokens:
        if not take("muster"):
            return None
    elif band_no == 3 and lookups and recs.count("muster", person_id) and rng.random() < 0.25:
        take("muster")
        lookups -= 1
    types = [t for t in LOOKUP if recs.count(t, person_id)]
    rng.shuffle(types)
    while lookups:
        progressed = False
        for t in list(types):
            if not lookups:
                break
            if take(t):
                lookups -= 1
                progressed = True
        if not progressed:
            return None
    # Lookups first, then the cross-check, then the calculation: the order they lie on the desk.
    order = {"lookup": 0, "cross": 1, "calc": 2}
    picks.sort(key=lambda p: order[KIND_OF[p[0]]])
    return picks


# ---------------------------------------------------------------------- forgeries
# Move exactly one printed field of a paper away from its record, and say which.

def _differs(rng, pool, current):
    pool = [p for p in pool if p != current]
    return rng.choice(pool) if pool else current


def forge(kind, doc, recs, rng):
    """Returns the field moved. `kind` is the paper's own kind of forgery."""
    if kind == "deed_wrong":
        field = rng.choice(["price", "transacted_on", "asset", "location"])
        if field == "price":
            doc["price"] = round(doc["price"] * rng.choice([0.7, 0.85, 1.15, 1.3]) + 0.01, 2)
        elif field == "transacted_on":
            doc["transacted_on"] = shift_years(doc["transacted_on"], rng.choice([-3, -2, 2, 3]))
        elif field == "asset":
            doc["asset"] = _differs(rng, sorted({a["name"] for a in recs.asset.values()}), doc["asset"])
        else:
            doc["location"] = _differs(rng, sorted({a["location"] for a in recs.asset.values()}), doc["location"])
        return field
    if kind == "letter_wrong":
        field = rng.choice(["role", "employer", "started_on"])
        if field == "role":
            doc["role"] = _differs(rng, recs.roles, doc["role"])
        elif field == "employer":
            doc["employer"] = _differs(rng, sorted({b["name"] for b in recs.business.values()}), doc["employer"])
        else:
            doc["started_on"] = shift_years(doc["started_on"], rng.choice([-3, -2, 2, 3]))
        return field
    if kind == "oath_wrong":
        field = rng.choice(["kept", "subject", "sworn_on"])
        if field == "kept":
            doc["kept"] = not doc["kept"]
        elif field == "subject":
            doc["subject"] = _differs(rng, recs.subjects, doc["subject"])
        else:
            doc["sworn_on"] = shift_years(doc["sworn_on"], rng.choice([-3, -2, 2, 3]))
        return field
    if kind == "receipt_wrong":
        field = rng.choice(["value", "kind", "deity"])
        if field == "value":
            doc["value"] = round(doc["value"] * rng.choice([0.7, 0.85, 1.15, 1.3]) + 0.01, 2)
        elif field == "kind":
            doc["kind"] = _differs(rng, recs.kinds, doc["kind"])
        else:
            doc["deity"] = _differs(rng, sorted({t["deity"] for t in recs.temple.values()}), doc["deity"])
        return field
    if kind == "muster_wrong":
        field = rng.choice(["rank", "campaign"])
        if field == "rank":
            doc["rank"] = _differs(rng, recs.ranks, doc["rank"])
        else:
            doc["campaign"] = _differs(rng, sorted({c["name"] for c in recs.campaign.values()}), doc["campaign"])
        return field
    if kind == "muster_outside_campaign":
        # The one forgery the paper alone reveals once the campaign's dates are known: the soul
        # joined before the campaign began.
        doc["joined_on"] = shift_years(doc["joined_on"], -2)
        return "joined_on"
    if kind == "tally_wrong":
        doc["killed"] = max(0, doc["killed"] + rng.choice([-3, -2, -1, 1, 2, 3]))
        return "killed"
    if kind == "licence_wrong":
        doc["treated"] = max(0, doc["treated"] + rng.choice([-3, -2, -1, 1, 2, 3]))
        return "treated"
    raise SystemExit(f"unknown paper forgery {kind}")


FORGERIES = {"deed": ["deed_wrong"], "letter": ["letter_wrong"], "oath": ["oath_wrong"],
             "receipt": ["receipt_wrong"], "muster": ["muster_wrong", "muster_outside_campaign"],
             "tally": ["tally_wrong"], "licence": ["licence_wrong"]}
