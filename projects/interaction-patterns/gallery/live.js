// Live mini Data Apps: the gallery page is an anfra host. Each card with a `live` entry runs a small
// Data App in a sandboxed frame (mountDataApp), and its queries go to anfra through the page's /api.

// ---------- inside the frame: a tiny kit every mini app shares ----------
function kit () {
	const css = `
	:root { --ink: #18141f; --weak: #45404c; --muted: #625c69; --rule: rgb(24 20 31 / 0.12); --rule-strong: rgb(24 20 31 / 0.24); --violet: #8a51d4; --violet-ink: #4f2a86; --violet-soft: #efe9fb; --violet-faint: #ddd0f3; --sunken: #f7f6f2; --ease: cubic-bezier(0.22, 1, 0.36, 1); }
	* { box-sizing: border-box; }
	html, body { margin: 0; background: #fff; color: var(--ink); font: 400 14px/20px 'Inter Variable', Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
	.app { padding: 12px; display: grid; gap: 10px; }
	.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.lbl { font-size: 12px; line-height: 16px; color: var(--muted); }
	select, button { font: 500 14px/20px inherit; font-family: inherit; color: var(--ink); height: 32px; padding: 0 10px; border: 1px solid var(--rule-strong); border-radius: 10px; background: #fff; cursor: pointer; transition: background-color 160ms var(--ease), border-color 160ms var(--ease), transform 90ms var(--ease); }
	button:hover, select:hover { border-color: var(--ink); }
	button:active { transform: scale(0.97); }
	button[aria-pressed='true'] { background: var(--violet-soft); border-color: var(--violet); color: var(--violet-ink); }
	button:focus-visible, select:focus-visible, .b:focus-visible { outline: 2px solid var(--violet); outline-offset: 1px; }
	.seg { display: inline-flex; gap: 4px; }
	.panel { border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; min-width: 0; }
	.ph { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; line-height: 16px; color: var(--muted); margin-bottom: 8px; }
	.ph b { color: var(--ink); font-weight: 500; }
	.bars { display: grid; gap: 2px; }
	.b { display: grid; grid-template-columns: 92px minmax(0, 1fr) 58px; gap: 8px; align-items: center; height: 24px; padding: 0 4px; border-radius: 6px; font-size: 12px; line-height: 16px; border: 0; background: none; text-align: left; width: 100%; }
	.b.click { cursor: pointer; }
	.b.click:hover { background: rgb(24 20 31 / 0.05); }
	.b .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.b .v { text-align: right; font-variant-numeric: tabular-nums; color: var(--weak); }
	.b .t { height: 14px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
	.b .f { display: block; height: 100%; background: var(--violet); border-radius: 3px; transition: width 320ms var(--ease), background-color 160ms var(--ease); }
	.bars.some .b:not(.on) .f { background: var(--violet-faint); }
	.b.on .n { font-weight: 600; }
	.colz { display: flex; align-items: flex-end; gap: 2px; height: 150px; }
	.colz .cw { flex: 1; min-width: 2px; height: 100%; position: relative; padding: 0; border: 0; border-radius: 0; background: none; display: block; }
	.colz .cw .c, .colz .cw .g { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 2px 2px 0 0; }
	.colz .cw .g { background: rgb(24 20 31 / 0.07); }
	.colz .cw .c { background: var(--violet); transition: height 320ms var(--ease); }
	.colz .cw:hover .c { background: var(--violet-ink); }
	.colz .cw.click { cursor: zoom-in; }
	.chips { display: flex; gap: 4px; flex-wrap: wrap; }
	.chips button { height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; }
	.legend { display: flex; gap: 12px; font-size: 12px; line-height: 16px; color: var(--muted); }
	.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
	.axis { display: flex; justify-content: space-between; font-size: 12px; line-height: 16px; color: var(--muted); margin-top: 4px; }
	.kpi { font-size: 20px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.status { font-size: 12px; color: var(--muted); min-height: 16px; }
	.status.err { color: #b42318; }
	.sent { border-top: 1px dashed var(--rule-strong); padding-top: 8px; font: 400 12px/16px 'Geist Mono', ui-monospace, monospace; color: var(--weak); display: grid; gap: 2px; }
	.sent .h { font: 500 12px/16px 'Inter Variable', Inter, system-ui, sans-serif; color: var(--muted); display: flex; justify-content: space-between; }
	.sent .q { color: var(--violet-ink); }
	.sent .none { color: var(--muted); }
	.hint { font-size: 12px; line-height: 16px; color: var(--muted); }
	.tw { max-height: 240px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
	th { position: sticky; top: 0; background: #fff; text-align: left; font-weight: 500; color: var(--muted); padding: 4px 6px; border-bottom: 1px solid var(--rule-strong); }
	td { padding: 4px 6px; border-bottom: 1px solid var(--rule); }
	th.num, td.num { text-align: right; }
	tr.click { cursor: pointer; } tr.click:hover td { background: rgb(24 20 31 / 0.04); }
	tr.on td { background: var(--violet-soft); color: var(--violet-ink); }
	input[type=text], input[type=search], input[type=number], input[type=date] { font: 400 14px/20px inherit; font-family: inherit; height: 32px; padding: 0 10px; border: 1px solid var(--rule-strong); border-radius: 10px; }
	input[type=range] { accent-color: var(--violet); }
	.tip { position: fixed; pointer-events: none; background: var(--ink); color: #fff; font-size: 12px; line-height: 16px; padding: 4px 8px; border-radius: 6px; opacity: 0; transition: opacity 120ms; }
	@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }`;
	document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

	const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });
	const int = new Intl.NumberFormat('en-US');
	const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const $ = (s) => document.querySelector(s);

	// horizontal bars; `on(row)` marks the picked ones, `pick(row, event)` makes them clickable
	function bars (el, rows, o) {
		const max = Math.max(...rows.map((r) => Number(o.value(r)) || 0), 1);
		const some = !!o.on && rows.some((r) => o.on(r));
		el.className = 'bars' + (some ? ' some' : '');
		el.replaceChildren(...rows.map((r) => {
			const b = document.createElement(o.pick ? 'button' : 'div');
			b.className = 'b' + (o.pick ? ' click' : '') + (o.on && o.on(r) ? ' on' : '');
			if (o.pick) { b.type = 'button'; b.setAttribute('aria-pressed', String(!!(o.on && o.on(r)))); b.onclick = (e) => o.pick(r, e); }
			b.innerHTML = `<span class="n">${esc(o.label(r))}</span><span class="t"><span class="f" style="width:0"></span></span><span class="v">${(o.fmt || compact.format)(Number(o.value(r)))}</span>`;
			requestAnimationFrame(() => { b.querySelector('.f').style.width = (Number(o.value(r)) / max * 100) + '%'; });
			return b;
		}));
	}
	// vertical columns for a time series: `ghost(row)` draws an unfiltered value behind, `pick(row)` drills
	function columns (el, rows, o) {
		const vals = rows.map((r) => Number(o.value(r)) || 0), gh = o.ghost ? rows.map((r) => Number(o.ghost(r)) || 0) : [];
		const max = Math.max(...vals, ...gh, 1);
		el.innerHTML = `<div class="colz"></div><div class="axis"><span></span><span></span></div>`;
		const box = el.querySelector('.colz');
		let tip = document.querySelector('.tip'); if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
		rows.forEach((r, i) => {
			const c = document.createElement(o.pick ? 'button' : 'div'); c.className = 'cw' + (o.pick ? ' click' : '');
			if (o.pick) { c.type = 'button'; c.onclick = () => { tip.style.opacity = 0; o.pick(r); }; c.setAttribute('aria-label', `${o.label(r)}: ${(o.fmt || compact.format)(vals[i])}`); }
			c.innerHTML = (o.ghost ? `<span class="g" style="height:${gh[i] / max * 100}%"></span>` : '') + `<span class="c" style="height:0"></span>`;
			c.onmousemove = (e) => { tip.textContent = `${o.label(r)} · ${(o.fmt || compact.format)(vals[i])}${o.ghost ? ' of ' + (o.fmt || compact.format)(gh[i]) : ''}${o.pick ? ' · click to drill in' : ''}`; tip.style.left = Math.max(4, Math.min(e.clientX + 10, innerWidth - tip.offsetWidth - 4)) + 'px'; tip.style.top = (e.clientY - 30) + 'px'; tip.style.opacity = 1; };
			c.onmouseleave = () => { tip.style.opacity = 0; };
			box.appendChild(c);
			requestAnimationFrame(() => { c.querySelector('.c').style.height = Math.max(0.5, vals[i] / max * 100) + '%'; });
		});
		const ax = el.querySelectorAll('.axis span');
		ax[0].textContent = rows.length ? o.label(rows[0]) : ''; ax[1].textContent = rows.length > 1 ? o.label(rows[rows.length - 1]) : '';
	}
	// a plain table: cols = [{ key, label, fmt?, num? }]; `on(row)` highlights, `pick(row)` makes rows clickable
	function table (el, cols, rows, o = {}) {
		el.innerHTML = `<div class="tw"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
		const tb = el.querySelector('tbody');
		rows.forEach((r) => {
			const tr = document.createElement('tr');
			if (o.on && o.on(r)) tr.className = 'on';
			if (o.pick) { tr.classList.add('click'); tr.tabIndex = 0; tr.onclick = () => o.pick(r); tr.onkeydown = (e) => { if (e.key === 'Enter') o.pick(r); }; }
			tr.innerHTML = cols.map((c) => `<td class="${c.num ? 'num' : ''}">${esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key])}</td>`).join('');
			tb.appendChild(tr);
		});
	}
	function status (q, el) {
		el.classList.toggle('err', q.state === 'error');
		el.textContent = q.state === 'error' ? `Couldn't load: ${q.error.message}` : q.state === 'executing' ? 'Running…' : q.result ? `${int.format(q.result.rows.length)} ${q.result.rows.length === 1 ? 'row' : 'rows'}` : '';
	}
	const cond = (c) => !c || !c.operator || (c.values && !c.values.length && !/null/.test(c.operator)) ? null
		: c.operator === 'transform_date_drill' ? `grain → ${String(c.values[0]).replace('datetrunc ', '')}`
		: `${c.operator.replace(/_/g, ' ')} ${(c.values || []).map((v) => JSON.stringify(v)).join(', ')}`;
	// "What the SDK sent": per query, the reader input anfra ran it with; the AQL it ran shows beside the app
	function sent (el, app, queries, extra) {
		const lines = queries.map((q) => {
			const parts = app.mappingsTo(q.name).map((m) => m.kind === 'control' ? (cond(m.from.appliedCondition) ? `${m.field} ${cond(m.from.appliedCondition)}` : null) : null).filter(Boolean);
			const sel = app.selectionExpressionFor(q.name, 'applied') || app.selectionConditionsFor(q.name, 'applied').map((c) => `${c.field} ${cond(c)}`).join(' AND ');
			if (sel) parts.push(`selection → ${sel}`);
			return `<div><span class="q">${esc(q.name)}</span> ← ${parts.length ? esc(parts.join('  AND  ')) : '<span class="none">no reader input</span>'}</div>`;
		}).join('') + (extra ? extra().filter(Boolean).map((t) => `<div>${esc(t)}</div>`).join('') : '');
		el.innerHTML = `<div class="h"><span>What the SDK sent to anfra</span></div>${lines}`;
	}
	window.K = { css, money, compact, int, esc, $, bars, columns, table, status, sent, cond };
}

// ---------- the mini apps ----------
// Each: h (frame height in px), html (its body), js (runs with Anfra and K in scope).
// Each app lives in live-apps/<card id>.js as LIVE['<id>'] = { h, html, js }.
const LIVE = {};

// ---------- on the page: host the frames ----------
const LiveHost = (() => {
	let ready = null, fontCss = '';
	const base = new URL('api', location.href).href.replace(/\/$/, '');
	function boot () {
		if (ready) return ready;
		fontCss = [...document.querySelectorAll('style')].map((s) => s.textContent.match(/@font-face\s*{[^}]*}/g) || []).flat().join('\n');
		const client = AnfraHost.coreClient(base);
		ready = AnfraHost.loadDatasets(client).then(({ datasets }) => {
			const pick = { ecommerce: datasets.ecommerce };
			if (!pick.ecommerce) throw new Error('The ecommerce dataset is not available');
			return { datasets: pick, backend: AnfraHost.coreApiBackend(client, { datasets: pick }) };
		});
		ready.catch(() => { ready = null; });
		return ready;
	}
	function definition (spec, title) {
		return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${fontCss}</style><script>(${kit.toString()})();<\/script></head><body>${spec.html}<script>(() => {${spec.js}\n})();<\/script></body></html>`;
	}
	async function mount (container, id, title, onInspect) {
		const spec = LIVE[id];
		container.innerHTML = '<div class="live-wait">Starting a live Data App…</div>';
		container.style.height = spec.h + 'px';
		try {
			const { datasets, backend } = await boot();
			if (!container.isConnected) return null;
			container.innerHTML = '';
			const m = AnfraHost.mountDataApp({ container, definition: definition(spec, title), baseHref: location.href, datasets, backend, title, user: { id: 0, name: 'Gallery visitor', email: 'visitor@example.com', role: 'viewer' }, onInspect });
			if (onInspect) m.setInspecting(true);
			Object.assign(m.frame.style, { width: '100%', height: spec.h + 'px', border: '0', display: 'block' });
			m.frame.title = `Live Data App: ${title}`;
			// a pointer that leaves the frame quickly gives the app no mouseleave, so the page says so (hover apps listen)
			container.addEventListener('mouseleave', () => m.frame.contentWindow?.postMessage({ gallery: 'pointer-left' }, '*'));
			return m;
		} catch (e) {
			container.innerHTML = `<div class="live-wait err">The live app needs the anfra server behind this page (${String(e.message || e)}). The trailer still shows how it works.</div>`;
			return null;
		}
	}
	return { has: (id) => !!LIVE[id], mount };
})();
