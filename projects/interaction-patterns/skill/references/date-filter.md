# Date filter

> Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".

- Pattern id: `date-filter`
- Category: Dates & time
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#date-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

One date chip moves through exact dates (**1 Jan – 30 Jun 2026**), the phrase **last 3 months** (Jul–Sep) and **last 30 days**, which warns that data stops on 23 Sep, so only the days up to then count. Every chart mapped to it redraws. Calendar phrases like "last quarter" work the same way.

Why: People ask for dates in all three ways. They are one control that sends a different condition each time, not three features.

## What to build

One date control takes exact dates, presets or a typed phrase, turns it into a date range, and every mapped chart redraws.

Layout: A date chip with presets above the monthly chart.

Instruction: Add one date filter for the whole page with exact dates, presets and typed phrases, showing the dates each choice means.

Done when: Each choice shows the exact dates it means, every chart follows it, and a warning appears when the data ends early.

On the ecommerce sample: Last 30 days warns that data stops on 23 Sep 2026; typing last q and pressing Tab picks Last quarter: 272 orders, 1 Jul to 30 Sep 2026.

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
      "operator": "last",
      "values": [
        30
      ],
      "modifier": "day"
    }
  ]
}
```

Saved result:

| period | total_revenue | num_orders |
|---|---|---|
| 2026-09-01 | 13791.92 | 23 |

The AQL never changes; only the condition the SDK sends does. All three ran on ecommerce: `between` (runs 08 and 35), `last 30 day` (above, run 07b), `matches 'last 3 months'` (run 07) and `matches 'this year'` (run 07c). In fixed AQL the same ranges are literals: `@(2026-01-01 - 2026-06-30)`, `@(last 3 months)`, `@(last quarter)`.

## SDK wiring

```js
const range = app.createFilter('range', {
  type: 'date',
  label: 'Dates',
});
for (const q of [kpis, trend, table])
  app.mapControl(range, q, { field: 'orders.ordered_at' });

// exact dates
range.setCondition({
  operator: 'between',
  values: ['2026-01-01', '2026-06-30'],
});
// relative
range.setCondition({
  operator: 'last',
  values: [30],
  modifier: 'day',
});
// calendar phrase
range.setCondition({
  operator: 'matches',
  values: ['last quarter'],
});
app.execute();
```

## Notes

- One control, three conditions. The server understands phrases like `last quarter` in the app's time zone
- In fixed AQL they are literals: `@(last quarter)`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.warn { color: #8a4b00; } .rng { font-variant-numeric: tabular-nums; } input[type=date] { width: 140px; }
	.typein { position: relative; display: inline-block; }
	.typein input { width: 200px; padding-right: 30px; background: transparent; position: relative; z-index: 1; }
	.typein .clear { position: absolute; right: 4px; top: 4px; z-index: 2; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); font-size: 16px; line-height: 24px; cursor: pointer; }
	.typein .clear:hover { background: var(--sunken); color: var(--ink); }
	.typein .ghost { position: absolute; left: 11px; top: 0; height: 32px; line-height: 32px; font-size: 14px; color: var(--muted); white-space: pre; pointer-events: none; z-index: 0; }
	.typein .ghost i { font-style: normal; visibility: hidden; }
	.typein .bg { position: absolute; inset: 0; background: #fff; border-radius: 10px; z-index: 0; }
	.sugg { position: absolute; right: 0; top: 36px; z-index: 5; width: 280px; margin: 0; padding: 4px; list-style: none; background: #fff; border: 1px solid var(--rule); border-radius: 10px; box-shadow: 0 8px 24px rgb(24 20 31 / 0.12); }
	.sugg li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 14px; line-height: 20px; cursor: pointer; }
	.sugg li .r { color: var(--muted); font-size: 12px; white-space: nowrap; }
	.sugg li[aria-selected=true] { background: var(--violet-faint); color: var(--violet-ink); }
	.sugg li b { font-weight: 600; }
	.snap { animation: snap 420ms cubic-bezier(0.22, 1, 0.36, 1); }
	@keyframes snap { 0% { box-shadow: 0 0 0 0 var(--violet-soft); } 40% { box-shadow: 0 0 0 4px var(--violet-soft); } 100% { box-shadow: 0 0 0 0 transparent; } }
	@media (prefers-reduced-motion: reduce) { .snap { animation: none; } }</style>
	<div class="app">
		<div class="row"><span class="chips" id="presets"></span></div>
		<div class="row"><input type="date" id="from" aria-label="From" value="2026-01-01"><span class="hint">to</span><input type="date" id="to" aria-label="To" value="2026-06-30"><span class="typein"><span class="bg"></span><span class="ghost" id="ghost" aria-hidden="true"></span><input type="text" id="phrase" aria-label="Date phrase" placeholder="or type: last quarter" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="both" aria-expanded="false" aria-controls="sugg"><button type="button" class="clear" id="clear" aria-label="Clear the date phrase" title="Clear" hidden>×</button><ul class="sugg" id="sugg" role="listbox" aria-label="Date phrases" hidden></ul></span></div>
		<div class="hint rng" id="resolved"></div>
		<div class="panel"><div class="ph"><b>Revenue <span id="kpi">–</span> · <span id="n">–</span> orders</b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="legend"><span><i style="background:var(--violet)"></i>In the range</span><span><i style="background:rgb(24 20 31 / 0.07)"></i>All dates</span></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Date filter', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, num_orders: order_count } sorts { period asc } }';
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const all = app.createQuery('allDates', { dataset: 'ecommerce', aql: AQL });
const anchor = app.createQuery('dataEnd', { dataset: 'ecommerce', aql: 'explore { measures { latest: orders | max(orders.ordered_at) } }' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
app.mapControl(range, trend, { field: 'orders.ordered_at' });
const P = [
	{ k: 'h1', t: '1 Jan – 30 Jun 2026', c: { operator: 'between', values: ['2026-01-01', '2026-06-30'] } },
	{ k: 'l3m', t: 'Last 3 months', c: { operator: 'matches', values: ['last 3 months'] } },
	{ k: 'l30', t: 'Last 30 days', c: { operator: 'last', values: [30], modifier: 'day' } },
	{ k: 'ty', t: 'This year', c: { operator: 'matches', values: ['this year'] } },
	{ k: 'lq', t: 'Last quarter', c: { operator: 'matches', values: ['last quarter'] } },
];
let cur = 'h1';
const iso = (x) => x.toISOString().slice(0, 10);
const D = (s) => new Date(s + 'T00:00:00Z');
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (s, y) => { const x = D(s); return x.getUTCDate() + ' ' + MN[x.getUTCMonth()] + (y === false ? '' : ' ' + x.getUTCFullYear()); };
const now = new Date(); const Y = now.getUTCFullYear(), M = now.getUTCMonth();
const ymd = (y, m, d) => iso(new Date(Date.UTC(y, m, d)));
const today = ymd(Y, M, now.getUTCDate());
function resolve (c) {
	if (!c) return null;
	if (c.operator === 'between') return c.values;
	if (c.operator === 'last') return [ymd(Y, M, now.getUTCDate() - c.values[0]), ymd(Y, M, now.getUTCDate() - 1)];
	const p = String(c.values[0]).trim().toLowerCase();
	if (p === 'last 3 months') return [ymd(Y, M - 3, 1), ymd(Y, M, 0)];
	if (p === 'this year') return [ymd(Y, 0, 1), ymd(Y, 11, 31)];
	if (p === 'last quarter') { const q = Math.floor(M / 3) * 3; return [ymd(Y, q - 3, 1), ymd(Y, q, 0)]; }
	if (p === 'this month') return [ymd(Y, M, 1), ymd(Y, M + 1, 0)];
	if (p === 'last month') return [ymd(Y, M - 1, 1), ymd(Y, M, 0)];
	if (p === 'last year') return [ymd(Y - 1, 0, 1), ymd(Y - 1, 11, 31)];
	if (p === 'year to date') return [ymd(Y, 0, 1), today];
	let m = p.match(/^last (\d+) months$/);
	if (m) return [ymd(Y, M - Number(m[1]), 1), ymd(Y, M, 0)];
	m = p.match(/^last (\d+) days$/);
	if (m) return [ymd(Y, M, now.getUTCDate() - Number(m[1])), ymd(Y, M, now.getUTCDate() - 1)];
	m = p.match(/^q([1-4]) (\d{4})$/);
	if (m) return [ymd(Number(m[2]), (m[1] - 1) * 3, 1), ymd(Number(m[2]), m[1] * 3, 0)];
	m = p.match(/^(\d{4})$/);
	if (m) return [m[1] + '-01-01', m[1] + '-12-31'];
	return null;
}
const seg = K.$('#presets'), from = K.$('#from'), to = K.$('#to'), phrase = K.$('#phrase');
function choose (k, c) {
	cur = k;
	if (c) range.setCondition(c); else range.reset();
	app.execute();
}
for (const p of P) { const b = document.createElement('button'); b.type = 'button'; b.textContent = p.t; b.dataset.k = p.k; b.onclick = () => { const ex = p.c.operator === 'between'; from.value = ex ? p.c.values[0] : ''; to.value = ex ? p.c.values[1] : ''; phrase.value = ''; typed = ''; snapped = ''; choose(p.k, p.c); }; seg.appendChild(b); }
const exact = () => { if (from.value && to.value) { phrase.value = ''; choose(from.value === '2026-01-01' && to.value === '2026-06-30' ? 'h1' : 'exact', { operator: 'between', values: [from.value, to.value] }); } };
from.onchange = exact; to.onchange = exact;
// the type-in: phrases anfra resolves; typing completes inline, and a phrase that is also a chip snaps to it
const PH = ['last month', 'last quarter', 'last 3 months', 'last 6 months', 'last 12 months', 'last 30 days', 'this year', 'year to date', 'last year', 'Q2 2026', '2026'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ghost = K.$('#ghost'), sugg = K.$('#sugg');
let typed = '', snapped = '', pick = 0, list = [];
const cs = getComputedStyle(phrase);
Object.assign(ghost.style, { font: cs.font, letterSpacing: cs.letterSpacing, left: (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)) + 'px', lineHeight: phrase.offsetHeight + 'px', height: phrase.offsetHeight + 'px' });
const norm = (v) => v.toLowerCase().replace(/\s+/g, ' ').replace(/^(past|previous|prev) /, 'last ').replace(/^ytd$/, 'year to date').replace(/^q([1-4])$/, 'q$1 2026');
const span = (p) => { const r = resolve({ operator: 'matches', values: [p] }); return r ? day(r[0], r[0].slice(0, 4) !== r[1].slice(0, 4)) + ' – ' + day(r[1]) : ''; };
function matchesFor (v) {
	const n = norm(v.trimStart());
	if (!n) return PH.slice();
	const starts = PH.filter((p) => p.toLowerCase().startsWith(n));
	return starts.concat(PH.filter((p) => !starts.includes(p) && p.toLowerCase().includes(n)));
}
function drawList () {
	sugg.hidden = !list.length || document.activeElement !== phrase;
	phrase.setAttribute('aria-expanded', String(!sugg.hidden));
	sugg.innerHTML = '';
	list.forEach((p, i) => {
		const li = document.createElement('li');
		li.id = 'opt' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === pick));
		const n = norm(phrase.value.trimStart()), at = n ? p.toLowerCase().indexOf(n) : -1;
		li.innerHTML = '<span>' + (at >= 0 ? K.esc(p.slice(0, at)) + '<b>' + K.esc(p.slice(at, at + n.length)) + '</b>' + K.esc(p.slice(at + n.length)) : K.esc(p)) + '</span><span class="r">' + K.esc(span(p)) + '</span>';
		li.onmousedown = (e) => { e.preventDefault(); accept(p); };
		sugg.appendChild(li);
	});
	if (!sugg.hidden) phrase.setAttribute('aria-activedescendant', 'opt' + pick); else phrase.removeAttribute('aria-activedescendant');
}
// inline completion: the rest of the first phrase that starts with what was typed, in grey
function drawGhost () {
	const v = phrase.value, p = list[pick];
	const ok = v && p && p.toLowerCase().startsWith(norm(v)) && norm(v) === v.toLowerCase();
	ghost.innerHTML = ok ? '<i>' + K.esc(v) + '</i>' + K.esc(p.slice(v.length)) : '';
}
phrase.oninput = () => { typed = phrase.value; list = matchesFor(phrase.value); pick = 0; drawList(); drawGhost(); };
phrase.onfocus = () => { stopHint(); list = matchesFor(phrase.value); drawList(); drawGhost(); };
phrase.onblur = () => { sugg.hidden = true; phrase.setAttribute('aria-expanded', 'false'); ghost.innerHTML = ''; startHint(); };
phrase.onkeydown = (e) => {
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!list.length) return; e.preventDefault(); pick = (pick + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length; drawList(); drawGhost(); return; }
	if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghost.textContent && phrase.selectionStart === phrase.value.length) { e.preventDefault(); accept(list[pick]); return; }
	if (e.key === 'Enter') { e.preventDefault(); const v = phrase.value.trim(); if (list.length && (!v || norm(v) !== v.toLowerCase() || list[pick].toLowerCase().startsWith(norm(v)) || list[pick].toLowerCase().includes(norm(v)))) accept(list[pick]); else apply(v); return; }
	if (e.key === 'Escape') { sugg.hidden = true; ghost.innerHTML = ''; }
};
// snap: the rest of the phrase types itself in, the box pulses, and a matching chip takes over
function accept (p) {
	if (!p) return;
	typed = phrase.value || typed;
	const start = phrase.value.toLowerCase() && p.toLowerCase().startsWith(phrase.value.toLowerCase()) ? phrase.value.length : 0;
	ghost.innerHTML = ''; sugg.hidden = true;
	const done = () => { phrase.value = p; syncClear(); apply(p); pulse(phrase.parentElement); };
	if (REDUCED) { done(); return; }
	let i = start;
	const step = () => { i++; phrase.value = p.slice(0, i); if (i < p.length) setTimeout(step, 16); else done(); };
	if (start >= p.length) done(); else { phrase.value = p.slice(0, start); step(); }
}
function pulse (el) { el.classList.remove('snap'); void el.offsetWidth; el.classList.add('snap'); }
function apply (v) {
	from.value = ''; to.value = '';
	if (!v) { snapped = ''; choose('all', null); return; }
	snapped = v;
	const chip = P.find((x) => x.t.toLowerCase() === v.toLowerCase());
	if (chip) { choose(chip.k, chip.c); requestAnimationFrame(() => pulse(seg.querySelector('[data-k="' + chip.k + '"]'))); }
	else choose('phrase', { operator: 'matches', values: [v] });
}
phrase.onchange = null;
// × empties the box and drops the phrase, so every order counts again
const clearBtn = K.$('#clear');
const syncClear = () => { clearBtn.hidden = !phrase.value; };
clearBtn.onmousedown = (e) => e.preventDefault();
clearBtn.onclick = () => { phrase.value = ''; typed = ''; ghost.innerHTML = ''; syncClear(); if (cur === 'phrase' || P.some((x) => x.k === cur && x.t.toLowerCase() === snapped.toLowerCase())) apply(''); phrase.focus(); };
phrase.addEventListener('input', syncClear);
// while the box is empty, its placeholder types out a few of the phrases
let hintT = null, hintI = 0;
function startHint () {
	if (REDUCED || phrase.value || hintT) return;
	const run = () => {
		const p = PH[hintI++ % PH.length];
		let i = 0;
		const type = () => { i++; phrase.placeholder = 'or type: ' + p.slice(0, i); if (i < p.length) hintT = setTimeout(type, 45); else hintT = setTimeout(run, 1800); };
		type();
	};
	hintT = setTimeout(run, 1200);
}
function stopHint () { clearTimeout(hintT); hintT = null; phrase.placeholder = 'or type: last quarter'; }
startHint();
range.setCondition(P[0].c);
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
syncClear();
K.status(trend, K.$('#s1'));
seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === cur)));
const ac = range.appliedCondition;
const c = ac && ac.operator && ac.values && ac.values.length ? ac : null;
const r = resolve(c);
const end = anchor.result ? String(anchor.result.rows[0].latest).slice(0, 10) : null;
let txt = !c ? 'Every order: no date condition' : r ? 'Resolved: ' + day(r[0], r[0].slice(0, 4) !== r[1].slice(0, 4)) + ' – ' + day(r[1]) : 'anfra resolved "' + c.values[0] + '" on the server, in the app time zone (UTC)';
let warn = '';
if (end && c && (r ? r[1] > end : (/^(last|this|today|yesterday|past)/i.test(String(c.values[0])) && today > end))) warn = 'Data stops on ' + day(end) + ', so only days up to then count';
K.$('#resolved').innerHTML = K.esc(txt) + (warn ? ' · <span class="warn">⚠ ' + K.esc(warn) + '</span>' : '');
if (!trend.result) return;
const rows = trend.result.rows;
K.$('#kpi').textContent = K.money.format(rows.reduce((t, x) => t + Number(x.total_revenue), 0));
K.$('#n').textContent = K.int.format(rows.reduce((t, x) => t + Number(x.num_orders), 0));
const got = new Map(rows.map((x) => [x.period, x.total_revenue]));
const base = all.result ? all.result.rows : rows;
K.columns(K.$('#trend'), base, { label: (x) => mon(x.period), value: (x) => got.get(x.period) || 0, ghost: (x) => x.total_revenue });
K.sent(K.$('#sent'), app, [trend], () => [c && c.modifier ? 'modifier: ' + c.modifier + ' (last ' + c.values[0] + ' ' + c.modifier + 's)' : '', snapped && typed && typed.toLowerCase() !== snapped.toLowerCase() ? 'typed "' + typed + '" → snapped to "' + snapped + '"' : '']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the chart: the **1 Jan – 30 Jun 2026** chip is on, with exact dates
2. Click **Last 3 months**: the range moves to Jul–Sep
3. Click **Last 30 days**: a warning says data stops on 23 Sep 2026, so only days up to then count
4. Type **last q** in the **or type: last quarter** box, then press Tab to accept the grey **uarter**
5. Read the chart: **Last quarter** lights up, with 272 orders from 1 Jul to 30 Sep 2026

## Other Dates & time patterns

- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
