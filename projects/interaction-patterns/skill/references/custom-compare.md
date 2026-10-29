# Custom period comparison

> Compare any two date ranges side by side, like H1 2026 and H2 2025.

- Pattern id: `custom-compare`
- Category: Dates & time
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#custom-compare
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks two ranges. Each country gets a pair of bars. Singapore grew from $82k to $113k, and Australia slipped from $119k to $113k.

Why: Launches, campaigns and seasons rarely line up with calendar periods.

## What to build

The reader picks two date ranges, and each item gets a pair of bars, one per range, with the percent change.

Layout: Paired horizontal bars per country.

Instruction: Let the reader pick two date ranges and compare them side by side.

Done when: Each pair matches that item's total in each range, and editing a date updates its bars right away.

On the ecommerce sample: With H2 2025 vs H1 2026, Singapore grows from $82k to $113k and Australia slips from $119k to $113k.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { country: customers.country }
  measures {
    h1_2026: revenue | exact_period(orders.ordered_at, @(2026-01-01 - 2026-06-30)),
    h2_2025: revenue | exact_period(orders.ordered_at, @(2025-07-01 - 2025-12-31)),
  }
  sorts { h1_2026 desc }
}
```

Saved result:

| country | h1_2026 | h2_2025 |
|---|---|---|
| Singapore | 113022.11 | 82176.18 |
| Australia | 112928.21 | 118664.80 |
| Vietnam | 88800.00 | 59959.90 |
| Germany | 72327.34 | 75832.27 |
| United States | 66426.54 | 79302.53 |
| Japan | 40648.55 | 41778.87 |

## SDK wiring

```js
// reader-chosen ranges: two date controls on two copies of the
// query (see bi-apps/drill.html)
app.mapControl(rangeA, queryA, { field: 'orders.ordered_at' });
app.mapControl(rangeB, queryB, { field: 'orders.ordered_at' });
```

## Notes

- `exact_period` for fixed ranges, or two date controls for ranges the reader picks

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
	.rg { display: grid; grid-template-columns: 20px 132px 136px 12px 136px; gap: 6px; align-items: center; }
	.rg b { font-size: 12px; text-align: center; border-radius: 6px; line-height: 20px; } .rg .ta { background: rgb(24 20 31 / 0.12); } .rg .tb { background: var(--violet); color: #fff; }
	.rg input[type=date] { width: 136px; padding: 0 6px; } .rg select { padding: 0 6px; }
	.pr { display: grid; grid-template-columns: 92px minmax(0, 1fr) 128px; gap: 8px; align-items: center; padding: 3px 4px; font-size: 12px; line-height: 16px; }
	.pr .t { display: grid; gap: 2px; } .pr .t span { display: block; height: 8px; border-radius: 2px; transition: width 320ms var(--ease); }
	.pr .a { background: rgb(24 20 31 / 0.18); } .pr .b { background: var(--violet); }
	.pr .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--weak); white-space: nowrap; } .up { color: #1f7a4d; } .dn { color: #b42318; }
	</style>
	<div class="app">
		<div class="rg"><b class="ta">A</b><select id="pa" aria-label="Range A preset"></select><input type="date" id="fa" aria-label="A from"><span class="hint">–</span><input type="date" id="ta" aria-label="A to"></div>
		<div class="rg"><b class="tb">B</b><select id="pb" aria-label="Range B preset"></select><input type="date" id="fb" aria-label="B from"><span class="hint">–</span><input type="date" id="tb" aria-label="B to"></div>
		<div class="panel"><div class="ph"><b>Revenue by country: <span id="la"></span> (grey) vs <span id="lb"></span></b><span class="status" id="s1"></span></div><div id="pairs"></div></div>
		<div class="hint">One query declared twice, each copy with its own date control</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Custom period comparison', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const qa = app.createQuery('byCountryA', { dataset: 'ecommerce', aql: AQL });
const qb = app.createQuery('byCountryB', { dataset: 'ecommerce', aql: AQL });
const ra = app.createFilter('rangeA', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Range A' });
const rb = app.createFilter('rangeB', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Range B' });
app.mapControl(ra, qa, { field: 'orders.ordered_at' });
app.mapControl(rb, qb, { field: 'orders.ordered_at' });
const P = [['H2 2025', '2025-07-01', '2025-12-31'], ['H1 2026', '2026-01-01', '2026-06-30'], ['Q3 2025', '2025-07-01', '2025-09-30'], ['Q3 2026', '2026-07-01', '2026-09-30'], ['Q2 2026', '2026-04-01', '2026-06-30'], ['Jun–Sep 2025', '2025-06-01', '2025-09-30'], ['Jun–Sep 2026', '2026-06-01', '2026-09-30']];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (a, b) => { const p = P.find((x) => x[1] === a && x[2] === b); if (p) return p[0]; const f = (s) => { const x = new Date(s + 'T00:00:00Z'); return x.getUTCDate() + ' ' + MN[x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); }; return f(a) + '–' + f(b); };
function wire (f, sel, from, to, def) {
	for (const p of P) sel.add(new Option(p[0], p[0]));
	sel.add(new Option('Custom dates', ''));
	const set = (a, b) => { from.value = a; to.value = b; f.setCondition({ operator: 'between', values: [a, b] }); };
	sel.onchange = () => { const p = P.find((x) => x[0] === sel.value); if (p) { set(p[1], p[2]); app.execute(); } };
	const typed = () => { if (from.value && to.value) { const p = P.find((x) => x[1] === from.value && x[2] === to.value); sel.value = p ? p[0] : ''; set(from.value, to.value); app.execute(); } };
	from.onchange = typed; to.onchange = typed;
	sel.value = def; const p = P.find((x) => x[0] === def); set(p[1], p[2]);
}
wire(ra, K.$('#pa'), K.$('#fa'), K.$('#ta'), 'H2 2025');
wire(rb, K.$('#pb'), K.$('#fb'), K.$('#tb'), 'H1 2026');
app.subscribe(() => {
const s = [qa, qb].find((q) => q.state === 'error' || q.state === 'executing') || qb; K.status(s, K.$('#s1'));
const ca = ra.appliedCondition, cb = rb.appliedCondition;
K.$('#la').textContent = ca && ca.values ? short(ca.values[0], ca.values[1]) : '';
K.$('#lb').textContent = cb && cb.values ? short(cb.values[0], cb.values[1]) : '';
if (qa.result && qb.result) {
	const A = new Map(qa.result.rows.map((r) => [r.country_name, Number(r.total_revenue)]));
	const B = new Map(qb.result.rows.map((r) => [r.country_name, Number(r.total_revenue)]));
	const names = [...new Set([...B.keys(), ...A.keys()])].sort((x, y) => (B.get(y) || 0) - (B.get(x) || 0));
	const max = Math.max(1, ...A.values(), ...B.values());
	const box = K.$('#pairs'); box.innerHTML = '';
	for (const n of names) {
		const a = A.get(n) || 0, b = B.get(n) || 0, p = a ? (b - a) / a * 100 : null;
		const d = document.createElement('div'); d.className = 'pr';
		d.innerHTML = '<span>' + K.esc(n) + '</span><span class="t"><span class="a" style="width:0"></span><span class="b" style="width:0"></span></span><span class="v">' + K.compact.format(a) + ' → ' + K.compact.format(b) + ' ' + (p == null ? '' : '<span class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%</span>') + '</span>';
		box.appendChild(d);
		requestAnimationFrame(() => { d.querySelector('.a').style.width = (a / max * 100) + '%'; d.querySelector('.b').style.width = (b / max * 100) + '%'; });
	}
}
K.sent(K.$('#sent'), app, [qa, qb]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Pick **H2 2025** in the **A** menu
2. Pick **H1 2026** in the **B** menu: each country gets a grey A bar and a violet B bar
3. Read **Singapore**: it grew from $82k to $113k
4. Read **Australia**: it slipped from $119k to $113k
5. Type your own dates in the date boxes to compare any two ranges

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
