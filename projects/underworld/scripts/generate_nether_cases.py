#!/usr/bin/env python3
"""Generate the claims side: the souls who arrive, and the papers they carry.

Reads the built world through the running `anfra serve` (the same DuckDB the
game queries, never a copy of it) and writes apps/nether-v4/data/cases.json.

Two rules shape everything here.

AD-4: a document is a claim and a ledger is a fact, and the two are different
tables. A forgery is a stored disagreement between them, never a computed one,
so documents are written once, here, and the game never re-derives them.

AD-3: an answer key is a query, never a value. Every check and every judge's
question stores {dataset, aql, field}; the game runs it at play time. Nothing
in this file's output is a number the game is graded against. Edit the world
and the answers follow by themselves — which is the entire claim the entry is
built on, so the build asserts it rather than trusting it.

Two sizes of game come out of one run: hard (10 days of 5, cases.json) and easy
(5 days of 4, cases-easy.json). Which papers a soul carries is a schedule by day and
slot (scripts/nether_papers.py); the 4th and 5th soul of a day carry the extra paper.

Usage:
    python3 scripts/generate_nether_cases.py          # needs `anfra serve` up
"""

import collections
import json
import os
from pathlib import Path
import random
import urllib.error
import urllib.request
from nether_calendar import current_date, EXPIRED_PERMIT
import nether_papers as NP

API = "http://127.0.0.1:7878/api/core.query"
SEED = 20261021
CLEAN_IN_TEN = 3        # three cases in ten carry nothing wrong
ROUTE_AWAY_IN = 3       # one pavilion question in three leaves the obvious Book

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "apps", "nether-v4", "data")
# The app cannot fetch its own data file: a Data App is mounted in a sandboxed
# iframe at an opaque origin, where a relative fetch has no base to resolve
# against and an absolute one is refused by CORS. A script tag is served, so
# the same payload is written a second time as one. Both come from the same
# object below, so they cannot drift.


# ------------------------------------------------------------------- the wire

def post(payload):
    request = urllib.request.Request(
        API, data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"API error {error.code}: {error.read().decode()[:600]}")
    except urllib.error.URLError as error:
        raise SystemExit(f"cannot reach {API} — is `anfra serve` running? ({error})")


def sql(query):
    """Rows as dicts. Only this module's world-reading uses it."""
    answer = post({"lang": "sql", "data_source": "nether", "query": query})
    fields = answer["result"]["fields"]
    return [dict(zip(fields, row)) for row in answer["result"]["records"]]


def aql_rows(dataset, query):
    answer = post({"dataset": dataset, "query": query})
    if "error" in answer:
        return None, answer["error"].get("message", "query failed")
    fields = answer["result"]["fields"]
    return [dict(zip(fields, row)) for row in answer["result"]["records"]], None


def validate(dataset, query):
    """AD-9: every generated AQL compiles, or the build fails."""
    answer = post({"dataset": dataset, "query": query})
    if "error" in answer:
        return answer["error"].get("message", "invalid")
    return None


# ------------------------------------------------------------------ the world

def load_world():
    w = {}
    w["person"] = sql("select * from person order by person_id")
    w["permit"] = sql("select * from passage_permit order by permit_id")
    w["standard"] = {r["birthplace"]: r for r in sql("select * from obol_standard")}
    w["relationship"] = sql("select * from relationship order by relationship_id")
    w["employment"] = sql("select * from employment order by employment_id")
    w["txn"] = sql("select * from ownership_transaction where seller_person_id is not null "
                   "order by txn_id")
    w["business"] = {r["business_id"]: r for r in sql("select * from business")}
    w["asset"] = {r["asset_id"]: r for r in sql("select * from asset")}
    w["by_id"] = {p["person_id"]: p for p in w["person"]}
    return w


# Occupation is not a column: the generator that built the world used it to
# decide which Book a soul's deeds went into, so the Books are where it still
# lives. Whichever conduct Book holds most of a soul's record names their trade.
OCCUPATION_SOURCE = [
    ("physician", "select healer_person_id as person_id, count(*) n from patient_case group by 1"),
    ("soldier", "select person_id, count(*) n from service group by 1"),
    ("landholder", "select person_id, count(*) n from holding group by 1"),
    ("priest", "select person_id, count(*) n from offering group by 1"),
]


def load_occupations():
    best = {}
    for occupation, query in OCCUPATION_SOURCE:
        for row in sql(query):
            if row["person_id"] is None:
                continue
            count = int(row["n"])
            if count > best.get(row["person_id"], (0, None))[0]:
                best[row["person_id"]] = (count, occupation)
    return {pid: occupation for pid, (_, occupation) in best.items()}


# ------------------------------------------------------------------- the AQL

def one_person(person_id, fields):
    """A single register row. The soul is a dimension, not only a filter, so a
    soul who is not in the register comes back as no rows rather than as a row
    of nothing (AD-8)."""
    selected = ",\n    ".join(f"{name}: nether_person.{name}" for name in fields)
    return (f"explore {{\n  dimensions {{\n    {selected},\n  }}\n"
            f"  filters {{ nether_person.person_id is '{person_id}' }}\n}}")


def by_name(name, fields):
    selected = ",\n    ".join(f"{f}: nether_person.{f}" for f in fields)
    escaped = name.replace("'", "''")
    return (f"explore {{\n  dimensions {{\n    {selected},\n  }}\n"
            f"  filters {{ nether_person.name is '{escaped}' }}\n}}")


def subject_measure(person_id, metric, alias="v", where=None):
    measure = f"{alias}: {metric}"
    if where:
        measure += f" | where({where})"
    return (f"explore {{\n  dimensions {{ subject: nether_person.person_id }}\n"
            f"  measures {{ {measure} }}\n"
            f"  filters {{ nether_person.person_id is '{person_id}' }}\n}}")


# --------------------------------------------------------------- the four checks

def identity_check(case_person, documents):
    """Check 1: do the personal details match the Book of Truth?"""
    fields = ["person_id", "name", "birthdate", "birthplace", "death_date", "identity_id", "issue_place"]
    if case_person is None:
        # An impostor: nobody by that name is in the register. The finding is
        # that the query comes back empty, which is an answer, not a failure.
        return {
            "check": "identity",
            "kind": "record",
            "doc": "declaration",
            "prompt": "Do the personal details match the Book of Truth?",
            "dataset": "nether_identity",
            "ledger": "nether_person",
            "bind": {"name": documents["declaration"]["name"]},
            "aql": by_name(documents["declaration"]["name"], fields),
            "compare": [{"doc_field": f, "record_field": f}
                        for f in ("name", "birthdate", "birthplace", "identity_id", "issue_place")],
            "absent_is_conflict": True,
        }
    return {
        "check": "identity",
        "kind": "record",
        "doc": "declaration",
        "prompt": "Do the personal details match the Book of Truth?",
        "dataset": "nether_identity",
        "ledger": "nether_person",
        "bind": {"person_id": case_person["person_id"]},
        "aql": one_person(case_person["person_id"], fields),
        "compare": [{"doc_field": f, "record_field": f}
                    for f in ("name", "birthdate", "birthplace", "identity_id", "issue_place")],
        "absent_is_conflict": True,
    }


def permit_check(case_person, documents):
    """Check 2: is the permit valid and correctly sealed?"""
    claimed = documents["permit"]["permit_id"]
    escaped = claimed.replace("'", "''")
    aql = ("explore {\n  dimensions {\n"
           "    permit_id: nether_passage_permit.permit_id,\n"
           "    person_id: nether_passage_permit.person_id,\n"
           "    seal: nether_passage_permit.seal,\n"
           "    issued_on: nether_passage_permit.issued_on,\n"
           "    expires_on: nether_passage_permit.expires_on,\n"
           "  }\n"
           f"  filters {{ nether_passage_permit.permit_id is '{escaped}' }}\n}}")
    return {
        "check": "permit",
        "kind": "record",
        "doc": "permit",
        "prompt": "Is the permit valid and correctly sealed?",
        "dataset": "nether_identity",
        "ledger": "nether_passage_permit",
        "bind": {"permit_id": claimed},
        "aql": aql,
        "compare": [{"doc_field": "seal", "record_field": "seal"},
                    {"doc_field": "issued_on", "record_field": "issued_on"},
                    {"doc_field": "expires_on", "record_field": "expires_on"}],
        "validity": {"issued": "issued_on", "expires": "expires_on"},
        "absent_is_conflict": True,
    }


def obol_check(case_person, documents):
    """Check 4: does the obol match the birthplace's mint?

    Two hops: find the soul, read their birthplace, then find what a coin
    struck there is supposed to look like. The hardest of the four, because
    nothing on the coin says where it came from."""
    if documents["obol"] is None:
        return {
            "check": "obol",
            "kind": "absent",
            "doc": "obol",
            "prompt": "Does the obol match the birthplace's mint?",
            "dataset": "nether_mint",
            "ledger": "nether_obol_standard",
            "bind": {},
            "aql": None,
            "compare": [],
            "note": "No obol was offered.",
        }
    person_id = case_person["person_id"] if case_person else None
    country = documents['declaration']['birthplace'].replace("'", "''")
    filter_clause = (f"nether_person.person_id is '{person_id}'" if person_id
                     else f"nether_obol_standard.birthplace is '{country}'")
    aql = ("explore {\n  dimensions {\n"
           "    birthplace: nether_obol_standard.birthplace,\n"
           "    emblem: nether_obol_standard.emblem,\n"
           "    mint_mark: nether_obol_standard.mint_mark,\n"
           "    rim: nether_obol_standard.rim,\n"
           "    metal: nether_obol_standard.metal,\n"
           "  }\n"
           f"  filters {{ {filter_clause} }}\n}}")
    return {
        "check": "obol",
        "kind": "record",
        "doc": "obol",
        "prompt": "Does the obol match the birthplace's mint?",
        "dataset": "nether_mint",
        "ledger": "nether_obol_standard",
        "bind": {"person_id": person_id} if person_id else {"birthplace": documents['declaration']['birthplace']},
        "aql": aql,
        "compare": [{"doc_field": f, "record_field": f}
                    for f in ("emblem", "mint_mark", "rim", "metal")],
        "absent_is_conflict": True,
    }


# ------------------------------------------------------------- the judge's Books

QUESTIONS = {
    "physician": ("nether_healing", [
        ("How many souls did this healer take into their care?",
         lambda p: subject_measure(p, "patients_treated")),
        ("Of those they treated, what share recovered?",
         lambda p: subject_measure(p, "recovery_rate")),
        ("In their last ten years, what share of their patients recovered?",
         lambda p: subject_measure(p, "recovery_rate",
                                   where="date_diff('year', nether_patient_case.treated_on, "
                                         "nether_person.death_date) < 10")),
    ]),
    "soldier": ("nether_arms", [
        ("How many souls did this one kill?",
         lambda p: subject_measure(p, "souls_killed")),
        ("How many did they kill in battle?",
         lambda p: subject_measure(p, "killed_in_battle")),
        ("How many did they kill outside of battle?",
         lambda p: subject_measure(p, "killed_outside_battle")),
    ]),
    "landholder": ("nether_harvest", [
        ("What did their land yield, all told?",
         lambda p: subject_measure(p, "total_yield")),
        ("How many harvests came in from their land?",
         lambda p: subject_measure(p, "harvests_recorded")),
        ("What did a typical harvest on their land bring in?",
         lambda p: subject_measure(p, "average_yield")),
    ]),
    "priest": ("nether_rites", [
        ("How many offerings did they lay down?",
         lambda p: subject_measure(p, "offerings_made")),
        ("How many of their oaths did they break?",
         lambda p: subject_measure(p, "oaths_broken")),
        ("How many oaths did they swear?",
         lambda p: subject_measure(p, "oaths_sworn")),
    ]),
}

# Where a question goes when it deliberately leaves the obvious Book. A
# physician asked about debts; a soldier asked about an estate. Dataset choice
# stays a judgment the player makes rather than one the fiction makes for them.
ELSEWHERE = [
    ("nether_property", "How many holdings did they buy?",
     lambda p: subject_measure(p, "assets_acquired")),
    ("nether_work", "How many years of work are on their record?",
     lambda p: subject_measure(p, "years_employed")),
    ("nether_work", "How many houses did they work for?",
     lambda p: subject_measure(p, "employers")),
    ("nether_property", "What did they pay out for what they owned?",
     lambda p: subject_measure(p, "total_paid")),
    ("nether_identity", "How many bonds are recorded against this soul?",
     lambda p: subject_measure(p, "souls_bonded")),
]


def pick_question(person_id, occupation, rng):
    """A question this soul can actually be asked. A question whose answer is
    no rows is not a puzzle, it is a dead end, so the build checks before it
    ships one — but it never keeps the answer (AD-3)."""
    candidates = []
    if rng.randrange(ROUTE_AWAY_IN) == 0:
        pool = [(d, prompt, build) for d, prompt, build in ELSEWHERE]
        rng.shuffle(pool)
        candidates = pool
    if occupation in QUESTIONS:
        dataset, shapes = QUESTIONS[occupation]
        own = [(dataset, prompt, build) for prompt, build in shapes]
        rng.shuffle(own)
        candidates = candidates + own if candidates else own
    if not candidates:
        pool = list(ELSEWHERE)
        rng.shuffle(pool)
        candidates = pool

    for dataset, prompt, build in candidates:
        aql = build(person_id)
        problem = validate(dataset, aql)
        if problem:
            raise SystemExit(f"generated AQL does not compile for {dataset}:\n{aql}\n{problem}")
        rows, error = aql_rows(dataset, aql)
        if error or not rows or rows[0].get("v") is None:
            continue    # this soul has no record in that Book; try the next shape
        return {"dataset": dataset, "aql": aql, "field": "v", "prompt": prompt}
    return None


# --------------------------------------------------------------- discrepancies

def shift_date(value, years):
    year, month, day = str(value)[:10].split("-")
    return f"{int(year) + years:04d}-{month}-{day}"


def plant(kind, documents, world, person, rng, forced_identity_field=None):
    """Move exactly one document field away from its record, and say which.

    Exactly one, always: two would make the case ambiguous to grade and the
    build asserts against it."""
    standard = world["standard"].get(person["birthplace"], {}) if person else {}

    if kind == "register_contradiction":
        original = documents["declaration"].copy()
        # Keep the original random draws so new document fields do not reshuffle
        # applicants, support claims or the judges' questions later in the queue.
        field = rng.choice(["name", "birthdate", "birthplace"])
        if field == "name":
            others = [p["name"] for p in world["person"] if p["name"] != person["name"]]
            documents["declaration"]["name"] = rng.choice(others)
        elif field == "birthdate":
            documents["declaration"]["birthdate"] = shift_date(
                person["birthdate"], rng.choice([-3, -2, 2, 3]))
        else:
            others = [b for b in world["standard"] if b != person["birthplace"]]
            documents["declaration"]["birthplace"] = rng.choice(others)
        if forced_identity_field:
            documents["declaration"].update(original)
            field = forced_identity_field
            if field == "identity_id":
                code = person['identity_id']
                documents['declaration']['identity_id'] = code[:-1] + ('Z' if code[-1] != 'Z' else 'Q')
            else:
                other = next(p for p in world['person'] if p['birthplace'] != person['birthplace'])
                documents['declaration']['issue_place'] = other['issue_place']
        return {"kind": kind, "check": "identity", "doc_field": field}

    if kind == "permit_seal":
        seal = documents["permit"]["seal"]
        documents["permit"]["seal"] = seal[:-1] + ("Θ" if not seal.endswith("Θ") else "Λ")
        return {"kind": kind, "check": "permit", "doc_field": "seal"}

    if kind == "permit_expired":
        rng.choice(["valid", "redeemed"])  # preserve the legacy queue's random sequence
        documents['permit']['expires_on'] = EXPIRED_PERMIT.isoformat()
        return {"kind": kind, "check": "permit", "doc_field": "expires_on"}

    if kind == "obol_wrong":
        field = rng.choice(["emblem", "mint_mark", "rim", "metal"])
        pool = {row[field] for row in world["standard"].values()} - {standard.get(field)}
        documents["obol"][field] = rng.choice(sorted(pool))
        return {"kind": kind, "check": "obol", "doc_field": field}

    if kind == "obol_missing":
        documents["obol"] = None
        return {"kind": kind, "check": "obol", "doc_field": None}

    raise SystemExit(f"unknown discrepancy kind {kind}")


# ------------------------------------------------------------------- the cases

def plant_birthdate(documents, person):
    """The tutorial soul: a birthdate three years off the Book, nothing else."""
    documents["declaration"]["birthdate"] = shift_date(person["birthdate"], 3)
    return {"kind": "register_contradiction", "check": "identity", "doc_field": "birthdate"}


def build_documents(world, person, claimed_name, rng):
    standard = world["standard"].get(person["birthplace"], {}) if person else {}
    permits = [p for p in world["permit"]
               if person and p["person_id"] == person["person_id"]]
    permit = permits[-1] if permits else None
    return {
        "declaration": {
            "doc_type": "declaration",
            "name": claimed_name,
            "birthdate": str(person["birthdate"])[:10] if person else "—",
            "birthplace": person["birthplace"] if person else "—",
            "identity_id": person['identity_id'] if person else "—",
            "issue_place": person['issue_place'] if person else "—",
        },
        "permit": {
            "doc_type": "permit",
            "permit_id": permit["permit_id"] if permit else "—",
            "seal": permit["seal"] if permit else "—",
            "issued_on": str(permit["issued_on"])[:10] if permit else "—",
            "expires_on": str(permit["expires_on"])[:10] if permit else "—",
        },
        "obol": {
            "doc_type": "obol",
            "emblem": standard.get("emblem", "—"),
            "mint_mark": standard.get("mint_mark", "—"),
            "rim": standard.get("rim", "—"),
            "metal": standard.get("metal", "—"),
        },
    }


# A forgery the player can spot without opening a Book teaches nothing, so the
# kinds that force a Book carry most of the weight. Missing papers and a wrong
# seal still appear — a desk where every problem is subtle is its own tell —
# but rarely enough that skimming never pays.
DISCREPANCY_WEIGHTS = {
    "register_contradiction": 5,    # Book: the register disagrees
    "obol_wrong": 5,                # Book: two hops, the hardest check
    "permit_expired": 2,            # partly: the permit speaks for itself
    "permit_seal": 2,               # partly
    "obol_missing": 1,              # no Book needed at all
}
PAPER_FORGERY_WEIGHT = 6            # the papers are the new teaching, so they carry most of the forgeries


def discrepancy_pool(papers):
    """Which forgeries this case can carry, and how often each: the standard three, and one
    or two for every extra paper it holds."""
    kinds = ["register_contradiction", "permit_seal", "permit_expired", "obol_wrong", "obol_missing"]
    weights = [DISCREPANCY_WEIGHTS[k] for k in kinds]
    for paper_id, paper_type in papers:
        for forgery in NP.FORGERIES[paper_type]:
            kinds.append((paper_id, paper_type, forgery))
            weights.append(PAPER_FORGERY_WEIGHT)
    return kinds, weights


def generate(mode, world, occupations, recs, build):
    """One game's queue of souls: `mode` is 'hard' (ten days of five) or 'easy' (five days of four)."""
    cfg = NP.MODES[mode]
    per_day, ferry_days = cfg["per_day"], cfg["ferry_days"]
    total = cfg["days"] * per_day
    R = random.Random(SEED + (0 if mode == "hard" else 7919))
    print(f"\n{mode}: {cfg['days']} days of {per_day}, the judges from day {ferry_days + 1}")

    # The player is not one of the souls in the queue. Her case is the last one,
    # and it is not generated.
    PLAYER = "P0001"
    pool = [p for p in world["person"]
            if p["person_id"] in occupations and p["person_id"] != PLAYER]
    R.shuffle(pool)

    cases, used, identity_discrepancies = [], set(), set()
    calc_made = collections.Counter({t: 0 for t in NP.CALC})
    while len(cases) < total:
        index = len(cases)
        day = index // per_day + 1
        slot = index % per_day + 1
        pavilion = day > ferry_days
        tokens = NP.plan(day, slot)
        band = NP.band(day)

        # The next soul who can carry the papers this slot calls for and, in the
        # pavilion, be asked something the Books can answer.
        # The two calculation papers take turns (a tally, then a licence, ...), so both are met early; if
        # no unused soul can carry the one whose turn it is, the other will do.
        wanted = [None]
        if "C" in tokens:
            first = min(NP.CALC, key=lambda t: (calc_made[t], NP.CALC.index(t)))
            wanted = [first] + [t for t in NP.CALC if t != first] + [None]
        chosen = None
        for calc in wanted:
            for person in pool:
                if person["person_id"] in used:
                    continue
                picks = NP.choose(tokens, band, person["person_id"], R, recs, calc=calc)
                if picks is None:
                    continue
                question = None
                if pavilion:
                    question = pick_question(person["person_id"], occupations.get(person["person_id"]), R)
                    if question is None:
                        continue
                chosen = (person, picks, question)
                break
            if chosen:
                break
        if chosen is None:
            raise SystemExit(f"no unused soul can carry {tokens} on day {day}, slot {slot}")
        person, picks, question = chosen
        case_id = f"C{len(cases) + 1:03d}"

        # An impostor: the papers name somebody the register has never heard of.
        impostor = (not pavilion) and index > 0 and R.randrange(12) == 0
        claimed_name = person["name"]
        documents = build_documents(world, person, claimed_name, R)

        # The extra papers, each with the query that checks it.
        papers, paper_checks, count = [], [], collections.Counter()
        for kind, key, record in picks:
            count[kind] += 1
            paper_id = kind if count[kind] == 1 else f"{kind}{count[kind]}"
            document, check = NP.BUILDERS[kind](person["person_id"], key, record, recs)
            check.update({"check": paper_id, "doc": paper_id})
            documents[paper_id] = document
            paper_checks.append(check)
            papers.append({"id": paper_id, "type": kind, "kind": NP.KIND_OF[kind]})
            if kind in NP.CALC:
                calc_made[kind] += 1

        # Whether the case is clean: the first soul of the first shift is the
        # onboarding case and carries its own forgery below.
        clean = index == 0 or R.randrange(10) < CLEAN_IN_TEN

        # Q1: her name agrees with the Book and her birthdate does not, so the ferry tour can show
        # a match and a discrepancy on one paper.
        discrepancy = None
        if index == 0:
            discrepancy = plant_birthdate(documents, person)
        elif impostor:
            discrepancy = {"kind": "absent_record", "check": "identity", "doc_field": "name"}
            claimed_name = f"{person['name']} {R.choice(['of Mycenae', 'of Pylos', 'the quiet'])}"
            documents["declaration"]["name"] = claimed_name
        elif not clean:
            kinds, weights = discrepancy_pool([(p["id"], p["type"]) for p in papers])
            kind = R.choices(kinds, weights)[0]
            if isinstance(kind, tuple):
                paper_id, _, forgery = kind
                field = NP.forge(forgery, documents[paper_id], recs, R)
                discrepancy = {"kind": forgery, "check": paper_id, "doc_field": field}
            else:
                # Exercise both new identity lines in a deterministic queue, rather than
                # hoping random draws happen to include them.
                needed = next((f for f in ["identity_id", "issue_place"] if f not in identity_discrepancies), None)
                discrepancy = plant(kind, documents, world, person, R,
                                    forced_identity_field=needed if kind == "register_contradiction" else None)
        if discrepancy and discrepancy["check"] == "identity":
            identity_discrepancies.add(discrepancy["doc_field"])

        case_person = None if impostor else person
        checks = [identity_check(case_person, documents), permit_check(case_person, documents),
                  *paper_checks, obol_check(case_person, documents)]

        for check in checks:
            if check.get("aql"):
                problem = validate(check["dataset"], check["aql"])
                if problem:
                    raise SystemExit(f"{case_id} {check['check']} AQL does not compile:\n{check['aql']}\n{problem}")

        used.add(person["person_id"])
        cases.append({
            "case_id": case_id,
            "day": day,
            "slot": slot,
            "band": band,
            "current_date": current_date(day),
            "phase": "pavilion" if pavilion else "ferry",
            "gate": person["gate"],
            "person_id": None if impostor else person["person_id"],
            "soul_name": claimed_name,
            "occupation": occupations.get(person["person_id"]),
            "required_verdict": "approve" if discrepancy is None else "dispute",
            "discrepancy": discrepancy,
            "papers": papers,
            "documents": documents,
            "checks": checks,
            "question": question,
        })
        print(f"  {case_id}  day {day} #{slot}  {claimed_name:22} "
              f"{','.join(p['type'] for p in papers):34} {(discrepancy or {}).get('kind', 'clean')}")

    payload = {"build_id": build["build_id"], "seed": SEED, "mode": mode,
               "generated_cases": len(cases), "cases": cases}
    assert_build(cases, mode)
    base = os.path.join(DATA, cfg["file"])
    with open(base + ".json", "w") as handle:
        json.dump(payload, handle, indent=1)
    with open(base + ".js", "w") as handle:
        handle.write("/* Generated by scripts/generate_nether_cases.py. Do not edit. */\n")
        handle.write(f"window.{cfg['global']} = ")
        json.dump(payload, handle, indent=1)
        handle.write(";\n")
    print(f"wrote {os.path.relpath(base + '.json', ROOT)}  ({len(cases)} cases, build {build['build_id']})")
    kinds = collections.Counter((c["discrepancy"] or {}).get("kind", "clean") for c in cases)
    for kind, count in kinds.most_common():
        print(f"  {kind:26} {count}")


def main():
    print("reading the world through anfra serve …")
    world = load_world()
    occupations = load_occupations()
    recs = NP.Records(sql)
    build = sql("select build_id, seed from game_build")[0]
    os.makedirs(DATA, exist_ok=True)
    for mode in NP.MODES:
        generate(mode, world, occupations, recs, build)
    # Update the wiki metadata alongside every regenerated game queue.
    from build_nether_wiki_catalog import rebuild
    rebuild(Path(ROOT))


def assert_build(cases, mode):
    """AD-9: a broken case never reaches a playtest."""
    cfg = NP.MODES[mode]
    assert len(cases) == cfg["days"] * cfg["per_day"], f"{mode}: {len(cases)} cases"
    clean = sum(1 for c in cases if c["discrepancy"] is None)
    for case in cases:
        tokens = NP.plan(case["day"], case["slot"])
        kinds = collections.Counter(p["kind"] for p in case["papers"])
        names = [c["check"] for c in case["checks"]]
        assert len(names) == len(set(names)), f"{case['case_id']} repeats a check"
        assert len(case["checks"]) == 3 + len(case["papers"]), f"{case['case_id']} has {len(case['checks'])} checks"
        # The schedule: how many papers, and which kinds, by day and slot.
        assert len(case["papers"]) == len(tokens), f"{case['case_id']} carries {len(case['papers'])}, plan {tokens}"
        assert kinds["calc"] == tokens.count("C"), f"{case['case_id']} calc papers {kinds['calc']}"
        if NP.band(case["day"]) == 2:
            assert kinds["cross"] == tokens.count("X"), f"{case['case_id']} cross papers {kinds['cross']}"
        if NP.band(case["day"]) == 1:
            assert not kinds["cross"] and not kinds["calc"], f"{case['case_id']} is early but carries a hard paper"
        for paper in case["papers"]:
            assert paper["id"] in case["documents"], f"{case['case_id']} {paper['id']} has no document"
        assert case["required_verdict"] in ("approve", "dispute"), case["case_id"]
        # Exactly one discrepancy, or none: two would be ambiguous to grade.
        planted = case["discrepancy"]
        if planted:
            assert planted["check"] in set(names), case["case_id"]
        for check in case["checks"]:
            assert "aql" in check, f"{case['case_id']} {check['check']} has no query"
            assert "doc" in check, f"{case['case_id']} {check['check']} names no document"
            # AD-3: no expected answer is ever written down.
            assert "expected" not in check and "answer" not in check, case["case_id"]
        if case["question"]:
            assert set(case["question"]) >= {"dataset", "aql", "field"}, case["case_id"]
            assert "answer" not in case["question"], case["case_id"]
    pavilion = [c for c in cases if c["phase"] == "pavilion"]
    assert all(c["question"] for c in pavilion), "a pavilion case has no question"
    assert clean, "no clean cases were generated"
    datasets = {c["question"]["dataset"] for c in pavilion}
    assert len(datasets) >= (4 if mode == "hard" else 3), f"questions only reach {datasets}"
    print(f"assertions pass ({mode}): {len(cases)} cases, {clean} clean, {len(datasets)} Books questioned")


if __name__ == "__main__":
    main()
