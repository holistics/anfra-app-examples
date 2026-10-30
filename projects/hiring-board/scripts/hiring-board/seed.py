# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2", "pandas>=2.2,<3"]
# ///
"""Build data/hiring.duckdb: synthetic hiring data for the Hiring Board app.

    uv run scripts/hiring-board/seed.py

12 open roles, about 620 invented applicants (Apr 22 - Oct 18, 2026), the interview rounds they
had and a few HR notes. Same output every run. Names, emails and companies are invented; emails
use example.com.

The candidate model:
- stage: Applied → Screening → Technical → Culture → Final → Offer
- status (open candidates only): To do · Scheduled · Awaiting decision
- outcome (closed candidates only): Hired · Rejected · Withdrawn (Withdrawn at Offer = declined)
Exactly one of status and outcome is filled.

The story the data tells (the app's insights read it back):
1. Engineering's Technical round is the bottleneck: long waits (only three interviewers), a lower
   pass rate, and one slow interviewer (Quang Vo) who takes about a week to send feedback.
2. One interviewer (Tom Becker) scores well below everyone else.
3. Candidates who wait more than a week for the next step withdraw far more often.
4. Referrals reach the Final round most often; job boards least.
5. Qualified candidates (reached Final) match more of the role's key skills, more often have a
   degree, and are less often relocating.
6. Gender has no effect anywhere: the fairness check should find parity.
7. Headcount: Engineering's plan for Dec 31 is ahead of its open roles (5 planned seats have no role yet), so its
   pipeline can't fill it, and it loses people fastest (about a quarter a year). Some of the year's hires only replace
   leavers.

interview_rounds holds one row per round a candidate got to, including the ones they withdrew
from before the interview, so waits and pass rates read from one table.
"""
import random
from datetime import date, timedelta
from pathlib import Path
from statistics import median

import duckdb
import pandas as pd

SEED = 20261019
ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "hiring.duckdb"
TODAY = date(2026, 10, 19)  # the app's "now"

R = random.Random(SEED)
pick = R.choice


def between(a, b):
    return R.randint(a, b)


def wpick(pairs):
    r = R.random() * sum(w for _, w in pairs)
    for v, w in pairs:
        r -= w
        if r < 0:
            return v
    return pairs[0][0]


def stable(key, salt):
    """A number in [0, 1) fixed per candidate, so traits don't shift the seeded stream."""
    return random.Random(f"{key}:{salt}").random()


STAGES = ["Applied", "Screening", "Technical", "Culture", "Final", "Offer"]
ROUNDS = ["Screening", "Technical", "Culture", "Final"]
SOURCES = [("LinkedIn", 38), ("Job board", 30), ("Referral", 14), ("Agency", 10), ("Careers page", 8)]
SOURCE_BONUS = {"Referral": .15, "Agency": .04, "LinkedIn": 0, "Careers page": .02, "Job board": -.1}

POSITIONS = [
    ("REQ-2041", "Senior Backend Engineer", "Engineering", "Ho Chi Minh City", "Lan Pham", "2026-04-22", 4, 92),
    ("REQ-2042", "Frontend Engineer", "Engineering", "Remote", "Daniel Okafor", "2026-05-04", 3, 74),
    ("REQ-2047", "Data Engineer", "Engineering", "Singapore", "Lan Pham", "2026-06-01", 1, 50),
    ("REQ-2053", "Site Reliability Engineer", "Engineering", "Hanoi", "Kenji Mori", "2026-07-06", 2, 38),
    ("REQ-2044", "Product Manager", "Product", "Ho Chi Minh City", "Sofia Reyes", "2026-04-27", 2, 60),
    ("REQ-2049", "Product Designer", "Product", "Remote", "Sofia Reyes", "2026-06-10", 1, 44),
    ("REQ-2045", "Account Executive", "Sales", "Singapore", "Ahmed Khan", "2026-05-11", 3, 55),
    ("REQ-2050", "Sales Development Rep", "Sales", "Ho Chi Minh City", "Ahmed Khan", "2026-06-15", 4, 68),
    ("REQ-2046", "Customer Success Manager", "Customer Success", "Hanoi", "Linh Do", "2026-05-18", 1, 45),
    ("REQ-2051", "Content Marketer", "Marketing", "Remote", "Grace Kim", "2026-06-22", 2, 36),
    ("REQ-2048", "FP&A Analyst", "Finance", "Singapore", "Ravi Shah", "2026-05-25", 1, 30),
    ("REQ-2052", "Technical Recruiter", "People", "Ho Chi Minh City", "Thu Nguyen", "2026-07-13", 1, 30),
]
SCREENERS = ["Thu Nguyen", "Marcus Lee", "Hana Sato"]
TECH = {"Engineering": ["Quang Vo", "Priya Nair", "Tom Becker"], "Product": ["Sofia Reyes", "Minh Chau"], "Sales": ["Ahmed Khan", "Bella Ortiz"],
        "Customer Success": ["Linh Do"], "Marketing": ["Grace Kim"], "Finance": ["Ravi Shah"], "People": ["Marcus Lee"]}
CULTURE = ["Mai Hoang", "Oliver Grant", "Ana Silva"]
# Seats per role that replace someone who left; a role's first hires fill them
BACKFILL = {"REQ-2041": 2, "REQ-2042": 1, "REQ-2053": 1, "REQ-2045": 1, "REQ-2050": 1, "REQ-2046": 1}
HARSH = "Tom Becker"  # scores low
SLOW = "Quang Vo"  # slow to send feedback

FIRST = ["An", "Bao", "Chi", "Duc", "Giang", "Hai", "Hanh", "Huong", "Khanh", "Lam", "Long", "My", "Nam", "Ngoc", "Phuong", "Quan", "Thao", "Trang",
         "Tuan", "Vy", "Alex", "Ben", "Chloe", "David", "Emma", "Farah", "Hiro", "Isha", "Jonas", "Leah", "Mateo", "Nadia", "Omar", "Rina", "Sam", "Wei",
         "Yuki", "Zara"]
LAST = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui", "Do", "Ngo", "Tan", "Lim", "Wong", "Garcia", "Patel", "Becker", "Ito", "Kim",
        "Santos", "Haddad"]
WOMEN = {"Chi", "Hanh", "Huong", "My", "Ngoc", "Phuong", "Thao", "Trang", "Vy", "Chloe", "Emma", "Farah", "Isha", "Leah", "Nadia", "Rina", "Yuki", "Zara"}
MEN = {"Bao", "Duc", "Hai", "Lam", "Long", "Nam", "Quan", "Tuan", "Ben", "David", "Hiro", "Jonas", "Mateo", "Omar", "Wei"}
COMPANIES = ["Northwind Commerce", "Lumen Pay", "Kestrel Logistics", "Bluefin Retail", "Orbit Health", "Tandem Bank", "Saltbox Games",
             "Harbor Analytics", "Pinecone Travel", "Copperline Media", "Atlas Freight", "Juniper Learning"]
CITIES = ["Ho Chi Minh City", "Hanoi", "Da Nang", "Singapore", "Bangkok", "Kuala Lumpur"]

PROFILE = {
    "Senior Backend Engineer": ("backend engineering", "Backend Engineer", ["Go", "PostgreSQL", "Kafka", "gRPC", "AWS", "Redis", "Kubernetes"], "Software Engineering",
                                ["Led the move of a payments service to event-driven processing.", "Cut p95 latency of the order API from 900 ms to 180 ms.", "Owns on-call for a service handling 3k requests per second."]),
    "Frontend Engineer": ("frontend engineering", "Frontend Engineer", ["TypeScript", "React", "Vue", "CSS", "Vite", "Playwright"], "Computer Science",
                          ["Rebuilt the checkout flow; conversion up 6%.", "Maintains the company design system used by 5 teams.", "Introduced visual regression tests to the release pipeline."]),
    "Data Engineer": ("data engineering", "Data Engineer", ["SQL", "dbt", "Airflow", "Python", "BigQuery", "Spark"], "Data Science",
                      ["Built the dbt project behind the finance reporting layer.", "Moved nightly batch jobs to hourly incremental models.", "Set up data tests that catch broken loads before 8am."]),
    "Site Reliability Engineer": ("infrastructure and SRE", "DevOps Engineer", ["Kubernetes", "Terraform", "Prometheus", "Linux", "GCP", "Go"], "Computer Engineering",
                                  ["Brought monthly downtime from 4 hours to under 20 minutes.", "Wrote the incident review process the team still uses.", "Migrated 40 services to Terraform-managed clusters."]),
    "Product Manager": ("product management", "Product Manager", ["Discovery", "Roadmapping", "SQL", "A/B testing", "Figma", "Stakeholder management"], "Economics",
                        ["Launched a self-serve onboarding that halved time to first value.", "Runs weekly customer interviews with the design team.", "Grew activation from 31% to 44% over two quarters."]),
    "Product Designer": ("product design", "Product Designer", ["Figma", "Prototyping", "User research", "Design systems", "Accessibility"], "Visual Communication",
                         ["Redesigned the mobile app navigation; support tickets down 22%.", "Built the accessibility checklist used in design reviews.", "Ran 30 usability sessions for a new billing flow."]),
    "Account Executive": ("B2B sales", "Account Executive", ["Salesforce", "Negotiation", "Pipeline management", "MEDDIC", "Demos"], "Business Administration",
                          ["Closed 118% of quota in 2025.", "Opened the company's first three accounts in Indonesia.", "Average deal size of $42k across 2025."]),
    "Sales Development Rep": ("sales development", "SDR", ["Outbound prospecting", "HubSpot", "Cold calling", "LinkedIn Sales Navigator", "Email sequencing"], "Communications",
                              ["Booked 22 qualified meetings a month on average.", "Top SDR in Q2 for pipeline created.", "Wrote the outbound sequence the team now uses."]),
    "Customer Success Manager": ("customer success", "Customer Success Manager", ["Onboarding", "Renewals", "Gainsight", "QBRs", "Churn analysis"], "Psychology",
                                 ["Keeps net revenue retention at 112% across 40 accounts.", "Built the health score that flags churn risk early.", "Cut onboarding time from 6 weeks to 3."]),
    "Content Marketer": ("content marketing", "Content Writer", ["SEO", "Copywriting", "Webflow", "Analytics", "Editing"], "Journalism",
                         ["Grew organic sign-ups 3× in a year.", "Runs a newsletter with 18k subscribers.", "Wrote 60 customer stories used by the sales team."]),
    "FP&A Analyst": ("finance and FP&A", "Financial Analyst", ["Excel", "Forecasting", "SQL", "Budgeting", "NetSuite"], "Finance",
                     ["Built the 3-statement model used for the Series B.", "Brought monthly close from 12 days to 6.", "Owns the headcount plan for 300 people."]),
    "Technical Recruiter": ("technical recruiting", "Recruiter", ["Sourcing", "Greenhouse", "Boolean search", "Employer branding", "Closing"], "Human Resources",
                            ["Hired 34 engineers in 2025.", "Cut time to hire for engineers from 52 to 35 days.", "Built the referral programme now giving 1 in 5 hires."]),
}
FEEDBACK = {
    "Pass": {
        "Screening": ["Clear motivation for the role and the salary range fits.", "Communicates well; notice period is 30 days.", "Background matches the level, keen on the product."],
        "Technical": ["Solved the core problem cleanly and explained the trade-offs.", "Solid fundamentals; needed one hint on the edge cases.", "Good depth on the design question, testing could be sharper."],
        "Culture": ["Thoughtful about feedback and working with others.", "Good examples of owning a project end to end.", "Asks good questions; would be a steady teammate."],
        "Final": ["Hiring manager keen; aligned on scope and start date.", "Strong close; references to follow."],
    },
    "Fail": {
        "Screening": ["Salary expectation well above the band.", "Experience doesn't match the level we're hiring for.", "Can't start within the timeline we need."],
        "Technical": ["Couldn't get to a working solution in the time.", "Struggled to explain the approach behind the answer.", "Gaps in fundamentals the role depends on."],
        "Culture": ["Examples stayed vague; little sense of ownership.", "Prefers a very different way of working from the team."],
        "Final": ["Hiring manager not convinced on scope.", "Another finalist was a closer fit."],
    },
}
NOTE_TEXT = ["Asked to move the Technical round to after 6pm their time.", "Has a competing offer; wants an answer by Oct 24.",
             "Referrer says they were the strongest person on their last team.", "Relocating from Bangkok in December; happy to start remote.",
             "Prefers to interview in English and Vietnamese; both fine.", "Salary ask is at the top of the band; flag before the Final.",
             "Chased twice for a Technical slot. Engineering interviewers fully booked this week."]

ROLE_OF = {n: "Screening" for n in SCREENERS}
for names in TECH.values():
    for n in names:
        ROLE_OF.setdefault(n, "Technical")
for n in CULTURE:
    ROLE_OF[n] = "Culture"


def wait_for(round_, dept):
    if round_ == "Screening":
        return between(1, 6)
    if round_ == "Technical" and dept == "Engineering":
        return between(15, 21) if R.random() < .25 else between(6, 14)
    if round_ == "Technical":
        return between(3, 8)
    if round_ == "Culture":
        return between(3, 7)
    return between(3, 10)


def interviewer_for(round_, dept, hm):
    if round_ == "Screening":
        return pick(SCREENERS)
    if round_ == "Technical":
        return pick(TECH[dept])
    if round_ == "Culture":
        return pick(CULTURE)
    return hm


def score_for(passed, harsh):
    if passed:
        return (3 if R.random() < .8 else 4) if harsh else wpick([(3, 45), (4, 40), (5, 15)])
    return wpick([(1, 60), (2, 40)]) if harsh else wpick([(1, 30), (2, 55), (3, 15)])


def wait_bucket(d):
    return "0–3 days" if d <= 3 else "4–7 days" if d <= 7 else "8–14 days" if d <= 14 else "15+ days"


def experience_band(y):
    return "0–2 years" if y <= 2 else "3–5 years" if y <= 5 else "6–8 years" if y <= 8 else "9+ years"


def fmt(d):
    return f"{d:%b} {d.day}"


positions, candidates, rounds, notes = [], [], [], []
cid, rid = 1000, 0
for pos_id, title, dept, loc, hm, opened_s, hc, n in POSITIONS:
    ROLE_OF.setdefault(hm, "Final")
    opened = date.fromisoformat(opened_s)
    span = (TODAY - opened).days - 1
    # more applications in recent weeks; generated in applied order so a role stops hiring once its seats are filled
    dates = sorted(opened + timedelta(days=int((R.random() ** .45) * span)) for _ in range(n))
    hires = 0
    area, role, skill_pool, field, highlights = PROFILE[title]
    for applied in dates:
        cid += 1
        c_id = f"C-{cid}"
        source = wpick(SOURCES)
        years = between(5, 11) if title.startswith("Senior") else between(1, 8)
        first, last = pick(FIRST), pick(LAST)
        company = pick(COMPANIES)
        city = loc if R.random() < .7 else pick(CITIES)
        skills = [s for s in skill_pool if R.random() < .65][:5]
        if len(skills) < 3:
            skills = skill_pool[:3]
        highlight = pick(highlights)
        match = min(5, len(skills))
        hd = stable(c_id, "degree")
        degree = "No degree" if hd < .1 else "Certificate" if hd < .22 else "Bachelor's" if hd < .75 else "Master's"
        relocating = loc != "Remote" and city != loc
        gender = ("Not stated" if stable(c_id, "ns") < .05 else "Non-binary" if stable(c_id, "nb") < .02
                  else "Woman" if first in WOMEN else "Man" if first in MEN else "Woman" if stable(c_id, "g") < .5 else "Man")
        c = dict(candidate_id=c_id, position_id=pos_id, name=f"{first} {last}", gender=gender,
                 email=f"{first.lower()}.{last.lower()}{int(stable(c_id, 'mail') * 90 + 10)}@example.com",
                 source=source, applied_at=applied, years_experience=years, experience_band=experience_band(years),
                 degree=degree, education=f"{degree} in {field}" if degree in ("Master's", "Bachelor's") else degree,
                 key_skills_matched=match, key_skills=f"{match} of 5", skills=", ".join(skills),
                 location=city, relocating=relocating, location_fit="Relocating" if relocating else "Local or remote",
                 current_company=company, summary=f"{years} years in {area}; currently {role} at {company}.", highlight=highlight,
                 has_cover_letter=stable(c_id, "letter") < .6, has_portfolio=title in ("Product Designer", "Content Marketer"),
                 stage="Applied", status="To do", outcome=None, declined_offer=False,
                 stage_entered_at=applied, status_changed_at=applied, closed_at=None, offer_sent_at=None, hired_at=None,
                 next_round_at=None, next_interviewer=None, cv_rejected=False)
        my_rounds = []

        def close(outcome, at):
            c.update(outcome=outcome, status=None, closed_at=at)

        t, open_ = applied, True
        # Applied: the CV review is the only step here
        reviewed = applied + timedelta(days=between(1, 5))
        cv_reject = .2 + {"Job board": .12, "Referral": -.14, "Agency": -.05}.get(source, 0) + (.1 if years <= 1 else 0) + (.08 if match == 3 else -.06 if match == 5 else 0)
        if reviewed > TODAY:
            open_ = False
        elif R.random() < cv_reject:
            close("Rejected", reviewed)
            c["cv_rejected"] = True
            open_ = False
        else:
            t = reviewed
        for r_i, round_ in enumerate(ROUNDS):
            if not open_:
                break
            wait = wait_for(round_, dept)
            held = t + timedelta(days=wait)
            booked = t + timedelta(days=max(1, round(wait * (.35 + .3 * R.random()))))
            c.update(stage=round_, stage_entered_at=t, status="To do", status_changed_at=t)
            open_ = False
            wp = .36 if wait > 14 else .18 if wait > 7 else .04
            if R.random() < wp:
                after = max(1, round(wait * (.7 + .3 * R.random())))
                wd = t + timedelta(days=after)
                if wd <= TODAY:
                    my_rounds.append(dict(round_type=round_, round_order=r_i + 1, interviewer=None, wait_days=after, booked_at=None, held_at=None,
                                          decided_at=None, feedback_days=None, score=None, result="Withdrew before interview", feedback=None, ended_at=wd))
                    close("Withdrawn", wd)
                    break
            if booked > TODAY:
                break
            iv = interviewer_for(round_, dept, hm)
            c.update(status="Scheduled", status_changed_at=booked, next_round_at=held, next_interviewer=iv)
            if held > TODAY:
                break
            row = dict(round_type=round_, round_order=r_i + 1, interviewer=iv, wait_days=wait, booked_at=booked, held_at=held, ended_at=held)
            my_rounds.append(row)
            if R.random() < .03:
                row.update(decided_at=None, feedback_days=None, score=None, result="No-show", feedback="Didn't join the call; no reply to follow-ups.")
                close("Withdrawn", held)
                break
            filled = round_ == "Final" and hires >= hc
            p = {"Screening": .7, "Technical": .64, "Culture": .76, "Final": .55}[round_]
            if round_ == "Technical" and dept == "Engineering":
                p = .38
            p += SOURCE_BONUS[source]
            if round_ in ("Screening", "Technical"):
                p += -.1 if years <= 2 else .06 if years >= 6 else 0
            if round_ == "Screening":
                p += (match - 4) * .1 + (-.07 if relocating else 0)
            if round_ == "Technical":
                p += {"Master's": .12, "No degree": -.12, "Certificate": -.05}.get(degree, 0) + (match - 4) * .1
            if round_ == "Culture":
                p += (match - 4) * .06 + (-.08 if relocating else 0)
            if iv == HARSH:
                p *= .55
            passed = (not filled) and R.random() < p
            fb_days = between(4, 9) if iv == SLOW else between(0, 3)
            decided = held + timedelta(days=fb_days)
            score = between(3, 4) if filled else score_for(passed, iv == HARSH)
            fb = "Strong finalist, but the seats on this role are already filled. Keep warm for the next opening." if filled else pick(FEEDBACK["Pass" if passed else "Fail"][round_])
            if decided > TODAY:
                row.update(decided_at=None, feedback_days=None, score=None, result="Awaiting decision", feedback=None)
                c.update(status="Awaiting decision", status_changed_at=held)
                break
            row.update(decided_at=decided, feedback_days=fb_days, score=score, result="Pass" if passed else "Fail", feedback=fb)
            if not passed:
                close("Rejected", decided)
                break
            t, open_ = decided, True
        if open_:
            c.update(stage="Offer", stage_entered_at=t, status="To do", status_changed_at=t, next_round_at=None, next_interviewer=None)
            offer_at = t + timedelta(days=between(2, 5))
            if offer_at <= TODAY:
                c.update(offer_sent_at=offer_at, status="Awaiting decision", status_changed_at=offer_at)
                answer_at = offer_at + timedelta(days=between(2, 8))
                if answer_at <= TODAY:
                    if R.random() < (.92 if source == "Referral" else .78):
                        close("Hired", answer_at)
                        c["hired_at"] = answer_at
                        hires += 1
                    else:
                        close("Withdrawn", answer_at)
                        c["declined_offer"] = True

        # Derived fields the app reads directly
        held_types = {r["round_type"] for r in my_rounds if r["held_at"] is not None and r["result"] != "No-show"}
        steps = [True, "Screening" in held_types, "Technical" in held_types, "Culture" in held_types, "Final" in held_types,
                 c["offer_sent_at"] is not None, c["outcome"] == "Hired"]
        scored = [r["score"] for r in my_rounds if r.get("score") is not None]
        is_open = c["outcome"] is None
        days_in_status = (TODAY - c["status_changed_at"]).days if is_open else None
        stage_order = STAGES.index(c["stage"])
        if is_open:
            if c["stage"] == "Applied":
                detail = "CV to review"
            elif c["stage"] == "Offer":
                detail = "Offer being prepared" if c["status"] == "To do" else f"Offer sent {fmt(c['offer_sent_at'])}"
            elif c["status"] == "Scheduled":
                detail = f"{fmt(c['next_round_at'])} with {c['next_interviewer']}"
            elif c["status"] == "Awaiting decision":
                detail = f"Feedback from {my_rounds[-1]['interviewer']}"
            else:
                detail = "Not booked yet"
        else:
            detail = f"{'Accepted' if c['outcome'] == 'Hired' else 'Closed'} {fmt(c['closed_at'])}"
        c.update(
            stage_order=stage_order,
            status_order={"To do": 1, "Scheduled": 2, "Awaiting decision": 3}.get(c["status"]),
            reached_screening=steps[1], reached_technical=steps[2], reached_culture=steps[3], reached_final=steps[4],
            offer_sent=steps[5], hired=steps[6],
            furthest_step=max(i for i, s in enumerate(steps) if s),
            is_open=is_open, is_qualified=stage_order >= 4, is_decided=stage_order >= 4 or not is_open,
            days_in_status=days_in_status, stuck=bool(is_open and days_in_status > 7),
            status_detail=detail,
            days_to_hire=(c["hired_at"] - applied).days if c["hired_at"] else None,
            scored_rounds=len(scored), avg_score=round(sum(scored) / len(scored), 2) if scored else None,
            rank_score=round((sum(scored) + 3) / (len(scored) + 1), 3) if scored else None,  # one 5 counts for less than two
            rounds_passed=sum(1 for r in my_rounds if r["result"] == "Pass"),
        )
        candidates.append(c)
        for r in my_rounds:
            rid += 1
            rounds.append(dict(round_id=rid, candidate_id=c_id, interviewer_role=ROLE_OF.get(r["interviewer"]) if r["interviewer"] else None,
                               wait_bucket=wait_bucket(r["wait_days"]), withdrew=r["result"] == "Withdrew before interview", **r))
    filled = sum(1 for c in candidates if c["position_id"] == pos_id and c["outcome"] == "Hired")
    positions.append(dict(position_id=pos_id, title=title, department=dept, location=loc, hiring_manager=hm, opened_at=opened,
                          headcount=hc, seats_filled=min(hc, filled), is_open_role=filled < hc, backfill_seats=BACKFILL.get(pos_id, 0)))

# A few HR notes, the table that write-back will fill
nid = 0
for c in candidates:
    if c["is_open"] and R.random() < .22:
        nid += 1
        notes.append(dict(note_id=nid, candidate_id=c["candidate_id"], author=pick(SCREENERS),
                          created_at=min(TODAY, c["status_changed_at"] + timedelta(days=between(0, 4))), note=pick(NOTE_TEXT)))

# ---------------- Headcount: employees, leavers, the plan for Dec 31 and its forecast ----------------
# Drawn after everything above, so the hiring data is the same as without this section.
Y0, YEND = date(2026, 4, 1), date(2026, 12, 31)
DEPT_ORDER = ["Engineering", "Product", "Sales", "Customer Success", "Marketing", "Finance", "People"]
BASE_HC = {"Engineering": 46, "Product": 13, "Sales": 21, "Customer Success": 12, "Marketing": 8, "Finance": 6, "People": 5}  # on Apr 1
ATTR_RATE = {"Engineering": .24, "Product": .1, "Sales": .14, "Customer Success": .1, "Marketing": .08, "Finance": .06, "People": .06}  # a year
UNOPENED = {"Engineering": 5, "Sales": 1}  # seats in the approved plan with no role open yet
SPAN = (TODAY - Y0).days
DEPT_OF = {p[0]: p[2] for p in POSITIONS}

employees = []
for dp in DEPT_ORDER:
    leaving = round(BASE_HC[dp] * ATTR_RATE[dp] * SPAN / 365)  # leavers since Apr 1, at the department's yearly rate
    for i in range(BASE_HC[dp]):
        e = dict(employee_id=f"E-{len(employees) + 1}", department=dp, start_date=Y0 - timedelta(days=between(30, 1500)), end_date=None,
                 leave_reason=None, from_hire=False, candidate_id=None, position_id=None, is_backfill=False)
        if i < leaving:
            e.update(end_date=Y0 + timedelta(days=between(1, SPAN)), leave_reason="Voluntary" if R.random() < .75 else "Involuntary")
        employees.append(e)
hires_by_pos = {}
for c in sorted((c for c in candidates if c["outcome"] == "Hired"), key=lambda c: c["hired_at"]):  # a hire joins 2-6 weeks after accepting
    pid = c["position_id"]
    hires_by_pos[pid] = hires_by_pos.get(pid, 0) + 1
    employees.append(dict(employee_id=f"E-{len(employees) + 1}", department=DEPT_OF[pid], start_date=c["hired_at"] + timedelta(days=between(14, 42)),
                          end_date=None, leave_reason=None, from_hire=True, candidate_id=c["candidate_id"], position_id=pid,
                          is_backfill=hires_by_pos[pid] <= BACKFILL.get(pid, 0)))


def on_team(e, t):
    return e["start_date"] <= t and (e["end_date"] is None or e["end_date"] > t)


for e in employees:
    e.update(is_active=on_team(e, TODAY), is_signed=e["start_date"] > TODAY, active_apr1=on_team(e, Y0),
             left_since_apr1=e["end_date"] is not None and Y0 <= e["end_date"] <= TODAY)

# Each open candidate's chance of a hire: the share of decided candidates who reached their stage and were hired
# (per department when it has 15 or more, else overall), counted for Dec 31 only if the usual time from that stage
# to a hire fits before then
dept_c = lambda c: DEPT_OF[c["position_id"]]
decided_c = [c for c in candidates if c["outcome"]]
hired_c = [c for c in candidates if c["hired_at"]]
held = {}
for r in rounds:
    if r["held_at"] is not None:
        held[(r["candidate_id"], r["round_type"])] = r["held_at"]


def rate_for(dp, i):
    g = [c for c in decided_c if dept_c(c) == dp and c["stage_order"] >= i]
    if len(g) < 15:
        g = [c for c in decided_c if c["stage_order"] >= i]
    return sum(c["outcome"] == "Hired" for c in g) / len(g) if g else 0


def stage_date(c, i):
    return c["applied_at"] if i == 0 else c["offer_sent_at"] if i == 5 else held.get((c["candidate_id"], STAGES[i]))


def days_to_hire_from(dp, i):
    g = [c for c in hired_c if dept_c(c) == dp and stage_date(c, i)]
    if len(g) < 3:
        g = [c for c in hired_c if stage_date(c, i)]
    return median((c["hired_at"] - stage_date(c, i)).days for c in g) if g else 30


LEFT = (YEND - TODAY).days
for c in candidates:
    i = c["stage_order"]
    c["hire_chance"] = round(rate_for(dept_c(c), i), 4) if c["is_open"] else None
    c["counts_by_dec31"] = bool(c["is_open"] and days_to_hire_from(dept_c(c), i) <= LEFT)

SOURCES_OF_HIRES = ["Offer", "Final", "Culture", "Technical", "Screening", "Applied", "New applicants"]
plan, expected_rows, series = [], [], []
ENDS = [date(2026, 4, 1), date(2026, 4, 30), date(2026, 5, 31), date(2026, 6, 30), date(2026, 7, 31), date(2026, 8, 31), date(2026, 9, 30), TODAY,
        date(2026, 11, 30), YEND]
for order, dp in enumerate(DEPT_ORDER):
    emps = [e for e in employees if e["department"] == dp]
    now, signed = sum(e["is_active"] for e in emps), sum(e["is_signed"] for e in emps)
    open_seats = sum(max(0, p[6] - hires_by_pos.get(p[0], 0)) for p in POSITIONS if p[2] == dp)
    need = open_seats + UNOPENED.get(dp, 0)
    raw = {k: 0.0 for k in SOURCES_OF_HIRES}
    for c in candidates:
        if dept_c(c) == dp and c["counts_by_dec31"]:
            raw[STAGES[c["stage_order"]]] += c["hire_chance"]
    weekly = sum(1 for c in candidates if dept_c(c) == dp and c["applied_at"] > TODAY - timedelta(days=28)) / 4
    raw["New applicants"] = weekly * rate_for(dp, 0) * max(0, (LEFT - days_to_hire_from(dp, 0)) / 7)
    total = sum(raw.values())
    scale = min(1, open_seats / total) if total else 0  # only seats with a role open have candidates
    expected = total * scale
    for k_i, k in enumerate(SOURCES_OF_HIRES):
        expected_rows.append(dict(department=dp, source=k, source_order=k_i, expected=round(raw[k] * scale, 3)))
    at = lambda t: sum(on_team(e, t) for e in emps)
    plan.append(dict(department=dp, dept_order=order, plan_q2=at(date(2026, 6, 30)) + round(need * .25), plan_q3=at(date(2026, 9, 30)) + round(need * .45),
                     plan_dec31=now + signed + need, open_seats=open_seats, unopened_seats=UNOPENED.get(dp, 0)))
    avg_hc = (sum(e["active_apr1"] for e in emps) + now) / 2
    attr = sum(e["left_since_apr1"] for e in emps) / avg_hc * 365 / SPAN if avg_hc else 0
    for t in ENDS:  # actual to today, then the forecast: joiners, expected hires spread evenly, leavers at the yearly rate
        if t <= TODAY:
            series.append(dict(department=dp, as_of=t, series="Actual", headcount=float(at(t))))
        if t >= TODAY:
            f = (t - TODAY).days / LEFT
            joined = sum(1 for e in emps if TODAY < e["start_date"] <= t)
            series.append(dict(department=dp, as_of=t, series="Forecast", headcount=round(now + joined + expected * f - now * attr * (t - TODAY).days / 365, 2)))
    for t, v in [(date(2026, 6, 30), plan[-1]["plan_q2"]), (date(2026, 9, 30), plan[-1]["plan_q3"]), (YEND, plan[-1]["plan_dec31"])]:
        series.append(dict(department=dp, as_of=t, series="Plan", headcount=float(v)))

tables = {
    "positions": pd.DataFrame(positions),
    "candidates": pd.DataFrame(candidates),
    "interview_rounds": pd.DataFrame(rounds),
    "candidate_notes": pd.DataFrame(notes),
    "employees": pd.DataFrame(employees),
    "headcount_plan": pd.DataFrame(plan),
    "expected_hires": pd.DataFrame(expected_rows),
    "headcount_series": pd.DataFrame(series),
}
for df in tables.values():
    for col in df.columns:
        if col.endswith(("_at", "_date")) or col == "as_of":
            df[col] = pd.to_datetime(df[col])
DB.parent.mkdir(exist_ok=True)
tmp = DB.with_suffix(".duckdb.tmp")
tmp.unlink(missing_ok=True)
con = duckdb.connect(str(tmp))
for name, df in tables.items():
    con.register("df", df)
    con.execute(f"CREATE TABLE {name} AS SELECT * FROM df")
    con.unregister("df")
con.close()
tmp.replace(DB)

c_df = tables["candidates"]
print(f"{len(positions)} positions, {len(c_df)} candidates, {len(rounds)} rounds, {len(notes)} notes → {DB.relative_to(ROOT)}")
print(f"open {int(c_df.is_open.sum())} · hired {int(c_df.hired.sum())} · qualified {int(c_df.is_qualified.sum())} of {int(c_df.is_decided.sum())} decided")
med = median([r["feedback_days"] for r in rounds if r["interviewer"] == SLOW and r["feedback_days"] is not None])
print(f"{SLOW} median feedback days: {med}")
e_df, p_df = tables["employees"], tables["headcount_plan"]
print(f"{len(e_df)} employees · on the team {int(e_df.is_active.sum())} · signed {int(e_df.is_signed.sum())} · plan {int(p_df.plan_dec31.sum())}"
      f" · expected hires {tables['expected_hires'].expected.sum():.1f}")
