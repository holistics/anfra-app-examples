LIVE['cohort-from-rank'] = {
	h: 450,
	html: `<div class="app"><style>#deciles .b { height: 19px; } #deciles { gap: 1px; }</style>
		<div class="row"><span class="lbl">Top customers by revenue</span><span class="seg" id="rules"><button type="button" data-k="1">10%</button><button type="button" data-k="2">20%</button><button type="button" data-k="5">50%</button></span><button type="button" id="save">Save as cohort</button></div>
		<div class="cols" style="grid-template-columns: 1fr 1.15fr">
			<div class="panel"><div class="ph"><b>Revenue by customer decile</b><span class="status" id="s1"></span></div><div id="deciles"></div></div>
			<div class="panel"><div class="ph"><b>Cohort vs everyone else</b><span class="status" id="s2"></span></div><div id="chip" class="chips" style="margin-bottom:6px"></div><div id="cmp"><div class="hint">Save a cohort to compare it with the other customers</div></div></div>
		</div>
		<div class="hint">App code: rank with ntile(10), then filter customers.id to the chosen deciles</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Rule-based cohort', timezone: 'Etc/UTC' });
const ranks = app.createQuery('deciles', { dataset: 'ecommerce', aql: 'explore { dimensions { cust_id: customers.id, cust_name: customers.name } measures { total_revenue: revenue, decile: ntile(10, order: revenue | desc(), partition: []) } sorts { total_revenue desc } }' });
const CMP = 'explore { measures { num_customers: count_distinct(orders.customer_id), total_revenue: revenue, num_orders: order_count, avg_order_value: aov } }';
const inside = app.createQuery('cohort', { dataset: 'ecommerce', aql: CMP });
const outside = app.createQuery('everyoneElse', { dataset: 'ecommerce', aql: CMP });
const inCohort = app.createFilter('inCohort', { dataset: 'ecommerce', field: 'customers.id', label: 'In cohort' });
const notInCohort = app.createFilter('notInCohort', { dataset: 'ecommerce', field: 'customers.id', label: 'Not in cohort' });
app.mapControl(inCohort, inside, { field: 'customers.id' });
app.mapControl(notInCohort, outside, { field: 'customers.id' });
let k = 1, saved = null;
const RULE = { 1: 'Top 10%', 2: 'Top 20%', 5: 'Top 50%' };
K.$('#rules').querySelectorAll('button').forEach((b) => { b.onclick = () => { k = Number(b.dataset.k); draw(); }; });
K.$('#save').onclick = () => {
	if (!ranks.result) return;
	const ids = ranks.result.rows.filter((r) => Number(r.decile) <= k).map((r) => String(r.cust_id));
	saved = { rule: RULE[k], k, n: ids.length };
	inCohort.setCondition({ operator: 'is', values: ids });
	notInCohort.setCondition({ operator: 'is_not', values: ids });
	app.execute();
};
function draw () {
	K.$('#rules').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.k) === k)));
	K.status(ranks, K.$('#s1'));
	if (ranks.result) {
		const by = new Map();
		for (const r of ranks.result.rows) { const d = Number(r.decile); const x = by.get(d) || { d, rev: 0, n: 0 }; x.rev += Number(r.total_revenue); x.n++; by.set(d, x); }
		const rows = [...by.values()].sort((a, b) => a.d - b.d);
		K.bars(K.$('#deciles'), rows, { label: (r) => 'Decile ' + r.d + ' · ' + r.n, value: (r) => r.rev, on: (r) => r.d <= k, pick: (r) => { k = r.d; draw(); } });
		const n = rows.filter((r) => r.d <= k).reduce((t, r) => t + r.n, 0);
		K.$('#save').textContent = 'Save as cohort (' + n + ')';
	}
	if (saved) {
		K.$('#chip').innerHTML = '<button type="button" aria-pressed="true" id="clr">Cohort: ' + K.esc(saved.rule) + ' (' + saved.n + ') ×</button>';
		K.$('#clr').onclick = () => { saved = null; inCohort.reset(); notInCohort.reset(); K.$('#chip').innerHTML = ''; K.$('#cmp').innerHTML = '<div class="hint">Save a cohort to compare it with the other customers</div>'; draw(); };
		K.status(inside, K.$('#s2'));
		if (inside.result && outside.result && inside.state === 'success' && outside.state === 'success') {
			const a = inside.result.rows[0] || {}, b = outside.result.rows[0] || {};
			const tot = Number(a.total_revenue || 0) + Number(b.total_revenue || 0);
			const rows = [
				{ m: 'Customers', a: K.int.format(a.num_customers), b: K.int.format(b.num_customers) },
				{ m: 'Revenue', a: K.money.format(a.total_revenue), b: K.money.format(b.total_revenue) },
				{ m: 'Revenue share', a: Math.round(a.total_revenue / tot * 100) + '%', b: Math.round(b.total_revenue / tot * 100) + '%' },
				{ m: 'Orders', a: K.int.format(a.num_orders), b: K.int.format(b.num_orders) },
				{ m: 'Avg order', a: K.money.format(a.avg_order_value), b: K.money.format(b.avg_order_value) },
			];
			K.table(K.$('#cmp'), [{ key: 'm', label: '' }, { key: 'a', label: 'Cohort', num: true }, { key: 'b', label: 'Everyone else', num: true }], rows);
		}
	} else K.$('#s2').textContent = '';
	const short = (q) => { const c = app.controls[q === inside ? 'inCohort' : 'notInCohort'].appliedCondition; return c && c.values && c.values.length ? q.name + ' ← customers.id ' + c.operator.replace('_', ' ') + ' [' + c.values.slice(0, 4).join(', ') + (c.values.length > 4 ? ', … ' + c.values.length + ' ids' : '') + ']' : q.name + ' ← no cohort yet'; };
	K.sent(K.$('#sent'), app, [ranks], () => [short(inside), short(outside)]);
}
app.subscribe(draw);
app.execute();`,
};
