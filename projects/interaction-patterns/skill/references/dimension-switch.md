# Dynamic dimension

> Switch how the chart groups data: by country, category or status.

- Pattern id: `dimension-switch`
- Category: Tables & calculations (also Drilling)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#dimension-switch
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader switches **Group by: Country → Status**, and the bars rebuild with completed, shipped and cancelled.

Why: Let the reader decide how to slice the data, instead of building three charts.

## What to build

Picking a field in the Group by menu reruns the chart split by that field instead.

Layout: Dropdown + bars that rebuild.

Instruction: Add a "Group by" dropdown that changes what the chart's bars break down by.

Done when: The bars rebuild with the new field's values, and their total stays the same for every grouping.

On the ecommerce sample: Picking Status in Group by rebuilds the bars as completed, shipped and cancelled, and picking Category rebuilds them by category.

## AQL

Not run as written: three small queries, each like the "Percent of total" query.

```aql
// declare one query per allowed dimension, up front
explore { dimensions { key: customers.country }  measures { total_revenue: revenue } sorts { total_revenue desc } }
explore { dimensions { key: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }
explore { dimensions { key: orders.status }     measures { total_revenue: revenue } sorts { total_revenue desc } }
```

## SDK wiring

```js
const by = Object.fromEntries(
  DIMS.map((d) => [
    d.id,
    app.createQuery('by_' + d.id, {
      dataset: 'ecommerce',
      aql: aqlFor(d.ref),
    }),
  ]),
);
for (const q of Object.values(by))
  app.mapControl(country, q, { field: 'customers.country' });
// executes only the stale one
groupBy.onchange = () => {
  active = by[groupBy.value];
  app.execute();
};
```

## Notes

- Same alias in every query, so one renderer handles them all. `execute()` skips queries that are already fresh
- Limits: Works with app code. Declare each allowed dimension up front, and use the same alias (`key`) so the renderer stays the same.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><label class="lbl" for="gb">Group by</label><select id="gb"></select><label class="lbl" for="ct">Country</label><select id="ct"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="by">country</span></b><span class="status" id="s1"></span></div><div id="bars"></div></div>
		<div class="hint">One query per option, declared up front with the same alias, so one renderer draws them all</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Dynamic dimension', timezone: 'Etc/UTC' });
const DIMS = [{ id: 'country', label: 'Country', ref: 'customers.country' }, { id: 'category', label: 'Category', ref: 'products.category' }, { id: 'status', label: 'Status', ref: 'orders.status' }];
const aqlFor = (ref) => 'explore { dimensions { key: ' + ref + ' } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const by = Object.fromEntries(DIMS.map((d) => [d.id, app.createQuery('by_' + d.id, { dataset: 'ecommerce', aql: aqlFor(d.ref) })]));
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of Object.values(by)) app.mapControl(country, q, { field: 'customers.country' });
const gb = K.$('#gb'), ct = K.$('#ct');
DIMS.forEach((d) => gb.add(new Option(d.label, d.id)));
country.loadOptions().then((vals) => vals.forEach((v) => ct.add(new Option(v, v))));
let active = by.country, ran = '';
gb.onchange = () => { active = by[gb.value]; const stale = active.isDirty || !active.result; ran = stale ? 'execute() ran ' + active.name : 'execute() skipped ' + active.name + ': already fresh'; draw(); app.execute(); };
ct.onchange = () => { if (ct.value) country.setCondition({ operator: 'is', values: [ct.value] }); else country.reset(); ran = ''; app.execute(); };
function draw () {
K.status(active, K.$('#s1'));
K.$('#by').textContent = DIMS.find((d) => by[d.id] === active).label.toLowerCase();
if (active.result) K.bars(K.$('#bars'), active.result.rows, { label: (r) => r.key, value: (r) => r.total_revenue, fmt: (v) => K.money.format(v) });
K.sent(K.$('#sent'), app, [active], () => ['showing ' + active.name + ' (alias key)', ran || null]);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read **Revenue by country** with **Group by** set to **Country**
2. Pick **Status** in **Group by**: the bars rebuild as completed, shipped and cancelled
3. Pick **Category** to see a third grouping

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
