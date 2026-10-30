const W = 244, H = 172, GX = 110, GY = 150, LABEL_W = 150;
const $ = (id) => document.getElementById(id);
let metrics = {}, pos = {}, current = null, selected = null, impact = null, range = 'ytd', dataset = null, datasets = [], picker = null, bdField = null, vizType = 'area', me = null, people = [];
let histFilter = 'all', histConn = false; // the History tab's type filter and "+ connected"
const view = { x: 0, y: 0, k: 1 };

function fmt(v, format = '') {
  if (v === null || v === undefined) return '–';
  const pct = format.includes('%');
  const dec = (format.split('.')[1] || '').replace(/[^0#]/g, '').length;
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(pct ? v * 100 : v);
  return (format.includes('$') ? '$' : '') + n + (pct ? '%' : '');
}
function change(a, b, format = '') {
  if (a == null || b == null) return '';
  if (Math.abs(b - a) < 1e-12) return 'no change';
  const s = b > a ? '+' : '−';
  return format.includes('%') ? `${s}${Math.abs((b - a) * 100).toFixed(1)} pp` : `${s}${Math.abs(((b - a) / (a || 1)) * 100).toFixed(1)}%`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const spark = (vals) => Charts.chart(vals, { w: 206, h: 44 });

function layout(list) {
  const level = {};
  const lv = (id) => level[id] ?? (level[id] = metrics[id].references.length ? 1 + Math.max(...metrics[id].references.map(lv)) : 0);
  list.forEach((m) => lv(m.id));
  const max = Math.max(0, ...Object.values(level));
  const rows = Array.from({ length: max + 1 }, (_, i) => list.filter((m) => level[m.id] === i).map((m) => m.id));
  const x = {};
  const place = (row) => row.forEach((id, i) => (x[id] = (i - (row.length - 1) / 2) * (W + GX)));
  const avg = (ids) => ids.length ? ids.reduce((s, id) => s + (x[id] ?? 0), 0) / ids.length : 0;
  place(rows[0]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i <= max; i++) { rows[i].sort((a, b) => avg(metrics[a].references) - avg(metrics[b].references)); place(rows[i]); }
    for (let i = max - 1; i >= 0; i--) { rows[i].sort((a, b) => avg(metrics[a].referencedBy) - avg(metrics[b].referencedBy)); place(rows[i]); }
  }
  pos = {};
  rows.forEach((row, i) => row.forEach((id) => (pos[id] = { x: x[id], y: (max - i) * (H + GY) })));
  return { rows, max };
}

function tag(owner) {
  if (!owner) return '';
  const [kind, val] = owner.split(':');
  return `<small class="tag t-${esc(val)}" title="Owner: ${esc(owner)}">${esc(kind === 'team' ? val : owner)}</small>`;
}

function chg(a, b, format) {
  const t = change(a, b, format);
  if (!t) return '';
  if (t === 'no change') return '<span class="chg">no change</span>';
  return `<span class="chg"><span class="ar">${b > a ? '▲' : '▼'}</span>${esc(t.slice(1))}</span>`;
}

function nodeHtml(m) {
  const n = m.spark.length;
  const foot = m.prev === null || m.prev === undefined
    ? `<span>All time · ${n} ${m.grain}s</span>`
    : `<span>vs prior ${esc(fmt(m.prev, m.format))}</span>${chg(m.prev, m.value, m.format)}`;
  return `<div class="node" id="n-${CSS.escape(m.id)}" data-id="${esc(m.id)}" style="left:${pos[m.id].x}px;top:${pos[m.id].y}px">
<div class="h"><span>${esc(m.label)}</span>${tag(m.owner)}</div>
<div class="v">${esc(fmt(m.value, m.format))}</div>${spark(m.spark)}
<div class="f">${foot}</div>
<div class="imp"></div></div>`;
}

function edgePath(from, to) {
  const a = { x: pos[from].x + W / 2, y: pos[from].y };
  const b = { x: pos[to].x + W / 2, y: pos[to].y + H };
  const my = (a.y + b.y) / 2;
  return `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
}

function drawTree(list) {
  metrics = Object.fromEntries(list.map((m) => [m.id, m]));
  const { max } = layout(list);
  const xs = Object.values(pos).map((p) => p.x);
  const minX = Math.min(...xs) - LABEL_W - 40;
  const levels = Array.from({ length: max + 1 }, (_, i) => `<div class="lvl" style="left:${minX}px;top:${(max - i) * (H + GY) + H / 2 - 10}px">${i === 0 ? 'Base metrics' : `Level ${i}`}</div>`).join('');
  $('nodes').innerHTML = levels + list.map(nodeHtml).join('');
  $('edges').innerHTML = list.flatMap((m) => m.referencedBy.map((d) => `<path data-from="${esc(m.id)}" data-to="${esc(d)}" d="${edgePath(m.id, d)}"/>`)).join('');
  paintMarks();
}

function apply() { $('world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; }

function fit() {
  const ps = Object.values(pos);
  if (!ps.length) return;
  const minX = Math.min(...ps.map((p) => p.x)) - LABEL_W - 40, maxX = Math.max(...ps.map((p) => p.x)) + W;
  const minY = Math.min(...ps.map((p) => p.y)), maxY = Math.max(...ps.map((p) => p.y)) + H;
  const c = $('canvas').getBoundingClientRect(), pad = 60;
  const fitK = Math.min(1.2, (c.width - pad * 2) / (maxX - minX), (c.height - pad * 2) / (maxY - minY));
  // A tree this wide would shrink to specks: keep it readable (at least 0.5) and start at the top, where the derived metrics are.
  view.k = Math.max(0.5, fitK);
  view.x = (c.width - (maxX - minX) * view.k) / 2 - minX * view.k;
  view.y = fitK < 0.5 ? pad - minY * view.k : (c.height - (maxY - minY) * view.k) / 2 - minY * view.k;
  apply();
}

function zoomAt(f, cx, cy) {
  const k = Math.max(0.3, Math.min(2.5, view.k * f));
  view.x = cx - (cx - view.x) * (k / view.k);
  view.y = cy - (cy - view.y) * (k / view.k);
  view.k = k;
  apply();
}

function paintMarks() {
  document.querySelectorAll('.node').forEach((n) => {
    const id = n.dataset.id;
    n.classList.toggle('sel', id === selected);
    const hit = impact && impact.metrics.find((x) => x.id === id);
    n.classList.toggle('hot', !!hit);
    n.querySelector('.imp').innerHTML = hit ? `${hit.changed ? '<span class="changed">changed</span>' : ''}<span class="iv">${esc(fmt(hit.old, hit.format))} → ${esc(fmt(hit.new, hit.format))}</span>` : '';
  });
  document.querySelectorAll('#edges path').forEach((p) => {
    const ids = impact ? impact.metrics.map((x) => x.id) : [];
    p.classList.toggle('hot', ids.includes(p.dataset.from) && ids.includes(p.dataset.to));
    p.classList.toggle('sel', !impact && (p.dataset.from === selected || p.dataset.to === selected));
  });
  const mode = $('mode');
  mode.hidden = !impact;
  if (impact) mode.innerHTML = `<span>${impact.label}</span><button id="endimpact">Hide impact</button>`;
}

async function loadTree() {
  try {
    const list = await (await fetch(`/api/tree?range=${encodeURIComponent(range)}&dataset=${encodeURIComponent(dataset || '')}`)).json();
    $('cstatus').textContent = list.length ? '' : 'No metrics found in the dataset files.';
    drawTree(list);
    return list;
  } catch (e) {
    $('cstatus').textContent = 'Could not reach anfra-metric-log: ' + e.message;
    return [];
  }
}

async function open(v) {
  current = v;
  const [kind, a, b, c] = v.split(':');
  let url;
  if (kind === 'metric') { url = `/p/metric/${encodeURIComponent(a)}?tab=${b || 'insights'}&range=${encodeURIComponent(range)}${bdField ? `&bd=${encodeURIComponent(bdField)}` : ''}&viz=${vizType}&hf=${histFilter}&hc=${histConn ? 1 : 0}${c ? `&hl=${encodeURIComponent(c)}` : ''}`; selected = a; }
  else if (kind === 'notifications') { url = '/p/notifications'; selected = null; }
  else if (kind === 'request') url = `/p/request/${a}`;
  else if (kind === 'new') url = `/p/new${a ? `?metric=${encodeURIComponent(a)}` : ''}`;
  else if (kind === 'settings') url = '/p/settings';
  impact = null;
  if (kind === 'request') {
    const r = await (await fetch(`/api/request/${a}`)).json();
    selected = r.metric;
    if (r.impact) impact = { metrics: r.impact, label: r.state === 'applied' ? 'Impact of this applied change · all time' : 'Impact if approved · all time' };
  }
  paintMarks();
  const html = await (await fetch(url)).text();
  if (current === v) {
    $('view').innerHTML = html; $('view').scrollTop = 0;
    const hl = $('view').querySelector('.hrow.hl');
    if (hl) hl.scrollIntoView({ block: 'center' });
  }
}

async function loadState() {
  const st = await (await fetch('/api/state')).json();
  $('bellcount').hidden = !st.notifications;
  $('bellcount').textContent = st.notifications;
  me = st.me; people = st.people;
  renderAs();
}

const CHEV = '<svg class="dd-chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>';
const TICK = '<svg class="dd-check" viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
// Same markup as the server's dropdown(): one button with its own chevron, one popover list.
function ddHtml({ name, label, options, selected, cls = '' }) {
  return `<div class="dd ${cls}" data-dd="${name}"><button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-label">${esc(label)}</span>${CHEV}</button>
<div class="dd-pop" hidden><div class="dd-list" role="listbox">${options.map((o) => `<button type="button" class="dd-opt" role="option" aria-selected="${o.value === selected}" data-pick="${name}:${esc(o.value)}" data-text="${esc((o.label + ' ' + (o.sub || '')).toLowerCase())}">${TICK}<span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div></div></div>`;
}
function renderDatasets() {
  const el = $('dataset-dd');
  el.hidden = datasets.length < 2;
  if (el.hidden) return;
  const cur = datasets.find((d) => d.name === dataset) || datasets[0];
  el.innerHTML = ddHtml({ name: 'dataset', cls: 'dd-pill left', label: cur.label, selected: cur.name, options: datasets.map((d) => ({ value: d.name, label: d.label })) });
}

function mountPeriod() {
  picker = DatePicker.mount($('period-dd'), {
    initial: range,
    params: () => `&dataset=${encodeURIComponent(dataset || '')}`,
    onMeta: (meta) => {
      // No date field configured for the dataset: there is nothing to filter, so hide the date controls.
      $('period-dd').hidden = !meta.max;
      document.querySelector('.fpill').hidden = !meta.max;
      if (!dataset) dataset = meta.dataset;
      datasets = meta.datasets || [];
      renderDatasets();
      document.querySelector('.filters').hidden = !meta.max && datasets.length < 2;
      $('asof').textContent = meta.max ? new Date(`${meta.max}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'now';
    },
    onChange: (spec) => {
      range = spec;
      if (/\|(day|week|month)$/.test(bdField || '')) bdField = null; // a date grain follows the range again
      loadTree().then(() => { if (current && current.startsWith('metric:')) open(current); });
    },
  });
}
function renderAs() {
  const p = people.find((x) => x.id === me);
  $('as-dd').innerHTML = ddHtml({ name: 'as', cls: 'dd-pill right', label: p ? p.name : '', selected: me, options: people.map((x) => ({ value: x.id, label: x.name, sub: x.role })) });
}

const closeDropdowns = (except) => document.querySelectorAll('.dd.open').forEach((d) => {
  if (d === except) return;
  d.classList.remove('open'); d.querySelector('.dd-pop').hidden = true; d.querySelector('.dd-btn').setAttribute('aria-expanded', 'false');
});
function toggleDropdown(dd) {
  const open = !dd.classList.contains('open');
  closeDropdowns(open ? dd : null);
  dd.classList.toggle('open', open);
  dd.querySelector('.dd-pop').hidden = !open;
  dd.querySelector('.dd-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    const s = dd.querySelector('.dd-search');
    if (s) { s.value = ''; filterOptions(dd, ''); s.focus(); }
    else (dd.querySelector('.dd-opt[aria-selected=true]') || dd.querySelector('.dd-opt')).focus();
  }
}
const visibleOptions = (dd) => [...dd.querySelectorAll('.dd-opt')].filter((o) => !o.hidden);
function filterOptions(dd, q) {
  dd.querySelectorAll('.dd-opt').forEach((o) => (o.hidden = !!q && !o.dataset.text.includes(q)));
  dd.querySelectorAll('.dd-group').forEach((g) => { let n = g.nextElementSibling, any = false; while (n && n.classList.contains('dd-opt')) { if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
}
function pick(value) {
  const i = value.indexOf(':'), name = value.slice(0, i), v = value.slice(i + 1);
  if (name === 'bd') { bdField = v; open(current); }
  if (name === 'viz') { vizType = v; open(current); }
  if (name === 'dataset') {
    dataset = v; bdField = null; renderDatasets();
    open('notifications'); // the open metric belongs to the other dataset
    picker.reload().then(loadTree).then(fit);
  }
  if (name === 'hf') { histFilter = v; open(current); }
  if (name === 'hc') { histConn = v === '1'; open(current); }
  if (name === 'as') {
    fetch('/api/as', { method: 'POST', body: new URLSearchParams({ to: v }) }).then(() => loadState()).then(() => open(current || 'notifications'));
  }
  const dd = document.querySelector(`.dd[data-dd="${name}"]`);
  if (dd && dd.dataset.field) {
    dd.querySelector(`input[name="${dd.dataset.field}"]`).value = v;
    const opt = dd.querySelector(`.dd-opt[data-pick="${name}:${CSS.escape ? v.replace(/"/g, '\\"') : v}"]`);
    dd.querySelector('.dd-btn .dd-label').textContent = opt ? opt.querySelector('span').textContent : v;
    dd.querySelectorAll('.dd-opt').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
  }
}
document.addEventListener('keydown', (e) => {
  const dd = e.target.closest && e.target.closest('.dd');
  if (e.key === 'Escape') { const o = document.querySelector('.dd.open'); if (o) { closeDropdowns(); o.querySelector('.dd-btn').focus(); } return; }
  if (!dd || !dd.classList.contains('open') || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
  const opts = visibleOptions(dd), i = opts.indexOf(document.activeElement);
  if (e.key === 'Enter') { if (i < 0 && opts[0]) opts[0].click(); return; }
  e.preventDefault();
  (opts[e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)] || opts[0]).focus();
});

// Theme: the head script sets data-theme before paint; this toggles it and remembers the choice.
const themeBtn = () => $('theme');
function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeBtn().title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}
function setTheme(t, remember) {
  document.documentElement.dataset.theme = t;
  if (remember) { try { localStorage.setItem('theme', t); } catch (e) { /* private mode: the choice just lasts this visit */ } }
  syncThemeButton();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let saved = null; try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
  if (!saved) setTheme(e.matches ? 'dark' : 'light', false);
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#theme')) { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true); return; }
  const btn = e.target.closest('.dd-btn');
  if (btn) { toggleDropdown(btn.closest('.dd')); return; }
  const pk = e.target.closest('[data-pick]');
  if (pk) { closeDropdowns(); pick(pk.dataset.pick); return; }
  if (!e.target.closest('.dd')) closeDropdowns();
  const t = e.target.closest('[data-open]');
  if (t) { e.preventDefault(); open(t.dataset.open); return; }
  if (e.target.id === 'endimpact') { impact = null; paintMarks(); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    const text = cp.dataset.copy;
    const done = () => { cp.textContent = 'Copied'; cp.classList.add('done'); setTimeout(() => { cp.textContent = 'Copy'; cp.classList.remove('done'); }, 1400); };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done, () => {
      const ta = document.querySelector('textarea[name=sentence]');
      if (ta) { ta.value = text; done(); }
    });
    return;
  }
  const tg = e.target.closest('[data-toggle]');
  if (tg) {
    const f = document.querySelector('.' + tg.dataset.toggle);
    if (f) { f.hidden = !f.hidden; tg.setAttribute('aria-expanded', String(!f.hidden)); const inp = f.querySelector('input:not([type=hidden]), textarea'); if (inp && !f.hidden) inp.focus(); }
    return;
  }
  const n = e.target.closest('.node');
  const onMetric = current && current.startsWith('metric:');
  if (n && !moved) { open(onMetric && n.dataset.id === selected ? 'notifications' : `metric:${n.dataset.id}:insights`); return; }
  // Empty canvas (a click, not a drag) deselects the metric and returns to the home state.
  if (!n && !moved && onMetric && e.target.closest('#canvas') && !e.target.closest('.zoom, #mode, .filters')) open('notifications');
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-post]');
  if (!form) return;
  e.preventDefault();
  const btn = e.submitter;
  const action = (btn && btn.getAttribute('formaction')) || form.dataset.post;
  const err = form.querySelector('.ferr');
  const label = btn ? btn.textContent : '';
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  if (btn && form.dataset.busy && !btn.getAttribute('formaction')) btn.textContent = form.dataset.busy;
  if (err) err.textContent = '';
  try {
    const res = await fetch(action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
    const out = await res.json();
    if (out.error) throw new Error(out.error);
    if (out.refresh) await loadTree();
    await loadState();
    await open(out.open || form.dataset.next || current);
  } catch (ex) {
    if (err) err.textContent = ex.message;
    form.querySelectorAll('button').forEach((b) => (b.disabled = false));
    if (btn) btn.textContent = label;
  }
});

let drag = null, moved = false;
$('canvas').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.zoom, #mode, .filters')) return;
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  moved = false;
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; $('canvas').classList.add('panning'); }
  view.x = drag.vx + dx; view.y = drag.vy + dy; apply();
});
window.addEventListener('pointerup', () => { drag = null; $('canvas').classList.remove('panning'); setTimeout(() => (moved = false), 0); });
$('canvas').addEventListener('wheel', (e) => {
  e.preventDefault();
  const c = $('canvas').getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - c.left, e.clientY - c.top);
}, { passive: false });
const center = () => { const c = $('canvas').getBoundingClientRect(); return [c.width / 2, c.height / 2]; };
$('zin').addEventListener('click', () => zoomAt(1.2, ...center()));
$('zout').addEventListener('click', () => zoomAt(1 / 1.2, ...center()));
$('zfit').addEventListener('click', fit);
window.addEventListener('resize', fit);

document.addEventListener('input', (e) => {
  if (e.target.matches('.dd-search')) { filterOptions(e.target.closest('.dd'), e.target.value.trim().toLowerCase()); return; }
  if (!e.target.matches('.search input')) return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.entries .entry, .entries .hrow').forEach((n) => (n.hidden = q && !n.dataset.search.includes(q)));
});

// History: hovering a pin lights its row, and the reverse.
const lightHistory = (id) => document.querySelectorAll('.hrow, .hpin').forEach((n) => n.classList.toggle('lit', !!id && n.dataset.eid === id));
document.addEventListener('mouseover', (e) => {
  const n = e.target.closest && e.target.closest('.hrow, .hpin');
  lightHistory(n ? n.dataset.eid : null);
});

(async () => {
  syncThemeButton();
  mountPeriod();
  open('notifications');
  await loadState();
  await loadTree();
  fit();
})();
