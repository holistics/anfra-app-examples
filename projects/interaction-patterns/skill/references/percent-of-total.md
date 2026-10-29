# Percent of total

> Show each country's share of all revenue, like Australia at 24%.

- Pattern id: `percent-of-total`
- Category: Tables & calculations
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#percent-of-total
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Each country bar is labelled with its share. Australia has 24.4% and Japan 9.2%. Filtering to Software changes the shares.

Why: Shares are easier to compare than raw sums.

## What to build

Each bar's value is divided by the total for the current filters, so the labels change when a filter changes.

Layout: Bars with % labels.

Instruction: Label each bar with its share of the total, following the page's filters.

Done when: The share labels add up to 100% under any filter, and each matches the bar's value over the total.

On the ecommerce sample: Australia reads 24.4% and Japan 9.2%; filtering to Software changes the shares, and they still add up to 100%.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { country: customers.country }
  measures { total_revenue: revenue, share: percent_of_total(revenue, 'grand_total') }
  sorts { total_revenue desc }
}
```

Saved result:

| country | total_revenue | share |
|---|---|---|
| Australia | 313397.48 | 0.24425919444711927 |
| Singapore | 255030.20 | 0.19876825816113047 |
| Germany | 205890.48 | 0.16046919965384127 |
| United States | 205153.71 | 0.15989496770183959 |
| Vietnam | 185254.77 | 0.14438591174276946 |
| Japan | 118326.31 | 0.09222246829329998 |

Found while checking: the result is a fraction (0.244). The reference describes a value from 0 to 100.

## SDK wiring

```js
// Intl.NumberFormat({ style: 'percent' })
label: (r) => pct.format(Number(r.share));
```

## Notes

- A built-in function with row, column and grand totals

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>#bars .b { grid-template-columns: 100px minmax(0, 1fr) 116px; } #bars .v b { color: var(--ink); font-weight: 600; }</style>
	<div class="app">
		<div class="row"><span class="lbl">Category</span><span class="chips" id="cats"></span></div>
		<div class="panel"><div class="ph"><b>Share of <span id="of">all revenue</span> by country</b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="sum"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Percent of total', timezone: 'Etc/UTC' });
const shares = app.createQuery('shares', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue, share: percent_of_total(revenue, \'grand_total\') } sorts { total_revenue desc } }' });
const cat = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
app.mapControl(cat, shares, { field: 'products.category' });
const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
let picked = '';
const chips = K.$('#cats');
const chip = (v, l) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.dataset.v = v; b.onclick = () => { picked = v; if (v) cat.setCondition({ operator: 'is', values: [v] }); else cat.reset(); app.execute(); }; chips.appendChild(b); };
chip('', 'All');
cat.loadOptions().then((vals) => vals.forEach((v) => chip(v, v)));
app.subscribe(() => {
	chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === picked)));
	K.status(shares, K.$('#s1'));
	K.$('#of').textContent = picked ? picked + ' revenue' : 'all revenue';
	if (shares.result) {
		const rows = shares.result.rows;
		K.bars(K.$('#bars'), rows, { label: (r) => r.country_name, value: (r) => r.share });
		[...K.$('#bars').children].forEach((b, i) => { b.querySelector('.v').innerHTML = '<b>' + pct.format(Number(rows[i].share)) + '</b> · ' + K.compact.format(Number(rows[i].total_revenue)); });
		const sum = rows.reduce((t, r) => t + Number(r.share), 0), tot = rows.reduce((t, r) => t + Number(r.total_revenue), 0);
		K.$('#sum').textContent = 'Shares add up to ' + pct.format(sum) + ' of ' + K.compact.format(tot) + (rows[0] ? ' · the query returns ' + Number(rows[0].share).toFixed(3) + ', shown as ' + pct.format(Number(rows[0].share)) : '');
	}
	K.sent(K.$('#sent'), app, [shares]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the share on each bar: **Australia** has 24.4% and **Japan** 9.2%
2. Click **Software** next to **Category**: the shares change, and still add up to 100%
3. Click **All** to go back

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
