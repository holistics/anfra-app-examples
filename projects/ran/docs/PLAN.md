# Plan: implementing the causal model

This plan takes the model in the [README](../README.md#the-causal-model-of-race-performance) from
a set of descriptive metrics to a planner that predicts a race result from planned training.
The order follows the dependencies: the load metric feeds the markers, the markers feed the fit,
and the fit feeds the planner.

**Deadline: today, Thu 15 Oct 2026.** The competition itself closes Wed 21 Oct, 23:59;
finishing today leaves the rest of the week as buffer. One day does not fit every phase below
at full depth, so the work is ordered by what the demo needs. Each block ships on its own, so
whatever is done by the end of the day is a working app. Phase sections below mark what is
**in today** and what is **deferred**.

| Block | Work | Ends with |
|---|---|---|
| 1 | 1. TRIMP load | Fitness/fatigue/form on TRIMP, with the formula in AML |
| 2 | 2. Markers: speed@HR, decoupling, best efforts | A *Markers* chart on Overview |
| 3 | 4. Planner (goal race, weekly plan, projection) | Projected form and predicted time on race day, from planned training |
| 4 | 3. Fit (light): heat curve and prediction check | The personal heat coefficient used everywhere; prediction errors on marked races |
| 5 | 5. Synthetic runner + AML descriptions | The app runs on a generated runner for the video |
| 6 | 6. Video and submission | A video under 3 minutes, submitted |

The planner moves ahead of the fit: it is the demo's centrepiece, and it works with literature
constants until the fit replaces them.

**Deferred** (after submission): fitting Banister's time constants to the runner, the
training → determinant edge tests, per-second streams for the synthetic runner beyond a few demo
activities, and plan drag-and-drop (today the plan is edited per week in a table).

## Parallel work

Five workstreams run at the same time, each in its own git worktree with its own database copy
(`scripts/worktree_db.sh <name> <main repo>`), so a migration in one never touches another's
views. Garmin is never synced from a worktree. Each stream owns its files; the few shared
files get small, additive edits, and the streams merge into `main` one at a time.

| Stream | Phases | Owns | Shared edits | Ports (anfra / sync) |
|---|---|---|---|---|
| **A · TRIMP** | 1 | `db/views.sql` (the only stream editing it), `models/day`, `models/activity` | Overview banner labels | 7881 / 7891 |
| **B · Best efforts** | 2c | `garmin_sync/markers.py`, `db/schema.d/20_best_effort.sql`, `models/best_effort` | `run_sync` (one call), dataset, Overview panel, Activities window | 7882 / 7892 |
| **C · Planner** | 4 | `apps/running/planner.html`, `db/schema.d/30_plan.sql`, `db/views.d/30_plan.sql`, plan models | `userdata.py`, `server.py`, dataset | 7883 / 7893 |
| **D · Fit (light)** | 3.1, 3.4 | `garmin_sync/model.py`, `db/schema.d/40_model.sql`, model-evidence models | `run_sync` (one call), `cli.py`, `pyproject.toml` (numpy), dataset, Overview section | 7884 / 7894 |
| **E · Synthetic runner** | 5.2 | `garmin_sync/demo.py`, database `garmin_demo` | `cli.py` | 7885 / 7895 |

**Contracts between streams**

- `garmin.day.training_load`, `atl`, `ctl` and `tsb` stay the names of *the* load model. Stream A
  switches what they are computed from (TRIMP) and keeps Garmin's as `*_garmin`. The planner (C)
  builds on these names, so it works before and after A merges.
- New SQL goes in `db/schema.d/` and `db/views.d/` (applied after the base files, in name order).
  A materialized view the sync must recompute is added to `DERIVED_VIEWS` in `sync.py`.
- Prediction methods (D) write `garmin.prediction_check`. Once both C and D have merged, the
  planner uses the method with the lowest error there.
- Not parallel: Phase 5.1 (AML descriptions) and the video come after the merge, because they
  describe the finished whole.

## Where things stand

| Piece | State |
|---|---|
| Sync (Garmin + Open-Meteo), all history | ✅ 633 activities, 1.56M samples, weather for all 438 outdoor runs |
| D1 effective VO2max, marathon shape | ✅ built, not calibrated against races |
| D5 Banister ATL/CTL/TSB | ✅ on **TRIMP** from per-second HR (Phase 1 done); Garmin's load kept as `*_garmin` |
| D6 heat (WBGT per run) | ✅ |
| D7 grade-adjusted pace, D8 laps, D10 flags | ✅ |
| Mark as race (`app.race`) | ✅ 8 past races marked (6 HM, 2 10K) |
| D2 threshold (Garmin history, own pace at threshold HR, fractional utilisation) | ✅ |
| D4 decoupling, D8 pacing and workout execution, pace at easy HR | ✅ (Phase 2a/2b) |
| Best efforts (1K–M inside every run, PBs) | ✅ (Phase 2c) |
| D9 weigh-ins logged in the app, D10 caution flags | ✅ |
| Goal race and goal time (Tokyo Marathon, March 2027, 3:59:59) | ✅ |
| Fit (light): heat coefficient, prediction validation and calibration | ✅ Stream D: `garmin_sync/model.py`, *Model evidence* on Overview |
| Planner (Stream C): starter plan, week editor, projection, forecast, limiters, planned vs done | ✅ (no drag-and-drop) |

---

## Phase 1 — TRIMP load (D5) · done

**Result:** TRIMP and Garmin load correlate at r = 0.81 per activity (632 with HR samples; runs
0.82, strength 0.82). The outliers are understood: short interval sessions (200–400 m reps,
anaerobic effect 3–5) score 5–8× higher on Garmin's EPOC load, because HR lags and never peaks
in short reps (a known limit of HR-based TRIMP); long low-HR walks, hikes and rides score near 0
on Garmin's load but count on TRIMP. TRIMP runs about 0.68× Garmin's scale (median), so ATL/CTL
are lower in absolute terms. Banner on 15 Oct 2026, Garmin load → TRIMP: ATL 50 % → 48 %,
CTL 65 % → 71 %, TSB −6 → −6, A:C 1.09 → 1.13, monotony 1.12 → 0.95, strain 590 → 390,
easy load 22 → rest 2 days, no flags either way. Days flagged for load ramp 112 → 102, monotony
41 → 47.

Replace Garmin's load with Banister TRIMP computed from per-second HR, so the load that drives
fitness, fatigue and form is a formula anyone can read.

**Formula** (per activity, summed over samples):

```
HRr    = clamp((HR − HR_rest) / (HR_max − HR_rest), 0, 1)
TRIMP  = Σ Δt_min · HRr · a · e^(b · HRr)        a, b = 0.64, 1.92 (male) | 0.86, 1.67 (female)
```

- `HR_max`: from `hr_zones_config` (currently 194), as `garmin.activity` already does.
- `HR_rest`: that day's resting HR from `garmin.day`; fall back to the median over the previous
  30 days.
- Sex: `raw.doc['user_profile'].userData.gender`. Never hard-coded.
- `Δt` comes from consecutive `elapsed_s` and is capped at 10 s, so pauses add no load.
- When an activity has no HR samples, use the average-HR form of the formula over its duration.
  When it has no HR at all, use Garmin's load. A `load_source` column records which was used.

**Build**

1. `db/views.sql`: a materialized view `garmin.activity_load` (activity_id, trimp, load_source),
   refreshed before `garmin.day`. `garmin.activity` exposes `trimp`.
2. `garmin.day`: ATL/CTL/TSB, A:C, monotony, strain, easy load and rest days all run on TRIMP.
   The Garmin-load versions stay as `*_garmin` columns for comparison.
3. AML: an `activity.trimp` dimension and a `total_trimp` measure, whose descriptions give the
   formula and the source. The banner and the load charts switch to them.

**Check:** TRIMP against Garmin load per activity: expect r > 0.8, and explain the outliers
(strength sessions, runs with poor HR). The banner's numbers will change. Show the
before and after for today.

## Phase 2 — Performance markers (D1 + D3, D4, validation points) · in today

**2a. Speed at a fixed HR**, a weekly marker of aerobic fitness and economy.

- Per run: the median grade-adjusted speed over samples with HR within ±5 bpm of a reference
  HR. 150 bpm sits in easy running for HRmax 194. Exclude the first 10 minutes (HR lag) and
  runs with fewer than 5 minutes in the band.
- Heat-adjusted to WBGT 26 °C using the heat coefficient. That starts from the literature and
  is replaced by the personal fit in Phase 3.
- Columns on `garmin.activity_marker`: `speed_at_hr_mps`, `speed_at_hr_adj_mps`, `minutes_in_band`.

**2b. Aerobic decoupling** (D4 durability).

- Runs of at least 60 minutes that are steady: the coefficient of variation of speed is below a
  threshold, which excludes interval sessions.
- `decoupling_pct = (EF first half − EF second half) / EF first half`, where EF = GAP speed / HR.
  Values under 5% count as durable.

**2c. Best efforts** (race-like validation points). ✅ Done: `garmin.best_effort` + view
`garmin.best_effort_run`, `garmin-sync markers [--all]`, Overview panel, Activities window.
GPS-short runs (e.g. a half measured 21.07 km) have no effort at that distance; their race
result still comes from `app.race`.

- The fastest 1K, 5K, 10K and half marathon inside any run, from a two-pointer pass over the
  per-second distance.
- Computed in Python during the sync (`garmin_sync/markers.py`) and written to
  `garmin.best_effort` (activity_id, distance_km, time_s, start_s, avg_hr, wbgt_c).
  The pass is incremental, so only new activities are computed.

**Apps:** AML models `activity_marker` and `best_effort`, related to `activity`. On Overview, a
*Markers* chart (speed@HR trend + decoupling of long runs) and a best-efforts table. In the
Activities modal, the run's markers.

**Check:** spot-check three runs by hand against their streams. Speed@HR should be flatter
week to week than raw pace.

## Phase 3 — Fit and validate on the runner's data · steps 1 and 4 done, 2 and 3 deferred

**Done (Stream D).** Results are in the README under *What the data says so far*.
- **Heat:** 0.55 % per °C (95 % CI −0.30 to 1.14), within Ely's range; this data cannot pin it down.
- **Best predictor:** Daniels from effective VO2max, calibrated on earlier races: 3.7 % mean
  absolute error over 7 races. Riegel from the previous race: 3.8 %.
- **For the planner,** `garmin.model_param` holds:
  - `heat_pct_per_c` and `heat_ref_wbgt_c`;
  - `calibration_<method>` (actual ÷ predicted, over all races);
  - `best_prediction_mape_pct`: its value is the error, and its `method` text starts with the
    winning method key, before the colon. The interval columns give the method's signed error
    range, for the uncertainty band.
- **Additions beyond the original step 4:**
  - calibrated variants of the methods;
  - Riegel from the previous race, rather than from a best effort (Stream B adds best efforts);
  - heat adjustment from the median WBGT of the 30 days of training behind each estimate.


New module `garmin_sync/model.py`. It runs at the end of each sync (fast: a few hundred weekly
points) and writes `garmin.model_param` (name, value, ci_low, ci_high, n, fitted_at) and
`garmin.prediction_check`. Its only new dependency is `numpy`.

1. **Heat curve (D6).** Regress log(efficiency) on WBGT, controlling for CTL and a slow
   trend, on easy runs. The result is a personal "% slower per °C above 26", with a confidence
   interval. It replaces the literature value from Phase 2.
2. **Banister fitted to the runner (D5).** Model the weekly heat-adjusted speed@HR as
   `p0 + k1·fitness(τ1) − k2·fatigue(τ2)`. Grid-search τ1 ∈ 20–60 and τ2 ∈ 3–15, and fit k by
   least squares. Train on the earlier 80% of weeks and test on the last 20%. Adopt the fitted
   constants only if they beat 42/7 out of sample.
3. **Edge tests (Layer 2).** For each training → determinant edge with data behind it, run one
   test and report the effect size with its interval. Each edge is labelled *confirmed*,
   *not detectable* or *contradicted*.
   - Easy volume: 8-week volume against the change in speed@HR over the next 4 weeks.
   - Long runs: count of long runs against the decoupling trend.
   - Strength: blocks with and without strength sessions against cadence and ground contact.
4. **Prediction validation.** For each marked race with an official time, predict it from data
   up to the day before using:
   - Daniels/VDOT from effective VO2max, heat-adjusted to the race's WBGT;
   - Riegel from the best effort in the previous 8 weeks;
   - Tanda (marathons only);
   - Garmin's prediction.

   Report the mean absolute % error per method. The planner uses the best method, and its error
   becomes the uncertainty band.

**Blocker:** step 4 needs at least 3 races marked with official times, **today**. Ran suggests 15 candidates on
the Activities page.

**Apps:** a *Model* section on Overview. It shows the fitted parameters next to the
textbook values, the edge verdicts and the prediction-error table. This section makes the claim
"evidence-based" checkable.

## Phase 4 — Planner · done (plan edited per week, no drag-and-drop)

A new app, `apps/running/planner.html`.

1. **Goal race.** Create or pick an upcoming race in `app.race` with its date, distance, goal time
   and priority. The table and the write-back endpoint already exist.
2. **The plan.** A new table `app.plan_day` (date, session type, planned km, planned
   duration, intensity), written through new `POST/DELETE /plan` endpoints on the sync server.
   - A starter plan is generated from current CTL up to race day: weekly ramp ≤ 10%, one long
     run, 1–2 quality sessions, a taper of 41–60% less volume in the last 2–3 weeks.
   - The runner then edits it week by week.
3. **Projection (governed, in SQL/AML, not JavaScript).** A view `garmin.projection`:
   - Actual daily TRIMP up to today, then the planned TRIMP estimated from session type and
     duration using the runner's own TRIMP per minute for that intensity.
   - From that, ATL/CTL/TSB with the fitted constants through race day.
   - A predicted race time from the best validated method. It is shifted by the projected change
     in fitness and adjusted for race-day heat: the Open-Meteo forecast within 16 days,
     otherwise the WBGT for that date and hour from history.
4. **Planned vs done (D8).** Each planned session has a target (distance, pace or HR, reps). The
   run on that day is matched to it and compared: distance, pace against the target, rep spread
   and fade. Optional later: send planned sessions to the watch as Garmin workouts
   (`upload_running_workout` + `schedule_workout`), so the watch guides the session and its laps
   carry the steps. That writes to your Garmin account, so it waits for your go-ahead.
5. **The page**
   - A projected form curve with a race-day TSB target band.
   - The predicted time ± validation error, set against the goal.
   - Which determinant limits the runner. For example, long-run decoupling is high, so the plan
     needs long runs.
   - Risk flags for ramp and monotony, shown as cautions.

**Check:** editing the plan changes the projection after the next query. With no plan, the
projection is a pure decay of current fitness.

## Phase 5 — Governance and synthetic data · in today (streams only for a few demo runs)

1. **Governance.** ✅ Done: every field in the 20 models has a description (formula and source
   for derived ones, Garmin field for raw ones). Every derived metric in AML gets a description with its formula, units and
   citation (TRIMP, CTL/ATL/TSB, effective VO2max, marathon shape, WBGT, decoupling, speed@HR,
   predicted time). Fitted constants appear as data, not code. `anfra validate` must pass clean.
2. **Synthetic runner.** ✅ Done (stream E). The competition requires synthetic or public data.
   - `garmin-sync demo-data` writes a runner simulated *from the causal model itself* into a
     separate database `garmin_demo`, with known parameters: τ, heat coefficient, and the
     response to volume. The output has the same tables and shapes as real data, including
     per-second streams.
   - Anfra switches to it through `.anfra/data_sources.yml`, as discussed earlier.
   - The demo can then show the model *recovering* the parameters it was built with, a strong
     check for viewers.

## Phase 6 — Video (< 3 min) and submission

1. 0:00–0:20: the problem. Plans are rules of thumb, and race-day heat in HCMC is ignored.
2. 0:20–1:00: the model. The diagram, then the Overview banner and markers.
3. 1:00–1:50: the evidence. Fitted against textbook values, edge verdicts, the prediction-error
   table.
4. 1:50–2:40: the planner. Mark a race, set a goal, drag the plan, and watch the race-day
   projection move (write-back + governed metrics).
5. 2:40–3:00: why it needs Anfra. One semantic layer serves sync, the model, the apps and
   write-back.

## Risks

| Risk | Mitigation |
|---|---|
| Too few marked races to validate | Best efforts are a second set of validation points; report n honestly |
| Banister overfits with n = 1 | Out-of-sample test; keep 42/7 unless the fit beats it |
| Speed@HR is confounded by heat and HR drift | Heat adjustment, warm-up excluded, band minimum |
| Time: one day | Blocks ship in order and each leaves a working app. Banister fitting and edge tests are deferred. The synthetic runner is required, so if time runs short its streams shrink, not the runner |

## Needed from you

1. **Mark at least 3 races** with their official times on the Activities page, today, before block 4.
2. **The goal race** for the planner: name, date, distance and goal time.
3. **Confirm the synthetic runner** for the video, or name the public dataset you'd prefer.

## Race Planner v2: user model (agreed 15 Oct 2026)

- **Structure:** where you stand → what it takes → build your plan (A controls → B plan → C result),
  with charts and tables behind expand; the saved plan (step 4) collapsed.
- **Target:** if the goal is out of realistic reach, the best realistic time becomes the working
  target, with the explanation (shape and fitness the goal would need vs what a safe plan reaches).
- **Controls:** runs per week (life constraint), quality sessions, longest long run, weekly increase,
  taper. Peak volume follows from them. The plan picks the quality session type per phase.
- **Ranges:** per control, the time at each value with the others held; zones from the evidence
  (injury) and from freshness; minutes per step; "more changes nothing" where it is flat.
- **Race fitness** comes from the plan's training load (fitted response), not an assumption.
- Done: model fit, plan generator v2 (runs per week, peak phase, spike rule, sessions with paces),
  engine (best realistic, target, zones), SQL forecast with the same projection, UI.
- Open: quality sessions have no effect of their own beyond their load (the evidence gives no
  per-session VO2max gain to use); the freshness term is a flat 2 % and under-rates the taper,
  so the taper is limited to the evidence's lengths.

