#!/usr/bin/env python3
"""Compute transparent Poisson predictions for every match and write them as CSVs under data/.

Stdlib only. Every multiplier that goes into the expected goals is stored as a row in
prediction_factors so the app can show why. Each match is predicted at up to three snapshot
times before kickoff using only what was known then (finished matches, reported absences), so
finished matches get a fair backtest and upcoming ones get a probability history.

Usage: python3 scripts/predict.py [--now 2026-10-14T12:00:00Z] [--data data] [--match 123]
"""
import argparse
import csv
import math
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

MODEL_VERSION = "poisson-v1"
FORM_WINDOW = 5
FORM_WEIGHTS = [1.0, 0.9, 0.8, 0.7, 0.6]   # most recent first
FORM_PRIOR = 2.0                            # pseudo-matches pulling a strength toward 1.0
MAX_GOALS = 7
HT_SHARE = 0.44
POS_PRIOR = {"GK": 0.02, "DF": 0.35, "MF": 1.0, "FW": 2.4}
SNAPSHOT_HOURS = (48, 24, 2)


def parse_ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def read(data, name):
    with open(os.path.join(data, name + ".csv"), newline="") as f:
        return list(csv.DictReader(f))


def pois(lam, k):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def matrix(lh, la):
    g = [[pois(lh, i) * pois(la, j) for j in range(MAX_GOALS + 1)] for i in range(MAX_GOALS + 1)]
    s = sum(map(sum, g))
    return [[v / s for v in row] for row in g]


def outcomes(g):
    n = len(g)
    ph = sum(g[i][j] for i in range(n) for j in range(n) if i > j)
    pd = sum(g[i][i] for i in range(n))
    return ph, pd, 1 - ph - pd


def argmax(g):
    best, cell = -1, (0, 0)
    for i, row in enumerate(g):
        for j, v in enumerate(row):
            if v > best:
                best, cell = v, (i, j)
    return cell, best


def shrink(raw_weighted_sum, weight_sum):
    return (raw_weighted_sum + FORM_PRIOR * 1.0) / (weight_sum + FORM_PRIOR)


class Model:
    def __init__(self, data):
        self.teams = {int(t["id"]): t for t in read(data, "teams")}
        self.players = {int(p["id"]): p for p in read(data, "players")}
        self.matches = sorted(read(data, "matches"), key=lambda m: m["kickoff_at"])
        for m in self.matches:
            m["kick"] = parse_ts(m["kickoff_at"])
        self.tm = defaultdict(list)   # team_id -> finished team_matches sorted by kickoff
        for r in read(data, "team_matches"):
            if r["status"] == "finished":
                r["kick"] = parse_ts(r["kickoff_at"])
                self.tm[int(r["team_id"])].append(r)
        for v in self.tm.values():
            v.sort(key=lambda r: r["kick"])
        self.goals = defaultdict(list)  # player_id -> [(kick, match_id)]
        match_kick = {int(m["id"]): m["kick"] for m in self.matches}
        for e in read(data, "match_events"):
            if e["type"] == "goal":
                self.goals[int(e["player_id"])].append(match_kick[int(e["match_id"])])
        self.lineups = defaultdict(list)  # (match_id, team_id) -> rows
        for l in read(data, "lineups"):
            self.lineups[(int(l["match_id"]), int(l["team_id"]))].append(l)
        self.avail = defaultdict(list)  # team_id -> rows
        for a in read(data, "availability"):
            a["since_ts"] = parse_ts(a["since"])
            self.avail[int(a["team_id"])].append(a)

    # --- league context before an instant ---
    def league_context(self, league_id, before):
        rows = [r for t, rs in self.tm.items() for r in rs if int(r["league_id"]) == league_id and r["kick"] < before]
        n = len(rows)
        if n < 40:
            return dict(avg=1.35, home_adv=1.15, away_adv=0.90, corners=5.0, n=n // 2)
        avg = sum(int(r["goals_for"]) for r in rows) / n
        home = [int(r["goals_for"]) for r in rows if r["is_home"] == "1"]
        away = [int(r["goals_for"]) for r in rows if r["is_home"] == "0"]
        corners = sum(int(r["corners_for"]) for r in rows) / n or 5.0  # 0 when no fixture details are loaded yet
        return dict(avg=avg, home_adv=(sum(home) / len(home)) / avg, away_adv=(sum(away) / len(away)) / avg,
                    corners=corners, n=n // 2)

    def form(self, team_id, before):
        rows = [r for r in self.tm[team_id] if r["kick"] < before][-FORM_WINDOW:]
        return list(reversed(rows))  # most recent first

    def strength(self, team_id, before, ctx):
        rows = self.form(team_id, before)
        if not rows:
            return 1.0, 1.0, 1.0, 1.0, rows
        ws = FORM_WEIGHTS[:len(rows)]
        wsum = sum(ws)
        att = shrink(sum(w * int(r["goals_for"]) / ctx["avg"] for w, r in zip(ws, rows)), wsum)
        dfc = shrink(sum(w * int(r["goals_against"]) / ctx["avg"] for w, r in zip(ws, rows)), wsum)
        cfor = shrink(sum(w * int(r["corners_for"]) / ctx["corners"] for w, r in zip(ws, rows)), wsum)
        cag = shrink(sum(w * int(r["corners_against"]) / ctx["corners"] for w, r in zip(ws, rows)), wsum)
        return att, dfc, cfor, cag, rows

    def team_goals_before(self, team_id, before):
        return sum(int(r["goals_for"]) for r in self.tm[team_id] if r["kick"] < before)

    def player_goals_before(self, player_id, before):
        return sum(1 for k in self.goals[player_id] if k < before)

    def absences(self, team_id, at, kickoff):
        """Reported absences known at `at` for a match at `kickoff`.
        A report is valid for one week after `since`, and a player counts once however many reports name him."""
        seen, out = set(), []
        for a in self.avail[team_id]:
            if a["since_ts"] <= at and a["since_ts"] >= at - timedelta(days=7) and a["player_id"] not in seen:
                seen.add(a["player_id"])
                out.append(a)
        return out

    def h2h(self, home_id, away_id, before):
        rows = [r for r in self.tm[home_id] if int(r["opponent_id"]) == away_id and r["kick"] < before]
        return rows[-6:]

    # --- one prediction ---
    def predict(self, m, at):
        mid, home, away, league = int(m["id"]), int(m["home_team_id"]), int(m["away_team_id"]), int(m["league_id"])
        kick = m["kick"]
        ctx = self.league_context(league, at)
        factors = []

        def factor(team_id, name, mult, note, group):
            factors.append(dict(team_id=team_id, factor=name, multiplier=round(mult, 4), note=note, group=group))

        lam = {}
        corner_lam = {}
        sides = {home: away, away: home}
        strengths = {t: self.strength(t, at, ctx) for t in (home, away)}
        for t, opp in sides.items():
            att, _, cfor, _ = strengths[t][:4]
            _, opp_def, _, opp_cag = strengths[opp][:4]
            is_home = t == home
            rows = strengths[t][4]
            form_str = " ".join(r["result"] for r in rows) or "no matches yet"
            factor(t, "form_attack", att, f"Scored {sum(int(r['goals_for']) for r in rows)} in last {len(rows)} ({form_str}); league avg {ctx['avg']:.2f} per match", "form")
            factor(opp, "form_defence", opp_def, f"Conceded {sum(int(r['goals_against']) for r in strengths[opp][4])} in last {len(strengths[opp][4])}; applied to {self.teams[t]['name']}'s attack", "form")
            venue_mult = ctx["home_adv"] if is_home else ctx["away_adv"]
            factor(t, "home_advantage" if is_home else "away_disadvantage", venue_mult,
                   f"{'Home' if is_home else 'Away'} sides in this league score {venue_mult:.2f}x the average ({ctx['n']} matches)", "venue")
            # absences: attackers cut attack, defenders raise the opponent's attack
            avail_mult = 1.0
            team_goals = self.team_goals_before(t, at)
            for a in self.absences(t, at, kick):
                p = self.players[int(a["player_id"])]
                pg = self.player_goals_before(int(p["id"]), at)
                share = (pg / team_goals) if team_goals else 0.0
                if p["position"] in ("FW", "MF"):
                    mult = 1 - min(0.35, share * 0.8 + 0.02)
                    factor(t, f"{a['status']}:{p['name']}", mult,
                           f"{p['name']} ({p['position']}) out, {a['reason']}: {pg} of the team's {team_goals} goals ({share:.0%})", "availability")
                    avail_mult *= mult
                else:
                    mult = 1 + 0.05 * float(p["quality"])
                    factor(opp, f"{a['status']}:{p['name']}", mult,
                           f"{p['name']} ({p['position']}) out for {self.teams[t]['name']}, {a['reason']}: opponent attack up", "availability")
            # discipline over the form window
            reds = sum(int(r["reds"]) for r in rows)
            yellows = sum(int(r["yellows"]) for r in rows)
            if rows:
                disc = 1 - 0.03 * reds
                factor(t, "discipline", disc, f"{yellows} yellows, {reds} reds in last {len(rows)}", "discipline")
            else:
                disc = 1.0
            # h2h
            meetings = self.h2h(home, away, at)
            if len(meetings) >= 2:
                wins = sum(1 for r in meetings if r["result"] == ("W" if is_home else "L"))
                losses = sum(1 for r in meetings if r["result"] == ("L" if is_home else "W"))
                h2h_mult = 1 + 0.04 * (wins - losses) / len(meetings)
                factor(t, "head_to_head", h2h_mult, f"{wins} wins, {losses} losses in last {len(meetings)} meetings", "h2h")
            else:
                h2h_mult = 1.0
            lam[t] = ctx["avg"] * att * opp_def * venue_mult * disc * h2h_mult
            # the availability factor for t was applied to t's own attack; defender absences of the opponent go to t's attack too
            corner_lam[t] = ctx["corners"] * cfor * opp_cag * (1.08 if is_home else 0.92)
        # apply availability multipliers now that all factors are collected
        for f in factors:
            if f["group"] == "availability":
                lam[f["team_id"]] *= f["multiplier"]
        lh, la = lam[home], lam[away]
        g = matrix(lh, la)
        (ph_g, pa_g), p_top = argmax(g)
        p_home, p_draw, p_away = outcomes(g)
        p_over25 = sum(g[i][j] for i in range(MAX_GOALS + 1) for j in range(MAX_GOALS + 1) if i + j >= 3)
        p_btts = 1 - sum(g[0]) - sum(row[0] for row in g) + g[0][0]
        ht = matrix(lh * HT_SHARE, la * HT_SHARE)
        (hth, hta), _ = argmax(ht)
        ranked = sorted((p_home, p_draw, p_away), reverse=True)
        top, second = ranked[0], ranked[1]
        # how far the top outcome is ahead: a 45/28/27 split reads as 54, a 60/22/18 split as 79
        confidence = round(100 * (top + (top - second) / 2))
        # corners
        ch, ca = corner_lam[home], corner_lam[away]
        p_corners_over95 = 1 - sum(pois(ch + ca, k) for k in range(10))
        # scorers from this match's starters
        scorers = []
        for t in (home, away):
            starters = [l for l in self.lineups[(mid, t)] if l["is_starter"] == "1"]
            weights = []
            for l in starters:
                p = self.players[int(l["player_id"])]
                weights.append(POS_PRIOR[p["position"]] * (1 + self.player_goals_before(int(p["id"]), at)))
            wsum = sum(weights) or 1
            for l, w in zip(starters, weights):
                share = w / wsum
                scorers.append(dict(match_id=mid, team_id=t, player_id=int(l["player_id"]),
                                    goal_share=round(share, 4), p_anytime=round(1 - math.exp(-lam[t] * share), 4)))
        scorers.sort(key=lambda s: -s["p_anytime"])
        pick = home if p_home == top else away if p_away == top else None
        pred = dict(match_id=mid, model_version=MODEL_VERSION, generated_at=iso(at),
                    league_avg=round(ctx["avg"], 3), lambda_home=round(lh, 3), lambda_away=round(la, 3),
                    pred_home=ph_g, pred_away=pa_g, p_top_score=round(p_top, 4),
                    pred_ht_home=hth, pred_ht_away=hta,
                    p_home=round(p_home, 4), p_draw=round(p_draw, 4), p_away=round(p_away, 4),
                    p_over25=round(p_over25, 4), p_btts=round(p_btts, 4),
                    exp_corners_home=round(ch, 1), exp_corners_away=round(ca, 1), p_corners_over95=round(p_corners_over95, 4),
                    confidence=confidence, signals=len(factors),
                    pick_team_id=pick if pick else "",
                    key_scorer_player_id=scorers[0]["player_id"] if scorers else "")
        pred["insight_text"] = self.insight(m, pred, factors, strengths)
        return pred, factors, g, scorers

    def insight(self, m, pred, factors, strengths):
        home, away = self.teams[int(m["home_team_id"])]["name"], self.teams[int(m["away_team_id"])]["name"]
        ph, pd, pa = pred["p_home"], pred["p_draw"], pred["p_away"]
        if pred["pick_team_id"] == "":
            lead = f"A draw is the single most likely outcome ({pd:.0%}), with {home} at {ph:.0%} and {away} at {pa:.0%}."
        else:
            fav = self.teams[int(pred["pick_team_id"])]["name"]
            fav_p = ph if fav == home else pa
            lead = f"**{fav}** enter as favourites at {fav_p:.0%}, against {pd:.0%} for the draw."
        parts = [lead]
        for t in (int(m["home_team_id"]), int(m["away_team_id"])):
            rows = strengths[t][4]
            if rows:
                parts.append(f"{self.teams[t]['name']} come in on {' '.join(r['result'] for r in rows)}, scoring {sum(int(r['goals_for']) for r in rows)} and conceding {sum(int(r['goals_against']) for r in rows)} over those {len(rows)}.")
        outs = [f for f in factors if f["group"] == "availability" and f["multiplier"] < 1]
        if outs:
            names = ", ".join(f["factor"].split(":", 1)[1] for f in outs[:3])
            parts.append(f"Absences weigh on the attack: {names} ruled out.")
        parts.append(f"Expected goals come out at {pred['lambda_home']:.2f} for {home} and {pred['lambda_away']:.2f} for {away}, which makes {pred['pred_home']}-{pred['pred_away']} the most likely score and {'over' if pred['p_over25'] >= 0.5 else 'under'} 2.5 goals the call at {max(pred['p_over25'], 1 - pred['p_over25']):.0%}.")
        return " ".join(parts)


def run(data, now, only_match=None):
    model = Model(data)
    predictions, factors_out, matrix_out, scorers_out, history = [], [], [], [], []
    fid = sid = hid = 0
    for m in model.matches:
        if only_match and int(m["id"]) != only_match:
            continue
        kick = m["kick"]
        snapshots = [kick - timedelta(hours=h) for h in SNAPSHOT_HOURS]
        if m["status"] == "upcoming":
            snapshots = [s for s in snapshots if s <= now] or []
            snapshots.append(now)  # the live call
        latest = None
        prev = None
        for at in snapshots:
            pred, factors, g, scorers = model.predict(m, at)
            reason = "scheduled check-in"
            if prev is not None:
                if pred["signals"] != prev["signals"]:
                    reason = "team news"
            hid += 1
            history.append(dict(id=hid, match_id=pred["match_id"], generated_at=pred["generated_at"],
                                p_home=pred["p_home"], p_draw=pred["p_draw"], p_away=pred["p_away"],
                                pred_home=pred["pred_home"], pred_away=pred["pred_away"], signals=pred["signals"], reason=reason))
            latest = (pred, factors, g, scorers)
            prev = pred
        pred, factors, g, scorers = latest
        predictions.append(pred)
        for f in factors:
            fid += 1
            factors_out.append(dict(id=fid, match_id=pred["match_id"], **f))
        for i, row in enumerate(g):
            for j, v in enumerate(row):
                matrix_out.append(dict(match_id=pred["match_id"], home_goals=i, away_goals=j, probability=round(v, 6)))
        for s in scorers:
            sid += 1
            scorers_out.append(dict(id=sid, **s))

    HEADERS = {"prediction_scorers": ["id", "match_id", "team_id", "player_id", "goal_share", "p_anytime"]}

    def write(name, rows):
        with open(os.path.join(data, name + ".csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else HEADERS[name])
            w.writeheader()
            w.writerows(rows)
        print(f"{name}: {len(rows)} rows")

    if only_match:
        p = predictions[0]
        print({k: v for k, v in p.items() if k != "insight_text"})
        print(p["insight_text"])
        for f in factors_out:
            print(f"  {f['team_id']:>3} {f['factor']:<32} x{f['multiplier']:<7} {f['note']}")
        print("matrix sum", round(sum(r['probability'] for r in matrix_out), 6), "top scorers", scorers_out[:3])
        return
    write("predictions", predictions)
    write("prediction_factors", factors_out)
    write("prediction_score_matrix", matrix_out)
    write("prediction_scorers", scorers_out)
    write("prediction_history", history)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--now", default=None)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
    ap.add_argument("--match", type=int, default=None, help="print one match's prediction instead of writing files")
    a = ap.parse_args()
    now = parse_ts(a.now) if a.now else datetime.now(timezone.utc)
    run(a.data, now, a.match)
