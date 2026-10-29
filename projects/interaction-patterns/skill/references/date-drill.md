# Date drill

> Switch the time detail between day, week, month and quarter, or click a period to see it in more detail.

- Pattern id: `date-drill`
- Category: Dates & time (also Drilling, Tables & calculations)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#date-drill
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader switches **Month → Quarter**, and 16 bars become 6. Then they click **Q2 2026**: the range narrows to April–June and the grain steps down to month.

Why: The right level of time detail depends on the question, and time is the hierarchy every reader already knows.

## What to build

Clicking a period swaps the time grain one level finer and keeps that period as a filter.

Layout: A grain switch above a column chart that rebuckets, then drills into the clicked quarter.

Instruction: Let the reader switch the time detail of the chart and click a period to zoom into it, with a way back out.

Done when: The finer periods add up to the period clicked, and a breadcrumb takes the reader back up.

On the ecommerce sample: Switching to Quarter turns 16 month bars into 6; clicking Q2 2026 shows only April to June by month, and All dates returns every month.

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
      "operator": "between",
      "values": [
        "2026-01-01",
        "2026-12-31"
      ]
    }
  ],
  "dateDrills": [
    {
      "field": "orders.ordered_at",
      "grain": "quarter"
    }
  ]
}
```

Saved result:

| period | total_revenue | num_orders |
|---|---|---|
| 2026-01-01 | 230676.95 | 291 |
| 2026-04-01 | 263475.80 | 289 |
| 2026-07-01 | 233648.41 | 272 |

The input shows the quarter grain within 2026. Run 08 drilled September 2026 to weeks: weeks start on Monday, so the first bucket (31 Aug) holds only 1–6 Sep.

## SDK wiring

```js
const grain = app.createDateDrill('grain', { default: 'month' });
// the field, not the alias
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
grainButtons.onclick = (e) => {
  grain.setGrain(e.target.value);
  app.execute();
};

// click a period to drill into it: narrow the range, step the grain
// down
chart.on('click', (p) => {
  const start = trend.result.rows[p.dataIndex].period;
  range.setCondition({
    operator: 'between',
    values: [start, endOf(start, currentGrain)],
  });
  grain.setGrain(nextFiner[currentGrain]);
  app.execute();
});
```

## Notes

- One date drill rebuckets every dimension built on `orders.ordered_at`
- The row key stays `period`, so the renderer doesn't change
- Drilling in is two controls, a range and a grain, applied in one run

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Grain</span><span class="seg" id="grains"></span><button type="button" id="up" hidden>↑ All dates</button></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="g">month</span><span id="range"></span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint">Click a column to drill into that period</div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Date drill', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
const range = app.createFilter('range', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapControl(range, trend, { field: 'orders.ordered_at' });
const G = ['year', 'quarter', 'month', 'week', 'day'];
let g = 'month', label = '';
const d = (v) => new Date(v);
const fmt = (v, k = g) => { const x = d(v); return k === 'year' ? String(x.getUTCFullYear()) : k === 'quarter' ? 'Q' + (Math.floor(x.getUTCMonth() / 3) + 1) + ' ' + x.getUTCFullYear() : k === 'month' ? x.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const iso = (x) => x.toISOString().slice(0, 10);
function end (start, k) { const x = new Date(start); if (k === 'year') x.setUTCFullYear(x.getUTCFullYear() + 1); else if (k === 'quarter') x.setUTCMonth(x.getUTCMonth() + 3); else if (k === 'month') x.setUTCMonth(x.getUTCMonth() + 1); else if (k === 'week') x.setUTCDate(x.getUTCDate() + 7); else x.setUTCDate(x.getUTCDate() + 1); x.setUTCDate(x.getUTCDate() - 1); return x; }
const setGrain = (k) => { g = k; grain.setGrain(k); };
const seg = K.$('#grains');
for (const x of G) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x[0].toUpperCase() + x.slice(1); b.dataset.g = x; b.onclick = () => { setGrain(x); app.execute(); }; seg.appendChild(b); }
K.$('#up').onclick = () => { range.reset(); label = ''; setGrain('month'); app.execute(); };
app.subscribe(() => {
K.status(trend, K.$('#s1'));
seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === g)));
K.$('#g').textContent = g; K.$('#range').textContent = label ? ' in ' + label : ''; K.$('#up').hidden = !label;
const next = G[G.indexOf(g) + 1];
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => fmt(r.period), value: (r) => r.total_revenue,
	pick: next ? (r) => { const s = d(r.period); label = fmt(r.period); range.setCondition({ operator: 'between', values: [iso(s), iso(end(s, g))] }); setGrain(next); app.execute(); } : null });
K.sent(K.$('#sent'), app, [trend]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **Quarter** next to **Grain**: the 16 month bars become 6 quarter bars
2. Click the **Q2 2026** column: the range narrows to April–June and the grain steps down to **Month**
3. Click **↑ All dates** to go back to every month

## Other Dates & time patterns

- [Date filter](date-filter.md): Pick exact dates, a range like "last 3 months", or a phrase like "last quarter".
- [Fiscal calendar](fiscal-calendar.md): Report by a fiscal year that starts in July instead of January.
- [As-of anchor](as-of-anchor.md): Count "last 30 days" back from the newest data instead of from today.
- [Incomplete periods](partial-period.md): Mark a month that isn't over yet, so its short bar doesn't look like a drop.
- [Period comparison](period-compare.md): Show each month next to the month before and the same month last year.
- [Custom period comparison](custom-compare.md): Compare any two date ranges side by side, like H1 2026 and H2 2025.
- [Period to date & trailing period](to-date.md): Show a year-to-date total and a rolling 3-month total for each month.
