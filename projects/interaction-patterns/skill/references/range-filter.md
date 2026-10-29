# Range filter

> Drag a slider to keep orders between two values, or above or below one.

- Pattern id: `range-filter`
- Category: Filters (also Controls)
- Status: Works today: anfra does it natively
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#range-filter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

A two-handled slider keeps orders worth **$500 to $2,000**: 589 orders and $622,557. Switching to **one handle, over $2,000** leaves 195 orders, $388k of them Services. Two handles from $2,000 to the top find 205: `between` keeps the 10 orders of exactly $2,000, and `>` leaves them out.

Why: Readers think in ranges: big orders, small baskets, the middle band. A slider shows the range at a glance and is quick to adjust.

## What to build

Two handles keep values between them; one handle keeps values over or under it. The charts update a moment after the reader stops dragging.

Layout: A slider with one or two handles over an order-value track, an orders KPI and revenue by category.

Instruction: Add a range slider filter on a number field in my app, with two handles for a range or one handle for over or under, plus number inputs for exact values.

Done when: The handles can't cross, the typed values and the handles agree, and the label says whether each end is included.

On the ecommerce sample: $500 to $2,000 shows 589 orders and $622,557. Over $2,000 shows 195 orders, 10 fewer than $2,000 to the top, because between includes $2,000 and over does not.

## AQL

Not run as written: the slider sets a condition on orders.order_value, a Dataset dimension.

```aql
explore { dimensions { category_name: products.category } measures { total_revenue: revenue } filters { orders.order_value between 500 and 2000 } sorts { total_revenue desc } }
```

The SDK's number operators are `between`, `greater_than` and `less_than`. `between` compiles to `>=` and `<=`, so it keeps both ends; one handle compiles to `>` or `<` and leaves its end out. There is no SDK operator for "at least".

## SDK wiring

```js
const value = app.createFilter('orderValue', {
  dataset: 'ecommerce',
  field: 'orders.order_value',
});
app.mapControl(value, byCategory, { field: 'orders.order_value' });
// two handles, or one: over or under
const condition = {
  two: { operator: 'between', values: [lo, hi] },
  min: { operator: 'greater_than', values: [lo] },
  max: { operator: 'less_than', values: [hi] },
}[mode];
// values are strings, and the drag is debounced
value.setCondition(condition);
app.execute();
```

State it touches: Predicate: one number condition on a field. Which handles show, and where they sit, is renderer state.

## Notes

- `orders.order_value` is declared once in the Dataset; the slider only sets the operator and values

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<style>
		.rs { position: relative; height: 32px; margin: 0 2px; }
		.rs .tr { position: absolute; left: 8px; right: 8px; top: 14px; height: 4px; border-radius: 2px; background: var(--sunken); }
		.rs .fl { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: var(--violet); }
		.rs input { position: absolute; left: 0; width: 100%; top: 8px; height: 16px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
		.rs input[hidden] { display: none; }
		.rs input::-webkit-slider-runnable-track { background: none; height: 16px; }
		.rs input::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid var(--violet); box-shadow: 0 1px 3px rgb(24 20 31 / 0.2); cursor: grab; }
		.rs input::-moz-range-thumb { pointer-events: auto; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid var(--violet); cursor: grab; }
		.rs input:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--violet); outline-offset: 2px; }
		.ends { display: flex; justify-content: space-between; font-size: 12px; line-height: 16px; color: var(--muted); }
		.nums { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
		.nums label[hidden] { display: none; }
		.nums input { width: 96px; }
		.cond { font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--violet-ink); }
		.cols2 { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 12px; }
	</style>
	<div class="app">
		<div class="panel"><div class="ph"><b>Order value</b><span class="seg" id="modes"></span></div>
			<div class="rs" id="rs"><div class="tr"><span class="fl" id="fl"></span></div><input type="range" id="lo" min="0" max="5500" step="50" value="500" aria-label="Lowest order value"><input type="range" id="hi" min="0" max="5500" step="50" value="2000" aria-label="Highest order value"></div>
			<div class="ends"><span>$0</span><span>$5,500</span></div>
			<div class="nums"><label id="loL">From $ <input type="number" id="loN" min="0" max="5500" step="50"></label><label id="hiL">To $ <input type="number" id="hiN" min="0" max="5500" step="50"></label><span class="cond" id="cond"></span></div>
		</div>
		<div class="cols2">
			<div class="panel"><div class="ph"><b>Orders in range</b><span class="status" id="s1"></span></div><div class="kpi" id="kOrders">–</div><div class="hint" id="kRev"></div></div>
			<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s2"></span></div><div id="bars"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'Range filter', timezone: 'Etc/UTC' });
const total = app.createQuery('total', { dataset: 'ecommerce', aql: 'explore { measures { num_orders: order_count, total_revenue: revenue } }' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const value = app.createFilter('orderValue', { dataset: 'ecommerce', field: 'orders.order_value', label: 'Order value' });
app.mapControl(value, total, { field: 'orders.order_value' });
app.mapControl(value, byCat, { field: 'orders.order_value' });
const MAX = 5500;
const MODES = [['two', 'Two handles'], ['min', 'One: over'], ['max', 'One: under']];
let mode = 'two', t = 0;
const lo = K.$('#lo'), hi = K.$('#hi'), loN = K.$('#loN'), hiN = K.$('#hiN');
const usd = (v) => '$' + K.int.format(v);
for (const [k, label] of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.m = k; b.onclick = () => { mode = k; sync(true); }; K.$('#modes').appendChild(b); }
// the handles can't cross: the one you move stops at the other
lo.oninput = () => { if (mode === 'two' && +lo.value > +hi.value) lo.value = hi.value; sync(); };
hi.oninput = () => { if (mode === 'two' && +hi.value < +lo.value) hi.value = lo.value; sync(); };
loN.onchange = () => { lo.value = Math.max(0, Math.min(+loN.value || 0, mode === 'two' ? +hi.value : MAX)); sync(true); };
hiN.onchange = () => { hi.value = Math.min(MAX, Math.max(+hiN.value || 0, mode === 'two' ? +lo.value : 0)); sync(true); };
function condition () {
	const a = +lo.value, b = +hi.value;
	if (mode === 'min') return a > 0 ? { operator: 'greater_than', values: [String(a)] } : null;
	if (mode === 'max') return b < MAX ? { operator: 'less_than', values: [String(b)] } : null;
	return a > 0 || b < MAX ? { operator: 'between', values: [String(a), String(b)] } : null;
}
function sync (now) {
	K.$('#modes').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
	lo.hidden = mode === 'max'; hi.hidden = mode === 'min';
	K.$('#loL').hidden = mode === 'max'; K.$('#hiL').hidden = mode === 'min';
	loN.value = lo.value; hiN.value = hi.value;
	const a = mode === 'max' ? 0 : +lo.value, b = mode === 'min' ? MAX : +hi.value;
	const fl = K.$('#fl'); fl.style.left = (a / MAX * 100) + '%'; fl.style.width = ((b - a) / MAX * 100) + '%';
	const c = condition();
	K.$('#cond').textContent = !c ? 'no filter: every order' : 'orders.order_value ' + (c.operator === 'between' ? 'between ' + c.values[0] + ' and ' + c.values[1] : (c.operator === 'greater_than' ? '> ' : '< ') + c.values[0]);
	clearTimeout(t);
	t = setTimeout(() => { if (c) value.setCondition(c); else value.reset(); app.execute(); }, now ? 0 : 250);
}
app.subscribe(() => {
	K.status(total, K.$('#s1')); K.status(byCat, K.$('#s2'));
	if (total.result && total.result.rows[0]) { const r = total.result.rows[0]; K.$('#kOrders').textContent = K.int.format(Number(r.num_orders)); K.$('#kRev').textContent = K.money.format(Number(r.total_revenue || 0)) + ' revenue'; }
	if (byCat.result) K.bars(K.$('#bars'), byCat.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue });
	K.sent(K.$('#sent'), app, [total, byCat]);
});
sync(true);
```

## Walkthrough on the gallery card

1. Read the slider: two handles keep orders worth **$500 to $2,000**, which is **589 orders** and $622,557
2. Drag the right handle to the end, then type **2000** in **From**: **205 orders**, with the condition `between 2000 and 5500`
3. Click **One: over**: only the left handle stays, the condition becomes `> 2000`, and the count drops to **195**, since the 10 orders of exactly $2,000 are left out
4. Click **One: under** and drag the handle: the charts follow, a quarter of a second after you stop

## Other Filters patterns

- [Field filter](field-filter.md): Pick values from a list, like Vietnam and Singapore, and every chart shows only those.
- [Widget filter](scope-vs-filter.md): A rule built into one chart, like "completed orders only", that viewers can't remove.
- [Filter group](compound-filter.md): Combine conditions with AND and OR, like (Vietnam and Software) or cancelled.
- [Metric filter](aggregate-filter.md): Filter on a total, like customers who spent more than $12k.
- [Text filter](text-search.md): Type part of a name to find matching rows, ignoring upper and lower case.
