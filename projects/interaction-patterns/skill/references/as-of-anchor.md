# As-of anchor

> Count "last 30 days" back from the newest data instead of from today.

- Pattern id: `as-of-anchor`
- Category: Dates & time
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#as-of-anchor
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

An anchor query finds the newest order: **23 Sep 2026**. "Last 30 days" now means 25 Aug–23 Sep, and a chip shows the anchor.

Why: With batch data, "today" is often after the newest data, and relative ranges come back empty.

## What to build

The page looks up the newest date in the data and counts relative ranges, like last 30 days, back from it.

Layout: Anchor chip, then range chips that resolve against it.

Instruction: Count relative date ranges back from the newest data instead of today, and show the as-of date.

Done when: Every day in the range has data, the range ends on the newest date, and a chip shows that as-of date.

On the ecommerce sample: With Newest order, a chip reads As of 23 Sep 2026, Last 30 days covers 25 Aug to 23 Sep, and every day has data.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore { measures { latest: orders | max(orders.ordered_at), earliest: orders | min(orders.ordered_at) } }
```

Saved result:

| latest | earliest |
|---|---|
| 2026-09-23 | 2025-06-01 |

The `bi-apps/drill.html` app in this repo already does this: it runs a `maxTime` query and works out its ranges from it.

## SDK wiring

```js
const anchor = app.createQuery('anchor', {
  dataset: 'ecommerce',
  aql: `
    explore {
      measures { latest: orders | max(orders.ordered_at) }
    }
  `,
});
await app.execute();
// '2026-09-23'
const end = anchor.result.rows[0].latest;
range.setCondition({
  operator: 'between',
  values: [minusDays(end, 29), end],
});
await app.execute();
```

## Notes

- One tiny anchor query, then ordinary `between` conditions
- Limits: Works with app code. A proposed AQL phrase such as `@(last 30 days as of latest)` would make it one line.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.anc[hidden] { display: none; } .anc { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: 999px; background: var(--violet-soft); color: var(--violet-ink); font-size: 12px; font-weight: 500; } .warn { color: #8a4b00; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Count back from</span><span class="seg" id="mode"><button type="button" data-m="today">Today</button><button type="button" data-m="anchor">Newest order</button></span><span class="anc" id="chip" hidden></span></div>
		<div class="row"><span class="chips" id="ranges"></span><span class="hint" id="resolved"></span></div>
		<div class="panel"><div class="ph"><b>Revenue <span id="kpi">–</span> · <span id="n">–</span> orders</b><span class="status" id="s1"></span></div><div id="days"></div>
		<div class="hint" id="note"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'As-of anchor', timezone: 'Etc/UTC' });
const anchor = app.createQuery('anchor', { dataset: 'ecommerce', aql: 'explore { measures { latest: orders | max(orders.ordered_at) } }' });
const daily = app.createQuery('daily', { dataset: 'ecommerce', aql: 'explore { dimensions { day: orders.ordered_at } measures { total_revenue: revenue, num_orders: order_count } sorts { day asc } }' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
app.mapControl(range, daily, { field: 'orders.ordered_at' });
let mode = 'today', N = 30;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const iso = (x) => x.toISOString().slice(0, 10);
const add = (s, n) => { const x = D(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const day = (s, y) => { const x = D(s); return x.getUTCDate() + ' ' + MN[x.getUTCMonth()] + (y === false ? '' : ' ' + x.getUTCFullYear()); };
const today = iso(new Date());
const latest = () => anchor.result ? String(anchor.result.rows[0].latest).slice(0, 10) : null;
// the dates each choice covers: anfra's 'last N day' ends yesterday; the anchored range ends on the newest order
const span = () => mode === 'today' ? [add(today, -N), add(today, -1)] : [add(latest(), -(N - 1)), latest()];
function apply () {
	if (mode === 'today') range.setCondition({ operator: 'last', values: [N], modifier: 'day' });
	else if (latest()) { const s = span(); range.setCondition({ operator: 'between', values: s }); }
	app.execute();
}
K.$('#mode').querySelectorAll('button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; apply(); }; });
const rs = K.$('#ranges');
for (const n of [7, 30, 90]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Last ' + n + ' days'; b.dataset.n = n; b.onclick = () => { N = n; apply(); }; rs.appendChild(b); }
const sameY = (a, b) => a.slice(0, 4) === b.slice(0, 4);
app.subscribe(() => {
K.status(daily, K.$('#s1'));
K.$('#mode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
rs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === N)));
const L = latest();
K.$('#mode').children[0].textContent = 'Today · ' + day(today, false);
K.$('#mode').children[1].textContent = L ? 'Newest order · ' + day(L, false) : 'Newest order';
K.$('#chip').hidden = mode !== 'anchor' || !L; K.$('#chip').textContent = L ? '⚓ As of ' + day(L) : '';
if (mode === 'anchor' && !L) return;
const s = span();
K.$('#resolved').textContent = s[0] && s[1] ? day(s[0], !sameY(s[0], s[1])) + ' – ' + day(s[1]) : '';
if (!daily.result) return;
const got = new Map(daily.result.rows.map((r) => [String(r.day).slice(0, 10), r]));
const rows = []; for (let d = s[0]; d <= s[1]; d = add(d, 1)) rows.push({ d, r: got.get(d) });
const rev = daily.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0), n = daily.result.rows.reduce((t, r) => t + Number(r.num_orders), 0);
K.$('#kpi').textContent = K.money.format(rev); K.$('#n').textContent = K.int.format(n);
K.columns(K.$('#days'), rows, { label: (x) => day(x.d), value: (x) => x.r ? x.r.total_revenue : 0 });
const empty = L && s[1] > L ? Math.round((D(s[1]) - D(L > s[0] ? L : add(s[0], -1))) / 864e5) : 0;
K.$('#note').innerHTML = empty ? '<span class="warn">⚠ ' + empty + ' of ' + N + ' days come after the newest order (' + K.esc(day(L)) + '), so they are empty</span>' : 'App code: the range ends on the newest order, so no day is past the data';
K.sent(K.$('#sent'), app, [daily], () => [mode === 'anchor' ? 'anchor ← max(orders.ordered_at) = ' + L + ' (app code turns it into between)' : (range.appliedCondition && range.appliedCondition.modifier ? 'modifier: day · anfra counts back from today' : '')]);
});
apply();
```

## Walkthrough on the gallery card

1. Read the chart on **Today** with **Last 30 days**: some of the 30 days come after the newest order, so they are empty
2. Click **Newest order**: the anchor query finds 23 Sep 2026 and a chip shows **⚓ As of 23 Sep 2026**
3. Read the range next to the chips: 25 Aug – 23 Sep 2026, 30 days that all have data
4. Click **Last 7 days** or **Last 90 days**: each range still ends on 23 Sep

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Date drill](date-drill.md): Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
