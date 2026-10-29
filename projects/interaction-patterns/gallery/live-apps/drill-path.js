LIVE['drill-path'] = {
	h: 470,
	html: `<style>
	.trail { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; font-size: 12px; min-height: 28px; }
	.trail .lbl { margin-right: 4px; }
	.trail button { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 6px; font-variant-numeric: tabular-nums; }
	.trail button[aria-current='step'] { border: 2px solid var(--violet-ink); color: var(--violet-ink); font-weight: 600; }
	.trail button.after { opacity: 0.45; }
	.trail .sep { color: var(--muted); }
	.trail .up { color: #b4541a; }
	.lv { max-height: 220px; overflow: auto; }
	</style>
	<div class="app">
		<div class="trail" id="trail"></div>
		<div class="row"><button type="button" id="up">↑ Up a level</button><span class="hint" id="hint"></span></div>
		<div class="cols" style="grid-template-columns: 1.3fr 1fr">
			<div class="panel"><div class="ph"><b id="title">Regions</b><span class="status" id="s1"></span></div><div class="lv"><div id="level"></div></div></div>
			<div class="panel"><div class="ph"><b>Revenue here</b><span class="status" id="s2"></span></div><div class="kpi" id="k1">–</div><div class="hint" id="where">All regions</div></div>
		</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Drill path', timezone: 'Etc/UTC' });
const DS = 'ecommerce', M = 'measures { total_revenue: revenue }';
const byRegion = app.createQuery('byRegion', { dataset: DS, aql: 'explore { dimensions { key: markets.region } ' + M + ' sorts { total_revenue desc } }' });
const byCountry = app.createQuery('byCountry', { dataset: DS, aql: 'explore { dimensions { key: markets.name } ' + M + ' sorts { total_revenue desc } }' });
const byCustomer = app.createQuery('byCustomer', { dataset: DS, aql: 'explore { dimensions { key: customers.name } ' + M + ' sorts { total_revenue desc } }' });
const scope = app.createQuery('scope', { dataset: DS, aql: 'explore { ' + M + ' }' });
const L = [
	{ q: byRegion, f: app.createFilter('region', { dataset: DS, field: 'markets.region', label: 'Region' }), field: 'markets.region', name: 'Regions' },
	{ q: byCountry, f: app.createFilter('country', { dataset: DS, field: 'markets.name', label: 'Country' }), field: 'markets.name', name: 'Countries' },
	{ q: byCustomer, f: null, name: 'Customers' },
];
// each level is filtered by the levels above it; the KPI follows the whole path
L.forEach((lvl, i) => L.slice(0, i).forEach((up) => app.mapControl(up.f, lvl.q, { field: up.field })));
for (const up of L.slice(0, 2)) app.mapControl(up.f, scope, { field: up.field });
// the drill path: every step down or up, as the filter conditions it left behind
const trail = [{ label: 'All regions', dir: '', picks: [] }];
let at = 0;
const picks = () => trail[at].picks;
function show (p) {
	L.slice(0, 2).forEach((l, i) => { if (p[i] != null) l.f.setCondition({ operator: 'is', values: [p[i]] }); else l.f.reset(); });
	app.execute();
}
function step (label, dir, p) { trail.splice(at + 1); trail.push({ label, dir, picks: p }); at = trail.length - 1; show(p); }
const down = (r) => step(r.key, '↓', picks().concat(r.key));
K.$('#up').onclick = () => { const p = picks().slice(0, -1); if (picks().length) step(p.length ? p[p.length - 1] : 'All regions', '↑', p); };
function jump (i) { at = i; show(trail[i].picks); }
app.subscribe(() => {
const p = picks(), lvl = L[p.length];
K.status(lvl.q, K.$('#s1')); K.status(scope, K.$('#s2'));
const tr = K.$('#trail'); tr.innerHTML = '<span class="lbl">Drill path</span>';
trail.forEach((s, i) => {
	if (i) { const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '›'; tr.appendChild(sep); }
	const b = document.createElement('button'); b.type = 'button';
	b.innerHTML = (s.dir ? '<span class="' + (s.dir === '↑' ? 'up' : '') + '">' + s.dir + '</span> ' : '') + K.esc(s.label);
	if (i === at) b.setAttribute('aria-current', 'step'); else if (i > at) b.className = 'after';
	b.title = s.picks.length ? s.picks.join(' › ') : 'All regions';
	b.onclick = () => jump(i);
	tr.appendChild(b);
});
K.$('#up').disabled = !p.length;
K.$('#title').textContent = lvl.name + (p.length ? ' in ' + p[p.length - 1] : '');
K.$('#where').textContent = p.length ? p.join(' › ') : 'All regions';
K.$('#hint').textContent = p.length < 2 ? 'Click a bar to drill down' : 'Customers is the last level';
if (lvl.q.result) K.bars(K.$('#level'), lvl.q.result.rows, { label: (r) => r.key, value: (r) => r.total_revenue, pick: p.length < 2 ? (r) => down(r) : null });
if (scope.result) K.$('#k1').textContent = K.money.format(Number((scope.result.rows[0] || {}).total_revenue || 0));
K.sent(K.$('#sent'), app, [lvl.q, scope], () => ['drill path → step ' + (at + 1) + ' of ' + trail.length + ' (the path is the app\\'s list; each step is just filter conditions)']);
});
app.execute();`,
};
