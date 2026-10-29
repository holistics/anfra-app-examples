# Subtotals & grand totals

> Add a total for each category and one for everything.

- Pattern id: `totals`
- Category: Tables & calculations
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#totals
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The product table shows each product's revenue, its **category subtotal** and its **share of category**. Gizmo is 61% of Hardware. The grand total is $1.28M.

Why: Totals that come from the same query always add up.

## What to build

Rows sit under one subtotal row per group, each shows its share of the group, and a grand total ends the table.

Layout: Grouped table with subtotal rows.

Instruction: Group the table rows under subtotal rows, with each row's share of its group and a grand total.

Done when: Each subtotal equals the sum of its rows, shares within a group add up to 100%, and the grand total matches.

On the ecommerce sample: Gizmo shows 61% of Hardware, the Hardware subtotal sits under its products, and the grand total reads $1.28M.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category, product: products.name }
  measures {
    total_revenue: revenue,
    category_total: revenue | exclude_grains(products.name),
    grand_total: revenue | exclude_grains(products.category, products.name),
    share_in_category: revenue * 100.0 / (revenue | exclude_grains(products.name)),
  }
  sorts { category asc, total_revenue desc }
}
```

Saved result:

| category | product | total_revenue | category_total | grand_total | share_in_category |
|---|---|---|---|---|---|
| Hardware | Gizmo | 118701.00 | 193999.60 | 1283052.95 | 61.186208631358 |
| Hardware | Gadget | 53509.50 | 193999.60 | 1283052.95 | 27.582273365512094 |
| Hardware | Widget | 21789.10 | 193999.60 | 1283052.95 | 11.231518003129903 |
| Parts | Flange | 8478.60 | 13659.35 | 1283052.95 | 62.07176769026344 |
| Parts | Sprocket | 5180.75 | 13659.35 | 1283052.95 | 37.92823230973655 |
| Services | Support Plan | 578000.00 | 578000.00 | 1283052.95 | 100 |
| Software | Analytics Pro | 321425.00 | 497394.00 | 1283052.95 | 64.62180886781907 |
| Software | Dashboard Kit | 175969.00 | 497394.00 | 1283052.95 | 35.37819113218093 |

## SDK wiring

```js
// render subtotal rows when category changes; grand_total is on
// every row
const rows = totals.result.rows;
```

## Notes

- `revenue | exclude_grains(products.name)` is "revenue for the whole category", and it follows the filters

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>#tbl .tw { max-height: 300px; } #tbl td { padding: 3px 6px; } tr.sub td { font-weight: 600; background: var(--sunken); } tr.grand td { font-weight: 600; border-top: 2px solid var(--ink); border-bottom: 0; position: sticky; bottom: 0; background: #fff; } td.ind { padding-left: 18px; }</style>
	<div class="app">
		<div class="row"><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><span class="hint">Subtotals, shares and the total all follow the filter</span></div>
		<div class="panel"><div class="ph"><b>Revenue by product, with category subtotals</b><span class="status" id="s1"></span></div><div id="tbl"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Subtotals & grand totals', timezone: 'Etc/UTC' });
const totals = app.createQuery('totals', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category, product_name: products.name } measures { total_revenue: revenue, category_total: revenue | exclude_grains(products.name), grand_total: revenue | exclude_grains(products.category, products.name), share_in_category: revenue * 100.0 / (revenue | exclude_grains(products.name)) } sorts { category_name asc, total_revenue desc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, totals, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
const m = (v) => K.money.format(Number(v));
app.subscribe(() => {
	K.status(totals, K.$('#s1'));
	K.sent(K.$('#sent'), app, [totals]);
	if (!totals.result) return;
	const rows = totals.result.rows;
	let h = '<div class="tw"><table><thead><tr><th>Product</th><th class="num">Revenue</th><th class="num">Share of category</th><th class="num">Share of all</th></tr></thead><tbody>';
	const sub = (r) => '<tr class="sub"><td>' + K.esc(r.category_name) + ' subtotal</td><td class="num">' + m(r.category_total) + '</td><td class="num">100%</td><td class="num">' + (r.category_total / r.grand_total * 100).toFixed(1) + '%</td></tr>';
	rows.forEach((r, i) => {
		h += '<tr><td class="ind">' + K.esc(r.product_name) + ' <span class="hint">' + K.esc(r.category_name) + '</span></td><td class="num">' + m(r.total_revenue) + '</td><td class="num">' + Number(r.share_in_category).toFixed(0) + '%</td><td class="num">' + (r.total_revenue / r.grand_total * 100).toFixed(1) + '%</td></tr>';
		if (!rows[i + 1] || rows[i + 1].category_name !== r.category_name) h += sub(r);
	});
	h += '</tbody><tfoot>';
	if (rows[0]) h += '<tr class="grand"><td>Grand total</td><td class="num">' + m(rows[0].grand_total) + '</td><td></td><td class="num">100%</td></tr>';
	K.$('#tbl').innerHTML = h + '</tfoot></table></div>';
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the **Share of category** column: **Gizmo** is 61% of Hardware
2. Read the **Hardware subtotal** row under the Hardware products
3. Read the **Grand total** row at the bottom: $1,283,053, or $1.28M
4. Pick a country in **Country**: the subtotals, shares and total all follow

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
