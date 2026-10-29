# Metric filter

> Filter on a total, like customers who spent more than $12k.

- Pattern id: `aggregate-filter`
- Category: Filters (also Scenarios & analyses)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#aggregate-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Drag the slider to **$12k**. The customer list shrinks from 200 rows to the 16 who spent more than that.

Why: A condition on a total is a different kind of filter from a condition on a row. The reader shouldn't have to know that.

## What to build

Moving the slider sets a minimum total; the list keeps only items whose summed value clears it, and counts them.

Layout: Customer leaderboard with a threshold slider; rows below the line fade out.

Instruction: Add a slider that filters on a total, like revenue per customer, rather than on single rows, and show how many remain.

Done when: Raising the slider shortens the list, every item left is above the threshold, and the count shown matches the rows left.

On the ecommerce sample: The list starts at 200 of 200 customers; dragging Revenue over to $12k shrinks it to 16 of 200, each of whom spent more.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { customer: customers.name, country: customers.country }
  measures { total_revenue: revenue, num_orders: order_count }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "revenue",
      "operator": "greater_than",
      "values": [
        "12000"
      ]
    }
  ]
}
```

Saved result:

| customer | country | total_revenue | num_orders |
|---|---|---|---|
| Customer 184 | Australia | 23750.30 | 13 |
| Customer 25 | Singapore | 20785.85 | 18 |
| Customer 140 | United States | 16482.34 | 9 |
| Customer 27 | Vietnam | 13553.76 | 9 |
| Customer 14 | Australia | 13460.39 | 12 |
| Customer 55 | Australia | 13447.66 | 11 |
| Customer 92 | Germany | 13118.24 | 14 |
| Customer 66 | Vietnam | 12779.49 | 12 |
| Customer 85 | United States | 12760.59 | 9 |
| Customer 43 | Singapore | 12551.70 | 13 |
| Customer 127 | Australia | 12543.48 | 16 |
| Customer 114 | Vietnam | 12464.46 | 9 |

(4 more rows)

Mapping a control onto the dataset metric `revenue` becomes a `having` condition. A **query-local** metric was rejected ("unknown field: expected a dataset field as model.field or a dataset metric"), so `aov` is now a Dataset metric: run 44 filters customers to AOV over $1,300 the same way.

## SDK wiring

```js
const minRevenue = app.createFilter('minRevenue', {
  type: 'number',
  label: 'Revenue over',
});
// dataset metric → having
app.mapControl(minRevenue, customers, { field: 'revenue' });

// or on any field, with an aggregation
app.mapControl(minUnits, customers, {
  field: 'order_items.quantity',
  aggregation: 'sum',
});

slider.oninput = () => {
  minRevenue.setCondition({
    operator: 'greater_than',
    values: [String(slider.value)],
  });
  app.execute();
};
```

State it touches: Analytical: one number condition, applied after aggregation.

## Notes

- The same `mapControl` call works. Point it at a metric, and anfra puts the condition in `having`
- Number values are strings, so no digits are lost

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><label class="lbl" for="min">Revenue over</label><input type="range" id="min" min="0" max="24000" step="1000" value="0" style="width: 220px"><b id="val">no minimum</b></div>
		<div class="panel"><div class="ph"><b>Customers by revenue: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="table"></div>
		<div class="hint" style="margin-top: 6px">The condition is on the revenue total, so anfra puts it in having, after aggregation</div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Metric filter', timezone: 'Etc/UTC' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } sorts { total_revenue desc } }' });
const minRevenue = app.createFilter('minRevenue', { type: 'number', label: 'Revenue over' });
app.mapControl(minRevenue, customers, { field: 'revenue' });
const slider = K.$('#min');
let all = null, t = 0;
const label = () => { const v = Number(slider.value); K.$('#val').textContent = v ? K.compact.format(v) : 'no minimum'; };
slider.oninput = () => {
	label();
	clearTimeout(t);
	t = setTimeout(() => { const v = Number(slider.value); if (v) minRevenue.setCondition({ operator: 'greater_than', values: [String(v)] }); else minRevenue.reset(); app.execute(); }, 250);
};
app.subscribe(() => {
K.status(customers, K.$('#s1'));
if (customers.result) {
	const rows = customers.result.rows;
	const c = minRevenue.appliedCondition;
	if (!(c && c.values && c.values.length)) all = rows.length;
	K.$('#kpi').textContent = K.int.format(rows.length) + (all != null ? ' of ' + K.int.format(all) : '');
	K.table(K.$('#table'), [{ key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }, { key: 'num_orders', label: 'Orders', num: true }], rows);
}
K.sent(K.$('#sent'), app, [customers]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the title: **Customers by revenue** lists 200 of 200
2. Drag the **Revenue over** slider to **$12K**
3. Read the list: it shrinks to 16 of 200, the customers who spent more than $12k

## Other Filters patterns

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.
