LIVE['custom-compare'] = {
	h: 430,
	html: `<style>
	.rg { display: grid; grid-template-columns: 20px 132px 136px 12px 136px; gap: 6px; align-items: center; }
	.rg b { font-size: 12px; text-align: center; border-radius: 6px; line-height: 20px; } .rg .ta { background: rgb(24 20 31 / 0.12); } .rg .tb { background: var(--violet); color: #fff; }
	.rg input[type=date] { width: 136px; padding: 0 6px; } .rg select { padding: 0 6px; }
	.pr { display: grid; grid-template-columns: 92px minmax(0, 1fr) 128px; gap: 8px; align-items: center; padding: 3px 4px; font-size: 12px; line-height: 16px; }
	.pr .t { display: grid; gap: 2px; } .pr .t span { display: block; height: 8px; border-radius: 2px; transition: width 320ms var(--ease); }
	.pr .a { background: rgb(24 20 31 / 0.18); } .pr .b { background: var(--violet); }
	.pr .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--weak); white-space: nowrap; } .up { color: #1f7a4d; } .dn { color: #b42318; }
	</style>
	<div class="app">
		<div class="rg"><b class="ta">A</b><select id="pa" aria-label="Range A preset"></select><input type="date" id="fa" aria-label="A from"><span class="hint">–</span><input type="date" id="ta" aria-label="A to"></div>
		<div class="rg"><b class="tb">B</b><select id="pb" aria-label="Range B preset"></select><input type="date" id="fb" aria-label="B from"><span class="hint">–</span><input type="date" id="tb" aria-label="B to"></div>
		<div class="panel"><div class="ph"><b>Revenue by country: <span id="la"></span> (grey) vs <span id="lb"></span></b><span class="status" id="s1"></span></div><div id="pairs"></div></div>
		<div class="hint">One query declared twice, each copy with its own date control</div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Custom period comparison', timezone: 'Etc/UTC' });
const AQL = 'explore { dimensions { country_name: customers.country } measures { total_revenue: revenue } sorts { total_revenue desc } }';
const qa = app.createQuery('byCountryA', { dataset: 'ecommerce', aql: AQL });
const qb = app.createQuery('byCountryB', { dataset: 'ecommerce', aql: AQL });
const ra = app.createFilter('rangeA', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Range A' });
const rb = app.createFilter('rangeB', { dataset: 'ecommerce', field: 'orders.ordered_at', label: 'Range B' });
app.mapControl(ra, qa, { field: 'orders.ordered_at' });
app.mapControl(rb, qb, { field: 'orders.ordered_at' });
const P = [['H2 2025', '2025-07-01', '2025-12-31'], ['H1 2026', '2026-01-01', '2026-06-30'], ['Q3 2025', '2025-07-01', '2025-09-30'], ['Q3 2026', '2026-07-01', '2026-09-30'], ['Q2 2026', '2026-04-01', '2026-06-30'], ['Jun–Sep 2025', '2025-06-01', '2025-09-30'], ['Jun–Sep 2026', '2026-06-01', '2026-09-30']];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (a, b) => { const p = P.find((x) => x[1] === a && x[2] === b); if (p) return p[0]; const f = (s) => { const x = new Date(s + 'T00:00:00Z'); return x.getUTCDate() + ' ' + MN[x.getUTCMonth()] + ' ' + String(x.getUTCFullYear()).slice(2); }; return f(a) + '–' + f(b); };
function wire (f, sel, from, to, def) {
	for (const p of P) sel.add(new Option(p[0], p[0]));
	sel.add(new Option('Custom dates', ''));
	const set = (a, b) => { from.value = a; to.value = b; f.setCondition({ operator: 'between', values: [a, b] }); };
	sel.onchange = () => { const p = P.find((x) => x[0] === sel.value); if (p) { set(p[1], p[2]); app.execute(); } };
	const typed = () => { if (from.value && to.value) { const p = P.find((x) => x[1] === from.value && x[2] === to.value); sel.value = p ? p[0] : ''; set(from.value, to.value); app.execute(); } };
	from.onchange = typed; to.onchange = typed;
	sel.value = def; const p = P.find((x) => x[0] === def); set(p[1], p[2]);
}
wire(ra, K.$('#pa'), K.$('#fa'), K.$('#ta'), 'H2 2025');
wire(rb, K.$('#pb'), K.$('#fb'), K.$('#tb'), 'H1 2026');
app.subscribe(() => {
const s = [qa, qb].find((q) => q.state === 'error' || q.state === 'executing') || qb; K.status(s, K.$('#s1'));
const ca = ra.appliedCondition, cb = rb.appliedCondition;
K.$('#la').textContent = ca && ca.values ? short(ca.values[0], ca.values[1]) : '';
K.$('#lb').textContent = cb && cb.values ? short(cb.values[0], cb.values[1]) : '';
if (qa.result && qb.result) {
	const A = new Map(qa.result.rows.map((r) => [r.country_name, Number(r.total_revenue)]));
	const B = new Map(qb.result.rows.map((r) => [r.country_name, Number(r.total_revenue)]));
	const names = [...new Set([...B.keys(), ...A.keys()])].sort((x, y) => (B.get(y) || 0) - (B.get(x) || 0));
	const max = Math.max(1, ...A.values(), ...B.values());
	const box = K.$('#pairs'); box.innerHTML = '';
	for (const n of names) {
		const a = A.get(n) || 0, b = B.get(n) || 0, p = a ? (b - a) / a * 100 : null;
		const d = document.createElement('div'); d.className = 'pr';
		d.innerHTML = '<span>' + K.esc(n) + '</span><span class="t"><span class="a" style="width:0"></span><span class="b" style="width:0"></span></span><span class="v">' + K.compact.format(a) + ' → ' + K.compact.format(b) + ' ' + (p == null ? '' : '<span class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%</span>') + '</span>';
		box.appendChild(d);
		requestAnimationFrame(() => { d.querySelector('.a').style.width = (a / max * 100) + '%'; d.querySelector('.b').style.width = (b / max * 100) + '%'; });
	}
}
K.sent(K.$('#sent'), app, [qa, qb]);
});
app.execute();`,
};
