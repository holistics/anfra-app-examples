LIVE['undo-redo'] = {
	h: 440,
	html: `<div class="app">
		<div class="row"><select id="country" aria-label="Country"><option value="">All countries</option></select><span class="seg" id="grain"><button type="button" data-g="month">Month</button><button type="button" data-g="week">Week</button></span><span style="flex:1"></span><button type="button" id="undo" title="Ctrl+Z">↶ Undo</button><button type="button" id="redo" title="Ctrl+Shift+Z">↷ Redo</button></div>
		<div class="cols" style="grid-template-columns: 1fr 1.4fr">
			<div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s1"></span></div><div id="cats"></div><div class="hint" style="margin-top:4px">Click a category to select it</div></div>
			<div class="panel"><div class="ph"><b>Revenue<span id="for"></span></b><span class="status" id="s2"></span></div><div id="trend"></div></div>
		</div>
		<div class="panel" style="padding:6px 10px"><div class="ph" style="margin-bottom:4px"><b>History</b><span>Click a step to jump to it</span></div><div class="chips" id="hist"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Undo / redo', timezone: 'Etc/UTC' });
const byCat = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at } measures { total_revenue: revenue } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(country, byCat, { field: 'customers.country' });
app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(grain, trend, { field: 'orders.ordered_at' });
app.mapCrossFilter(byCat, trend);
const $c = K.$('#country');
country.loadOptions().then((vals) => { vals.forEach((v) => $c.add(new Option(v, v))); sync(); });

// a snapshot is the reader's input only: each control's condition, the selection, the time zone
function snapshot (label) {
	return { label, controls: Object.fromEntries(Object.entries(app.controls).map(([k, c]) => [k, c.condition])), selection: app.selection ? { source: app.selection.source, rows: app.selection.rows.slice() } : null, timezone: app.timezone };
}
function restore (s) {
	for (const [k, c] of Object.entries(s.controls)) if (c && c.values && c.values.length) app.controls[k].setCondition(c); else app.controls[k].reset();
	if (s.selection) app.queries[s.selection.source].select(s.selection.rows); else app.clearSelection();
	app.setTimezone(s.timezone);
	return app.execute();
}
const hist = [], pos = { i: -1 };
function commit (label) { hist.splice(pos.i + 1); hist.push(snapshot(label)); pos.i = hist.length - 1; app.execute(); draw(); }
function go (i) { if (i < 0 || i >= hist.length || i === pos.i) return; pos.i = i; restore(hist[i]); draw(); }
K.$('#undo').onclick = () => go(pos.i - 1);
K.$('#redo').onclick = () => go(pos.i + 1);
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); go(e.shiftKey ? pos.i + 1 : pos.i - 1); } });
$c.onchange = () => { if ($c.value) country.setCondition({ operator: 'is', values: [$c.value] }); else country.reset(); commit('Country = ' + ($c.value || 'All')); };
K.$('#grain').querySelectorAll('button').forEach((b) => { b.onclick = () => { grain.setGrain(b.dataset.g); commit('Grain = ' + b.dataset.g); }; });
const picked = () => (app.selection && app.selection.rows[0] ? app.selection.rows[0].category_name : null);
const gOf = () => { const c = grain.condition; return c && c.values && c.values.length ? String(c.values[0]).replace('datetrunc ', '') : 'month'; };
function sync () {
	const c = country.condition;
	$c.value = c && c.values && c.values.length ? c.values[0] : '';
	K.$('#grain').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === gOf())));
	K.$('#undo').disabled = pos.i <= 0; K.$('#redo').disabled = pos.i >= hist.length - 1;
	K.$('#undo').style.opacity = pos.i <= 0 ? 0.4 : 1; K.$('#redo').style.opacity = pos.i >= hist.length - 1 ? 0.4 : 1;
}
const fmt = (v) => { const x = new Date(v); return gOf() === 'month' ? x.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }); };
function draw () {
	sync();
	K.status(byCat, K.$('#s1')); K.status(trend, K.$('#s2'));
	const p = picked(), c = country.condition;
	K.$('#for').textContent = ' · ' + (c && c.values && c.values.length ? c.values[0] : 'all countries') + (p ? ' · ' + p : '') + ' · by ' + gOf();
	if (byCat.result) K.bars(K.$('#cats'), byCat.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue, on: (r) => r.category_name === p,
		pick: (r) => { if (p === r.category_name) { app.clearSelection(); commit('Selection cleared'); } else { byCat.select([r]); commit('Selected: ' + r.category_name); } } });
	if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => fmt(r.period), value: (r) => r.total_revenue });
	const h = K.$('#hist'); h.innerHTML = '';
	hist.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = i + ' · ' + s.label; b.setAttribute('aria-pressed', String(i === pos.i)); if (i > pos.i) b.style.opacity = 0.5; b.onclick = () => go(i); h.appendChild(b); });
	K.sent(K.$('#sent'), app, [trend], () => ['history → step ' + pos.i + ' of ' + (hist.length - 1) + (hist.length - 1 > pos.i ? ' (' + (hist.length - 1 - pos.i) + ' to redo)' : '') + '; undo replays input, never AQL']);
}
app.subscribe(draw);
hist.push(snapshot('Start')); pos.i = 0;
app.execute();`,
};
