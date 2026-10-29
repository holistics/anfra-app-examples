# Selection cohort

> Select some customers and compare what they buy with everyone else.

- Pattern id: `selection-cohort`
- Category: Selections (also Scenarios & analyses)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#selection-cohort
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader lassoes customers 1–5 in a table and presses **Make cohort**. Two bar charts compare the cohort's category mix with the rest: 195 other customers.

Why: A "what do these people do differently?" question deserves a comparison, not just a filter.

## What to build

Selecting rows in a table and pressing a button saves them as a cohort; the charts then compare it with everyone else.

Layout: Paired bars: cohort vs rest, by category.

Instruction: Let readers select records in a table, turn them into a cohort, and compare the cohort with everyone else side by side.

Done when: The cohort and the rest are labelled with their counts, together they make up everyone, and Reset clears the cohort.

On the ecommerce sample: Click customers 1 to 5, then Make cohort: Category share of revenue shows Cohort: 5 in violet against Rest: 195 in grey.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category }
  measures { total_revenue: revenue, num_customers: count_distinct(orders.customer_id) }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "customers.id",
      "operator": "is_not",
      "values": [
        "1",
        "2",
        "3",
        "4",
        "5"
      ]
    }
  ]
}
```

Saved result:

| category | total_revenue | num_customers |
|---|---|---|
| Services | 569500.00 | 157 |
| Software | 487238.00 | 187 |
| Hardware | 188234.76 | 193 |
| Parts | 13264.55 | 186 |

IDs travel as strings (`"1"`, not `1`). anfra rejected the JS numbers: "send \"1\", not 1".

## SDK wiring

```js
const inCohort = app.createFilter('inCohort', {
  dataset: 'ecommerce',
  field: 'customers.id',
});
const outCohort = app.createFilter('outCohort', {
  dataset: 'ecommerce',
  field: 'customers.id',
});
app.mapControl(inCohort, cohortMix, { field: 'customers.id' });
app.mapControl(outCohort, restMix, { field: 'customers.id' });
makeBtn.onclick = () => {
  const ids = table.selectedRows.map((r) => r.id); // strings
  inCohort.setCondition({ operator: 'is', values: ids });
  outCohort.setCondition({ operator: 'is_not', values: ids });
  app.execute();
};
```

State it touches: Parameter set: a named list of IDs, used by two controls with opposite operators.

## Notes

- The same AQL is declared twice, with two controls on `customers.id` using `is` and `is_not`

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>
		.pair { display: grid; gap: 8px; }
		.pair .r { display: grid; grid-template-columns: 60px minmax(0, 1fr); gap: 2px 8px; align-items: center; font-size: 12px; line-height: 16px; }
		.pair .r > span:first-child { grid-row: span 2; }
		.pair .ln { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 6px; align-items: center; }
		.pair .t { height: 10px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
		.pair .t i { display: block; height: 100%; border-radius: 3px; transition: width 320ms var(--ease); }
		.pair .v { text-align: right; white-space: nowrap; color: var(--weak); font-variant-numeric: tabular-nums; }
		#tbl .tw { max-height: 232px; }
		</style>
		<div class="row"><span class="hint">Click customers to pick them, then make them a cohort</span><button type="button" id="make" disabled>Make cohort</button><button type="button" id="reset" hidden>Reset</button></div>
		<div class="cols" style="grid-template-columns: 1fr 1.15fr">
		<div class="panel"><div class="ph"><b>Customers<span id="npick"></span></b><span class="status" id="s1"></span></div><div id="tbl"></div></div>
		<div class="panel"><div class="ph"><b>Category share of revenue</b><span class="status" id="s2"></span></div>
		<div class="legend" style="margin-bottom:8px"><span><i style="background:var(--violet)"></i><span id="lc">Cohort</span></span><span><i style="background:rgb(24 20 31 / 0.3)"></i><span id="lr">Everyone</span></span></div>
		<div class="pair" id="mix"></div></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Selection cohort', timezone: 'Etc/UTC' });
const table = app.createQuery('customers', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_id: customers.id, customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue } sorts { customer_id asc } }' });
const MIX = 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const TOT = 'explore { measures { total_revenue: revenue, num_customers: count_distinct(orders.customer_id) } }';
const cohortMix = app.createQuery('cohortMix', { dataset: 'ecommerce', aql: MIX });
const restMix = app.createQuery('restMix', { dataset: 'ecommerce', aql: MIX });
const cohortTot = app.createQuery('cohortTotal', { dataset: 'ecommerce', aql: TOT });
const restTot = app.createQuery('restTotal', { dataset: 'ecommerce', aql: TOT });
const inCohort = app.createFilter('inCohort', { dataset: 'ecommerce', field: 'customers.id', label: 'In cohort' });
const outCohort = app.createFilter('outCohort', { dataset: 'ecommerce', field: 'customers.id', label: 'Not in cohort' });
for (const q of [cohortMix, cohortTot]) app.mapControl(inCohort, q, { field: 'customers.id' });
for (const q of [restMix, restTot]) app.mapControl(outCohort, q, { field: 'customers.id' });
let made = false;
const id = (r) => String(r.customer_id);
K.$('#make').onclick = () => {
	const ids = table.selectedRows.map(id);
	inCohort.setCondition({ operator: 'is', values: ids });
	outCohort.setCondition({ operator: 'is_not', values: ids });
	made = true; app.execute();
};
K.$('#reset').onclick = () => { inCohort.reset(); outCohort.reset(); app.clearSelection(); made = false; app.execute(); };
function pick (r) {
	const s = table.selectedRows, has = s.some((x) => id(x) === id(r));
	const next = has ? s.filter((x) => id(x) !== id(r)) : [...s, r];
	if (next.length) table.select(next); else app.clearSelection();
	draw();
}
function line (share, val, col) { return '<span class="ln"><span class="t"><i style="width:' + (share * 100).toFixed(1) + '%;background:' + col + '"></i></span><span class="v">' + Math.round(share * 100) + '% · ' + K.compact.format(val) + '</span></span>'; }
function draw () {
	K.status(table, K.$('#s1')); K.status(made ? cohortMix : restMix, K.$('#s2'));
	const picked = new Set(table.selectedRows.map(id));
	if (table.result) K.table(K.$('#tbl'), [{ key: 'customer_id', label: 'ID', num: true }, { key: 'customer_name', label: 'Customer' }, { key: 'country_name', label: 'Country' }], table.result.rows, { on: (r) => picked.has(id(r)), pick });
	K.$('#npick').textContent = picked.size ? ': ' + picked.size + ' picked' : '';
	K.$('#make').disabled = !picked.size; K.$('#reset').hidden = !made;
	const ct = cohortTot.result?.rows[0], rt = restTot.result?.rows[0];
	K.$('#lc').textContent = made && ct ? 'Cohort: ' + K.int.format(ct.num_customers) : 'Cohort';
	K.$('#lr').textContent = made && rt ? 'Rest: ' + K.int.format(rt.num_customers) : 'Everyone';
	K.$('#lc').parentElement.style.display = made ? '' : 'none';
	const rest = restMix.result?.rows || [], coh = cohortMix.result?.rows || [];
	const sum = (rows) => rows.reduce((t, r) => t + Number(r.total_revenue), 0) || 1;
	const cm = new Map(coh.map((r) => [r.category_name, Number(r.total_revenue)])), rs = sum(rest), cs = sum(coh);
	K.$('#mix').innerHTML = rest.map((r) => '<div class="r"><span>' + K.esc(r.category_name) + '</span>'
		+ (made ? line((cm.get(r.category_name) || 0) / cs, cm.get(r.category_name) || 0, 'var(--violet)') : '')
		+ line(Number(r.total_revenue) / rs, Number(r.total_revenue), 'rgb(24 20 31 / 0.3)') + '</div>').join('');
	K.sent(K.$('#sent'), app, [cohortMix, restMix]);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Click customers 1 to 5 in the **Customers** table
2. Click **Make cohort**
3. Read **Category share of revenue**: **Cohort: 5** in violet against **Rest: 195** in grey
4. Click **Reset** to start over

## Other Selections patterns

- [Cross-filtering](single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Range brushing](range-brush.md): Drag across months on a chart, and other charts show only that period.
- [Histogram brushing](numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Cross-highlighting](cross-highlight.md): Hover a country, and other charts keep their totals but highlight its share.
- [Multiple cross-filters](two-selections.md): Keep a selection in two charts at once, like Germany in one and Software in the other.
