# Text filter

> Type part of a name to find matching rows, ignoring upper and lower case.

- Pattern id: `text-search`
- Category: Filters
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#text-search
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader types **customer 1** into a search box. The completed-orders table keeps the matching names, now sorted by order count.

Why: A search box is often the quickest way to find one customer or one product.

## What to build

Typing in the search box keeps rows whose name contains the text, ignoring case; clearing the box brings every row back.

Layout: Search box above a customer table; matching rows stay, others leave.

Instruction: Add a search box that keeps rows whose name contains the typed text, ignoring case; clearing it shows everything again.

Done when: Matches update as you type, upper and lower case both match, and an empty box shows the full list again.

On the ecommerce sample: Type customer 1: the table keeps only names that contain it, sorted by orders; clearing the box returns the full list sorted by revenue.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { customer: customers.name, country: customers.country }
  measures { total_revenue: revenue, num_orders: order_count }
  filters { orders.status == 'completed' }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "customers.name",
      "operator": "contains",
      "values": [
        "customer 1"
      ]
    }
  ],
  "sorts": [
    {
      "field": "num_orders",
      "direction": "desc"
    }
  ]
}
```

Saved result:

| customer | country | total_revenue | num_orders |
|---|---|---|---|
| Customer 127 | Australia | 6832.78 | 10 |
| Customer 199 | United States | 8000.64 | 9 |
| Customer 14 | Australia | 7602.60 | 8 |
| Customer 101 | Singapore | 7600.60 | 8 |
| Customer 175 | Germany | 1770.03 | 8 |
| Customer 155 | Singapore | 7767.50 | 8 |
| Customer 15 | United States | 3074.15 | 8 |
| Customer 171 | Germany | 3119.01 | 8 |
| Customer 184 | Australia | 14270.00 | 7 |
| Customer 17 | Singapore | 7813.01 | 7 |
| Customer 18 | Singapore | 5743.48 | 7 |
| Customer 129 | Japan | 3052.50 | 7 |

(28 more rows)

## SDK wiring

```js
const name = app.createFilter('name', {
  dataset: 'ecommerce',
  field: 'customers.name',
});
app.mapControl(name, table, { field: 'customers.name' });
input.oninput = debounce(() => {
  name.setCondition({
    operator: 'contains',
    values: input.value ? [input.value] : [],
  });
  table.setSort([{ field: 'num_orders', direction: 'desc' }]);
  app.execute();
}, 250);
```

State it touches: Analytical: a contains condition and a sort. Runtime: the debounce and the in-flight abort.

## Notes

- `contains` is case-insensitive
- An empty value list sends nothing, so the box clears itself

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><input type="search" id="q" placeholder="Search customers…" aria-label="Search customers" style="width: 240px"><span class="hint">Contains, ignoring case. Typing waits 300 ms and cancels a run still in flight</span></div>
		<div class="panel"><div class="ph"><b>Customers with completed orders<span id="by"></span></b><span class="status" id="s1"></span></div><div id="table"></div></div>
		<div class="sent" id="sent"></div></div>
		<style>.tw { max-height: 232px; }</style>
```

Script:

```js
const app = Anfra.createApp({ title: 'Text filter', timezone: 'Etc/UTC' });
const table = app.createQuery('customers', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } filters { orders.status == \'completed\' } sorts { total_revenue desc } }' });
const name = app.createFilter('name', { dataset: 'ecommerce', field: 'customers.name', label: 'Customer' });
app.mapControl(name, table, { field: 'customers.name' });
const input = K.$('#q');
let t = 0, aborted = 0;
input.oninput = () => {
	clearTimeout(t);
	t = setTimeout(() => {
		const v = input.value.trim();
		if (v) { name.setCondition({ operator: 'contains', values: [v] }); table.setSort([{ field: 'num_orders', direction: 'desc' }]); }
		else { name.reset(); table.setSort([]); }
		if (table.state === 'executing') { table.abort(); aborted++; }
		app.execute();
	}, 300);
};
app.subscribe(() => {
K.status(table, K.$('#s1'));
const sorted = table.sort.length > 0;
K.$('#by').textContent = sorted ? ' · sorted by orders' : ' · sorted by revenue';
if (table.result) K.table(K.$('#table'), [{ key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }, { key: 'num_orders', label: sorted ? 'Orders ▼' : 'Orders', num: true }], table.result.rows);
K.sent(K.$('#sent'), app, [table], () => [sorted ? 'sort → num_orders desc (overrides the AQL sort)' : 'sort → the AQL default (total_revenue desc)', aborted ? 'runs cancelled while typing → ' + aborted : '']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click the **Search customers…** box
2. Type **customer 1**
3. Read the table: it keeps the matching names, now **sorted by orders** with **Orders ▼**
4. Clear the box to go back to the sort by revenue

## Other Filters patterns

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Range filter](range-filter.md): Drag a slider to keep orders between two values, or above or below one.
