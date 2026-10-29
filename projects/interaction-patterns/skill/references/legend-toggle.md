# Legend visibility

> Click a legend item to hide its line, or Alt-click to show only that line.

- Pattern id: `legend-toggle`
- Category: Controls (also Tables & calculations)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#legend-toggle
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Clicking **Services** in the legend hides its line, and the y-axis rescales without a query. Alt-clicking **Parts** filters the page to Parts, and every panel re-queries.

Why: The same gesture can mean "hide this" or "only this". The app should say which one it does.

## What to build

Clicking a legend item hides its series and rescales the chart in place; Alt-clicking it filters the whole page instead.

Layout: Four category lines with a clickable legend.

Instruction: Make a legend click hide or show a series, and an Alt-click filter the whole page to it, with a tooltip saying which.

Done when: A click hides one series with no new query, an Alt-click narrows every panel to it, and Show all brings everything back.

On the ecommerce sample: Click Services: its line hides and Queries run stays the same. Alt-click Parts: every panel re-queries and Total shows $13.7K.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category, period: orders.ordered_at | month() }
  measures { total_revenue: revenue }
  sorts { category asc, period asc }
}
```

Saved result:

| category | period | total_revenue |
|---|---|---|
| Hardware | 2025-06-01 | 13004.19 |
| Hardware | 2025-07-01 | 12268.36 |
| Hardware | 2025-08-01 | 10002.78 |
| Hardware | 2025-09-01 | 14003.71 |
| Hardware | 2025-10-01 | 11678.16 |
| Hardware | 2025-11-01 | 12913.76 |
| Hardware | 2025-12-01 | 9702.93 |
| Hardware | 2026-01-01 | 12172.21 |
| Hardware | 2026-02-01 | 12057.99 |
| Hardware | 2026-03-01 | 10655.80 |
| Hardware | 2026-04-01 | 9702.93 |
| Hardware | 2026-05-01 | 12605.34 |

(28 more rows)

## SDK wiring

```js
chart.on('legendselectchanged', (e) => {
  /* hide: renderer only */
});
legendEl.addEventListener('click', (e) => {
  if (!e.altKey) return;
  category.setCondition({
    operator: 'is',
    values: [e.target.dataset.series],
  });
  app.execute();
});
```

State it touches: Renderer: which series are hidden. Analytical: the category filter.

## Notes

- Hiding stays in the renderer. Filtering is one `setCondition` call

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lg" id="legend"></span><button type="button" id="all" hidden>Show all</button></div>
		<div class="hint">Click hides a line (no query). Alt-click or Alt+Enter filters every panel to it</div>
		<div class="cols" style="grid-template-columns: 1fr 132px">
		<div class="panel"><div class="ph"><b>Revenue by category, monthly</b><span class="status" id="s1"></span></div><div id="chart"></div></div>
		<div class="panel"><div class="ph"><b>Total</b><span class="status" id="s2"></span></div><div class="kpi" id="kpi">–</div><div class="hint" id="for">all categories</div></div></div>
		<div class="row"><span class="hint" id="count"></span></div>
		<div class="sent" id="sent"></div></div>
		<style>.lg { display: flex; gap: 4px; flex-wrap: wrap; } .lg button { height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; } .lg i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; } .lg button.off { color: var(--muted); text-decoration: line-through; } .lg button.off i { opacity: 0.3; } .lg button.out { color: var(--muted); border-style: dashed; } .lg button.out i { opacity: 0.3; } #chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); font-family: inherit; } #chart path { transition: d 320ms var(--ease); }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Legend visibility', timezone: 'Etc/UTC' });
const lines = app.createQuery('lines', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category, period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { category_name asc, period asc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const category = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
for (const q of [lines, kpi]) app.mapControl(category, q, { field: 'products.category' });
const COLORS = ['#8a51d4', '#1f9e89', '#e07b39', '#3b6fb6'];
let cats = [], only = null, hides = 0, runs = 0, was = '';
const hidden = new Set();
const legend = K.$('#legend');
const color = (c) => COLORS[Math.max(0, cats.indexOf(c)) % COLORS.length];
function filterTo (c) { only = only === c ? null : c; hidden.clear(); if (only) category.setCondition({ operator: 'is', values: [only] }); else category.reset(); app.execute(); }
function toggle (c) { if (only && only !== c) return; hidden.has(c) ? hidden.delete(c) : hidden.add(c); hides++; draw(); }
category.loadOptions().then((vals) => { cats = vals.map(String); legend.replaceChildren(...cats.map((c) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.innerHTML = '<i style="background:' + color(c) + '"></i>' + K.esc(c); b.onclick = (e) => { if (e.altKey) filterTo(c); else toggle(c); }; b.onkeydown = (e) => { if (e.key === 'Enter' && e.altKey) { e.preventDefault(); filterTo(c); } }; return b; })); draw(); });
K.$('#all').onclick = () => { hidden.clear(); hides++; if (only) filterTo(only); else draw(); };
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
function draw () {
	legend.querySelectorAll('button').forEach((b) => { const c = b.dataset.c; b.classList.toggle('off', hidden.has(c)); b.classList.toggle('out', !!only && only !== c); b.setAttribute('aria-pressed', String(!hidden.has(c) && (!only || only === c))); b.title = only && only !== c ? 'Filtered out: Alt-click to filter to ' + c : hidden.has(c) ? 'Hidden: click to show' : 'Click to hide, Alt-click to show only this'; });
	K.$('#all').hidden = !hidden.size && !only;
	K.$('#count').textContent = 'Queries run: ' + runs + ' · legend hides: ' + hides + ' (no query)';
	if (!lines.result) return;
	const el = K.$('#chart'), W = Math.max(200, el.clientWidth), H = 170, L = 44, B = 18;
	const periods = [...new Set(lines.result.rows.map((r) => r.period))].sort();
	const series = new Map();
	lines.result.rows.forEach((r) => { if (!series.has(r.category_name)) series.set(r.category_name, new Map()); series.get(r.category_name).set(r.period, Number(r.total_revenue)); });
	const shown = [...series.keys()].filter((c) => !hidden.has(c));
	const max = Math.max(1, ...shown.flatMap((c) => [...series.get(c).values()])) * 1.08;
	const x = (i) => L + (periods.length > 1 ? i / (periods.length - 1) : 0.5) * (W - L - 4), y = (v) => (H - B) - v / max * (H - B - 6);
	let s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Revenue by category">';
	[0, 0.5, 1].forEach((t) => { const v = max / 1.08 * t, yy = y(v); s += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" stroke="rgb(24 20 31 / 0.08)"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + K.compact.format(v) + '</text>'; });
	[0, Math.floor((periods.length - 1) / 2), periods.length - 1].forEach((i, k) => { if (periods[i]) s += '<text x="' + x(i) + '" y="' + H + '" text-anchor="' + ['start', 'middle', 'end'][k] + '">' + mon(periods[i]) + '</text>'; });
	shown.forEach((c) => { const m = series.get(c); s += '<path fill="none" stroke="' + color(c) + '" stroke-width="2" stroke-linejoin="round" d="' + periods.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(m.get(p) || 0).toFixed(1)).join(' ') + '"><title>' + K.esc(c) + '</title></path>'; });
	el.innerHTML = s + '</svg>';
}
app.subscribe(() => {
if (lines.state === 'success' && was !== 'success') runs++;
was = lines.state;
K.status(lines, K.$('#s1')); K.status(kpi, K.$('#s2'));
if (kpi.result) K.$('#kpi').textContent = K.compact.format(Number(kpi.result.rows[0]?.total_revenue || 0));
K.$('#for').textContent = only || 'all categories';
draw();
K.sent(K.$('#sent'), app, [lines, kpi], () => [hidden.size ? 'hidden in the renderer, not sent → ' + [...hidden].join(', ') : '']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **Services** in the legend: its line hides and the y-axis rescales
2. Read the count: the legend hides go up, and **Queries run** stays the same
3. Hold Alt and click **Parts**: every panel re-queries for Parts only
4. Read **Total**: it shows Parts, $13.7K
5. Click **Show all** to bring every line back

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
