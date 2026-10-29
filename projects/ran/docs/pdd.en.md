# Ran: race planning from a runner's own data — Product Discovery Document (PDD)

*As of 15 Oct 2026 · For feedback · Vietnamese version: [pdd.vi.md](pdd.vi.md) · Requirements: [prd.en.md](prd.en.md)*

**The problem:** a recreational runner with years of watch data still cannot answer "can I run my goal
time, and what training gets me there safely?" with anything better than a generic plan and an optimistic
watch prediction. **The chosen direction:** a causal model whose structure comes from the literature and
whose numbers are fitted and validated on the runner's own history, wrapped in a planner that shows the
trade-offs. This document records how we got there and what we rejected.

## 1. Problem space

### Who

A recreational runner (the author is the first user): 3–6 runs a week, 40–60 km/week, races 10K to
marathon, wears a Garmin, trains in heat (Ho Chi Minh City, WBGT ~30 °C). Goal in this study: Tokyo
Marathon in March 2027 in 3:59:59.

### Jobs to be done

Three questions, in the runner's words (updated 21 Oct 2026):

1. *How did my runs go?* Look back over my history and at each run: did I follow the plan, was it
   efficient, and what affected it (heat, hills, fatigue, sleep)?
2. *How is my training going?* How much I ran this week and month, whether that is too much or too
   little, how many rest days until I can train and until I am fully fresh, what I could race
   today, and what to improve.
3. *Can I reach my goal?* A full marathon in 2 months: can I run my goal time, and what training
   gets me there safely with the least effort?

Each answer comes first in plain words; the numbers behind it (load, form, model terms) show only
when the runner opens them.

### What the runner has today, and the gaps

| Tool | Gives | Gap found in this discovery |
|---|---|---|
| Garmin race predictor | A number per distance | Black box; 12 % too fast on average on this runner's 9 races; the marathon took 23 % longer than predicted |
| Garmin training status, load | Fitness and load trends | No link to a specific race or goal |
| Runalyze | VDOT, marathon shape, prognosis | Strong ideas, not calibrated to the runner, no planning |
| Generic plans (books, apps) | Weekly schedules | Not fitted to current load; rules applied to everyone |
| Coach | Judgement | Cost; rarely data-driven |

## 2. What the research says

Findings from the literature review that shaped the product (full references in the
[research-style document](research.en.md#references)):

1. **Race performance has a known structure.** VO2max, fractional utilisation (threshold) and running
   economy (Joyner & Coyle 2008), plus **durability** late in long races (Hunter & Muniz-Pumares 2025).
2. **For the marathon, training volume is the strongest training predictor.** Weekly distance, number of
   runs, longest run and number of 32 km+ runs all associate with faster times (meta-analysis, J Sci Med
   Sport 2020; Tanda 2013; Vickers & Vertosick 2016).
3. **Individual responses vary widely** (Bonet et al. 2020): population formulas need calibrating to the
   person — the case for an n = 1 approach.
4. **Injury risk comes from spikes, not totals.** Increases of 20–60 % a week injured more runners within
   3 weeks (ProjectRun21, Damsted 2019); a single run more than 10 % longer than the longest of the past
   30 days raised overuse injury (Garmin-RUNSAFE, Frandsen 2025, 5,200 runners). The acute:chronic ratio
   is contested (Impellizzeri 2020).
5. **Tapers work**: 41–60 % less volume for 8–14 days, intensity kept (Bosquet 2007).
6. **Race-day factors are large**: heat (Ely 2007), and pacing — 28 % of men and 17 % of women "hit the
   wall" (Smyth 2021).

## 3. Solution options considered

| Option | How it predicts | Kept? | Why |
|---|---|---|---|
| A. Show Garmin's prediction | Garmin's model | Comparison only | Opaque; 12.0 % error on this runner |
| B. Garmin, calibrated to past races | Garmin × the runner's average ratio | Comparison only | 6.2 % error; still says nothing about *why* |
| C. Riegel from the previous race | T₂ = T₁ × (D₂/D₁)^1.06 | Rejected | 7.9 % error; no training link |
| D. Tanda (marathon) | Weekly km and training pace | Comparison only | Validated for 2:47–3:36 finishers only; 13.6 % on this runner's marathon |
| E. Daniels from effective VO2max, calibrated | VO2max → time | Building block | 5.9 % error; ignores endurance |
| **F. Causal model: VO2max × marathon shape, calibrated, heat, freshness** | Daniels on VO2max scaled by Runalyze's shape factor, calibrated to the runner | **Chosen** | **4.0 %** error (3.7 % without the heat step), and every term maps to something the runner can train |
| G. A black-box model (ML) on the runner's data | Fitted from features | Rejected | 9 races cannot train it; no explanation |

**Why F.** It was the most accurate (each race predicted only from earlier races), and it is the only
option whose terms are *levers*: volume moves the marathon shape, training load moves VO2max, the taper
moves freshness. That turns a forecast into a plan.

## 4. Planning options considered

| Question | Options | Chosen |
|---|---|---|
| What does "best plan" mean? | Fastest plan · least effort that reaches the goal | **Least effort that reaches the goal** (else fastest safe plan) |
| How does the runner steer? | Many sliders · a 2-D "goal map" · an effort slider + controls | **Effort slider + controls**: the goal map was hard to use (limits hidden until release) |
| Is race fitness an input or an output? | User's assumption · fitted to training load | **Fitted**: +0.11 VO2max per point of 30-day fitness (CTL), from the runner's history |
| What counts as safe? | 10 % rule only · evidence zones | **Evidence zones**: weekly increase, single-run spikes, biggest week vs history, taper length |
| How are long plans structured? | Volume up at the weekly increase (front-loaded) · spread to peak at the peak phase (gradual) | **The runner's choice**: both are inside the injury limits and no study compares them; the recommendation searches both. Plus a tune-up race |
| Where does the planner run? | A Python service behind the page · SQL read through AQL | **SQL read through AQL**: every setting is a filter on the planner's models, so the page needs no server of its own and writes nothing; the Python version stays as the tested reference |

## 5. Evidence from the runner's own data

- The calibrated causal model predicts this runner's 9 races within **4.0 %** on average.
- The marathon took **39 % longer** than plain Daniels predicted; with the marathon-shape factor, 12 % longer, in line with the halves.
- The heat effect is **0.55 % per °C WBGT** (95 % interval −0.3 to 1.1, 119 runs).
- Race fitness follows training load: **+0.110 VO2max per CTL point** (95 % 0.03–0.19, 148 windows).

## 6. Risks and open questions

1. **n = 1.** Validated on one runner and 9 races (one marathon). Next: a second runner, and the synthetic
   runner whose true parameters are known.
2. **Build-up.** A gradual build forecasts slower than a front-loaded one (~8–10 min for Tokyo) because the
   marathon-shape formula rewards early volume. Neither is shown to be safer: both respect the evidence's
   limits on weekly increases and single-run spikes. Ran offers both.
3. **Quality sessions** have no effect of their own in the model beyond training load.
4. **Freshness** is a flat 2 % term and under-rates the taper; tapers are therefore limited to the
   evidence's lengths.
5. **Race-day execution** (pacing, fuelling) is not modelled — only advised.

## 7. Next step

The requirements for the chosen direction are in the [PRD](prd.en.md).
