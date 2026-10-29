# What-if parameter

> Try a price change, like +10% on Software, and watch revenue change.

- Pattern id: `what-if`
- Category: Scenarios & analyses
- Status: Works with app code: anfra supplies the queries, the app adds some logic
- Gallery card with a live demo: https://anfra.ai/interaction-patterns/interaction-gallery.html#what-if
- Full Data App: https://demo.anfra.ai/apps/patterns/what-if-parameter
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader picks the **Optimistic** preset (Software +10%, Services +5%), drags **Hardware** up, then tries **Price war**. Scenario revenue moves against actual by category and by month: Optimistic is $1,327,669 against $1,283,053 actual, +3.5%.

Why: Readers plan by asking "what if?". Answering in the app saves building a spreadsheet.

## What to build

Moving a slider changes one assumption, and the scenario recalculates from it next to the unchanged actual.

Layout: Actual vs scenario bars, with the delta.

Instruction: Let the reader change an assumption, like a price change, and see the scenario next to the actual result.

Done when: The scenario and the actual show side by side, and setting every slider back to zero makes them match.

On the ecommerce sample: Optimistic (Software +10%, Services +5%) lifts those two scenario bars above actual, and setting every slider to 0% brings the total back to $1,283,053.

## AQL

Ran on anfra 0.8.0 against `ecommerce`. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.

```aql
dimension products.price_factor = case(when: products.category == 'Hardware', then: 1.10, when: products.category == 'Software', then: 1.05, else: 1);
dimension products.volume_factor = case(when: products.category == 'Hardware', then: 0.88, when: products.category == 'Software', then: 0.94, else: 1);
metric scenario_revenue = order_items | sum(order_items.quantity * products.price * products.price_factor * products.volume_factor);
explore {
  dimensions { category: products.category }
  measures { total_revenue: revenue, scenario: scenario_revenue }
  sorts { total_revenue desc }
}
```

Saved result:

| category | total_revenue | scenario |
|---|---|---|
| Services | 578000.00 | 578000.000000 |
| Software | 497394.00 | 490927.878000 |
| Hardware | 193999.60 | 187791.612800 |
| Parts | 13659.35 | 13659.350000 |

The recording is the real Data App `apps/patterns/what-if-parameter.html`. Each change rebuilds this query from validated numbers (price factor and volume factor per category), because anfra 0.8.0 has no query parameters. The query above is one example parameter set.

## SDK wiring

```js
// a number from a slider, validated
function scenario(upliftPct) {
  const f = (1 + Number(upliftPct) / 100).toFixed(4);
  prev?.abort();
  prev = app.createQuery('s' + ++n, {
    dataset: 'ecommerce',
    aql: WHATIF_AQL.replace('1.10', f),
  });
  return app.execute();
}
// Proposed: aql with $uplift and app.createParameter('uplift', {
// type: 'number' })
```

## Notes

- A scenario metric sits next to the real one, and both go through the same joins
- Limits: Works with app code. Typed query parameters (`createParameter`) are proposed, so the AQL wouldn't have to be rebuilt.

## Complete working example

The live demo's source: a small Data App the gallery mounts with `mountDataApp`. `Anfra` is the SDK global. `K` is the gallery's drawing kit (`K.bars`, `K.columns`, `K.table`, `K.status`, `K.sent`, formatters): replace it with your own rendering. The SDK calls are the part to copy.

HTML body:

```html
<div class="app"><style>#presets button { padding: 0 8px; }</style>
		<div class="cols" style="grid-template-columns: 236px 1fr">
			<div class="panel" style="display:grid;gap:8px;align-content:start">
				<div class="lbl">Preset</div>
				<div class="chips" id="presets"><button type="button" data-p="base">Base</button><button type="button" data-p="optimistic">Optimistic</button><button type="button" data-p="pricewar">Price war</button></div>
				<div class="lbl">Price change by category</div>
				<div id="sliders" style="display:grid;gap:2px"></div>
				<div style="display:grid;grid-template-columns:1fr auto;font-size:12px;line-height:16px"><label for="el">Units fall per +1% price</label><output id="elo"></output><input id="el" type="range" min="0" max="2" step="0.1" style="grid-column:1 / -1"></div>
			</div>
			<div class="panel"><div class="ph"><b>Revenue: actual vs scenario</b><span class="status" id="s1"></span></div>
				<div class="row" style="gap:16px;margin-bottom:6px"><div><div class="lbl">Actual</div><div class="kpi" id="ka">–</div></div><div><div class="lbl">Scenario</div><div class="kpi" id="ks" style="color:var(--violet-ink)">–</div></div></div><div class="hint" id="kd" style="margin-bottom:6px"></div>
				<div id="cats"></div>
				<div class="legend" style="margin-top:6px"><span><i style="background:rgb(24 20 31 / 0.14)"></i>Actual</span><span><i style="background:var(--violet)"></i>Scenario</span></div>
			</div>
		</div>
		<div class="hint">App code: each change declares a new query, built only from validated numbers</div>
		<div class="sent" id="sent"></div></div>
```

Script:

```js
const app = Anfra.createApp({ title: 'What-if parameter', timezone: 'Etc/UTC' });
const CATS = ['Services', 'Software', 'Hardware', 'Parts'];
const PRESETS = {
	base: { price: { Services: 0, Software: 0, Hardware: 0, Parts: 0 }, el: 0.6 },
	optimistic: { price: { Services: 5, Software: 10, Hardware: 0, Parts: 0 }, el: 0.4 },
	pricewar: { price: { Services: 0, Software: -5, Hardware: -10, Parts: -10 }, el: 1.2 },
};
let params = JSON.parse(JSON.stringify(PRESETS.base)), preset = 'base';
const sl = K.$('#sliders');
for (const c of CATS) {
	const d = document.createElement('div');
	d.style.cssText = 'display:grid;grid-template-columns:62px minmax(0,1fr) 36px;gap:4px;align-items:center;font-size:12px;line-height:16px';
	d.innerHTML = '<label for="p-' + c + '">' + c + '</label><input id="p-' + c + '" type="range" min="-20" max="30" step="1" style="width:100%"><output id="o-' + c + '" style="text-align:right"></output>';
	sl.appendChild(d);
	d.querySelector('input').oninput = (e) => { params.price[c] = Number(e.target.value); preset = null; schedule(); };
}
K.$('#el').oninput = (e) => { params.el = Number(e.target.value); preset = null; schedule(); };
K.$('#presets').querySelectorAll('button').forEach((b) => { b.onclick = () => { params = JSON.parse(JSON.stringify(PRESETS[b.dataset.p])); preset = b.dataset.p; schedule(0); }; });
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
function syncInputs () {
	for (const c of CATS) { K.$('#p-' + c).value = params.price[c]; K.$('#o-' + c).textContent = sign(params.price[c]); }
	K.$('#el').value = params.el; K.$('#elo').textContent = params.el.toFixed(1) + '%';
	K.$('#presets').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === preset)));
}
const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('bad parameter'); return Math.min(hi, Math.max(lo, n)); };
function aql () {
	const e = num(params.el, 0, 2);
	const p = CATS.map((c) => [c, num(params.price[c], -20, 30) / 100]);
	const pf = p.map((x) => 'when: products.category == \'' + x[0] + '\', then: ' + (1 + x[1]).toFixed(4)).join(', ');
	const vf = p.map((x) => 'when: products.category == \'' + x[0] + '\', then: ' + Math.max(0, 1 - e * x[1]).toFixed(4)).join(', ');
	return 'dimension products.price_factor = case(' + pf + ', else: 1);\ndimension products.volume_factor = case(' + vf + ', else: 1);\nmetric scenario_revenue = order_items | sum(order_items.quantity * products.price * products.price_factor * products.volume_factor);\nexplore {\n  dimensions { category_name: products.category }\n  measures { total_revenue: revenue, scenario: scenario_revenue }\n  sorts { total_revenue desc }\n}';
}
let n = 0, cur = null, timer = null;
function schedule (wait) { syncInputs(); clearTimeout(timer); timer = setTimeout(run, wait == null ? 250 : wait); }
function run () {
	if (cur) cur.abort();
	cur = app.createQuery('scenario' + (++n), { dataset: 'ecommerce', aql: aql() });
	app.execute(); draw();
}
function draw () {
	if (!cur) return;
	K.status(cur, K.$('#s1'));
	if (cur.result) {
		const rows = cur.result.rows;
		const a = rows.reduce((t, r) => t + Number(r.total_revenue), 0), s = rows.reduce((t, r) => t + Number(r.scenario), 0);
		K.$('#ka').textContent = K.money.format(a); K.$('#ks').textContent = K.money.format(s);
		K.$('#kd').innerHTML = 'Change: <b style="color:' + (s >= a ? 'var(--violet-ink)' : '#b42318') + '">' + (s >= a ? '+' : '−') + K.money.format(Math.abs(s - a)) + ' (' + (s >= a ? '+' : '−') + (Math.abs(s - a) / a * 100).toFixed(1) + '%)</b>';
		const max = Math.max(...rows.map((r) => Math.max(Number(r.total_revenue), Number(r.scenario))), 1);
		K.$('#cats').innerHTML = rows.map((r) => { const ac = Number(r.total_revenue), sc = Number(r.scenario), d = sc - ac;
			return '<div style="display:grid;grid-template-columns:62px minmax(0,1fr) 64px;gap:6px;align-items:center;font-size:12px;line-height:16px;margin:3px 0"><span>' + K.esc(r.category_name) + '</span>'
				+ '<span style="display:grid;gap:2px"><span style="height:8px;border-radius:2px;background:rgb(24 20 31 / 0.14);width:' + (ac / max * 100) + '%"></span><span style="height:8px;border-radius:2px;background:var(--violet);width:' + (sc / max * 100) + '%;transition:width 320ms"></span></span>'
				+ '<span style="text-align:right;font-variant-numeric:tabular-nums;color:' + (d < 0 ? '#b42318' : 'var(--violet-ink)') + '">' + (d >= 0 ? '+' : '−') + K.compact.format(Math.abs(d)) + '</span></div>'; }).join('');
	}
	K.sent(K.$('#sent'), app, [cur], () => [cur.name + ' (query #' + n + ', declared per change) ← price % ' + CATS.map((c) => c + ' ' + params.price[c]).join(', ') + '; units fall ' + params.el.toFixed(1) + '% per +1%']);
}
app.subscribe(draw);
schedule(0);
```

## Walkthrough on the gallery card

1. Click **Optimistic** under **Preset**: Software +10%, Services +5%
2. Read the totals: **Scenario** $1,327,669 against **Actual** $1,283,053, a +3.5% change
3. Drag the **Hardware** slider up and watch its bar and the totals move
4. Click **Price war** and compare each category's scenario bar with actual

## Other Scenarios & analyses patterns

- [Binning](bins.md): Group orders into size bands, like under $100 or over $1,000.
- [Reference line](targets.md): Draw a target line and show how far each month is above or below it.
- [Trend line](trend-line.md): Draw the line of best fit through a chart, to show which way it is heading.
- [Rule-based cohort](cohort-from-rank.md): Define a group by a rule, like the top 10% of customers by revenue.
