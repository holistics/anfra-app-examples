# Top N & Others

> Show the top 3 countries and group the rest into "Others".

- Pattern id: `top-n`
- Category: Tables & calculations (also Scenarios & analyses)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#top-n
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks **Top 3**: Australia, Singapore and Germany. An **Other** bar holds the remaining $509k, so the bars still add up to $1.28M.

Why: A Top N chart without "Other" quietly drops part of the total.

## What to build

Picking N from the menu keeps the N largest items and folds the rest into one Other bar.

Layout: Bars for the top N and an italic "Other" bar.

Instruction: Let the reader show only the top N items, with an "Other" bar for the rest.

Done when: The kept items are the largest, and the bars, Other included, still add up to the full total.

On the ecommerce sample: Top 3 keeps Australia, Singapore and Germany, an Other (3) bar holds $509k, and the bars still add up to $1.28M.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
metric top_3_countries = top(3, customers.country, by: revenue);
explore {
  dimensions { country: customers.country }
  measures {
    total_revenue: revenue,
    all_countries: revenue | exclude_grains(customers.country),
  }
  filters { customers.country in top_3_countries }
  sorts { total_revenue desc }
}
```

Saved result:

| country | total_revenue | all_countries |
|---|---|---|
| Australia | 313397.48 | 1283052.95 |
| Singapore | 255030.20 | 1283052.95 |
| Germany | 205890.48 | 1283052.95 |

A single "Top 3 or Other" dimension doesn't work yet: `case(when: country in top_3 …)` crashed the compiler, and a dimensionalized rank came back as 1 on every row. The N lives in the AQL text, so a reader-chosen N is a new query, or a dataset metric for the rank.

## SDK wiring

```js
// n from a fixed menu: 3, 5, 10
function topN(n) {
  const q = app.createQuery('top' + n, {
    dataset: 'ecommerce',
    aql: topAql(n),
  });
  app.mapControl(status, q, { field: 'orders.status' });
  return app.execute().then(() => {
    const rows = q.result.rows,
      total = Number(rows[0].all_countries);
    return [
      ...rows,
      {
        country: 'Other',
        total_revenue:
          total -
          rows.reduce((a, r) => a + Number(r.total_revenue), 0),
      },
    ];
  });
}
```

## Notes

- `top(3, customers.country, by: revenue)` in the filters, plus an `exclude_grains` total

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><span class="lbl">Show</span><span class="seg" id="ns"></span><label class="lbl" for="status">Status</label><select id="status"><option value="">Any status</option></select></div>
		<div class="panel"><div class="ph"><b id="title">Revenue by country</b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="sum"></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Top N & Others', timezone: 'Etc/UTC' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
const MEASURES = ' measures { total_revenue: revenue, all_countries: revenue | exclude_grains(customers.country), n_countries: count_distinct(customers.country) | exclude_grains(customers.country) }';
// N is part of the AQL text, so each choice from the menu is its own query, declared the first time it is picked
const aqlFor = (n) => n ? 'metric top_countries = top(' + n + ', customers.country, by: revenue); explore { dimensions { country_name: customers.country }' + MEASURES + ' filters { customers.country in top_countries } sorts { total_revenue desc } }'
	: 'explore { dimensions { country_name: customers.country }' + MEASURES + ' sorts { total_revenue desc } }';
const Q = {};
const queryFor = (n) => { if (!Q[n]) { Q[n] = app.createQuery(n ? 'top' + n : 'allCountries', { dataset: 'ecommerce', aql: aqlFor(n) }); app.mapControl(status, Q[n], { field: 'orders.status' }); } return Q[n]; };
let n = 3, q = queryFor(3);
const seg = K.$('#ns'), sel = K.$('#status');
for (const x of [3, 5, 0]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x ? 'Top ' + x : 'All'; b.dataset.n = x; b.onclick = () => { n = x; q = queryFor(x); draw(); app.execute(); }; seg.appendChild(b); }
status.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v[0].toUpperCase() + v.slice(1), v))));
sel.onchange = () => { if (sel.value) status.setCondition({ operator: 'is', values: [sel.value] }); else status.reset(); app.execute(); };
function draw () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)));
	K.status(q, K.$('#s1'));
	K.$('#title').textContent = n ? 'Top ' + n + ' countries by revenue, and Other' : 'Revenue, all countries';
	if (q.result && q.result.rows.length) {
		const rows = q.result.rows.map((r) => ({ name: r.country_name, v: Number(r.total_revenue) }));
		const total = Number(q.result.rows[0].all_countries), rest = Number(q.result.rows[0].n_countries) - rows.length;
		const shown = rows.reduce((t, r) => t + r.v, 0);
		if (n && rest > 0) rows.push({ name: 'Other (' + rest + ')', v: total - shown, other: true });
		K.bars(K.$('#bars'), rows, { label: (r) => r.name, value: (r) => r.v });
		const last = K.$('#bars').lastElementChild;
		if (rows[rows.length - 1].other && last) { last.querySelector('.n').style.fontStyle = 'italic'; last.querySelector('.f').style.background = 'rgb(24 20 31 / 0.32)'; }
		K.$('#sum').textContent = (n && rest > 0 ? 'Other = all countries ' + K.compact.format(total) + ' − top ' + n + ' ' + K.compact.format(shown) + '. ' : '') + 'The bars add up to ' + K.compact.format(total);
	} else if (q.result) { K.$('#bars').textContent = ''; K.$('#sum').textContent = 'No orders match'; }
	K.sent(K.$('#sent'), app, [q], () => [n ? 'N → ' + n + ', in the AQL text: top(' + n + ', customers.country, by: revenue)' : 'N → all, no top() filter']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Click **All** to see all 6 countries
2. Click **Top 3**: Australia, Singapore and Germany stay
3. Read the **Other (3)** bar: it holds the remaining $509k
4. Read the hint under the bars: they still add up to $1.28M

## Other Tables & calculations patterns

- [Dynamic metric](metric-switch.md): Switch the chart between revenue, orders and units with one click.
- [Dynamic dimension](dimension-switch.md): Switch how the chart groups data: by country, category or status.
- [Sort](sort.md): Click a column header to sort the table by that column.
- [Pivot table](pivot.md): Countries down the side, categories across the top, and each cell's share of its row.
- [Subtotals & grand totals](totals.md): Add a total for each category and one for everything.
- [Percent of total](percent-of-total.md): Show each country's share of all revenue, like Australia at 24%.
- [Running total & moving calculation](cumulative-moving.md): Add a running total and a 3-month average to a monthly chart.
- [Indexed view](index-100.md): Start every line at 100, so growth compares fairly between big and small series.
- [Rank](ranking.md): Number each customer by revenue, overall and within their country.
