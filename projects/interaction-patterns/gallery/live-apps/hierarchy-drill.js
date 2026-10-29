LIVE['hierarchy-drill'] = {
	h: 480,
	html: `<style>
	.crumbs { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; font-size: 12px; }
	.crumbs button { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
	.crumbs .sep { color: var(--muted); }
	.crumbs .here { font-weight: 600; padding: 0 6px; }
	.lv { max-height: 200px; overflow: auto; }
	.kp { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
	.kp > div { font-size: 12px; line-height: 16px; color: var(--muted); }
	#mini .colz { height: 96px; }
	</style>
	<div class="app">
		<div class="crumbs" id="crumbs"></div>
		<div class="cols" style="grid-template-columns: 1.25fr 1fr">
			<div class="panel"><div class="ph"><b id="title">Regions</b><span class="status" id="s1"></span></div><div class="lv"><div id="level"></div></div><div class="hint" id="lh"></div></div>
			<div class="panel"><div class="ph"><b>The path so far</b><span class="status" id="s2"></span></div>
				<div class="kp"><div>Revenue<div class="kpi" id="k1">–</div></div><div>Orders<div class="kpi" id="k2">–</div></div></div>
				<div class="lbl">Monthly revenue</div><div id="mini"></div></div>
		</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Drill down', timezone: 'Etc/UTC' });
const DS = 'ecommerce', M = 'measures { total_revenue: revenue, order_n: order_count }';
const byRegion = app.createQuery('byRegion', { dataset: DS, aql: 'explore { dimensions { key: markets.region } ' + M + ' sorts { total_revenue desc } }' });
const byCountry = app.createQuery('byCountry', { dataset: DS, aql: 'explore { dimensions { key: markets.name } ' + M + ' sorts { total_revenue desc } }' });
const byCustomer = app.createQuery('byCustomer', { dataset: DS, aql: 'explore { dimensions { key: customers.name, cid: customers.id } ' + M + ' sorts { total_revenue desc } }' });
const orders = app.createQuery('orders', { dataset: DS, pageSize: 25, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, order_status: orders.status } measures { total_revenue: revenue } sorts { ordered_on desc, order_id desc } }' });
const scope = app.createQuery('scope', { dataset: DS, aql: 'explore { ' + M + ' }' });
const scopeTrend = app.createQuery('scopeTrend', { dataset: DS, aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const L = [
	{ q: byRegion, f: app.createFilter('region', { dataset: DS, field: 'markets.region', label: 'Region' }), field: 'markets.region', name: 'Regions', val: (r) => r.key },
	{ q: byCountry, f: app.createFilter('country', { dataset: DS, field: 'markets.name', label: 'Country' }), field: 'markets.name', name: 'Countries', val: (r) => r.key },
	{ q: byCustomer, f: app.createFilter('customer', { dataset: DS, field: 'customers.id', label: 'Customer' }), field: 'customers.id', name: 'Customers', val: (r) => String(r.cid) },
	{ q: orders, f: null, name: 'Orders' },
];
// level i is filtered by every level above it; the KPIs and trend follow the whole path
L.forEach((lvl, i) => L.slice(0, i).forEach((up) => app.mapControl(up.f, lvl.q, { field: up.field })));
for (const q of [scope, scopeTrend]) for (const up of L.slice(0, 3)) app.mapControl(up.f, q, { field: up.field });
const path = []; // labels picked so far
let depth = 0;
function down (r) { const lvl = L[depth]; lvl.f.setCondition({ operator: 'is', values: [lvl.val(r)] }); path.push(r.key); depth++; app.execute(); }
function climb (i) { for (const l of L.slice(i, 3)) l.f.reset(); path.length = i; depth = i; app.execute(); }
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dd = (v) => new Date(String(v).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('Sept', 'Sep');
app.subscribe(() => {
const lvl = L[depth];
K.status(lvl.q, K.$('#s1')); K.status(scope, K.$('#s2'));
const cr = K.$('#crumbs'); cr.innerHTML = '';
['All regions'].concat(path).forEach((t, i) => {
	if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; cr.appendChild(s); }
	if (i === path.length) { const s = document.createElement('span'); s.className = 'here'; s.textContent = t; cr.appendChild(s); }
	else { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => climb(i); cr.appendChild(b); }
});
K.$('#title').textContent = lvl.name + (path.length ? (depth === 3 ? ' of ' : ' in ') + path[path.length - 1] : '');
if (lvl.q.result) {
	if (depth < 3) { K.bars(K.$('#level'), lvl.q.result.rows, { label: (r) => r.key, value: (r) => r.total_revenue, pick: (r) => down(r) }); K.$('#lh').textContent = 'Click a bar to drill in'; }
	else {
		K.table(K.$('#level'), [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: (v) => dd(v) }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], lvl.q.result.rows);
		K.$('#lh').textContent = 'Click a crumb above to climb back';
	}
}
if (scope.result) { const s = scope.result.rows[0] || {}; K.$('#k1').textContent = K.compact.format(Number(s.total_revenue || 0)); K.$('#k2').textContent = K.int.format(Number(s.order_n || 0)); }
if (scopeTrend.result) K.columns(K.$('#mini'), scopeTrend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
K.sent(K.$('#sent'), app, [lvl.q, scope], () => ['depth: ' + depth + ' of 3 (renderer state; the path is the filter conditions)']);
});
app.execute();`,
};
