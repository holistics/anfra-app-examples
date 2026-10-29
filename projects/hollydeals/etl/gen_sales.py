"""Deterministic fake sales funnel data for the Sales Funnel Tracker demo.

Returns every table in etl.sales_load.COLUMNS. Nothing here is real data: company, contact and owner names are
built from invented syllables, and every text comes from the templates below.
"""
import random
import re
from datetime import date, timedelta

DEFAULT_WEEKS = [f"2026-W{n}" for n in range(21, 43)]
N_DEALS = 40
N_LIVE_AT_END = 6
MISMATCHED_WEEK = 2 / 3  # position of the one week whose counts_* deliberately disagree with its sections

OWNERS = ["Joren", "Maelis", "Tobiah"]
SYLLABLES_A = ["Van", "Bris", "Quil", "Tor", "Mer", "Zan", "Kel", "Ol", "Dra", "Hal", "Ju", "Lum", "Nor", "Pyr",
               "Sol", "Tev", "Wyn", "Ax", "Cor", "Brisk"]
SYLLABLES_B = ["toro", "lane", "vik", "mora", "dex", "nell", "ova", "sten", "lio", "bara", "quin", "mere", "tal",
               "ruda", "zen"]
FIRST_A = ["Ar", "El", "Ka", "Mi", "Ro", "Sa", "Ti", "Vo", "Ne", "Du"]
FIRST_B = ["lin", "mara", "dren", "sa", "vik", "lo", "tessa", "ron"]
ROLES = ["Head of Data", "VP Engineering", "Analytics Lead", "Product Manager", "Founder", "Data Engineer"]

CURRENCIES = ["€", "S$", "$"]
MID_STATUSES = ["Also moving", "Good progress", "Stuck"]
QUIET_NOTES = ["Revival worth trying", "Low value, parked", "Waiting on their budget"]
DEAL_STAGE = {"Won": "Closed Won", "Lost": "Closed Lost", "Close-lost due": "Validating", "New": "Progressing",
              "Also moving": "Progressing", "Good progress": "Focus", "Stuck": "Validating", "Quiet": "Validating"}

# Paragraph templates per status, 2 or 3 each, and every status has one without {amt} for deals with no amount. {co} company, {owner} owner, {contact} contact, {amt} amount, {pct} win %.
PARAGRAPHS = {
    "New": [
        "{contact} at {co} booked a first call after seeing a demo. {owner} sent the intro deck and a short trial plan.",
        "{co} came in through a referral, with a rough budget of {amt}. {owner} has a discovery call set for next week.",
    ],
    "Also moving": [
        "{co} finished the second workshop and {contact} asked for a security review. {owner} will send the answers this week.",
        "{contact} added two analysts to the {co} trial. Usage is steady, and no blockers have come up so far.",
    ],
    "Good progress": [
        "{co} agreed the scope at {amt}, and {contact} is taking the proposal to finance. {owner} thinks the odds are about {pct}%.",
        "The {co} trial hit its success criteria early. {contact} wants a pricing call before the end of the month.",
    ],
    "Stuck": [
        "{co} is waiting on a data warehouse upgrade before it can connect. {owner} has no date from {contact} yet.",
        "{contact} likes the product, but the {co} legal team has held the contract for three weeks. {owner} is asking for a call with them.",
    ],
    "Quiet": [
        "No reply from {contact} at {co} for two weeks. {owner} has tried email and a short voice note.",
        "{co} went quiet after the pricing call. {owner} will try a new contact before closing the file.",
    ],
    "Close-lost due": [
        "{contact} told {owner} that {co} will probably stay with a spreadsheet process this quarter. The deal is due to be closed lost.",
        "{co} has missed two meetings and the trial has expired. {owner} plans to mark the deal closed lost unless {contact} replies.",
    ],
    "Won": [
        "{co} signed at {amt}. {contact} wants onboarding to start next week, and {owner} has booked the kickoff.",
        "Closed won: {co} chose us after a four-week trial, at {amt}. {owner} is handing over to customer success.",
        "{co} signed after a four-week trial. {contact} wants onboarding to start next week, and {owner} has booked the kickoff.",
    ],
    "Lost": [
        "Closed lost: {co} decided to build in house. {contact} said the price was fair, but the timing was wrong.",
        "{co} closed the deal as lost at {amt}. {owner} noted that the budget moved to another project.",
    ],
}
ASSESSMENTS = [
    "{co} has a clear problem and an engaged champion in {contact}. The open question is budget timing, and {owner} is working on it.",
    "The case at {co} rests on speed to insight. {contact} has seen the demo twice and the trial results look healthy.",
    "{co} is a mid-size team with a small data group. Risk is low if {owner} keeps the weekly check-in with {contact}.",
]
NEXT_STEPS = [
    "1. {owner}: send the follow-up summary to {contact}.\n2. Book a review call at {co} for next week.",
    "1. {owner}: confirm the trial scope with {contact}.\n2. Share a short pricing note for {co}.",
    "1. {owner}: ask {contact} for a date on the budget decision.\n2. Prepare a reference call for {co}.",
]
HEALTH = {"Won": "Won", "Lost": "Closed lost", "Close-lost due": "At risk", "New": "Early", "Also moving": "Active",
          "Good progress": "On track", "Stuck": "Stalled", "Quiet": "Quiet"}

FEEDBACK_THEMES = [
    "**Embedded dashboards.** {cos} all asked for dashboards inside their own product.",
    "**Faster first load.** {cos} found the first load slow on large tables.",
    "**Scheduled exports.** {cos} want weekly exports to email without a manual step.",
    "**Row-level access.** {cos} need each customer to see only its own rows.",
]
POSITIVE_QUOTES = [
    "Setup took an afternoon, not a month.",
    "The team finally trusts one set of numbers.",
    "It replaced three spreadsheets for us.",
    "Our analysts stopped waiting on engineering.",
    "The trial paid for itself in the first week.",
    "Dashboards load fast, even on the big tables.",
    "Support answered within the hour.",
    "I can explain every metric to the board now.",
    "The semantic layer saved us weeks of rework.",
    "Our customers like the embedded charts.",
    "It fits the way our data team already works.",
    "Rollout was smooth and nobody asked for training.",
    "We found two reporting errors on day one.",
    "The pricing was easy to explain to finance.",
]
MIXED_QUOTES = [
    "We like it, but the budget is tight this year.",
    "Good product, though we need more time to migrate.",
    "The price is hard to justify for a team our size.",
    "We are not ready to switch our reporting yet.",
]


def _week_start(week):
    year, number = re.fullmatch(r"(\d{4})-W(\d{1,2})", week).groups()
    return date.fromisocalendar(int(year), int(number), 1)


def _names(rng, count):
    pairs = [a + b for a in SYLLABLES_A for b in SYLLABLES_B]
    rng.shuffle(pairs)
    return pairs[:count]


def _contact(rng):
    first = rng.choice(FIRST_A) + rng.choice(FIRST_B)
    last = rng.choice(SYLLABLES_A) + rng.choice(SYLLABLES_B)
    return f"{first} {last}"


def _amount(rng):
    """Odd-looking amounts that end in 70 or 90 (e.g. 1,470/mo, 23,690/yr), never a round number a real deal has."""
    currency, tail = rng.choice(CURRENCIES), rng.choice([70, 90])
    if rng.random() < 0.5:
        return currency, rng.randrange(5, 41) * 100 + tail, "mo"
    return currency, rng.randrange(60, 490) * 100 + tail, "yr"


def _money(currency, amount, period):
    return f"{currency}{amount:,}/{period}"


def _plan_statuses(rng, length, final, quiet_story, cld):
    """A status path of `length` weeks starting New. `final` is Won, Lost or None (still live)."""
    if length == 1:
        return ["New"]
    path = ["New"]
    mid = length - 1 - (1 if final else 0)  # weeks between New and the end
    tail = ["Close-lost due"] if cld else []
    body = mid - len(tail)
    state = "Also moving"
    quiet_at = rng.randrange(1, max(2, body - 2)) if quiet_story else None
    quiet_len = rng.choice([1, 2]) if quiet_story else 0
    i = 0
    while i < body:
        if quiet_at is not None and i == quiet_at:
            path += ["Quiet"] * quiet_len
            i += quiet_len
            state = rng.choice(["Also moving", "Good progress"])  # revives
            quiet_at = None
            continue
        path.append(state)
        i += 1
        roll = rng.random()
        if roll < 0.55:
            continue
        state = rng.choice(MID_STATUSES)
    path = path[:1 + body] + tail
    if final == "Won" and len(path) > 1:
        path[-1] = "Good progress"
    if final:
        path.append(final)
    if not final and not quiet_story and len(path) > 3 and rng.random() < 0.2:
        path[-1] = "Quiet"
    return path[:length]


def generate(seed: int = 7, weeks: list[str] | None = None) -> dict[str, list[dict]]:
    rng = random.Random(seed)
    weeks = list(weeks or DEFAULT_WEEKS)
    n = len(weeks)
    won_cap = {i: 3 for i in range(n)}
    lost_cap = {i: 4 for i in range(n)}

    names = _names(rng, N_DEALS)
    ended = min(N_DEALS - N_LIVE_AT_END, sum(won_cap.values()) + sum(lost_cap.values()))
    outcomes = ["Lost"] * 5 + ["Won"] * 3
    outcomes += rng.choices(["Won", "Lost"], weights=[0.35, 0.65], k=max(0, ended - len(outcomes)))
    outcomes = outcomes[:ended] + [None] * (N_DEALS - ended)

    plans = []  # (outcome, start index, statuses)
    for k, outcome in enumerate(outcomes):
        story = k < 8 and outcome is not None
        if outcome is None:
            length = rng.randrange(3, 9)
            end = n - 1
            story_quiet = k - ended == 0  # one live deal with a Quiet stretch and a revival
            cld = False
        else:
            cap = won_cap if outcome == "Won" else lost_cap
            low = 8 if story else 1
            choices = [i for i in range(min(low, n - 1), n) if cap[i] > 0] or [i for i in range(n) if cap[i] > 0]
            if not choices:  # this outcome's weekly cap is used up (short week lists), so the deal stays live
                outcome, end = None, n - 1
            else:
                end = rng.choice(choices)
                cap[end] -= 1
            length = rng.randrange(7, 13) if story else rng.randrange(3, 11)
            story_quiet = story
            cld = outcome == "Lost" and (story or rng.random() < 0.35)
        length = min(length, end + 1)
        if outcome and length < 2:
            length = 2 if end >= 1 else 1
        if cld and length < 4:
            cld = False
        statuses = _plan_statuses(rng, length, outcome, story_quiet and length >= 6, cld)
        plans.append((outcome, end - len(statuses) + 1, statuses))

    deals, deal_weeks = [], []
    generated = [_week_start(w) + timedelta(days=2) for w in weeks]
    for k, (outcome, start, statuses) in enumerate(plans):
        name = names[k]
        slug = name.lower()
        owner = OWNERS[k % len(OWNERS)] if k < 3 else rng.choice(OWNERS)
        contact = _contact(rng)
        currency, amount, period = _amount(rng)
        if k < 3:  # the first deals pin all three currencies and both periods, whatever the roll
            currency = CURRENCIES[k]
            period = ["mo", "yr", period][k]
        elif rng.random() < 0.1:
            currency = amount = period = None
        amt_text = _money(currency, amount, period) if amount else None
        pct = rng.randrange(20, 55)
        last_pct = None
        for offset, status in enumerate(statuses):
            week = weeks[start + offset]
            if status in ("Won", "Lost"):
                last_pct = None
            else:
                pct = max(5, min(95, pct + rng.randint(-10, 10)))
                last_pct = 5 if status == "Close-lost due" else pct
            templates = [t for t in PARAGRAPHS[status] if amt_text or "{amt}" not in t]
            text = rng.choice(templates).format(co=name, owner=owner, contact=contact, amt=amt_text,
                                                         pct=last_pct or pct)
            deal_weeks.append({
                "week": week, "slug": slug, "name_shown": name, "owner": owner, "status": status,
                "sub_status": rng.choice(QUIET_NOTES) if status == "Quiet" else None,
                "paragraph": text, "win_pct": last_pct, "source_path": f"fake/{week}.md",
            })
        final = statuses[-1]
        first_gen, last_gen = generated[start], generated[start + len(statuses) - 1]
        created = first_gen - timedelta(days=rng.randrange(7, 60))
        win_text = {"Won": "Won (100%)", "Lost": "Lost (0%)"}.get(final, f"~{last_pct or pct}%")
        trial = rng.choice(["active", "expired", "none"])
        deals.append({
            "slug": slug, "name": name, "owner": owner, "deal_stage": DEAL_STAGE[final],
            "amount": amount, "currency": currency, "amount_period": period,
            "deal_created": created, "first_call": created + timedelta(days=rng.randrange(2, 10)),
            "close_date": last_gen - timedelta(days=rng.randrange(0, 5)) if final in ("Won", "Lost") else None,
            "last_responded": last_gen - timedelta(days=rng.randrange(1, 12)),
            "trial_status": trial,
            "trial_builders": rng.randrange(1, 5) if trial != "none" else None,
            "trial_active_users": rng.randrange(2, 20) if trial == "active" else None,
            "trial_expiry": last_gen + timedelta(days=rng.randrange(-20, 20)) if trial != "none" else None,
            "health": HEALTH[final], "win_probability_text": win_text,
            "assessment": rng.choice(ASSESSMENTS).format(co=name, owner=owner, contact=contact) +
                          (f" The deal is sized at {amt_text}." if amt_text else " The size is not agreed yet."),
            "next_steps": rng.choice(NEXT_STEPS).format(co=name, owner=owner, contact=contact),
            "key_contacts": f"| Contact | Research |\n|---------|----------|\n| **{contact}** · {rng.choice(ROLES)} | "
                            f"Main champion at {name}. |",
            "file_path": None,
            "location": "deals-archive" if final in ("Won", "Lost") else "deals",
        })

    reports = []
    mismatch = weeks[int(n * MISMATCHED_WEEK)] if n >= 3 else None
    for week, gen in zip(weeks, generated):
        statuses = [w["status"] for w in deal_weeks if w["week"] == week]
        count = {s: statuses.count(s) for s in set(DEAL_STAGE)}
        counts = {"won": count["Won"], "lost": count["Lost"], "promising": count["Good progress"] + count["Stuck"],
                  "new": count["New"], "highlight": count["Also moving"], "quiet": count["Quiet"]}
        ok = week != mismatch
        if not ok:
            counts["promising"] += 1
        reports.append({
            "week": week, "generated_on": gen, "window_start": gen - timedelta(days=7), "window_end": gen,
            "month": gen.replace(day=1), **{f"counts_{k}": v for k, v in counts.items()},
            "counts_ok": ok, "source_path": f"fake/{week}.md",
        })

    by_week = {}
    for w in deal_weeks:
        by_week.setdefault(w["week"], []).append(w["slug"])
    feedback = []
    for i, theme in enumerate(FEEDBACK_THEMES):
        week = weeks[min(n - 1, int(n * (i + 1) / 5))]
        present = sorted(set(by_week.get(week, [])))
        slugs = rng.sample(present, min(len(present), rng.randrange(2, 5)))
        shown = {d["slug"]: d["name"] for d in deals}
        feedback.append({"id": i + 1, "week": week, "slugs": slugs, "deal_count": len(slugs),
                         "text": theme.format(cos=", ".join(shown[s] for s in slugs))})

    pairs = sorted({(w["week"], w["slug"]) for w in deal_weeks})
    chosen = sorted(rng.sample(pairs, min(20, len(pairs))))
    texts = rng.sample(POSITIVE_QUOTES, min(len(POSITIVE_QUOTES), 16)) + MIXED_QUOTES
    rng.shuffle(texts)
    quotes = [{"id": i + 1, "week": week, "slug": slug, "quote": texts[i % len(texts)]}
              for i, (week, slug) in enumerate(chosen)]
    return {"reports": reports, "deals": deals, "deal_weeks": deal_weeks, "feedback": feedback, "quotes": quotes}
