# Reset filters

> Clear one filter, or all of them, back to the defaults.

- Pattern id: `reset`
- Category: Save & share (also Filters)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#reset
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Each chip has an × that resets that filter. **Reset all** resets every control, clears the selection and restores the AQL's own sort.

Why: Readers explore more freely when getting back is one click.

## What to build

Each active filter shows as a chip with a clear button, and Reset all returns every filter, selection and sort to default.

Layout: Chips with × and a Reset all link.

Instruction: Give each active filter a clear button, plus Reset all to return every filter, selection and sort to its default.

Done when: Clearing one chip leaves the other filters in place, and Reset all shows the same view as a fresh page load.

On the ecommerce sample: With Japan, Completed and Software selected, the × on one chip clears only that filter, and Reset all returns everything to its default.

## AQL

Not run as written: no query change.

```aql
// defaults live in the declaration: createFilter(name, { default: { operator, values } })
```

Trailer frame 1 approximates the filtered numbers at half of Japan's revenue.

## SDK wiring

```js
chipX.onclick = () => {
  filter.reset();
  app.execute();
};
resetAll.onclick = () => {
  for (const c of Object.values(app.controls)) c.reset();
  app.clearSelection();
  for (const q of Object.values(app.queries)) q.setSort([]);
  app.execute();
};
```

## Notes

- `reset()` returns to the declared `default`, and `setSort([])` to the AQL's order

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<div class="row"><select id="country" aria-label="Country"><option value="">All countries</option></select><select id="status" aria-label="Status"><option value="">Any status</option></select><span class="lbl">Sort categories</span><span class="seg" id="sort"><button type="button" data-s="">By revenue</button><button type="button" data-s="az">A–Z</button></span></div>
		<div class="row" style="min-height:32px"><span class="chips" id="chips"></span><button type="button" id="all" style="height:28px;font-size:12px">Reset all</button></div>
		<div class="cols" style="grid-template-columns: 1fr 1.4fr">
			<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s1"></span></div><div id="cats"></div><div class="hint" style="margin-top:4px">Click a category to select it</div></div>
			<div class="panel"><div class="ph"><b>Monthly revenue: <span id="kpi">–</span></b><span class="status" id="s2"></span></div><div id="trend"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Reset filters', timezone: 'Etc/UTC' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
for (const q of [byCat, trend]) { app.mapControl(country, q, { field: 'customers.country' }); app.mapControl(status, q, { field: 'orders.status' }); }
app.mapCrossFilter(byCat, trend);
const $c = K.$('#country'), $s = K.$('#status');
const cap = (v) => v[0].toUpperCase() + v.slice(1);
country.loadOptions().then((vals) => vals.forEach((v) => $c.add(new Option(v, v))));
status.loadOptions().then((vals) => vals.forEach((v) => $s.add(new Option(cap(v), v))));
const setF = (f, v) => { if (v) f.setCondition({ operator: 'is', values: [v] }); else f.reset(); app.execute(); };
$c.onchange = () => setF(country, $c.value);
$s.onchange = () => setF(status, $s.value);
K.$('#sort').querySelectorAll('button').forEach((b) => { b.onclick = () => { byCat.setSort(b.dataset.s ? [{ field: 'category_name', direction: 'asc' }] : []); app.execute(); }; });
// one click back to the declared defaults: controls, selection and sorts, then one execute()
K.$('#all').onclick = () => {
	for (const c of Object.values(app.controls)) c.reset();
	app.clearSelection();
	for (const q of Object.values(app.queries)) q.setSort([]);
	app.execute();
};
const one = (c) => (c.condition && c.condition.values && c.condition.values.length ? c.condition.values[0] : null);
const picked = () => (app.selection && app.selection.rows[0] ? app.selection.rows[0].category_name : null);
function chip (text, onX, kind) {
	const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'true');
	b.textContent = text + ' ×'; b.title = 'Reset this one'; b.onclick = onX;
	if (kind === 'sel') b.style.borderStyle = 'dashed';
	return b;
}
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
	const c = one(country), s = one(status), p = picked(), sorted = byCat.sort.length > 0;
	$c.value = c || ''; $s.value = s || '';
	K.$('#sort').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!!b.dataset.s === sorted)));
	const chips = [];
	if (c) chips.push(chip(c, () => { country.reset(); app.execute(); }));
	if (s) chips.push(chip(cap(s), () => { status.reset(); app.execute(); }));
	if (p) chips.push(chip('Selected: ' + p, () => { app.clearSelection(); app.execute(); }, 'sel'));
	if (sorted) chips.push(chip('Sort: A–Z', () => { byCat.setSort([]); app.execute(); }));
	K.$('#chips').replaceChildren(...chips);
	if (!chips.length) K.$('#chips').innerHTML = '<span class="hint">Every filter, selection and sort is at its default</span>';
	K.$('#all').hidden = chips.length < 1;
	K.status(byCat, K.$('#s1')); K.status(trend, K.$('#s2'));
	if (byCat.result) K.bars(K.$('#cats'), byCat.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue, on: (r) => r.category_name === p,
		pick: (r) => { if (p === r.category_name) app.clearSelection(); else byCat.select([r]); app.execute(); } });
	if (trend.result) {
		K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
		K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
	}
	K.sent(K.$('#sent'), app, [byCat, trend], () => ['byCategory sort → ' + (sorted ? 'category_name asc (setSort)' : 'the AQL\'s own (total_revenue desc)')]);
});
app.execute();
```

## Walkthrough on the gallery card

1. Pick **Japan** in the country menu and **Completed** in the status menu
2. Click **Software** in **Revenue by category** to select it
3. Read the chips: **Japan ×**, **Completed ×** and **Selected: Software ×**
4. Click the × on one chip to reset just that filter
5. Click **Reset all**: every filter, the selection and the sort go back to their defaults

## Other Save & share patterns

- [Bookmarks](bookmarks.md): Save the current view and come back to it with one click.
- [Filter state URL](url-state.md): Copy a link that opens the app with the same filters.
- [Undo / redo](undo-redo.md): Step back and forward through your filter and drill changes.
- [Saved views](saved-views.md): Keep named views that are still there next week, on any device.
- [Refresh & cache](refresh.md): Rerun the queries and see how fresh the data is.
