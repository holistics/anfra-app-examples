# A calibrated causal model for individual race forecasting and least-effort training plans: an n = 1 study

*Draft for feedback, 15 Oct 2026 · Vietnamese version: [research.vi.md](research.vi.md) · Product docs: [HPD](hpd.en.md), [PDD](pdd.en.md), [PRD](prd.en.md)*

## Abstract

**Aim.** To forecast an individual runner's race time from their own training data with a model whose
terms are physiological determinants they can train, and to derive from it the least-effort safe training
plan to a goal.
**Methods.** Three years of one recreational runner's Garmin data (per-second heart rate, speed, GPS) were
loaded into a local database. The forecast combines Daniels & Gilbert's VO2max–performance relation
applied to an *effective VO2max* estimated from pace against heart rate, Runalyze's *marathon shape*
factor for endurance, a calibration to the runner's own races, a personally fitted heat effect, and a
Banister fitness–fatigue term. Race-day VO2max is projected from planned training load with a response
fitted on the runner's history. Accuracy was measured on 9 marked races (6 half marathons, two 10 km,
one marathon), each predicted only from data before it. Plans are generated under evidence-based injury
limits, and the least-effort plan (fewest total kilometres) that reaches the goal is selected.
**Results.** The calibrated causal model had a mean absolute error of **4.0 %** (3.7 % without the heat
term), against 6.2 % for the watch maker's prediction calibrated the same way and 12.0 % uncalibrated.
Adding the marathon-shape factor halved the spread of actual/predicted ratios (SD 0.092 → 0.041) and cut
the marathon's shortfall (actual time over predicted) from 39 % to 12 %. Heat slowed this runner by 0.55 % per °C WBGT (95 % CI −0.3 to 1.1).
Effective VO2max rose 0.110 per point of 30-day mean training load (95 % CI 0.032–0.189).
**Conclusion.** Population formulas carry most of the structure; a single calibration to the runner
removes most of their bias; and making each term a trainable lever turns the forecast into a planning
tool. The evidence base is one runner and nine races; generalisation is untested.

## 1. Introduction

Watch race predictors are convenient but opaque, and often optimistic: for the runner studied here the
watch predicted their 9 races 12 % too fast on average. Training plans, in turn, apply population rules
(e.g. "+10 % a week") without reference to the runner's state or goal.

Two findings frame this work. First, race performance has a well-described structure: aerobic capacity
(VO2max), the fraction of it sustainable for the race's duration (threshold), running economy [1][2], and
— for long races — durability [3][4]. Second, individuals respond very differently to the same training
[10], so population formulas need calibrating to the person. We therefore take the **structure from the
literature** and the **sizes from the runner's data**, and validate on the runner's own races.

## 2. The causal model

### 2.1 Structure

| Layer | Content |
|---|---|
| 0 · Outcome | Race time = f(distance, the runner's state on race day, conditions, execution) |
| 1 · Determinants | D1 VO2max · D2 threshold (fractional utilisation) · D3 running economy · D4 durability · D5 freshness · D6 heat · D7 course · D8 execution · D9 body mass · D10 injury or illness |
| 2 · Training → determinants | Volume → D4 (and D1, D3); long runs → D4; threshold work → D2; intervals → D1; strength → D3; total load → D5; taper → D5; spikes → D10 risk |

D3 (economy) cannot be measured outside a laboratory; it enters through the effective VO2max (which
absorbs it) and through the calibration. D7 is handled by grade-adjusted pace; D8 and D10 are advised and
flagged, not modelled.

### 2.2 Forecast equation

```latex
T = T_{\mathrm{Daniels}}\left(\mathrm{VO_2}_{\mathrm{race}} \cdot s(\mathrm{shape}, D),\ D\right)\cdot c \cdot \left(1 + \frac{h\,(W_{\mathrm{race}} - W_{\mathrm{train}})}{100}\right)\cdot\left(1 + \frac{\tau}{100}\right)
```

where *D* is the distance, *s* the shape factor (§2.4), *c* the calibration (§3.5), *h* the heat effect in
% per °C, *W* the WBGT on race day and in training (§3.4), and *τ* a taper penalty of 2 % applied only when
race-morning form falls below its target band (§2.6).

### 2.3 Effective VO2max and the Daniels relation (D1, D3)

For each run, the oxygen cost of its average speed *v* (m/min) and the share of VO2max implied by heart
rate give an effective VO2max [14]:

```latex
\mathrm{VO_2}(v) = -4.60 + 0.182258\,v + 0.000104\,v^2, \qquad \mathrm{VO_2max_{eff}} = \frac{\mathrm{VO_2}(v)}{(\mathrm{HR}/\mathrm{HR_{max}} - 0.37)/0.64}
```

The daily value is the duration-weighted mean over 30 days. A race time for a VO2max solves Daniels &
Gilbert's relation, with the sustainable fraction for a race lasting *t* minutes:

```latex
f(t) = 0.8 + 0.1894393\,e^{-0.012778\,t} + 0.2989558\,e^{-0.1932605\,t}, \qquad \mathrm{VO_2max} = \frac{\mathrm{VO_2}(D/t)}{f(t)}
```

### 2.4 Endurance: marathon shape (D4 and volume)

Runalyze's marathon shape [15] scores endurance from the last 26 weeks of distance and the last 10 weeks
of runs of 13 km or more (*d*, km; age *a*, days), relative to VO2max:

```latex
\mathrm{shape} = 100\left[\frac{2}{3}\cdot\frac{\mathrm{km}_{182\,d}/26}{\mathrm{VO_2max}^{1.135}} + \frac{1}{3}\cdot\frac{1}{10}\sum_{d \ge 13}\left(2 - \frac{2a}{70}\right)\left(\frac{d - 13}{12\ln(\mathrm{VO_2max}/4) - 13}\right)^2\right]
```

A distance needs a shape of *D*^1.23 % (about 43 % for a half marathon, 100 % for a marathon). Below it,
only part of VO2max is usable over the distance:

```latex
s = \min\left(1,\ 0.6 + 0.4\,\max\left(0,\ 1 - \frac{D^{1.23} - \mathrm{shape}}{100}\right)\right)
```

### 2.5 Race fitness on race day (training → D1)

Effective VO2max on race day is projected from the planned training load:

```latex
\mathrm{VO_2}_{\mathrm{race}} = \mathrm{VO_2max_{eff,today}} + b \cdot \left(\overline{\mathrm{CTL}}_{30,\ \mathrm{race\ eve}} - \overline{\mathrm{CTL}}_{30,\ \mathrm{today}}\right)
```

with *b* fitted on the runner's history (§3.6) and CTL the 42-day fitness of §2.6.

### 2.6 Freshness (D5)

Training load is Banister's TRIMP from per-second heart rate [5]: with HRr = (HR − HR_rest)/(HR_max − HR_rest),

```latex
\mathrm{TRIMP} = \sum \Delta t \cdot \mathrm{HRr} \cdot 0.64\,e^{1.92\,\mathrm{HRr}}
```

(0.86 and 1.67 for women). Fitness (CTL) and fatigue (ATL) are exponentially weighted averages with time
constants of 42 and 7 days; form (TSB) = CTL − ATL. The race-morning target is TSB of 10–30 % of CTL,
Allen & Coggan's +15 to +25 made independent of the load scale [16]. A taper landing below the band costs
2 % (Bosquet 2007 [17]; Mujika & Padilla report ~3 % [18]).

## 3. Data and methods

### 3.1 Data

One recreational runner in Ho Chi Minh City (Garmin profile: male, which sets the TRIMP coefficients),
Garmin data from Sep 2023 to Oct 2026: 633 activities (426 runs), 1.57 million per-second samples, laps,
daily summaries (resting heart rate, sleep, HRV) and lactate-threshold history. Hourly weather for every outdoor activity from Open-Meteo (ERA5 reanalysis) [19]. Everything is
stored locally in PostgreSQL; derived metrics are defined in a documented semantic layer.

### 3.2 Races

The runner marked 9 past races with official times (6 half marathons, 2 × 10 km, 1 marathon:
March 2026, 4:38). Goal race: Tokyo Marathon (March 2027, goal 3:59:59).

### 3.3 Training load check

TRIMP correlated r = 0.81 with the watch's own (EPOC-based) load, at about 0.68 of its scale.

### 3.4 Heat effect (D6)

WBGT was estimated from temperature and humidity with the Australian Bureau of Meteorology shade formula
[20]: WBGT = 0.567 T + 0.393 e + 3.94 (e = vapour pressure, hPa). On 119 steady outdoor runs of 20 min+,
log speed at a fixed easy heart rate (77 % HRmax) was regressed on WBGT, a piecewise-linear fitness trend
(knots every 180 days) and log duration; 95 % intervals by bootstrap (2,000 resamples).

### 3.5 Calibration and validation protocol

For every marked race and method, the race was predicted from data up to the day before. "Calibrated"
methods were scaled by the mean actual/predicted ratio of the same method over **earlier races only**.
The forecast's uncertainty band is that method's mean absolute error.

### 3.6 Race-fitness response

Over windows starting every 7 days, the 84-day change in effective VO2max was regressed on the change in
30-day mean CTL; 95 % interval by bootstrap over windows. A WBGT term was tried and dropped (wrong sign,
consistent with season confounding).

### 3.7 Planning

A plan is generated from seven controls: runs per week (kept as a life constraint), quality sessions,
longest long run, weekly increase (a maximum), biggest week, taper length, and an optional tune-up race.
Rules, each from the evidence:

| Rule | Value | Evidence |
|---|---|---|
| Start | the current week; load = mean of the last 2 complete weeks | — |
| Phases | ≤ 3 wk before taper: sharpen; 4–7: build–peak; 8–12: base–build–peak; 13+: base ~40 %, build ~35 %, 3-week peak | periodisation practice |
| Build-up | the runner's choice: gradual (biggest week at the peak; long runs alternate) or front-loaded (volume rises at the weekly increase until the biggest week); every 4th week at 75 % | both inside the limits below; no study compares them |
| Weekly increase | caution > 10 %, injury risk > 20 % | ProjectRun21 [21]; Nielsen 2014 [22] |
| Long run | never > 10 % longer than the longest of the past 4 weeks; ≤ half the week; alternating once at its longest | Garmin-RUNSAFE [23] |
| Biggest week | caution above 1.25 × the biggest week of the last year | runner's history |
| Taper | 2–3 weeks (marathon), 1–2 (half); 41–60 % less volume, intensity kept | Bosquet 2007 [17] |
| Tune-up race | HM before a marathon (10K before a half), 6 weeks out, in a lighter week | practice; its result recalibrates |

**Least-effort plan.** Among plans with every control in its safe zone and race morning in the freshness
band, the plan with the fewest total kilometres whose forecast reaches the goal (ties: fewer quality
sessions, lower biggest week). For each combination of the other controls, bisection on the biggest week
finds the smallest that reaches the goal. If none does, the fastest safe plan is used and its time becomes
the working target. **Effort frontier**: the fastest safe plan for each amount of running (Pareto front on
total km and forecast), about 1,300 candidate plans at 0.76 ms each.

### 3.8 Implementation check

The planner's preview (Python) and the saved plan's forecast (SQL) were compared on a copy of the
database for several plans: time, marathon shape, race fitness and freshness matched exactly. A synthetic
runner generated from the model with a known heat effect of 0.7 %/°C was fitted back at 0.82 %/°C.

## 4. Results

### 4.1 Forecast accuracy (9 races, each predicted from earlier data only)

| Method | Mean abs. error | Bias | Races |
|---|---|---|---|
| Daniels on effective VO2max × marathon shape, calibrated | **3.7 %** | −3.0 % | 8 |
| **Causal model (the above + heat), calibrated** — the forecast | **4.0 %** | −2.7 % | 8 |
| Daniels on effective VO2max, calibrated | 5.9 % | −1.0 % | 8 |
| Watch prediction, calibrated | 6.2 % | +3.4 % | 8 |
| Daniels on effective VO2max × marathon shape | 6.7 % | −6.2 % | 9 |
| Riegel (1.06) from the previous race [24] | 7.9 % | +3.8 % | 8 |
| Watch prediction | 12.0 % | −12.0 % | 9 |
| Daniels on effective VO2max | 13.1 % | −13.1 % | 9 |
| Tanda, from the actual 8 weeks before (marathon only) [8] | 13.6 % | −13.6 % | 1 |

Bias = mean of (predicted − actual)/actual; negative = too fast. Calibrated methods cover 8 races because
the first race has no earlier race to calibrate on.

### 4.2 What each term contributes

- **Endurance (marathon shape).** Without it, Daniels was 13 % too fast on average, and the marathon took
  39 % longer than predicted. With it, the SD of actual/predicted across races fell from 0.092 to 0.041.
- **Calibration.** Even with the shape factor the runner ran 7.9 % slower than the formulas (ratio 1.079,
  range 0.995–1.128): a stable, personal offset (economy, pacing).
- **Heat.** 0.55 % per °C WBGT (−0.3 to 1.1). It did not improve accuracy on past races (4.0 % vs 3.7 %):
  effective VO2max is itself measured in ~30 °C heat. It is kept because the target race is 5.7 °C cooler
  than training, beyond any past race.
- **Race-fitness response.** b = 0.110 VO2max per CTL point (0.032–0.189, 148 windows). Mean absolute
  error of the 84-day projection 2.73 points, against 2.92 for "no change": real but modest.

### 4.3 Planning example (Tokyo Marathon, 13 weeks out)

| | Total running | Biggest week | Forecast |
|---|---|---|---|
| If the race were today | — | 48 km (current) | 5:04 |
| Least running on the frontier | 525 km | 48 km | 4:44 |
| Fastest safe plan, front-loaded build-up | 816 km | 75 km | 3:55 |
| Fastest safe plan, gradual build-up | 761 km | 75 km | 4:05 |
| **Recommended: least effort that reaches 3:59:59** (front-loaded, biggest week 64 km, +8 %/week) | 728 km | 64 km | 3:59:50 |

Only a front-loaded build reaches 3:59:59 safely; the least-effort search finds the smallest one that does.
Times are as of 15 Oct 2026 and move as new runs arrive.

## 5. Discussion

**Structure from the literature, sizes from the runner.** Population formulas (Daniels, Runalyze) carry
most of the signal; a single multiplicative calibration removes most of their bias for this runner. The
best-performing combination is also the one whose terms are actionable.

**Gradual or front-loaded.** The marathon-shape formula counts every kilometre of 26 weeks and so
rewards early volume: a front-loaded build forecasts about 8–10 minutes faster in the example. The injury
evidence sets limits that both builds respect (weekly increases under 20 % [21], no single run more than
10 % over the recent longest [23]) but does not compare two plans that both stay inside them; a gradual
build's advantage is less total running, a plausible but unproven reduction in exposure. An earlier draft
called the gradual build "evidence-based"; that overstated the studies. Ran now leaves the choice to the
runner and searches both.

**Least effort as the default.** Choosing the fewest kilometres that reach the goal respects the
runner's time and injury exposure, but it reaches the goal on the point forecast, inside a ±4 % band.
Aiming for a margin is an open design choice.

### Limitations

1. **n = 1.** One runner, nine races, one marathon. External validity is untested.
2. **Effective VO2max** depends on heart rate, which drifts with heat, hydration and fatigue.
3. **Quality sessions** affect race fitness only through training load; no per-session effect is
   modelled, for lack of usable evidence.
4. **Freshness** is a coarse step term; it under-rates the taper, so tapers are restricted to the
   evidence's lengths.
5. **Execution** (pacing, fuelling) is advised, not modelled, though it moves results substantially [25].
6. **Selection**: races were marked by the runner; tune-up and goal races may be paced differently.

## 6. Future work

A second runner and a public dataset; a prospective test of a recommended plan; a model of quality
sessions' own effect; a continuous freshness term; consistency-weighted endurance; pushing planned sessions
to the watch with the runner's consent.

## References

1. Joyner MJ, Coyle EF. Endurance exercise performance: the physiology of champions. J Physiol 2008. [summary](https://www.sciencedaily.com/releases/2008/07/080731173157.htm) · [review of determinants (Frontiers 2021)](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.719434/pdf)
2. VO2max, threshold and economy as predictors. [overview](https://marathonhandbook.com/vo%E2%82%82-max-threshold-or-economy-what-actually-predicts-endurance-performance/)
3. Hunter B, Muniz-Pumares D, et al. Durability of parameters associated with endurance running. Eur J Sport Sci 2025. [pdf](https://uhra.herts.ac.uk/id/eprint/26353/1/European_Journal_of_Sport_Science_-_2025_-_Hunter_-_Durability_of_Parameters_Associated_With_Endurance_Running_in.pdf) · [durability review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11889008)
4. Cardiac decoupling and marathon performance in 82,000 runners. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/9388405)
5. Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running. J Appl Physiol 1990. [PubMed](https://pubmed.ncbi.nlm.nih.gov/2246166/) · [training-load methods](https://opus.lib.uts.edu.au/handle/10453/122356)
6. Ely MR, et al. Impact of weather on marathon-running performance. Med Sci Sports Exerc 2007. [link](https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/)
7. Impellizzeri FM, et al. Acute:chronic workload ratio: conceptual issues. 2020. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938/)
8. Tanda G, Knechtle B. Marathon performance in relation to body fat percentage and training indices. 2013. [link](https://www.dovepress.com/marathon-performance-in-relation-to-body-fat-percentage-and-training-i-peer-reviewed-fulltext-article-OAJSM)
9. Vickers AJ, Vertosick EA. An empirical study of race times in recreational endurance runners. 2016. [link](https://synapse.mskcc.org/synapse/works/101585)
10. Bonet JB, et al. Individual responses to high-intensity interval training. 2020. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7642248)
11. Rosenblat MA, et al. Polarized vs threshold training intensity distribution. 2019. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29863593/) · Oliveira 2024 meta-analysis [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428)
12. Llanos-Lagos C, et al. Strength training and running economy. 2024. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11052887/)
13. Effects of tapering on performance in endurance athletes (meta-analysis). PLOS ONE 2023. [pdf](https://www.fisiologiadelejercicio.com/wp-content/uploads/2023/05/Effects-of-tapering-on-performance-in-endurance-athletes.pdf)
14. Daniels J, Gilbert J. Oxygen Power: performance tables for distance runners. 1979. *(Book; equations as implemented, not re-checked against the original for this draft.)*
15. Runalyze. VO2max prognosis with marathon-shape adjustment (source code). [GitHub](https://github.com/Runalyze/Runalyze/blob/support/4.3.x/inc/core/Sports/Running/Prognosis/VO2max.php) · [marathon shape (help)](https://runalyze.com/help/article/88)
16. Allen H, Coggan A. Training and Racing with a Power Meter. *(Book; form target as commonly cited.)*
17. Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc 2007. *(Not re-opened for this draft.)*
18. Mujika I, Padilla S. Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 2003. *(Not re-opened for this draft.)*
19. Open-Meteo historical weather API (ERA5). [open-meteo.com](https://open-meteo.com/)
20. Australian Bureau of Meteorology. Approximation of WBGT from temperature and humidity. *(Formula as implemented.)*
21. Damsted C, et al. ProjectRun21: weekly running distance progression and injury in half-marathon preparation. JOSPT 2019;49(4):230–238. [link](https://researchportal.lih.lu/en/publications/the-association-between-changes-in-weekly-running-distance-and-ru/)
22. Nielsen RO, et al. Excessive progression in weekly running distance and risk of running-related injuries. JOSPT 2014. [link](https://vbn.aau.dk/da/publications/excessive-progression-in-weekly-running-distance-and-risk-of-runn)
23. Frandsen JSB, et al. How much running is too much? Identifying high-risk running sessions in a 5200-person cohort. Br J Sports Med 2025;59:1203–1210. [link](https://researchportal.lih.lu/en/publications/how-much-running-is-too-much-identifying-high-risk-running-sessio/)
24. Riegel PS. Athletic records and human endurance. American Scientist 1981. *(Book chapter / article; exponent 1.06 as commonly used.)*
25. Smyth B. How recreational marathon runners hit the wall. PLOS ONE 2021. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8133477/)
26. An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression. J Sci Med Sport 2020;23(2):182–188. [PubMed](https://pubmed.ncbi.nlm.nih.gov/31704026/)
27. Fokkema T, et al. Training for a (half-)marathon: training volume and longest endurance run related to performance and injuries. Scand J Med Sci Sports 2020. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7496388/)
