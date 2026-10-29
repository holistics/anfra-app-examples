# Range brushing

> Drag across months on a chart, and other charts show only that period.

- Pattern id: `range-brush`
- Category: Selections (also Dates & time)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#range-brush
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader drags a brush across **Feb–Apr 2026**. The months inside it become the selection. Revenue in the range is $225k.

Why: Dragging across a period is quicker than typing two dates.

## What to build

Dragging across a time chart marks a period; the KPIs and other charts then count only the rows inside it.

Layout: Monthly columns with a translucent brush, and a KPI that follows.

Instruction: Let readers drag across a time chart to pick a period, and filter the other charts to it.

Done when: The title names the brushed period, the KPIs and other charts match it, and clearing the brush restores the full totals.

On the ecommerce sample: Drag from Feb 26 to Apr 26: the title reads Feb 26 – Apr 26 brushed, and In range shows $225,090 from 263 orders.

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
      "operator": "matches",
      "values": [
        "2026-02-01 - 2026-04-30"
      ]
    }
  ]
}
```

Saved result:

| period | total_revenue | num_orders |
|---|---|---|
| 2026-02-01 | 86602.09 | 87 |
| 2026-03-01 | 61464.65 | 97 |
| 2026-04-01 | 77023.03 | 79 |

The input shows the same range as a date filter. A brushed selection becomes date ranges only when the source chart's month comes from a date drill; with `| month()` in the AQL, the SDK matches exact days and the targets fail to compile (seen live on 15 Oct).

## SDK wiring

```js
app.mapCrossFilter(trend, kpis);
chart.on('brushEnd', (e) => {
  const [a, b] = e.areas[0].coordRange;
  trend.select(trend.result.rows.slice(a, b + 1));
  app.execute();
});
```

State it touches: Analytical: a selection of contiguous rows.

## Notes

- Select the rows under the brush, and the SDK writes the date condition at the applied grain

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>
		.bb { position: relative; height: 104px; display: flex; align-items: flex-end; gap: 2px; cursor: crosshair; user-select: none; touch-action: none; }
		.bb .c { flex: 1; min-width: 2px; background: var(--violet); border-radius: 2px 2px 0 0; transition: background-color 160ms var(--ease); pointer-events: none; }
		.bb.some .c:not(.in) { background: var(--violet-faint); }
		.bb .br { position: absolute; top: 0; bottom: 0; background: rgb(138 81 212 / 0.1); border: 1px solid var(--violet); border-radius: 4px; pointer-events: none; }
		.bx { display: flex; gap: 2px; font-size: 12px; line-height: 16px; color: var(--muted); margin-top: 4px; }
		.bx span { flex: 1; min-width: 2px; white-space: nowrap; overflow: visible; }
		#bycat .b { grid-template-columns: 72px minmax(0, 1fr) 52px; }
		</style>
		<div class="row"><span class="hint">Drag across the columns to brush a period, or click one month</span><button type="button" id="clear" hidden>Clear brush</button></div>
		<div class="panel"><div class="ph"><b>Revenue by month<span id="rng"></span></b><span class="status" id="s1"></span></div><div class="bb" id="bb"></div><div class="bx" id="bx"></div></div>
		<div class="cols" style="grid-template-columns: 1fr 1.4fr">
		<div class="panel"><div class="ph"><b>In range</b><span class="status" id="s2"></span></div><div class="lbl">Revenue</div><div class="kpi" id="rev">–</div><div class="lbl">Orders</div><div class="kpi" id="ord">–</div></div>
		<div class="panel"><div class="ph"><b>By category</b><span class="status" id="s3"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Range brushing', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const kpis = app.createQuery('kpis', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue, num_orders: order_count } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapCrossFilter(trend, kpis);
app.mapCrossFilter(trend, byCategory);
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const box = K.$('#bb');
let drag = null, live = null;
const idx = (e) => { const r = box.getBoundingClientRect(); const n = trend.result.rows.length; return Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n))); };
function drawBrush (a, b) {
	let br = box.querySelector('.br');
	if (a == null) { if (br) br.remove(); return; }
	if (!br) { br = document.createElement('div'); br.className = 'br'; box.appendChild(br); }
	const n = trend.result.rows.length, lo = Math.min(a, b), hi = Math.max(a, b);
	br.style.left = (lo / n * 100) + '%'; br.style.width = ((hi - lo + 1) / n * 100) + '%';
	box.querySelectorAll('.c').forEach((c, i) => c.classList.toggle('in', i >= lo && i <= hi));
	box.classList.add('some');
}
box.onpointerdown = (e) => { if (!trend.result) return; box.setPointerCapture(e.pointerId); const i = idx(e); drag = [i, i]; drawBrush(i, i); };
box.onpointermove = (e) => { if (!drag) return; drag[1] = idx(e); drawBrush(drag[0], drag[1]); };
box.onpointerup = () => { if (!drag) return; const lo = Math.min(...drag), hi = Math.max(...drag); drag = null; live = [lo, hi];
	trend.select(trend.result.rows.slice(lo, hi + 1)); app.execute(); };
K.$('#clear').onclick = () => { live = null; app.clearSelection(); app.execute(); };
app.subscribe(() => {
K.status(trend, K.$('#s1')); K.status(kpis, K.$('#s2')); K.status(byCategory, K.$('#s3'));
const s = trend.selectedRows;
if (!s.length) live = null;
K.$('#clear').hidden = !live;
K.$('#rng').textContent = live && s.length ? ': ' + mon(s[0].period) + (s.length > 1 ? ' – ' + mon(s[s.length - 1].period) : '') + ' brushed' : '';
if (trend.result && !drag) {
	const rows = trend.result.rows, max = Math.max(...rows.map((r) => Number(r.total_revenue)), 1);
	box.className = 'bb';
	box.replaceChildren(...rows.map((r) => { const c = document.createElement('div'); c.className = 'c'; c.style.height = (Number(r.total_revenue) / max * 100) + '%'; c.title = mon(r.period) + ' · ' + K.money.format(r.total_revenue); return c; }));
	K.$('#bx').replaceChildren(...rows.map((r, i) => { const sp = document.createElement('span'); sp.textContent = i % 3 === 0 ? mon(r.period) : ''; return sp; }));
	if (live) drawBrush(live[0], live[1]);
}
const k = kpis.result?.rows[0];
K.$('#rev').textContent = k ? K.money.format(k.total_revenue) : '–';
K.$('#ord').textContent = k ? K.int.format(k.num_orders) : '–';
if (byCategory.result) K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [kpis, byCategory]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Drag across **Revenue by month** from **Feb 26** to **Apr 26**
2. Read the title: **Feb 26 – Apr 26 brushed**
3. Read **In range**: revenue is $225,090 from 263 orders
4. Click **Clear brush** to drop the selection

## Other Selections patterns

- [Cross-filtering](single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Histogram brushing](numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Cross-highlighting](cross-highlight.md): Hover a country, and other charts keep their totals but highlight its share.
- [Multiple cross-filters](two-selections.md): Keep a selection in two charts at once, like Germany in one and Software in the other.
- [Selection cohort](selection-cohort.md): Select some customers and compare what they buy with everyone else.
