# Period to date & trailing period

> Show a year-to-date total and a rolling 3-month total for each month.

- Pattern id: `to-date`
- Category: Dates & time (also Tables & calculations)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#to-date
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Toggles add **YTD**, which climbs and resets in January, and **Trailing 3 months**, a rolling total.

Why: Executives ask "where are we for the year?" and "what's the run rate?" more often than "what happened in March?".

## What to build

Each toggle adds a line over the trend: one sums from the start of each year, one sums a rolling window.

Layout: Monthly columns with a YTD line and a trailing-3-month line.

Instruction: Add toggles for a year-to-date line and a trailing-period total on the trend.

Done when: The year-to-date line climbs and resets at each year start, and the trailing line sums the last few periods.

On the ecommerce sample: The YTD line climbs through each year and resets in January, and a month's trailing 3-month total equals its revenue plus the two months before.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { period: orders.ordered_at | month() }
  measures {
    total_revenue: revenue,
    ytd: revenue | period_to_date('year', orders.ordered_at),
    trailing_3m: revenue | trailing_period(orders.ordered_at, interval(3 months)),
  }
  sorts { period asc }
}
```

Saved result:

| period | total_revenue | ytd | trailing_3m |
|---|---|---|---|
| 2025-06-01 | 97537.24 | 97537.24 | 97537.24 |
| 2025-07-01 | 66278.66 | 163815.90 | 163815.90 |
| 2025-08-01 | 70722.63 | 234538.53 | 234538.53 |
| 2025-09-01 | 94775.86 | 329314.39 | 231777.15 |
| 2025-10-01 | 85563.86 | 414878.25 | 251062.35 |
| 2025-11-01 | 74836.51 | 489714.76 | 255176.23 |
| 2025-12-01 | 65537.03 | 555251.79 | 225937.40 |
| 2026-01-01 | 82610.21 | 82610.21 | 222983.75 |
| 2026-02-01 | 86602.09 | 169212.30 | 234749.33 |
| 2026-03-01 | 61464.65 | 230676.95 | 230676.95 |
| 2026-04-01 | 77023.03 | 307699.98 | 225089.77 |
| 2026-05-01 | 88378.49 | 396078.47 | 226866.17 |

(4 more rows)

## SDK wiring

```js
// one query, three measures; toggles are renderer state
ytdToggle.onchange = () => redraw();
```

## Notes

- `period_to_date` and `trailing_period` are built-in functions

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.cb { position: relative; } .cbc { display: flex; align-items: flex-end; height: 100%; } .cbw { flex: 1; min-width: 2px; height: 100%; position: relative; padding: 0; border: 0; border-radius: 0; background: none; display: block; } .cbw.click { cursor: pointer; } .cbw.click:hover .cbb { background: var(--violet-ink); } .cbb { position: absolute; left: 1px; right: 1px; bottom: 0; background: var(--violet); border-radius: 2px 2px 0 0; transition: height 320ms var(--ease); } .cbw.on .cbb { background: var(--violet-ink); } .cbw.hatch .cbb { background: repeating-linear-gradient(135deg, var(--violet) 0 3px, #fff 3px 6px); box-shadow: inset 0 0 0 1px var(--violet); } .cb svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; } .cbd { position: absolute; width: 6px; height: 6px; margin: 0 0 -3px -3px; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1.5px #fff; }  .ro { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; } .ro div { font-size: 12px; line-height: 16px; color: var(--muted); } .ro b { display: block; font-size: 14px; line-height: 20px; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; } .sw { display: inline-block; width: 12px; height: 2px; vertical-align: 3px; margin-right: 4px; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Add</span><span class="chips"><button type="button" id="ytd" aria-pressed="false"><span class="sw" style="background:var(--ink)"></span>YTD</button><button type="button" id="t3" aria-pressed="false"><span class="sw" style="background:#1f8a5b"></span>Trailing 3 months</button></span>
		<select id="country" aria-label="Country"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Monthly revenue</b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="ro" id="ro"></div></div>
		<div class="hint">Click a month to read it. One query returns all three measures; the toggles only draw the lines</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Period to date & trailing period', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, ytd: revenue | period_to_date(\'year\', orders.ordered_at), trailing_3m: revenue | trailing_period(orders.ordered_at, interval(3 months)) } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, trend, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
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
let ytd = false, t3 = false, pick = null;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lab = (v) => { const x = new Date(v); return MN[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
const span3 = (v) => { const x = new Date(v); const a = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - 2, 1)); return MN[a.getUTCMonth()] + '–' + MN[x.getUTCMonth()]; };
K.$('#ytd').onclick = () => { ytd = !ytd; draw(); };
K.$('#t3').onclick = () => { t3 = !t3; draw(); };
function draw () {
	K.status(trend, K.$('#s1'));
	K.$('#ytd').setAttribute('aria-pressed', String(ytd)); K.$('#t3').setAttribute('aria-pressed', String(t3));
	if (trend.result && trend.result.rows.length) {
		const rows = trend.result.rows;
		const r = rows.find((x) => x.period === pick) || rows[rows.length - 1];
		combo(K.$('#trend'), rows, { label: (x) => lab(x.period), value: (x) => x.total_revenue, on: (x) => x === r, pick: (x) => { pick = x.period; draw(); },
			lines: [ytd ? { value: (x) => x.ytd, color: 'var(--ink)', dash: true } : null, t3 ? { value: (x) => x.trailing_3m, color: '#1f8a5b' } : null].filter(Boolean),
			tip: (x) => lab(x.period) + ' · ' + K.compact.format(Number(x.total_revenue)) + (ytd ? ' · YTD ' + K.compact.format(Number(x.ytd)) : '') + (t3 ? ' · 3m ' + K.compact.format(Number(x.trailing_3m)) : '') });
		const y = new Date(r.period).getUTCFullYear();
		K.$('#ro').innerHTML = '<div>' + K.esc(lab(r.period)) + '<b>' + K.compact.format(Number(r.total_revenue)) + '</b></div>'
			+ '<div>YTD, Jan–' + K.esc(lab(r.period)) + (ytd ? '' : ' (off)') + '<b>' + (ytd ? K.compact.format(Number(r.ytd)) : '–') + '</b></div>'
			+ '<div>Trailing 3m, ' + K.esc(span3(r.period)) + (t3 ? '' : ' (off)') + '<b>' + (t3 ? K.compact.format(Number(r.trailing_3m)) : '–') + '</b></div>';
	}
	K.sent(K.$('#sent'), app, [trend], () => ['lines: ' + ([ytd ? 'YTD' : '', t3 ? 'trailing 3 months' : ''].filter(Boolean).join(', ') || 'none') + ' (renderer state)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Click **YTD**: a dashed line climbs through each year and resets in January
2. Click **Trailing 3 months**: a green line shows the rolling 3-month total
3. Click a month to read its revenue, YTD and trailing 3 months under the chart

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
