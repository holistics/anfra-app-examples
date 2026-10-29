# Field filter

> Pick values from a list, like Vietnam and Singapore, and every chart shows only those.

- Pattern id: `field-filter`
- Category: Filters (also Controls)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#field-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks **Vietnam** and **Singapore**, then **Completed**. The monthly revenue trend redraws, and the bars slide down from $1.28M to $281k.

Why: Most dashboards need a filter first. Here the filter field is checked when the app starts, and its options come from the data.

## What to build

Picking values in a filter narrows every chart it feeds to the matching rows, with the full total faint behind.

Layout: Monthly revenue columns under a row of filter chips; the unfiltered total stays as a grey ghost so the drop is visible.

Instruction: Add pickers above the main chart whose options come from the data, so readers can narrow the page to the values they pick.

Done when: Each pick redraws the chart to match, the full total stays visible behind it, and clearing the picks restores it.

On the ecommerce sample: Pick Vietnam and Singapore, then Completed: the monthly bars drop from $1.28M to $281k, with all orders still grey behind them.

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
      "field": "customers.country",
      "operator": "is",
      "values": [
        "Vietnam",
        "Singapore"
      ]
    },
    {
      "field": "orders.status",
      "operator": "is",
      "values": [
        "completed"
      ]
    }
  ]
}
```

Saved result:

| period | total_revenue | num_orders |
|---|---|---|
| 2025-06-01 | 10740.24 | 19 |
| 2025-07-01 | 13348.31 | 16 |
| 2025-08-01 | 13828.80 | 14 |
| 2025-09-01 | 16837.78 | 22 |
| 2025-10-01 | 16101.22 | 25 |
| 2025-11-01 | 11726.84 | 13 |
| 2025-12-01 | 9598.43 | 13 |
| 2026-01-01 | 21756.92 | 29 |
| 2026-02-01 | 26735.00 | 18 |
| 2026-03-01 | 6056.81 | 16 |
| 2026-04-01 | 16120.41 | 19 |
| 2026-05-01 | 29807.51 | 28 |

(4 more rows)

## SDK wiring

```js
const app = Anfra.createApp({ timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', {
  dataset: 'ecommerce',
  aql: TREND_AQL,
});

const country = app.createFilter('country', {
  dataset: 'ecommerce',
  field: 'customers.country',
});
const status = app.createFilter('status', {
  dataset: 'ecommerce',
  field: 'orders.status',
});
// options come from the data
await country.loadOptions();

app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(status, trend, { field: 'orders.status' });

country.setCondition({
  operator: 'is',
  values: ['Vietnam', 'Singapore'],
});
// re-runs only what changed
await app.execute();
```

State it touches: Analytical: two filter conditions. Renderer: the grey ghost bars.

## Notes

- One filter and one mapping per query. The SDK sends `filters[]`, and the AQL text never changes
- A typo in `field` fails at once, with a "did you mean" suggestion
- `loadOptions()` fetches values that this reader is allowed to see

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Country</span><span class="chips" id="countries"></span></div>
		<div class="row"><label class="lbl" for="status">Status</label><select id="status"><option value="">Any status</option></select><span class="hint">Both filters reach the KPI and the trend</span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="legend"><span><i style="background:var(--violet)"></i>Filtered</span><span><i style="background:rgb(24 20 31 / 0.07)"></i>All orders</span></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Field filter', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }';
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const all = app.createQuery('allOrders', { dataset: 'ecommerce', aql: AQL });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(status, trend, { field: 'orders.status' });
const picked = new Set();
const chips = K.$('#countries'), sel = K.$('#status');
const apply = () => { if (picked.size) country.setCondition({ operator: 'is', values: [...picked] }); else country.reset(); if (sel.value) status.setCondition({ operator: 'is', values: [sel.value] }); else status.reset(); app.execute(); };
country.loadOptions().then((vals) => vals.forEach((v) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.setAttribute('aria-pressed', 'false'); b.onclick = () => { picked.has(v) ? picked.delete(v) : picked.add(v); b.setAttribute('aria-pressed', String(picked.has(v))); apply(); }; chips.appendChild(b); }));
status.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v[0].toUpperCase() + v.slice(1), v))));
sel.onchange = apply;
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
K.status(trend, K.$('#s1'));
if (!trend.result) return;
const ghost = new Map((all.result?.rows || []).map((r) => [r.period, r.total_revenue]));
K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
const rows = all.result ? all.result.rows.map((r) => trend.result.rows.find((x) => x.period === r.period) || { period: r.period, total_revenue: 0 }) : trend.result.rows;
K.columns(K.$('#trend'), rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue, ghost: (r) => ghost.get(r.period) });
K.sent(K.$('#sent'), app, [trend]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the KPI: **Monthly revenue** starts at $1.28M for all orders
2. Click **Vietnam** and **Singapore** in the **Country** row
3. Pick **Completed** in the **Status** list
4. Read the trend: the violet bars drop to $281k, with all orders in grey behind them

## Other Filters patterns

- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.
