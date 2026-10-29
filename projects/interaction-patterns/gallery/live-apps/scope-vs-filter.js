LIVE['scope-vs-filter'] = {
	h: 410,
	html: `<div class="app">
		<div class="row"><span class="lock" title="Part of the query: no reader control can remove it">🔒 Completed orders only</span><label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select><button type="button" id="reset">Reset filters</button></div>
		<div class="panel"><div class="ph"><b>Completed revenue<span id="for"></span>: <span id="kpi">–</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint">Reset clears the country. The lock is in the AQL filters block, so it stays</div></div>
		<div class="sent" id="sent"></div></div>
		<style>.lock { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; background: var(--sunken); border: 1px dashed var(--rule-strong); color: var(--weak); cursor: not-allowed; }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Widget filter', timezone: 'Etc/UTC' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } filters { orders.status == \\'completed\\' } sorts { period asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
app.mapControl(country, trend, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
K.$('#reset').onclick = () => { country.reset(); sel.value = ''; app.execute(); };
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
K.status(trend, K.$('#s1'));
const c = country.appliedCondition;
K.$('#for').textContent = c && c.values && c.values.length ? ' · ' + c.values.join(', ') : ' · all countries';
if (trend.result) {
	K.$('#kpi').textContent = K.compact.format(trend.result.rows.reduce((t, r) => t + Number(r.total_revenue), 0));
	K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
}
K.sent(K.$('#sent'), app, [trend], () => ['scope (in the AQL, not reader input) → orders.status == \\'completed\\'']);
});
app.execute();`,
};
