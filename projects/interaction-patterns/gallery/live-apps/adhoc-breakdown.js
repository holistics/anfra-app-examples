LIVE['adhoc-breakdown'] = {
	h: 360,
	html: `<div class="app">
		<style>
		.menu { position: fixed; z-index: 5; background: #fff; border: 1px solid var(--rule-strong); border-radius: 10px; box-shadow: 0 8px 24px rgb(24 20 31 / 0.14); padding: 4px; display: grid; min-width: 168px; }
		.menu[hidden] { display: none; }
		.menu .mh { font-size: 12px; line-height: 16px; color: var(--muted); padding: 4px 8px; }
		.menu button { border: 0; border-radius: 6px; text-align: left; height: 28px; font-size: 14px; }
		.menu button:hover { background: var(--violet-soft); }
		#bd .b, #bycat .b { grid-template-columns: 88px minmax(0, 1fr) 54px; }
		</style>
		<div class="row"><span class="hint">Right-click (or click) a category to break it down by another field</span></div>
		<div class="cols"><div class="panel"><div class="ph"><b>Revenue by category</b><span class="status" id="s1"></span></div><div id="bycat"></div></div>
		<div class="panel" id="bdp"><div class="ph"><b id="bdt">Breakdown</b><span class="status" id="s2"></span></div><div id="bd"><div class="hint">No breakdown yet</div></div><div class="row" style="margin-top:8px"><button type="button" id="close" hidden>Close breakdown</button></div></div></div>
		<div class="menu" id="menu" hidden></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Break down', timezone: 'Etc/UTC' });
const byCategory = app.createQuery('byCategory', { dataset: 'ecommerce', aql: 'explore { dimensions { category_name: products.category } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const DIMS = [{ id: 'status', label: 'Status', ref: 'orders.status' }, { id: 'country', label: 'Country', ref: 'customers.country' }, { id: 'product', label: 'Product', ref: 'products.name' }];
const made = {};
let active = null, parent = null;
function breakdown (row, d) {
	if (!made[d.id]) {
		const q = app.createQuery('by_' + d.id, { dataset: 'ecommerce', aql: 'explore { dimensions { part: ' + d.ref + ' } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
		const f = app.createFilter('of_' + d.id, { dataset: 'ecommerce', field: 'products.category', label: 'Category' });
		app.mapControl(f, q, { field: 'products.category' });
		made[d.id] = { q, f, d };
	}
	made[d.id].f.setCondition({ operator: 'is', values: [row.category_name] });
	active = made[d.id]; parent = row.category_name;
	return app.execute();
}
const menu = K.$('#menu');
function openMenu (row, x, y) {
	menu.innerHTML = '<div class="mh">Break down ' + K.esc(row.category_name) + ' by</div>';
	for (const d of DIMS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = d.label; b.onclick = () => { menu.hidden = true; breakdown(row, d); }; menu.appendChild(b); }
	menu.hidden = false;
	menu.style.left = Math.min(x, innerWidth - 180) + 'px'; menu.style.top = Math.min(y, innerHeight - 130) + 'px';
	menu.querySelector('button').focus();
}
document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !e.target.closest('#bycat')) menu.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
K.$('#close').onclick = () => { active = null; parent = null; draw(); };
function draw () {
	K.status(byCategory, K.$('#s1'));
	if (byCategory.result) {
		K.bars(K.$('#bycat'), byCategory.result.rows, { label: (r) => r.category_name, value: (r) => r.total_revenue, on: parent ? (r) => r.category_name === parent : null,
			pick: (r, e) => { const b = e.currentTarget.getBoundingClientRect(); openMenu(r, e.clientX || b.left + 24, e.clientY || b.bottom); } });
		K.$('#bycat').querySelectorAll('.b').forEach((el, i) => { el.oncontextmenu = (e) => { e.preventDefault(); openMenu(byCategory.result.rows[i], e.clientX, e.clientY); }; });
	}
	K.$('#close').hidden = !active;
	if (active) {
		K.status(active.q, K.$('#s2'));
		K.$('#bdt').textContent = parent + ' by ' + active.d.label.toLowerCase();
		if (active.q.result) K.bars(K.$('#bd'), active.q.result.rows, { label: (r) => r.part, value: (r) => r.total_revenue });
	} else { K.$('#s2').textContent = ''; K.$('#bdt').textContent = 'Breakdown'; K.$('#bd').className = ''; K.$('#bd').innerHTML = '<div class="hint">No breakdown yet</div>'; }
	K.sent(K.$('#sent'), app, active ? [active.q] : [byCategory], () => [active ? 'new query by_' + active.d.id + ': dimensions { part: ' + active.d.ref + ' }' : null]);
}
app.subscribe(draw);
app.execute();`,
};
