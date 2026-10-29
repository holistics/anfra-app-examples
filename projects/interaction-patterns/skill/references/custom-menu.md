# Custom right-click menu

> Right-click a data point to open a menu of actions, and choose which actions it offers.

- Pattern id: `custom-menu`
- Category: Controls (also Drilling, Filters)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#custom-menu
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

Right-clicking **Germany** opens a menu at the pointer: **Keep only**, **Exclude**, **Drill to customers** and **View orders**. The app author turns items on or off and adds their own, such as **Copy as AQL filter**. Exclude Germany and the chart drops to five countries; Drill to customers lists Customer 92 first, at $13,118.

Why: One click target can do many things. A menu says what each click will do, and the author keeps it to the actions that make sense for that chart.

## What to build

Right-clicking a data point opens a small menu at the pointer instead of the browser's. Each item sets a filter on the clicked value, on the same chart or on a detail query; the author decides which items appear.

Layout: Country bars with a right-click menu at the pointer, and a strip of menu items the author can toggle.

Instruction: Add a right-click menu to the data points in my chart, with Keep only, Exclude, a drill and View records, a list where I choose which items show, and room for my own items.

Done when: Right-click opens the menu at the pointer (the Menu key or Shift+F10 opens it from the keyboard), it lists only the items the author turned on, and Escape or a click elsewhere closes it.

On the ecommerce sample: Excluding Germany leaves five countries; Drill to customers in Germany lists Customer 92 first, at $13,118.

## AQL

Not run as written: each menu item is a filter on the clicked value, sent to the chart or to a detail query.

```aql
explore { dimensions { customer_name: customers.name } measures { total_revenue: revenue, num_orders: order_count } filters { customers.country is 'Germany' } sorts { total_revenue desc } }
```

## SDK wiring

```js
// the author's menu: a label and what it does with the row
const MENU = [
  { label: 'Keep only', run: (row) =>
      country.setCondition({ operator: 'is',
        values: [row.country_name] }) },
  { label: 'Exclude', run: (row) =>
      country.setCondition({ operator: 'is_not',
        values: [row.country_name] }) },
  { label: 'Drill to customers', run: (row) =>
      point.setCondition({ operator: 'is',
        values: [row.country_name] }) },
  // the author's own item
  { label: 'Copy as AQL filter', run: (row) =>
      navigator.clipboard.writeText(
        "customers.country is '" + row.country_name + "'") },
];
bar.oncontextmenu = (e) => {
  e.preventDefault(); // instead of the browser's menu
  openMenu(e.clientX, e.clientY, row, MENU.filter(isOn));
};
// each item ends the same way
const pick = (item, row) => { item.run(row); app.execute(); };
```

State it touches: Interaction mapping: which items the menu offers is renderer state. What each item does is a filter condition on the clicked value, so it shows up in the AQL.

## Notes

- Each item is `setCondition` on a filter that is already mapped to the right queries
- Limits: Works with app code: the app draws the menu and maps each item to an SDK call. A proposed `app.createMenu(query, items)` would offer the standard items, built from the Dataset's drill paths and fields.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>.cfg { display: grid; gap: 6px; padding: 8px 10px; border-radius: 10px; background: var(--sunken); } .cfg .chips button[aria-pressed='false'] { color: var(--muted); text-decoration: line-through; text-decoration-color: rgb(24 20 31 / 0.35); } .cfg .chips .own { border-style: dashed; } #main { position: relative; } .mbar { position: absolute; z-index: 2; display: grid; min-width: 180px; gap: 2px; padding: 4px; border-radius: 10px; background: #fff; border: 1px solid var(--rule-strong); box-shadow: 0 6px 20px rgb(24 20 31 / 0.14); } .mbar[hidden] { display: none; } .mbar button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px; font-size: 12px; white-space: nowrap; text-align: left; justify-content: flex-start; } .mbar button:hover { background: var(--violet-soft); color: var(--violet-ink); } .mbar .own { color: var(--violet-ink); } .fchips { display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px; align-items: center; font-size: 12px; color: var(--muted); } .fchips button { height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; background: var(--violet-soft); border-color: var(--violet); color: var(--violet-ink); } #detail[hidden], #toast[hidden], #nudge[hidden] { display: none; } #toast { font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--violet-ink); }</style>
	<div class="app">
		<div class="cfg"><span class="hint">Menu items: the app author picks these, and can add their own</span><span class="chips" id="cfg"></span></div>
		<div class="panel" id="main"><div class="ph"><b>Revenue by country · right-click a bar</b><span class="status" id="s1"></span></div>
		<div class="fchips" id="fchips"></div><div id="bars"></div><div class="mbar" id="mbar" role="menu" hidden></div><div class="hint" id="nudge" hidden>Right-click a bar to open its menu</div></div>
		<div class="panel" id="detail" hidden><div class="ph"><b id="dt"></b><span class="status" id="s2"></span></div><div id="dbody"></div></div>
		<div id="toast" hidden></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Custom right-click menu', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', pageSize: 5, aql: 'explore { dimensions { customer_name: customers.name } measures { total_revenue: revenue, num_orders: order_count } sorts { total_revenue desc } }' });
const orders = app.createQuery('orders', { dataset: 'ecommerce', pageSize: 5, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, order_status: orders.status } measures { total_revenue: revenue } sorts { ordered_on desc, order_id desc } }' });
// keep only and exclude filter the chart; drill and view orders filter the detail queries
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const point = app.createFilter('point', { dataset: 'ecommerce', field: 'customers.country', label: 'Clicked country' });
app.mapControl(country, byCountry, { field: 'customers.country' });
app.mapControl(point, customers, { field: 'customers.country' });
app.mapControl(point, orders, { field: 'customers.country' });
let kept = null, out = [], view = null, at = null, toast = '';
const run = () => { menu(null); app.execute(); };
const applyCountry = () => { if (kept) country.setCondition({ operator: 'is', values: [kept] }); else if (out.length) country.setCondition({ operator: 'is_not', values: out }); else country.reset(); };
const detail = (kind, r) => { view = { kind, name: r.country_name }; point.setCondition({ operator: 'is', values: [r.country_name] }); run(); };
// the menu: each item is a label and what it does with the clicked row
const ITEMS = [
	{ id: 'keep', label: 'Keep only', on: true, act: (r) => { kept = r.country_name; out = []; applyCountry(); run(); } },
	{ id: 'exclude', label: 'Exclude', on: true, act: (r) => { kept = null; out = out.concat(r.country_name); applyCountry(); run(); } },
	{ id: 'drill', label: 'Drill to customers', on: true, act: (r) => detail('customers', r) },
	{ id: 'orders', label: 'View orders', on: true, act: (r) => detail('orders', r) },
	{ id: 'copy', label: 'Copy as AQL filter', on: false, own: true, act: (r) => { const t = "customers.country is '" + r.country_name + "'"; toast = 'Copied: ' + t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { toast = 'Copy it: ' + t; draw(); }); menu(null); draw(); } },
];
const cfg = K.$('#cfg');
for (const it of ITEMS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = (it.own ? '+ ' : '') + it.label; if (it.own) b.className = 'own'; b.onclick = () => { it.on = !it.on; b.setAttribute('aria-pressed', String(it.on)); menu(null); draw(); }; b.setAttribute('aria-pressed', String(it.on)); cfg.appendChild(b); }
const mb = K.$('#mbar');
// right-click (or the Menu key / Shift+F10 on a focused bar) opens the menu at the pointer
function menu (r, x, y) {
	at = r; mb.hidden = !r;
	if (!r) return;
	mb.replaceChildren(...ITEMS.filter((it) => it.on).map((it) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it.label; if (it.own) b.className = 'own'; b.onclick = (e) => { e.stopPropagation(); it.act(r); }; return b; }));
	if (!mb.children.length) mb.innerHTML = '<span class="hint" style="padding: 6px 8px">No menu items: turn some on above</span>';
	const box = K.$('#main').getBoundingClientRect();
	mb.style.left = Math.max(4, Math.min(x - box.left, box.width - mb.offsetWidth - 4)) + 'px';
	mb.style.top = (y - box.top + 2) + 'px';
}
let nudge = 0;
document.addEventListener('click', (e) => { if (at && !mb.contains(e.target)) { menu(null); draw(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && at) { menu(null); draw(); } });
const dd = (v) => { const x = new Date(String(v).slice(0, 10) + 'T00:00:00Z'); return x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function draw () {
	K.status(byCountry, K.$('#s1'));
	const fc = K.$('#fchips');
	fc.innerHTML = kept ? 'Country is ' : out.length ? 'Country is not ' : 'No filter yet';
	for (const v of kept ? [kept] : out) { const b = document.createElement('button'); b.type = 'button'; b.textContent = v + ' ×'; b.setAttribute('aria-label', 'Remove ' + v); b.onclick = () => { if (kept) kept = null; else out = out.filter((x) => x !== v); applyCountry(); run(); }; fc.appendChild(b); }
	if (byCountry.result) K.bars(K.$('#bars'), byCountry.result.rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => !!at && r.country_name === at.country_name, pick: () => { if (at) return; nudge = Date.now(); draw(); setTimeout(draw, 1600); } });
	if (byCountry.result) [...K.$('#bars').children].forEach((el, i) => {
		const r = byCountry.result.rows[i];
		const open = (x, y) => { menu(r, x, y); draw(); const first = mb.querySelector('button'); if (first) first.focus(); };
		el.oncontextmenu = (e) => { e.preventDefault(); open(e.clientX, e.clientY); };
		el.onkeydown = (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const b = el.getBoundingClientRect(); open(b.left + 96, b.bottom); } };
	});
	K.$('#nudge').hidden = Date.now() - nudge > 1500;
	const box = K.$('#detail'); box.hidden = !view;
	if (view) {
		const q = view.kind === 'customers' ? customers : orders;
		K.status(q, K.$('#s2'));
		K.$('#dt').textContent = (view.kind === 'customers' ? 'Top customers in ' : 'Latest orders in ') + view.name;
		if (q.result) K.table(K.$('#dbody'), view.kind === 'customers'
			? [{ key: 'customer_name', label: 'Customer' }, { key: 'num_orders', label: 'Orders', num: true }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }]
			: [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: dd }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], q.result.rows);
	}
	K.$('#toast').hidden = !toast; K.$('#toast').textContent = toast;
	K.sent(K.$('#sent'), app, view ? [byCountry, view.kind === 'customers' ? customers : orders] : [byCountry], () => ['menu → ' + (ITEMS.filter((it) => it.on).map((it) => it.label).join(' · ') || 'empty') + ' (app code)']);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Right-click **Germany**: a menu opens at the pointer, with **Keep only**, **Exclude**, **Drill to customers** and **View orders**
2. Click **Exclude**: the chart drops to five countries, and the chip reads **Country is not Germany**
3. In the menu items strip, turn off **Exclude** and turn on **+ Copy as AQL filter**, then right-click **Singapore**: the menu has the new set
4. Click **Germany ×** to clear the filter, right-click **Germany** again and pick **Drill to customers**: Customer 92 leads, at $13,118

## Other Controls patterns

- [Filter mapping](one-control-many.md): Choose which charts a filter changes, so a benchmark chart can stay unfiltered.
- [Parent-child filter](cascading-options.md): Picking a category limits the product list to products in that category.
- [Apply button](apply-button.md): Change several filters, then press Apply to update every chart at once.
- [Cross filter](selection-to-filter.md): Turn a clicked selection into a filter chip, so your next click narrows further.
- [Zoom / pan](zoom-pan.md): Scrolling zooms the picture, and double-clicking reloads that month week by week.
- [Legend visibility](legend-toggle.md): Click a legend item to hide its line, or Alt-click to show only that line.
