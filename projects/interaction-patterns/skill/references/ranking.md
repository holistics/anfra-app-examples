# Rank

> Number each customer by revenue, overall and within their country.

- Pattern id: `ranking`
- Category: Tables & calculations
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#ranking
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Two rank columns appear: overall, and within the customer's country.

Why: Saying "the best in each region" needs a rank within each group.

## What to build

Each row gets two ranks, one across all rows and one within its group, and a toggle keeps only each group's leader.

Layout: Leaderboard with rank badges.

Instruction: Show each row's rank overall and within its group side by side, so the leaders stand out.

Done when: The top row overall also ranks first in its group, and the leaders toggle leaves exactly one row per group.

On the ecommerce sample: Customer 184 shows #1 both overall and in its country, and Country leaders only keeps one #1 customer per country.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { customer: customers.name, country: customers.country }
  measures {
    total_revenue: revenue,
    overall_rank: rank(order: revenue | desc(), partition: []),
    rank_in_country: rank(order: revenue | desc(), partition: customers.country),
  }
  sorts { total_revenue desc }
}
```

Saved result:

| customer | country | total_revenue | overall_rank | rank_in_country |
|---|---|---|---|---|
| Customer 184 | Australia | 23750.30 | 1 | 1 |
| Customer 25 | Singapore | 20785.85 | 2 | 1 |
| Customer 140 | United States | 16482.34 | 3 | 1 |
| Customer 27 | Vietnam | 13553.76 | 4 | 1 |
| Customer 14 | Australia | 13460.39 | 5 | 2 |
| Customer 55 | Australia | 13447.66 | 6 | 3 |
| Customer 92 | Germany | 13118.24 | 7 | 1 |
| Customer 66 | Vietnam | 12779.49 | 8 | 2 |
| Customer 85 | United States | 12760.59 | 9 | 2 |
| Customer 43 | Singapore | 12551.70 | 10 | 2 |
| Customer 127 | Australia | 12543.48 | 11 | 4 |
| Customer 114 | Vietnam | 12464.46 | 12 | 3 |

(28 more rows)

Leaving out `partition` ranks each row against itself. Use `partition: []` for a whole-table rank.

## SDK wiring

```js
// read rank columns straight from the rows; sort stays server-side
```

## Notes

- `rank(order: revenue | desc(), partition: customers.country)`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.rk { display: inline-block; min-width: 28px; padding: 0 6px; border-radius: 999px; background: var(--sunken); text-align: center; font-weight: 500; } .rk.top { background: var(--violet); color: #fff; } #tbl .tw { max-height: 252px; } #tbl td { padding: 3px 6px; }</style>
	<div class="app">
		<div class="row"><label class="lbl" for="cat">Revenue from</label><select id="cat"><option value="">All categories</option></select><span class="chips"><button type="button" id="leaders" aria-pressed="false">Country leaders only</button></span></div>
		<div class="panel"><div class="ph"><b>Customer leaderboard</b><span class="status" id="s1"></span></div><div id="tbl"></div>
		<div class="hint" id="note"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Rank', timezone: 'Etc/UTC' });
const board = app.createQuery('leaderboard', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, overall_rank: rank(order: revenue | desc(), partition: []), rank_in_country: rank(order: revenue | desc(), partition: customers.country) } sorts { total_revenue desc } }' });
const cat = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
app.mapControl(cat, board, { field: 'products.category' });
const sel = K.$('#cat'), lead = K.$('#leaders');
cat.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) cat.setCondition({ operator: 'is', values: [sel.value] }); else cat.reset(); app.execute(); };
let leaders = false;
lead.onclick = () => { leaders = !leaders; lead.setAttribute('aria-pressed', String(leaders)); draw(); };
const badge = (v) => '<span class="rk' + (Number(v) === 1 ? ' top' : '') + '">' + v + '</span>';
function draw () {
	K.status(board, K.$('#s1'));
	K.sent(K.$('#sent'), app, [board], () => [leaders ? 'leaders only → rank_in_country = 1 (picked in the browser, not sent)' : null]);
	if (!board.result) return;
	const rows = board.result.rows.filter((r) => !leaders || Number(r.rank_in_country) === 1);
	let h = '<div class="tw"><table><thead><tr><th class="num">Overall</th><th>Customer</th><th>Country</th><th class="num">Revenue</th><th class="num">In country</th></tr></thead><tbody>';
	for (const r of rows) h += '<tr><td class="num">' + badge(r.overall_rank) + '</td><td>' + K.esc(r.customer_name) + '</td><td>' + K.esc(r.country_name) + '</td><td class="num">' + K.money.format(Number(r.total_revenue)) + '</td><td class="num">' + badge(r.rank_in_country) + '</td></tr>';
	K.$('#tbl').innerHTML = h + '</tbody></table></div>';
	K.$('#note').textContent = K.int.format(rows.length) + ' customers. Both ranks come from the query and follow the category filter';
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the **Overall** and **In country** columns: Customer 184 is #1 in both
2. Click **Country leaders only** to keep just the #1 customer of each country
3. Pick a category in **Revenue from**, such as **Software**: both ranks change with it

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
