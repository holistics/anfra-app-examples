# Break down

> Right-click a bar to split it by another field, like order status.

- Pattern id: `adhoc-breakdown`
- Category: Drilling (also Tables & calculations)
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#adhoc-breakdown
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader right-clicks **Software** and picks **Break down by → Status**. A new panel shows Software revenue by status.

Why: The next question is often about a different dimension, not a deeper one.

## What to build

Right-clicking a bar opens a short list of fields, and picking one opens a panel splitting that bar's value by it.

Layout: Context menu over a bar, then a new breakdown panel.

Instruction: Let the reader right-click a bar and break that value down by another field from a short list.

Done when: The new panel's parts add up to the bar clicked, and closing it leaves the main chart as it was.

On the ecommerce sample: Right-clicking Software and picking Status opens a Software by status panel with completed, shipped and cancelled, and Close breakdown clears it.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
explore {
  dimensions { status: orders.status }
  measures { total_revenue: revenue, num_orders: order_count }
  sorts { total_revenue desc }
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
        "Software"
      ]
    }
  ]
}
```

Saved result:

| status | total_revenue | num_orders |
|---|---|---|
| completed | 292664.00 | 375 |
| shipped | 104828.00 | 135 |
| cancelled | 99902.00 | 132 |

## SDK wiring

```js
let n = 0;
// dimRef from a fixed list, never typed text
function breakdown(row, dimRef, alias) {
  const q = app.createQuery('bd' + ++n, {
    dataset: 'ecommerce',
    aql: `
      explore {
        dimensions { ${alias}: ${dimRef} }
        measures { total_revenue: revenue }
        sorts { total_revenue desc }
      }
    `,
  });
  const f = app.createFilter('bdf' + n, {
    dataset: 'ecommerce',
    field: 'products.category',
  });
  f.setCondition({ operator: 'is', values: [row.category] });
  app.mapControl(f, q, { field: 'products.category' });
  return app.execute();
}
```

## Notes

- A new `explore` from a fixed list of dimensions. The parent value is a mapped filter, not text in the query
- Limits: Works with app code: "AQL is fixed once declared", so each breakdown is a new query.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app">
		<style>
		.menu { position: fixed; z-index: 5; background: #fff; border: 1px solid var(--rule-strong); border-radius: 10px; box-shadow: 0 8px 24px rgb(24 20 31 / 0.14); padding: 4px; display: grid; min-width: 168px; }
		.menu[hidden] { display: none; }
		.menu .mh { font-size: 12px; line-height: 16px; color: var(--muted); padding: 4px 8px; }
		.menu button { border: 0; border-radius: 6px; text-align: left; height: 28px; font-size: 14px; }
		.menu button:hover { background: var(--violet-soft); }
		#bd .b, #bycat .b { grid-template-columns: 88px minmax(0, 1fr) 54px; }
		</style>
		<div class="row"><span class="hint">Right-click (or click) a category to break it down by another field</span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s1"></span></div><div id="bycat"></div></div>
		<div class="panel" id="bdp"><div class="ph"><b id="bdt">Breakdown</b><span class="status" id="s2"></span></div><div id="bd"><div class="hint">No breakdown yet</div></div><div class="row" style="margin-top:8px"><button type="button" id="close" hidden>Close breakdown</button></div></div></div>
		<div class="menu" id="menu" hidden></div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Break down', timezone: 'Etc/UTC' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const DIMS = [{ id: 'status', label: 'Status', ref: 'orders.status' }, { id: 'country', label: 'Country', ref: 'customers.country' }, { id: 'product', label: 'Product', ref: 'products.name' }];
const made = {};
let active = null, parent = null;
function breakdown (row, d) {
	if (!made[d.id]) {
		const q = app.createQuery('by_' + d.id, { dataset: 'ecommerce', aql: 'explore { dimensions { part: ' + d.ref + ' } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
		const f = app.createFilter('of_' + d.id, { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
		app.mapControl(f, q, { field: 'products.category' });
		made[d.id] = { q, f, d };
	}
	made[d.id].f.setCondition({ operator: 'is', values: [row.category_name] });
	active = made[d.id]; parent = row.category_name;
	return app.execute();
}
const menu = K.$('#menu');
function openMenu (row, x, y) {
	menu.innerHTML = '<div class="mh">Break down ' + K.esc(row.category_name) + ' by</div>';
	for (const d of DIMS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = d.label; b.onclick = () => { menu.hidden = true; breakdown(row, d); }; menu.appendChild(b); }
	menu.hidden = false;
	menu.style.left = Math.min(x, innerWidth - 180) + 'px'; menu.style.top = Math.min(y, innerHeight - 130) + 'px';
	menu.querySelector('button').focus();
}
document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !e.target.closest('#bycat')) menu.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
K.$('#close').onclick = () => { active = null; parent = null; draw(); };
function draw () {
	K.status(byCategory, K.$('#s1'));
	if (byCategory.result) {
		K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue, on: parent ? (r) => r.category_name === parent : null,
			pick: (r, e) => { const b = e.currentTarget.getBoundingClientRect(); openMenu(r, e.clientX || b.left + 24, e.clientY || b.bottom); } });
		K.$('#bycat').querySelectorAll('.b').forEach((el, i) => { el.oncontextmenu = (e) => { e.preventDefault(); openMenu(byCategory.result.rows[i], e.clientX, e.clientY); }; });
	}
	K.$('#close').hidden = !active;
	if (active) {
		K.status(active.q, K.$('#s2'));
		K.$('#bdt').textContent = parent + ' by ' + active.d.label.toLowerCase();
		if (active.q.result) K.bars(K.$('#bd'), active.q.result.rows, { label: (r) => r.part, value: (r) => r.total_revenue });
	} else { K.$('#s2').textContent = ''; K.$('#bdt').textContent = 'Breakdown'; K.$('#bd').className = ''; K.$('#bd').innerHTML = '<div class="hint">No breakdown yet</div>'; }
	K.sent(K.$('#sent'), app, active ? [active.q] : [byCategory], () => [active ? 'new query by_' + active.d.id + ': dimensions { part: ' + active.d.ref + ' }' : null]);
}
app.subscribe(draw);
app.execute();
```

## Walkthrough on the gallery card

1. Right-click the **Software** bar, or just click it
2. Pick **Status** in the **Break down Software by** menu
3. Read the new panel, **Software by status**: completed, shipped and cancelled
4. Click **Close breakdown** to clear it

## Other Drilling patterns

- [Drill down](hierarchy-drill.md): Click a region to see its countries, then customers, then their orders, and climb back with breadcrumbs.
- [Drill path](drill-path.md): Keep a trail of every step down and up, and click any step to go back to it.
- [View underlying data](underlying-records.md): Click a column on a chart to see the individual orders behind it.
- [Drill-through](drillthrough.md): Click a country to open another app already filtered to that country.
- [Row actions](row-actions.md): Put links on each table row: open the customer in your CRM, email them, or see their orders.
