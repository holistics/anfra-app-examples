# Incomplete periods

> Mark a month that isn't over yet, so its short bar doesn't look like a drop.

- Pattern id: `partial-period`
- Category: Dates & time
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#partial-period
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The chart adds `last_order_day` to each month. September 2026 ends on the 23rd, so its bar is hatched and labelled "23 of 30 days".

Why: A short final bar looks like a collapse. Most false alarms on dashboards start here.

## What to build

The page checks the last date with data in each period and marks periods that end early as incomplete.

Layout: Columns with the last bar hatched and a footnote.

Instruction: Mark periods that aren't complete yet, so a partial period doesn't read as a drop.

Done when: Only the unfinished period is marked, its note says how many days it has, and complete periods look normal.

On the ecommerce sample: The Sep 2026 bar is hatched with a note of 23 of 30 days, and turning off Mark incomplete periods makes it read as a drop.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures {
    total_revenue: revenue,
    last_order_day: orders | max(orders.ordered_at),
    days_with_orders: orders | count_distinct(orders.ordered_at),
  }
  sorts { period asc }
}
```

Saved result:

| period | total_revenue | last_order_day | days_with_orders |
|---|---|---|---|
| 2025-06-01 | 97537.24 | 2025-06-30 | 29 |
| 2025-07-01 | 66278.66 | 2025-07-31 | 27 |
| 2025-08-01 | 70722.63 | 2025-08-31 | 28 |
| 2025-09-01 | 94775.86 | 2025-09-30 | 30 |
| 2025-10-01 | 85563.86 | 2025-10-31 | 31 |
| 2025-11-01 | 74836.51 | 2025-11-29 | 28 |
| 2025-12-01 | 65537.03 | 2025-12-31 | 30 |
| 2026-01-01 | 82610.21 | 2026-01-31 | 31 |
| 2026-02-01 | 86602.09 | 2026-02-28 | 26 |
| 2026-03-01 | 61464.65 | 2026-03-30 | 30 |
| 2026-04-01 | 77023.03 | 2026-04-30 | 27 |
| 2026-05-01 | 88378.49 | 2026-05-31 | 31 |

(4 more rows)

## SDK wiring

```js
trend.subscribe(() => {
  for (const r of trend.result?.rows ?? [])
    r._partial = r.last_order_day < endOfMonth(r.period);
});
```

## Notes

- One extra measure. The app compares it with the end of the period

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.cb { position: relative; } .cbc { display: flex; align-items: flex-end; height: 100%; } .cbw { flex: 1; min-width: 2px; height: 100%; position: relative; padding: 0; border: 0; border-radius: 0; background: none; display: block; } .cbw.click { cursor: pointer; } .cbw.click:hover .cbb { background: var(--violet-ink); } .cbb { position: absolute; left: 1px; right: 1px; bottom: 0; background: var(--violet); border-radius: 2px 2px 0 0; transition: height 320ms var(--ease); } .cbw.on .cbb { background: var(--violet-ink); } .cbw.hatch .cbb { background: repeating-linear-gradient(135deg, var(--violet) 0 3px, #fff 3px 6px); box-shadow: inset 0 0 0 1px var(--violet); } .cb svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; } .cbd { position: absolute; width: 6px; height: 6px; margin: 0 0 -3px -3px; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1.5px #fff; }  .fn { font-size: 12px; line-height: 16px; color: var(--weak); } .fn i { display: inline-block; width: 10px; height: 10px; vertical-align: -1px; margin-right: 4px; background: repeating-linear-gradient(135deg, var(--violet) 0 2px, #fff 2px 4px); box-shadow: inset 0 0 0 1px var(--violet); }</style>
	<div class="app">
		<div class="row"><span class="lbl">Grain</span><span class="seg" id="grains"></span><button type="button" id="mark" aria-pressed="true">Mark incomplete periods</button></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="g">month</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="fn" id="fn"></div></div>
		<div class="hint">last_order_day = max(orders.ordered_at) per period; app code compares it with the period end</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Incomplete periods', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue, last_order_day: orders | max(orders.ordered_at) } sorts { period asc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
function combo (el, rows, o) {
	const n = rows.length, vals = rows.map((r) => Number(o.value(r)) || 0), ls = o.lines || [];
	let max = Math.max(1, ...vals);
	for (const l of ls) for (const r of rows) { const v = l.value(r); if (v != null && isFinite(Number(v))) max = Math.max(max, Number(v)); }
	el.innerHTML = '<div class="cb" style="height:' + (o.height || 150) + 'px"><div class="cbc"></div><svg viewBox="0 0 ' + Math.max(n, 1) + ' 100" preserveAspectRatio="none"></svg></div><div class="axis"><span></span><span></span></div>';
	const box = el.querySelector('.cbc'), svg = el.querySelector('svg'), wrap = el.querySelector('.cb');
	let tip = document.querySelector('.tip'); if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
	rows.forEach((r, i) => {
		const c = document.createElement(o.pick ? 'button' : 'div');
		c.className = 'cbw' + (o.hatch && o.hatch(r) ? ' hatch' : '') + (o.on && o.on(r) ? ' on' : '') + (o.pick ? ' click' : '');
		if (o.pick) { c.type = 'button'; c.setAttribute('aria-label', o.label(r)); c.onclick = () => { tip.style.opacity = 0; o.pick(r); }; }
		c.innerHTML = '<span class="cbb" style="height:' + Math.max(0.5, vals[i] / max * 100) + '%"></span>';
		c.onmousemove = (e) => { tip.textContent = o.tip ? o.tip(r) : o.label(r); tip.style.left = Math.max(4, Math.min(e.clientX + 10, innerWidth - tip.offsetWidth - 4)) + 'px'; tip.style.top = (e.clientY - 30) + 'px'; tip.style.opacity = 1; };
		c.onmouseleave = () => { tip.style.opacity = 0; };
		box.appendChild(c);
	});
	for (const l of ls) {
		let seg = [];
		const flush = () => { if (seg.length > 1) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); p.setAttribute('points', seg.join(' ')); p.setAttribute('fill', 'none'); p.setAttribute('stroke', l.color); p.setAttribute('stroke-width', '2'); p.setAttribute('vector-effect', 'non-scaling-stroke'); if (l.dash) p.setAttribute('stroke-dasharray', '5 3'); svg.appendChild(p); } seg = []; };
		rows.forEach((r, i) => {
			const v = l.value(r);
			if (v == null || !isFinite(Number(v))) { flush(); return; }
			seg.push((i + 0.5) + ',' + (100 - Number(v) / max * 100));
			const d = document.createElement('span'); d.className = 'cbd'; d.style.background = l.color; d.style.left = ((i + 0.5) / n * 100) + '%'; d.style.bottom = (Number(v) / max * 100) + '%'; wrap.appendChild(d);
		});
		flush();
	}
	const ax = el.querySelectorAll('.axis span');
	ax[0].textContent = n ? o.label(rows[0]) : ''; ax[1].textContent = n > 1 ? o.label(rows[n - 1]) : '';
}
let g = 'month', mark = true;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const day = (s) => { const x = D(s); return x.getUTCDate() + ' ' + MN[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
const lab = (s) => { const x = D(s); return g === 'quarter' ? 'Q' + (Math.floor(x.getUTCMonth() / 3) + 1) + ' ' + x.getUTCFullYear() : g === 'month' ? MN[x.getUTCMonth()] + ' ' + x.getUTCFullYear() : 'Week of ' + day(s); };
function endOf (s) { const x = D(s); if (g === 'quarter') x.setUTCMonth(x.getUTCMonth() + 3); else if (g === 'month') x.setUTCMonth(x.getUTCMonth() + 1); else x.setUTCDate(x.getUTCDate() + 7); x.setUTCDate(x.getUTCDate() - 1); return x; }
const days = (a, b) => Math.round((b - a) / 864e5) + 1;
const seg = K.$('#grains');
for (const x of ['quarter', 'month', 'week']) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x[0].toUpperCase() + x.slice(1); b.dataset.g = x; b.onclick = () => { g = x; grain.setGrain(x); app.execute(); }; seg.appendChild(b); }
K.$('#mark').onclick = () => { mark = !mark; draw(); };
function draw () {
	K.status(trend, K.$('#s1'));
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === g)));
	K.$('#mark').setAttribute('aria-pressed', String(mark));
	K.$('#g').textContent = g;
	if (trend.result && trend.result.rows.length) {
		const rows = trend.result.rows, last = rows[rows.length - 1];
		const lastDay = D(last.last_order_day), end = endOf(last.period);
		const partial = lastDay < end;
		const isP = (r) => mark && partial && r === last;
		combo(K.$('#trend'), rows, { label: (r) => lab(r.period), value: (r) => r.total_revenue, hatch: isP,
			tip: (r) => lab(r.period) + ' · ' + K.compact.format(Number(r.total_revenue)) + ' · last order ' + day(r.last_order_day) });
		if (partial && mark) {
			const had = days(D(last.period), lastDay), all = days(D(last.period), end);
			K.$('#fn').innerHTML = '<i></i>' + K.esc(lab(last.period) + ': ' + had + ' of ' + all + ' days, data through ' + day(last.last_order_day).slice(0, -5) + ' · on pace for ' + K.compact.format(Number(last.total_revenue) / had * all));
		} else K.$('#fn').textContent = partial ? 'Marking is off: the last bar reads as a drop' : 'Every period is complete';
	}
	K.sent(K.$('#sent'), app, [trend], () => ['hatching: ' + (mark ? 'on' : 'off') + ' (renderer state)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the last bar, **Sep 2026**: it is hatched
2. Read the note under the chart: Sep 2026 has 23 of 30 days, data through 23 Sep
3. Click **Mark incomplete periods** to turn it off: the last bar now reads as a drop
4. Click **Quarter** next to **Grain**: the last quarter is marked the same way

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
