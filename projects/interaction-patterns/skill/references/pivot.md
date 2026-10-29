# Pivot table

> Countries down the side, categories across the top, and each cell's share of its row.

- Pattern id: `pivot`
- Category: Tables & calculations
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#pivot
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The pivot shows countries down the side and categories across the top. A toggle switches the cells to **% of country**: Services is 46% of Australia.

Why: A pivot is how a spreadsheet user reads a breakdown.

## What to build

Rows and columns each come from a field, and the toggle switches cells from values to each row's percent split.

Layout: Heatmap-style pivot table with a $ / % toggle.

Instruction: Add a pivot table with a toggle between values and each row's percent split.

Done when: In percent mode each row adds up to 100%, and switching back shows the same values as before.

On the ecommerce sample: On % of country each row adds up to 100% and Services is 46% of Australia; % of category makes each column add up instead.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions {
    rows { country: customers.country }
    columns { category: products.category }
  }
  measures {
    total_revenue: revenue,
    share_of_country: percent_of_total(revenue, 'row_total'),
  }
}
```

Saved result:

| country | category | total_revenue | share_of_country | __column_header__ | __pivot_row__ | __pivot_column__ |
|---|---|---|---|---|---|---|
|  | Hardware |  |  | 1 | 0 | 1 |
|  | Parts |  |  | 1 | 0 | 2 |
|  | Services |  |  | 1 | 0 | 3 |
|  | Software |  |  | 1 | 0 | 4 |
| Australia | Hardware | 41112.53 | 0.13118334582652036 | 0 | 1 | 1 |
| Australia | Parts | 3356.95 | 0.010711477322663858 | 0 | 1 | 2 |
| Australia | Services | 143500.00 | 0.45788498363164887 | 0 | 1 | 3 |
| Australia | Software | 125428.00 | 0.40022019321916696 | 0 | 1 | 4 |
| Germany | Hardware | 34581.38 | 0.16796007275324237 | 0 | 2 | 1 |
| Germany | Parts | 2073.10 | 0.010068945392715583 | 0 | 2 | 2 |
| Germany | Services | 104000.00 | 0.50512291777648 | 0 | 2 | 3 |
| Germany | Software | 65236.00 | 0.316848064077562 | 0 | 2 | 4 |

(16 more rows)

The result includes header rows, marked by `__pivot_row__` and `__pivot_column__`. `percent_of_total` returns a fraction (0.458), so format it as a percentage.

## SDK wiring

```js
// no pageSize
const pivot = app.createQuery('pivot', {
  dataset: 'ecommerce',
  aql: PIVOT_AQL,
});
const cells = pivot.result.rows.filter(
  (r) => r.__column_header__ === '0',
);
```

## Notes

- `rows { }` and `columns { }` inside `dimensions`. Shares use `percent_of_total`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Cells show</span><span class="seg" id="modes"></span></div>
		<div class="panel"><div class="ph"><b id="title">Revenue, country × category</b><span class="status" id="s1"></span></div><div id="grid"></div>
		<div class="hint" id="note"></div><div class="hint">App code: the browser lays out a flat query as the grid, because a rows { } columns { } query fails in the SDK today</div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Pivot table', timezone: 'Etc/UTC' });
const pivot = app.createQuery('pivot', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country, category_name: products.category } measures { total_revenue: revenue, share_of_country: revenue * 1.0 / (revenue | exclude_grains(products.category)), share_of_category: revenue * 1.0 / (revenue | exclude_grains(customers.country)) } sorts { country_name asc, category_name asc } }' });
const MODES = [
	{ k: 'total_revenue', l: '$', t: 'Revenue, country × category', f: (v) => K.compact.format(v), note: 'Each cell is one country and one category' },
	{ k: 'share_of_country', l: '% of country', t: 'Share of each country\'s revenue', f: (v) => (v * 100).toFixed(0) + '%', note: 'Each row adds up to 100%: revenue / (revenue | exclude_grains(products.category))' },
	{ k: 'share_of_category', l: '% of category', t: 'Share of each category\'s revenue', f: (v) => (v * 100).toFixed(0) + '%', note: 'Each column adds up to 100%: revenue / (revenue | exclude_grains(customers.country))' },
];
let mode = MODES[0];
const seg = K.$('#modes');
for (const m of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m.l; b.onclick = () => { mode = m; draw(); }; seg.appendChild(b); }
function draw () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === mode.l)));
	K.$('#title').textContent = mode.t; K.$('#note').textContent = mode.note;
	K.status(pivot, K.$('#s1'));
	K.sent(K.$('#sent'), app, [pivot], () => ['cells → ' + mode.k + ' (drawn in the browser, not sent)']);
	if (!pivot.result) return;
	const cells = pivot.result.rows;
	// the query is flat; the browser lays it out as countries down, categories across
	const rows = [...new Set(cells.map((r) => r.country_name))], cols = [...new Set(cells.map((r) => r.category_name))];
	const at = (c, k) => cells.find((r) => r.country_name === c && r.category_name === k);
	const vals = cells.map((r) => Number(r[mode.k]) || 0), max = Math.max(...vals, 1e-9);
	let h = '<div class="tw"><table><thead><tr><th>Country</th>' + cols.map((k) => '<th class="num">' + K.esc(k) + '</th>').join('') + '</tr></thead><tbody>';
	for (const c of rows) {
		h += '<tr><td>' + K.esc(c) + '</td>' + cols.map((k) => { const r = at(c, k); if (!r) return '<td class="num">–</td>'; const v = Number(r[mode.k]), a = Math.sqrt(v / max);
			return '<td class="num" title="' + K.esc(c + ' · ' + k + ': ' + K.money.format(Number(r.total_revenue)) + ', ' + (r.share_of_country * 100).toFixed(1) + '% of ' + c + ', ' + (r.share_of_category * 100).toFixed(1) + '% of ' + k) + '" style="background: rgb(138 81 212 / ' + (0.06 + a * 0.7).toFixed(2) + '); color: ' + (a > 0.86 ? '#fff' : 'var(--ink)') + '; border: 2px solid #fff">' + mode.f(v) + '</td>'; }).join('') + '</tr>';
	}
	K.$('#grid').innerHTML = h + '</tbody></table></div>';
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Read the grid on **$**: countries down the side, categories across the top
2. Click **% of country**: each row now adds up to 100%
3. Read the **Australia** row: **Services** is 46% of Australia
4. Click **% of category** to make each column add up to 100% instead

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Top N & Others](top-n.md): Show the top 3 countries and group the rest into "Others".
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
