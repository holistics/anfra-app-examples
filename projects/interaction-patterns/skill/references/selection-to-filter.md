# Cross filter

> Turn a clicked selection into a filter chip, so your next click narrows further.

- Pattern id: `selection-to-filter`
- Category: Controls (also Selections, Filters)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#selection-to-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader clicks **Vietnam** on the bar chart, then presses **📌 Pin**. Vietnam turns into a filter chip, and the next click (Software) starts a new selection inside Vietnam.

Why: An app holds one selection at a time. Pinning lets the reader stack questions anyway.

## What to build

Clicking a bar selects it; pressing Pin turns that selection into a filter chip, so the next click selects within it.

Layout: Country bars + category bars; a pin icon appears on the selected bar.

Instruction: Add a Pin button that turns the current chart selection into a filter chip, so readers can narrow step by step.

Done when: Pin makes a chip named for the pick, later clicks select inside it, and removing the chip widens the page again.

On the ecommerce sample: Click Vietnam, then Pin: a Country: Vietnam chip appears, and clicking Software starts a new selection inside Vietnam. Removing the chip lifts the filter.

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
  "conditions": [
    {
      "expr": "customers.country == 'Vietnam'"
    }
  ]
}
```

Saved result:

| category | total_revenue |
|---|---|
| Services | 91500.00 |
| Software | 68234.00 |
| Hardware | 23746.62 |
| Parts | 1774.15 |

The input shows how the SDK sends a selection: as a `conditions[].expr`. After pinning, the same value becomes a `filters[]` entry.

## SDK wiring

```js
pinBtn.onclick = () => {
  // { source, rows, conditions }
  const sel = app.selection;
  for (const c of sel.conditions) {
    // e.g. customers.country → country filter
    const f = filtersByField[c.field];
    f.setCondition({ operator: 'is', values: c.values });
  }
  app.clearSelection();
  app.execute();
};
```

State it touches: Moves state from a selection, which can be replaced, to a control, which persists.

## Notes

- `app.selection.conditions` already holds the field and values, so pinning means copying them into a filter

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>#bycat .b, #bycountry .b { grid-template-columns: 100px minmax(0, 1fr) 54px; } .tag { font-size: 12px; line-height: 16px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--violet); background: var(--violet-soft); color: var(--violet-ink); }</style>
		<div class="row"><span class="hint">Click a bar to select it, pin it to turn it into a filter, then click again</span></div>
		<div class="row"><span class="lbl">Revenue</span><span class="kpi" id="kpi">–</span><span class="status" id="s3"></span><button type="button" id="pin" hidden></button><span class="chips" id="chips"></span><span class="tag" id="seltag" hidden></span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Revenue by category<span id="cfor"></span></b><span class="status" id="s2"></span></div><div id="bycat"></div></div></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Cross filter', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
for (const [a, b] of [[byCountry, byCategory], [byCountry, kpi], [byCategory, byCountry], [byCategory, kpi]]) app.mapCrossFilter(a, b);
const filtersByField = {
	'customers.country': app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' }),
	'products.category': app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' }),
};
for (const q of [byCategory, kpi]) app.mapControl(filtersByField['customers.country'], q, { field: 'customers.country' });
for (const q of [byCountry, kpi]) app.mapControl(filtersByField['products.category'], q, { field: 'products.category' });
const dim = { byCountry: 'country_name', byCategory: 'category_name' };
const pinned = (field) => { const c = filtersByField[field].condition; return c && c.values ? c.values.map(String) : []; };
K.$('#pin').onclick = () => {
	const sel = app.selection;
	for (const c of sel.conditions) filtersByField[c.field].setCondition({ operator: 'is', values: c.values });
	app.clearSelection();
	app.execute();
};
function draw (q, el, field) {
	if (!q.result) return;
	const d = dim[q.name], sel = q.selectedRows.map((r) => r[d]), pin = pinned(field);
	K.bars(K.$(el), q.result.rows, { label: (r) => r[d] + (pin.includes(r[d]) ? ' · pinned' : ''), value: (r) => r.total_revenue, on: (r) => sel.includes(r[d]) || pin.includes(r[d]),
		pick: (r) => { if (sel.length === 1 && sel[0] === r[d]) app.clearSelection(); else q.select([r]); app.execute(); } });
}
app.subscribe(() => {
K.status(byCountry, K.$('#s1')); K.status(byCategory, K.$('#s2')); K.status(kpi, K.$('#s3')); if (/row/.test(K.$('#s3').textContent)) K.$('#s3').textContent = '';
draw(byCountry, '#bycountry', 'customers.country'); draw(byCategory, '#bycat', 'products.category');
const k = kpi.result?.rows[0]; K.$('#kpi').textContent = k ? K.money.format(k.total_revenue) : '–';
const sel = app.selection, names = sel ? sel.rows.map((r) => r[dim[sel.source]]) : [];
const pin = K.$('#pin'); pin.hidden = !names.length; pin.textContent = 'Pin ' + names.join(', ');
const st = K.$('#seltag'); st.hidden = !names.length; st.textContent = 'Selected: ' + names.join(', ');
const chips = K.$('#chips'); chips.replaceChildren();
for (const [field, lab] of [['customers.country', 'Country'], ['products.category', 'Category']]) {
	const v = pinned(field); if (!v.length) continue;
	const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'true'); b.title = 'Remove this filter';
	b.textContent = lab + ': ' + v.join(', ') + '  ×'; b.onclick = () => { filtersByField[field].reset(); app.execute(); };
	chips.appendChild(b);
}
const cp = pinned('customers.country'); K.$('#cfor').textContent = cp.length ? ' · ' + cp.join(', ') : '';
K.sent(K.$('#sent'), app, [kpi, byCategory, byCountry]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Click **Vietnam** on **Revenue by country**: it becomes the selection
2. Click **Pin Vietnam**: Vietnam turns into a **Country: Vietnam** filter chip
3. Click **Software** on **Revenue by category**: a new selection starts inside Vietnam
4. Click the **Country: Vietnam ×** chip to remove the filter

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
