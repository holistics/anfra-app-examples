# Multiple cross-filters

> Keep a selection in two charts at once, like Germany in one and Software in the other.

- Pattern id: `two-selections`
- Category: Selections (also Controls)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#two-selections
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A plain click on **Germany** filters the page to Germany. A **Ctrl+click** (Cmd on Mac) on **Software** in another chart adds it: the page shows Germany's Software, $65,236. A plain click anywhere starts over.

Why: Readers expect each chart to keep its pick, the way spreadsheet slicers do. anfra holds one selection per app, so the app turns the earlier pick into a filter.

## What to build

A plain click selects and starts over; a Ctrl or Cmd click on another chart keeps the first pick and adds one.

Layout: Country bars and category bars; the earlier pick stays highlighted while the new one is added.

Instruction: Let readers keep picks in two charts at once with Ctrl+click, so the page shows both together, while a plain click starts over.

Done when: Both picks show as labels, the totals match both picks together, and a plain click anywhere drops back to one pick.

On the ecommerce sample: Click Germany, then Ctrl+click Software: Revenue on this page shows $65,236, with Country: Germany (kept) and Selected: Software.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { category: products.category }
  measures { total_revenue: revenue }
  sorts { total_revenue desc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "customers.country",
      "operator": "is",
      "values": [
        "Germany"
      ]
    },
    {
      "field": "products.category",
      "operator": "is",
      "values": [
        "Software"
      ]
    }
  ]
}
```

Saved result:

| category | total_revenue |
|---|---|
| Software | 65236.00 |

This is what a third chart receives after the Ctrl+click: the kept pick arrives as an ordinary filter (country is Germany) and the new selection as its condition (category is Software). They are ANDed. Checked live on 15 Oct: click Germany $205,890, Ctrl+click Software $65,236, Ctrl+click Services in the same chart $169,236 (Software OR Services), plain click Japan $118,326.

## SDK wiring

```js
// every chart cross-filters the others
for (const [a, b] of [
  [byCountry, byCategory],
  [byCountry, trend],
  [byCategory, byCountry],
  [byCategory, trend],
])
  app.mapCrossFilter(a, b);

// one hidden "kept pick" filter per chart, mapped to every query
// EXCEPT that chart,
// so the chart still shows all its bars and can highlight the kept
// ones
const keep = {
  byCountry: app.createFilter('keepCountry', {
    dataset: 'ecommerce',
    field: 'customers.country',
  }),
  byCategory: app.createFilter('keepCategory', {
    dataset: 'ecommerce',
    field: 'products.category',
  }),
};
for (const q of [byCategory, trend])
  app.mapControl(keep.byCountry, q, { field: 'customers.country' });
for (const q of [byCountry, trend])
  app.mapControl(keep.byCategory, q, {
    field: 'products.category',
  });

function onBarClick(query, row, event) {
  // Ctrl, or Cmd on Mac
  const add = event.ctrlKey || event.metaKey;
  const sel = app.selection;
  // plain click: start over
  if (!add) {
    Object.values(keep).forEach((f) => f.reset());
    query.select([row]);
    // Ctrl+click on another chart: keep the old pick as a filter
  } else if (sel && sel.source !== query.name) {
    keep[sel.source].setCondition({
      operator: 'is',
      values: sel.conditions[0].values,
    });
    query.select([row]);
    // Ctrl+click on the same chart: toggle (OR)
  } else {
    const s = query.selectedRows;
    query.select(
      s.includes(row) ? s.filter((r) => r !== row) : [...s, row],
    );
  }
  app.execute();
}
// highlight kept picks yourself: keep[name].condition.values;
// selectedRows only knows the current selection
```

State it touches: Analytical: one live selection plus one kept-pick filter per chart. Both are ordinary SDK state, so bookmarks and undo work as usual.

## Notes

- Each pick is either the one selection or a kept-pick filter; the SDK ANDs them for every query
- Plain click, Ctrl+click and toggle are about 15 lines of app code
- Limits: Works with app code. Each chart must break down by one field: a two-field chart (a country × month heatmap) sends its selection as one combined expression, which can't be copied into a single filter. An SDK that held named selections itself would remove this bookkeeping (proposed).

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>#bycat .b, #bycountry .b { grid-template-columns: 96px minmax(0, 1fr) 54px; } .tag { font-size: 12px; line-height: 16px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--rule-strong); } .tag.kept { border-style: dashed; color: var(--violet-ink); border-color: var(--violet); } .tag.sel { background: var(--violet-soft); color: var(--violet-ink); border-color: var(--violet); }</style>
		<div class="row"><span class="hint">Click a bar to start over, Ctrl+click (Cmd) to add to your picks</span><button type="button" id="add" aria-pressed="false" title="Acts like holding Ctrl">Add mode</button><button type="button" id="clear">Clear all</button></div>
		<div class="row"><span class="lbl">Revenue on this page</span><span class="kpi" id="kpi">–</span><span class="status" id="s3"></span><span class="row" id="tags"></span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s2"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Multiple cross-filters', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
for (const [a, b] of [[byCountry, byCategory], [byCountry, kpi], [byCategory, byCountry], [byCategory, kpi]]) app.mapCrossFilter(a, b);
const keep = {
	byCountry: app.createFilter('keepCountry', { dataset: 'ecommerce', field: 'customers.country', label: 'Kept country' }),
	byCategory: app.createFilter('keepCategory', { dataset: 'ecommerce', field: 'products.category', label: 'Kept category' }),
};
for (const q of [byCategory, kpi]) app.mapControl(keep.byCountry, q, { field: 'customers.country' });
for (const q of [byCountry, kpi]) app.mapControl(keep.byCategory, q, { field: 'products.category' });
const dim = { byCountry: 'country_name', byCategory: 'category_name' };
let addMode = false;
const kept = (name) => { const c = keep[name].condition; return c && c.values ? c.values.map(String) : []; };
function onBar (q, row, e) {
	const add = addMode || e.ctrlKey || e.metaKey;
	const sel = app.selection, d = dim[q.name];
	if (!add) {
		Object.values(keep).forEach((f) => f.reset());
		const only = q.selectedRows.length === 1 && q.selectedRows[0][d] === row[d];
		if (only) app.clearSelection(); else q.select([row]);
	} else if (sel && sel.source !== q.name) {
		keep[sel.source].setCondition({ operator: 'is', values: sel.conditions[0].values });
		const mine = kept(q.name); keep[q.name].reset();
		q.select(q.result.rows.filter((r) => mine.includes(r[d]) || r[d] === row[d]));
	} else {
		const s = q.selectedRows, has = s.some((r) => r[d] === row[d]);
		const next = has ? s.filter((r) => r[d] !== row[d]) : [...s, row];
		if (next.length) q.select(next); else app.clearSelection();
	}
	app.execute();
}
K.$('#add').onclick = () => { addMode = !addMode; K.$('#add').setAttribute('aria-pressed', String(addMode)); };
K.$('#clear').onclick = () => { Object.values(keep).forEach((f) => f.reset()); app.clearSelection(); app.execute(); };
function draw (q, el) {
	if (!q.result) return;
	const d = dim[q.name], sel = q.selectedRows.map((r) => r[d]), k = kept(q.name);
	K.bars(K.$(el), q.result.rows, { label: (r) => r[d] + (k.includes(r[d]) ? ' · kept' : ''), value: (r) => r.total_revenue, on: (r) => sel.includes(r[d]) || k.includes(r[d]), pick: (r, e) => onBar(q, r, e) });
}
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(byCategory, K.$('#s2')); K.status(kpi, K.$('#s3')); if (/row/.test(K.$('#s3').textContent)) K.$('#s3').textContent = '';
draw(byCountry, '#bycountry'); draw(byCategory, '#bycat');
const k = kpi.result?.rows[0]; K.$('#kpi').textContent = k ? K.money.format(k.total_revenue) : '–';
const tags = [];
for (const [name, lab] of [['byCountry', 'Country'], ['byCategory', 'Category']]) { const v = kept(name); if (v.length) tags.push('<span class="tag kept">' + lab + ': ' + K.esc(v.join(', ')) + ' (kept)</span>'); }
const sel = app.selection; if (sel && sel.rows.length) tags.push('<span class="tag sel">Selected: ' + K.esc(sel.rows.map((r) => r[dim[sel.source]]).join(', ')) + '</span>');
K.$('#tags').innerHTML = tags.join('');
K.sent(K.$('#sent'), app, [kpi, byCountry, byCategory]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **Germany** on **Revenue by country**: the page filters to Germany
2. Hold Ctrl (Cmd on Mac) and click **Software** on **Revenue by category**
3. Read **Revenue on this page**: $65,236, Germany's Software, with **Country: Germany (kept)** and **Selected: Software**
4. Click any bar without Ctrl to start over

## Other Selections patterns

- [Cross-filtering](single-select.md): Click one or more bars, a country on the map or heatmap cells, and other charts show only those.
- [Range brushing](range-brush.md): Drag across months on a chart, and other charts show only that period.
- [Histogram brushing](numeric-brush.md): Drag across a range of order sizes, like $1,000 to $2,000.
- [Cross-highlighting](cross-highlight.md): Hover a country, and other charts keep their totals but highlight its share.
- [Selection cohort](selection-cohort.md): Select some customers and compare what they buy with everyone else.
