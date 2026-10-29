# Period comparison

> Show each month next to the month before and the same month last year.

- Pattern id: `period-compare`
- Category: Dates & time
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#period-compare
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader turns on **Compare: previous month** and **same month last year**. Lines appear over the bars. Sep 2026 shows −26% month on month and −31% year on year.

Why: A number means little without something to compare it with.

## What to build

Each toggle adds a line for the same measure shifted back one period or one year, with the percent change per period.

Layout: Columns (this period) with a dark line (previous month) and a green line (last year).

Instruction: Let the reader overlay the previous period and the same period last year, with the % change.

Done when: For any period, the line shows the earlier period's value, and the percent change matches those two numbers.

On the ecommerce sample: With both toggles on, Sep 2026 shows −26% against Aug 2026 and −31% against Sep 2025.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
metric revenue_prev_month = revenue | relative_period(orders.ordered_at, interval(-1 month));
metric revenue_prev_year = revenue | relative_period(orders.ordered_at, interval(-1 year));
explore {
  dimensions { period: orders.ordered_at | month() }
  measures {
    total_revenue: revenue,
    prev_month: revenue_prev_month,
    prev_year: revenue_prev_year,
    mom_pct: (revenue - revenue_prev_month) * 100.0 / revenue_prev_month,
  }
  filters { orders.ordered_at matches @(2026-01-01 - 2026-09-30) }
  sorts { period asc }
}
```

Saved result:

| period | total_revenue | prev_month | prev_year | mom_pct |
|---|---|---|---|---|
| 2026-01-01 | 82610.21 | 65537.03 |  | 26.051195789616955 |
| 2026-02-01 | 86602.09 | 82610.21 |  | 4.832187207852394 |
| 2026-03-01 | 61464.65 | 86602.09 |  | -29.02636645374263 |
| 2026-04-01 | 77023.03 | 61464.65 |  | 25.312728535833198 |
| 2026-05-01 | 88378.49 | 77023.03 |  | 14.742941169673538 |
| 2026-06-01 | 98074.28 | 88378.49 | 97537.24 | 10.970757703599597 |
| 2026-07-01 | 78472.43 | 98074.28 | 66278.66 | -19.98673862301105 |
| 2026-08-01 | 89336.28 | 78472.43 | 70722.63 | 13.844161573689002 |
| 2026-09-01 | 65839.70 | 89336.28 | 94775.86 | -26.301274241551138 |

The `transform_pop_*` control operators fail on anfra, which is documented in API.md. Comparisons go in the AQL. The filter limits the base months, and `relative_period` still reads Dec 2025 for January's comparison.

## SDK wiring

```js
// toggles pick which measures to draw; one query returns all of
// them
compareMonth.onchange = () =>
  chart.setOption(
    series(trend.result, { prevMonth: compareMonth.checked }),
  );
```

State it touches: Renderer: which comparison lines are shown. Analytical: the comparison measures in the AQL.

## Notes

- `revenue | relative_period(orders.ordered_at, interval(-1 year))`, one line per comparison

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.cb { position: relative; } .cbc { display: flex; align-items: flex-end; height: 100%; } .cbw { flex: 1; min-width: 2px; height: 100%; position: relative; padding: 0; border: 0; border-radius: 0; background: none; display: block; } .cbw.click { cursor: pointer; } .cbw.click:hover .cbb { background: var(--violet-ink); } .cbb { position: absolute; left: 1px; right: 1px; bottom: 0; background: var(--violet); border-radius: 2px 2px 0 0; transition: height 320ms var(--ease); } .cbw.on .cbb { background: var(--violet-ink); } .cbw.hatch .cbb { background: repeating-linear-gradient(135deg, var(--violet) 0 3px, #fff 3px 6px); box-shadow: inset 0 0 0 1px var(--violet); } .cb svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; } .cbd { position: absolute; width: 6px; height: 6px; margin: 0 0 -3px -3px; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1.5px #fff; }  .ro { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; } .ro div { font-size: 12px; line-height: 16px; color: var(--muted); } .ro b { display: block; font-size: 14px; line-height: 20px; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; } .up { color: #1f7a4d; } .dn { color: #b42318; } .sw { display: inline-block; width: 12px; height: 2px; vertical-align: 3px; margin-right: 4px; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Compare</span><span class="chips"><button type="button" id="pm" aria-pressed="false"><span class="sw" style="background:var(--ink)"></span>vs previous month</button><button type="button" id="py" aria-pressed="false"><span class="sw" style="background:#1f8a5b"></span>vs same month last year</button></span>
		<select id="country" aria-label="Country"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Revenue 2026 by month</b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="ro" id="ro"></div></div>
		<div class="hint">Click a month to read it. The AQL's relative_period measures hold both comparisons; the toggles only draw them</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Period comparison', timezone: 'Etc/UTC' });
const AQL = 'metric revenue_prev_month = revenue | relative_period(orders.ordered_at, interval(-1 month));\nmetric revenue_prev_year = revenue | relative_period(orders.ordered_at, interval(-1 year));\nexplore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, prev_month: revenue_prev_month, prev_year: revenue_prev_year } filters { orders.ordered_at matches @(2026-01-01 - 2026-09-30) } sorts { period asc } }';
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
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
let pm = false, py = false, pick = null;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lab = (v, dy) => { const x = new Date(v); return MN[(x.getUTCMonth() + 12 + (dy === 'm' ? -1 : 0)) % 12] + ' ' + (x.getUTCFullYear() - (dy === 'y' || (dy === 'm' && x.getUTCMonth() === 0) ? 1 : 0)); };
const num = (v) => v == null ? null : Number(v);
const pct = (a, b) => b == null || !b ? null : (a - b) / b * 100;
const chg = (p) => p == null ? '<span class="hint">no data</span>' : '<span class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%</span>';
K.$('#pm').onclick = () => { pm = !pm; draw(); };
K.$('#py').onclick = () => { py = !py; draw(); };
function draw () {
	K.status(trend, K.$('#s1'));
	K.$('#pm').setAttribute('aria-pressed', String(pm)); K.$('#py').setAttribute('aria-pressed', String(py));
	if (trend.result && trend.result.rows.length) {
		const rows = trend.result.rows;
		const r = rows.find((x) => x.period === pick) || rows[rows.length - 1];
		combo(K.$('#trend'), rows, { label: (x) => lab(x.period), value: (x) => x.total_revenue, on: (x) => x === r, pick: (x) => { pick = x.period; draw(); },
			lines: [pm ? { value: (x) => num(x.prev_month), color: 'var(--ink)', dash: true } : null, py ? { value: (x) => num(x.prev_year), color: '#1f8a5b' } : null].filter(Boolean),
			tip: (x) => lab(x.period) + ' · ' + K.compact.format(Number(x.total_revenue)) + (pm && x.prev_month != null ? ' · prev ' + K.compact.format(Number(x.prev_month)) : '') + (py && x.prev_year != null ? ' · last year ' + K.compact.format(Number(x.prev_year)) : '') });
		const v = Number(r.total_revenue);
		K.$('#ro').innerHTML = '<div>' + K.esc(lab(r.period)) + '<b>' + K.compact.format(v) + '</b></div>'
			+ '<div>vs ' + K.esc(lab(r.period, 'm')) + (pm ? '' : ' (off)') + '<b>' + (pm ? (r.prev_month == null ? '–' : K.compact.format(Number(r.prev_month))) + ' ' + chg(pct(v, num(r.prev_month))) : '–') + '</b></div>'
			+ '<div>vs ' + K.esc(lab(r.period, 'y')) + (py ? '' : ' (off)') + '<b>' + (py ? (r.prev_year == null ? '–' : K.compact.format(Number(r.prev_year))) + ' ' + chg(pct(v, num(r.prev_year))) : '–') + '</b></div>';
	}
	K.sent(K.$('#sent'), app, [trend], () => ['lines: ' + ([pm ? 'previous month' : '', py ? 'last year' : ''].filter(Boolean).join(', ') || 'none') + ' (renderer state)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Click **vs previous month**: a dashed line for the month before appears over the bars
2. Click **vs same month last year**: a green line for last year appears
3. Read the numbers under the chart for **Sep 2026**: −26% vs Aug 2026 and −31% vs Sep 2025
4. Click another month to read its two changes

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
