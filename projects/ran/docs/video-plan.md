# Demo video: production plan

*Written 21 Oct 2026, 07:40, before the computer is shut down · due **11:00 today** · script:
[video-storyboard.md](video-storyboard.md) (v2.1, short cut with interaction, about 2:35)*

## Where the work stands (saved)

Everything from the first recording session is in `video/` (media is git-ignored but on disk):

| What | Where | State |
|---|---|---|
| Remotion project | `video/package.json` (remotion 4.0.537, React 19), `node_modules/` installed | Scaffold only: `src/` is empty, nothing rendered |
| Footage | `video/public/footage/before.mp4`, `after.mp4` | Copied, ready |
| Recorded clips (v1 script) | `video/work/clips-v1/*.mp4` + `*.json` (timestamps of each action) | 4 clips, 1440×900 |
| Sound | `video/public/audio/music/` (pad, pulse, lift, shimmer), `sfx/` (heartbeat, tick, hit, whoosh) | Synthesised, ready |
| Placeholder voice-over (v1) | `video/public/audio/vo-placeholder/*.wav`, lines in `video/work/scripts/vo.tsv` | v1 script: **redo** |
| Recording scripts | `video/work/scripts/vlib.mjs` (browser, cursor, recording helpers), `shots.mjs`, `vx*.mjs`, `sounds.sh` | Reusable |
| Demo app copy | `video/work/scripts/demo-stack.sh start` / `stop` | New: one command |
| Demo database | `garmin_demo` (seed 7, 10K on 25 Oct with no goal, marathon 27 Dec with goal 3:39:59) | Exists |

## v1 against v2: what to keep, what to redo

| v2 shot | Needed | From v1 | Action |
|---|---|---|---|
| Intro and outro | `before.mp4`, `after.mp4` | Footage copied | **Keep** |
| R1 · Training status | Tiles and gauges, **click Form** → history + explanation (read it) → **1Y** → **related chip "Fatigue · ATL"** → Esc | `ov-status.mp4` 9.9–27.4 s has the tiles and the Form modal, but not the explanation scroll or the chip | **Record new** (~25 s), framed on the second tile row (the first row's VO2max tile mentions Garmin). Fall back on the v1 part if short of time. |
| R6 · Every run | Activities → **click an outdoor long run** → scroll to the map + pace chart → **move along the chart, the map marker follows** → **→** next run | `act-all.mp4` opened a strength session (no map) | **Record new** (~20 s). Pick a run with a route, e.g. "Canal Path Long Run". Keep the stats grid out of frame ("Garmin VO2max", "Garmin load" labels). |
| R2 · 10K next week | Select Riverside 10K, goal card, "if the race were today" | — | **Record new** (~15 s) |
| R3 · Marathon gap | Select Harbour City Marathon, goal card | — | **Record new** (~8 s) |
| R4 · The wow slider | Biggest week hover, effort drag, release, result | `pm-wow.mp4` 1.5–31 s | **Reuse** |
| R5 · The plan | Week bars, **hover** a peak week, **click** it (day table, **›** next), **click Taper**, open "Expected after this phase" | — | **Record new** (~14 s) |
| R7 · Built on Anfra (optional) | Inspect → Data → select the query behind a chart | — | **Record new** (~7 s); cut first if time is short |
| Activities, Overview charts | — | `act-all.mp4`, `ov-charts.mp4` | **Drop** (not in v2) |
| Voice-over | v2 script, about 230 words | v1 lines | **Regenerate** with `say` |
| Remotion scenes | All | — | **Write** |

## Steps for the next session (about 2 h, finish by 10:30 to leave a buffer)

1. **(5 min) Start the demo app.** From the repo:
   ```sh
   video/work/scripts/demo-stack.sh start
   ```
   Open http://localhost:5174. The planner must list only **Riverside 10K** and **Harbour City
   Marathon**. If the 10K date has passed or the numbers look off, rebuild the demo database first:
   `uv run garmin-sync demo-data --seed 7 --goal-weeks 9 --next-race-days 5 --goal 3:39:59`.
2. **(5 min) Recording tools:**
   - `cd video && npm i -D playwright-core@1.56.1`. The scripts in `video/work/scripts` import it,
     and the browser is the cached chrome-headless-shell 1243.
   - Check that `vlib.mjs` still runs: its work folder `W` is now `video/work`.
3. **(40 min) Record R1, R2, R3, R5, R6 (and R7 if time allows)** with `vlib.mjs`, at 1440×900 with the drawn cursor:
   - Warm each page first.
   - Write the clips to `video/public/clips/`.
   - Copy the reusable v1 clip there too: `pm-wow.mp4` (R4). Keep `ov-status.mp4` as R1's fallback.
   - Interactions: move the mouse slowly (`page.mouse.move` with steps), pause about 1 s after each
     click, and for R6 sweep the pace chart left to right over about 6 s so the map marker visibly
     travels.
   - Read the real numbers off the screen and update the [brackets] in the storyboard.
4. **(10 min) Voice-over:**
   - Put the v2 lines in `video/work/scripts/vo.tsv`.
   - Generate one wav per line with `say` (same voice as v1), into `video/public/audio/vo/`.
5. **(45 min) Remotion:**
   - `src/index.ts` and `Root.tsx`, with compositions **RanDemo** (about 2:34) and **RanDemoSalesCut**
     (0:00–0:20 + the end card).
   - Scenes per the storyboard: footage with captions, cold-open cards, clips scaled to 1080p with
     crops and push-ins, the answer cards, the wow hold, the end card.
   - Use the palette: ink #23252b, sunrise #f2541b, sky #4f86c6, peach #f6c9a0, cream #f6f3ee.
   - Music under everything; sfx on cold opens and reveals.
6. **(15 min) Render and check:**
   - `npm run render` gives `video/out/ran-demo.mp4` and `ran-demo-sales-cut.mp4`.
   - Make a frame contact sheet with ffmpeg and check it: no Garmin text anywhere, numbers match,
     and the wow moment is clean.
7. **(2 min) Stop the demo app:** `video/work/scripts/demo-stack.sh stop`.

**If time runs short, cut in this order:**
1. R7 (Inspect).
2. The sales cut.
3. In R5, keep the hover and the week click; drop the taper.
4. The overview's three answer shots (keep its one line).

Never cut the wow moment, the metric click (R1) or the map sync (R6): they are the interactive core of the demo.

## Rules (unchanged)

- App screens show only the synthetic runner. Never start the demo app on the real database, and
  never edit the repo's `.env` or `.anfra/data_sources.yml` (the script edits a git-ignored copy).
- The everyday stack (ports 7878, 7879, 5173, 8787) is left alone.
- Don't press "Sync now". "Use this plan" is not in v2.
- No uploads anywhere. The video goes to the user, who sends it.
