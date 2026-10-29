LIVE['top-n'] = {
	h: 380,
	html: `<div class="app">
		<div class="row"><span class="lbl">Show</span><span class="seg" id="ns"></span><label class="lbl" for="status">Status</label><select id="status"><option value="">Any status</option></select></div>
		<div class="panel"><div class="ph"><b id="title">Revenue by country</b><span class="status" id="s1"></span></div><div id="bars"></div>
		<div class="hint" id="sum"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Top N & Others', timezone: 'Etc/UTC' });
const status = app.createFilter('status', { dataset: 'ecommerce', field: 'orders.status', label: 'Status' });
const MEASURES = ' measures { total_revenue: revenue, all_countries: revenue | exclude_grains(customers.country), n_countries: count_distinct(customers.country) | exclude_grains(customers.country) }';
// N is part of the AQL text, so each choice from the menu is its own query, declared the first time it is picked
const aqlFor = (n) => n ? 'metric top_countries = top(' + n + ', customers.country, by: revenue); explore { dimensions { country_name: customers.country }' + MEASURES + ' filters { customers.country in top_countries } sorts { total_revenue desc } }'
	: 'explore { dimensions { country_name: customers.country }' + MEASURES + ' sorts { total_revenue desc } }';
const Q = {};
const queryFor = (n) => { if (!Q[n]) { Q[n] = app.createQuery(n ? 'top' + n : 'allCountries', { dataset: 'ecommerce', aql: aqlFor(n) }); app.mapControl(status, Q[n], { field: 'orders.status' }); } return Q[n]; };
let n = 3, q = queryFor(3);
const seg = K.$('#ns'), sel = K.$('#status');
for (const x of [3, 5, 0]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x ? 'Top ' + x : 'All'; b.dataset.n = x; b.onclick = () => { n = x; q = queryFor(x); draw(); app.execute(); }; seg.appendChild(b); }
status.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v[0].toUpperCase() + v.slice(1), v))));
sel.onchange = () => { if (sel.value) status.setCondition({ operator: 'is', values: [sel.value] }); else status.reset(); app.execute(); };
function draw () {
	seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)));
	K.status(q, K.$('#s1'));
	K.$('#title').textContent = n ? 'Top ' + n + ' countries by revenue, and Other' : 'Revenue, all countries';
	if (q.result && q.result.rows.length) {
		const rows = q.result.rows.map((r) => ({ name: r.country_name, v: Number(r.total_revenue) }));
		const total = Number(q.result.rows[0].all_countries), rest = Number(q.result.rows[0].n_countries) - rows.length;
		const shown = rows.reduce((t, r) => t + r.v, 0);
		if (n && rest > 0) rows.push({ name: 'Other (' + rest + ')', v: total - shown, other: true });
		K.bars(K.$('#bars'), rows, { label: (r) => r.name, value: (r) => r.v });
		const last = K.$('#bars').lastElementChild;
		if (rows[rows.length - 1].other && last) { last.querySelector('.n').style.fontStyle = 'italic'; last.querySelector('.f').style.background = 'rgb(24 20 31 / 0.32)'; }
		K.$('#sum').textContent = (n && rest > 0 ? 'Other = all countries ' + K.compact.format(total) + ' − top ' + n + ' ' + K.compact.format(shown) + '. ' : '') + 'The bars add up to ' + K.compact.format(total);
	} else if (q.result) { K.$('#bars').textContent = ''; K.$('#sum').textContent = 'No orders match'; }
	K.sent(K.$('#sent'), app, [q], () => [n ? 'N → ' + n + ', in the AQL text: top(' + n + ', customers.country, by: revenue)' : 'N → all, no top() filter']);
}
app.subscribe(draw);
app.execute();`,
};
