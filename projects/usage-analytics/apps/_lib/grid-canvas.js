// Layout grid for a dashboard canvas: a Grid button in the top bar opens a popover to set the columns. While the grid is on,
// the app's resize and move handles suggest the column edges with a guide line and snap to them; "Snap to grid" in the popover
// turns the snapping off and leaves the grid drawn as a plain overlay. Dragging is free either way.
// Add, in this order: <script src="_lib/grid-logic.js"></script><script src="_lib/grid-canvas.js"></script>
// Load it after edit-mode.js and the Grid button joins the Edit | Feedback | Tweaks bar; without edit-mode.js it floats at the top right.
//
// Mark the canvas the grid is drawn over (the element whose edges the columns are measured from):
//   <div class="shell" data-grid-canvas>
// A page with several dashboards (tabs) marks each switch, so each dashboard keeps its own settings:
//   <button role="tab" data-grid-dashboard="overview" aria-selected="true">Dashboard</button>
// Without those, the page is one dashboard.
//
// Settings: Stretch (columns fill the canvas, minus a margin: 12 columns, 24px margin, 16px gutter) or Center (fixed-width
// columns in the middle: 12 columns, 64px wide, 16px gutter). Every number is editable. They are kept in this browser, per dashboard;
// where storage is blocked they last until reload.
//
// Three switches, all on by default, tell the app how a drag should behave. The grid reads them; the app acts on them:
//   Snap to grid            edges land on column edges (this file does it, through snapX below)
//   Smart shifting          a block dragged onto another makes it slide out of the way
//   Prioritize non-overlap  a dragged block settles in the nearest free spot instead of landing on another
// The app reads GridCanvas.settings() -> { on, snap, shift, avoid, ... } and uses place-logic.js for the last two.
//
// For the app: while the grid is on, <html> has data-grid-on. A drag handler asks where to land:
//   const hit = GridCanvas.snapX([left, right], { y: top, off: e.altKey });   // x positions in viewport pixels
//   if (hit) shift the drag by hit.delta      // the guide line and column highlight are drawn for you
//   GridCanvas.clear()                        // on pointer up
// `hit` is null when no column edge is within reach (the drag stays free), the grid or its "Snap to grid" setting is off,
// or `off` is true (Alt held).
(() => {
  const L = window.GridLogic;
  if (!L) { console.warn('grid-canvas.js needs grid-logic.js loaded first'); return; }
  if (window.GridCanvas) return;

  const THRESHOLD = 10;   // px from a column edge within which a drag snaps to it
  const page = location.protocol === 'about:' ? document.title : location.pathname;   // srcdoc pages all say "srcdoc"
  const KEY = 'gc-grid:' + page;
  const store = (() => { try { localStorage.setItem('gc-probe', '1'); localStorage.removeItem('gc-probe'); return localStorage; } catch (e) { return null; } })();
  let all = (() => { try { return JSON.parse(store?.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } })();   // { [dashboard]: settings }
  const persist = () => { try { store?.setItem(KEY, JSON.stringify(all)); } catch (e) {} };

  const canvas = () => document.querySelector('[data-grid-canvas]') || document.body;
  // The dashboard the user is looking at: the marked switch that is selected.
  const dashboard = () => {
    const el = document.querySelector('[data-grid-dashboard][aria-selected="true"]') || document.querySelector('[data-grid-dashboard].active');
    return el ? { key: el.dataset.gridDashboard, name: el.textContent.trim() || el.dataset.gridDashboard } : { key: 'default', name: 'this page' };
  };
  const cur = () => L.revive(all[dashboard().key]);
  const update = (fn) => {
    const s = cur(); fn(s);
    all[dashboard().key] = L.compact(s);
    persist(); sync();
    document.dispatchEvent(new CustomEvent('grid-canvas:change', { detail: { dashboard: dashboard().key, settings: cur() } }));
  };

  // ---- The grid drawn over the canvas ----

  const ovHost = document.createElement('div');
  ovHost.style.cssText = 'all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:30;pointer-events:none';
  ovHost.setAttribute('data-grid-overlay', '');
  const ovRoot = ovHost.attachShadow({ mode: 'open' });
  // Where edit-mode.js is switched off (a page's view mode), the grid is not drawn and G does nothing.
  const offCss = document.createElement('style');
  offCss.textContent = 'html[data-edit-mode-off] > body > [data-grid-overlay]{display:none!important}';
  document.head.appendChild(offCss);
  ovRoot.innerHTML = `<style>
    .cv{position:absolute;pointer-events:none;overflow:visible}
    .cv[hidden]{display:none}
    .bands i{position:absolute;top:0;bottom:0;background:var(--band)}
    .bands i.hot{background:var(--hot)}
    .gl{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--line)}
    .chip{position:absolute;padding:2px 7px;border-radius:5px;background:var(--line);color:#fff;font:600 11px/16px Inter,system-ui,sans-serif;white-space:nowrap}
    @media print{.cv{display:none}}
  </style><div class="cv" hidden><div class="bands"></div><div class="guides"></div></div>`;
  const cv = ovRoot.querySelector('.cv'), bands = ovRoot.querySelector('.bands'), guides = ovRoot.querySelector('.guides');

  function layout () {
    const s = cur();
    document.documentElement.toggleAttribute('data-grid-on', s.on);
    cv.hidden = !s.on;
    if (!s.on) { guides.innerHTML = ''; return; }
    const r = canvas().getBoundingClientRect();
    cv.style.left = r.left + scrollX + 'px'; cv.style.top = r.top + scrollY + 'px';
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    cv.style.setProperty('--band', L.rgba(s.color, s.opacity));
    cv.style.setProperty('--hot', L.rgba(s.color, Math.min(100, s.opacity * 2.5)));
    cv.style.setProperty('--line', L.rgba(s.color, 100));
    bands.innerHTML = L.columns(s, r.width).map((c, i) => `<i data-c="${i + 1}" style="left:${c.left}px;width:${c.right - c.left}px"></i>`).join('');
  }

  // The line and column highlight for the edges a drag has snapped to; `y` (viewport px) is where the label goes.
  function showGuides (hits, rect, y) {
    layout();
    const top = (typeof y === 'number' ? y - rect.top : Math.max(0, -rect.top) + 56) - 24;
    guides.innerHTML = hits.map((h) => {
      const flip = h.x > rect.width - 150;
      return `<div class="gl" style="left:${h.x}px"></div><span class="chip" style="top:${Math.max(0, top)}px;left:${h.x}px;transform:translateX(${flip ? 'calc(-100% - 6px)' : '6px'})">${L.describe(h)}</span>`;
    }).join('');
    hits.forEach((h) => bands.querySelector(`[data-c="${h.col}"]`)?.classList.add('hot'));
  }
  const clear = () => { guides.innerHTML = ''; bands.querySelectorAll('.hot').forEach((b) => b.classList.remove('hot')); };

  function snapX (candidates, opts = {}) {
    const s = cur();
    if (!s.on || !s.snap || opts.off) { clear(); return null; }
    clear();
    const r = canvas().getBoundingClientRect();
    const res = L.snap(L.edges(L.columns(s, r.width)), candidates.map((x) => x - r.left), THRESHOLD);
    if (!res) return null;
    showGuides(res.hits, r, opts.y);
    return res;
  }

  // ---- Button and popover ----

  const svg = (d) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = svg('<rect x="2.5" y="2.5" width="3" height="11" rx="0.8"/><rect x="6.5" y="2.5" width="3" height="11" rx="0.8"/><rect x="10.5" y="2.5" width="3" height="11" rx="0.8"/>');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const uiHost = document.createElement('div');
  uiHost.setAttribute('data-edit-mode-ignore', '');
  uiHost.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147482500;pointer-events:none';
  const ui = uiHost.attachShadow({ mode: 'open' });
  ui.innerHTML = `<style>
    *{box-sizing:border-box;font:13px/1.4 Inter,system-ui,sans-serif}
    [hidden]{display:none!important}
    .float{position:fixed;top:8px;right:12px;pointer-events:auto}
    .gbtn{display:flex;align-items:center;gap:6px;border:1px solid #444;background:#1c1c1f;color:#eee;border-radius:8px;padding:4px 10px;cursor:pointer;white-space:nowrap}
    .gbtn:hover{background:#2a2a2e}
    .gbtn.on{background:#6366f1;border-color:#6366f1;color:#fff}
    .pop{position:fixed;width:288px;background:#1c1c1f;color:#e8e8ea;border:1px solid #444;border-radius:12px;padding:12px;pointer-events:auto;box-shadow:0 8px 28px #000a}
    .hd{display:flex;align-items:center;gap:8px;margin-bottom:2px}
    .hd b{flex:1;font-size:14px;font-weight:600}
    .for{margin:0 0 10px;color:#8a8a92;font-size:11px}.for b{color:#bbb;font-weight:600}
    .sw{position:relative;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:#3a3a40;cursor:pointer;flex:none;transition:background .12s}
    .sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .12s}
    .sw[aria-checked="true"]{background:#6366f1}.sw[aria-checked="true"]::after{transform:translateX(14px)}
    .sw:focus-visible,.seg button:focus-visible,.f input:focus-visible,.ft button:focus-visible{outline:2px solid #8a8aff;outline-offset:1px}
    .seg{display:flex;background:#252528;border-radius:8px;padding:2px;gap:2px;margin-bottom:10px}
    .seg button{flex:1;border:0;background:transparent;color:#a0a0a8;border-radius:6px;padding:5px 8px;font-size:12px;cursor:pointer}
    .seg button.on{background:#3d3d44;color:#fff}
    .f{display:flex;align-items:center;gap:6px;background:#252528;border:1px solid #38383c;border-radius:7px;padding:0 10px;height:32px;margin-bottom:6px}
    .f span{flex:1;color:#a0a0a8}
    .f input{background:transparent;border:0;color:#eee;text-align:right;font:12px ui-monospace,Menlo,monospace;width:62px;outline:0;min-width:0}
    .f input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    .f em{color:#777;font-style:normal;font-size:11px}
    .f input[type=color]{width:22px;height:22px;padding:0;border:1px solid #555;border-radius:4px;background:none;cursor:pointer}
    .f input[type=color]::-webkit-color-swatch-wrapper{padding:0}.f input[type=color]::-webkit-color-swatch{border:0;border-radius:3px}
    .f .hex{width:68px;text-transform:uppercase}.f .op{width:34px}
    .ft{display:flex;align-items:center;gap:8px;margin-top:10px}
    .ft small{flex:1;color:#8a8a92;font-size:11px;line-height:1.3}
    .ft button{border:0;background:transparent;color:#8a8aff;font-size:12px;cursor:pointer;padding:2px 4px;border-radius:4px}
  </style>
  <div class="float" hidden><button class="gbtn" data-tip="Layout grid" aria-haspopup="dialog" aria-expanded="false">${ICON}<span>Grid</span></button></div>
  <div class="pop" role="dialog" aria-label="Layout grid" hidden>
    <div class="hd"><b>Layout grid</b><button class="sw" role="switch" aria-checked="false" aria-label="Show grid"></button></div>
    <p class="for"></p>
    <div class="f" title="Dragged edges land exactly on a column edge when one is near"><span>Snap to grid</span><button class="sw snap" role="switch" aria-checked="true" aria-label="Snap to grid"></button></div>
    <div class="f" title="A block you drag onto another one makes it slide out of the way"><span>Smart shifting</span><button class="sw shift" role="switch" aria-checked="true" aria-label="Smart shifting"></button></div>
    <div class="f" title="A dragged block settles in the nearest free spot instead of landing on another block"><span>Prioritize non-overlap</span><button class="sw avoid" role="switch" aria-checked="true" aria-label="Prioritize non-overlap"></button></div>
    <div class="seg" role="group" aria-label="Grid type"><button data-type="stretch">Stretch</button><button data-type="center">Center</button></div>
    <label class="f"><span>Number of columns</span><input type="number" data-k="count" min="1" max="24"></label>
    <label class="f" data-for="stretch"><span>Margin</span><input type="number" data-k="margin" min="0"><em>px</em></label>
    <label class="f" data-for="center"><span>Width</span><input type="number" data-k="width" min="1"><em>px</em></label>
    <label class="f"><span>Gutter</span><input type="number" data-k="gutter" min="0"><em>px</em></label>
    <div class="f"><span>Color</span><input type="color" class="clr" aria-label="Grid colour"><input class="hex" maxlength="7" aria-label="Grid colour hex"><input type="number" class="op" min="0" max="100" aria-label="Opacity"><em>%</em></div>
    <div class="ft"><small>Hold Alt while dragging to skip snapping and shifting once.</small><button class="reset" type="button">Reset</button></div>
  </div>`;
  const $ = (s) => ui.querySelector(s);
  if (!store) $('.ft small').textContent += ' Storage is blocked here, so these settings reset on reload.';
  const pop = $('.pop'), sw = $('.sw'), floatBox = $('.float');

  // In the edit-mode bar when it is there; otherwise floating at the top right.
  const bar = window.EditModeBar;
  let btn;
  if (bar && bar.slot) {
    const st = document.createElement('style');
    st.textContent = '.gbtn.on{background:#6366f1;border-color:#6366f1;color:#fff}';
    bar.root.appendChild(st);
    btn = document.createElement('button');
    btn.className = 'gbtn';
    btn.innerHTML = ICON + '<span>Grid</span>';
    btn.dataset.tip = 'Layout grid'; btn.dataset.key = 'G';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    bar.slot.appendChild(btn);
  } else {
    btn = $('.gbtn'); floatBox.hidden = false;
  }

  function placePop () {
    const r = btn.getBoundingClientRect();
    pop.style.top = r.bottom + 8 + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + 'px';
  }
  const isOpen = () => !pop.hidden;
  function open (on) {
    pop.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) { sync(); placePop(); }
  }

  // Put the settings of the current dashboard into the button and the popover.
  function sync () {
    const s = cur(), cfg = s.type === 'center' ? s.center : s.stretch;
    btn.classList.toggle('on', s.on);
    sw.setAttribute('aria-checked', String(s.on));
    $('.snap').setAttribute('aria-checked', String(s.snap));
    $('.shift').setAttribute('aria-checked', String(s.shift));
    $('.avoid').setAttribute('aria-checked', String(s.avoid));
    $('.for').innerHTML = `Applies to <b>${esc(dashboard().name)}</b> only.`;
    pop.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.type === s.type));
    pop.querySelectorAll('[data-for]').forEach((f) => { f.hidden = f.dataset.for !== s.type; });
    pop.querySelectorAll('input[data-k]').forEach((i) => { if (ui.activeElement !== i && cfg[i.dataset.k] !== undefined) i.value = cfg[i.dataset.k]; });
    const clr = $('.clr'), hex = $('.hex'), op = $('.op');
    clr.value = s.color;
    if (ui.activeElement !== hex) hex.value = s.color.slice(1);
    if (ui.activeElement !== op) op.value = s.opacity;
    layout();
    if (isOpen()) requestAnimationFrame(placePop);
  }

  btn.addEventListener('click', () => open(!isOpen()));
  sw.addEventListener('click', () => update((s) => { s.on = !s.on; }));
  $('.snap').addEventListener('click', () => update((s) => { s.snap = !s.snap; }));
  $('.shift').addEventListener('click', () => update((s) => { s.shift = !s.shift; }));
  $('.avoid').addEventListener('click', () => update((s) => { s.avoid = !s.avoid; }));
  pop.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => update((s) => { s.type = b.dataset.type; })));
  // Numbers apply as they are typed; a half-typed or empty value waits, and the field is corrected when it loses focus.
  pop.querySelectorAll('input[data-k]').forEach((i) => {
    i.addEventListener('input', () => { if (i.value !== '' && Number.isFinite(+i.value)) update((s) => { s[s.type][i.dataset.k] = +i.value; }); });
    i.addEventListener('change', sync);
  });
  $('.clr').addEventListener('input', (e) => update((s) => { s.color = e.target.value; }));
  $('.hex').addEventListener('input', (e) => { if (/^[0-9a-f]{6}$/i.test(e.target.value)) update((s) => { s.color = '#' + e.target.value; }); });
  $('.hex').addEventListener('change', sync);
  $('.op').addEventListener('input', (e) => { if (e.target.value !== '') update((s) => { s.opacity = +e.target.value; }); });
  $('.op').addEventListener('change', sync);
  // Reset puts the numbers, colour and switches back to the defaults and leaves the grid on or off as it was.
  $('.reset').addEventListener('click', () => update((s) => { const on = s.on; Object.assign(s, L.normalize({ on })); }));

  document.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    const path = e.composedPath();
    if (path.includes(pop) || path.includes(btn)) return;
    open(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { open(false); return; }
    const t = e.composedPath()[0];
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.documentElement.hasAttribute('data-edit-mode-off')) return;
    update((s) => { s.on = !s.on; });
  });

  // ---- Keeping up with the page ----

  let queued = 0;
  const relayout = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => { if (cur().on) layout(); }); };
  new ResizeObserver(relayout).observe(canvas());
  addEventListener('resize', () => { relayout(); if (isOpen()) placePop(); });
  addEventListener('load', relayout);
  // Another dashboard (tab) was picked: show its settings.
  new MutationObserver(() => { sync(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });

  document.body.appendChild(ovHost);
  document.body.appendChild(uiHost);
  window.GridCanvas = { snapX, clear, active: () => cur().on, settings: cur };
  sync();
})();
