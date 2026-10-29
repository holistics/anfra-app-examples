LIVE['targets'] = {
	h: 400,
	html: `<div class="app">
		<div class="row"><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><span class="hint">The target is a metric, so the filter reaches it too</span></div>
		<div class="panel"><div class="ph"><b>Revenue 2026 vs target<span id="for"></span></b><span class="status" id="s1"></span></div>
		<div id="chart"></div>
		<div class="legend"><span><i style="background:var(--violet)"></i>Beat the target</span><span><i style="background:var(--violet-faint)"></i>Below it</span><span><i style="background:none;border-top:2px dashed var(--ink);height:0;border-radius:0"></i><span id="tl">Monthly target</span></span></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Reference line', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue, target: monthly_target, attainment: revenue * 1.0 / monthly_target } filters { orders.ordered_at matches @(2026) } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, trend, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
const pct = (v) => Math.round(v * 100) + '%';
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
function chart (el, rows) {
	const tgt = Math.max(...rows.map((r) => Number(r.target)), 0);
	const max = Math.max(tgt, ...rows.map((r) => Number(r.total_revenue))) * 1.15 || 1;
	const cols = rows.map((r) => { const v = Number(r.total_revenue), a = Number(r.attainment), hit = a >= 1;
		return '<div style="flex:1;position:relative;height:100%" title="' + mon(r.period) + ': ' + K.money.format(v) + ' of ' + K.money.format(Number(r.target)) + ' (' + pct(a) + ')">'
			+ '<span style="position:absolute;left:12%;right:12%;bottom:0;height:' + (v / max * 100) + '%;background:' + (hit ? 'var(--violet)' : 'var(--violet-faint)') + ';border-radius:3px 3px 0 0;transition:height 320ms"></span>'
			+ '</div>'; }).join('');
	el.innerHTML = '<div style="position:relative;height:150px;display:flex;gap:4px;align-items:flex-end">' + cols
		+ '<div style="position:absolute;left:0;right:0;bottom:' + (tgt / max * 100) + '%;border-top:2px dashed var(--ink);pointer-events:none"></div></div>'
		+ '<div style="display:flex;gap:4px;font-size:12px;line-height:16px;color:var(--muted);margin-top:4px">' + rows.map((r) => { const a = Number(r.attainment); return '<span style="flex:1;text-align:center">' + mon(r.period) + '<br><b style="font-weight:' + (a >= 1 ? '600;color:var(--violet-ink)' : '400') + '">' + pct(a) + '</b></span>'; }).join('') + '</div>';
}
app.subscribe(() => {
	K.status(trend, K.$('#s1'));
	const c = country.appliedCondition && country.appliedCondition.values && country.appliedCondition.values[0];
	K.$('#for').textContent = c ? ' · ' + c : ' · all countries';
	if (trend.result) {
		const rows = trend.result.rows;
		chart(K.$('#chart'), rows);
		const hits = rows.filter((r) => Number(r.attainment) >= 1).length;
		K.$('#tl').textContent = 'Monthly target ' + K.compact.format(Number(rows[0] ? rows[0].target : 0)) + ' · ' + hits + ' of ' + rows.length + ' months beat it';
	}
	K.sent(K.$('#sent'), app, [trend]);
});
app.execute();`,
};
