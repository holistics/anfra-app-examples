LIVE['fiscal-calendar'] = {
	h: 380,
	html: `<style>
	.qr { display: grid; grid-template-columns: 64px 96px minmax(0, 1fr) 52px; gap: 8px; align-items: center; height: 26px; padding: 0 4px; border-radius: 6px; font-size: 12px; line-height: 16px; }
	.qr .m { color: var(--muted); } .qr .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--weak); }
	.qr .t { height: 14px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
	.qr .f { display: block; height: 100%; background: var(--violet-faint); border-radius: 3px; transition: width 320ms var(--ease); }
	.qr.on { background: var(--violet-soft); } .qr.on .f { background: var(--violet); } .qr.on b { color: var(--violet-ink); }
	.qr b { font-weight: 600; }
	</style>
	<div class="app">
		<div class="row"><span class="lbl">Quarters</span><span class="seg" id="mode"><button type="button" data-m="cal">Calendar</button><button type="button" data-m="fy">Fiscal (July start)</button></span>
		<label class="lbl" for="country">Country</label><select id="country"><option value="">All countries</option></select></div>
		<div class="panel"><div class="ph"><b>Revenue by <span id="what">calendar quarter</span></b><span class="status" id="s1"></span></div><div id="qs"></div>
		<div class="hint" id="note"></div></div>
		<div class="sent" id="sent"></div></div>`,
	js: `
const app = Anfra.createApp({ title: 'Fiscal calendar', timezone: 'Etc/UTC' });
const cal = app.createQuery('calendarQuarters', { dataset: 'ecommerce', aql: 'explore { dimensions { period: orders.ordered_at | quarter() } measures { total_revenue: revenue } sorts { period asc } }' });
const fy = app.createQuery('fiscalQuarters', { dataset: 'ecommerce', aql: 'explore { dimensions { fy: orders.fiscal_year, fq: orders.fiscal_quarter } measures { total_revenue: revenue } sorts { fy asc, fq asc } }' });
const country = app.createFilter('country', { dataset: 'ecommerce', field: 'customers.country', label: 'Country' });
for (const q of [cal, fy]) app.mapControl(country, q, { field: 'customers.country' });
const sel = K.$('#country');
country.loadOptions().then((vals) => vals.forEach((v) => sel.add(new Option(v, v))));
sel.onchange = () => { if (sel.value) country.setCondition({ operator: 'is', values: [sel.value] }); else country.reset(); app.execute(); };
let mode = 'cal';
K.$('#mode').querySelectorAll('button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; draw(); }; });
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIRST = 2025 * 12 + 5;
function months (y, m0) { const a = Math.max(y * 12 + m0, FIRST), b = y * 12 + m0 + 2; const s = (k) => MN[k % 12]; return a === b ? s(a) + ' ' + Math.floor(a / 12) : s(a) + '–' + s(b) + ' ' + Math.floor(b / 12); }
function rows () {
	if (mode === 'cal') return cal.result ? cal.result.rows.map((r) => { const d = new Date(r.period), y = d.getUTCFullYear(), m = d.getUTCMonth(); return { k: 'Q' + (m / 3 + 1) + ' ' + y, m: months(y, m), v: Number(r.total_revenue), y, m0: m }; }) : null;
	return fy.result ? fy.result.rows.map((r) => { const Y = Number(r.fy), q = Number(r.fq), y = Y - 1 + Math.floor((6 + (q - 1) * 3) / 12), m = (6 + (q - 1) * 3) % 12; return { k: 'FY' + String(Y).slice(2) + ' Q' + q, m: months(y, m), v: Number(r.total_revenue), y, m0: m }; }) : null;
}
function draw () {
	const q = mode === 'cal' ? cal : fy;
	K.status(q, K.$('#s1'));
	K.$('#mode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
	K.$('#what').textContent = mode === 'cal' ? 'calendar quarter' : 'fiscal quarter (FY ends 30 Jun)';
	const rs = rows();
	if (rs) {
		const max = Math.max(1, ...rs.map((r) => r.v));
		const box = K.$('#qs'); box.innerHTML = '';
		for (const r of rs) {
			const d = document.createElement('div'); const on = r.y === 2026 && r.m0 === 6;
			d.className = 'qr' + (on ? ' on' : '');
			d.innerHTML = '<b>' + K.esc(r.k) + '</b><span class="m">' + K.esc(r.m) + '</span><span class="t"><span class="f" style="width:0"></span></span><span class="v">' + K.compact.format(r.v) + '</span>';
			box.appendChild(d);
			requestAnimationFrame(() => { d.querySelector('.f').style.width = (r.v / max * 100) + '%'; });
		}
		const j = rs.find((r) => r.y === 2026 && r.m0 === 6);
		K.$('#note').textContent = j ? 'Jul–Sep 2026 is ' + j.k + ' at ' + K.compact.format(j.v) + (mode === 'cal' ? '; switch to Fiscal to see it relabel' : ', the first quarter of fiscal 2027') : '';
	}
	K.sent(K.$('#sent'), app, [q], () => ['showing ' + q.name + ' (toggle picks the query; renderer state)']);
}
app.subscribe(draw);
app.execute();`,
};
