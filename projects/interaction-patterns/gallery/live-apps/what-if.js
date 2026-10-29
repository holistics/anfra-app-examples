LIVE['what-if'] = {
	h: 470,
	html: `<div class="app"><style>#presets button { padding: 0 8px; }</style>
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
		<div class="sent" id="sent"></div></div>`,
	js: `
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
	const pf = p.map((x) => 'when: products.category == \\'' + x[0] + '\\', then: ' + (1 + x[1]).toFixed(4)).join(', ');
	const vf = p.map((x) => 'when: products.category == \\'' + x[0] + '\\', then: ' + Math.max(0, 1 - e * x[1]).toFixed(4)).join(', ');
	return 'dimension products.price_factor = case(' + pf + ', else: 1);\\ndimension products.volume_factor = case(' + vf + ', else: 1);\\nmetric scenario_revenue = order_items | sum(order_items.quantity * products.price * products.price_factor * products.volume_factor);\\nexplore {\\n  dimensions { category_name: products.category }\\n  measures { total_revenue: revenue, scenario: scenario_revenue }\\n  sorts { total_revenue desc }\\n}';
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
schedule(0);`,
};
