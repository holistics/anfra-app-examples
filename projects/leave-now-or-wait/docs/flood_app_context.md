# "Leave Now or Wait?" — Data App context & working notes

Working context for the HCMC flooding Data App (`apps/flood.html`). Keep this current when
the app changes. It complements `docs/metric_definitions.md` (the governed-metric spec).

_Last updated: 2026-10-18._

---

## What it is
A single-file D3 + ECharts Data App (`apps/flood.html`) that visualises Ho Chi Minh City
flooding tonight, run by the local **anfra** runtime. Three modes:
- **Explore** (default) — map coloured by `flood_risk`; a left **"Tonight across the city"**
  summary; click a district for its card; drill into a road segment's hourly readings.
- **Leave now or wait?** — pick From/To → preset routes drawn on real streets, coloured by
  `route_risk`, bike animating; alternatives faint; "✕ Clear route".
- **Mayor for a day** — place interventions (tidal sluice / drainage / retention pond /
  raised road), stress slider (years from now), see governed Layer‑5 savings/ROI.

Plus: onboarding tour, **Anfra Lens** (reveals the anfra feature behind each element),
in‑app **Inspect** (governed definition + the executed AQL behind every number).

## Governance rules (do not break)
- **Every on‑screen number comes from a governed metric** (AML measure / AQL metric) via an
  anfra SDK query by name. No simulation/business maths in page JS — JS only lays out,
  animates, formats, and picks selections (e.g. "worst district" = max over a governed
  per‑district query, like the existing worst‑evening pick).
- **Inspect (ⓘ) on every number** → opens the governed definition + the query that produced it.
- What‑if inputs are **SDK filters** (anfra has no runtime params): `years_from_now`,
  `intervention_id` (active set; `{0}` = baseline), `interventions.id` (chosen‑cost set),
  route/evening/hour filters.
- Attribution stays **"Map data © OpenStreetMap contributors"**.

## Repo layout
- `apps/flood.html` — the whole app (HTML + CSS + JS, inline).
- `apps/hcmc_geo.js` — `window.HCMC.{districts,water,lines}` (real HCMC lon/lat geo).
- `apps/hcmc_streets.js` / `apps/hcmc_streets.geojson` — real OSM streets (see below).
- `apps/hcmc_districts.geojson`, `hcmc_water_*.geojson` — source geo (bundled into hcmc_geo.js).
- `datasets/flood.dataset.aml` — governed metrics (Layers 1–5).
- `models/*.aml` — QueryModels (modeled depth, trip/route conditions, `scenario_effects`,
  `route_scenario_effects`, `route_district_seq`, `intervention_info`, …).
- `scripts/generate_data.py` — builds `data/flood.duckdb` (30 Oct‑2026 evenings, 15:00–23:00).
- `docs/metric_definitions.md` — the approved metric spec.
- `screenshots/` — generated screenshots.

## Running & screenshotting (important gotchas)
anfra runs in Docker (container `anfra`), served at `http://127.0.0.1:7878`. See the memory
note `running-and-screenshotting-flood-app.md`. Key points:
- The app only has the `Anfra` SDK when loaded **through the Data Apps SPA**
  (`http://127.0.0.1:7878/apps/`, click "Leave Now or Wait?"). It renders in an
  **`about:srcdoc` iframe with `sandbox="allow-scripts"` (opaque origin)**. Loading
  `/apps/flood.html` directly has no SDK.
- The serve reads AML files **live** (new metrics/models work immediately), but
  `anfra lineage` / the app's Inspect read the **ingested catalog** → run
  **`anfra ingest`** after AML edits or definitions won't show.
- CLI query with filters: `anfra query --dataset flood --input '{"filters":[{"field":"model.field","operator":"is","values":["…"]}]}' '<AQL>'` (run with `MSYS_NO_PATHCONV=1 docker exec -w /work anfra /root/.anfra/bin/anfra …`). Core API base path is `/api` (`POST /api/core.query`, `/api/core.lineage`).
- Screenshots: `playwright-core@1.49.1` + cached chromium at
  `C:\Users\pminh\AppData\Local\ms-playwright\chromium-1140\chrome-win\chrome.exe`.
  Open the SPA (`waitUntil:'domcontentloaded'` — networkidle never fires), click the app,
  find the frame whose document has `path.district`, clip screenshots to the `iframe` box.
  Concave districts miss centre mouse‑clicks → dispatch `new MouseEvent('click',{bubbles:true})`.
  Wait on `window.__floodDebug.QREG.<q>.state !== 'executing'` for mayor queries.

### Sandbox limitation (URL params)
Because the iframe is `allow-scripts` (opaque origin), it **cannot read the parent/SPA URL**
(`parent.location` throws, `document.referrer` is origin‑only, `location.search` is empty).
So `?from=&to=` and `?tour=on` only reach the app when it owns its URL (standalone/published).
For the local SPA the app honours **global hooks** that cross the sandbox, settable via
Playwright `addInitScript`:
- `window.__ROUTE = {from, to}` → auto‑draws a route (slugs like `district-7`).
- `window.__TOUR = 'on' | 'off'` → forces/suppresses the tour.

## Governed metrics quick map (dataset `flood`)
- L1–L3: `rainfall_mm`, `peak_tide_m`, `traffic_volume`, `modeled_water_depth_cm`,
  `flood_threshold_cm` (=20, from `flood_config`), `flooded_road_km`, `flood_risk`,
  `district_wet_socks`, `depth_bucket`, `depth_from_{rain,drainage,tide}_cm`.
- L4 commute: `commute_delay_min`, `delay_cost_vnd`; route‑hour: `rh_route_risk`,
  `rh_delay_min`, `rh_flooded_streets`, `rh_wet_socks_index`.
- L5 mayor (on `scenario_effects`): `risk_after_interventions`, `flooded_hours_avoided`,
  `delay_cost_saved_vnd`, `delay_cost_saved_vnd_annual` (×12), `intervention_roi`,
  `flooded_hours_baseline/after`, `chosen_cost_vnd`.
- L5 commute (on `route_scenario_effects`): `route_delay_before_min`, `route_delay_after_min`.

## Feature history (built this session)
1. **Mayor mode (finish/fix).** Governed Layer‑5: `route_scenario_effects` model +
   `delay_cost_saved_vnd_annual` + `route_delay_before/after_min` metrics; `scenario_effects`
   got an `evening` dim. UI: compact no‑scroll panel; empty state; 4 type cards (pick → tap a
   district to place; affordability greying); Reset; "Try a sample plan" (sluice #3 + drainage #6
   + pond #4); results = hrs/mo, saved/yr, ROI, worst‑evening before→after, your‑commute
   before→after, benefit‑by‑district bars, "How is this calculated?" Layer‑5 lineage. No negative
   zeros (`nz`/`pos`). Inspect fixed for all metrics (lineage loaded from 3 roots:
   `intervention_roi`, `route_delay_after_min`, `route_delay_before_min`).
   _Note: sluices move only ~1–2 flooded hrs/month in this data (tide rarely crosses 20 cm) —
   truthful; drainage/raised roads + the sample plan carry the story._
2. **Street‑level detail.** Real OSM streets (Overpass) for the 12 districts: primary/secondary/
   tertiary everywhere + residential for D7/D1/Binh Thanh, merged + simplified → `hcmc_streets.geojson`
   (~618 KB, ~3,100 ways incl. bridges). Drawn in zoom layers (city = main faint; zoom = more +
   street names for the focused district). Synthetic `road_segments` snapped onto real streets
   (ids kept) → flooded streets coloured by depth instead of pins; click a street → hourly drill‑down.
   Landmarks (Bến Thành, Tân Sơn Nhất, Phú Mỹ Hưng, Landmark 81).
3. **Routes reworked.** No route by default (From/To empty with placeholders). Route drawn only
   after pick + button; recommended bold (coloured by `route_risk`) + bike, alternatives faint,
   route list with hover/click highlight, fit‑to‑route, "✕ Clear route", same‑place message,
   `?from=&to=` (/`window.__ROUTE`). **Paths fixed:** each route is a shortest path on a street
   graph (main roads + bridges) through its governed district sequence (`route_district_seq`),
   so it follows real streets, crosses water only on bridges, and doesn't retrace (except where
   a route genuinely detours via its "via" district, e.g. route 4 via Nha Be).
4. **City summary + visibility.** "Tonight across the city" replaces the empty panel:
   `flood_risk` (+ period comparison vs last week), `flooded_road_km`, `commute_delay_min`,
   worst district with "See flooded streets in <name> →" drill‑in, "Flooded = water ≥ 20 cm /
   One definition used everywhere ⓘ", flood‑risk‑by‑hour chart — each governed + Inspect.
   "← City" returns from a district card. Hover tooltip adds the period comparison + "Click to
   drill in". Tide card shows plain words ("Low tide, rising — not a problem tonight"), not metres.
   Lens pulses on first visit; the tour's last step flashes it on.
5. **Onboarding tour fixed.** Was blocked because `localStorage` throws in the sandbox (the
   `storageOK()` gate). Now: layered seen flag (localStorage→sessionStorage→memory); auto‑starts
   on first visit; `?tour=on`/`window.__TOUR` forces; "?" always replays; steps match the current
   layout (map → play → worst district → From/To → an ⓘ → Lens finish); unfound targets are
   skipped, not fatal.

## Known caveats / watch‑list
- Period comparison shows "vs last week · no data" for evenings whose prior week is before the
  sample start (Oct 1); mid‑month evenings show the ▲/▼.
- A few preset routes overshoot slightly at the end when their governed district sequence lists
  the "via" district past the destination — faithful to the data.
- `anfra validate` must stay green; re‑run `anfra ingest` after any AML change.
- Transient `ERR_NETWORK_IO_SUSPENDED` console lines appear only under long headless runs (CDN
  throttle), not app bugs.
