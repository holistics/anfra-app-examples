LIVE['custom-menu'] = {
	h: 640,
	html: `<style>.cfg { display: grid; gap: 6px; padding: 8px 10px; border-radius: 10px; background: var(--sunken); } .cfg .chips button[aria-pressed='false'] { color: var(--muted); text-decoration: line-through; text-decoration-color: rgb(24 20 31 / 0.35); } .cfg .chips .own { border-style: dashed; } #main { position: relative; } .mbar { position: absolute; z-index: 2; display: grid; min-width: 180px; gap: 2px; padding: 4px; border-radius: 10px; background: #fff; border: 1px solid var(--rule-strong); box-shadow: 0 6px 20px rgb(24 20 31 / 0.14); } .mbar[hidden] { display: none; } .mbar button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px; font-size: 12px; white-space: nowrap; text-align: left; justify-content: flex-start; } .mbar button:hover { background: var(--violet-soft); color: var(--violet-ink); } .mbar .own { color: var(--violet-ink); } .fchips { display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px; align-items: center; font-size: 12px; color: var(--muted); } .fchips button { height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; background: var(--violet-soft); border-color: var(--violet); color: var(--violet-ink); } #detail[hidden], #toast[hidden], #nudge[hidden] { display: none; } #toast { font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--violet-ink); }</style>
	<div class="app">
		<div class="cfg"><span class="hint">Menu items: the app author picks these, and can add their own</span><span class="chips" id="cfg"></span></div>
		<div class="panel" id="main"><div class="ph"><b>Revenue by country · right-click a bar</b><span class="status" id="s1"></span></div>
		<div class="fchips" id="fchips"></div><div id="bars"></div><div class="mbar" id="mbar" role="menu" hidden></div><div class="hint" id="nudge" hidden>Right-click a bar to open its menu</div></div>
		<div class="panel" id="detail" hidden><div class="ph"><b id="dt"></b><span class="status" id="s2"></span></div><div id="dbody"></div></div>
		<div id="toast" hidden></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Custom right-click menu', timezone: 'Etc/UTC' });
const byCountry = app.createQuery('byCountry', { dataset: 'ecommerce', aql: 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }' });
const customers = app.createQuery('customers', { dataset: 'ecommerce', pageSize: 5, aql: 'explore { dimensions { customer_name: customers.name } measures { total_revenue: revenue, num_orders: order_count } sorts { total_revenue desc } }' });
const orders = app.createQuery('orders', { dataset: 'ecommerce', pageSize: 5, aql: 'explore { dimensions { order_id: orders.id, ordered_on: orders.ordered_at, order_status: orders.status } measures { total_revenue: revenue } sorts { ordered_on desc, order_id desc } }' });
// keep only and exclude filter the chart; drill and view orders filter the detail queries
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
const point = app.createFilter('point', { dataset: 'ecommerce', field: 'customers.country', label: 'Clicked country' });
app.mapControl(country, byCountry, { field: 'customers.country' });
app.mapControl(point, customers, { field: 'customers.country' });
app.mapControl(point, orders, { field: 'customers.country' });
let kept = null, out = [], view = null, at = null, toast = '';
const run = () => { menu(null); app.execute(); };
const applyCountry = () => { if (kept) country.setCondition({ operator: 'is', values: [kept] }); else if (out.length) country.setCondition({ operator: 'is_not', values: out }); else country.reset(); };
const detail = (kind, r) => { view = { kind, name: r.country_name }; point.setCondition({ operator: 'is', values: [r.country_name] }); run(); };
// the menu: each item is a label and what it does with the clicked row
const ITEMS = [
	{ id: 'keep', label: 'Keep only', on: true, act: (r) => { kept = r.country_name; out = []; applyCountry(); run(); } },
	{ id: 'exclude', label: 'Exclude', on: true, act: (r) => { kept = null; out = out.concat(r.country_name); applyCountry(); run(); } },
	{ id: 'drill', label: 'Drill to customers', on: true, act: (r) => detail('customers', r) },
	{ id: 'orders', label: 'View orders', on: true, act: (r) => detail('orders', r) },
	{ id: 'copy', label: 'Copy as AQL filter', on: false, own: true, act: (r) => { const t = "customers.country is '" + r.country_name + "'"; toast = 'Copied: ' + t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { toast = 'Copy it: ' + t; draw(); }); menu(null); draw(); } },
];
const cfg = K.$('#cfg');
for (const it of ITEMS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = (it.own ? '+ ' : '') + it.label; if (it.own) b.className = 'own'; b.onclick = () => { it.on = !it.on; b.setAttribute('aria-pressed', String(it.on)); menu(null); draw(); }; b.setAttribute('aria-pressed', String(it.on)); cfg.appendChild(b); }
const mb = K.$('#mbar');
// right-click (or the Menu key / Shift+F10 on a focused bar) opens the menu at the pointer
function menu (r, x, y) {
	at = r; mb.hidden = !r;
	if (!r) return;
	mb.replaceChildren(...ITEMS.filter((it) => it.on).map((it) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it.label; if (it.own) b.className = 'own'; b.onclick = (e) => { e.stopPropagation(); it.act(r); }; return b; }));
	if (!mb.children.length) mb.innerHTML = '<span class="hint" style="padding: 6px 8px">No menu items: turn some on above</span>';
	const box = K.$('#main').getBoundingClientRect();
	mb.style.left = Math.max(4, Math.min(x - box.left, box.width - mb.offsetWidth - 4)) + 'px';
	mb.style.top = (y - box.top + 2) + 'px';
}
let nudge = 0;
document.addEventListener('click', (e) => { if (at && !mb.contains(e.target)) { menu(null); draw(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && at) { menu(null); draw(); } });
const dd = (v) => { const x = new Date(String(v).slice(0, 10) + 'T00:00:00Z'); return x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); };
function draw () {
	K.status(byCountry, K.$('#s1'));
	const fc = K.$('#fchips');
	fc.innerHTML = kept ? 'Country is ' : out.length ? 'Country is not ' : 'No filter yet';
	for (const v of kept ? [kept] : out) { const b = document.createElement('button'); b.type = 'button'; b.textContent = v + ' ×'; b.setAttribute('aria-label', 'Remove ' + v); b.onclick = () => { if (kept) kept = null; else out = out.filter((x) => x !== v); applyCountry(); run(); }; fc.appendChild(b); }
	if (byCountry.result) K.bars(K.$('#bars'), byCountry.result.rows, { label: (r) => r.country_name, value: (r) => r.total_revenue, on: (r) => !!at && r.country_name === at.country_name, pick: () => { if (at) return; nudge = Date.now(); draw(); setTimeout(draw, 1600); } });
	if (byCountry.result) [...K.$('#bars').children].forEach((el, i) => {
		const r = byCountry.result.rows[i];
		const open = (x, y) => { menu(r, x, y); draw(); const first = mb.querySelector('button'); if (first) first.focus(); };
		el.oncontextmenu = (e) => { e.preventDefault(); open(e.clientX, e.clientY); };
		el.onkeydown = (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const b = el.getBoundingClientRect(); open(b.left + 96, b.bottom); } };
	});
	K.$('#nudge').hidden = Date.now() - nudge > 1500;
	const box = K.$('#detail'); box.hidden = !view;
	if (view) {
		const q = view.kind === 'customers' ? customers : orders;
		K.status(q, K.$('#s2'));
		K.$('#dt').textContent = (view.kind === 'customers' ? 'Top customers in ' : 'Latest orders in ') + view.name;
		if (q.result) K.table(K.$('#dbody'), view.kind === 'customers'
			? [{ key: 'customer_name', label: 'Customer' }, { key: 'num_orders', label: 'Orders', num: true }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }]
			: [{ key: 'order_id', label: 'Order', fmt: (v) => '#' + v }, { key: 'ordered_on', label: 'Date', fmt: dd }, { key: 'order_status', label: 'Status' }, { key: 'total_revenue', label: 'Revenue', num: true, fmt: (v) => K.money.format(v) }], q.result.rows);
	}
	K.$('#toast').hidden = !toast; K.$('#toast').textContent = toast;
	K.sent(K.$('#sent'), app, view ? [byCountry, view.kind === 'customers' ? customers : orders] : [byCountry], () => ['menu → ' + (ITEMS.filter((it) => it.on).map((it) => it.label).join(' · ') || 'empty') + ' (app code)']);
}
app.subscribe(draw);
app.execute();`,
};
