# Zoom / pan

> Scrolling zooms the picture, and double-clicking reloads that month week by week.

- Pattern id: `zoom-pan`
- Category: Controls (also Dates & time)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#zoom-pan
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A scroll zooms the monthly chart without a new query. A double-click on September changes the question: the range becomes September and the grain becomes week, so the query runs again.

Why: Readers expect zoom to show more detail, but zooming pixels can't show detail that was never loaded.

## What to build

Scrolling zooms the loaded chart in place without a new query; double-clicking a period reloads it at a finer grain.

Layout: Monthly columns with a zoom window, then the same panel redrawn as weekly bars.

Instruction: Let scrolling zoom a time chart without reloading, and a double-click on a period reload it at a finer grain.

Done when: Zooming never adds a query, a double-click shows the finer grain with partial periods marked, and Back returns to the start.

On the ecommerce sample: Scroll to zoom: Queries run stays at 1. Double-click Sep 26: the title becomes Revenue by week · Sep 2026 and Queries run goes to 2.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures { total_revenue: revenue, num_orders: order_count }
  sorts { period asc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "orders.ordered_at",
      "operator": "between",
      "values": [
        "2026-09-01",
        "2026-09-30"
      ]
    }
  ],
  "dateDrills": [
    {
      "field": "orders.ordered_at",
      "grain": "week"
    }
  ]
}
```

Saved result:

| period | total_revenue | num_orders |
|---|---|---|
| 2026-08-31 | 25466.19 | 24 |
| 2026-09-07 | 23519.63 | 23 |
| 2026-09-14 | 10983.09 | 16 |
| 2026-09-21 | 5870.79 | 10 |

Week buckets start on Monday: the first one, which starts on 31 Aug, holds only 1–6 Sep. The hatched bars mark partial weeks.

## SDK wiring

```js
chart.on('datazoom', () => {
  /* renderer only: no execute() */
});
chart.on('dblclick', (p) => {
  const month = trend.result.rows[p.dataIndex].period;
  range.setCondition({
    operator: 'between',
    values: [month, endOfMonth(month)],
  });
  grain.setGrain('week');
  app.execute();
});
```

State it touches: Renderer: the zoom window. Analytical: the range and the grain.

## Notes

- `createDateDrill` re-buckets every dimension built on the field, and the row key (`period`) stays the same

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="seg"><button type="button" id="zin" aria-label="Zoom in">＋</button><button type="button" id="zout" aria-label="Zoom out">－</button><button type="button" id="left" aria-label="Pan left">◀</button><button type="button" id="right" aria-label="Pan right">▶</button></span><button type="button" id="fit">Show all</button><button type="button" id="up" hidden>↑ Back to months</button></div>
		<div class="panel"><div class="ph"><b id="title">Revenue by month</b><span class="status" id="s1"></span></div>
		<div id="chart"></div><div class="mini" id="mini" aria-hidden="true"></div>
		<div class="hint" id="how">Scroll to zoom, drag to pan: no query. Double-click a month to load its weeks</div></div>
		<div class="row"><span class="hint" id="count"></span></div>
		<div class="sent" id="sent"></div></div>
		<style>.still .colz .cw .c { transition: none; } #chart { cursor: grab; user-select: none; } #chart .cw:focus-visible { outline: 2px solid var(--violet); } .mini { display: flex; gap: 2px; height: 6px; margin-top: 6px; } .mini i { flex: 1; border-radius: 2px; background: var(--sunken); } .mini i.in { background: var(--violet-faint); } .colz .cw.part .c { background: repeating-linear-gradient(135deg, var(--violet) 0 4px, var(--violet-faint) 4px 7px); }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Zoom / pan', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapControl(range, trend, { field: 'orders.ordered_at' });
let g = 'month', label = '', a = 0, b = 0, n = 0, zooms = 0, runs = 0, was = '', lo = '', hi = '';
const chart = K.$('#chart');
const iso = (x) => x.toISOString().slice(0, 10);
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const day = (v) => 'w/c ' + new Date(v).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clamp = () => { const w = Math.max(3, Math.min(n, b - a)); a = Math.max(0, Math.min(a, n - w)); b = a + w; };
function zoom (dir, at) { if (g !== 'month') return; const w = b - a, nw = Math.max(3, Math.min(n, w + dir * 2)); if (nw === w) return; const c = at == null ? (a + b) / 2 : at; a = Math.round(c - (c - a) * nw / w); b = a + nw; clamp(); zooms++; draw(true); }
function pan (d) { if (g !== 'month') return; const a0 = a; a += d; b += d; clamp(); if (a !== a0) { zooms++; draw(true); } }
function drill (r) {
	const s = new Date(r.period), e = new Date(s); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(0);
	lo = iso(s); hi = iso(e);
	label = s.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
	range.setCondition({ operator: 'between', values: [lo, hi] }); grain.setGrain('week'); g = 'week'; app.execute();
}
K.$('#zin').onclick = () => zoom(-1); K.$('#zout').onclick = () => zoom(1);
K.$('#left').onclick = () => pan(-1); K.$('#right').onclick = () => pan(1);
K.$('#fit').onclick = () => { if (g === 'month' && (a || b !== n)) { a = 0; b = n; zooms++; draw(true); } };
K.$('#up').onclick = () => { range.reset(); grain.setGrain('month'); g = 'month'; label = ''; app.execute(); };
chart.addEventListener('wheel', (e) => { if (g !== 'month') return; e.preventDefault(); const r = chart.getBoundingClientRect(); const at = a + (e.clientX - r.left) / r.width * (b - a); if (e.shiftKey) pan(e.deltaY > 0 ? 1 : -1); else zoom(e.deltaY > 0 ? 1 : -1, at); }, { passive: false });
let drag = null;
chart.addEventListener('mousedown', (e) => { drag = { x: e.clientX, a }; });
addEventListener('mouseup', () => { drag = null; });
chart.addEventListener('mousemove', (e) => { if (drag && !(e.buttons & 1)) drag = null; if (!drag || g !== 'month') return; const step = chart.getBoundingClientRect().width / (b - a); const d = Math.round((drag.x - e.clientX) / step); const a0 = a, w = b - a; a = drag.a + d; b = a + w; clamp(); if (a !== a0) { zooms++; draw(true); } });
function draw (still) {
	if (!trend.result) return;
	const rows = trend.result.rows;
	const vis = g === 'month' ? rows.slice(a, b) : rows;
	chart.classList.toggle('still', !!still);
	if (!still) { const tp = document.querySelector('.tip'); if (tp) tp.style.opacity = 0; }
	K.columns(chart, vis, { label: (r) => g === 'month' ? mon(r.period) : day(r.period), value: (r) => r.total_revenue });
	chart.querySelectorAll('.cw').forEach((c, i) => {
		const r = vis[i];
		if (g === 'month') { c.tabIndex = 0; c.title = 'Double-click to reload ' + mon(r.period) + ' by week'; c.ondblclick = () => drill(r); c.onkeydown = (e) => { if (e.key === 'Enter') drill(r); }; }
		else { const s = iso(new Date(r.period)), e = new Date(r.period); e.setUTCDate(e.getUTCDate() + 6); if (s < lo || iso(e) > hi) c.classList.add('part'); }
	});
	K.$('#mini').replaceChildren(...(g === 'month' ? rows.map((r, i) => { const x = document.createElement('i'); if (i >= a && i < b) x.className = 'in'; return x; }) : []));
	K.$('#title').textContent = g === 'month' ? 'Revenue by month · ' + mon(vis[0].period) + ' to ' + mon(vis[vis.length - 1].period) : 'Revenue by week · ' + label;
	K.$('#count').textContent = 'Queries run: ' + runs + ' · zoom and pan steps: ' + zooms + ' (no query)';
}
app.subscribe(() => {
if (trend.state === 'success' && was !== 'success') { runs++; if (g === 'month' && trend.result.rows.length !== n) { n = trend.result.rows.length; a = 0; b = n; } }
was = trend.state;
K.status(trend, K.$('#s1'));
K.$('#up').hidden = g === 'month';
K.$('.seg').style.display = K.$('#fit').style.display = g === 'month' ? '' : 'none';
K.$('#how').textContent = g === 'month' ? 'Scroll to zoom, drag to pan: no query. Double-click a month to load its weeks' : 'Weeks start on Monday. Hatched weeks are cut by the month edge';
if (trend.state !== 'executing') draw(false);
K.sent(K.$('#sent'), app, [trend]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Scroll over the monthly chart, or click **＋**, to zoom in
2. Read the count: **Queries run** stays at 1, only the zoom steps go up
3. Double-click the **Sep 26** column
4. Read the title: **Revenue by week · Sep 2026**, and **Queries run** goes up to 2
5. Click **↑ Back to months** to return

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
