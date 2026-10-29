LIVE['dimension-switch'] = {
	h: 340,
	html: `<div class="app">
		<div class="row"><label class="lbl" for="gb">Group by</label><select id="gb"></select><label class="lbl" for="ct">Country</label><select id="ct"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="by">country</span></b><span class="status" id="s1"></span></div><div id="bars"></div></div>
		<div class="hint">One query per option, declared up front with the same alias, so one renderer draws them all</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Dynamic dimension', timezone: 'Etc/UTC' });
const DIMS = [{ id: 'country', label: 'Country', ref: 'customers.country' }, { id: 'category', label: 'Category', ref: 'products.category' }, { id: 'status', label: 'Status', ref: 'orders.status' }];
const aqlFor = (ref) => 'explore { dimensions { key: ' + ref + ' } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const by = Object.fromEntries(DIMS.map((d) => [d.id, app.createQuery('by_' + d.id, { dataset: 'ecommerce', aql: aqlFor(d.ref) })]));
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of Object.values(by)) app.mapControl(country, q, { field: 'customers.country' });
const gb = K.$('#gb'), ct = K.$('#ct');
DIMS.forEach((d) => gb.add(new Option(d.label, d.id)));
country.loadOptions().then((vals) => vals.forEach((v) => ct.add(new Option(v, v))));
let active = by.country, ran = '';
gb.onchange = () => { active = by[gb.value]; const stale = active.isDirty || !active.result; ran = stale ? 'execute() ran ' + active.name : 'execute() skipped ' + active.name + ': already fresh'; draw(); app.execute(); };
ct.onchange = () => { if (ct.value) country.setCondition({ operator: 'is', values: [ct.value] }); else country.reset(); ran = ''; app.execute(); };
function draw () {
K.status(active, K.$('#s1'));
K.$('#by').textContent = DIMS.find((d) => by[d.id] === active).label.toLowerCase();
if (active.result) K.bars(K.$('#bars'), active.result.rows, { label: (r) => r.key, value: (r) => r.total_revenue, fmt: (v) => K.money.format(v) });
K.sent(K.$('#sent'), app, [active], () => ['showing ' + active.name + ' (alias key)', ran || null]);
}
app.subscribe(draw);
app.execute();`,
};
