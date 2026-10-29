# Running total & moving calculation

> Add a running total and a 3-month average to a monthly chart.

- Pattern id: `cumulative-moving`
- Category: Tables & calculations (also Dates & time)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#cumulative-moving
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Toggles add a **running total** line and a **3-month moving average** over the monthly bars.

Why: Readers ask two questions here: "are we on track?" and "is it trending?"

## What to build

Each toggle adds a line over the bars: one keeps a running sum, the other averages each period with the two before.

Layout: Columns with two overlay lines.

Instruction: Add toggles for a running total and a 3-period moving average on the trend.

Done when: The running total's last point equals the sum of all bars, and the average line is smoother than the bars.

On the ecommerce sample: The running total climbs over the monthly bars on its own scale, and hovering a month shows its revenue, 3-month average and running total.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures {
    total_revenue: revenue,
    cumulative: revenue | running_total(orders.ordered_at),
    avg_3m: window_avg(revenue, -2..0, order: orders.ordered_at | month()),
  }
  sorts { period asc }
}
```

Saved result:

| period | total_revenue | cumulative | avg_3m |
|---|---|---|---|
| 2025-06-01 | 97537.24 | 97537.24 | 97537.24 |
| 2025-07-01 | 66278.66 | 163815.90 | 81907.95 |
| 2025-08-01 | 70722.63 | 234538.53 | 78179.51 |
| 2025-09-01 | 94775.86 | 329314.39 | 77259.05 |
| 2025-10-01 | 85563.86 | 414878.25 | 83687.45 |
| 2025-11-01 | 74836.51 | 489714.76 | 85058.74333333333 |
| 2025-12-01 | 65537.03 | 555251.79 | 75312.46666666666 |
| 2026-01-01 | 82610.21 | 637862.00 | 74327.91666666667 |
| 2026-02-01 | 86602.09 | 724464.09 | 78249.77666666667 |
| 2026-03-01 | 61464.65 | 785928.74 | 76892.31666666667 |
| 2026-04-01 | 77023.03 | 862951.77 | 75029.92333333334 |
| 2026-05-01 | 88378.49 | 951330.26 | 75622.05666666667 |

(4 more rows)

## SDK wiring

```js
// one query, three measures; the toggles only redraw
```

## Notes

- `running_total` and `window_avg` with a range such as `-2..0`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>#chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); } .key { display: inline-block; width: 14px; height: 0; border-top: 2px solid; vertical-align: 4px; margin-right: 4px; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Overlay</span><span class="chips"><button type="button" id="tRun" aria-pressed="false"><i class="key" style="border-color: var(--ink)"></i>Running total</button><button type="button" id="tAvg" aria-pressed="false"><i class="key" style="border-color: var(--violet-ink); border-top-style: dashed"></i>3-month average</button></span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue</b><span class="status" id="s1"></span></div><div id="chart"></div>
		<div class="hint" id="read"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Running total & moving average', timezone: 'Etc/UTC' });
const q = app.createQuery('monthly', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, cumulative: revenue | running_total(orders.ordered_at), avg_3m: window_avg(revenue, -2..0, order: orders.ordered_at | month()) } sorts { period asc } }' });
const on = { run: false, avg: false };
let hover = -1;
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const tog = (id, k) => { const b = K.$(id); b.onclick = () => { on[k] = !on[k]; b.setAttribute('aria-pressed', String(on[k])); draw(); }; };
tog('#tRun', 'run'); tog('#tAvg', 'avg');
function draw () {
	K.status(q, K.$('#s1'));
	K.sent(K.$('#sent'), app, [q], () => ['overlays → ' + (['running total', '3-month average'].filter((x, i) => on[i ? 'avg' : 'run']).join(' + ') || 'none') + ' (drawn in the browser, the query already returned all three)']);
	if (!q.result) return;
	const rows = q.result.rows, n = rows.length;
	const W = K.$('#chart').clientWidth, H = 170, L = 40, R = on.run ? 46 : 8, T = 6, B = 20, w = W - L - R, h = H - T - B;
	const rev = rows.map((r) => Number(r.total_revenue)), avg = rows.map((r) => Number(r.avg_3m)), cum = rows.map((r) => Number(r.cumulative));
	const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
	const max = nice(Math.max(...rev, ...avg)), cmax = nice(Math.max(...cum));
	const step = w / n, x = (i) => L + step * i + step / 2, y = (v) => T + h - v / max * h, yc = (v) => T + h - v / cmax * h;
	const path = (vals, f) => vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + f(v).toFixed(1)).join(' ');
	let s = '<svg width="' + W + '" height="' + H + '">';
	for (const t of [0, 0.5, 1]) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(max * t) + '" y2="' + y(max * t) + '" stroke="var(--rule)"/><text x="' + (L - 4) + '" y="' + (y(max * t) + 4) + '" text-anchor="end">' + K.compact.format(max * t) + '</text>';
	if (on.run) for (const t of [0, 0.5, 1]) s += '<text x="' + (W - R + 4) + '" y="' + (yc(cmax * t) + 4) + '" style="fill: var(--ink)">' + K.compact.format(cmax * t) + '</text>';
	rev.forEach((v, i) => { s += '<rect x="' + (x(i) - step * 0.38).toFixed(1) + '" width="' + (step * 0.76).toFixed(1) + '" y="' + y(v).toFixed(1) + '" height="' + (T + h - y(v)).toFixed(1) + '" rx="2" fill="' + (i === hover ? 'var(--violet)' : (on.run || on.avg ? 'var(--violet-faint)' : 'var(--violet)')) + '"/>'; });
	if (on.avg) s += '<path d="' + path(avg, y) + '" fill="none" stroke="var(--violet-ink)" stroke-width="2" stroke-dasharray="5 3"/>';
	if (on.run) s += '<path d="' + path(cum, yc) + '" fill="none" stroke="var(--ink)" stroke-width="2"/>' + '<circle cx="' + x(n - 1) + '" cy="' + yc(cum[n - 1]) + '" r="3" fill="var(--ink)"/>';
	s += '<text x="' + x(0) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[0].period) + '</text><text x="' + x(n - 1) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[n - 1].period) + '</text>';
	rows.forEach((r, i) => { s += '<rect data-i="' + i + '" x="' + (L + step * i) + '" width="' + step + '" y="' + T + '" height="' + h + '" fill="transparent"/>'; });
	K.$('#chart').innerHTML = s + '</svg>';
	K.$('#chart').querySelectorAll('rect[data-i]').forEach((el) => { el.onmouseenter = () => { const i = Number(el.dataset.i); if (i !== hover) { hover = i; draw(); } }; });
	K.$('#chart svg').onmouseleave = () => { if (hover !== -1) { hover = -1; draw(); } };
	const i = hover < 0 ? n - 1 : hover;
	K.$('#read').textContent = mon(rows[i].period) + ': revenue ' + K.money.format(rev[i]) + (on.avg ? ' · 3-month average ' + K.money.format(avg[i]) : '') + (on.run ? ' · running total ' + K.money.format(cum[i]) : '') + (hover < 0 && !on.run && !on.avg ? ' · hover a month' : '');
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Click **Running total**: a line climbs over the bars, on its own scale at the right
2. Click **3-month average**: a dashed line smooths the monthly bars
3. Hover a month to read its revenue, 3-month average and running total under the chart

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
