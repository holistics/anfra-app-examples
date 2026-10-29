#!/usr/bin/env python3
"""Seed synthetic football data as CSVs under data/.

Stdlib only, deterministic (seeded). Re-run to regenerate identically.
Usage: python3 scripts/seed.py [--now 2026-10-14T12:00:00Z] [--out data]
"""
import argparse
import csv
import math
import os
import random
from datetime import datetime, timedelta, timezone

SEED = 42
FORM_WINDOW = 5

LEAGUES = [
    (1, "Premier League", "England", 1, [
        "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea",
        "Coventry City", "Crystal Palace", "Everton", "Fulham", "Leeds United", "Liverpool",
        "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest",
        "Sunderland", "Tottenham Hotspur", "West Ham United", "Wolverhampton"]),
    (2, "Serie A", "Italy", 2, [
        "AC Milan", "Atalanta", "Bologna", "Cagliari", "Como", "Cremonese", "Fiorentina",
        "Genoa", "Inter", "Juventus", "Lazio", "Lecce", "Napoli", "Parma", "Pisa", "Roma",
        "Sassuolo", "Torino", "Udinese", "Venezia"]),
    (3, "La Liga", "Spain", 3, [
        "Alaves", "Athletic Club", "Atletico Madrid", "Barcelona", "Celta Vigo", "Elche",
        "Espanyol", "Getafe", "Girona", "Levante", "Mallorca", "Osasuna", "Rayo Vallecano",
        "Real Betis", "Real Madrid", "Real Oviedo", "Real Sociedad", "Sevilla", "Valencia",
        "Villarreal"]),
]

FORMATIONS = ["4-3-3", "4-2-3-1", "3-5-2", "4-4-2", "3-4-2-1", "4-1-4-1"]
FIRST = ["Liam", "Noah", "Mateo", "Luca", "Kai", "Theo", "Ezra", "Leo", "Nico", "Jude", "Milo",
         "Ivan", "Pablo", "Diego", "Marco", "Enzo", "Hugo", "Rafael", "Tomas", "Bruno", "Ousmane",
         "Amadou", "Yusuf", "Kenan", "Samuel", "Jordan", "Callum", "Harvey", "Oscar", "Felix",
         "Adrien", "Jules", "Moussa", "Ibrahim", "Andrea", "Lorenzo", "Matteo", "Davide", "Alvaro",
         "Sergio", "Iker", "Unai", "Mikel", "Joao", "Tiago", "Ruben", "Dani", "Carlos", "Emil"]
LAST = ["Rushworth", "Pinnock", "Thomas", "Mfuni", "Ewijk", "Frank", "Grimes", "Dasilva", "Rudoni",
        "Mason-Clark", "Wissa", "Osula", "Pardo", "Amenda", "Awoniyi", "Okafor", "Ndiaye", "Silva",
        "Costa", "Moreno", "Ferrari", "Romano", "Greco", "Conti", "Bianchi", "Esposito", "Russo",
        "Fischer", "Weber", "Schulz", "Lindqvist", "Berg", "Nilsen", "Hansen", "Jansen", "Vos",
        "Bakker", "Dubois", "Lambert", "Fontaine", "Marchand", "Kovac", "Horvat", "Novak", "Zima",
        "Duarte", "Ramos", "Vargas", "Ortega", "Delgado", "Ibarra", "Salcedo", "Quintero", "Mendes"]
INJURIES = ["Calf Injury", "Hamstring", "Ankle Knock", "Knee Ligament", "Groin Strain", "Illness",
            "Concussion", "Back Problem"]
VENUES = {"England": "{} Stadium", "Italy": "Stadio {}", "Spain": "Estadio {}"}

rng = random.Random(SEED)


def poisson(lam):
    # Knuth; fine for lam < 15
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def formation_slots(formation):
    """GK + lines; returns list of (position, line_index) for 11 starters."""
    lines = [int(x) for x in formation.split("-")]
    slots = [("GK", 0)]
    n = len(lines)
    for i, count in enumerate(lines):
        if i == 0:
            pos = "DF"
        elif i == n - 1:
            pos = "FW"
        else:
            pos = "MF"
        slots += [(pos, i + 1)] * count
    return slots


def build(now, out):
    leagues, teams, players = [], [], []
    team_players = {}
    hidden = {}  # team_id -> (attack, defence) multipliers around 1.0
    tid, pid = 0, 0
    for lid, name, country, order, names in LEAGUES:
        leagues.append(dict(id=lid, name=name, country=country, sort_order=order))
        for i, tname in enumerate(names):
            tid += 1
            strength = rng.gauss(0, 0.28)
            hidden[tid] = (math.exp(strength), math.exp(-strength * 0.8 + rng.gauss(0, 0.1)))
            short = "".join(w[0] for w in tname.split())[:3].upper() if len(tname.split()) > 1 else tname[:3].upper()
            coach = f"{rng.choice('ABCDEFGHJKLMPRST')}. {rng.choice(LAST)}"
            teams.append(dict(id=tid, league_id=lid, name=tname, short_name=short, crest_url="",
                              primary_color=f"#{rng.randrange(0x202020, 0xC0C0C0):06x}",
                              coach=coach, formation=rng.choice(FORMATIONS),
                              venue=VENUES[country].format(tname.split()[0])))
            squad = []
            numbers = list(range(1, 40))
            rng.shuffle(numbers)
            # 3 GK, 8 DF, 8 MF, 6 FW
            for pos, count in (("GK", 3), ("DF", 8), ("MF", 8), ("FW", 6)):
                for k in range(count):
                    pid += 1
                    quality = max(0.3, rng.gauss(1.0, 0.25)) * (1.15 if k < (count // 2 + 1) else 0.9)
                    players.append(dict(id=pid, team_id=tid, name=f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                                        position=pos, shirt_number=numbers.pop(), age=rng.randint(18, 34),
                                        is_captain=0, quality=round(quality, 3)))
                    squad.append(players[-1])
            rng.choice([p for p in squad if p["position"] != "GK"])["is_captain"] = 1
            team_players[tid] = squad

    # Fixtures: two seasons of double round robin; the current season stops ~2 weeks after now
    SEASONS = [("2025-26", datetime(2025, 8, 16, tzinfo=timezone.utc)), ("2026-27", datetime(2026, 8, 15, tzinfo=timezone.utc))]
    matches, events, lineups, team_matches, availability, odds = [], [], [], [], [], []
    mid, eid, lid_, tmid, aid, oid = 0, 0, 0, 0, 0, 0
    unavailable = {}  # team_id -> {player_id: (status, reason, since, until_gidx)}
    last_starters = {}
    snapshotted = set()
    gidx = 0  # global round index across seasons, for absence expiry

    for season, season_start in SEASONS:
      for league in leagues:
        lteams = [t for t in teams if t["league_id"] == league["id"]]
        ids = [t["id"] for t in lteams]
        n = len(ids)
        # circle method round robin, then the return legs with venues swapped
        rounds = []
        arr = ids[:]
        for r in range(n - 1):
            pairs = []
            for i in range(n // 2):
                a, b = arr[i], arr[n - 1 - i]
                pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
            rounds.append(pairs)
            arr = [arr[0]] + [arr[-1]] + arr[1:-1]
        rounds += [[(b, a) for a, b in pairs] for pairs in rounds]
        league_avg = 1.35  # goals per team per match
        round_no = 0
        for pairs in rounds:
            round_no += 1
            gidx = (SEASONS.index((season, season_start))) * 100 + round_no
            base = season_start + timedelta(days=7 * (round_no - 1))
            if base > now + timedelta(days=16):
                break
            day_slots = [(0, 14), (0, 16, 30), (1, 14), (1, 19), (2, 20), (3, 19), (4, 17, 30), (4, 20), (5, 19), (6, 20)]
            rng.shuffle(day_slots)
            for idx, (home, away) in enumerate(pairs):
                slot = day_slots[idx % len(day_slots)]
                kick = base + timedelta(days=slot[0], hours=slot[1], minutes=(slot[2] if len(slot) > 2 else 0))
                if league["id"] == 2:
                    kick += timedelta(hours=1)
                mid += 1
                finished = kick < now
                hteam = next(t for t in teams if t["id"] == home)
                m = dict(id=mid, season=season, league_id=league["id"], round=round_no, kickoff_at=iso(kick),
                         home_team_id=home, away_team_id=away, venue=hteam["venue"],
                         status="finished" if finished else "upcoming",
                         home_goals="", away_goals="", ht_home="", ht_away="",
                         home_corners="", away_corners="", attendance="")
                # availability snapshot for this match (injuries carry across rounds)
                for side in (home, away):
                    unavailable.setdefault(side, {})
                    # expire
                    for p_id in [p for p, v in unavailable[side].items() if v[3] < gidx]:
                        del unavailable[side][p_id]
                    # new random injury with 25% chance per team per round
                    if rng.random() < 0.25:
                        p = rng.choice(team_players[side])
                        if p["id"] not in unavailable[side]:
                            unavailable[side][p["id"]] = ("injured", rng.choice(INJURIES), iso(kick - timedelta(days=rng.randint(1, 20))), gidx + rng.randint(0, 4))
                # availability snapshot: what is known at each team's first upcoming match
                for side in (home, away):
                    if not finished and side not in snapshotted:
                        snapshotted.add(side)
                        for p_id, (status, reason, since, until_round) in unavailable[side].items():
                            aid += 1
                            availability.append(dict(id=aid, team_id=side, player_id=p_id, status=status, reason=reason,
                                                     since=since, expected_return_round=until_round % 100))
                # lineups
                starters_by_side = {}
                for side, is_home in ((home, 1), (away, 0)):
                    team = next(t for t in teams if t["id"] == side)
                    formation = team["formation"]
                    slots = formation_slots(formation)
                    avail = [p for p in team_players[side] if p["id"] not in unavailable[side]]
                    starters = []
                    for pos, _ in slots:
                        pool = sorted([p for p in avail if p["position"] == pos and p not in starters], key=lambda p: -p["quality"] * rng.uniform(0.85, 1.15))
                        if not pool:
                            pool = sorted([p for p in avail if p not in starters], key=lambda p: -p["quality"])
                        starters.append(pool[0])
                    bench = [p for p in avail if p not in starters][:7]
                    starters_by_side[side] = starters
                    last_starters[side] = starters
                    for order, (p, (pos, _)) in enumerate(zip(starters, slots)):
                        lid_ += 1
                        lineups.append(dict(id=lid_, match_id=mid, team_id=side, player_id=p["id"], is_starter=1,
                                            position=pos, slot_order=order, formation=formation,
                                            is_predicted=0 if finished else 1))
                    for order, p in enumerate(bench):
                        lid_ += 1
                        lineups.append(dict(id=lid_, match_id=mid, team_id=side, player_id=p["id"], is_starter=0,
                                            position=p["position"], slot_order=11 + order, formation=formation,
                                            is_predicted=0 if finished else 1))
                # true probabilities from hidden strengths (for odds and simulation)
                ha, hd = hidden[home]
                aa, ad = hidden[away]
                lam_h = league_avg * ha * ad * 1.18
                lam_a = league_avg * aa * hd * 0.92
                # odds captures: 3 snapshots before kickoff
                grid = [[math.exp(-lam_h) * lam_h ** i / math.factorial(i) * math.exp(-lam_a) * lam_a ** j / math.factorial(j) for j in range(8)] for i in range(8)]
                ph = sum(grid[i][j] for i in range(8) for j in range(8) if i > j)
                pd = sum(grid[i][i] for i in range(8))
                pa = 1 - ph - pd
                po = sum(grid[i][j] for i in range(8) for j in range(8) if i + j >= 3)
                for k, hours in enumerate((48, 24, 6)):
                    cap = kick - timedelta(hours=hours)
                    if cap > now:
                        continue
                    noise = [rng.gauss(0, 0.02) for _ in range(3)]
                    raw = [max(0.03, ph + noise[0]), max(0.03, pd + noise[1]), max(0.03, pa + noise[2])]
                    s = sum(raw)
                    oid += 1
                    odds.append(dict(id=oid, match_id=mid, bookmaker="SportyBet", captured_at=iso(cap),
                                     p_home=round(raw[0] / s, 4), p_draw=round(raw[1] / s, 4), p_away=round(raw[2] / s, 4),
                                     p_over25=round(min(0.95, max(0.05, po + rng.gauss(0, 0.03))), 4)))
                # simulate result
                hg = ag = hth = hta = 0
                hc = ac = hy = ay = hr = ar = 0
                if finished:
                    hg, ag = poisson(lam_h), poisson(lam_a)
                    hc, ac = poisson(5.2 * ha), poisson(4.6 * aa)
                    m["attendance"] = rng.randint(12000, 75000)
                    for side, goals in ((home, hg), (away, ag)):
                        starters = starters_by_side[side]
                        weights = [p["quality"] * {"GK": 0.01, "DF": 0.35, "MF": 1.0, "FW": 2.4}[p["position"]] for p in starters]
                        minutes = sorted(rng.randint(1, 93) for _ in range(goals))
                        for minute in minutes:
                            scorer = rng.choices(starters, weights)[0]
                            eid += 1
                            events.append(dict(id=eid, match_id=mid, team_id=side, player_id=scorer["id"], minute=minute, type="goal", detail=""))
                            if minute <= 45:
                                if side == home:
                                    hth += 1
                                else:
                                    hta += 1
                        # cards
                        for p in starters:
                            r = rng.random()
                            if r < 0.14:
                                eid += 1
                                events.append(dict(id=eid, match_id=mid, team_id=side, player_id=p["id"], minute=rng.randint(10, 90), type="yellow", detail=""))
                                if side == home:
                                    hy += 1
                                else:
                                    ay += 1
                            elif r < 0.155:
                                eid += 1
                                events.append(dict(id=eid, match_id=mid, team_id=side, player_id=p["id"], minute=rng.randint(30, 90), type="red", detail="Straight red"))
                                if side == home:
                                    hr += 1
                                else:
                                    ar += 1
                                unavailable[side][p["id"]] = ("suspended", "Red Card Suspension", iso(kick), gidx + 1)
                        # subs
                        bench_ids = [l["player_id"] for l in lineups[-36:] if l["match_id"] == mid and l["team_id"] == side and not l["is_starter"]]
                        for k in range(3):
                            off = rng.choice([p for p in starters if p["position"] != "GK"])
                            eid += 1
                            events.append(dict(id=eid, match_id=mid, team_id=side, player_id=bench_ids[k], minute=rng.randint(55, 88), type="sub", detail=f"on for {off['name']}"))
                    m.update(home_goals=hg, away_goals=ag, ht_home=hth, ht_away=hta, home_corners=hc, away_corners=ac)
                matches.append(m)
                for side, opp, is_home, gf, ga, cf, ca, y, r in ((home, away, 1, hg, ag, hc, ac, hy, hr), (away, home, 0, ag, hg, ac, hc, ay, ar)):
                    tmid += 1
                    res = "" if not finished else ("W" if gf > ga else "D" if gf == ga else "L")
                    team_matches.append(dict(id=tmid, match_id=mid, team_id=side, opponent_id=opp, is_home=is_home,
                                             season=season, league_id=league["id"], kickoff_at=m["kickoff_at"], status=m["status"],
                                             goals_for=gf if finished else "", goals_against=ga if finished else "",
                                             result=res, corners_for=cf if finished else "", corners_against=ca if finished else "",
                                             yellows=y if finished else "", reds=r if finished else "",
                                             points=(3 if res == "W" else 1 if res == "D" else 0) if finished else ""))
    os.makedirs(out, exist_ok=True)

    # hand-maintained logo URLs survive a reseed: data/crests.csv (team, league, crest_url)
    crests_path = os.path.join(out, "crests.csv")
    if os.path.exists(crests_path):
        urls = {r["team"]: r["crest_url"].strip() for r in csv.DictReader(open(crests_path, newline=""))}
        for t in teams:
            t["crest_url"] = urls.get(t["name"], "")

    def write(name, rows):
        with open(os.path.join(out, name + ".csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"{name}: {len(rows)} rows")

    write("leagues", leagues)
    write("teams", teams)
    write("players", players)
    write("matches", matches)
    write("team_matches", team_matches)
    write("match_events", events)
    write("lineups", lineups)
    write("availability", availability)
    write("odds", odds)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--now", default=None, help="ISO UTC instant that separates finished from upcoming; defaults to real now")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
    a = ap.parse_args()
    now = datetime.strptime(a.now, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if a.now else datetime.now(timezone.utc)
    build(now, a.out)
