# Ran: an evidence-based race planner — High-level Product Document (HPD)

*As of 15 Oct 2026 · For feedback from colleagues, friends and advisors · Vietnamese version: [hpd.vi.md](hpd.vi.md)*

Ran turns a runner's full Garmin history into a race forecast and a training plan. The structure of
the model comes from the sports-science literature; the numbers in it are fitted to the runner's own
data and checked against their past races. For the runner it answers three questions: how did my runs
go (did I follow the plan, how efficient, what affected them), how is my training going (too much or
too little, rest needed, race predictions, what to improve), and can I reach my goal race. This
document covers the third, the Race Planner.

## 1. Why: the problem

Runners preparing for a race get two kinds of help, and both are weak in the same way: you cannot see
why they say what they say.

| Today | What goes wrong |
|---|---|
| **Watch race predictors** (e.g. Garmin) | Opaque, and systematically optimistic for many runners. On the author's 9 marked races Garmin's prediction was on average **12 % too fast**; the marathon took 23 % longer than predicted. |
| **Generic training plans** (books, apps) | Rules of thumb ("+10 % a week", "peak at 32 km") applied to everyone, with no link to the runner's current fitness, history or goal time. |
| **Coaches** | Good, but expensive, and most still reason from experience rather than from the runner's data. |

What is missing is a tool that **explains**: which factors limit this runner, how much each costs in
minutes, what training moves each one, and where the safe limits are.

## 2. What: the product, in three steps

The Race Planner is one page with three steps, details behind "expand".

1. **Where you stand.** Your race time if the race were today, from today's fitness and endurance,
   with the gap to your goal. Example (Tokyo Marathon, March 2027): **5:04 today** against a 3:59:59 goal.
2. **What it takes.** The goal turned into what you need on race day: a marathon shape (endurance) and a
   race fitness (effective VO2max) — and whether a safe plan can get you there in the time left. If not,
   the best realistic time becomes the working target, with the reason.
3. **Build your plan.** What you control — runs per week, quality sessions, longest long run, weekly
   increase, biggest week, taper, an optional tune-up race — then the plan (phases with concrete sessions
   at your paces), then where it takes you on race day.

Three features carry most of the value:

- **The recommended plan is the least effort that reaches the goal**: the fewest total kilometres, with
  every setting inside its safe zone and race morning fresh. For Tokyo it was 728 km instead of 816 km for
  the fastest safe plan, 9 s under the goal.
- **An effort slider**: each position is the fastest safe plan for that much running, from least to most.
- **Safety zones on every control**, from injury research: weekly increase over 20 % (ProjectRun21), a
  single run more than 10 % longer than your longest in 30 days (Garmin-RUNSAFE 2025), tapers outside
  2–3 weeks (Bosquet 2007).

## 3. How: the model at a glance

```
 What you control            The plan                On race day                  Result
 ─────────────────           ────────────            ─────────────                ──────────
 runs per week        ─┐     phases: base,     ─┬─►  Marathon shape   ─┐
 quality sessions      │     build, peak,       │    (endurance)        │
 longest long run      ├──►  taper, race week ──┤                       ├──►  Race time
 weekly increase       │     sessions at your   ├─►  Race fitness      ─┤      vs goal
 biggest week          │     own paces          │    (effective VO2max) │
 taper, tune-up race  ─┘                        └─►  Freshness         ─┘
                                                     (form on race morning)
                       fixed: race-day heat, and how this runner races against the formulas
```

In one line: **time = Daniels(VO2max × shape factor, distance) × calibration × heat × freshness.**

- **Race fitness** is the runner's effective VO2max (from pace against heart rate), moved by how much the
  plan raises their fitness: +0.11 VO2max per point of training load, fitted on their own history.
- **Marathon shape** (Runalyze) measures endurance from 26 weeks of kilometres and 10 weeks of long runs;
  below what a distance needs, only part of VO2max is usable over that distance.
- **Calibration** is the n = 1 step: on this runner's past races the formulas were 7.9 % too optimistic,
  so every forecast is scaled by that.
- **Heat** uses the runner's own fitted heat effect (0.55 % per °C WBGT); **freshness** uses the
  Banister fitness–fatigue model on per-second heart-rate load (TRIMP).

## 4. Evidence: what supports each part

| Part of the model | Evidence | Strength |
|---|---|---|
| Three physiological determinants: VO2max, threshold, economy | Joyner & Coyle 2008 | Strong, classic |
| Durability as a fourth determinant | Hunter & Muniz-Pumares 2025; decoupling in 82,000 marathoners | Growing |
| Race time from VO2max | Daniels & Gilbert (VDOT) | Strong, widely used |
| Endurance volume limits the marathon | Runalyze marathon shape; Tanda 2013; training-determinants meta-analysis (J Sci Med Sport 2020) | Moderate |
| Fitness and fatigue from training load | Banister impulse-response (Morton et al. 1990) | Moderate; sensitive to the load metric |
| Heat slows runners | Ely et al. 2007 | Strong |
| Taper of 41–60 % for 8–14 days | Bosquet 2007; Mujika & Padilla 2003 | Strong |
| Injury limits | ProjectRun21 (Damsted 2019); Garmin-RUNSAFE (Frandsen 2025); ACWR critique (Impellizzeri 2020) | Moderate |
| Pacing and hitting the wall | Smyth 2021 | Strong (observational, large) |

The research-style document gives the full method and references.

## 5. Where it stands

- **Built** (Oct 2026): Garmin sync to Postgres; a semantic layer (Anfra) with every metric documented;
  three pages (Overview, Activities, Race Planner); the model fit, re-run after every sync.
- **Read-only, all in AQL:** every page reads its numbers through AQL queries, the Race Planner's plans
  included: the planner's model runs in SQL, and each setting the runner moves is a filter. Nothing runs
  on a server of its own while a page is open and nothing is written back, so the app deploys as
  Postgres, Anfra and a static host. The Python implementation stays as the reference the tests check
  the SQL against (same sessions, weekly km within 0.1 km, race times within 1 %).
- **Forecast accuracy** on 9 marked races (6 half marathons, 2 × 10K, 1 marathon), each predicted only from
  data before it:

| Method | Mean absolute error |
|---|---|
| **Ran's causal model, calibrated** | **4.0 %** |
| Garmin's prediction, calibrated | 6.2 % |
| Garmin's prediction, as shown on the watch | 12.0 % |

- **Consistency:** the plan preview and the saved plan's forecast give identical numbers (checked on a
  copy of the database).
- **Not yet:** a second runner, a live race test of a recommended plan, a mobile view.

## 6. Open questions — where we want your feedback

1. **Is "least effort that reaches the goal" the right default?** It reaches the goal on the forecast,
   not with a margin (±4 %). Should it aim for a margin instead?
2. **Gradual or front-loaded build-up?** Both stay inside the injury evidence's limits (weekly increase,
   single-run spikes); no study compares them. Front-loaded means more running and a faster forecast
   (the model rewards early volume); gradual means less running. Ran lets the runner choose and searches
   both for the recommendation. Is that the right call?
3. **Quality sessions** count only through their training load: no study gives a per-session VO2max gain
   we could use. Is there evidence we missed?
4. **Generalising.** Everything is fitted to one runner (n = 1). What would convince you it works for others?
5. **What is confusing** on the page, and what would you remove?

## Sources

See the reference list in the research-style document ([research.en.md](research.en.md#references)).
