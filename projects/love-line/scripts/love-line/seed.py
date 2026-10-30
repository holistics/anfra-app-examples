# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2", "numpy>=2", "pandas>=2.2,<3"]
# ///
"""Build data/loveline.duckdb: synthetic dating-app activity for the Love Line app.

    uv run scripts/love-line/seed.py

15K invented people in Hanoi, Ho Chi Minh City and Da Nang, about 1M swipes over 12 weeks
(Jul 23 - Oct 14, 2026), the matches they made and how each chat went. Same output every run.
Message content exists only as categories plus invented example lines.

The story numbers are in docs/love-line/plan.md section 1. scripts/love-line/check.py prints each
beat next to its target. Where the plan's beats contradict each other, plan.md "As built" says
which one gave way.

How the data is made:
1. People, with stated preferences and a planned right-swipe rate (their pickiness).
2. Matches first: each person gets a number of matches from their pickiness; stubs are paired
   inside a city by age, then swapped locally so pairs mostly respect each other's rules.
   A match is two right swipes that point at the same match_id.
3. Every other profile a person sees is drawn near their stated age range; the swipe is right
   with a chance from their pickiness, the target's profile traits and the rules it breaks.
4. Each match's chat: opener, wait, reply, length, last words, off the app.
"""
from datetime import datetime, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

SEED = 20261015
ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "loveline.duckdb"

AS_OF = datetime(2026, 10, 15)  # the app's "now"
DAYS = 84  # 12 weeks of swipes
DAY0 = AS_OF - timedelta(days=DAYS)  # Jul 23

N_USERS = 15_000
CITIES = ["Hanoi", "Ho Chi Minh City", "Da Nang"]
CITY_P = [0.45, 0.40, 0.15]
CITY_KM = [9.0, 11.0, 6.0]  # mean distance to a profile seen
MAN_P = 0.52

# Pickiness: <15%, 15-40%, 40-70%, 70%+ right swipes. Planned rate ranges, mix per gender, and the
# share of a person's right swipes that become matches.
PICK_LABELS = ["<15%", "15–40%", "40–70%", "70%+"]
PICK_RHO = [(0.04, 0.13), (0.18, 0.37), (0.43, 0.67), (0.73, 0.92)]
PICK_MIX = {"woman": [0.26, 0.40, 0.26, 0.08], "man": [0.10, 0.28, 0.38, 0.24]}
PICK_MATCH = [0.404, 0.334, 0.241, 0.129]
RHO_SCALE = 0.935  # brings the overall right-swipe rate to 38%
CITY_MATCH = [1.0, 0.97, 1.22]  # Da Nang matches more...
CITY_MESSAGED = [0.625, 0.63, 0.51]  # ...but messages less
# Who says hi. Each side of a match says hi with a chance that falls as their pile of matches grows;
# the match gets a first message only if one of them does. Men send most first messages.
PILE_LABELS = ["1–3", "4–7", "8–12", "13+"]  # matches in the 12 weeks
PILE_EDGES = [4, 8, 13]
PILE_K = 0.8  # how fast the chance of saying hi falls with the pile
HELLO_MAN_SHARE = 0.64
WOMAN_SWIPES = 80  # mean profiles a woman sees; men's mean balances the match stubs

# Profile traits: label, kind, prevalence (women, men), right-swipe effect (log-odds-ish), 4-week trend.
TRAITS = [
    ("Cooking a meal", "helps", 0.20, 0.16, 0.324, 0.158),
    ("Dog photo", "helps", 0.22, 0.20, 0.336, 0.039),
    ("Reading a book", "helps", 0.24, 0.14, 0.17, 0.060),
    ("Asks a question", "helps", 0.28, 0.24, 0.141, 0.084),
    ("Travel photo", "helps", 0.40, 0.36, 0.044, -0.039),
    ("Gym selfie", "hurts", 0.10, 0.30, -0.07, -0.020),
    ("Sunglasses everywhere", "hurts", 0.22, 0.30, -0.303, -0.018),
    ("Group photo first", "hurts", 0.26, 0.28, -0.498, -0.103),
    ("Heavy filter", "hurts", 0.34, 0.08, -0.785, -0.12),
    ("Holding a fish", "hurts", 0.03, 0.20, -0.514, -0.096),
]

# Beats the right-swipe model is tuned to (plan.md section 1), in points.
TRAIT_LIFT = {"Cooking a meal": 7, "Dog photo": 6, "Reading a book": 5, "Asks a question": 3, "Travel photo": 1,
              "Gym selfie": -4, "Sunglasses everywhere": -6, "Group photo first": -8, "Heavy filter": -9, "Holding a fish": -12}
TRAIT_TREND = {"Cooking a meal": 2.1, "Dog photo": 0.8, "Reading a book": 1.4, "Asks a question": 0.9, "Travel photo": -0.3,
               "Gym selfie": -0.6, "Sunglasses everywhere": -0.2, "Group photo first": -1.1, "Heavy filter": -0.9, "Holding a fish": -1.8}
# % of right swipes that break each rule, (women, men). Men stretch age most; women hold the strictest height rule.
RULE_BREAKS = {"age": (12, 21), "height": (8, 1.2), "distance": (6, 6), "smoking": (6, 3), "education": (5, 4)}
# How far from their stated age range the app shows people.
AGE_SPREAD = {"woman": 3.6, "man": 4.4}
APP_FILTERS = 0.7  # chance the app swaps out a profile that breaks a height, smoking, education or distance rule

# Chats.
OPENERS = ["photo_question", "bio_reference", "pun", "gif", "hows_your_week", "looks_compliment", "just_hey"]
OPENER_P = [0.22, 0.18, 0.12, 0.10, 0.14, 0.09, 0.15]
OPENER_REPLY = [0.84, 0.75, 0.66, 0.45, 0.37, 0.28, 0.18]
OPENER_KEEP = [1.10, 1.10, 0.62, 0.90, 1.00, 0.85, 0.85]  # odds of reaching 5 messages, given a reply
WAIT = ["Within 1 hour", "1–6 hours", "6–24 hours", "1–3 days", "3+ days"]
WAIT_P = [0.35, 0.25, 0.20, 0.12, 0.08]
WAIT_HOURS = [(0.05, 1), (1, 6), (6, 24), (24, 72), (72, 160)]
WAIT_REPLY = [1.30, 1.11, 0.84, 0.53, 0.23]
REACH5_GIVEN_REPLY = 0.765
OFF_GIVEN_REACH5 = 0.30
LAST_WORDS = {  # category: (share of chats that died after a reply, example lines, affinity by length 2,3,4,5-9,10-19,20+)
    "haha": (0.24, ["haha yeah", "lol true", "hahaha same", "lmao"], [5, 3, 2, 1.2, 0.6, 0.4]),
    "double_text": (0.19, ["hey, you still there?", "guess you’re busy", "hello??", "did I say something weird"], [1, 3, 2, 1, 0.7, 0.5]),
    "plan_unconfirmed": (0.18, ["free thursday?", "coffee this weekend?", "we should get drinks sometime", "maybe next week then"], [0.1, 0.4, 0.6, 1, 2, 2]),
    "asked_instagram": (0.14, ["what’s your insta?", "easier on IG, what’s your handle", "do you have instagram?"], [0.2, 0.6, 0.8, 1.2, 1.5, 1]),
    "voice_note": (0.09, ["[voice note · 0:48]", "[voice note · 2:13]", "[voice note · 1:05]"], [0.3, 0.8, 1, 1.2, 1, 0.8]),
    "wall_of_text": (0.07, ["[a 312-word message about their ex]", "[a paragraph about crypto]", "[a long story about their landlord]"], [0.5, 1, 1, 1, 1, 0.8]),
    "other": (0.09, ["ok", "sounds good", "night!", "true"], [1, 1, 1, 1, 1, 1]),
}
DOUBLE_ANSWERED = 0.19
OFF_DAYS = ["Same day", "1–3 days", "4–7 days", "1–2 weeks", "2+ weeks"]
OFF_DAYS_P = [0.12, 0.36, 0.27, 0.17, 0.08]
OFF_DAYS_RANGE = [(0, 1), (1, 4), (4, 8), (8, 15), (15, 30)]
ASKED_BY_MAN = 0.62
DATE_RATE = {"man": 0.40, "woman": 0.64}
DELETED_SHARE = 0.18
DELETE_REASONS = ["Tired of it", "Met someone", "Taking a break"]
DELETE_P = [0.44, 0.31, 0.25]

NAMES = {
    "woman": ["Linh", "Mai", "Trang", "Thao", "Huong", "Ngoc", "Anh", "Ha", "Lan", "Vy", "Nhung", "Quynh", "Phuong", "Yen", "Hoa", "Giang"],
    "man": ["Minh", "Bao", "Khoa", "Huy", "Nam", "Duc", "Tuan", "Long", "Quang", "Hieu", "Phong", "Son", "Thanh", "Vinh", "Dat", "Tung"],
}


def band3(age):
    return np.select([age <= 24, age <= 34], ["18–24", "25–34"], "35+")


def band5(age):
    return np.select([age <= 22, age <= 26, age <= 30, age <= 35], ["18–22", "23–26", "27–30", "31–35"], "36+")


def build_users(rng):
    n = N_USERS
    g = np.where(rng.random(n) < MAN_P, "man", "woman")
    man = g == "man"
    city = rng.choice(3, n, p=CITY_P)
    b = rng.choice(3, n, p=[0.34, 0.48, 0.18])
    age = np.select([b == 0, b == 1], [rng.integers(18, 25, n), rng.integers(25, 35, n)], 35 + (rng.geometric(0.22, n) - 1) % 11)
    height = np.round(np.where(man, rng.normal(168.5, 6.5, n), rng.normal(157, 5.5, n))).astype(int)
    smoke_p = np.where(man[:, None], [0.55, 0.30, 0.15], [0.84, 0.13, 0.03])
    smoking = np.array(["never", "sometimes", "often"])[(rng.random(n)[:, None] > np.cumsum(smoke_p, 1)).sum(1)]
    edu = np.where(rng.random(n) < 0.63, "bachelors_plus", "below")
    # Stated preferences. Women look up in age, men look down.
    amin = np.where(man, age - rng.integers(5, 11, n), age - rng.integers(1, 4, n))
    amax = np.where(man, age + rng.integers(-1, 3, n), age + rng.integers(2, 7, n))
    amin = np.maximum(18, amin)
    amax = np.maximum(amin + 2, amax)
    hmin = np.where(~man & (rng.random(n) < 0.62), rng.choice([163, 165, 168, 170, 172], n, p=[0.15, 0.25, 0.25, 0.25, 0.10]), -1)
    hmax = np.where(man & (rng.random(n) < 0.30), height + rng.integers(-2, 4, n), -1)
    km = rng.choice([5, 10, 15, 25, 50], n, p=[0.15, 0.35, 0.25, 0.15, 0.10])
    non_smoker = rng.random(n) < np.where(man, 0.40, 0.66)
    degree = rng.random(n) < np.where(man, 0.25, 0.40)
    # Pickiness
    pb = np.where(man, rng.choice(4, n, p=PICK_MIX["man"]), rng.choice(4, n, p=PICK_MIX["woman"]))
    lo = np.array([r[0] for r in PICK_RHO])[pb]
    hi = np.array([r[1] for r in PICK_RHO])[pb]
    rho = (lo + rng.random(n) * (hi - lo)) * RHO_SCALE
    u = pd.DataFrame({
        "user_id": np.arange(1, n + 1), "gender": g, "age": age, "age_band": band3(age), "age_group": band5(age),
        "city_i": city, "city": np.array(CITIES)[city], "height_cm": height, "smoking": smoking, "education": edu,
        "pref_age_min": amin, "pref_age_max": amax, "pref_height_min": hmin, "pref_height_max": hmax,
        "pref_max_km": km, "pref_non_smoker": non_smoker, "pref_degree": degree, "pick": pb, "rho": rho,
    })
    u["name"] = np.where(man, rng.choice(NAMES["man"], n), rng.choice(NAMES["woman"], n))
    return u


def build_traits(rng, u):
    man = (u.gender == "man").to_numpy()
    has = np.zeros((len(u), len(TRAITS)), bool)
    for j, (_, _, pw, pm, _, _) in enumerate(TRAITS):
        has[:, j] = rng.random(len(u)) < np.where(man, pm, pw)
    return has


def rule_breaks(u, s, t, dist):
    """Which of swiper s's stated rules target t breaks. s, t: user row indices."""
    ta, th = u.age.to_numpy()[t], u.height_cm.to_numpy()[t]
    hmin, hmax = u.pref_height_min.to_numpy()[s], u.pref_height_max.to_numpy()[s]
    return {
        "age": (ta < u.pref_age_min.to_numpy()[s]) | (ta > u.pref_age_max.to_numpy()[s]),
        "height": ((hmin > 0) & (th < hmin)) | ((hmax > 0) & (th > hmax)),
        "distance": dist > u.pref_max_km.to_numpy()[s],
        "smoking": u.pref_non_smoker.to_numpy()[s] & (u.smoking.to_numpy()[t] != "never"),
        "education": u.pref_degree.to_numpy()[s] & (u.education.to_numpy()[t] == "below"),
    }


def n_breaks(br):
    return sum(v.astype(int) for v in br.values())


def build_pairs(rng, u):
    """Matches: (woman row, man row, distance). Each person's match count follows their pickiness."""
    man = (u.gender == "man").to_numpy()
    city = u.city_i.to_numpy()
    m_rate = np.array(PICK_MATCH)[u.pick] * np.array(CITY_MATCH)[city]
    dpn = m_rate * u.rho.to_numpy()  # matches per profile seen
    n = np.zeros(len(u))
    for c in range(3):
        w, m = (~man) & (city == c), man & (city == c)
        man_mean = WOMAN_SWIPES * dpn[w].sum() / dpn[m].sum()
        n[w] = WOMAN_SWIPES
        n[m] = man_mean
    n = np.maximum(15, np.round(n * rng.lognormal(-0.08, 0.4, len(u)))).astype(int)
    want = dpn * n
    d = (np.floor(want) + (rng.random(len(u)) < want % 1)).astype(int)

    W, M, C = [], [], []
    for c in range(3):
        wi, mi = np.flatnonzero((~man) & (city == c)), np.flatnonzero(man & (city == c))
        ws, ms = np.repeat(wi, d[wi]), np.repeat(mi, d[mi])
        k = min(len(ws), len(ms))
        ws, ms = rng.choice(ws, k, replace=False), rng.choice(ms, k, replace=False)
        age = u.age.to_numpy()
        ws = ws[np.argsort(age[ws] + 2.0 + rng.normal(0, 2.2, k), kind="stable")]
        ms = ms[np.argsort(age[ms] + rng.normal(0, 2.2, k), kind="stable")]
        W.append(ws), M.append(ms), C.append(np.full(k, c))
    W, M, C = np.concatenate(W), np.concatenate(M), np.concatenate(C)
    km = np.minimum(u.pref_max_km.to_numpy()[W], u.pref_max_km.to_numpy()[M])
    dist = np.round(np.where(rng.random(len(W)) < 0.9, rng.uniform(0.3, 1, len(W)) * km, rng.exponential(np.array(CITY_KM)[C])).clip(0.3, 60), 1)

    # Local swaps so matched pairs mostly respect each other's rules.
    age = u.age.to_numpy()
    cost = lambda w, m: n_breaks(rule_breaks(u, w, m, dist_now)) + n_breaks(rule_breaks(u, m, w, dist_now))
    for _ in range(6):
        for off in [1, 2, 3, 5, 8, 13, 21, 34, 55]:
            i = np.flatnonzero((np.arange(len(W) - off) // off) % 2 == 0)
            j = i + off
            ok = (C[i] == C[j]) & (np.abs(age[M[i]] - age[M[j]]) <= 4)
            i, j = i[ok], j[ok]
            dist_now = dist[i]
            before = cost(W[i], M[i])
            after = cost(W[i], M[j])
            dist_now = dist[j]
            before = before + cost(W[j], M[j])
            after = after + cost(W[j], M[i])
            sw = after < before
            mi_, mj_ = M[i[sw]].copy(), M[j[sw]].copy()
            M[i[sw]], M[j[sw]] = mj_, mi_
    key = W.astype(np.int64) * len(u) + M
    _, first = np.unique(key, return_index=True)
    first = np.sort(first)
    return W[first], M[first], dist[first], n


def build_unmatched(rng, u, n_seen, d_real):
    """Every profile seen that isn't a match: (swiper row, target row, distance)."""
    man = (u.gender == "man").to_numpy()
    city = u.city_i.to_numpy()
    age = u.age.to_numpy()
    center = (u.pref_age_min.to_numpy() + u.pref_age_max.to_numpy()) / 2
    k = np.maximum(5, n_seen - d_real)
    S, T, D = [], [], []
    for g_is_man in (False, True):
        for c in range(3):
            sw = np.flatnonzero((man == g_is_man) & (city == c))
            pool = np.flatnonzero((man != g_is_man) & (city == c))
            pool = pool[np.argsort(age[pool], kind="stable")]
            cnt = np.bincount(age[pool], minlength=60)
            start = np.concatenate([[0], np.cumsum(cnt)[:-1]])
            have = np.flatnonzero(cnt)
            nearest = have[np.abs(np.arange(60)[:, None] - have[None, :]).argmin(1)]
            s = np.repeat(sw, k[sw])
            spread = AGE_SPREAD["man" if g_is_man else "woman"]

            def draw(m):
                w = center[s[m]] + rng.normal(0, spread, m.sum())
                w = np.where(w < 17.5, 35 - w, np.where(w > 45.5, 91 - w, w))  # reflect at the app's age limits
                want = np.clip(np.round(w), 18, 45).astype(int)
                a = nearest[want]
                return pool[start[a] + (rng.random(m.sum()) * cnt[a]).astype(int)]

            t = draw(np.ones(len(s), bool))
            dist = np.round(np.clip(rng.exponential(CITY_KM[c], len(s)), 0.3, 60), 1)
            # The app mostly applies the swiper's filters: a profile that breaks one is usually swapped out.
            for _ in range(2):
                br = rule_breaks(u, s, t, dist)
                redo = (br["height"] | br["smoking"] | br["education"]) & (rng.random(len(s)) < APP_FILTERS)
                t[redo] = draw(redo)
                far = br["distance"] & (rng.random(len(s)) < APP_FILTERS * 0.55)
                dist[far] = np.round(rng.uniform(0.3, u.pref_max_km.to_numpy()[s[far]]), 1)
            S.append(s), T.append(t), D.append(dist)
    return np.concatenate(S), np.concatenate(T), np.concatenate(D)


def say_hi(rng, w_city, pile_w, pile_m):
    """Who says hi first, per match: the woman, the man, or nobody (index arrays of the pair's piles).

    Levels are solved so each city keeps its message rate and men send HELLO_MAN_SHARE of first messages.
    When both would say hi, either is equally likely to be first.
    """
    fall_w, fall_m = (pile_w / 6.0) ** -PILE_K, (pile_m / 6.0) ** -PILE_K
    target = np.array(CITY_MESSAGED)
    lvl, ratio = np.full(len(target), 0.4), 1.5
    for _ in range(80):
        pw = np.clip(lvl[w_city] * fall_w, 0, 0.95)
        pm = np.clip(lvl[w_city] * ratio * fall_m, 0, 0.95)
        pmsg = 1 - (1 - pw) * (1 - pm)
        lvl *= (target / np.bincount(w_city, pmsg, len(target)) * np.bincount(w_city, minlength=len(target))) ** 0.7
        ratio *= (HELLO_MAN_SHARE / ((pm * (1 - pw) + 0.5 * pm * pw).sum() / pmsg.sum())) ** 1.5
    hw, hm = rng.random(len(pw)) < pw, rng.random(len(pm)) < pm
    return hw | hm, hm & (~hw | (rng.random(len(pw)) < 0.5))


def build_chats(rng, n, messaged):
    """One row of chat outcomes per match (arrays of length n)."""
    opener = rng.choice(len(OPENERS), n, p=OPENER_P)
    wait = rng.choice(len(WAIT), n, p=WAIT_P)
    p_reply = np.clip(np.array(OPENER_REPLY)[opener] * np.array(WAIT_REPLY)[wait], 0, 0.97)
    replied = messaged & (rng.random(n) < p_reply)
    fast = replied & (rng.random(n) < np.where(wait <= 1, 0.66, 0.42))  # replies come within the hour
    keep = np.array(OPENER_KEEP)[opener] * np.where(fast, 1.12, 0.85)
    odds = REACH5_GIVEN_REPLY / (1 - REACH5_GIVEN_REPLY) * keep
    reach5 = replied & (rng.random(n) < odds / (1 + odds))
    off = reach5 & (rng.random(n) < OFF_GIVEN_REACH5 * np.where(fast, 1.18, 0.75))
    # Message counts. Puns that get a reply mostly end at "lol".
    count = np.zeros(n, int)
    count[messaged] = 1
    short = replied & ~reach5
    pun_lol = short & (opener == OPENERS.index("pun")) & (rng.random(n) < 0.75)
    count[short] = rng.choice([2, 3, 4], short.sum(), p=[0.22, 0.62, 0.16])
    count[pun_lol] = 2
    extra = np.where(fast, rng.geometric(1 / 26, n), rng.geometric(1 / 5.5, n)) - 1
    count[reach5] = np.minimum(240, 5 + extra[reach5])
    return messaged, opener, wait, replied, fast, reach5, off, count, pun_lol


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def right_chances(u, q, b_s, b_t, b_dist, tau, has, a_s, a_t, a_br, a_time):
    """Chance of a right swipe for each unmatched swipe.

    Log-odds = the person's own level + the target's traits (with a 4-week trend) − a penalty per
    rule the target breaks. The person's level is solved so their expected right rate is q. Trait
    effects, trends and penalties are then tuned on expected values until the beats land
    (TRAIT_LIFT, TRAIT_TREND, RULE_BREAKS). Matched swipes are always right and count too.
    """
    nu = len(u)
    man = (u.gender == "man").to_numpy()
    k = np.bincount(b_s, minlength=nu)
    hb = has[b_t].astype(float)  # unmatched swipes x traits
    ha = has[a_t].astype(float)
    br = rule_breaks(u, b_s, b_t, b_dist)
    rules = list(RULE_BREAKS)
    B = np.stack([br[r] for r in rules], 1).astype(float)  # unmatched x rules
    Ba = np.stack([a_br[r] for r in rules], 1).astype(float)
    g_b, g_a = man[b_s].astype(int), man[a_s].astype(int)  # 0 woman, 1 man
    ta = ((a_time - np.datetime64(DAY0)) / np.timedelta64(1, "D") - DAYS / 2 + 0.5) / 28
    win_b = [(tau >= -0.02) & (tau < 0.98), tau >= 0.98]  # prior 4 weeks, last 4 weeks
    win_a = [(ta >= -0.02) & (ta < 0.98), ta >= 0.98]
    lift_t = np.array([TRAIT_LIFT[t[0]] for t in TRAITS]) / 100
    trend_t = np.array([TRAIT_TREND[t[0]] for t in TRAITS]) / 100
    brk_t = np.array([[RULE_BREAKS[r][g] for r in rules] for g in (0, 1)]) / 100  # gender x rules
    beta = np.array([t[4] for t in TRAITS], float)
    slope = np.array([t[5] for t in TRAITS], float)
    pen = np.full((2, len(rules)), 1.0)
    c = np.log(q / (1 - q))
    n_all = len(b_s) + len(a_s)
    for it in range(40):
        x = hb @ beta + (hb * tau[:, None]) @ slope - (B * pen[g_b]).sum(1)
        for _ in range(8):
            sg = sigmoid(x + c[b_s])
            f = np.bincount(b_s, weights=sg, minlength=nu) - k * q
            fp = np.bincount(b_s, weights=sg * (1 - sg), minlength=nu)
            c -= f / np.maximum(fp, 1e-9)
        p = sigmoid(x + c[b_s])
        avg = (p.sum() + len(a_s)) / n_all
        rate = (hb.T @ p + ha.sum(0)) / (hb.sum(0) + ha.sum(0))
        lift = rate - avg
        prev = (hb.sum(0) + ha.sum(0)) / n_all
        d = lambda: 0.7 * avg * (1 - avg) * (1 - prev)
        beta += (lift_t - lift) / d()
        tr = []
        for wb, wa in zip(win_b, win_a):
            av = (p[wb].sum() + wa.sum()) / (wb.sum() + wa.sum())
            tr.append((hb[wb].T @ p[wb] + ha[wa].sum(0)) / (hb[wb].sum(0) + ha[wa].sum(0)) - av)
        slope += (trend_t - (tr[1] - tr[0])) / d()
        for g in (0, 1):
            rights = p[g_b == g].sum() + (g_a == g).sum()
            got = (B[g_b == g].T @ p[g_b == g] + Ba[g_a == g].sum(0)) / rights
            pen[g] += np.log(np.maximum(got, 1e-4) / brk_t[g]) * 0.8
        pen = np.clip(pen, 0, 8)
    print("calibrated: trait effects", np.round(beta, 2), "trends", np.round(slope, 3))
    print("            rule penalties (women, men)", dict(zip(rules, np.round(pen.T, 2).tolist())))
    return p


def main():
    rng = np.random.default_rng(SEED)
    u = build_users(rng)
    has = build_traits(rng, u)
    man = (u.gender == "man").to_numpy()
    city = u.city_i.to_numpy()
    nu = len(u)

    # --- Matches and their chats
    W, M, mdist, n_seen = build_pairs(rng, u)
    P = len(W)
    pile = np.bincount(np.concatenate([W, M]), minlength=nu)  # matches per person in the 12 weeks
    said_hi, first_is_man = say_hi(rng, city[W], pile[W], pile[M])
    messaged, opener, wait, replied, fast, reach5, off, count, pun_lol = build_chats(rng, P, said_hi)

    # Last words for chats that died after a reply: shares hit LAST_WORDS, categories lean on length.
    cats = list(LAST_WORDS)
    dead_replied = replied & ~off
    lb = np.digitize(count, [3, 4, 5, 10, 20])  # 0:2, 1:3, 2:4, 3:5-9, 4:10-19, 5:20+
    aff = np.array([LAST_WORDS[c][2] for c in cats], float).T[lb[dead_replied]]  # rows x cats
    target = np.array([LAST_WORDS[c][0] for c in cats])
    wts = target.copy()
    for _ in range(60):
        pr = aff * wts
        pr /= pr.sum(1, keepdims=True)
        wts *= target / pr.mean(0)
    pr = aff * wts
    pr /= pr.sum(1, keepdims=True)
    pr[pun_lol[dead_replied]] = np.eye(len(cats))[0]  # "lol", then nothing
    pick = (rng.random(len(pr))[:, None] > np.cumsum(pr, 1)).sum(1)
    last_type = np.full(P, None, object)
    last_type[messaged & ~replied] = "no_reply"
    last_type[off] = "moved_off_app"
    last_type[dead_replied] = np.array(cats)[np.minimum(pick, len(cats) - 1)]
    ex = {c: LAST_WORDS[c][1] for c in cats}
    last_words = np.full(P, None, object)
    for c in cats:
        sel = last_type == c
        last_words[sel] = rng.choice(ex[c], sel.sum())

    # Double texts: every "double text, no reply" ending, plus answered ones in chats that kept going.
    double = last_type == "double_text"
    answered_n = int(round(double.sum() * DOUBLE_ANSWERED / (1 - DOUBLE_ANSWERED)))
    cand = np.flatnonzero(replied & ~double & (count >= 4))
    ans = rng.choice(cand, answered_n, replace=False)
    double_texted = double.copy()
    double_texted[ans] = True
    double_answered = np.zeros(P, bool)
    double_answered[ans] = True

    # Who sent what. The first sender comes from say_hi.
    first_sender = np.where(first_is_man, M, W)
    other = np.where(first_is_man, W, M)
    last_sender = np.where(rng.random(P) < 0.5, first_sender, other)
    last_sender[last_type == "no_reply"] = first_sender[last_type == "no_reply"]

    # Features of the opener.
    feat_p = {  # P(feature) by opener
        "has_question": [0.95, 0.70, 0.30, 0.05, 0.95, 0.15, 0.10],
        "mentions_profile": [1.0, 1.0, 0.30, 0.05, 0.0, 0.30, 0.0],
        "length_ok": [0.88, 0.85, 0.70, 0.10, 0.60, 0.50, 0.0],
        "just_hey": [0, 0, 0, 0, 0, 0, 1.0],
        "emoji_heavy": [0.06, 0.07, 0.10, 0.20, 0.08, 0.30, 0.10],
        "about_looks": [0.04, 0.03, 0.05, 0.05, 0.02, 1.0, 0.0],
    }
    feats = {f: messaged & (rng.random(P) < np.array(p)[opener]) for f, p in feat_p.items()}

    # Timing. Durations first, then each match is placed so everything happens before AS_OF.
    lo = np.array([w[0] for w in WAIT_HOURS])[wait]
    hi = np.array([w[1] for w in WAIT_HOURS])[wait]
    first_h = lo + rng.random(P) * (hi - lo)
    gap_h = np.where(fast, rng.uniform(0.2, 1.0, P), rng.uniform(3, 14, P))
    chat_h = first_h + count * gap_h
    off_bucket = rng.choice(len(OFF_DAYS), P, p=OFF_DAYS_P)
    olo = np.array([r[0] for r in OFF_DAYS_RANGE])[off_bucket]
    ohi = np.array([r[1] for r in OFF_DAYS_RANGE])[off_bucket]
    off_days = olo + rng.random(P) * (ohi - olo)
    # A same-day swap needs a quick first message and quick replies.
    sameday = off & (off_bucket == 0)
    first_h[sameday] = np.minimum(first_h[sameday], rng.uniform(0.1, 3, sameday.sum()))
    off_h = np.where(off, np.maximum(off_days * 24, first_h + 0.5), 0)
    off_h[sameday] = np.minimum(np.maximum(off_h[sameday], first_h[sameday] + 0.5), 23.5)
    span_h = np.where(off, off_h, np.where(messaged, chat_h, 0))
    room = np.maximum(0.5, DAYS * 24 - span_h - 12)
    matched_h = 12 + rng.random(P) * (room - 12).clip(min=0)
    t0 = np.datetime64(DAY0)
    hrs = lambda h: (h * 3600).astype("timedelta64[s]")
    matched_at = t0 + hrs(matched_h)
    first_at = np.where(messaged, matched_at + hrs(first_h), np.datetime64("NaT"))
    last_at = np.where(off, matched_at + hrs(off_h), np.where(messaged, matched_at + hrs(chat_h), np.datetime64("NaT")))
    off_at = np.where(off, matched_at + hrs(off_h), np.datetime64("NaT"))
    off_days_real = np.floor(np.where(off, off_h / 24, np.nan))
    off_bucket_lbl = np.where(off, np.array(OFF_DAYS)[np.digitize(off_days_real, [1, 4, 8, 15])], None)
    asked_man = rng.random(P) < ASKED_BY_MAN
    led_to_date = off & (rng.random(P) < np.where(asked_man, DATE_RATE["man"], DATE_RATE["woman"]))

    match_id = np.arange(1, P + 1)
    matches = pd.DataFrame({
        "match_id": match_id, "matched_at": matched_at, "user_a": u.user_id.to_numpy()[W], "user_b": u.user_id.to_numpy()[M],
        "city": u.city.to_numpy()[W],
        "first_message_at": first_at,
        "first_sender_id": np.where(messaged, u.user_id.to_numpy()[first_sender], pd.NA),
        "hours_to_first_bucket": np.where(messaged, np.array(WAIT)[wait], None),
        "opener_type": np.where(messaged, np.array(OPENERS)[opener], None),
        **{f: np.where(messaged, v, pd.NA) for f, v in feats.items()},
        "got_reply": np.where(messaged, replied, pd.NA),
        "message_count": count,
        "alive_at_10": count >= 10,
        "reached_5": count >= 5,
        "last_message_type": last_type, "last_words": last_words,
        "last_sender_id": np.where(messaged, u.user_id.to_numpy()[last_sender], pd.NA),
        "last_message_at": last_at,
        "reply_within_hour": np.where(replied, fast, pd.NA),
        "double_texted": np.where(messaged, double_texted, pd.NA),
        "double_text_answered": np.where(double_texted, double_answered, pd.NA),
        "off_app_at": off_at, "days_to_off_app": off_days_real, "days_to_off_app_bucket": off_bucket_lbl,
        "asked_by_gender": np.where(off, np.where(asked_man, "man", "woman"), None),
        "led_to_date": np.where(off, led_to_date, pd.NA),
    })

    # --- Swipes. Matched pairs: two right swipes; the second one makes the match.
    w_first = rng.random(P) < 0.45
    lag = hrs(np.clip(rng.exponential(30, P), 0.1, matched_h - 0.05))
    a_s, a_t = np.concatenate([W, M]), np.concatenate([M, W])
    a_time = np.concatenate([np.where(w_first, matched_at - lag, matched_at), np.where(w_first, matched_at, matched_at - lag)])
    a_mid = np.concatenate([match_id, match_id])
    a_dist = np.concatenate([mdist, mdist])
    a_by = np.concatenate([np.where(messaged, np.where(first_is_man, "them", "you"), None),
                           np.where(messaged, np.where(first_is_man, "you", "them"), None)])  # W swipes, then M swipes

    d_real = np.bincount(np.concatenate([W, M]), minlength=nu)
    b_s, b_t, b_dist = build_unmatched(rng, u, n_seen, d_real)
    b_time = t0 + hrs(rng.random(len(b_s)) * DAYS * 24)
    # Drop repeats and anyone already matched with the swiper.
    key = np.concatenate([a_s, b_s]).astype(np.int64) * nu + np.concatenate([a_t, b_t])
    _, keep = np.unique(key, return_index=True)
    keep_b = np.sort(keep[keep >= len(a_s)]) - len(a_s)
    b_s, b_t, b_dist, b_time = b_s[keep_b], b_t[keep_b], b_dist[keep_b], b_time[keep_b]

    # Right swipes on the rest: the person's remaining right rate, the target's traits, broken rules.
    seen = np.bincount(b_s, minlength=nu) + d_real
    rho = u.rho.to_numpy()
    q = np.clip((rho * seen - d_real) / np.maximum(1, seen - d_real), 0.005, 0.97)
    tau = ((b_time - t0) / np.timedelta64(1, "D") - DAYS / 2 + 0.5) / 28
    a_br = rule_breaks(u, a_s, a_t, a_dist)
    p = right_chances(u, q, b_s, b_t, b_dist, tau, has, a_s, a_t, a_br, a_time)
    b_right = rng.random(len(b_s)) < p
    # A right swipe both ways would be a match: keep only one of the two right.
    rk = b_s[b_right].astype(np.int64) * nu + b_t[b_right]
    rev = b_t[b_right].astype(np.int64) * nu + b_s[b_right]
    clash = np.isin(rev, rk) & (b_s[b_right] > b_t[b_right])
    idx = np.flatnonzero(b_right)[clash]
    b_right[idx] = False

    s_all = np.concatenate([a_s, b_s])
    t_all = np.concatenate([a_t, b_t])
    dist_all = np.concatenate([a_dist, b_dist])
    order = np.argsort(np.concatenate([a_time, b_time]), kind="stable")
    br_all = rule_breaks(u, s_all, t_all, dist_all)
    swipes = pd.DataFrame({
        "swiped_at": np.concatenate([a_time, b_time]),
        "swiper_id": u.user_id.to_numpy()[s_all], "target_id": u.user_id.to_numpy()[t_all],
        "is_right": np.concatenate([np.ones(len(a_s), bool), b_right]),
        "distance_km": dist_all,
        "match_id": np.concatenate([a_mid, np.zeros(len(b_s), int)]),
        "first_message_by": np.concatenate([a_by, np.full(len(b_s), None, object)]),
        "target_gender": u.gender.to_numpy()[t_all], "target_age": u.age.to_numpy()[t_all],
        "target_age_band": u.age_band.to_numpy()[t_all], "target_age_group": u.age_group.to_numpy()[t_all],
        "target_height_cm": u.height_cm.to_numpy()[t_all], "target_smoking": u.smoking.to_numpy()[t_all],
        "target_education": u.education.to_numpy()[t_all],
        **{f"breaks_{r}": v for r, v in br_all.items()},
    }).iloc[order].reset_index(drop=True)
    swipes["breaks_any"] = swipes[[f"breaks_{r}" for r in br_all]].any(axis=1)
    swipes.insert(0, "swipe_id", np.arange(1, len(swipes) + 1))
    swipes["match_id"] = swipes.match_id.astype("Int64").replace(0, pd.NA)

    # swipe_traits: one row per swipe and trait of the profile seen.
    t_row = swipes.target_id.to_numpy() - 1
    sw_i, tr_i = np.nonzero(has[t_row])
    swipe_traits = pd.DataFrame({
        "swipe_id": swipes.swipe_id.to_numpy()[sw_i], "trait": np.array([t[0] for t in TRAITS])[tr_i],
        "trait_kind": np.array([t[1] for t in TRAITS])[tr_i],
        "is_right": swipes.is_right.to_numpy()[sw_i], "swiped_at": swipes.swiped_at.to_numpy()[sw_i],
    })
    ui, ti = np.nonzero(has)
    user_traits = pd.DataFrame({"user_id": u.user_id.to_numpy()[ui], "trait": np.array([t[0] for t in TRAITS])[ti],
                                "trait_kind": np.array([t[1] for t in TRAITS])[ti]})

    # --- Users: realised pickiness, signups, deletions.
    rr = swipes.groupby("swiper_id").is_right.mean().reindex(u.user_id).fillna(0).to_numpy()
    u["right_rate_bucket"] = np.array(PICK_LABELS)[np.digitize(rr, [0.15, 0.40, 0.70])]
    u["match_count"] = pile
    u["match_pile"] = np.where(pile > 0, np.array(PILE_LABELS)[np.digitize(pile, PILE_EDGES)], None)
    first_swipe = swipes.groupby("swiper_id").swiped_at.min().reindex(u.user_id).to_numpy()
    u["signed_up_at"] = first_swipe - hrs(rng.uniform(1, 24 * 400, nu))
    gone = rng.random(nu) < DELETED_SHARE
    last_swipe = swipes.groupby("swiper_id").swiped_at.max().reindex(u.user_id).to_numpy()
    room_h = np.maximum(1, (np.datetime64(AS_OF) - last_swipe) / np.timedelta64(1, "h"))
    u["deleted_at"] = np.where(gone, last_swipe + hrs(rng.random(nu) * room_h), np.datetime64("NaT"))
    u["delete_reason"] = np.where(gone, np.array(DELETE_REASONS)[rng.choice(3, nu, p=DELETE_P)], None)
    users = u[["user_id", "name", "gender", "age", "age_band", "age_group", "city", "signed_up_at", "height_cm", "smoking",
               "education", "pref_age_min", "pref_age_max", "pref_height_min", "pref_height_max", "pref_max_km",
               "pref_non_smoker", "pref_degree", "right_rate_bucket", "match_count", "match_pile", "deleted_at", "delete_reason"]].copy()
    users["pref_height_min"] = users.pref_height_min.where(users.pref_height_min > 0).astype("Int64")
    users["pref_height_max"] = users.pref_height_max.where(users.pref_height_max > 0).astype("Int64")

    DB.parent.mkdir(exist_ok=True)
    tmp = DB.with_suffix(".duckdb.tmp")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    for name, df in [("users", users), ("user_traits", user_traits), ("swipes", swipes), ("swipe_traits", swipe_traits), ("matches", matches)]:
        con.register("df", df)
        con.execute(f"CREATE TABLE {name} AS SELECT * FROM df")
        con.unregister("df")
        print(f"{name:13s} {len(df):>10,}")
    con.close()
    tmp.replace(DB)
    print(f"wrote {DB.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
