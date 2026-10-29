# Ran: run far with Anfra

A running coach on your Garmin data: how your runs went, how your training is going, and whether you can reach your goal race, with a plan built from a causal model of race performance.

- Demo: https://ran-demo.pages.holistics.dev
- Video: https://media.holistics.io/anfra/demo/ran-demo.mp4
- Author: Tai Nguyen

## Run it

Open the demo above, or run it yourself on the synthetic runner (Postgres 15, Python with uv, Node 22+ and pnpm, anfra):

```sh
scripts/setup_local_db.sh                     # roles, database, schemas; writes .env and .anfra/data_sources.yml
uv run garmin-sync demo-data --seed 7 --goal-weeks 9 --next-race-days 5 --goal 3:39:59
# point anfra at it: dbname: garmin_demo in .anfra/data_sources.yml
uv run garmin-sync dev                        # anfra serve --no-apps (:7878) + host (:5173)
```

Open http://localhost:5173. [Deploy (read-only demo)](#deploy-read-only-demo) builds the same thing as one container. With your own Garmin account, see [Quick start](#quick-start).

## Data

A fictional runner generated from Ran's own causal model (`garmin_sync/demo.py`): two years of runs, per-second streams, laps, weather, daily wellness, past races and a goal marathon, on real Ho Chi Minh City streets from OpenStreetMap (© OpenStreetMap contributors, ODbL). No real person's data is in this folder; see [Synthetic runner](#synthetic-runner-demo-data).

---


Ran syncs a runner's full Garmin Connect history into Postgres and analyses it with Anfra. The
metrics are modelled in AML, and the Data Apps run on them. Runalyze inspired the analysis. Ran
goes further by grounding training *planning* in an explicit causal model of race performance:
what determines a race result, and how each kind of training moves those determinants.

Ran answers three questions a runner asks, one page each. Each page leads with a plain answer;
the numbers behind it (load, form, model terms) open on click or in folded sections.

1. **How did my runs go?** (`apps/running/activities.html`) Every activity, filterable. A run opens
   with a large route map, the key numbers (distance, pace, time, elevation, heart rate, TRIMP,
   laps, effect) and **Ran's take**: a short written read of the run with the facts behind it as
   chips. It says whether the run followed the saved plan, how efficient it was (pace at easy heart
   rate against your 28-day norm) and what affected it (heat with your own heat coefficient, hills,
   how tired you started, sleep, resting HR). Below that, the pace / heart-rate / elevation chart
   and tabs: splits and laps as bars, **Effort** (the run's TRIMP and the week's against its usual
   range, 0.8–1.3 × the 4 weeks before), pace zones (bands around your threshold pace that day) and
   heart-rate zones (Garmin's, with their bpm ranges), and the lap table, where each lap is tagged
   warm-up, interval, tempo, rest, easy or cool-down (detected from its pace against threshold, its
   length and its place in the session, as Garmin marks nearly every lap "interval") and can be
   filtered by type, with the filtered laps' totals. Hovering the map, the chart or a split moves
   the other two. All other numbers are folded under *All numbers*; *mark as race* is at the bottom.
   The detail is one component, `apps/running/activity-detail.js` (+ `.css`), that the Overview opens
   too.
2. **How is my training going?** (`apps/running/overview.html`) This week and this month against
   your usual week and month and against the saved plan; **too much or too little?** (load against
   what your body is used to, A:C 0.8–1.3); **rest until ready to train** (rest days until form is
   back above TSB −30) and **rest until fully fresh** (until TSB +5, racing at 100 %); what you could
   race today; and **what to improve** for the goal race (the limiting determinants, biggest time
   cost first). Each number opens its history and explanation (`apps/running/metrics.js`). *Run
   distance* splits its bars by heart-rate zone or pace zone (`garmin.activity_zone`, from the
   per-second samples: `db/views.d/50_activity_zone.sql`) and opens a modal: a bar's runs, and a
   run's detail; a best effort opens its run. The
   full current-form banner, more charts and the model evidence are folded.
3. **Can I reach my goal?** (`apps/running/planner.html`) One goal per race. When it is out of safe
   reach, the page says so and offers the smallest safe change that still reaches it (e.g. skipping
   the tune-up race), the safe plan's time as the goal, or keeping the goal past the injury limits
   after ticking that you understand the risk. Then, top to bottom: **you now → the difference →
   your goal**; **How you'll train** (weekly increase, longest long run and biggest week first, then
   the other settings by how much one step moves the race time, each step a button showing its
   effect and zone); **What gets you faster** (endurance and race fitness, today → race day, with the
   minutes each is worth; race-day weather and fresh legs as notes; "How it works" for the model);
   **Your weeks** (each week's km by zone, from the sessions' main sets, over the phase band; a week
   shows its days, and *Where each phase takes you* shows the race time, endurance, fitness and
   threshold after each phase). The saved plan, its week editor and planned vs done are folded
   below. See [The planner](#the-planner).

The plan to finish the model is in [docs/PLAN.md](docs/PLAN.md).

## Tests

`uv run pytest` checks properties the Race Planner must hold for any runner and horizon, on synthetic
runners (`tests/test_planner_properties.py`): a plan never forecasts slower than racing today, more
time or more volume never makes it slower, the safety rules hold in every plan (long-run spikes,
weekly increase, biggest week, easy-run sizes, runs per week, taper), the structure matches the
time left, and the recommendation reaches the goal with no more km than the fastest safe plan.
Phase paces get faster (or hold) as the plan goes on, every run per week is kept (easy runs share
what the quality sessions and long run leave), and each phase's expected results are consistent with
the race-day forecast. About 410 checks; known model limitations are marked as expected failures (4). `RAN_DB_TESTS=1 uv run pytest
tests/test_db_consistency.py` also checks, on a throwaway copy of the database, that the preview and
the saved plan's SQL forecast match exactly.

## Architecture

```
Garmin Connect ──▶ garmin_sync (Python, ──▶ Postgres ─────────────▶ AML models ──▶ Data Apps
Open-Meteo     ──▶   offline CLI: sync,       raw.*    JSON as fetched   datasets/      apps/running/
                     fit, demo-data)          garmin.* typed views,      running        (read only,
                                                       samples, day,                    through AQL)
                                                       the planner (SQL)
                                              app.*    races, saved plan
```

The apps only read: every number on every page, the Race planner's plans included, is an AQL query.
Python runs offline, to fill the database (`garmin-sync sync`, `fit`, `demo-data`); nothing calls it
while a page is open, and nothing a page does writes back.

The Data Apps run in **Ran's host** (`host/`), vendored from
[anfra-host-example](https://github.com/holistics/anfra-host-example): a React page with a sidebar
(`apps/_meta.yaml` names the folder, icons and order), the inspector and exports, and a Node
server (Hono) that is the one origin the browser talks to:

```
browser (:5173)                 host server (host/server)             behind it, loopback only
┌───────────────────┐  /api    ┌──────────────────────────────┐ ───▶ anfra serve --no-apps (:7878)
│ page (React)      │  /host   │ core API allowlist, apps/,   │
│  └ frame: Data App│          │ exports, live reload         │
└───────────────────┘          └──────────────────────────────┘
```

The three apps are tabs in the host's top header (no sidebar), in `_meta.yaml` order; `/` opens
Running Overview. The host's own change is `host/server/config.ts` (`ANFRA_REPO` defaults to Ran's
repo).

- **`raw`**: Garmin and Open-Meteo responses, stored unchanged. Only `garmin_sync` writes here.
- **`garmin`**: typed views over `raw`. The derivations (pace, effective VO2max, Banister
  load, WBGT, race candidates) are SQL in `db/views.sql`. `garmin.day` is a materialized view
  refreshed after every sync.
- **`app`**: what the runner keeps by hand: races and goals (`app.race`), weigh-ins, a saved plan
  (`app.plan_day`, written offline by `garmin_sync/planner.generate_plan`). Anfra connects as the
  read-only `anfra_reader`.

## Quick start

```sh
brew install uv postgresql@15
scripts/setup_local_db.sh        # roles, database, schemas; writes .env and .anfra/data_sources.yml
uv run garmin-sync login         # Garmin tokens are saved to ~/.garminconnect
uv run garmin-sync sync          # the first run backfills all history and resumes if interrupted
uv run garmin-sync dev           # anfra serve --no-apps (:7878) + host (:5173)
```

Open http://localhost:5173. The host needs Node 22+ and pnpm (`garmin-sync dev` runs `pnpm install`
in `host/` the first time); `garmin-sync dev --builtin` uses anfra serve's own pages at
http://127.0.0.1:7878/apps/ instead. The host's checks: `cd host && pnpm typecheck && pnpm test && pnpm lint`. New Garmin data comes in
with `uv run garmin-sync sync` (run it by hand or from cron); the pages show it on their next load.
A sync holds a Postgres advisory lock; a run left "running" by a killed sync is marked aborted when
the lock is free, so it never blocks the next one. The host reloads an app only when its file under
`apps/` or the AML changes.

`.env` and `.anfra/data_sources.yml` hold credentials and are git-ignored. Copy
`.anfra/data_sources.yml.example` on another machine.

## Synthetic runner (demo data)

For demos and the competition video, which allow only synthetic or public data, Ran can generate
a fictional runner *from its own causal model*:

```sh
uv run garmin-sync demo-data                # (re)creates database garmin_demo; ~15 s
uv run garmin-sync demo-data --seed 11      # another runner; the same seed gives the same data
# the demo video's runner: a 10K on the coming Sunday (no goal: Ran names the target) and the goal
# marathon 9 weeks out with a goal of 3:39:59 (see docs/video-storyboard.md)
uv run garmin-sync demo-data --seed 7 --goal-weeks 9 --next-race-days 5 --goal 3:39:59
```

- **What it writes:** two years of training in a hot tropical city in Garmin's own shapes:
  - activity summaries, per-second streams (2 s), laps and workout steps;
  - Open-Meteo weather documents and daily wellness;
  - threshold history and race predictions;
  - weigh-ins, four marked races and an upcoming goal marathon.

  Every view, AML model and app works on it unchanged. No real person's data and no network calls
  are involved.
- **Where it runs:** real streets and park paths in Ho Chi Minh City, from OpenStreetMap
  (© OpenStreetMap contributors, ODbL). The routes are:
  - the Vinhomes Central Park riverside loop;
  - the Nhiêu Lộc–Thị Nghè canal;
  - the streets around Tao Đàn park;
  - Lê Văn Tám park;
  - a 400 m track in Quân khu 7 stadium;
  - a long out-and-back from Vinhomes to Bạch Đằng wharf.

  The ground is flat, with humps on bridges. Runs slow at corners and turnarounds, walk at an
  occasional crossing, and carry GPS and barometer noise. `scripts/demo_routes.py` builds
  `garmin_sync/demo_routes.json` once.

- **Its size:** about 450 runs, 100 strength sessions and 700k samples.
- **Owner and grants:** the database is owned by `garmin_sync` and readable by `anfra_reader`,
  as `scripts/setup_local_db.sh` sets up for the real one.
- **Sync protection:** it is marked as a demo, so the Garmin sync refuses to write into it.

**Point Anfra at it** by changing `dbname: garmin` to `dbname: garmin_demo` in
`.anfra/data_sources.yml`. The file is read on every query, so no restart is needed; change it
back for your own data. Leave `.env` alone: `garmin-sync sync` keeps writing to the real database.

**The true parameters** are stored in `raw.doc` under the key `demo_truth`, so a fit can be
checked against them:

| Determinant | How the simulation sets it | True value |
|---|---|---|
| Load | Banister TRIMP from each run's HR stream, female weighting `0.86·e^(1.67x)`; HRmax 188, resting ~55 | — |
| D1 VO2max (D5 Banister) | `38 + 0.15·fitness − 0.06·fatigue`, EWMA of daily TRIMP | τ fitness **38 d**, τ fatigue **9 d** (not 42/7) |
| D2 threshold | fraction of VO2max = `0.79 + 0.07·min(1, threshold-effort minutes in 42 d / 180)` | 0.79–0.86 |
| D3 economy (hidden) | speed × `1 + 0.04·min(1, strength sessions in 70 d / 16)` | up to +4 % |
| D4 durability | decoupling % = `1.5 + 6·e^(−long-run km in 56 d / 80)`, +0.25 %/°C WBGT over 28 | 1.5–7.5 % |
| D6 heat | speed at a given effort −**0.7 % per °C** WBGT above **18 °C** | 0.7 %/°C |
| HR | `HRmax·(0.64·%VO2max + 0.37)`, rising through the run by the decoupling | — |
| Garmin's estimates | VO2max = true + 2.5 (heat-blind); race predictions from it | — |
| Races | Daniels time at `VO2max·economy·(fraction/0.82)^0.3`, slowed by heat and (HM/M) durability, ±1 % | per race in `demo_truth.races` |
| Resting HR | lower with fitness, higher with fatigue, ±2.6 bpm noise, up to +9 bpm during three colds | — |

The goal marathon's time is set 3–8 minutes faster than today's fitness predicts, so the
planner has a real gap to close.

## Deploy (read-only demo)

One container holds the synthetic runner, anfra and the host: all three apps, the Race planner
included, as they run locally (every page reads through AQL; there is no Python in the image and
nothing is written back). It runs on Holistics' prototype platform
([proto](https://docs.pages.holistics.dev/)).

```sh
deploy/dump-db.sh      # a fresh runner up to today (database garmin_deploy) and its marathon plan
docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t ghcr.io/<owner>/ran-demo:<tag> --push .
proto deploy --image ghcr.io/<owner>/ran-demo:<tag> --name ran-demo
```

- **The image:** Debian trixie, as anfra's sidecars need its glibc. Postgres 15 holds the sample,
  restored at build. anfra reads it as `anfra_reader`, which is read-only with a 30 s timeout.
  JIT is off. The host listens on 8080.
- **The data's dates:** they end the day `dump-db.sh` ran. Rebuild to bring them up to today.
- **On an Apple-Silicon Mac:** try it with `--platform linux/arm64`. anfra's sidecars crash
  under Rosetta's amd64 emulation.

---

## The causal model of race performance

Ran plans training from a model, not from rules of thumb. The literature fixes the model's
**structure**: which factors matter, and the direction of each effect. The runner's own data
sets the **size** of each effect (see [Making it rigorous with n = 1](#making-it-rigorous-with-n--1)).

### Layer 0 — the outcome

**Race time = f(distance, the runner's state on race day, conditions, execution)**

### Layer 1 — what determines race time

The classic physiology model (Joyner & Coyle) has three engines [1][2]:

- **VO2max**, the aerobic ceiling.
- **Fractional utilisation**, the share of VO2max a runner can sustain (their threshold).
- **Running economy**, speed per unit of oxygen.

Recent work adds **durability**, how well those hold up late in a long race, as a fourth
determinant [3]. On race day, freshness, conditions and execution act on top of all four.

| # | Determinant | Effect on the result | Measurable? | How Ran measures it | Status |
|---|---|---|---|---|---|
| D1 | **Aerobic capacity (VO2max)** | Sets the ceiling | ✅ | Garmin VO2max, and *effective VO2max* from pace against HR (Daniels), calibrated on races | built, calibrated (the forecast's base) |
| D2 | **Threshold / fractional utilisation** | % of the ceiling held for 1–4 h | 🟡 | Garmin threshold HR, pace and power history; your own pace at threshold HR (42-day median); **fractional utilisation** = threshold speed ÷ speed at VO2max | built |
| D3 | **Running economy** | Speed per unit of oxygen | ❌ hidden (needs a gas-analysis lab): we see its effect, never its value | Proxies: pace at easy HR (D1 + D3 together), ground contact, vertical ratio, cadence | proxies built |
| D4 | **Durability** | Late-race drift; dominant over HM and M | ✅ | **Aerobic decoupling** (efficiency, first half against second) on steady runs of 60 min+. In 82k marathoners, adding it to the prediction cut error from 6.45% to 5.16% [4] | built |
| D5 | **Freshness on race day** | Fitness minus fatigue | ✅ (as a model) | Banister impulse-response on **TRIMP from per-second HR** (`garmin.activity_load`), r ≈ 0.6–0.7 with performance in runners. It fits data rather than describing physiology, and it is **sensitive to the load metric** [5]. Garmin's load is kept alongside for comparison | built (TRIMP) |
| D6 | **Heat and humidity** | Slows progressively from 5 to 25 °C WBGT, more for slower runners [6] | ✅ | Open-Meteo weather for every outdoor activity → WBGT; a forecast for race day | built |
| D7 | **Course (elevation, surface)** | Climbing costs time | ✅ | GPS elevation; grade-adjusted pace | built |
| D8 | **Execution (pacing, fuelling)** | Going out too fast → late collapse | ❌ before / ✅ after | After: second half vs first; for workouts, the main set's rep spread and fade. Before: the plan sets the target, so each session can be compared with it (planner). Workout definitions are saved at sync from now on | built (after); planner compares |
| D9 | **Body mass** | ~1–2 % per kg, small for a light runner | 🟡 sparse | Garmin weigh-ins plus **weigh-ins logged in the app** | built |
| D10 | **Injury or illness** | Overrides everything | ❌ | **Caution flags**, never predictions: load ramp (A:C > 1.5), monotony > 2, no day off in 7, resting HR up (3-day mean over the 28-day median by 5 bpm and one SD). The A:C ratio is contested [7] | built |

### Layer 2 — how training changes the determinants

| Training input | → Determinant | Evidence and time lag | In the data? |
|---|---|---|---|
| **Easy volume** (km/week, Z1–Z2) | D1 slightly; D3 and **D4 strongly** | The strongest single training predictor of marathon pace, with diminishing returns. Tanda: weekly km over 8 weeks plus training pace, ±4 min [8]. Mileage helps at every distance (Vickers) [9]. Lag: months | ✅ |
| **Long runs** (≥ 90 min) | **D4** | The mechanism is plausible and coaching consensus is strong, but direct trial evidence is thin [3] | ✅ decoupling per long run |
| **Threshold sessions** (Z3–Z4) | **D2** | Consistent with the physiology; tempo work is associated with short-race speed [9] | ✅ zone time, laps |
| **VO2 intervals** (Z5) | **D1** | Gains over 4–12 weeks, but **individual responses vary widely** [10]. Intensity distributions end up about equal after 12+ weeks [11] | ✅ |
| **Intensity distribution** | D1, D2 | Small or no difference between distributions in the long run [11] | ✅ |
| **Strength and plyometrics** | **D3** | 2–3 sessions a week for 8–12 weeks improves economy; moderate certainty [12] | ✅ strength sessions |
| **Total load** | **D5**: fitness (τ ≈ 42 d) and fatigue (τ ≈ 7 d) | Banister [5] | ✅ |
| **Taper** | **D5** | 41–60% less volume, intensity unchanged, for up to ~3 weeks → significant time-trial gains [13] | ✅ plannable |
| **Load spikes, monotony** | **D10** risk | Contested; shown as caution flags, never as predictions [7] | ✅ |
| **Sleep, resting HR, HRV** | D5, recovery | Plausible; this history has resting HR but little sleep or HRV data | 🟡 |

### How the measured determinants are computed

| | Measure | Rule (all in `db/views.sql`, documented in AML) |
|---|---|---|
| D1+D3 | Pace at easy HR | Median grade-adjusted pace at 77 % HRmax ± 5 bpm, after the first 10 min, on steady non-workout runs with 5+ min in the band; 28-day median |
| D2 | Garmin threshold | Lactate-threshold HR, speed and power, as in force each day |
| D2 | Own threshold pace | Median grade-adjusted pace at that day's threshold HR ± 3 bpm (3+ min in the band); 42-day median |
| D2 | Fractional utilisation | Threshold speed ÷ speed at VO2max; speed at VO2max from Daniels' oxygen-cost curve `VO2 = −4.60 + 0.182258·v + 0.000104·v²` (v in m/min) |
| D4 | Decoupling | (speed/HR of the first half − second half) ÷ first half, after 10 min, steady runs ≥ 60 min, no workouts |
| D8 | Second half vs first | Time of the second half of the distance vs the first, in % |
| D8 | Rep spread / fade | The workout's main set (its most repeated step): pace coefficient of variation, and last third vs first third |
| D5 | TRIMP | Σ Δt_min · HRr · a·e^(b·HRr), HRr = (HR − HRrest)/(HRmax − HRrest); Δt capped at 10 s; HRrest = that day's resting HR (else 30-day median); a, b by sex from the Garmin profile. No samples: the same on average HR; no HR: Garmin load × the median TRIMP/Garmin ratio |
| Validation | Best efforts | Fastest 1K / 5K / 10K / HM / M inside any run (`garmin_sync/markers.py`): timer time, end interpolated between samples, GPS jumps (speed > 7 m/s over ±5 samples) removed. Ranked and PB-marked among outdoor runs only |
| D9 | Weight | The latest weigh-in, Garmin or the app, carried forward |
| D10 | Flags | See the D10 row; Garmin's daily resting HR varies by ~8 bpm, so its bar is personal |

### Diagram

```
 TRAINING (you control)              DETERMINANTS                         RACE DAY
 ─────────────────────               ────────────                         ────────
 easy volume ──────────┬──────────▶ D3 economy* ───────────┐
                       ├──────────▶ D4 durability ─────────┤
 long runs ────────────┘                                   │
 threshold work ──────────────────▶ D2 threshold ──────────┤
 VO2 intervals ───────────────────▶ D1 VO2max ─────────────┼──▶ potential ──┐
 strength / plyo ─────────────────▶ D3 economy* ───────────┘    (fitness)    │
                                                                             ├──▶ RACE TIME
 total load ──▶ fitness (τ42) ─┐                                             │
            └─▶ fatigue (τ7) ──┴──▶ D5 freshness (TSB) ──────────────────────┤
 taper ──────────────────────────────▲                                       │
 load spikes / monotony ──▶ D10 injury risk (gate) ──────────────────────────┤
                          D6 heat · D7 course · D8 pacing (exogenous) ───────┘
                                                        * = not directly measurable
```

### Making it rigorous with n = 1

One runner's data cannot prove causation on its own, so Ran combines the two sources of
evidence:

1. **The literature sets the structure**: the diagram above, and the sign of each edge.
2. **Performance markers set the size of each effect.** Races are rare, so Ran tracks
   two repeatable measures of "how fast am I right now":
   - **Speed at a fixed HR** on easy runs, adjusted for heat. It combines D1 and D3 and gives a
     weekly trend.
   - **Best-effort segments**: the fastest 1K, 5K, 10K and HM inside any run, from the
     per-second data. They are race-like points for validation.
3. **Banister is fitted to the runner.** Its gains and time constants are fitted to the
   markers instead of the textbook 42/7 days. Load is **Banister TRIMP** computed from
   per-second HR, so the formula is transparent and lives in AML.
4. **Validation on real races.** The runner marks races in the app, with their official times. A
   prediction method is trusted for planning only if it reproduces those times. Ran compares
   Daniels/VO2, Riegel, Tanda and Garmin.

### Decisions taken

| Question | Decision |
|---|---|
| Which activities were races? | The runner marks them in the app (`app.race`). Ran suggests candidates: standard distances run at ≥ 85% HRmax |
| Load metric | Banister TRIMP from per-second HR, built in-house. Weighting by sex is read from the Garmin profile (men 0.64·e^1.92x, women 0.86·e^1.67x) |
| Performance marker | Both: speed at a fixed HR (weekly trend) and best efforts (validation) |
| Heat | Core, not an extra (the runner trains in HCMC, where WBGT is about 30 °C). Hourly weather comes from Open-Meteo (free, no key); WBGT is estimated with the BoM shade formula `0.567·T + 0.393·e + 3.94`. Indoor runs get no adjustment |

### What the data says so far

`garmin_sync/model.py` fits these after every sync (or `garmin-sync fit`). The Overview page shows
them under *Model evidence*, and they are queryable as `model_param`, `heat_fit_point` and
`prediction_check`.

**Heat (D6).** Pace at a fixed easy HR (77 % HRmax) on 119 steady outdoor runs, regressed on WBGT
with a fitness trend over time (knots every 180 days) and run length:

| Fit | % slower per °C WBGT | 95 % interval |
|---|---|---|
| **Primary** (fitness trend + run length) | **0.55** | −0.30 to 1.14 |
| Check: CTL in place of the trend | 0.18 | −0.73 to 0.87 |
| Check: efficiency (GAP speed / HR), all 306 steady runs | 0.20 | −0.92 to 1.27 |
| No fitness control | 1.25 | 0.34 to 2.12 |
| Ely et al. 2007, 5–25 °C [6] | 0.18 (top men) to ~0.64 (300th place) | |

- **The estimate falls inside the published range.** Its interval includes 0, so this data cannot
  pin the heat effect down.
- **Why:** these runs only span 23–33 °C WBGT, with a standard deviation of 1.8 °C. Almost every
  run is hot.
- **The first look was confounded.** Before this fit, a simple comparison suggested about 5 %
  lower efficiency in heat. The naive fit, with no fitness control, gives 1.25 % per °C. Both
  overstate the effect, because fitness and season moved together with heat.
- **How the estimate varies with trend flexibility:** knots every 90 days give 0.97 %, every 365
  days 0.89 %, and a single straight trend 1.01 %.
- **Practical reading:** treat heat as about 0.5 % per °C of WBGT, with real uncertainty. A race at
  26 °C, against training at about 30.5 °C, is worth roughly 2 % from heat alone.

**Race-time predictions (validation).** The runner marked 9 past races: 6 half marathons, 2 10Ks
and 1 marathon (March 2026, 4:38). Each race is predicted from data up to the day
before. "Calibrated" scales a method by the runner's actual ÷ predicted ratio over *earlier* races
only:

| Method | Mean abs. error | Bias | Races |
|---|---|---|---|
| **Daniels from effective VO2max × marathon shape, calibrated** | **3.7 %** | −3.0 % | 8 |
| **Causal model (the above + heat), calibrated: the forecast** | **4.0 %** | −2.7 % | 8 |
| Daniels from effective VO2max, calibrated | 5.9 % | −1.0 % | 8 |
| Garmin race prediction, calibrated | 6.2 % | +3.4 % | 8 |
| Daniels from effective VO2max × marathon shape | 6.7 % | −6.2 % | 9 |
| Riegel (1.06) from the previous race | 7.9 % | +3.8 % | 8 |
| Garmin race prediction | 12.0 % | −12.0 % | 9 |
| Daniels from effective VO2max | 13.1 % | −13.1 % | 9 |
| Tanda, from the actual 8 weeks before (marathon only) | 13.6 % | −13.6 % | 1 |

Bias: mean of (predicted − actual) / actual; negative = too fast.

- **Endurance volume is the missing piece of plain Daniels.** Runalyze's marathon-shape factor
  ([source](https://github.com/Runalyze/Runalyze/blob/support/4.3.x/inc/core/Sports/Running/Prognosis/VO2max.php)):
  usable VO2max = VO2max × min(1, 0.6 + 0.4 × (1 − (distance^1.23 − shape) / 100)). With it, the
  spread of actual ÷ predicted across the runner's races halves (SD 0.092 → 0.041). On the
  marathon, plain Daniels was 39 % too fast; with the shape factor, 12 %, in line with the halves.
- **Calibration removes the steady bias.** Even with the shape factor, the runner runs about 7 %
  slower than the formulas (8 % with heat). The bias is steady, so it is the n = 1 step: what is
  constant about this runner (economy, pacing) beyond the formulas.
- **Heat does not improve accuracy on past races** (4.0 % vs 3.7 %). The runner's effective
  VO2max is measured on runs in about 30 °C, so it already reflects the heat. The forecast keeps
  the heat step because the causal model says race-day heat matters and a cool race (Tokyo in
  March) differs from training more than any past race. The band is the forecast's own error.
- **The sample is small.** 9 races, one marathon, so the ranking is indicative.

### The planner

The Race Planner turns the model into a plan for one goal race. All of its numbers are SQL, read
through AQL: the forecast and the saved plan (`db/views.d/30_plan.sql`), and the plan built from the
runner's settings (`db/views.d/60_scenario.sql`). Every constant, with its source, is in
`garmin.planner_param`.

**Settings as filters.** Each setting (runs a week, biggest week, quality sessions, longest long
run, weekly increase, taper, build-up, tune-up race, this week's km) is a dimension of the
`scenario_*` models, over a grid of every value it can take (`garmin.scenario_grid`). A slider sets
its filter; Postgres pushes each filter into its `generate_series`, so a query computes only the one
combination asked for (about 30 ms for a plan, 0.3 s for the sweeps of every setting). The
models: `scenario_result` (the forecast and its terms), `scenario_week`, `scenario_day`,
`scenario_phase` (what each phase leaves you with) and `scenario_sweep` (each setting's race time at
each of its values: the sliders' zones). The recommended settings per race and runs a week are a
materialized view (`garmin.scenario_best`), refreshed by `garmin-sync fit`.

**The Python reference.** `garmin_sync/planner.py` and `garmin_sync/scenario.py` stay as the
reference the property tests check; `tests/test_scenario_sql.py` runs the SQL on the same synthetic
runners and requires the same days, sessions and notes, weekly km within 0.1 km and race times
within 1 %. A plan is saved into `app.plan_day` offline (`planner.generate_plan`); the app only
shows it.

| Rule | Value | Evidence |
|---|---|---|
| Start | the current week, filled up to *This week* (default: last complete week or the 2-week average, whichever is higher) | — |
| Ramp | the weekly increase is a maximum; caution over 10 %, risk over 20 %; every 4th week lighter | ProjectRun21 [7] |
| Long run | ≤ 10 % over the longest of the previous 4 weeks, ≤ half the week, ≤ the chosen longest | Garmin-RUNSAFE 2025; durability (D4) [3] |
| Runs per week | kept: the long run and the quality sessions are the key sessions, every other run is easy | — |
| Quality | 0–2 a week, type by phase; shrink (main set scaled, to about 6 km) before a run is dropped | Intensity mixes end up about equal over 12+ weeks [11] |
| Strength | 1 session a week, none in race week | Economy (D3) [12] |
| Taper | 2–3 weeks for a marathon, intensity kept; a half 80 % then 50 % | 41–60 % less volume [13] |

**Projection.** Up to today: load, fatigue, fitness and form from `garmin.day`. After today: the
plan's estimated load, carried forward with the same 7/42-day constants. A planned session's
load is its minutes × the runner's median load per minute for that kind of session over the
last year (`garmin.session_profile`). Minutes come from km at the runner's typical pace for that
kind of session when only km is given. The race-morning target is form of 10–30 % of fitness.
This is Allen & Coggan's +15 to +25 made independent of the load metric's scale, so it holds when
the load moves to TRIMP.

**Forecast: the causal model** (`garmin.race_forecast`):

```
time = Daniels(effective VO2max × shape factor, distance)   D1 (economy D3 inside), Volume
       × calibration to the runner's races                  constant about the runner
       × (1 + heat % per °C × (race WBGT − training WBGT))  D6
       × (1 + taper gain, if the plan misses the form band)  D5
```

- **Effective VO2max:** today's (`garmin.day`). It is not projected forward: the forecast is
  "if fitness stays where it is".
- **Marathon shape:** today's without a plan. With a plan, on race eve, from the runs so far plus
  the plan's runs, with the same formula as `garmin.day`. This is how the plan moves the forecast.
- **Calibration and band:** `garmin-sync fit` checks this exact method on every marked race from
  earlier races only (`calibration_daniels_shape_heat`, `mape_daniels_shape_heat_calibrated`).
- **Heat:** race WBGT = mean of past outdoor runs that month starting 03:00–08:59; training =
  monthly WBGT over the 8 weeks before the race; coefficient fitted (0.55 % per °C).
- **Taper:** about 2 % (Bosquet 2007 [13]; Mujika & Padilla 2003 report ~3 %), applied only when
  the plan projects race-morning form below the band, since the calibration already reflects the
  runner's usual taper.
- **Not separate terms:** threshold (D2) is inside Daniels' standard curve, durability (D4) inside
  the shape and the calibration. They stay in "What limits you" as diagnostics.
- **Comparisons** shown next to it: Garmin's prediction (raw and calibrated) and, for a marathon
  with a plan, Tanda [8]: `Pm = 17.1 + 140·e^(−0.0053·K) + 0.55·P`.
- **Time cost of each gap:** volume = forecast − forecast with the shape met; race fitness (D1) =
  forecast with the shape met − goal; taper and heat = their adjustments.

**Starting point.** A plan starts with the current week: its days so far are history, and the
remaining days fill it up to the *This week* control. Its default is the last complete week or the
average of the last 2 complete weeks, whichever is higher, so a runner who just ran 50 km is not
sent back to 45; the long run starts from the longest of the last 4 weeks. A raw 28-day average
would count a missed week and the first days of the current one. *This week* is a caution over
+10 % on last week and a risk over +20 %. The weekly increase starts next week.

**Runs per week are kept.** The long run and the quality sessions are the key sessions; every other
run is easy and they share what is left of the week (at least 2 km each). When a lighter week cannot
hold them all, quality sessions shrink first (main set scaled, to about 6 km); a run is dropped only
after that, and the week says so. Each phase shows its easy runs per week and their size; an easy run
under 5 km says it can go on any free day or be added to a quality day's warm-up or cool-down.

**Session paces progress per phase.** Threshold and interval paces come from the runner's measured
paces, scaled at each phase's start by the race fitness the plan projects then (Tokyo: threshold
4:55 /km in base, 4:46 in build, 4:38 at the peak). After every sync, at the start of a new phase,
`update_phase_paces` re-anchors the remaining sessions to the fitness actually measured (ratio of
measured to planned), so a runner who improves faster or slower gets matching paces.

**A planned taper keeps endurance.** The marathon-shape formula reads a taper's lighter weeks as
lost endurance (Tokyo: 79 → 74 % in race week, about 4 minutes), while 2–3 week tapers keep or improve
performance (Bosquet 2007; Mujika & Padilla 2003). So a plan's race day, taper and race week use the
higher of the formula's value and the best of the day before the taper and the same weekday 1 and 2
weeks earlier, while those days are still ahead (`scenario.pre_taper_shape`, the same in
`garmin.race_forecast`). Past races, the calibration and today's numbers keep the formula as it is:
holding the shape in the backtest too gave 4.14 % mean error against 3.83 % (8 races, none with a
real taper drop: their race-eve shape was only 0.4–3.3 points below the 3-week high), so it is not
applied there. A plan saved before plan days carried their phase gets the rule once saved again.

**Each phase has a purpose and expected results.** The phase card says what it is for (base:
aerobic volume and the long run; build: threshold and VO2max work on top; peak: race-specific
sessions; taper: freshness). Behind *Expected by the end* sit the marathon shape, effective VO2max,
threshold pace, fitness (CTL), fatigue, form, the week's km and longest run, and the race time if
raced then. The evidence for one focus per phase is weak: a meta-analysis of block periodisation
(Mølmen 2019, 6 studies) found a small VO2max advantage (SMD 0.40, CI 0.02–0.79) at low certainty,
and reviews call periodisation tradition-led (Kiely 2012/2018). So a phase *emphasises* one quality;
easy volume continues in every phase.

**Long plans.** Phases are sized to the time (13+ weeks before the taper: base ~40 %, build
~35 %, a 3-week peak). The build-up is the runner's choice: *gradual* (the biggest week arrives at
the start of the peak, the weekly increase a maximum; the long run reaches its longest about 4 weeks
before the peak ends, then alternates with medium-long runs, giving 3–5 runs of that length) or
*front-loaded* (volume rises at the weekly increase until the biggest week; the long run stays at its
longest). Both respect the injury evidence's limits and no study compares them, so the
recommendation searches both.
A tune-up race (half marathon before a marathon, 10K before a half) sits 6 weeks before race week
in a lighter week, on by default for 12+ week plans, and counts toward the marathon shape. The
marathon-shape formula rewards early volume, so a gradual build forecasts slower (Tokyo: 4:05
against 3:55 for the fastest safe plans).

**Structure by time left.** With up to 3 weeks before the taper there is too little time to build
fitness, so the plan *sharpens*: volume and long run held, race-pace reps and threshold. With 4–7
weeks: build, peak, taper. With 8 or more: base, build, peak, taper. The taper is 2–3 weeks for a
marathon; for a half marathon and shorter it is gentler (80 % then 50 % of the peak, about 10
days), inside the 8–14 days Bosquet 2007 found best (the evidence does not separate distances well).

**The planner's user model.** One question per step, details behind expand:
1. *Where you stand:* you today. The race time if the race were today (today's effective VO2max
   and marathon shape through the same model, in the race's conditions, no plan), race fitness,
   endurance and the current load. The plan's result belongs to steps 3 and 4.
2. *What it takes:* the goal turned into what is needed on race day. The best realistic plan (every
   control in the evidence's safe zone, race morning fresh, the runner's runs per week kept) sets
   the working target; when the goal is out of reach, it is explained as the marathon shape and
   race fitness it would need, against what a safe plan reaches.
3. *Build your plan:* A · what the runner controls → B · the plan (phases and their sessions) →
   C · race-eve marathon shape and race fitness → time. Computed in SQL (`scenario_*` models,
   `db/views.d/60_scenario.sql`) with the same formulas as `garmin.race_forecast`, which then
   matches it exactly for the saved plan.

**The recommended plan.** When a safe plan can reach the goal, the planner recommends the one
that reaches it with the **least effort**: total running km over the plan (ties: fewer quality
sessions, then a lower biggest week), with every control in its safe zone, race morning fresh and
the runner's runs per week kept. For each combination of weekly increase, longest long run,
quality and taper, bisection finds the smallest biggest week that still reaches the goal; the
lowest-effort result wins. It reaches the goal on the forecast, not with a margin (±4 %). When no
safe plan reaches the goal, the recommendation is the fastest safe plan, and its time becomes the
working target. Controls take exact values (1 km, 1 %); the strips show coarser steps as a guide.

**Effort slider.** The quick way to set the controls: each position is the fastest safe plan for
an amount of running (total km to race day), the Pareto front of every safe, fresh combination
of the controls (biggest week in 2 km steps; about 700 plans at under 1 ms each). The track is
amber where the goal is missed and green from where it is reached; the recommended plan is
marked. It moves in km and snaps to the nearest plan (arrow keys step plan by plan); a table
compares now (the last 2 weeks), least running, the chosen position and most running: total km,
biggest week, weekly increase, longest long run and predicted time. Moving it sets every control
except the ones the runner owns (runs per week, build-up, tune-up, This week); editing a control
afterwards shows "your own mix". Both build-ups share one km scale: the part the chosen build-up
cannot reach is grey, with a note. The front is cached per race, runs per week, tune-up and build-up.

**Controls**, ranked by their evidence for marathon time: weekly increase, biggest week (default
1.25 × the runner's biggest week of the last year; beyond it is a caution) and longest long run
(they set the volume, and so the marathon shape), runs per week (kept as a life constraint;
more runs carry more volume because an easy run is at most 3/4 of the long run), quality
sessions, taper. Each shows its values coloured by zone (green safe, amber caution or race
morning not fresh, red injury risk) and what one step is worth in minutes:
- weekly increase: caution over 10 %, risk over 20 % (ProjectRun21: more injuries within 3 weeks);
- long runs: never more than 10 % longer than the longest of the previous 4 weeks (Garmin-RUNSAFE
  2025: single-session spikes over 10 % raised overuse injury), caution well beyond the distance's
  usual longest run;
- taper: only the lengths the evidence supports (2–3 weeks for a marathon);
- runs per week: caution at 7 (no rest day); quality: caution at 0.
Race pacing, fuelling, strength work and shoes matter too but are not weekly-kilometre controls.

**Race fitness responds to training** (`garmin-sync fit`, `vo2_per_ctl`): over 84-day windows,
effective VO2max changed by 0.110 per point of change in 30-day mean CTL (95 % interval
0.032–0.189, 148 windows). The projection's error is 2.7 VO2max points against 2.9 for "no change":
a real but modest effect, shown with its range.

**What limits you** (`garmin.race_limiter`) compares each determinant today with its target:

| Determinant | Measure | Target | Minutes on the forecast |
|---|---|---|---|
| D1 | Effective VO2max | what the goal needs with the shape met | yes |
| Volume | Marathon shape | distance^1.23 % | yes |
| D4 | Decoupling over 8 weeks | ≤ 5 % | diagnostic |
| D2 | Fractional utilisation | ≥ 80 % | diagnostic |
| D5 | Race-morning form | 10–30 % of fitness | yes |
| D6 | Race-day WBGT | at most what the runner trains in | yes |

Each row also has % missing, importance for the distance, typical weeks to improve (rules of
thumb, in the row's advice), whether that fits before race day, and a priority.

**Planned vs done (D8).** Each planned day is matched with that day's activities:
- **done:** at least 80 % of the planned km or minutes;
- **partial**, **missed**, **rested**, or **extra** (ran on a rest day);
- **pace against the target:** shown for easy, long and race sessions.

### Sources

1. [Joyner & Coyle 2008 (summary)](https://www.sciencedaily.com/releases/2008/07/080731173157.htm) · [Frontiers review on determinants](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.719434/pdf)
2. [VO2max, threshold and economy as predictors](https://marathonhandbook.com/vo%E2%82%82-max-threshold-or-economy-what-actually-predicts-endurance-performance/)
3. [Hunter & Muniz-Pumares 2025, durability](https://uhra.herts.ac.uk/id/eprint/26353/1/European_Journal_of_Sport_Science_-_2025_-_Hunter_-_Durability_of_Parameters_Associated_With_Endurance_Running_in.pdf) · [Durability review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11889008)
4. [Decoupling in 82,000 marathoners (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/9388405)
5. [Morton, Fitz-Clarke & Banister 1990](https://pubmed.ncbi.nlm.nih.gov/2246166/) · [Training-load methods and the fitness-fatigue model](https://opus.lib.uts.edu.au/handle/10453/122356)
6. [Ely et al. 2007, weather and marathon performance](https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/)
7. [Impellizzeri 2020, ACWR critique (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938/)
8. [Tanda 2013, marathon prediction](https://www.dovepress.com/marathon-performance-in-relation-to-body-fat-percentage-and-training-i-peer-reviewed-fulltext-article-OAJSM)
9. [Vickers & Vertosick 2016](https://synapse.mskcc.org/synapse/works/101585)
10. [Bonet et al. 2020, individual responses to HIIT (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7642248)
11. [Rosenblat 2019, polarised vs threshold](https://pubmed.ncbi.nlm.nih.gov/29863593/) · [Oliveira 2024 meta-analysis (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428)
12. [Llanos-Lagos 2024, strength training and economy (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11052887/)
13. [Tapering meta-analysis (PLOS ONE 2023)](https://www.fisiologiadelejercicio.com/wp-content/uploads/2023/05/Effects-of-tapering-on-performance-in-endurance-athletes.pdf)
