LIVE['single-select'] = {
	h: 470,
	html: `<div class="app">
		<style>
		.heat { display: grid; grid-template-columns: 74px repeat(6, minmax(0, 1fr)); gap: 2px; font-size: 12px; line-height: 16px; }
		.heat .rl { color: var(--weak); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; align-self: center; }
		.heat .cl { color: var(--muted); text-align: center; }
		.heat button.cell { height: 28px; padding: 0; border: 1px solid transparent; border-radius: 4px; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--ink); }
		.heat button.cell[aria-pressed='true'] { border: 2px solid var(--violet-ink); color: var(--violet-ink); font-weight: 600; }
		.heat.some button.cell[aria-pressed='false'] { opacity: 0.45; }
		#bycat .b { grid-template-columns: 64px minmax(0, 1fr) 52px; }
		#v-bars[hidden], #v-cells[hidden] { display: none; }
		</style>
		<div class="row"><span class="lbl">Click a</span><span class="seg" id="mode"><button type="button" data-m="bars">Country bar</button><button type="button" data-m="cells">Heatmap cell</button></span><span class="hint" id="hint"></span><button type="button" id="clear" hidden>Clear</button></div>
		<div id="v-bars" class="cols" style="grid-template-columns: 1fr 1.3fr"><div class="panel"><div class="ph"><b>Revenue by country</b><span class="status" id="s1"></span></div><div id="bycountry"></div></div>
		<div class="panel"><div class="ph"><b>Monthly revenue: <span id="kpi1">–</span></b><span class="status" id="s2"></span></div><div class="hint" id="for">All countries</div><div id="trend"></div></div></div>
		<div id="v-cells" class="cols" style="grid-template-columns: 1.55fr 1fr" hidden><div class="panel"><div class="ph"><b>Revenue: country × month, 2026</b><span class="status" id="s3"></span></div><div class="heat" id="heat"></div></div>
		<div class="panel"><div class="ph"><b>By category</b><span class="status" id="s4"></span></div><div class="kpi" id="kpi">–</div><div class="hint" id="cfor">All cells</div><div id="bycat" style="margin-top:6px"></div></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Cross-filtering', timezone: 'Etc/UTC' });
// bars: the picked countries cross-filter the trend
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }';
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const all = app.createQuery('allCountries', { dataset: 'ecommerce', aql: AQL });
app.mapCrossFilter(byCountry, trend);
// a heatmap cell: a country-month pair cross-filters the categories
const heat = app.createQuery('heat', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country, period: orders.ordered_at } measures { total_revenue: revenue } filters { orders.ordered_at matches @(2026-01-01 until 2026-07-01) } }' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } filters { orders.ordered_at matches @(2026-01-01 until 2026-07-01) } }' });
const grain = app.createDateDrill('grain', { default: 'month', label: 'Grain' });
app.mapControl(grain, heat, { field: 'orders.ordered_at' });
app.mapCrossFilter(heat, byCategory);
let mode = 'bars';
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const mon1 = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const key = (r) => r.country_name + '|' + String(r.period).slice(0, 10);
const HINT = { bars: 'Click countries to add them, click one again to remove it', cells: 'Click cells to pick exact country-month pairs, click again to remove one' };
// one live selection per app, so switching the source clears it
K.$('#mode').querySelectorAll('button').forEach((b) => b.onclick = () => { if (mode === b.dataset.m) return; mode = b.dataset.m; app.clearSelection(); app.execute(); render(); });
K.$('#clear').onclick = () => { app.clearSelection(); app.execute(); };
function toggle (r) {
	const s = heat.selectedRows; const has = s.some((x) => key(x) === key(r));
	const next = has ? s.filter((x) => key(x) !== key(r)) : [...s, r];
	if (next.length) heat.select(next); else app.clearSelection();
	app.execute();
}
function drawHeat (rows) {
	const el = K.$('#heat'); const sel = new Set(heat.selectedRows.map(key));
	const countries = [...new Set(rows.map((r) => r.country_name))].sort();
	const months = [...new Set(rows.map((r) => String(r.period).slice(0, 10)))].sort();
	const at = new Map(rows.map((r) => [key(r), r]));
	const max = Math.max(...rows.map((r) => Number(r.total_revenue)), 1);
	el.className = 'heat' + (sel.size ? ' some' : '');
	el.replaceChildren();
	const add = (n) => el.appendChild(n);
	const div = (cls, t) => { const d = document.createElement('div'); d.className = cls; d.textContent = t; return d; };
	add(div('cl', ''));
	months.forEach((m) => add(div('cl', mon1(m))));
	countries.forEach((c) => {
		add(div('rl', c));
		months.forEach((m) => {
			const r = at.get(c + '|' + m); const b = document.createElement('button'); b.type = 'button'; b.className = 'cell';
			if (!r) { b.disabled = true; add(b); return; }
			const v = Number(r.total_revenue); const a = 0.08 + 0.72 * v / max;
			b.style.background = 'rgb(138 81 212 / ' + a.toFixed(2) + ')'; if (a > 0.62) b.style.color = '#fff';
			b.textContent = Math.round(v / 1000) + 'k';
			b.title = c + ', ' + mon1(m) + ' 2026: ' + K.money.format(v);
			b.setAttribute('aria-label', c + ' ' + mon1(m) + ' 2026 ' + K.money.format(v));
			b.setAttribute('aria-pressed', String(sel.has(key(r))));
			b.onclick = () => toggle(r);
			add(b);
		});
	});
}
// the mode switch redraws on its own: with nothing selected, no query re-runs
function render () {
K.$('#mode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
K.$('#v-bars').hidden = mode !== 'bars'; K.$('#v-cells').hidden = mode !== 'cells';
K.$('#hint').textContent = HINT[mode];
if (mode === 'bars') {
	const names = byCountry.selectedRows.map((r) => r.country_name);
	K.$('#clear').hidden = !names.length;
	K.status(byCountry, K.$('#s1')); K.status(trend, K.$('#s2'));
	if (byCountry.result) K.bars(K.$('#bycountry'), byCountry.result.rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => names.includes(r.country_name),
		pick: (r) => { const s = byCountry.selectedRows; const has = s.some((x) => x.country_name === r.country_name); const next = has ? s.filter((x) => x.country_name !== r.country_name) : [...s, r]; if (next.length) byCountry.select(next); else app.clearSelection(); app.execute(); } });
	K.$('#for').textContent = names.length ? names.join(' + ') : 'All countries';
	const ghost = new Map((all.result?.rows || []).map((r) => [r.period, r.total_revenue]));
	if (trend.result) { K.$('#kpi1').textContent = K.money.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
		K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue, ghost: names.length ? (r) => ghost.get(r.period) : null }); }
	K.sent(K.$('#sent'), app, [trend]);
} else {
	const s = heat.selectedRows;
	K.$('#clear').hidden = !s.length;
	K.status(heat, K.$('#s3')); K.status(byCategory, K.$('#s4'));
	K.$('#cfor').textContent = s.length ? s.map((r) => '(' + r.country_name + ', ' + mon1(r.period) + ')').join(' OR ') : 'All cells, Jan–Jun 2026';
	if (heat.result) drawHeat(heat.result.rows);
	if (byCategory.result) { K.$('#kpi').textContent = K.money.format(byCategory.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
		K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue }); }
	K.sent(K.$('#sent'), app, [byCategory]);
}
}
app.subscribe(render);
app.execute();`,
};
