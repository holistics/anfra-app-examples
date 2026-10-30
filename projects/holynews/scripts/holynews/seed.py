# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2", "numpy>=2", "pandas>=2.2,<3"]
# ///
"""Build data/holynews.duckdb: synthetic Slack activity for the HolyNews app (HolyGood, a stand-in company).

    uv run scripts/holynews/seed.py

150 days of public-channel messages (May 19 - Oct 15, 2026, local time Asia/Ho_Chi_Minh), about
880K rows, plus the posts, reactions, summaries and club numbers the newspaper prints. Same output
on every run (fixed seed).

The story numbers come from the sketch, docs/holynews/reference/holynews-sketch.html: node evaluates its data block
(TOPICS with makeSeries, ANNOUNCEMENTS, DEALS, ...) so every topic's messages per day match the
sketch exactly, and the growth ranking in docs/holynews/plan.md section 1 holds for all three editions.
"""
import json
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

SEED = 20261015
ROOT = Path(__file__).resolve().parents[2]
SKETCH = ROOT / "docs" / "holynews" / "reference" / "holynews-sketch.html"
DB = ROOT / "data" / "holynews.duckdb"

AS_OF = date(2026, 10, 15)  # the app's "now": every edition ends on this day
N = 150
DAY0 = AS_OF - timedelta(days=N - 1)  # May 19

# Dateline totals and the share of positive messages ("office weather"), per edition.
EDITION_TOTALS = {1: 6_210, 7: 41_380, 30: 176_900}
EDITION_POSITIVE = {1: 0.66, 7: 0.64, 30: 0.55}
OLDER_POSITIVE = 0.58

TEAMS = {  # people per team, before this month's joiners
    "Engineering": 47, "Sales": 30, "Customer Success": 28, "Product": 16, "Data": 9,
    "Finance": 9, "Marketing": 9, "People Ops": 7, "Design": 7, "Leadership": 4,
}
OFFICES = ["Hanoi", "Ho Chi Minh City", "Singapore", "Remote"]
OFFICE_P = [0.42, 0.38, 0.12, 0.08]

# 42 public channels: (name, family, owning team)
CHANNELS = [
    ("#all-announce", "announce", "Company"), ("#all-general", "company", "Company"),
    ("#growth-announce", "announce", "Sales"), ("#product-announce", "announce", "Product"),
    ("#product", "work", "Product"), ("#design", "work", "Design"), ("#eng-frontend", "work", "Engineering"),
    ("#eng-backend", "work", "Engineering"), ("#eng-infra", "work", "Engineering"), ("#engineering", "work", "Engineering"),
    ("#eng-standup", "work", "Engineering"), ("#eng-reviews", "work", "Engineering"), ("#deploys", "work", "Engineering"),
    ("#incidents", "work", "Engineering"), ("#security", "work", "Engineering"), ("#qa", "work", "Engineering"),
    ("#mobile", "work", "Engineering"), ("#ai-team", "work", "Product"), ("#docs", "work", "Product"),
    ("#data", "work", "Data"), ("#analytics-eng", "work", "Data"), ("#sales", "work", "Sales"),
    ("#sales-apac", "work", "Sales"), ("#sales-emea", "work", "Sales"), ("#sales-americas", "work", "Sales"),
    ("#partnerships", "work", "Sales"), ("#cs-team", "work", "Customer Success"), ("#cs-renewals", "work", "Customer Success"),
    ("#support-escalations", "work", "Customer Success"), ("#customer-feedback", "work", "Customer Success"),
    ("#marketing", "work", "Marketing"), ("#finance", "work", "Finance"), ("#leadership", "work", "Leadership"),
    ("#people-ops", "work", "People Ops"), ("#hiring", "work", "People Ops"), ("#help-it", "work", "Workplace"),
    ("#food", "social", "Social"), ("#random", "social", "Social"), ("#bonding-film", "social", "Social"),
    ("#running", "social", "Social"), ("#boardgames", "social", "Social"), ("#pets", "social", "Social"),
]
# Extra channels a topic spreads to beyond the sketch's list, so its channel count can reach the sketch's nch.
EXTRA_CHANNELS = {
    "pricing": ["#sales-apac", "#cs-renewals"],
    "ai": ["#docs", "#customer-feedback"],
    "eu": ["#support-escalations", "#eng-backend", "#sales-emea", "#customer-feedback", "#help-it"],
}
TOPIC_IDS = ["dash", "pricing", "ai", "eu", "soc2", "oncall", "warehouse", "board", "keyboards", "standup", "deploys", "reviews"]
ALWAYS_ON_POOL = ["Engineering", "Product", "Data", "Design"]

FIRST = ["Anh", "Bao", "Chi", "Dung", "Giang", "Ha", "Hieu", "Hung", "Khanh", "Khoa", "Lam", "Long", "My", "Nam", "Ngoc",
         "Nhung", "Phuong", "Quan", "Son", "Thanh", "Thu", "Trang", "Trung", "Tu", "Uyen", "Viet", "Vy", "Xuan", "Yen",
         "Alex", "Ben", "Chloe", "Daniel", "Grace", "Jun", "Kai", "Leo", "Mei", "Nina", "Omar", "Ravi", "Sara", "Wei"]
LAST = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Vo", "Dang", "Bui", "Do", "Ho", "Ngo", "Duong", "Ly",
        "Tan", "Lim", "Wong", "Singh", "Kumar", "Chen", "Park", "Silva", "Brown"]
COLORS = ["#3B6FE0", "#0F7F55", "#B5482F", "#7A4FD0", "#0E7C86", "#C2410C", "#1D4ED8", "#9D174D", "#15803D",
          "#A16207", "#4338CA", "#BE123C", "#0369A1", "#6D28D9"]

# Images attached to posts (files in apps/holynews/holynews-photos/, credits in CREDITS.tsv there).
# Launches carry their own: rn-<img>.jpg, a still or screenshot from the real release note.
IMAGES = {
    "AI Tasks and AI Block are live for every customer": ("holynews-photos/rn-ai-block.jpg", "AI Block, from the release note video."),
    "The 2027 holiday calendar is out, with two extra days at Tết": ("holynews-photos/calendar-2027.svg", "The 2027 calendar, as attached to the post."),
    "Q3 results: our best quarter yet": ("holynews-photos/q3-chart.svg", "The Q3 revenue chart shared with the post."),
    "Da Nang offsite: dates and sign-up": ("holynews-photos/da-nang.jpg", "My Khe beach in Da Nang, from the sign-up post."),
    "Grass jelly for the whole office": ("holynews-photos/suong-sao.jpg", "Sương sáo for the office."),
    "House rules for the office espresso machine": ("holynews-photos/coffee-machine.jpg", "The office Breville, with the house rules labelled."),
    "Two cats, two office chairs, zero work done": ("holynews-photos/office-cats.jpg", "Two cats asleep on the office chairs."),
    "The Wagashi workshop for Mid-Autumn": ("holynews-photos/wagashi.jpg", "Shaping wagashi by hand (stock photo)."),
    "Team lunch: bún chả for twelve": ("holynews-photos/bun-cha.jpg", "Bún chả for twelve."),
    "Acme Corp": ("holynews-photos/deal-call.jpg", "The Acme Corp signing call, shared in #growth-announce."),
    "Northwind Logistics": ("holynews-photos/deal-call.jpg", "The Northwind Logistics kickoff call, shared in #growth-announce."),
}

# What the article says about each topic. The sketch's headline, dek and tldr are the week's;
# a few topics read differently on another edition.
SUMMARY_OVERRIDES = {
    ("eu", "day"): ("EU login outage: the last follow-ups", "Two weeks on, a handful of people are closing the postmortem's action items.",
                    ["The outage on Oct 2 is resolved; the postmortem is out.", "Certificate expiry alerts are live on every gateway.", "The status-page step is being added to the runbook."]),
    ("eu", "week"): ("The EU outage fades from the channels", "Talk about the Oct 2 login errors is down to a trickle as the fixes land.",
                     ["The outage on Oct 2 is resolved; the postmortem is out.", "Certificate expiry alerts are live on every gateway.", "The status-page step is being added to the runbook."]),
    ("dash", "month"): ("The new navigation lands at the end of a quiet month", "A month of design work stayed in a small group until the sidebar shipped today.",
                        ["The universal sidebar shipped today, announced in #product-announce.", "Most feedback is about where Dashboards and Data moved, and the missing black header.", "Design asks for screenshots in one thread to keep feedback in one place."]),
}
GENERIC_SUMMARY = {
    "keyboards": ("Mechanical keyboards take over #engineering", "Two engineers compared switches all week.", ["A long thread about tactile versus linear switches.", "Two people, one channel."]),
    "standup": ("Daily standups", "The usual morning updates in #eng-standup.", ["Posted every working day."]),
    "deploys": ("Deploy notices", "Automated and manual deploy notes in #deploys.", ["Posted with every release."]),
    "reviews": ("PR review requests", "Requests for code review in #eng-reviews.", ["Posted throughout the day."]),
}
THEMES_ALWAYS = {"standup": [["Yesterday and today", 70], ["Blockers", 30]], "deploys": [["Release notes", 60], ["Rollbacks", 10], ["Hotfixes", 30]],
                 "reviews": [["Review requests", 80], ["Approvals", 20]], "keyboards": [["Switches", 55], ["Keycaps", 45]]}
MOODS_ALWAYS = {"standup": [50, 45, 5], "deploys": [40, 55, 5], "reviews": [45, 50, 5], "keyboards": [80, 20, 0]}

EVENTS = [(date(2026, 10, 15), "All-hands", "Thursday 4pm, both offices"), (date(2026, 10, 20), "Offsite sign-up closes", "112 people signed up so far"),
          (date(2026, 10, 30), "SOC 2 access reviews due", "Every team lead"), (date(2026, 11, 2), "Hanoi office moves to floor 12", "Label your boxes"),
          (date(2026, 11, 7), "Da Nang offsite", "Nov 7 to 9 · 112 going")]

# Club totals per edition (sketch CLUBS): daily, weekly, monthly
CLUBS = {"#running": ("km logged", 38, 412, 1690), "#boardgames": ("game nights", 1, 3, 11), "#pets": ("photos", 6, 41, 156)}


def load_sketch() -> dict:
    """Evaluate the sketch's data constants in node and return them as JSON."""
    html = SKETCH.read_text()
    script = html.split("<script>", 1)[1].split("// ---------- helpers", 1)[0]
    js = script + """
    const topics = Object.fromEntries(Object.entries(TOPICS).map(([id, t]) => [id, {
      name: t.name, section: t.section, channels: t.channels, people: t.people, nch: t.nch, series: t.series,
      always: !!t.always, headline: t.headline || null, dek: t.dek || null, tldr: t.tldr || null,
      moments: t.moments || [], themes: t.themes || null, depts: t.depts || null, mood: t.mood || null }]));
    process.stdout.write(JSON.stringify({ topics, ANNOUNCEMENTS, JOINERS, DEALS, LAUNCHES, LEISURE, FILM, EMOJI }));
    """
    out = subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def day_of(i: int) -> date:
    return DAY0 + timedelta(days=i)


def ago(d: int) -> int:
    """Sketch 'd days before Oct 15' -> day index."""
    return N - 1 - d


def segment(i: int) -> int:
    """0 = today, 1 = rest of the week, 2 = rest of the month, 3 = older."""
    back = N - 1 - i
    return 0 if back == 0 else 1 if back < 7 else 2 if back < 30 else 3


def build_people(rng, sk) -> pd.DataFrame:
    rows, used = [], set()
    pid = 1
    for team, n in TEAMS.items():
        for _ in range(n):
            while True:
                name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                if name not in used:
                    break
            used.add(name)
            joined = date(2018, 3, 1) + timedelta(days=int(rng.integers(0, (DAY0 - timedelta(days=20) - date(2018, 3, 1)).days)))
            rows.append((pid, name, team, rng.choice(OFFICES, p=OFFICE_P), joined, None, COLORS[pid % len(COLORS)]))
            pid += 1
    for j in sk["JOINERS"]:
        avatar = f"holynews-photos/joiners/{j['avatar']}.jpg" if j.get("avatar") else None
        rows.append((pid, j["name"], j["team"], j["office"], AS_OF - timedelta(days=j["d"]), avatar, j["color"]))
        pid += 1
    return pd.DataFrame(rows, columns=["person_id", "display_name", "team", "office", "joined_at", "avatar_url", "avatar_color"])


def topic_pool(rng, people: pd.DataFrame, depts, size: int) -> list[int]:
    """size veterans, split across departments by the topic's shares, interleaved so any prefix keeps the mix."""
    vets = people[people.joined_at < DAY0]
    if not depts:
        depts = [[t, 25] for t in ALWAYS_ON_POOL]
    total = sum(s for _, s in depts)
    want = {t: round(size * s / total) for t, s in depts}
    picked = {}
    for t, k in want.items():
        ids = vets[vets.team == t].person_id.to_numpy().copy()
        rng.shuffle(ids)
        picked[t] = [int(p) for p in ids[:k]]
    taken = {p for v in picked.values() for p in v}
    # a department too small for its share: fill from the other listed departments, then anyone
    spill = [int(p) for t, _ in depts for p in vets[vets.team == t].person_id if p not in taken]
    others = [int(p) for p in vets.person_id if p not in taken and p not in spill]
    rng.shuffle(others)
    extra = (spill + others)[: max(0, size - len(taken))]
    keyed = []
    for t, ids in picked.items():
        keyed += [((k + 0.5) / max(len(ids), 1), p) for k, p in enumerate(ids)]
    keyed += [((k + 0.5) / max(len(extra), 1), p) for k, p in enumerate(extra)]
    keyed.sort()
    return [p for _, p in keyed][:size]


def assign_covering(rng, n_by_seg: dict, pool: list, limits: dict) -> dict:
    """For each segment, draw n values from pool[:limit], first covering pool[prev_limit:limit] once each,
    so the distinct count in today / this week / this month lands exactly on the sketch's numbers."""
    out, prev = {}, 0
    for seg in (0, 1, 2, 3):
        n, lim = n_by_seg[seg], limits[seg]
        must = pool[prev:lim] if seg < 3 else []
        vals = list(must[:n]) + list(rng.choice(pool[:lim], size=max(0, n - len(must))))
        vals = np.array(vals[:n]) if n else np.array([], dtype=int)
        rng.shuffle(vals)
        out[seg] = vals
        prev = lim if seg < 3 else prev
    return out


def times_for(rng, n: int, i: int) -> np.ndarray:
    """n local timestamps on day i, mostly working hours."""
    hours = rng.choice(np.arange(24), size=n, p=HOUR_P)
    secs = hours * 3600 + rng.integers(0, 3600, size=n)
    base = np.datetime64(day_of(i).isoformat())
    return base + secs.astype("timedelta64[s]")


HOUR_P = np.array([1, .5, .3, .2, .2, .3, .8, 2, 5, 9, 10, 9, 6, 7, 9, 10, 9, 7, 4, 3, 2.5, 2, 1.5, 1.2], dtype=float)
HOUR_P /= HOUR_P.sum()


def build_messages(rng, sk, people, channels):
    chan_id = dict(zip(channels.name, channels.channel_id))
    T = sk["topics"]
    frames, positives = [], np.zeros(4)
    topic_by_day = np.zeros(N, dtype=int)  # topic messages, then joiners' too: what chatter tops up
    for tid in TOPIC_IDS:
        t = T[tid]
        series = np.array(t["series"])
        topic_by_day += series
        chans = t["channels"] + EXTRA_CHANNELS.get(tid, [])
        ppl, nch = t["people"], t["nch"]
        p_lim = {0: ppl["daily"], 1: ppl["weekly"], 2: ppl["monthly"], 3: ppl["monthly"]}
        c_lim = {0: nch["daily"], 1: nch["weekly"], 2: nch["monthly"], 3: max(nch["monthly"], 1)}
        pool = topic_pool(rng, people, t["depts"], ppl["monthly"])
        seg_days = {s: [i for i in range(N) if segment(i) == s] for s in range(4)}
        n_by_seg = {s: int(series[seg_days[s]].sum()) for s in range(4)}
        authors = assign_covering(rng, n_by_seg, pool, p_lim)
        chan_pool = [chan_id[c] for c in chans]
        chans_by_seg = assign_covering(rng, n_by_seg, chan_pool, c_lim)
        themes = t["themes"] or THEMES_ALWAYS.get(tid)
        mood = np.array(t["mood"] or MOODS_ALWAYS[tid], dtype=float)
        for s in range(4):
            n = n_by_seg[s]
            if not n:
                continue
            days = np.repeat(seg_days[s], series[seg_days[s]])
            ts = np.concatenate([times_for(rng, int(series[i]), i) for i in seg_days[s] if series[i]])
            sent = rng.choice(["positive", "neutral", "negative"], size=n, p=mood / mood.sum())
            positives[s] += (sent == "positive").sum()
            th = rng.choice([x[0] for x in themes], size=n, p=np.array([x[1] for x in themes]) / sum(x[1] for x in themes))
            frames.append(pd.DataFrame({"sent_at": ts, "channel_id": chans_by_seg[s], "author_id": authors[s], "topic_id": tid,
                                        "theme": th, "sentiment": sent, "day": days}))

    # Chatter channels: everything public, the fun and company-wide ones busiest.
    social = channels[channels.family == "social"].channel_id.to_numpy()
    work = channels[channels.family != "social"].channel_id.to_numpy()
    ch_all = np.concatenate([work, social])
    ch_w = np.concatenate([np.full(len(work), 1.0), np.full(len(social), 1.6)])
    ch_w[list(ch_all).index(chan_id["#all-general"])] = 4
    ch_w[list(ch_all).index(chan_id["#random"])] = 5
    ch_w[list(ch_all).index(chan_id["#food"])] = 3
    ch_w /= ch_w.sum()
    # This month's joiners say hello and start posting after their first day (inside the dateline totals).
    for _, p in people[people.joined_at >= DAY0].iterrows():
        first = (p.joined_at - DAY0).days
        for i in range(first, N):
            n = int(rng.integers(2, 9)) if i > first else 2
            sent = rng.choice(["positive", "neutral"], size=n, p=[.7, .3])
            topic_by_day[i] += n
            positives[segment(i)] += (sent == "positive").sum()
            frames.append(pd.DataFrame({"sent_at": times_for(rng, n, i), "channel_id": rng.choice(ch_all, size=n, p=ch_w),
                                        "author_id": p.person_id, "topic_id": None, "theme": None,
                                        "sentiment": sent, "day": i}))
    # Untagged chatter fills each edition up to the dateline totals, with a weekday rhythm.
    weekday_w = np.array([1.0 if day_of(i).weekday() < 5 else 0.35 for i in range(N)])
    noise = 1 + (rng.random(N) - 0.5) * 0.12
    chatter = np.zeros(N, dtype=int)
    seg_total = {0: EDITION_TOTALS[1], 1: EDITION_TOTALS[7] - EDITION_TOTALS[1], 2: EDITION_TOTALS[30] - EDITION_TOTALS[7]}
    for s, total in seg_total.items():
        idx = [i for i in range(N) if segment(i) == s]
        budget = total - topic_by_day[idx].sum()
        w = weekday_w[idx] * noise[idx]
        alloc = np.floor(budget * w / w.sum()).astype(int)
        alloc[np.argmax(w)] += budget - alloc.sum()
        chatter[idx] = alloc
    old = [i for i in range(N) if segment(i) == 3]
    month_idx = [i for i in range(N) if segment(i) == 2]
    per_weekday = chatter[month_idx].sum() / weekday_w[month_idx].sum()
    chatter[old] = np.round(per_weekday * weekday_w[old] * noise[old] * 0.97).astype(int)
    assert chatter.min() > 300, chatter.min()

    vets = people[people.joined_at < DAY0].person_id.to_numpy()
    activity = rng.gamma(1.6, 1.0, size=len(vets))
    activity /= activity.sum()
    target_pos = {0: EDITION_POSITIVE[1] * EDITION_TOTALS[1],
                  1: EDITION_POSITIVE[7] * EDITION_TOTALS[7] - EDITION_POSITIVE[1] * EDITION_TOTALS[1],
                  2: EDITION_POSITIVE[30] * EDITION_TOTALS[30] - EDITION_POSITIVE[7] * EDITION_TOTALS[7]}
    for s in range(4):
        idx = [i for i in range(N) if segment(i) == s]
        n = int(chatter[idx].sum())
        days = np.repeat(idx, chatter[idx])
        ts = np.concatenate([times_for(rng, int(chatter[i]), i) for i in idx])
        seg_msgs = n + topic_by_day[idx].sum()
        want = target_pos[s] if s < 3 else OLDER_POSITIVE * seg_msgs
        k = int(round(want - positives[s]))
        assert 0 <= k <= n, (s, k, n)
        sent = np.array(["positive"] * k + list(rng.choice(["neutral", "negative"], size=n - k, p=[0.72, 0.28])))
        rng.shuffle(sent)
        frames.append(pd.DataFrame({"sent_at": ts, "channel_id": rng.choice(ch_all, size=n, p=ch_w),
                                    "author_id": rng.choice(vets, size=n, p=activity), "topic_id": None, "theme": None,
                                    "sentiment": sent, "day": days}))

    msgs = pd.concat(frames, ignore_index=True)
    return msgs


def build_posts(rng, sk, people, channels, msgs):
    """Posts are messages too: each one replaces a chatter message in its channel on its day, keeping the totals."""
    chan_id = dict(zip(channels.name, channels.channel_id))
    rows = []
    for a in sk["ANNOUNCEMENTS"]:
        rows.append(dict(kind="announcement", ch=a["ch"], d=a["d"], team=a["team"], title=a["title"], body=a["dek"],
                         topic_id=a.get("topic"), r=a["r"], replies=a["replies"]))
    for p in sk["LEISURE"]:
        rows.append(dict(kind="leisure", ch=p["ch"], d=p["d"], team="Social", title=p["title"], body=p["text"], r=p["r"], replies=p["replies"],
                         link=p.get("link")))
    for dl in sk["DEALS"]:
        rows.append(dict(kind="deal", ch="#growth-announce", d=dl["d"], team="Sales", title=f"{dl['name']} signs: {dl['type'].lower()}",
                         body=f"{dl['type']} in {dl['region']}, ${dl['arr']}k ARR.", r=[["🎉", dl["claps"]]], replies=int(dl["claps"] // 4),
                         deal_customer=dl["name"], deal_type=dl["type"], deal_arr=dl["arr"] * 1000, region=dl["region"]))
    for l in sk["LAUNCHES"]:
        rows.append(dict(kind="launch", ch="#product-announce", d=l["d"], team=l["team"], title=l["name"], body=l["desc"],
                         r=[["🚀", l["claps"]]], replies=int(l["claps"] // 5), link=f"https://docs.holistics.io/release-notes/{l['slug']}",
                         image=(f"holynews-photos/rn-{l['img']}.jpg", "From the release note.")))
    joiners = people[people.joined_at >= DAY0]
    for _, p in joiners.iterrows():
        d = (AS_OF - p.joined_at).days
        n = int(rng.integers(18, 46))
        rows.append(dict(kind="welcome", ch="#all-general", d=d, team="People Ops", title=f"Welcome {p.display_name}",
                         body=f"{p.display_name} joins {p.team} in {p.office}.", r=[["👋", n], ["🎉", n // 3]], replies=int(rng.integers(4, 15)),
                         welcome_person_id=int(p.person_id)))
    posts, reacts = [], []
    msgs["is_post"] = False
    for r in rows:
        i = ago(r["d"])
        cid = chan_id[r["ch"]]
        cand = msgs.index[(msgs.day == i) & (msgs.channel_id == cid) & msgs.topic_id.isna() & ~msgs.is_post]
        if len(cand) == 0:  # a quiet channel that day: take any chatter message and move it here
            cand = msgs.index[(msgs.day == i) & msgs.topic_id.isna() & ~msgs.is_post]
        k = int(rng.choice(cand))
        msgs.loc[k, ["channel_id", "is_post", "sentiment"]] = [cid, True, "positive"]
        hour = 9 + int(rng.integers(0, 8))
        msgs.loc[k, "sent_at"] = np.datetime64(day_of(i).isoformat()) + np.timedelta64(hour * 3600 + int(rng.integers(0, 3600)), "s")
        img = r.get("image") or IMAGES.get(r["title"]) or IMAGES.get(r.get("deal_customer"))
        posts.append(dict(row=k, kind=r["kind"], team=r["team"], title=r["title"], body=r["body"], topic_id=r.get("topic_id"),
                          image_url=img[0] if img else None, image_caption=img[1] if img else None,
                          deal_customer=r.get("deal_customer"), deal_type=r.get("deal_type"), deal_arr=r.get("deal_arr"),
                          region=r.get("region"), welcome_person_id=r.get("welcome_person_id"), reply_count=r["replies"], link=r.get("link")))
        for emoji, cnt in r["r"]:
            reacts.append(dict(row=k, emoji=emoji, count=int(cnt), day=i))
    return pd.DataFrame(posts), reacts


def calibrate_emoji(rng, sk, msgs, reacts):
    """Background reactions on chatter, so each edition's emoji ranking matches the sketch's (🔥 for the day and
    week, 🎉 for the month), scaled up where the posts alone already give more than the sketch printed."""
    post = pd.DataFrame(reacts)
    post["seg"] = post.day.map(segment)
    windows = {"daily": [0], "weekly": [0, 1], "monthly": [0, 1, 2]}
    target = {}
    for ed, segs in windows.items():
        have = post[post.seg.isin(segs)].groupby("emoji")["count"].sum()
        sk_e = dict(sk["EMOJI"][ed])
        scale = max(1.0, *[have.get(e, 0) / v * 1.08 for e, v in sk_e.items()])
        others = have[~have.index.isin(list(sk_e))]
        if len(others):  # emoji outside the sketch's top 5 must stay below 5th place
            scale = max(scale, others.max() / min(sk_e.values()) * 1.1)
        target[ed] = {e: int(round(v * scale)) for e, v in sk_e.items()}
    # per segment needs = window target minus what the smaller window and the posts already give
    out = []
    emojis = sorted({e for t in target.values() for e in t})
    prev = {e: 0 for e in emojis}
    for ed, seg in (("daily", 0), ("weekly", 1), ("monthly", 2)):
        segs = windows[ed]
        have = post[post.seg.isin(segs)].groupby("emoji")["count"].sum()
        for e in emojis:
            need = target[ed].get(e, 0) - have.get(e, 0) - prev[e]
            if ed != "daily" and e not in target[ed]:
                need = 0
            need = max(0, need)
            if need:
                out.append((seg, e, need))
            prev[e] += need
    rows = []
    chatter_by_seg = {s: msgs.index[msgs.topic_id.isna() & ~msgs.is_post & (msgs.day.map(segment) == s)].to_numpy() for s in range(4)}
    for seg, e, need in out:
        while need > 0:
            c = int(min(need, rng.integers(1, 9)))
            k = int(rng.choice(chatter_by_seg[seg]))
            rows.append(dict(row=k, emoji=e, count=c, day=int(msgs.day[k])))
            need -= c
    # older months: a light background so the table has history
    for _ in range(9000):
        k = int(rng.choice(chatter_by_seg[3]))
        rows.append(dict(row=k, emoji=rng.choice(["👍", "😂", "🎉", "🔥", "🙏", "👀", "❤️"]), count=int(rng.integers(1, 6)), day=int(msgs.day[k])))
    return rows, target


def main():
    rng = np.random.default_rng(SEED)
    sk = load_sketch()
    T = sk["topics"]

    channels = pd.DataFrame(CHANNELS, columns=["name", "family", "team"])
    channels["channel_id"] = [f"C0{(0x5A3F1C + k * 7919):07X}" for k in range(len(channels))]
    channels["permalink"] = "https://holygood.slack.example/archives/" + channels.channel_id
    channels = channels[["channel_id", "name", "family", "team", "permalink"]]
    assert len(channels) == 42

    people = build_people(rng, sk)
    topics = pd.DataFrame([(tid, T[tid]["name"], T[tid]["section"], T[tid]["always"]) for tid in TOPIC_IDS],
                          columns=["topic_id", "name", "section", "is_always_on"])

    msgs = build_messages(rng, sk, people, channels)
    posts, reacts = build_posts(rng, sk, people, channels, msgs)
    bg, emoji_target = calibrate_emoji(rng, sk, msgs, reacts)

    # message ids in time order
    msgs = msgs.sort_values(["sent_at", "channel_id"], kind="stable")
    msgs["message_id"] = np.arange(1, len(msgs) + 1)
    id_of_row = pd.Series(msgs.message_id.to_numpy(), index=msgs.index)
    msgs["is_reply"] = rng.random(len(msgs)) < 0.38
    msgs.loc[msgs.is_post, "is_reply"] = False
    posts["message_id"] = id_of_row[posts.row].to_numpy()
    reactions = pd.DataFrame(reacts + bg)
    reactions["message_id"] = id_of_row[reactions.row].to_numpy()
    reactions["reacted_on"] = reactions.day.map(day_of)
    reactions = reactions.groupby(["message_id", "emoji", "reacted_on"], as_index=False)["count"].sum()

    summaries = []
    for tid in TOPIC_IDS:
        t = T[tid]
        for grain in ("day", "week", "month"):
            if (tid, grain) in SUMMARY_OVERRIDES:
                h, dk, tl = SUMMARY_OVERRIDES[(tid, grain)]
            elif t["headline"]:
                h, dk, tl = t["headline"], t["dek"], t["tldr"] or [t["dek"]]
            else:
                h, dk, tl = GENERIC_SUMMARY[tid]
            summaries.append((tid, grain, AS_OF, h, dk, "\n".join(tl)))
    summaries = pd.DataFrame(summaries, columns=["topic_id", "grain", "edition_end", "headline", "dek", "tldr"])

    chan_id = dict(zip(channels.name, channels.channel_id))
    moments = []
    for tid in TOPIC_IDS:
        for k, (i, title, body) in enumerate(T[tid]["moments"]):
            ch = chan_id[T[tid]["channels"][0]]
            ts = int(datetime.combine(day_of(i), datetime.min.time()).timestamp()) + 36000 + k * 977
            moments.append((tid, day_of(i), title, body, f"https://holygood.slack.example/archives/{ch}/p{ts}{k:06d}"))
    moments = pd.DataFrame(moments, columns=["topic_id", "occurred_on", "title", "body", "permalink"])

    film = chan_id["#bonding-film"]
    polls = [(1, film, "Film club: what do we watch on Oct 16?", o, v, AS_OF) for o, v in sk["FILM"]["options"]]
    for k, (d, name, v) in enumerate(sk["FILM"]["past"]):
        closed = datetime.strptime(f"{d} 2026", "%b %d %Y").date()
        polls.append((2 + k, film, f"Film club: what do we watch on {d}?", name, v, closed))
        polls.append((2 + k, film, f"Film club: what do we watch on {d}?", "Runner-up", max(3, v - 6 - k), closed))
    polls = pd.DataFrame(polls, columns=["poll_id", "channel_id", "question", "option", "votes", "closed_on"])

    clubs = []
    for ch, (metric, d1, d7, d30) in CLUBS.items():
        vals = np.zeros(N)
        for s, total in ((0, d1), (1, d7 - d1), (2, d30 - d7)):
            idx = [i for i in range(N) if segment(i) == s]
            w = rng.random(len(idx)) + 0.3
            alloc = np.floor(total * w / w.sum())
            alloc[np.argmax(w)] += total - alloc.sum()
            vals[idx] = alloc
        older = [i for i in range(N) if segment(i) == 3]
        vals[older] = np.round(rng.random(len(older)) * 2 * d30 / 30)
        clubs += [(chan_id[ch], day_of(i), metric, float(vals[i])) for i in range(N) if vals[i]]
    clubs = pd.DataFrame(clubs, columns=["channel_id", "day", "metric", "value"])
    events = pd.DataFrame(EVENTS, columns=["day", "title", "note"])

    msgs["sent_at"] = pd.to_datetime(msgs.sent_at)
    messages = msgs[["message_id", "sent_at", "channel_id", "author_id", "topic_id", "theme", "sentiment", "is_reply"]]
    posts_out = posts[["message_id", "kind", "team", "title", "body", "topic_id", "image_url", "image_caption", "deal_customer",
                       "deal_type", "deal_arr", "region", "welcome_person_id", "reply_count"]]

    DB.parent.mkdir(exist_ok=True)
    tmp = DB.with_suffix(".duckdb.tmp")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    for name, df in [("channels", channels), ("people", people), ("topics", topics), ("posts", posts_out), ("reactions", reactions),
                     ("topic_summaries", summaries), ("topic_moments", moments), ("polls", polls), ("club_activity", clubs), ("events", events)]:
        con.register("df", df)
        con.execute(f"CREATE TABLE {name} AS SELECT * FROM df")
        con.unregister("df")
    con.register("df", messages)
    # a reply belongs to the latest thread start before it in its channel; permalinks are shaped like Slack's
    con.execute("""
        CREATE TABLE messages AS
        SELECT message_id, sent_at, CAST(sent_at AS DATE) AS sent_on, channel_id, author_id, topic_id, theme, sentiment,
               CASE WHEN is_reply THEN max(CASE WHEN NOT is_reply THEN message_id END)
                    OVER (PARTITION BY channel_id ORDER BY message_id ROWS UNBOUNDED PRECEDING) END AS thread_id,
               is_reply,
               'https://holygood.slack.example/archives/' || channel_id || '/p' || CAST(epoch(sent_at) AS BIGINT)
                 || lpad(CAST(message_id % 1000000 AS VARCHAR), 6, '0') AS permalink
        FROM df ORDER BY message_id
    """)
    con.execute("UPDATE messages SET is_reply = false WHERE thread_id IS NULL")
    # real posts keep their real link: a Slack permalink, or the release note for a launch
    con.register("links", posts.loc[posts.link.notna(), ["message_id", "link"]])
    con.execute("UPDATE messages SET permalink = links.link FROM links WHERE messages.message_id = links.message_id")
    con.unregister("links")
    con.unregister("df")
    con.close()
    tmp.replace(DB)
    print(f"wrote {len(messages):,} messages, {len(posts_out)} posts, {len(reactions):,} reaction rows to {DB.relative_to(ROOT)}")
    print("emoji targets:", json.dumps(emoji_target, ensure_ascii=False))


if __name__ == "__main__":
    main()
