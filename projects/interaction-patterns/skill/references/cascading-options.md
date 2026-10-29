# Parent-child filter

> Picking a category limits the product list to products in that category.

- Pattern id: `cascading-options`
- Category: Controls (also Filters)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#cascading-options
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks **Category: Hardware**, and the product picker shrinks from 8 options to 3. A product that no longer fits is dropped from the selection.

Why: A picker that offers impossible combinations leads to empty charts.

## What to build

Picking a parent value reloads the child picker with only the values under it, and drops child picks that no longer fit.

Layout: Two dropdowns side by side; the second one's list animates down to the matching items.

Instruction: Make a child picker offer only the values that fit the parent pick, and drop child picks that no longer fit.

Done when: The child list shrinks to values that fit, a stale pick is dropped with a note, and clearing restores the list.

On the ecommerce sample: Product starts with 8 options; pick Analytics Pro, then Hardware: the list shrinks to Gadget, Gizmo and Widget, and a note drops Analytics Pro.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { product: products.name }
  sorts { product asc }
}
```

Reader input the SDK sent:

```json
{
  "filters": [
    {
      "field": "products.category",
      "operator": "is",
      "values": [
        "Hardware"
      ]
    }
  ]
}
```

Saved result:

| product |
|---|
| Gadget |
| Gizmo |
| Widget |

`loadOptions()` takes no other conditions, because the suggestions request carries only dataset, model, field and search text. So the dependent list comes from a small query mapped to the parent control.

## SDK wiring

```js
const category = app.createFilter('category', {
  dataset: 'ecommerce',
  field: 'products.category',
});
const product = app.createFilter('product', {
  dataset: 'ecommerce',
  field: 'products.name',
});
const productOptions = app.createQuery('productOptions', {
  dataset: 'ecommerce',
  aql: OPTIONS_AQL,
});
app.mapControl(category, productOptions, {
  field: 'products.category',
});
for (const q of [trend, table]) {
  app.mapControl(category, q, { field: 'products.category' });
  app.mapControl(product, q, { field: 'products.name' });
}
productOptions.subscribe(() => {
  const ok = new Set(
    productOptions.result?.rows.map((r) => r.product),
  );
  const keep =
    product.condition.values?.filter((v) => ok.has(v)) ?? [];
  if (keep.length !== (product.condition.values?.length ?? 0))
    product.setCondition({ operator: 'is', values: keep });
});
```

## Notes

- The options query is a three-line `explore` that uses the same mapping
- The mapping is explicit, so the cascade shows in the Inspect panel
- Limits: Works with app code. A proposed `dependsOn` option on `createFilter` would replace the options query.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><label class="lbl" for="cat">Category</label><select id="cat"><option value="">All categories</option></select><span class="hint" id="count"></span></div>
		<div class="row"><span class="lbl">Product</span><span class="chips" id="prods"></span></div>
		<div class="hint" id="note">Pick a product, then a category it isn't in</div>
		<div class="panel"><div class="ph"><b>Revenue by product<span id="for"></span></b><span class="status" id="s1"></span></div><div id="bars"></div></div>
		<div class="hint">App code: the product list comes from a small options query mapped to Category, and the app drops picks that no longer fit</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Parent-child filter', timezone: 'Etc/UTC' });
const category = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
const product = app.createFilter('product', { dataset: 'ecommerce', field: 'products.name', label: 'Product' });
const productOptions = app.createQuery('productOptions', { dataset: 'ecommerce', aql: 'explore { dimensions { product_name: products.name } sorts { product_name asc } }' });
const byProduct = app.createQuery('byProduct', { dataset: 'ecommerce', aql: 'explore { dimensions { product_name: products.name } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
app.mapControl(category, productOptions, { field: 'products.category' });
app.mapControl(category, byProduct, { field: 'products.category' });
app.mapControl(product, byProduct, { field: 'products.name' });
const picked = new Set();
const sel = K.$('#cat'), chips = K.$('#prods');
const setProduct = () => { if (picked.size) product.setCondition({ operator: 'is', values: [...picked] }); else product.reset(); };
category.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = async () => {
	if (sel.value) category.setCondition({ operator: 'is', values: [sel.value] }); else category.reset();
	const run = app.execute();
	if (picked.size) byProduct.abort();   // hold the chart until the new options say which picks still fit
	await run;
	const fit = new Set((productOptions.result?.rows || []).map((r) => r.product_name));
	const dropped = [...picked].filter((p) => !fit.has(p));
	dropped.forEach((p) => picked.delete(p));
	K.$('#note').textContent = dropped.length ? 'Dropped ' + dropped.join(', ') + ': not in ' + sel.value : 'Every picked product still fits';
	setProduct();
	app.execute();
};
const runs = { productOptions: 0, byProduct: 0 }, was = {};
app.subscribe(() => {
for (const q of [productOptions, byProduct]) { if (q.state === 'success' && was[q.name] !== 'success') runs[q.name]++; was[q.name] = q.state; }
if (productOptions.result) {
	const rows = productOptions.result.rows;
	const have = [...chips.children].map((b) => b.dataset.v).join('|');
	if (have !== rows.map((r) => r.product_name).join('|')) chips.replaceChildren(...rows.map((r) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = r.product_name; b.dataset.v = r.product_name; b.onclick = () => { picked.has(r.product_name) ? picked.delete(r.product_name) : picked.add(r.product_name); setProduct(); K.$('#note').textContent = 'Now pick a category'; app.execute(); }; return b; }));
	K.$('#count').textContent = rows.length + ' product options';
}
chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.v))));
K.status(byProduct, K.$('#s1'));
const c = category.appliedCondition, p = product.appliedCondition;
K.$('#for').textContent = (c && c.values && c.values.length ? ' · ' + c.values.join(', ') : '') + (p && p.values && p.values.length ? ' · ' + p.values.join(', ') : '');
if (byProduct.result && byProduct.state !== 'executing') K.bars(K.$('#bars'), byProduct.result.rows, { label: (r) => r.product_name, value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [productOptions, byProduct], () => ['runs so far → productOptions ' + runs.productOptions + ', byProduct ' + runs.byProduct]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Read the hint: the **Product** row starts with 8 product options
2. Click **Analytics Pro** in the **Product** row
3. Pick **Hardware** in the **Category** list
4. Read the hint: the row shrinks to 3 product options, **Gadget**, **Gizmo** and **Widget**
5. Read the note: Dropped Analytics Pro, not in Hardware

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
- [Custom right-click menu](custom-menu.md): Right-click a data point to open a menu of actions, and choose which actions it offers.
