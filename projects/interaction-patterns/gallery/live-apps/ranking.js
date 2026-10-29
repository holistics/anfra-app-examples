LIVE['ranking'] = {
	h: 460,
	html: `<style>.rk { display: inline-block; min-width: 28px; padding: 0 6px; border-radius: 999px; background: var(--sunken); text-align: center; font-weight: 500; } .rk.top { background: var(--violet); color: #fff; } #tbl .tw { max-height: 252px; } #tbl td { padding: 3px 6px; }</style>
	<div class="app">
		<div class="row"><label class="lbl" for="cat">Revenue from</label><select id="cat"><option value="">All categories</option></select><span class="chips"><button type="button" id="leaders" aria-pressed="false">Country leaders only</button></span></div>
		<div class="panel"><div class="ph"><b>Customer leaderboard</b><span class="status" id="s1"></span></div><div id="tbl"></div>
		<div class="hint" id="note"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Rank', timezone: 'Etc/UTC' });
const board = app.createQuery('leaderboard', { dataset: 'ecommerce', aql: 'explore { dimensions { customer_name: customers.name, country_name: customers.country } measures { total_revenue: revenue, overall_rank: rank(order: revenue | desc(), partition: []), rank_in_country: rank(order: revenue | desc(), partition: customers.country) } sorts { total_revenue desc } }' });
const cat = app.createFilter('category', { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
app.mapControl(cat, board, { field: 'products.category' });
const sel = K.$('#cat'), lead = K.$('#leaders');
cat.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) cat.setCondition({ operator: 'is', values: [sel.value] }); else cat.reset(); app.execute(); };
let leaders = false;
lead.onclick = () => { leaders = !leaders; lead.setAttribute('aria-pressed', String(leaders)); draw(); };
const badge = (v) => '<span class="rk' + (Number(v) === 1 ? ' top' : '') + '">' + v + '</span>';
function draw () {
	K.status(board, K.$('#s1'));
	K.sent(K.$('#sent'), app, [board], () => [leaders ? 'leaders only → rank_in_country = 1 (picked in the browser, not sent)' : null]);
	if (!board.result) return;
	const rows = board.result.rows.filter((r) => !leaders || Number(r.rank_in_country) === 1);
	let h = '<div class="tw"><table><thead><tr><th class="num">Overall</th><th>Customer</th><th>Country</th><th class="num">Revenue</th><th class="num">In country</th></tr></thead><tbody>';
	for (const r of rows) h += '<tr><td class="num">' + badge(r.overall_rank) + '</td><td>' + K.esc(r.customer_name) + '</td><td>' + K.esc(r.country_name) + '</td><td class="num">' + K.money.format(Number(r.total_revenue)) + '</td><td class="num">' + badge(r.rank_in_country) + '</td></tr>';
	K.$('#tbl').innerHTML = h + '</tbody></table></div>';
	K.$('#note').textContent = K.int.format(rows.length) + ' customers. Both ranks come from the query and follow the category filter';
}
app.subscribe(draw);
app.execute();`,
};
