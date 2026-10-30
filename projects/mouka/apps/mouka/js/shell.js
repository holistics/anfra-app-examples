// The responsive shell's behaviour (ds/layout.css does the look). Loaded before js/core/main.js, which wires the nav
// buttons (they share .nav-item[data-nav]).
//   · the sidebar's three states on <html>: .rail (icon rail), .nav-open (md / sm: the full sidebar over the page)
//   · collapse / expand: the ‹ button in the sidebar head or the [ key; at md / sm the same control opens the overlay
//   · the edge line: a click collapses / expands (19 Oct, Nhi), a drag resizes (180–320px), or focus it and use ← → Home End; double-click resets; dragging under
//     120px collapses. The width is set on .shell (--nav-w-user), never on <html>, so it is not a design-token edit
//     (the design panel's history and presets ignore it). Session only: the sandbox has no storage.
//   · the More sheet of the xs tab bar, and the as-of stamp it repeats
(() => {
  const root = document.documentElement, shell = document.querySelector('.shell');
  const side = document.querySelector('.sidebar'), handle = document.querySelector('.nav-resize'), toggleBtn = document.querySelector('[data-nav-toggle]');
  const MIN = 180, MAX = 320, SNAP = 120, STEP = 8;
  // the four frame breakpoints live in ds/layout.css; the sidebar only cares about "rail by default" (md, sm) and xs
  const narrow = matchMedia('(max-width: 1023px)'), phone = matchMedia('(max-width: 599px)');
  const st = { collapsed: false, open: false, width: null };

  function apply() {
    const rail = narrow.matches ? !st.open : st.collapsed;
    root.classList.toggle('rail', rail && !phone.matches);
    root.classList.toggle('nav-open', narrow.matches && st.open && !phone.matches);
    root.classList.toggle('nav-collapsed', !narrow.matches && st.collapsed);
    if (st.width && !narrow.matches) shell.style.setProperty('--nav-w-user', `${st.width}px`); else shell.style.removeProperty('--nav-w-user');
    const expanded = !rail;
    toggleBtn?.setAttribute('aria-expanded', String(expanded));
    const label = narrow.matches ? (expanded ? 'Close the sidebar' : 'Open the sidebar') : (expanded ? 'Collapse sidebar' : 'Expand sidebar');
    toggleBtn?.setAttribute('aria-label', label);
    toggleBtn?.setAttribute('title', `${label} ([)`);
    handle?.setAttribute('aria-valuenow', String(Math.round(side.getBoundingClientRect().width)));
  }
  // instant: the [ key (a shortcut never animates) and the first paint; a click glides (ds/layout.css)
  const instantly = (f) => { root.classList.add('nav-instant'); f(); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('nav-instant'))); };
  function toggle() {
    if (phone.matches) return;
    if (narrow.matches) st.open = !st.open; else st.collapsed = !st.collapsed;
    apply();
  }
  const setWidth = (w) => { st.width = Math.max(MIN, Math.min(MAX, Math.round(w))); st.collapsed = false; apply(); };
  narrow.addEventListener('change', () => instantly(() => { st.open = false; apply(); }));
  phone.addEventListener('change', () => instantly(apply));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav-toggle]')) { toggle(); return; }
    if (e.target.closest('[data-nav-scrim]')) { st.open = false; apply(); return; }
    // the overlay closes once a page is picked
    if (st.open && e.target.closest('.sidebar [data-nav]')) { st.open = false; apply(); }
  });
  const typing = (el) => el?.closest?.('input, textarea, select, [contenteditable]');
  document.addEventListener('keydown', (e) => {
    if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) { e.preventDefault(); instantly(toggle); }
    if (e.key === 'Escape' && st.open) { st.open = false; apply(); }
  });

  // ----- resize by dragging the edge; a click on it toggles (19 Oct)
  let clickT = 0;
  handle?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    root.classList.add('nav-resizing');
    const x0 = side.getBoundingClientRect().left, xd = e.clientX;
    let dragged = false;
    const move = (ev) => {
      if (!dragged && Math.abs(ev.clientX - xd) < 4) return;   // a click, so far
      dragged = true;
      const w = ev.clientX - x0;
      if (w < SNAP) { if (!st.collapsed) { st.collapsed = true; apply(); } return; }
      setWidth(w);
    };
    const up = () => {
      // 19 Oct (Nhi): a click on the line collapses or expands; it waits a beat so a double-click can reset the width instead
      if (!dragged) { clearTimeout(clickT); clickT = setTimeout(toggle, 230); }
      root.classList.remove('nav-resizing'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle?.addEventListener('dblclick', () => { clearTimeout(clickT); st.width = null; st.collapsed = false; apply(); });
  handle?.addEventListener('keydown', (e) => {
    const w = side.getBoundingClientRect().width;
    const k = { ArrowLeft: w - STEP, ArrowRight: w + STEP, Home: MIN, End: MAX }[e.key];
    if (k != null) { e.preventDefault(); setWidth(k); }
    if (e.key === 'Enter') { e.preventDefault(); toggle(); }
  });

  // ----- the profile menu (19 Oct): the sidebar clips overflow, so the menu floats (fixed) just above the button
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.me-btn');
    if (!b) return;
    const m = b.nextElementSibling, r = b.getBoundingClientRect();
    m.style.left = `${r.left}px`;
    m.style.bottom = `${innerHeight - r.top + 6}px`;
  });

  // ----- the More sheet (xs)
  const sheet = document.querySelector('.more-sheet');
  const close = () => { if (sheet) sheet.hidden = true; };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { sheet.hidden = !sheet.hidden; return; }
    if (!sheet || sheet.hidden) return;
    // a pick inside the sheet (a page, the design panel) closes it; so does a tap on the scrim
    if (e.target === sheet || e.target.closest('.more-sheet [data-nav], .more-sheet [data-ds-panel]')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  WF.app.subscribe(() => {
    const s = document.getElementById('asof');
    document.querySelectorAll('[data-asof]').forEach((el) => { el.textContent = s?.textContent ?? ''; });
  });

  instantly(apply);
  window.SHELL = { toggle, setWidth, state: st, apply };
})();
