#!/usr/bin/env python3
"""Fetch real data from API-Football v3 into data/*.csv.

Writes the same files and columns as scripts/seed.py, so predict.py, load.sh, the models and the app
are unchanged. Also writes data/api_predictions.csv from the API's own Predictions endpoint.

Stdlib only. Needs APIFOOTBALL_KEY in the environment. Every response is cached under data/api/ so a
re-run costs no quota; the free plan allows 100 requests a day and the script stops cleanly when it
runs out. Run it again the next day and it carries on from the cache.

Replay mode: --now (default 2024-10-15T12:00:00Z) is the pretend "today". Fixtures before it are finished
with real results, events and lineups; fixtures after it are upcoming with scores hidden, so the app and
the Poisson model work on real data even though the free plan only covers seasons 2022 to 2024.

Usage:
  python3 scripts/fetch_api_football.py --check          # plan, quota and a season-access test
  python3 scripts/fetch_api_football.py                  # fetch and write CSVs
  python3 scripts/fetch_api_football.py --offline        # rebuild CSVs from the cache only
Options: --seasons 2023 2024, --now 2024-10-15T12:00:00Z, --days N (API predictions window after now,
default 10), --grade N (also fetch API predictions for the N most recent finished fixtures, default 0),
--out data, --cache data/api.

Not available from the API and therefore faked or blank: odds for past fixtures (synthetic rows from
points per game, bookmaker "Synthetic (form)"), player quality (constant 1.0), attendance (blank),
lineups for upcoming fixtures (last real lineup copied with is_predicted=1), injury return dates.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

BASE = "https://v3.football.api-sports.io"
LEAGUES = [(39, "Premier League", "England", 1), (135, "Serie A", "Italy", 2), (140, "La Liga", "Spain", 3)]
DEFAULT_SEASONS = [2023, 2024]
DEFAULT_NOW = "2024-10-15T12:00:00Z"
FINISHED = {"FT", "AET", "PEN"}
POS = {"Goalkeeper": "GK", "Defender": "DF", "Midfielder": "MF", "Attacker": "FW",
       "G": "GK", "D": "DF", "M": "MF", "F": "FW"}
HOUR = 3600
TTL = {"fixtures": 6 * HOUR, "teams": 7 * 24 * HOUR, "players/squads": 7 * 24 * HOUR,
       "injuries": 12 * HOUR, "odds": 12 * HOUR, "predictions": 12 * HOUR, "status": 0}
FOREVER = None


class Quota(Exception):
    pass


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_api_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def season_str(s):
    return f"{s}-{str(s + 1)[2:]}"


def pct(s):
    try:
        return round(float(str(s).rstrip("%")) / 100, 4)
    except (TypeError, ValueError):
        return ""


def color_for(name):
    h = hashlib.md5(name.encode()).hexdigest()
    return "#" + "".join(f"{0x20 + int(h[i:i + 2], 16) % 0xA0:02x}" for i in (0, 2, 4))


class Api:
    def __init__(self, key, cache_dir, sleep=6.0, offline=False):
        self.key, self.cache_dir, self.sleep, self.offline = key, cache_dir, sleep, offline
        self.live_calls = 0
        self.remaining = None

    def _cache_path(self, path, params):
        q = urllib.parse.urlencode(sorted(params.items()))
        name = re.sub(r"[^A-Za-z0-9=&._-]", "_", q) or "all"
        if len(name) > 150:
            name = name[:120] + "_" + hashlib.md5(q.encode()).hexdigest()[:12]
        return os.path.join(self.cache_dir, path.replace("/", "_"), name + ".json")

    def get(self, path, ttl=FOREVER, **params):
        cp = self._cache_path(path, params)
        if os.path.exists(cp):
            fresh = ttl is None or (time.time() - os.path.getmtime(cp)) < ttl
            if fresh or self.offline:
                with open(cp) as f:
                    return json.load(f)
        if self.offline:
            raise Quota(f"offline: {path} {params} not in cache")
        if self.remaining == 0:
            raise Quota("daily request quota used up")
        data = self._call(path, params)
        os.makedirs(os.path.dirname(cp), exist_ok=True)
        with open(cp, "w") as f:
            json.dump(data, f)
        return data

    def _call(self, path, params, retry=True):
        url = f"{BASE}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
        req = urllib.request.Request(url, headers={"x-apisports-key": self.key, "Accept": "application/json"})
        if self.live_calls:
            time.sleep(self.sleep)
        self.live_calls += 1
        log(f"  GET /{path} {params}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
                hdr = r.headers
        except urllib.error.HTTPError as e:
            try:
                body = json.load(e)
            except Exception:
                body = {"errors": {"http": f"{e.code} {e.reason}"}}
            hdr = e.headers
        rem = hdr.get("x-ratelimit-requests-remaining")
        if rem is not None:
            self.remaining = int(rem)
        per_min = hdr.get("X-RateLimit-Remaining")
        errors = body.get("errors") or {}
        if isinstance(errors, dict) and errors:
            msg = "; ".join(f"{k}: {v}" for k, v in errors.items())
            if "rateLimit" in errors and retry:
                log("  per-minute limit hit, sleeping 60s")
                time.sleep(60)
                return self._call(path, params, retry=False)
            if "requests" in errors:
                self.remaining = 0
                raise Quota(msg)
            raise RuntimeError(f"API error on /{path} {params}: {msg}")
        if per_min is not None and int(per_min) == 0:
            time.sleep(60)
        return body

    def paged(self, path, ttl=FOREVER, **params):
        page = 1
        while True:
            body = self.get(path, ttl, page=page, **params)
            yield from body.get("response") or []
            paging = body.get("paging") or {}
            if page >= int(paging.get("total") or 1):
                return
            page += 1


def _group_by(rows, key):
    out = defaultdict(list)
    for r in rows:
        out[key(r)].append(r)
    return out


def check(api, seasons):
    st = api.get("status", ttl=0)
    r = st.get("response") or {}
    sub, req = r.get("subscription") or {}, r.get("requests") or {}
    print(f"plan: {sub.get('plan')} (active: {sub.get('active')}, ends {sub.get('end')})")
    print(f"requests today: {req.get('current')} / {req.get('limit_day')}")
    for season in seasons:
        try:
            # plain league+season: the free plan rejects convenience parameters such as last/next
            body = api.get("fixtures", ttl=0, league=39, season=season, round="Regular Season - 1")
            fx = (body.get("response") or [None])[0]
            if fx:
                f = fx["fixture"]
                print(f"season {season}: OK, first fixture {f['date']} {fx['teams']['home']['name']} v {fx['teams']['away']['name']}")
            else:
                print(f"season {season}: no fixtures returned (errors: {body.get('errors')})")
        except RuntimeError as e:
            print(f"season {season}: BLOCKED. {e}")
            print("Use --seasons with years the plan allows (the error names them), or a paid plan.")
            return 1
    return 0


def fetch(api, args):
    now = parse_api_ts(args.now)
    real_now = datetime.now(timezone.utc)
    seasons = args.seasons
    # the season that contains `now`: a season starts in July of its year
    replay_season = max((s for s in seasons if s <= (now.year if now.month >= 7 else now.year - 1)), default=min(seasons))
    fixtures = {}  # fixture id -> api item
    teams = {}     # team id -> row
    players = {}   # player id -> row
    availability, api_preds = [], []
    partial = []

    def is_finished(f):
        return f["fixture"]["status"]["short"] in FINISHED and parse_api_ts(f["fixture"]["date"]) < now

    try:
        log("fixtures")
        for lid, *_ in LEAGUES:
            for season in seasons:
                ongoing = real_now < datetime(season + 1, 7, 1, tzinfo=timezone.utc)
                for it in api.get("fixtures", TTL["fixtures"] if ongoing else FOREVER, league=lid, season=season).get("response") or []:
                    fixtures[it["fixture"]["id"]] = it
        log("teams")
        for lid, *_ in LEAGUES:
            for season in seasons:
                for it in api.get("teams", FOREVER, league=lid, season=season).get("response") or []:
                    t, v = it["team"], it.get("venue") or {}
                    teams[t["id"]] = dict(id=t["id"], league_id=lid, name=t["name"], short_name=t.get("code") or t["name"][:3].upper(),
                                          crest_url=t.get("logo") or "", primary_color=color_for(t["name"]), coach="",
                                          formation="", venue=v.get("name") or "")
        log("injuries")
        for lid, *_ in LEAGUES:
            for it in api.get("injuries", TTL["injuries"], league=lid, season=replay_season).get("response") or []:
                availability.append(it)
        log("API predictions")
        horizon = now + timedelta(days=args.days)
        upcoming = [f for f in fixtures.values() if not is_finished(f) and now <= parse_api_ts(f["fixture"]["date"]) <= horizon]
        done = sorted((f for f in fixtures.values() if is_finished(f)), key=lambda f: f["fixture"]["date"])
        graded = done[-args.grade:] if args.grade else []
        for f in sorted(upcoming, key=lambda f: f["fixture"]["date"]) + list(reversed(graded)):
            fid = f["fixture"]["id"]
            for it in api.get("predictions", TTL["predictions"], fixture=fid).get("response") or []:
                api_preds.append((fid, it))
        log("finished fixture details (events, lineups, statistics)")
        done = sorted((f for f in fixtures.values() if is_finished(f)), key=lambda f: f["fixture"]["date"])
        # newest first: recent form matters most if the quota runs out part way
        pending = [f for f in reversed(done) if "events" not in f]
        one_by_one = False
        for i in range(0, len(pending), 20):
            chunk = pending[i:i + 20]
            if not one_by_one:
                try:
                    body = api.get("fixtures", FOREVER, ids="-".join(str(f["fixture"]["id"]) for f in chunk))
                    for it in body.get("response") or []:
                        fixtures[it["fixture"]["id"]] = it
                    continue
                except RuntimeError as e:  # the plan rejects the ids parameter: one request per fixture instead
                    log(f"  ids= not allowed ({e}); falling back to one fixture per request")
                    one_by_one = True
            for f in chunk:
                for it in api.get("fixtures", FOREVER, id=f["fixture"]["id"]).get("response") or []:
                    fixtures[it["fixture"]["id"]] = it
    except Quota as e:
        partial.append(str(e))
        log(f"STOPPED: {e}. Writing what was fetched; run again tomorrow to continue.")
    except KeyboardInterrupt:
        partial.append("interrupted")
        log("INTERRUPTED. Writing what was fetched; run again to continue from the cache.")

    # --- derive rows ---
    def ensure_player(pid, name, tid, pos="", number=""):
        """Players come from lineups and events (squads are today's, the wrong era for a replay).
        predict.py needs a position for every player, so unknown becomes MF."""
        if pid is None:
            return False
        position = POS.get(pos, "")
        if pid not in players:
            players[pid] = dict(id=pid, team_id=tid, name=name or f"Player {pid}", position=position or "MF",
                                shirt_number=number or "", age="", is_captain=0, quality=1.0, _known_pos=bool(position))
        else:
            row = players[pid]
            if position and not row["_known_pos"]:
                row["position"], row["_known_pos"] = position, True
            if number and not row["shirt_number"]:
                row["shirt_number"] = number
            row["team_id"] = tid  # latest appearance wins, so transfers follow the player
        return True

    leagues_rows = [dict(id=lid, name=n, country=c, sort_order=o) for lid, n, c, o in LEAGUES]
    match_rows, tm_rows, ev_rows, lu_rows = [], [], [], []
    last_lineup = {}  # team id -> (kick, [rows], formation)
    eid = lid_ = tmid = 0
    for f in sorted(fixtures.values(), key=lambda f: (f["fixture"]["date"], f["fixture"]["id"])):
        fx, lg, tm, goals, score = f["fixture"], f["league"], f["teams"], f.get("goals") or {}, f.get("score") or {}
        mid, home, away = fx["id"], tm["home"]["id"], tm["away"]["id"]
        kick = parse_api_ts(fx["date"])
        finished = is_finished(f)
        for tid, side in ((home, tm["home"]), (away, tm["away"])):
            if tid not in teams:
                teams[tid] = dict(id=tid, league_id=lg["id"], name=side["name"], short_name=side["name"][:3].upper(),
                                  crest_url=side.get("logo") or "", primary_color=color_for(side["name"]), coach="", formation="", venue="")
        m = re.findall(r"\d+", lg.get("round") or "")
        st = {}
        for s in f.get("statistics") or []:
            st[s["team"]["id"]] = {x["type"]: x["value"] for x in s.get("statistics") or []}
        corners = {t: (st.get(t, {}).get("Corner Kicks") or 0) for t in (home, away)}
        ht = score.get("halftime") or {}
        match_rows.append(dict(id=mid, season=season_str(lg["season"]), league_id=lg["id"], round=int(m[-1]) if m else 0,
                               kickoff_at=iso(kick), home_team_id=home, away_team_id=away, venue=(fx.get("venue") or {}).get("name") or "",
                               status="finished" if finished else "upcoming",
                               home_goals=goals.get("home") if finished else "", away_goals=goals.get("away") if finished else "",
                               ht_home=ht.get("home") if finished else "", ht_away=ht.get("away") if finished else "",
                               home_corners=corners[home] if finished else "", away_corners=corners[away] if finished else "",
                               attendance=""))
        cards = {home: [0, 0], away: [0, 0]}
        for e in (f.get("events") or []) if finished else []:
            tid, p, typ, detail = e["team"]["id"], e.get("player") or {}, e.get("type"), e.get("detail") or ""
            if typ == "Goal":
                if "Missed" in detail:
                    continue
                kind = "goal"
            elif typ == "Card":
                kind = "red" if "Red" in detail or "Second Yellow" in detail else "yellow"
                cards[tid][0 if kind == "yellow" else 1] += 1
            elif typ == "subst":
                kind = "sub"
                detail = f"on for {p.get('name') or '?'}"
                p = e.get("assist") or {}
                if not p.get("id"):
                    p = e.get("player") or {}
            else:
                continue
            if not ensure_player(p.get("id"), p.get("name"), tid):
                continue
            eid += 1
            minute = (e.get("time") or {}).get("elapsed") or 0
            ev_rows.append(dict(id=eid, match_id=mid, team_id=tid, player_id=p["id"], minute=minute, type=kind,
                                detail="" if detail in ("Normal Goal", "Yellow Card", "Red Card") else detail))
        for lu in (f.get("lineups") or []) if finished else []:
            tid, formation = lu["team"]["id"], lu.get("formation") or ""
            rows = []
            for is_starter, key in ((1, "startXI"), (0, "substitutes")):
                for i, item in enumerate(lu.get(key) or []):
                    p = item["player"]
                    if not ensure_player(p.get("id"), p.get("name"), tid, p.get("pos") or "", p.get("number") or ""):
                        continue
                    rows.append(dict(team_id=tid, player_id=p["id"], is_starter=is_starter, position=POS.get(p.get("pos"), ""),
                                     slot_order=i, formation=formation))
            for r in rows:
                lid_ += 1
                lu_rows.append(dict(id=lid_, match_id=mid, **r, is_predicted=0))
            if tid in teams:
                if formation:
                    teams[tid]["formation"] = formation
                coach = (lu.get("coach") or {}).get("name")
                if coach:
                    teams[tid]["coach"] = coach
                col = ((lu.get("team") or {}).get("colors") or {}).get("player") or {}
                if col.get("primary"):
                    teams[tid]["primary_color"] = "#" + col["primary"].lstrip("#")
            last_lineup[tid] = (kick, rows, formation)
        if not finished:
            for tid in (home, away):
                if tid in last_lineup:
                    for r in last_lineup[tid][1]:
                        lid_ += 1
                        lu_rows.append(dict(id=lid_, match_id=mid, **r, is_predicted=1))
        hg, ag = (goals.get("home") or 0, goals.get("away") or 0) if finished else (None, None)
        for side, opp, is_home, gf, ga in ((home, away, 1, hg, ag), (away, home, 0, ag, hg)):
            tmid += 1
            res = "" if not finished else ("W" if gf > ga else "D" if gf == ga else "L")
            tm_rows.append(dict(id=tmid, match_id=mid, team_id=side, opponent_id=opp, is_home=is_home,
                                season=season_str(lg["season"]), league_id=lg["id"], kickoff_at=iso(kick), status="finished" if finished else "upcoming",
                                goals_for=gf if finished else "", goals_against=ga if finished else "", result=res,
                                corners_for=corners[side] if finished else "", corners_against=corners[opp] if finished else "",
                                yellows=cards[side][0] if finished else "", reds=cards[side][1] if finished else "",
                                points=(3 if res == "W" else 1 if res == "D" else 0) if finished else ""))

    av_rows = []
    for i, it in enumerate(availability, 1):
        p, t, fx = it["player"], it["team"], it["fixture"]
        if fx["id"] not in fixtures or not ensure_player(p.get("id"), p.get("name"), t["id"]):
            continue
        reason = p.get("reason") or p.get("type") or "Unavailable"
        rnd = re.findall(r"\d+", fixtures[fx["id"]]["league"].get("round") or "")
        av_rows.append(dict(id=len(av_rows) + 1, team_id=t["id"], player_id=p["id"],
                            status="suspended" if "suspend" in reason.lower() else "injured", reason=reason,
                            since=iso(parse_api_ts(fx["date"]) - timedelta(days=5)), expected_return_round=int(rnd[-1]) if rnd else ""))

    # Synthetic odds for upcoming fixtures: the API keeps odds only 1 to 14 days before a real fixture,
    # so a replay has none. Weights from points per game this season (last season as fallback), fixed
    # draw weight, 5% overround. Clearly labelled so nobody mistakes them for a bookmaker.
    ppg, gpg = {}, {}
    for (sid, season), rows in _group_by(tm_rows, lambda r: (r["team_id"], r["season"])).items():
        fin = [r for r in rows if r["status"] == "finished"]
        if fin:  # shrink towards league-typical values: 1.3 points and 2.7 goals a match, worth 6 matches
            ppg[(sid, season)] = (sum(r["points"] for r in fin) + 1.3 * 6) / (len(fin) + 6)
            gpg[(sid, season)] = (sum(r["goals_for"] + r["goals_against"] for r in fin) + 2.7 * 6) / (len(fin) + 6)

    def strength(tid, season):
        prev = f"{int(season[:4]) - 1}-{season[:2]}{int(season[2:4]) - 1:02d}" if season else ""
        return ppg.get((tid, season), ppg.get((tid, prev), 1.3)), gpg.get((tid, season), gpg.get((tid, prev), 2.7))

    odds_rows = []
    for m in match_rows:
        if m["status"] != "upcoming":
            continue
        hp, hg_ = strength(m["home_team_id"], m["season"])
        ap_, ag_ = strength(m["away_team_id"], m["season"])
        w = {"h": 1.15 * hp + 0.35, "d": 1.05, "a": ap_ + 0.35}
        tot = sum(w.values())
        p = {k: v / tot for k, v in w.items()}
        over = min(0.8, max(0.3, 0.5 + 0.12 * ((hg_ + ag_) / 2 - 2.7)))
        odds_rows.append(dict(id=len(odds_rows) + 1, match_id=m["id"], bookmaker="Synthetic (form)",
                              captured_at=iso(parse_api_ts(m["kickoff_at"]) - timedelta(days=2)),
                              p_home=round(p["h"] * 1.05, 4), p_draw=round(p["d"] * 1.05, 4), p_away=round(p["a"] * 1.05, 4), p_over25=round(over, 4)))

    ap_rows = []
    for fid, it in api_preds:
        pr, cmp_ = it.get("predictions") or {}, it.get("comparison") or {}
        pc = pr.get("percent") or {}
        g = pr.get("goals") or {}
        row = dict(match_id=fid, generated_at=iso(now), p_home=pct(pc.get("home")), p_draw=pct(pc.get("draw")), p_away=pct(pc.get("away")),
                   winner_team_id=(pr.get("winner") or {}).get("id") or "", win_or_draw=1 if pr.get("win_or_draw") else 0,
                   under_over=pr.get("under_over") or "", goals_home=g.get("home") or "", goals_away=g.get("away") or "",
                   advice=pr.get("advice") or "")
        for key, col in (("form", "form"), ("att", "att"), ("def", "def"), ("poisson_distribution", "poisson"), ("h2h", "h2h"), ("goals", "goals"), ("total", "total")):
            c = cmp_.get(key) or {}
            row[f"cmp_{col}_home"], row[f"cmp_{col}_away"] = pct(c.get("home")), pct(c.get("away"))
        ap_rows.append(row)

    os.makedirs(args.out, exist_ok=True)

    def write(name, rows, header=None):
        with open(os.path.join(args.out, name + ".csv"), "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=header or list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        log(f"{name}: {len(rows)} rows")

    write("leagues", leagues_rows)
    write("teams", sorted(teams.values(), key=lambda t: (t["league_id"], t["name"])))
    for row in players.values():
        row.pop("_known_pos", None)
    write("players", sorted(players.values(), key=lambda p: (p["team_id"], p["id"])))
    write("matches", match_rows)
    write("team_matches", tm_rows)
    write("match_events", ev_rows, ["id", "match_id", "team_id", "player_id", "minute", "type", "detail"])
    write("lineups", lu_rows, ["id", "match_id", "team_id", "player_id", "is_starter", "position", "slot_order", "formation", "is_predicted"])
    write("availability", av_rows, ["id", "team_id", "player_id", "status", "reason", "since", "expected_return_round"])
    write("odds", odds_rows, ["id", "match_id", "bookmaker", "captured_at", "p_home", "p_draw", "p_away", "p_over25"])
    ap_header = ["match_id", "generated_at", "p_home", "p_draw", "p_away", "winner_team_id", "win_or_draw", "under_over", "goals_home", "goals_away", "advice"] + \
        [f"cmp_{c}_{s}" for c in ("form", "att", "def", "poisson", "h2h", "goals", "total") for s in ("home", "away")]
    write("api_predictions", ap_rows, ap_header)
    missing_details = sum(1 for f in fixtures.values() if is_finished(f) and "events" not in f)
    log(f"live requests this run: {api.live_calls}; remaining today: {api.remaining}")
    if missing_details:
        log(f"{missing_details} finished fixtures still lack events/lineups/statistics (corners counted as 0 until fetched)")
    if partial:
        log("PARTIAL: " + "; ".join(partial))
        return 2
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--seasons", type=int, nargs="+", default=DEFAULT_SEASONS, help="API season years (free plan: 2022 to 2024)")
    ap.add_argument("--now", default=DEFAULT_NOW, help="replay date: fixtures after it are upcoming with scores hidden")
    ap.add_argument("--days", type=int, default=10)
    ap.add_argument("--grade", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=6.0, help="seconds between live calls (free plan: 10/min)")
    ap.add_argument("--out", default="data")
    ap.add_argument("--cache", default=os.path.join("data", "api"))
    args = ap.parse_args()
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    os.chdir(root)
    key = os.environ.get("APIFOOTBALL_KEY", "")
    if not key and not args.offline:
        sys.exit("APIFOOTBALL_KEY is not set. Get a key at https://dashboard.api-football.com and export it.")
    api = Api(key, args.cache, sleep=args.sleep, offline=args.offline)
    if args.check:
        sys.exit(check(api, args.seasons))
    sys.exit(fetch(api, args))


if __name__ == "__main__":
    main()
