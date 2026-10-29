# Ran demo video: storyboard (v2.1, short cut with interaction)

*Target: about 2:35 · 1920×1080 · due 11:00, 21 Oct 2026 · production plan: [video-plan.md](video-plan.md)*

**The story:** a runner with three real questions, and Ran answering each one from their running data.

1. *I don't know my current training status.*
2. *I have a race next week. What should my target be?*
3. *I have a full marathon in 2 months. Can I reach my goal, and how?*

**It's also a demo of what Anfra makes possible:** Data Apps you explore, not static reports. Each act
therefore has at least one hands-on moment, done slowly enough to follow:
- click a number to open its history and explanation, then jump to a related metric;
- click a run to see its route and pace together: move along the chart, and the marker moves on the
  map;
- drag a slider and watch the plan rebuild;
- hover and click weeks and phases to drill into the plan.

Changes from v1:
- **Plain words:** no "VO2max". Ran "helps me understand my current shape, with metrics calculated
  from my running data", for example my training status.
- **Only the product:** no comparisons with the watch or Garmin, no "wrong answers", no
  prediction-error tables.
- **Cut:** the calculation modal, predictions per race and the AML screens. One optional 7 s Inspect
  shot shows the query behind a chart.

**Data on screen: synthetic only:** the runner from
`garmin-sync demo-data --seed 7 --goal-weeks 9 --next-race-days 5 --goal 3:39:59`. The footage is the
author's own. Numbers in [brackets] are from seed 7 on 20 Oct; confirm them on screen. No on-screen
text may say "Garmin": frame or crop it out (the VO2max tile on the Overview's first row, the
activity modal's stats grid).

---

## Scene list

| # | Time | Part | Picture | Interaction | Clip |
|---|---|---|---|---|---|
| 0 | 0:00–0:10 | Intro | `before.mp4` + the three questions | — | footage |
| ★ | 0:10–0:20 | Overview | "Ran answers all three" + three 2.5 s answers | — | from R1, R2, R4 |
| 1 | 0:20–0:50 | Act 1 · Training status | Fatigue · Fitness · Form → the Form modal | **click a metric → history + explanation → related metric** | R1 |
| 1b | 0:50–1:10 | Act 1 · Every run | Activities → a long run: map + pace | **click a run → move along the pace chart, the map follows** | R6 |
| 2 | 1:10–1:28 | Act 2 · Race next week | Planner, Riverside 10K | select the race | R2 |
| 3 | 1:28–2:15 | Act 3 · Marathon in 2 months | The gap → **the wow slider** → the plan | **drag the slider; hover and click weeks and phases** | R3, R4, R5 |
| 4 | 2:15–2:22 | Built on Anfra (optional) | Inspect → Data: the query behind a chart | open the inspector | R7 |
| 5 | 2:22–2:34 | Outro | `after.mp4` → "Ran: run far with Anfra" | — | footage |

Each act keeps one dramatic beat: a cold open on black (the question, 1.5 s, heartbeat or tick), the
stakes in sunrise orange, the reveal on a music hit with a 120 % push-in on Ran's number, and a
one-line answer card.

For each interaction:
- Show the cursor (drawn in the recording) and the click ripple.
- Pause about 1 s after each click, so the viewer sees cause, then effect.
- At most one zoom per interaction, onto the thing that changed.

---

## 0 · Intro (0:00–0:10)

`before.mp4`, first 10 s, with a slow push-in. Captions one at a time (white on a dark band): 0:01
*I don't know my current training status.* · 0:04 *I have a race next week. What should my target be?*
· 0:07 *A full marathon in 2 months. Can I reach my goal?* At 0:09.5, a sky-to-sunrise wipe.

> **VO:** "I run five times a week, and I still don't know my current training status. I race next
> Sunday: what should I aim for? And my marathon is in two months. Can I make my goal?"

## ★ Overview (0:10–0:20)

- **0:10–0:12.5:** ink card, "**Ran answers all three, from your running data.**" Small under it:
  "Built on Anfra".
- **0:12.5–0:20:** three 2.5 s shots with captions:
  - **1 · Your training status today** (R1, the Form tile)
  - **2 · Your target for next week** (R2, the time if raced today)
  - **3 · The plan to your marathon goal** (R4, the green target pill)

> **VO:** "Ran answers all three, from your own running data: where you stand today, your target for
> next week, and the plan to your goal."

## 1 · Act 1: training status (0:20–0:50)

- **Cold open (0:20–0:21.5):** *"Where am I, right now?"*
- **R1 (0:21.5–0:47):**
  1. *(0:21.5)* The Overview's Current form, framed on the second tile row: **Fatigue · Fitness ·
     Form**, with their gauge bars. Reveal: push in on **Form [+15]**, "fresh".
  2. *(0:27)* **Click Form.** The modal opens: today's value, the 6-month history with its zones
     (fresh / balanced / training hard), and below it "What it is" and "How to read it". Slow scroll
     or zoom onto the explanation for 3 s, so a viewer can read a line.
  3. *(0:36)* Switch the range to **1Y**: the history redraws.
  4. *(0:40)* **Click the related chip "Fatigue · ATL"**: the modal switches metric in place.
  5. *(0:45)* Esc: back to the tiles.
- **Answer card (0:47–0:50):** **"Status: fresh and ready to race."**

> **VO:** "Ran helps me understand my current shape, with metrics calculated from my running data.
> Take my training status: how much fitness I've built, how much fatigue I'm carrying, and the balance
> of the two. Right now I'm fresh, ready to race. Click any number: its history, what it means, how to
> read it, and the metrics related to it."

## 1b · Every run, in detail (0:50–1:10)

- **R6 (0:50–1:10):**
  1. *(0:50)* Activities. **Click an outdoor long run** (e.g. "Canal Path Long Run", not a strength or
     treadmill session, which have no map). The modal opens.
  2. *(0:54)* Scroll the modal so the **route map** and the **pace / heart-rate chart** fill the
     frame, keeping the stats grid out of view.
  3. *(0:57)* **Move slowly along the pace chart, left to right.** The red marker travels along the
     route on the map in sync. Pause on a climb or a pace drop. Zoom on the map + chart pair.
  4. *(1:06)* Press **→**: the next run opens in place.

> **VO:** "And it's all built from every run. Open one, move along the pace, and the map follows:
> every kilometre, every heartbeat, in sync."

## 2 · Act 2: race next week (1:10–1:28)

- **Cold open (1:10–1:11.5):** *"Race on Sunday. What do I aim for?"*
- **R2 (1:11.5–1:25):**
  1. Race Planner, **select Riverside 10K** from the goal-race dropdown. The goal card shows
     **Days left [5]**. Stakes caption: **"5 days to the race"**.
  2. Reveal: push in on **If the race were today: [45:08]**, [4:31] /km, at race-day heat.
- **Answer card (1:25–1:28):** **"Target: [45:08]. Start at [4:31] /km."**

> **VO:** "Five days to my 10K. Ran's target: forty-five oh eight, four thirty-one a kilometre,
> calibrated to how I've raced before, in the heat I'll race in."

## 3 · Act 3: marathon in 2 months (1:28–2:15)

- **Cold open (1:28–1:29.5):** *"Sub 3:40. Nine weeks. Can I?"*
- **R3 (1:29.5–1:36):** **Select Harbour City Marathon.** The goal card shows **Goal 3:39:59** ·
  **Days left [68]** · **Against the goal, today [+24 min]** in red. Stakes caption:
  **"9 weeks · [24] minutes to find"**.
- **R4 (1:36–1:58): ★ the wow moment.**
  1. Hover **Biggest week**: its readout over the green / amber / red track.
  2. Drag the **Effort** slider slowly from just short of the goal to the ★. The "This position"
     time comes down and the track turns green.
  3. Let go. About a second later the result rebuilds: **[3:39:23]** ✓, the green target pill.
     Hold 3 s with no zoom. Caption: **"Goal reached · [491] km · every setting safe"**.
- **R5 (1:58–2:12): drill into the plan.**
  1. *(1:58)* "B · Your plan": the week bars over the phases. **Hover a peak week**: its days pop up.
  2. *(2:02)* **Click that week**: its day table opens (session, km, target pace, what to do). Press
     **›** once to step to the next week.
  3. *(2:07)* **Click the Taper phase**: purpose and sessions. Open "Expected after this phase": the
     Change column is green.
- **Answer card (2:12–2:15):** **"Yes: sub 3:40 in 9 weeks. Safely."**

> **VO:** "Nine weeks out, I'd miss my goal by twenty-four minutes. Every setting shows its safe zone.
> Now watch: one slider, from less running to more… There. Three thirty-nine: the least running that
> still gets me there, and nothing in the danger zone. Hover a week to see it, click to plan it, phase
> by phase, every session at my own pace."

## 4 · Built on Anfra (2:15–2:22, optional: cut first if time is short)

- **R7:** click **Inspect** in the top bar, then **Data**, and select the query behind a chart: its
  AQL and rows.
- Caption: **"Every chart: a governed query on Anfra's semantic layer"**.

> **VO:** "All of it is a Data App on Anfra: every number from one governed semantic layer."

## Outro (2:22–2:34)

`after.mp4` 0–6 s, then freeze on the point at the camera, darkened about 40 %, with
"**Ran: run far with Anfra**". Small under it: "App footage uses a synthetic runner". A
sky-to-sunrise line along the bottom.

> **VO:** "Ran. Run far, with Anfra."

---

## Voice-over: full script (≈ 290 words, ≈ 2:10)

> I run five times a week, and I still don't know my current training status. I race next Sunday:
> what should I aim for? And my marathon is in two months. Can I make my goal?
>
> Ran answers all three, from your own running data: where you stand today, your target for next
> week, and the plan to your goal.
>
> Ran helps me understand my current shape, with metrics calculated from my running data. Take my
> training status: how much fitness I've built, how much fatigue I'm carrying, and the balance of the
> two. Right now I'm fresh, ready to race. Click any number: its history, what it means, how to read
> it, and the metrics related to it.
>
> And it's all built from every run. Open one, move along the pace, and the map follows: every
> kilometre, every heartbeat, in sync.
>
> Five days to my 10K. Ran's target: forty-five oh eight, four thirty-one a kilometre, calibrated to
> how I've raced before, in the heat I'll race in.
>
> Nine weeks out, I'd miss my goal by twenty-four minutes. Every setting shows its safe zone. Now
> watch: one slider, from less running to more… There. Three thirty-nine: the least running that
> still gets me there, and nothing in the danger zone. Hover a week to see it, click to plan it,
> phase by phase, every session at my own pace.
>
> All of it is a Data App on Anfra: every number from one governed semantic layer.
>
> Ran. Run far, with Anfra.
