// DOM helpers. Every dynamic value is escaped by esc() before it enters HTML; links go through safeUrl().
import { fmtVnd, fmtDate, fmtDateTime, fmtPercent, businessToday } from '../../shared/format.mjs';
export { fmtVnd, fmtDate, fmtDateTime, fmtPercent, businessToday };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}
export function link(u, text) {
  const href = safeUrl(u);
  return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text ?? shortUrl(href))}</a>` : '<span class="muted">—</span>';
}
export function shortUrl(u) { try { const x = new URL(u); return x.host + x.pathname.replace(/\/$/, ''); } catch { return u; } }
export const vnd = (v, { unknown = 'Amount unknown' } = {}) => (v === null || v === undefined ? `<span class="chip warn">${esc(unknown)}</span>` : `${esc(fmtVnd(v))} VND`);
export const pct = (v, unavailable = 'Not applicable') => (v === null || v === undefined ? `<span class="muted">${esc(unavailable)}</span>` : esc(fmtPercent(v)));
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function toast(message, kind = '') {
  let box = qs('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 4500);
}

// A banner for an AppError: what happened, what to do, and the raw detail behind a toggle.
export function errorBanner(err, { actions = '' } = {}) {
  const kind = err?.kind === 'conflict' || err?.kind === 'version_required' ? 'warn' : 'bad';
  const title = { conflict: 'Newer changes exist', forbidden: 'Not allowed', invalid: 'Missing or invalid information', not_found: 'Not found',
    network: 'Connection lost', version_required: 'Reload needed', unknown: 'Not saved' }[err?.kind] ?? 'Something went wrong';
  const detail = [err?.code, err?.detail].filter(Boolean).join(' · ');
  return `<div class="banner ${kind}" role="alert"><b>${esc(title)}.</b> ${esc(err?.message ?? String(err))}
    ${actions ? `<div class="actions">${actions}</div>` : ''}
    ${detail ? `<details><summary>Technical details</summary><span class="mono">${esc(detail)}</span></details>` : ''}</div>`;
}

export function loading(text = 'Loading…') {
  return `<div class="card" aria-busy="true"><p class="muted">${esc(text)}</p><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div>`;
}

export function emptyState(text) { return `<div class="empty">${esc(text)}</div>`; }

// Form values as a plain object; empty strings become null so they clear optional fields.
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

// Marks fields named in a server error (when known) and returns focus to the first.
export function markInvalid(form, names = []) {
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const n of names) { const el = form.elements[n]; if (el) el.setAttribute('aria-invalid', 'true'); }
  const first = names.map((n) => form.elements[n]).find(Boolean);
  if (first?.focus) first.focus();
}

// Runs a save with the button disabled, so a double click cannot send twice; the form keeps its values on error.
export async function saving(button, fn) {
  if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = 'Saving…'; }
  try { return await fn(); } finally { if (button) { button.disabled = false; button.textContent = button.dataset.label; } }
}

export function options(dict, selected, { blank } = {}) {
  const items = Object.entries(dict).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`);
  return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') + items.join('');
}

export function peopleOptions(people, selected, { roles, blank = '— choose a person —' } = {}) {
  const list = roles ? people.filter((p) => p.roles.some((r) => roles.includes(r))) : people;
  const role = { bd: 'BD', account: 'Account', finance: 'Finance', design: 'Design', studio: 'Studio', admin: 'Admin' };
  return `<option value="">${esc(blank)}</option>` + list.map((p) => `<option value="${esc(p.user_id)}" ${p.user_id === selected ? 'selected' : ''}>${esc(p.display_name)}${p.roles.length ? ` (${esc(p.roles.map((r) => role[r] ?? r).join(', '))})` : ''}</option>`).join('');
}

// <input type="datetime-local"> holds a wall-clock time; it is read and written in the business time zone
// (Asia/Ho_Chi_Minh, +07:00) and sent with an explicit +07:00 offset, whatever the browser's own zone.
export function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}
export function fromLocalInput(v) { return v ? `${v}:00+07:00` : null; }

export function isOverdueDate(d) { return d && d < businessToday(); }
export function dueChip(date, { overdue } = {}) {
  if (!date) return '<span class="muted">No due date</span>';
  const late = overdue ?? isOverdueDate(String(date).slice(0, 10));
  return `<span class="chip ${late ? 'bad' : 'ghost'}">${late ? 'Overdue · ' : 'Due '}${esc(fmtDate(date))}</span>`;
}

// A long table a page at a time, every row reachable: "Rows 11–20 of 48 · ‹ Previous · Page 2 of 5 · Next ›".
// onDraw(container) runs after each page is drawn, to bind the rows' own handlers.
export function pagedTable(container, { rows, pageSize = 10, head, row, empty = '', onDraw } = {}) {
  let page = 1;
  const draw = () => {
    if (!rows.length) { container.innerHTML = empty; onDraw?.(container); return; }
    const last = Math.ceil(rows.length / pageSize);
    page = Math.min(Math.max(1, page), last);
    const from = (page - 1) * pageSize;
    const slice = rows.slice(from, from + pageSize);
    container.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${slice.map((r, i) => row(r, from + i)).join('')}</tbody></table></div>
      ${rows.length > pageSize ? `<div class="pager" role="navigation" aria-label="Pages of this table"><span>Rows ${from + 1}–${from + slice.length} of ${rows.length}</span>
        <button class="btn small" type="button" data-pg="prev" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹ Previous</button>
        <span>Page ${page} of ${last}</span>
        <button class="btn small" type="button" data-pg="next" ${page >= last ? 'disabled' : ''} aria-label="Next page">Next ›</button></div>` : ''}`;
    container.querySelector('[data-pg=prev]')?.addEventListener('click', () => { page -= 1; draw(); });
    container.querySelector('[data-pg=next]')?.addEventListener('click', () => { page += 1; draw(); });
    onDraw?.(container);
  };
  draw();
  return { redraw: draw };
}

// A help tip along the use-case flow: a small button whose text shows on hover, keyboard focus or tap, and is read by
// screen readers (aria-describedby). "Show tips" in the sidebar turns them all off or on.
let tipSeq = 0;
export function tip(text, { step } = {}) {
  const id = `tip-${++tipSeq}`;
  return `<button type="button" class="tip" data-tip aria-label="${step ? `Step ${esc(step)} help` : 'Help'}" aria-describedby="${id}">${step ? esc(step) : '?'}<span role="tooltip" id="${id}" class="tip-text">${step ? `<b>Step ${esc(step)}.</b> ` : ''}${esc(text)}</span></button>`;
}
