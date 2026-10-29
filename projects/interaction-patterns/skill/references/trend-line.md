# Trend line

> Draw the line of best fit through a chart, to show which way it is heading.

- Pattern id: `trend-line`
- Category: Scenarios & analyses (also Dates & time, Tables & calculations)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#trend-line
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A dashed **linear** trend runs through 16 months of revenue. Across every month it slopes down, −$56 a month, because September 2026 has only 23 of 30 days. **Leaving out that month** turns it up, to +$342 a month. **Exponential** and a **3- or 6-month moving average** are one click away, and **Break down by category** fits a line for each: Software grows +$450 a month while Services falls −$202.

Why: Monthly numbers bounce around. A trend line answers "are we growing?" without the reader squinting at the bars.

## What to build

The query returns the points; the app fits a straight or exponential line through them, or draws a moving average that the query computes. A month that isn't over yet is left out of the fit.

Layout: Monthly columns with a dashed trend line; per-category lines when broken down.

Instruction: Add a dashed trend line to my time chart, with Linear, Exponential and Moving average options, one line per series when it has a legend, and an option to leave out the incomplete last period.

Done when: The trend follows the filters, each series gets its own line when broken down, and a short last period doesn't drag the line down.

On the ecommerce sample: Across all 16 months the linear trend is −$56 a month. Leaving out September 2026 (23 of 30 days) turns it to +$342 a month. Broken down by category, Software grows +$450 a month and Services falls −$202.

## AQL

Not run as written: the query returns the points; a moving average comes from window_avg.

```aql
explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, avg_3m: window_avg(revenue, -2..0, order: orders.ordered_at | month()), last_order_day: orders | max(orders.ordered_at) } sorts { period asc } }
```

## SDK wiring

```js
// least squares on the rows the query returned
function linear(ys) {
  const n = ys.length, mx = (n - 1) / 2;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0, sxx = 0;
  ys.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxy / sxx; // change per month
  return ys.map((_, x) => my + b * (x - mx));
}
const rows = q.result.rows;
const last = rows.at(-1);
// leave out a month that isn't over yet
const full = isPartial(last.last_order_day)
  ? rows.slice(0, -1) : rows;
drawDashed(linear(full.map((r) => +r.total_revenue)));
```

State it touches: Renderer state: the fit type and its options. The points, the moving average and the incomplete-month check come from the query, so filters reach them.

## Notes

- The query returns the points and `last_order_day`; the moving average is `window_avg` with a `partition` for each category
- Limits: Works with app code: AQL has no regression function, so the app fits linear and exponential lines on the returned rows, as a chart library would. Exponential needs values above zero.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>#chart svg { display: block; overflow: visible; } #chart text { font-size: 12px; fill: var(--muted); } .key { display: inline-block; width: 14px; height: 0; border-top: 2px dashed; vertical-align: 4px; margin-right: 4px; } #per[hidden] { display: none; } .cat { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; } .cat i { width: 8px; height: 8px; border-radius: 50%; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Trend line</span><span class="seg" id="types"></span><span class="seg" id="per"></span></div>
		<div class="row"><span class="chips"><button type="button" id="split" aria-pressed="false">Break down by category</button><button type="button" id="skip" aria-pressed="true">Leave out the incomplete month</button></span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue<span id="by"></span></b><span class="status" id="s1"></span></div><div id="chart"></div>
		<div class="hint" id="read"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Trend line', timezone: 'Etc/UTC' });
const m = 'orders.ordered_at | month()';
const avgs = (p) => 'avg_3m: window_avg(revenue, -2..0, order: ' + m + p + '), avg_6m: window_avg(revenue, -5..0, order: ' + m + p + ')';
const total = app.createQuery('total', { dataset: 'ecommerce', aql: 'explore { dimensions { period: ' + m + ' } measures { total_revenue: revenue, ' + avgs('') + ', last_order_day: orders | max(orders.ordered_at) } sorts { period asc } }' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { period: ' + m + ', category_name: products.category } measures { total_revenue: revenue, ' + avgs(', partition: products.category') + ' } sorts { category_name asc, period asc } }' });
const TYPES = [['linear', 'Linear'], ['exp', 'Exponential'], ['avg', 'Moving average']];
const ui = { type: 'linear', per: 3, split: false, skip: true };
const COLORS = ['#8a51d4', '#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const mon = (s) => { const x = D(s); return MN[x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function seg (el, items, key) {
	for (const [v, t] of items) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.dataset.v = v; b.onclick = () => { ui[key] = key === 'per' ? Number(v) : v; draw(); }; el.appendChild(b); }
}
seg(K.$('#types'), TYPES, 'type');
seg(K.$('#per'), [[3, '3 months'], [6, '6 months']], 'per');
K.$('#split').onclick = () => { ui.split = !ui.split; draw(); };
K.$('#skip').onclick = () => { ui.skip = !ui.skip; draw(); };
// least squares on x = 0, 1, 2 ... over the points the fit uses
function line (pts) {
	const n = pts.length; if (n < 2) return null;
	const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
	let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
	const b = sxy / sxx; return { a: my - b * mx, b };
}
// returns the fitted value at each x (null where it is not drawn), and a one-line reading
function fit (rows, use) {
	const ys = rows.map((r) => Number(r.total_revenue)), n = ys.length;
	if (ui.type === 'avg') { const k = ui.per === 6 ? 'avg_6m' : 'avg_3m'; const v = rows.map((r, i) => i >= ui.per - 1 ? Number(r[k]) : null); return { v, read: ui.per + '-month average ends at ' + K.compact.format(v[n - 1]) }; }
	const pts = ys.map((y, i) => [i, y]).filter((p, i) => use(i) && (ui.type !== 'exp' || p[1] > 0));
	if (ui.type === 'exp') {
		const f = line(pts.map(([x, y]) => [x, Math.log(y)])); if (!f) return { v: [], read: '' };
		const g = Math.exp(f.b) - 1;
		return { v: ys.map((_, i) => Math.exp(f.a + f.b * i)), read: (g >= 0 ? '+' : '') + (g * 100).toFixed(2) + '% a month' };
	}
	const f = line(pts); if (!f) return { v: [], read: '' };
	return { v: ys.map((_, i) => f.a + f.b * i), read: (f.b >= 0 ? '+' : '−') + K.money.format(Math.abs(f.b)).replace('-', '') + ' a month' };
}
function draw () {
	K.status(ui.split ? byCat : total, K.$('#s1'));
	K.$('#types').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ui.type)));
	K.$('#per').hidden = ui.type !== 'avg';
	K.$('#per').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === ui.per)));
	K.$('#split').setAttribute('aria-pressed', String(ui.split));
	K.$('#by').textContent = ui.split ? ' by category' : '';
	K.sent(K.$('#sent'), app, [ui.split ? byCat : total], () => ['trend line → ' + (ui.type === 'avg' ? ui.per + '-month window_avg, from the query' : TYPES.find((t) => t[0] === ui.type)[1].toLowerCase() + ' fit, drawn in the browser') + (ui.skip && ui.type !== 'avg' ? ', without the incomplete month' : '')]);
	if (!total.result || !total.result.rows.length) return;
	const rows = total.result.rows, n = rows.length, last = rows[n - 1];
	const end = D(last.period); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
	const partial = D(last.last_order_day) < end;
	const had = D(last.last_order_day).getUTCDate(), all = end.getUTCDate();
	const skip = ui.skip && partial && ui.type !== 'avg';
	K.$('#skip').textContent = partial ? 'Leave out ' + mon(last.period) + ' (' + had + ' of ' + all + ' days)' : 'Every month is complete';
	K.$('#skip').disabled = !partial || ui.type === 'avg';
	K.$('#skip').setAttribute('aria-pressed', String(skip));
	const use = (i) => !(skip && i === n - 1);
	let series;
	if (ui.split) {
		if (!byCat.result) return;
		const g = {}; for (const r of byCat.result.rows) (g[r.category_name] ||= {})[String(r.period).slice(0, 10)] = r;
		series = Object.keys(g).map((c, j) => { const rs = rows.map((r) => g[c][String(r.period).slice(0, 10)] || { total_revenue: 0, avg_3m: null, avg_6m: null }); return { name: c, color: COLORS[j % COLORS.length], ys: rs.map((r) => Number(r.total_revenue)), f: fit(rs, use) }; });
	} else series = [{ name: 'All categories', color: 'var(--violet)', ys: rows.map((r) => Number(r.total_revenue)), f: fit(rows, use) }];
	const W = K.$('#chart').clientWidth, H = 180, L = 40, R = 8, T = 6, B = 20, w = W - L - R, h = H - T - B;
	const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), q = v / p; return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 2.5 ? 2.5 : q <= 5 ? 5 : 10) * p; };
	const max = nice(Math.max(1, ...series.flatMap((s) => s.ys.concat(s.f.v.filter((x) => x != null)))));
	const step = w / n, x = (i) => L + step * i + step / 2, y = (v) => T + h - v / max * h;
	const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; }); return d; };
	let s = '<svg width="' + W + '" height="' + H + '"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--violet-faint)"/></pattern></defs>';
	for (const t of [0, 0.5, 1]) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(max * t) + '" y2="' + y(max * t) + '" stroke="var(--rule)"/><text x="' + (L - 4) + '" y="' + (y(max * t) + 4) + '" text-anchor="end">' + K.compact.format(max * t) + '</text>';
	if (!ui.split) series[0].ys.forEach((v, i) => { s += '<rect x="' + (x(i) - step * 0.38).toFixed(1) + '" width="' + (step * 0.76).toFixed(1) + '" y="' + y(v).toFixed(1) + '" height="' + (T + h - y(v)).toFixed(1) + '" rx="2" fill="' + (use(i) ? 'var(--violet-faint)' : 'url(#hatch)') + '"' + (use(i) ? '' : ' stroke="var(--violet-faint)"') + '><title>' + mon(rows[i].period) + ': ' + K.money.format(v) + (use(i) ? '' : ' (incomplete, left out of the fit)') + '</title></rect>'; });
	else for (const se of series) s += '<path d="' + path(se.ys) + '" fill="none" stroke="' + se.color + '" stroke-width="1.5" opacity=".45"/>';
	for (const se of series) s += '<path d="' + path(se.f.v) + '" fill="none" stroke="' + (ui.split ? se.color : 'var(--ink)') + '" stroke-width="2" stroke-dasharray="6 4"/>';
	s += '<text x="' + x(0) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(rows[0].period) + '</text><text x="' + x(n - 1) + '" y="' + (H - 4) + '" text-anchor="middle">' + mon(last.period) + '</text>';
	K.$('#chart').innerHTML = s + '</svg>';
	K.$('#read').innerHTML = series.map((se) => ui.split ? '<span class="cat"><i style="background:' + se.color + '"></i>' + K.esc(se.name) + ': ' + K.esc(se.f.read) + '</span>' : '<span class="key"></span>Trend: <b>' + K.esc(se.f.read) + '</b>' + (skip ? ' · fitted on ' + (n - 1) + ' full months' : ui.type === 'avg' ? '' : ' · fitted on all ' + n + ' months')).join('');
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the chart: the dashed **Linear** trend across all 16 months slopes down, **−$56 a month**
2. The last month is hatched: September 2026 has only 23 of 30 days. **Leave out Sep 26** is on, so the fit uses 15 full months and reads **+$342 a month**
3. Click **Leave out Sep 26** to turn it off: the line tips down again
4. Click **Moving average**, then **6 months**: the line now comes from `window_avg` in the query
5. Click **Linear**, then **Break down by category**: each category gets its own trend, Software **+$450 a month** and Services **−$202 a month**

## Other Scenarios & analyses patterns

- [Binning](bins.md): Group orders into size bands, like under $100 or over $1,000.
- [Reference line](targets.md): Draw a target line and show how far each month is above or below it.
- [What-if parameter](what-if.md): Try a price change, like +10% on Software, and watch revenue change.
- [Rule-based cohort](cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.
