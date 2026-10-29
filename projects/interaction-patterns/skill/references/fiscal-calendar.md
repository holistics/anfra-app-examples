# Fiscal calendar

> Report by a fiscal year that starts in July instead of January.

- Pattern id: `fiscal-calendar`
- Category: Dates & time
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#fiscal-calendar
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks **Fiscal (July start)**. The quarters relabel: Jul–Sep 2026 becomes **FY27 Q1** at $234k.

Why: Finance teams report in fiscal periods, and calendar quarters confuse them.

## What to build

Switching to Fiscal regroups dates by a year that starts in a chosen month, and period labels change to match.

Layout: Quarter columns that relabel from calendar to fiscal.

Instruction: Let the reader switch the chart between calendar periods and our fiscal periods.

Done when: Each period keeps the same months and total under its new fiscal label, and the toggle switches back cleanly.

On the ecommerce sample: On Calendar, Jul to Sep 2026 reads Q3 2026 at $234k; after picking Fiscal (July start) it reads FY27 Q1 at the same $234k.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { fiscal_year: orders.fiscal_year, fiscal_quarter: orders.fiscal_quarter }
  measures { total_revenue: revenue }
  sorts { fiscal_year asc, fiscal_quarter asc }
}
```

Saved result:

| fiscal_year | fiscal_quarter | total_revenue |
|---|---|---|
| 2025 | 4 | 97537.24 |
| 2026 | 1 | 231777.15 |
| 2026 | 2 | 225937.40 |
| 2026 | 3 | 230676.95 |
| 2026 | 4 | 263475.80 |
| 2027 | 1 | 233648.41 |

`orders.fiscal_year` and `orders.fiscal_quarter` are defined once in `models/ecommerce/orders.model.aml` (added for this card), so every query and every reader can use them. A date drill still can't regrain them, so the toggle switches between two queries; a fiscal-aware date drill is proposed.

## SDK wiring

```js
// two declared queries, calendar and fiscal; the toggle picks which
// one to show
const calQ = app.createQuery('cal', {
  dataset: 'ecommerce',
  aql: CALENDAR_AQL,
});
const fyQ = app.createQuery('fy', {
  dataset: 'ecommerce',
  aql: FISCAL_AQL,
});
for (const q of [calQ, fyQ])
  app.mapControl(country, q, { field: 'customers.country' });
toggle.onchange = () =>
  show(toggle.value === 'fiscal' ? fyQ : calQ);
```

## Notes

- Fiscal year and quarter are model fields: one definition, used by name everywhere

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
	.qr { display: grid; grid-template-columns: 64px 96px minmax(0, 1fr) 52px; gap: 8px; align-items: center; height: 26px; padding: 0 4px; border-radius: 6px; font-size: 12px; line-height: 16px; }
	.qr .m { color: var(--muted); } .qr .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--weak); }
	.qr .t { height: 14px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
	.qr .f { display: block; height: 100%; background: var(--violet-faint); border-radius: 3px; transition: width 320ms var(--ease); }
	.qr.on { background: var(--violet-soft); } .qr.on .f { background: var(--violet); } .qr.on b { color: var(--violet-ink); }
	.qr b { font-weight: 600; }
	</style>
	<div class="app">
		<div class="row"><span class="lbl">Quarters</span><span class="seg" id="mode"><button type="button" data-m="cal">Calendar</button><button type="button" data-m="fy">Fiscal (July start)</button></span>
		<label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="what">calendar quarter</span></b><span class="status" id="s1"></span></div><div id="qs"></div>
		<div class="hint" id="note"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Fiscal calendar', timezone: 'Etc/UTC' });
const cal = app.createQuery('calendarQuarters', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | quarter() } measures { total_revenue: revenue } sorts { period asc } }' });
const fy = app.createQuery('fiscalQuarters', { dataset: 'ecommerce', aql: 'explore { dimensions { fy: orders.fiscal_year, fq: orders.fiscal_quarter } measures { total_revenue: revenue } sorts { fy asc, fq asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of [cal, fy]) app.mapControl(country, q, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
let mode = 'cal';
K.$('#mode').querySelectorAll('button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; draw(); }; });
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIRST = 2025 * 12 + 5;
function months (y, m0) { const a = Math.max(y * 12 + m0, FIRST), b = y * 12 + m0 + 2; const s = (k) => MN[k % 12]; return a === b ? s(a) + ' ' + Math.floor(a / 12) : s(a) + '–' + s(b) + ' ' + Math.floor(b / 12); }
function rows () {
	if (mode === 'cal') return cal.result ? cal.result.rows.map((r) => { const d = new Date(r.period), y = d.getUTCFullYear(), m = d.getUTCMonth(); return { k: 'Q' + (m / 3 + 1) + ' ' + y, m: months(y, m), v: Number(r.total_revenue), y, m0: m }; }) : null;
	return fy.result ? fy.result.rows.map((r) => { const Y = Number(r.fy), q = Number(r.fq), y = Y - 1 + Math.floor((6 + (q - 1) * 3) / 12), m = (6 + (q - 1) * 3) % 12; return { k: 'FY' + String(Y).slice(2) + ' Q' + q, m: months(y, m), v: Number(r.total_revenue), y, m0: m }; }) : null;
}
function draw () {
	const q = mode === 'cal' ? cal : fy;
	K.status(q, K.$('#s1'));
	K.$('#mode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
	K.$('#what').textContent = mode === 'cal' ? 'calendar quarter' : 'fiscal quarter (FY ends 30 Jun)';
	const rs = rows();
	if (rs) {
		const max = Math.max(1, ...rs.map((r) => r.v));
		const box = K.$('#qs'); box.innerHTML = '';
		for (const r of rs) {
			const d = document.createElement('div'); const on = r.y === 2026 && r.m0 === 6;
			d.className = 'qr' + (on ? ' on' : '');
			d.innerHTML = '<b>' + K.esc(r.k) + '</b><span class="m">' + K.esc(r.m) + '</span><span class="t"><span class="f" style="width:0"></span></span><span class="v">' + K.compact.format(r.v) + '</span>';
			box.appendChild(d);
			requestAnimationFrame(() => { d.querySelector('.f').style.width = (r.v / max * 100) + '%'; });
		}
		const j = rs.find((r) => r.y === 2026 && r.m0 === 6);
		K.$('#note').textContent = j ? 'Jul–Sep 2026 is ' + j.k + ' at ' + K.compact.format(j.v) + (mode === 'cal' ? '; switch to Fiscal to see it relabel' : ', the first quarter of fiscal 2027') : '';
	}
	K.sent(K.$('#sent'), app, [q], () => ['showing ' + q.name + ' (toggle picks the query; renderer state)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the **Calendar** quarters: Jul–Sep 2026 is **Q3 2026** at $234k
2. Click **Fiscal (July start)**: the quarters relabel
3. Read the highlighted row: Jul–Sep 2026 is now **FY27 Q1** at $234k

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
