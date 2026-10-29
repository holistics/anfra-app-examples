# Ran Race Planner — Product Requirements Document (PRD)

*As of 15 Oct 2026 · For feedback · Vietnamese version: [prd.vi.md](prd.vi.md) · Discovery: [pdd.en.md](pdd.en.md)*

The Race Planner gives a runner a forecast they can trust and the least-effort safe plan to their goal,
from their own Garmin data. This PRD states what it must do, how we will know it works, and what is out
of scope. The model behind it is in the [research-style document](research.en.md).

## 1. Goals and non-goals

**Goals**

| # | Goal | Measure | Target |
|---|---|---|---|
| G1 | Trustworthy forecast | Mean absolute error on the runner's marked races, each predicted only from earlier data | ≤ 5 % (now 4.0 %) |
| G2 | Explain the gap | Every forecast decomposes into terms the runner can act on, in minutes | All terms shown |
| G3 | A safe plan by default | Recommended plan inside every evidence zone | 100 % of recommendations |
| G4 | Least effort | Among safe plans that reach the goal, the fewest total km | Yes, within 2 km steps of the biggest week |
| G5 | Responsive | Time to rebuild the plan after a change | ≤ 1.5 s (now ~0.8 s) |

**Non-goals (this release)**

- Coaching chat, daily adjustments, or pushing workouts to the watch (needs explicit consent first).
- Nutrition, pacing or fuelling plans (advice only).
- Multi-runner accounts, sharing, mobile app.

## 2. Users and stories

Primary user: a recreational runner with a Garmin and a goal race (see [PDD](pdd.en.md#who)).

| # | As a runner I want to… | So that… |
|---|---|---|
| U1 | see my race time if the race were today | I know where I start, honestly |
| U2 | see what my goal needs on race day, in endurance and race fitness | I know what to work on |
| U3 | be told plainly when my goal is out of reach, and what is realistic | I can set a sensible target |
| U4 | set what I really control (runs per week, long run, increase, taper) | the plan fits my life |
| U5 | move one effort slider from less to more running | I can find my trade-off in seconds |
| U6 | see each setting's safe zone and what one step is worth in minutes | I push only where it pays and stays safe |
| U7 | see the plan's phases and sessions at my own paces | I know what each week looks like |
| U8 | save the plan and compare it with what I actually ran | I can follow it and adjust |

## 3. Functional requirements

### Step 1 — Where you stand

- **FR1.1** Show the race time *if the race were today*: today's effective VO2max and marathon shape
  through the model, in the race's conditions, no plan.
- **FR1.2** Show the gap to the goal, race fitness today, endurance today (marathon shape, weekly km of the
  last 2 complete weeks, longest run of 4 weeks), time to race and race-day heat.
- **FR1.3** "How is this calculated?" opens a step-by-step calculation with every number and its source.

### Step 2 — What it takes

- **FR2.1** Compute the **recommended plan** (FR3.4) and state whether the goal is reachable.
- **FR2.2** If reachable: say so, with the recommended plan's total km, biggest week and predicted time,
  and the fastest safe plan for comparison.
- **FR2.3** If not: name the **working target** (fastest safe plan) and explain why — the marathon shape
  and race fitness the goal would need, against what a safe plan reaches. If the saved plan is already
  as good, say "keep it" and give race-execution advice at the predicted pace.

### Step 3 — Build your plan

- **FR3.1 Controls**, most important first: weekly increase, biggest week, longest long run, runs per week
  (a life constraint, defaults to the runner's habit), quality sessions, taper, build-up (gradual or
  front-loaded; both green), tune-up race. Exact values
  (1 km, 1 %); each shows its values coloured by zone and the minutes one step up or down is worth.
- **FR3.2 Zones** (green safe · amber caution · red injury risk):

| Control | Amber | Red | Source |
|---|---|---|---|
| Weekly increase | > 10 % | > 20 % | ProjectRun21 (Damsted 2019) |
| Biggest week | > 1.25 × biggest week of the last year | — | runner's history |
| Longest long run | > usual cap (32 km marathon, 21 km half) | — | coaching consensus; spikes per Frandsen 2025 are prevented by construction |
| Runs per week | 7 | — | no rest day |
| Quality sessions | 0 | — | threshold and VO2max left to volume alone |
| Taper | outside 2–3 weeks (marathon), 1–2 (half) | — | Bosquet 2007 |
| Any value | race morning outside the 10–30 % freshness band | — | Banister model |

- **FR3.3 Effort slider**: positions = the fastest safe plan for each amount of running (Pareto front on
  total km and predicted time); amber where the goal is missed, green where reached; moving it sets every
  control; a table compares now, least, this position and most. Arrow keys step plan by plan.
- **FR3.4 Recommended plan** = the least total km that reaches the goal with every control green, race
  morning fresh and the runner's runs per week kept; if none, the fastest safe plan.
- **FR3.5 Plan generation**:
  1. Starts with the current week: days so far are history; the rest fills to the current load.
  2. Phases by time left: ≤ 3 weeks before the taper → sharpen; 4–7 → build, peak; 8–12 → base, build,
     2-week peak; 13+ → base ~40 %, build ~35 %, 3-week peak; then taper and race week.
  3. Build-up, the runner's choice: *gradual* (biggest week at the peak phase, the weekly increase a
     maximum) or *front-loaded* (volume rises at the weekly increase until the biggest week); a lighter
     week every 4th either way.
  4. Long run never more than 10 % over the longest of the previous 4 weeks, at most half the week;
     gradual: once at its longest, alternating with medium-long runs (3–5 runs of that length);
     front-loaded: grows as fast as that rule allows and stays at its longest.
  5. Easy runs 5 km to 3/4 of the long run; quality sessions picked by phase, at the runner's paces.
  6. Optional tune-up race 6 weeks before race week (HM before a marathon, 10K before a half).
- **FR3.6 Result**: race-eve marathon shape and race fitness (with range) → predicted time against target,
  goal and saved plan; the single biggest safe lever; cautions; calculation and fitness chart behind expand.
- **FR3.7 Save**: "Use this plan" writes it; the saved plan's forecast must equal the preview.

### Step 4 — Your saved plan (collapsed)

- **FR4.1** Fitness, fatigue and form to race day; week editor; planned vs done per day.

### Behaviour

- **FR5.1** No automatic refresh on this page; after a sync, "Reload data" keeps the current settings.
- **FR5.2** A change to one control never changes another the runner did not touch.

## 4. Model requirements

- **MR1** Forecast: time = Daniels(VO2max_race × shape factor, distance) × calibration × (1 + heat %) ×
  (1 + taper %). The same calculation in the preview (Python) and the saved plan (SQL).
- **MR2** Race fitness on race day = effective VO2max today + vo2_per_ctl × change in 30-day mean CTL.
- **MR3** Calibration, heat and vo2_per_ctl are fitted by `garmin-sync fit` after every sync; each race is
  predicted only from earlier races when measuring error.
- **MR4** Every derived metric has a documented formula and source in the semantic layer.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy | All data local (Postgres on the runner's machine); credentials only in git-ignored files; demo and video use synthetic data |
| Performance | Plan rebuild ≤ 1.5 s; effort frontier cached per race and runs per week |
| Correctness | Preview and saved-plan forecast match exactly (checked on a database copy) |
| Accessibility | Keyboard control of every input; colour never the only signal (zones also labelled) |

## 6. Release status

| Area | Status |
|---|---|
| Steps 1–4, controls, effort slider, recommended plan | Built |
| Model fit (heat, calibration, race-fitness response) | Built, re-run each sync |
| Long-plan structure and tune-up race | Built |
| Session breakdown in notes (warm-up · main set · cool-down) | Proposed |
| Pushing sessions to the watch | Not started (needs consent) |

## 7. Open questions

1. Should the recommended plan aim for a margin (e.g. reach the goal with 2 % to spare) instead of the
   point forecast?
2. Should the default build-up (before the runner chooses) be gradual or front-loaded? The evidence does
   not separate them.
3. What evidence would let quality sessions have their own effect on race fitness?
