// Date range picker, after Holistics': presets on the left; a two-month calendar, the two dates and a
// rolling/fixed note on the right. Presets are rolling (they count back from the last day with data);
// clicking the calendar or editing a date makes the range fixed.
(function (root) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MS = MONTHS.map((m) => m.slice(0, 3));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parse = (s) => new Date(`${s}T00:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * 86400000));
  const monthStart = (y, m) => iso(new Date(Date.UTC(y, m, 1)));
  const shift = (s, n) => { const d = parse(s); return monthStart(d.getUTCFullYear(), d.getUTCMonth() + n); };
  const nice = (s) => `${MS[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
  const valid = (s) => /^\d{4}-\d\d-\d\d$/.test(s) && iso(parse(s)) === s;
  const CHEV = '<svg class="dd-chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>';
  const TICK = '<svg class="dd-check" viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5"/></svg>';
  const ARROW = (d) => `<svg viewBox="0 0 12 12"><path d="${d}"/></svg>`;

  function mount(el, { onChange, onMeta, params, initial }) {
    let spec = initial || 'all', meta = null, view = null, pending = null, isOpen = false;

    const selection = (hover) => {
      if (pending) { const e = hover || pending; return pending <= e ? [pending, e] : [e, pending]; }
      const c = meta && meta.range.cur;
      return c ? [c[0], addDays(c[1], -1)] : null;
    };

    function month(first, sel) {
      const d = parse(first), y = d.getUTCFullYear(), m = d.getUTCMonth();
      const lead = (d.getUTCDay() + 6) % 7, n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      let cells = '<span></span>'.repeat(lead);
      for (let i = 1; i <= n; i++) {
        const day = monthStart(y, m).slice(0, 8) + String(i).padStart(2, '0');
        const off = (meta.min && day < meta.min) || (meta.max && day > meta.max);
        const cls = ['dp-day', sel && day >= sel[0] && day <= sel[1] ? 'in' : '', sel && day === sel[0] ? 'start' : '', sel && day === sel[1] ? 'end' : ''].join(' ');
        cells += `<button type="button" class="${cls}" data-d="${day}" ${off ? 'disabled' : ''}>${i}</button>`;
      }
      return `<div class="dp-month"><div class="dp-mt">${MONTHS[m]} ${y}</div><div class="dp-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => `<span class="dp-wd">${w}</span>`).join('')}${cells}</div></div>`;
    }

    function render() {
      if (!meta) return;
      const r = meta.range, sel = selection(null);
      if (!view) view = shift(r.cur ? addDays(r.cur[1], -1) : (meta.max || iso(new Date())), -1);
      const key = r.key;
      const presets = meta.presets.map(([k, label]) => `<button type="button" class="dp-opt" data-preset="${k}">${key === k ? TICK : '<span class="dp-gap"></span>'}${esc(label)}</button>`).join('');
      const fixed = key === 'custom';
      const from = sel ? sel[0] : '', to = sel ? sel[1] : '';
      el.innerHTML = `<button type="button" class="dp-btn" aria-haspopup="dialog" aria-expanded="${isOpen}"><span class="dd-label">${esc(r.label)}</span>${CHEV}</button>
<div class="dp-pop" ${isOpen ? '' : 'hidden'}>
<div class="dp-left">${presets}<div class="dp-sep"></div><button type="button" class="dp-opt" data-custom>${fixed ? TICK : '<span class="dp-gap"></span>'}Custom range</button></div>
<div class="dp-right">
<div class="dp-nav"><button type="button" class="dp-arrow" data-nav="-1" aria-label="Previous month">${ARROW('M7.5 2.5L4 6l3.5 3.5')}</button><button type="button" class="dp-arrow" data-nav="1" aria-label="Next month">${ARROW('M4.5 2.5L8 6 4.5 9.5')}</button></div>
<div class="dp-cal">${month(view, sel)}${month(shift(view, 1), sel)}</div>
<div class="dp-note"><span>${fixed || pending ? 'Range as selected' : `Range as of ${nice(r.anchor || meta.max)}`}</span><i title="${fixed ? 'Dates are fixed and will not change over time.' : 'Dates move with the latest day that has data.'}">i</i></div>
<div class="dp-inputs ${fixed || pending ? '' : 'rolling'}"><input type="text" class="dp-from" value="${from}" placeholder="YYYY-MM-DD" aria-label="From"><span class="dp-to">→</span><input type="text" class="dp-end" value="${to}" placeholder="YYYY-MM-DD" aria-label="To"></div>
</div></div>`;
    }

    async function load() {
      meta = await (await fetch(`/api/meta?range=${encodeURIComponent(spec)}${params ? params() : ''}`)).json();
      if (onMeta) onMeta(meta);
      if (meta.max) render(); else el.innerHTML = ''; // a dataset without a date field has nothing to pick
    }
    async function apply(next) {
      spec = next; pending = null; isOpen = false; view = null;
      await load();
      onChange(spec);
    }
    const setOpen = (v) => { isOpen = v; pending = null; if (v) view = null; render(); };

    el.addEventListener('click', (e) => {
      if (e.target.closest('.dp-btn')) { setOpen(!isOpen); return; }
      const p = e.target.closest('[data-preset]');
      if (p) { apply(p.dataset.preset); return; }
      if (e.target.closest('[data-custom]')) { const i = el.querySelector('.dp-from'); if (i) i.focus(); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { view = shift(view, +nav.dataset.nav); render(); return; }
      const d = e.target.closest('.dp-day');
      if (d && !d.disabled) {
        if (!pending) { pending = d.dataset.d; render(); return; }
        const a = pending <= d.dataset.d ? [pending, d.dataset.d] : [d.dataset.d, pending];
        apply(`c:${a[0]}..${a[1]}`);
      }
    });
    el.addEventListener('mouseover', (e) => {
      if (!pending) return;
      const d = e.target.closest('.dp-day');
      if (!d || d.disabled) return;
      const s = selection(d.dataset.d);
      el.querySelectorAll('.dp-day').forEach((b) => {
        b.classList.toggle('in', b.dataset.d >= s[0] && b.dataset.d <= s[1]);
        b.classList.toggle('start', b.dataset.d === s[0]);
        b.classList.toggle('end', b.dataset.d === s[1]);
      });
    });
    el.addEventListener('change', (e) => {
      if (!e.target.matches('.dp-from, .dp-end')) return;
      const a = el.querySelector('.dp-from').value.trim(), b = el.querySelector('.dp-end').value.trim();
      if (valid(a) && valid(b)) apply(`c:${a}..${b}`); else render();
    });
    // composedPath: render() replaces the clicked node, so e.target may no longer be inside el.
    document.addEventListener('click', (e) => { if (isOpen && !e.composedPath().includes(el)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') setOpen(false); });
    load();
    return { reload: () => { view = null; return load(); } };
  }

  root.DatePicker = { mount };
})(this);
