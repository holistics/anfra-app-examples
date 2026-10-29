LIVE['field-filter'] = {
	h: 420,
	html: `<div class="app">
		<div class="row"><span class="lbl">Country</span><span class="chips" id="countries"></span></div>
		<div class="row"><label class="lbl" for="status">Status</label><select id="status"><option value="">Any status</option></select><span class="hint">Both filters reach the KPI and the trend</span></div>
		<div class="panel"><div class="ph"><b>Monthly revenue: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="legend"><span><i style="background:var(--violet)"></i>Filtered</span><span><i style="background:rgb(24 20 31 / 0.07)"></i>All orders</span></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Field filter', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }';
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const all = app.createQuery('allOrders', { dataset: 'ecommerce', aql: AQL });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
app.mapControl(country, trend, { field: 'customers.country' });
app.mapControl(status, trend, { field: 'orders.status' });
const picked = new Set();
const chips = K.$('#countries'), sel = K.$('#status');
const apply = () => { if (picked.size) country.setCondition({ operator: 'is', values: [...picked] }); else country.reset(); if (sel.value) status.setCondition({ operator: 'is', values: [sel.value] }); else status.reset(); app.execute(); };
country.loadOptions().then((vals) => vals.forEach((v) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.setAttribute('aria-pressed', 'false'); b.onclick = () => { picked.has(v) ? picked.delete(v) : picked.add(v); b.setAttribute('aria-pressed', String(picked.has(v))); apply(); }; chips.appendChild(b); }));
status.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v[0].toUpperCase() + v.slice(1), v))));
sel.onchange = apply;
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
K.status(trend, K.$('#s1'));
if (!trend.result) return;
const ghost = new Map((all.result?.rows || []).map((r) => [r.period, r.total_revenue]));
K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
const rows = all.result ? all.result.rows.map((r) => trend.result.rows.find((x) => x.period === r.period) || { period: r.period, total_revenue: 0 }) : trend.result.rows;
K.columns(K.$('#trend'), rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue, ghost: (r) => ghost.get(r.period) });
K.sent(K.$('#sent'), app, [trend]);
});
app.execute();`,
};
