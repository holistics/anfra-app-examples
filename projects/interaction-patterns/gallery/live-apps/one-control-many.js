LIVE['one-control-many'] = {
	h: 440,
	html: `<div class="app">
		<div class="row"><span class="lbl">Country</span><span class="chips" id="countries"></span></div>
		<div class="cols" style="grid-template-columns: 1.3fr 1fr">
		<div class="panel"><div class="ph"><b>Revenue · <span id="for">all countries</span></b><span class="tag on">follows Country</span></div>
			<div class="kpi" id="kpi">–</div><div class="hint" style="margin-bottom: 6px">KPI query <span class="status" id="s1"></span> · trend query <span class="status" id="s2"></span></div><div id="trend"></div></div>
		<div class="panel"><div class="ph"><b>Benchmark: all countries</b><span class="tag">not mapped</span></div><div id="bench"></div><div class="hint" style="margin-top: 6px">No mapping reaches it, so it never re-runs <span class="status" id="s3"></span></div></div></div>
		<div class="sent" id="sent"></div></div>
		<style>.ph { align-items: flex-start; } .tag { align-self: flex-start; font-size: 12px; line-height: 16px; padding: 0 6px; border-radius: 999px; border: 1px dashed var(--rule-strong); color: var(--muted); white-space: nowrap; } .tag.on { border: 1px solid var(--violet); color: var(--violet-ink); background: var(--violet-soft); } .hint .status { font-size: 12px; } .b { grid-template-columns: 84px minmax(0, 1fr) 48px; }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Filter mapping', timezone: 'Etc/UTC' });
const kpi = app.createQuery('kpi', { dataset: 'ecommerce', aql: 'explore { measures { total_revenue: revenue } }' });
const trend = app.createQuery('trend', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | month() } measures { total_revenue: revenue } sorts { period asc } }' });
const bench = app.createQuery('benchmark', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of [kpi, trend]) app.mapControl(country, q, { field: 'customers.country' });
let picked = null;
const runs = { kpi: 0, trend: 0, benchmark: 0 }, was = {};
const chips = K.$('#countries');
country.loadOptions().then((vals) => vals.forEach((v) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.dataset.v = v; b.onclick = () => { picked = picked === v ? null : v; if (picked) country.setCondition({ operator: 'is', values: [picked] }); else country.reset(); app.execute(); }; chips.appendChild(b); }));
const mon = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
app.subscribe(() => {
for (const q of [kpi, trend, bench]) { if (q.state === 'executing' && was[q.name] !== 'executing') runs[q.name]++; was[q.name] = q.state; }
chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === picked)));
K.status(kpi, K.$('#s1')); K.status(trend, K.$('#s2'));
K.$('#s3').textContent = '· ran ' + runs.benchmark + (runs.benchmark === 1 ? ' time' : ' times');
K.$('#for').textContent = picked || 'all countries';
if (kpi.result) K.$('#kpi').textContent = K.money.format(Number(kpi.result.rows[0]?.total_revenue || 0));
if (trend.result) K.columns(K.$('#trend'), trend.result.rows, { label: (r) => mon(r.period), value: (r) => r.total_revenue });
if (bench.result) K.bars(K.$('#bench'), bench.result.rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => r.country_name === picked });
K.sent(K.$('#sent'), app, [kpi, trend, bench], () => ['app.mappings → ' + app.mappings.map((e) => e.id).join(', ')]);
});
app.execute();`,
};
