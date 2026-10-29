# Filter mapping

> Choose which charts a filter changes, so a benchmark chart can stay unfiltered.

- Pattern id: `one-control-many`
- Category: Controls (also Filters)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#one-control-many
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks **Japan**. The KPI and the trend switch to Japan. The "All countries" benchmark doesn't move, because it isn't mapped.

Why: A benchmark that follows every filter stops being a benchmark. Each mapping is declared, so nothing is wired by accident.

## What to build

Each chart is mapped to the filters that should change it; an unmapped chart ignores them and carries a label saying so.

Layout: KPI tile + trend that follow the filter, next to a benchmark panel with a "not mapped" tag.

Instruction: Choose which charts each filter changes, and label any chart that stays unfiltered, like a benchmark.

Done when: Changing the filter moves only the mapped charts, the unmapped one stays put with its label, and clearing restores them all.

On the ecommerce sample: Click Japan: the KPI and trend switch to Revenue · Japan, while Benchmark: all countries keeps its bars and still says ran 1 time.

## AQL

Not run as written: uses the trend query from "Field filter" and the country query from "Percent of total".

```aql
// trend: mapped
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }
// benchmark: same Dataset, deliberately not mapped
explore { dimensions { country: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }
```

## SDK wiring

```js
for (const q of [kpi, trend])
  app.mapControl(country, q, { field: 'customers.country' });
// benchmark: no mapping, so the filter never reaches it
// the full wiring, inspectable
console.log(app.mappings.map((e) => e.id));
```

State it touches: Interaction mapping: edges from a control to queries. `app.mappings` lists every edge.

## Notes

- Every edge is declared, and there is no "filter everything" shortcut
- The Inspect panel (`_lib/inspector.js`) draws the graph

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Country</span><span class="chips" id="countries"></span></div>
		<div class="cols" style="grid-template-columns: 1.3fr 1fr">
		<div class="panel"><div class="ph"><b>Revenue · <span id="for">all countries</span></b><span class="tag on">follows Country</span></div>
			<div class="kpi" id="kpi">–</div><div class="hint" style="margin-bottom: 6px">KPI query <span class="status" id="s1"></span> · trend query <span class="status" id="s2"></span></div><div id="trend"></div></div>
		<div class="panel"><div class="ph"><b>Benchmark: all countries</b><span class="tag">not mapped</span></div><div id="bench"></div><div class="hint" style="margin-top: 6px">No mapping reaches it, so it never re-runs <span class="status" id="s3"></span></div></div></div>
		<div class="sent" id="sent"></div></div>
		<style>.ph { align-items: flex-start; } .tag { align-self: flex-start; font-size: 12px; line-height: 16px; padding: 0 6px; border-radius: 999px; border: 1px dashed var(--rule-strong); color: var(--muted); white-space: nowrap; } .tag.on { border: 1px solid var(--violet); color: var(--violet-ink); background: var(--violet-soft); } .hint .status { font-size: 12px; } .b { grid-template-columns: 84px minmax(0, 1fr) 48px; }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Filter mapping', timezone: 'Etc/UTC' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const bench = app.createQuery('benchmark', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of [kpi, trend]) app.mapControl(country, q, { field: 'customers.country' });
let picked = null;
const runs = { kpi: 0, trend: 0, benchmark: 0 }, was = {};
const chips = K.$('#countries');
country.loadOptions().then((vals) => vals.forEach((v) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.dataset.v = v; b.onclick = () => { picked = picked === v ? null : v; if (picked) country.setCondition({ operator: 'is', values: [picked] }); else country.reset(); app.execute(); }; chips.appendChild(b); }));
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
for (const q of [kpi, trend, bench]) { if (q.state === 'executing' && was[q.name] !== 'executing') runs[q.name]++; was[q.name] = q.state; }
chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === picked)));
K.status(kpi, K.$('#s1')); K.status(trend, K.$('#s2'));
K.$('#s3').textContent = '· ran ' + runs.benchmark + (runs.benchmark === 1 ? ' time' : ' times');
K.$('#for').textContent = picked || 'all countries';
if (kpi.result) K.$('#kpi').textContent = K.money.format(Number(kpi.result.rows[0]?.total_revenue || 0));
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
if (bench.result) K.bars(K.$('#bench'), bench.result.rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => r.country_name === picked });
K.sent(K.$('#sent'), app, [kpi, trend, bench], () => ['app.mappings → ' + app.mappings.map((e) => e.id).join(', ')]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **Japan** in the **Country** row
2. Read the left panel: the KPI and the trend switch to **Revenue · Japan**
3. Read **Benchmark: all countries**: its bars don't move, and it still says ran 1 time
4. Click **Japan** again to go back to all countries

## Other Controls patterns

- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
