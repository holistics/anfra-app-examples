LIVE['apply-button'] = {
	h: 470,
	html: `<div class="app">
		<div class="row"><select id="country" aria-label="Country"><option value="">All countries</option></select><select id="status" aria-label="Status"><option value="">Any status</option></select>
		<select id="dates" aria-label="Dates"><option value="">All dates</option><option value="2026-01-01|2026-12-31">2026</option><option value="2026-07-01|2026-09-30">Jul–Sep 2026</option></select></div>
		<div class="row"><button type="button" id="apply" class="go">Applied</button><button type="button" id="discard" hidden>Discard</button><span class="hint" id="pend">Change any filters: nothing runs until you press Apply</span></div>
		<div class="panel"><div class="ph"><b>Revenue: <span id="kpi">–</span> <span class="hint" id="note">showing the applied filters</span></b><span class="status" id="s1"></span></div><div id="trend"></div>
		<div class="hint" id="runs"></div></div>
		<div class="sent" id="sent"></div></div>
		<style>select.pend { border-style: dashed; border-color: var(--violet); background: var(--violet-faint); } .go:not(:disabled) { background: var(--violet); border-color: var(--violet); color: #fff; } .go:disabled { cursor: default; color: var(--muted); }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Apply button', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }';
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: AQL });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
const dates = app.createFilter('dates', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Dates' });
for (const q of [kpi, trend]) { app.mapControl(country, q, { field: 'customers.country' }); app.mapControl(status, q, { field: 'orders.status' }); app.mapControl(dates, q, { field: 'orders.ordered_at' }); }
const C = [[country, K.$('#country')], [status, K.$('#status')], [dates, K.$('#dates')]];
country.loadOptions().then((vals) => vals.forEach((v) => K.$('#country').add(new Option(v, v))));
status.loadOptions().then((vals) => vals.forEach((v) => K.$('#status').add(new Option(v[0].toUpperCase() + v.slice(1), v))));
const toCond = (ctl, v) => !v ? null : ctl === dates ? { operator: 'between', values: v.split('|') } : { operator: 'is', values: [v] };
const fromCond = (ctl, c) => !c || !c.values || !c.values.length ? '' : ctl === dates ? c.values.join('|') : String(c.values[0]);
C.forEach(([ctl, el]) => { el.onchange = () => { const c = toCond(ctl, el.value); if (c) ctl.setCondition(c); else ctl.reset(); }; });
K.$('#apply').onclick = () => app.execute();
K.$('#discard').onclick = () => C.forEach(([ctl, el]) => { const c = ctl.appliedCondition; if (c && c.values && c.values.length) ctl.setCondition(c); else ctl.reset(); el.value = fromCond(ctl, c); });
const runs = { kpi: 0, trend: 0 }, was = {};
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
for (const q of [kpi, trend]) { if (q.state === 'success' && was[q.name] !== 'success') runs[q.name]++; was[q.name] = q.state; }
const dirty = C.filter(([ctl]) => ctl.isDirty);
C.forEach(([ctl, el]) => el.classList.toggle('pend', ctl.isDirty));
const btn = K.$('#apply');
btn.disabled = !app.hasChanges;
btn.textContent = dirty.length ? 'Apply (' + dirty.length + ')' : 'Applied ✓';
K.$('#discard').hidden = !dirty.length;
K.$('#pend').textContent = dirty.length ? dirty.length + (dirty.length === 1 ? ' change' : ' changes') + ' waiting: the chart still shows the applied filters' : 'Change any filters: nothing runs until you press Apply';
K.status(trend, K.$('#s1'));
if (kpi.result) K.$('#kpi').textContent = K.compact.format(Number(kpi.result.rows[0]?.total_revenue || 0));
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
K.$('#runs').textContent = 'Runs so far: kpi ' + runs.kpi + ', trend ' + runs.trend;
K.sent(K.$('#sent'), app, [kpi, trend], () => [dirty.length ? 'pending, not sent → ' + dirty.map(([ctl]) => ctl.name + ' ' + (K.cond(ctl.condition) || 'cleared')).join('; ') : '']);
});
app.execute();`,
};
