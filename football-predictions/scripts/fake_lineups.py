#!/usr/bin/env python3
"""Write synthetic 18-man squads and predicted XIs for the top upcoming matches.

A stop-gap while the real lineups are still being fetched from API-Football (the free plan fetches
fixture details one request at a time). Every player it adds has an id of 9,000,000 or more, so the
rows are easy to tell apart and to remove, and the next scripts/fetch_api_football.py run replaces
players.csv and lineups.csv anyway. Re-running this script is safe: it drops its own rows first.

Usage: python3 scripts/fake_lineups.py [--top 6] [--also Tottenham "West Ham"] [--now 2024-10-15T12:00:00Z] [--days 14]
Then:  python3 scripts/predict.py --now ... && ./scripts/load.sh
"""
import argparse
import csv
import os
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed import FIRST, LAST, FORMATIONS, formation_slots  # noqa: E402

FAKE_BASE = 9_000_000
BENCH = [("GK", 1), ("DF", 2), ("MF", 2), ("FW", 2)]


def read(data, name):
    with open(os.path.join(data, name + ".csv"), newline="") as f:
        return list(csv.DictReader(f))


def write(data, name, rows, header):
    with open(os.path.join(data, name + ".csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=6, help="matches to cover, ranked by the two sides' combined points per game")
    ap.add_argument("--also", nargs="*", default=[], help="team names (substring, case-insensitive) whose upcoming matches in the window are covered too")
    ap.add_argument("--now", default="2024-10-15T12:00:00Z")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
    args = ap.parse_args()
    rng = random.Random(7)
    now = datetime.fromisoformat(args.now.replace("Z", "+00:00"))
    data = args.data

    teams = {r["id"]: r for r in read(data, "teams")}
    players = read(data, "players")
    lineups = read(data, "lineups")
    matches = read(data, "matches")
    tm = read(data, "team_matches")

    # rank upcoming matches in the window by combined points per game this season
    ppg = defaultdict(lambda: [0, 0])
    season = max(m["season"] for m in matches if m["kickoff_at"] <= args.now)
    for r in tm:
        if r["status"] == "finished" and r["season"] == season:
            ppg[r["team_id"]][0] += int(r["points"]); ppg[r["team_id"]][1] += 1
    strength = lambda t: (ppg[t][0] / ppg[t][1]) if ppg[t][1] else 0
    window = [m for m in matches if m["status"] == "upcoming"
              and now <= datetime.fromisoformat(m["kickoff_at"].replace("Z", "+00:00")) <= now + timedelta(days=args.days)]
    top = sorted(window, key=lambda m: -(strength(m["home_team_id"]) + strength(m["away_team_id"])))[:args.top]
    for name in args.also:
        for m in window:
            if m not in top and any(name.lower() in teams[t]["name"].lower() for t in (m["home_team_id"], m["away_team_id"])):
                top.append(m)
    top_ids = {m["id"] for m in top}
    team_ids = sorted({m["home_team_id"] for m in top} | {m["away_team_id"] for m in top}, key=int)

    # drop anything this script wrote before
    players = [p for p in players if int(p["id"]) < FAKE_BASE]
    lineups = [l for l in lineups if not (l["match_id"] in top_ids and int(l["player_id"]) >= FAKE_BASE)]

    # one synthetic squad per team: 11 starters following the formation, 7 on the bench
    squads = {}
    for tid in team_ids:
        t = teams[tid]
        if not t["formation"]:
            t["formation"] = rng.choice(FORMATIONS)
        numbers = list(range(1, 36)); rng.shuffle(numbers)
        squad, k = [], 0
        for pos, _line in formation_slots(t["formation"]):
            k += 1
            squad.append(dict(id=FAKE_BASE + int(tid) * 100 + k, team_id=tid, name=f"{rng.choice(FIRST)} {rng.choice(LAST)}", position=pos,
                              shirt_number=numbers.pop(), age=rng.randint(19, 34), is_captain=0, quality=1.0, _starter=1))
        for pos, count in BENCH:
            for _ in range(count):
                k += 1
                squad.append(dict(id=FAKE_BASE + int(tid) * 100 + k, team_id=tid, name=f"{rng.choice(FIRST)} {rng.choice(LAST)}", position=pos,
                                  shirt_number=numbers.pop(), age=rng.randint(18, 33), is_captain=0, quality=1.0, _starter=0))
        rng.choice([p for p in squad if p["_starter"] and p["position"] != "GK"])["is_captain"] = 1
        squads[tid] = squad

    lid = max((int(l["id"]) for l in lineups), default=0)
    for m in top:
        for tid in (m["home_team_id"], m["away_team_id"]):
            slot = 0
            for p in squads[tid]:
                lid += 1
                lineups.append(dict(id=lid, match_id=m["id"], team_id=tid, player_id=p["id"], is_starter=p["_starter"], position=p["position"],
                                    slot_order=slot, formation=teams[tid]["formation"], is_predicted=1))
                slot += 1

    for squad in squads.values():
        for p in squad:
            p.pop("_starter")
            players.append(p)

    write(data, "players", players, ["id", "team_id", "name", "position", "shirt_number", "age", "is_captain", "quality"])
    write(data, "lineups", lineups, ["id", "match_id", "team_id", "player_id", "is_starter", "position", "slot_order", "formation", "is_predicted"])
    write(data, "teams", list(teams.values()), ["id", "league_id", "name", "short_name", "crest_url", "primary_color", "coach", "formation", "venue"])
    for m in top:
        print(f"{m['kickoff_at'][:10]}  {teams[m['home_team_id']]['name']} ({teams[m['home_team_id']]['formation']}) v {teams[m['away_team_id']]['name']} ({teams[m['away_team_id']]['formation']})  match {m['id']}")
    print(f"{len(team_ids)} synthetic squads, {18 * 2 * len(top)} lineup rows")


if __name__ == "__main__":
    main()
