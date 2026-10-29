# Sort

> Click a column header to sort the table by that column.

- Pattern id: `sort`
- Category: Tables & calculations
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#sort
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader clicks the **Orders** header. The table re-sorts on the server, so page 2 continues the new order.

Why: A sort done in the browser on page 1 of 8 is wrong.

## What to build

Clicking a column header asks the server to sort by that column, and a second click flips the direction.

Layout: Table with sortable headers.

Instruction: Make the table sort by any column on a header click, with paging that keeps the sort.

Done when: Every page after the first continues the new sort, with no rows repeated or skipped.

On the ecommerce sample: Clicking the Orders header sorts most orders first, Load 25 more continues that order on page 2, and a second click flips it.

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

The input's `sorts` replaces the AQL's own `sorts` for that run. `setSort([])` brings the AQL order back.

## SDK wiring

```js
th.onclick = () => {
  dir = dir === 'desc' ? 'asc' : 'desc';
  // a result column name
  table.setSort([{ field: th.dataset.col, direction: dir }]);
  app.execute();
};
```

## Notes

- `setSort` takes a result column name and doesn't change the AQL

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>#tbl tbody tr:nth-child(25n+1):not(:first-child) td { border-top: 2px solid var(--violet-faint); }</style>
	<div class="app">
		<div class="row"><span class="hint">Click a column header to sort on the server. Click it again to flip the direction</span><button type="button" id="reset" hidden>AQL order</button></div>
		<div class="panel"><div class="ph"><b>Customers, completed orders</b><span class="status" id="s1"></span></div><div id="tbl"></div>
		<div class="row" style="justify-content: space-between; margin-top: 8px"><span class="hint" id="foot"></span><button type="button" id="more">Load 25 more</button></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Sort', timezone: 'Etc/UTC' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', pageSize: 25,
	aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, num_orders: order_count } filters { orders.status == \'completed\' } sorts { total_revenue desc } }' });
const COLS = [
	{ key: 'n', label: '#', num: true, fixed: true },
	{ key: 'customer_name', label: 'Customer', first: 'asc' },
	{ key: 'country_name', label: 'Country', first: 'asc' },
	{ key: 'total_revenue', label: 'Revenue', num: true, first: 'desc', fmt: (v) => K.money.format(Number(v)) },
	{ key: 'num_orders', label: 'Orders', num: true, first: 'desc' },
];
let sort = null; // { field, direction } or null for the AQL's own order
const box = K.$('#tbl'), more = K.$('#more');
function sortBy (c) {
	if (c.fixed) return;
	const dir = sort && sort.field === c.key ? (sort.direction === 'desc' ? 'asc' : 'desc') : c.first;
	sort = { field: c.key, direction: dir };
	// the customer name breaks ties, so page 2 never repeats or skips a row
	customers.setSort(c.key === 'customer_name' ? [sort] : [sort, { field: 'customer_name', direction: 'asc' }]);
	box.dataset.top = '0';
	app.execute();
}
K.$('#reset').onclick = () => { sort = null; customers.setSort([]); app.execute(); };
more.onclick = () => { more.disabled = true; customers.fetchMore().catch(() => {}).finally(() => { more.disabled = false; }); };
app.subscribe(() => {
	K.status(customers, K.$('#s1'));
	K.$('#reset').hidden = !sort;
	if (customers.result) {
		const tw = box.querySelector('.tw'), top = box.dataset.top === '0' ? 0 : (tw ? tw.scrollTop : 0);
		delete box.dataset.top;
		const rows = customers.result.rows.map((r, i) => Object.assign({ n: i + 1 }, r));
		K.table(box, COLS.map((c) => Object.assign({}, c, { label: c.label + (sort && sort.field === c.key ? (sort.direction === 'desc' ? ' ▼' : ' ▲') : (!sort && c.key === 'total_revenue' ? ' ▽' : '')) })), rows);
		box.querySelectorAll('th').forEach((th, i) => { if (COLS[i].fixed) return; th.style.cursor = 'pointer'; th.tabIndex = 0; th.title = 'Sort by ' + COLS[i].label; th.onclick = () => sortBy(COLS[i]); th.onkeydown = (e) => { if (e.key === 'Enter') sortBy(COLS[i]); }; if (sort && sort.field === COLS[i].key) th.style.color = 'var(--violet-ink)'; });
		box.querySelector('.tw').scrollTop = top;
		K.$('#foot').textContent = rows.length + ' loaded · page ' + customers.page + (customers.hasMore ? '' : ' · all loaded');
		more.hidden = !customers.hasMore;
	}
	K.sent(K.$('#sent'), app, [customers], () => [sort ? 'sort → ' + customers.sort.map((s) => s.field + ' ' + s.direction).join(', ') : 'sort → none, the AQL\'s own (total_revenue desc)', 'page → ' + customers.page + ', 25 rows per page']);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the table: it is sorted by **Revenue**, the AQL default
2. Click the **Orders** header: the server re-sorts by orders, most first
3. Click **Load 25 more**: page 2 continues the new order
4. Click **Orders** again to flip the direction, or **AQL order** to go back

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
