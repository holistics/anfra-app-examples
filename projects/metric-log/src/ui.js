const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(v, format = '') {
  if (v === null || v === undefined) return '–';
  const pct = format.includes('%');
  const dec = (format.split('.')[1] || '').replace(/[^0#]/g, '').length;
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    .format(pct ? v * 100 : v);
  return (format.includes('$') ? '$' : '') + n + (pct ? '%' : '');
}

function delta(a, b, format = '') {
  if (a === null || b === null || a === undefined || b === undefined) return { text: '–', cls: '' };
  if (Math.abs(b - a) < 1e-12) return { text: 'no change', cls: 'flat' };
  const up = b > a;
  const text = format.includes('%')
    ? `${up ? '+' : '−'}${Math.abs((b - a) * 100).toFixed(1)} pp`
    : `${up ? '+' : '−'}${Math.abs(((b - a) / (a || 1)) * 100).toFixed(1)}%`;
  return { text, cls: up ? 'up' : 'down' };
}

function when(iso) {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

const CHEVRON = '<svg class="dd-chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>';
const CHECK = '<svg class="dd-check" viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';

// One dropdown for the whole app: a button with its own chevron and a popover list.
// groups: [{ title?, options: [{ value, label, sub? }] }]. Each option button carries data-pick="<name>:<value>".
function dropdown({ name, label, groups, selected, search = false, title = '', field = '', cls = '' }) {
  const options = groups.map((g) => `${g.title ? `<div class="dd-group">${esc(g.title)}</div>` : ''}${g.options.map((o) => `<button type="button" class="dd-opt" role="option" aria-selected="${o.value === selected}" data-pick="${esc(name)}:${esc(o.value)}" data-text="${esc((o.label + ' ' + (o.sub || '')).toLowerCase())}">${CHECK}<span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}`).join('');
  return `<div class="dd ${cls}" data-dd="${esc(name)}"${field ? ` data-field="${esc(field)}"` : ''}>${field ? `<input type="hidden" name="${esc(field)}" value="${esc(selected)}">` : ''}<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" ${title ? `title="${esc(title)}"` : ''}>${label}${CHEVRON}</button>
<div class="dd-pop" hidden>${search ? '<input class="dd-search" type="search" placeholder="Search" autocomplete="off">' : ''}<div class="dd-list" role="listbox">${options}</div></div></div>`;
}

module.exports = { esc, fmt, delta, when, dropdown };
