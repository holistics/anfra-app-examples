LIVE['compound-filter'] = {
	h: 480,
	html: `<div class="app">
		<div class="grp" id="g1"><span class="lbl gl">Group 1</span></div>
		<div class="row"><span class="or">OR</span><span class="hint">A row is kept when it matches every pick in either group</span></div>
		<div class="grp" id="g2"><span class="lbl gl">Group 2</span></div>
		<div class="panel"><div class="ph"><b id="words">–</b><span class="status" id="s1"></span></div><div id="table"></div></div>
		<div class="hint">App code: each change declares a new query, its filters built from picked values only</div>
		<div class="sent" id="sent"></div></div>
		<style>.grp { display: flex; gap: 6px; align-items: center; } .grp select { width: 128px; } .gl { width: 48px; } .tw { max-height: 160px; } .or { font-size: 12px; font-weight: 600; color: var(--violet-ink); background: var(--violet-soft); border-radius: 999px; padding: 2px 10px; }</style>`,
	js: `
const app = Anfra.createApp({ title: 'Filter group', timezone: 'Etc/UTC' });
const FIELDS = [{ key: 'country', field: 'customers.country', label: 'Country', any: 'Any country' }, { key: 'category', field: 'products.category', label: 'Category', any: 'Any category' }, { key: 'status', field: 'orders.status', label: 'Status', any: 'Any status' }];
const OPTS = {};
const groups = [{ country: 'Vietnam', category: 'Software', status: '' }, { country: '', category: '', status: '' }];
const BASE = ['explore { dimensions { country_name: customers.country, category_name: products.category, status_name: orders.status } measures { total_revenue: revenue }', ' sorts { total_revenue desc } }'];
const cache = new Map();
let n = 0, cur = null, where = '';
const ok = (k, v) => v && OPTS[k] && OPTS[k].includes(v) && !/['\\\\]/.test(v);
function build () {
	const parts = groups.map((g) => FIELDS.filter((f) => ok(f.key, g[f.key])).map((f) => f.field + " == '" + g[f.key] + "'")).filter((p) => p.length);
	where = parts.map((p) => parts.length > 1 && p.length > 1 ? '(' + p.join(' and ') + ')' : p.join(' and ')).join(' or ');
	const words = groups.map((g) => FIELDS.filter((f) => ok(f.key, g[f.key])).map((f) => f.label + ' is ' + g[f.key])).filter((p) => p.length).map((p) => p.length > 1 ? '(' + p.join(' and ') + ')' : p[0]);
	K.$('#words').textContent = words.length ? words.join(' or ') : 'All rows: pick values to build a condition';
	const aql = BASE[0] + (where ? ' filters { ' + where + ' }' : '') + BASE[1];
	if (!cache.has(aql)) cache.set(aql, app.createQuery('grp' + (++n), { dataset: 'ecommerce', aql }));
	cur = cache.get(aql);
	app.execute();
}
const probes = FIELDS.map((f) => app.createFilter('opt_' + f.key, { dataset: 'ecommerce', field: f.field, label: f.label }));
Promise.all(probes.map((p) => p.loadOptions())).then((lists) => {
	FIELDS.forEach((f, i) => { OPTS[f.key] = lists[i].map(String); });
	groups.forEach((g, gi) => {
		const box = K.$('#g' + (gi + 1));
		FIELDS.forEach((f, fi) => {
			if (fi) { const a = document.createElement('span'); a.className = 'lbl'; a.textContent = 'and'; box.appendChild(a); }
			const s = document.createElement('select'); s.setAttribute('aria-label', 'Group ' + (gi + 1) + ' ' + f.label);
			s.add(new Option(f.any, ''));
			OPTS[f.key].forEach((v) => s.add(new Option(f.key === 'status' ? v[0].toUpperCase() + v.slice(1) : v, v)));
			s.value = g[f.key];
			s.onchange = () => { g[f.key] = s.value; build(); };
			box.appendChild(s);
		});
	});
	build();
});
const cap = (v) => v ? v[0].toUpperCase() + v.slice(1) : v;
app.subscribe(() => {
if (!cur) return;
K.status(cur, K.$('#s1'));
if (cur.result) K.table(K.$('#table'), [{ key: 'country_name', label: 'Country' }, { key: 'category_name', label: 'Category' }, { key: 'status_name', label: 'Status', fmt: cap }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(Number(v)) }], cur.result.rows);
K.sent(K.$('#sent'), app, [cur], () => ['condition (in the AQL, rebuilt by app code) → ' + (where || 'none')]);
});`,
};
