// Edit mode and click-to-comment feedback for prototypes.
// Add, in this order: <script src="_lib/edit-logic.js"></script><script src="_lib/edit-mode.js"></script>
// It replaces feedback.js; do not load both.
//
// Feedback: press F → click any element → type a note → Enter saves it. Add as many as you like.
//   C copies all notes (and style edits) to paste to the agent, X clears the notes. Click a pin to edit or delete its note.
// Edit: press E → click an element → change text, size, spacing, colour, radius, border in the left panel and
//   see it right away. Undo and redo with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z. Save keeps the edits in this browser
//   and re-applies them on load; Discard goes back to the last save. Edits change how the page looks, never its data.
//   Hold Cmd/Ctrl and click to pick several elements: Edit changes them all at once; in Feedback, release the key to
//   write one note for the whole group.
// Esc leaves either mode.
// A slim bar across the top of the page holds the Edit | Feedback | Tweaks switch, so it never covers the app. Hover
// a button to see its shortcut. Edit and Tweaks share the left panel, which has two tabs: Edit (the tools) and Tweaks
// (versions of the page the app offers; press T). Each section of the
// panel folds; hover its title to see the arrow. Copy is a split button: its arrow opens "Clear on copy".
//   The choice is kept in this browser; where storage is blocked, start it on with data-clear-on-copy="true" on this script tag.
// A page with its own view and edit modes starts the bar hidden with data-start-hidden="true" on this script tag, then shows it
// while the page is being edited: EditModeBar.setActive(true). Hidden, the bar, the panel and the shortcuts are all off (saved edits still apply).
// Tweaks: mark each version of an element with data-tweak="key" data-tweak-value="value" (optional:
//   data-tweak-group, data-tweak-label, data-tweak-default). Only the chosen version is shown. For a tweak that
//   is only CSS or JS, declare it: <script type="application/json" data-edit-mode-tweaks>[{"key":"density",
//   "label":"Density","group":"Layout","values":["comfortable","compact"]}]</script>. The choice is set on <html>
//   as data-tweak-<key> (lower case) and sent as an "edit-mode:tweak" event with detail { key, value }.
(() => {
  const L = window.EditLogic;
  if (!L) { console.warn('edit-mode.js needs edit-logic.js loaded first'); return; }
  if (window.__anfraEditMode) return;
  window.__anfraEditMode = true;

  // srcdoc pages all report pathname "srcdoc", so key them by title instead.
  const page = location.protocol === 'about:' ? document.title : location.pathname;
  const NOTES_KEY = 'fb-notes:' + page, EDITS_KEY = 'em-edits:' + page, TWEAKS_KEY = 'em-tweaks:' + page;
  const FOLD_KEY = 'em-fold', CLEAR_KEY = 'em-clear-on-copy', WIDTH_KEY = 'em-panel-width';
  const PANEL_MIN = 300, PANEL_MAX = 360, STRIP_H = 40;
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const svg = d => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    edit: svg('<path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z"/><path d="M9.5 4l2.5 2.5"/>'),
    comment: svg('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>'),
    tweaks: svg('<path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6"/><circle cx="10" cy="5" r="1.5"/><circle cx="6" cy="11" r="1.5"/>'),
    chev: svg('<path d="M4 6l4 4 4-4"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M7 7v4M9 7v4"/>'),
    undo: svg('<path d="M5.5 3L2.5 6l3 3"/><path d="M3 6h6a4 4 0 010 8H6"/>'),
    redo: svg('<path d="M10.5 3l3 3-3 3"/><path d="M13 6H7a4 4 0 000 8h3"/>'),
  };
  // Tooltip: a label and the shortcut as a key cap. Any element with data-tip (and data-key) gets one; see wireTips.
  const TIP_CSS = `
    .tip{position:fixed;display:none;align-items:center;gap:8px;background:#0a0a0b;color:#eee;border:1px solid #444;border-radius:6px;padding:4px 8px;font-size:12px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px #0006}
    .tip.on{display:flex}
    .tip kbd{font:11px ui-monospace,Menlo,monospace;background:#2a2a2e;border:1px solid #444;border-radius:4px;padding:0 5px;color:#ccc}`;
  // Sandboxed iframes throw on localStorage access; then notes, saved edits and the Clear on copy choice live in memory only.
  const store = (() => { try { localStorage.setItem('fb-probe', '1'); localStorage.removeItem('fb-probe'); return localStorage; } catch (e) { return null; } })();
  const load = (key, fallback) => { try { return JSON.parse(store?.getItem(key) || 'null') || fallback; } catch (e) { return fallback; } };

  const clampW = w => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(+w) || PANEL_MIN));
  let panelW = clampW(load(WIDTH_KEY, 320));   // the edit panel's width, which the user drags between PANEL_MIN and PANEL_MAX
  let notes = load(NOTES_KEY, []);
  let saved = load(EDITS_KEY, {});
  let edits = L.clone(saved);
  let tweaks = load(TWEAKS_KEY, {});   // { [key]: the version the user picked }
  let tab = 'edit';           // the panel's tab: 'edit' | 'tweaks'
  const folded = new Set(load(FOLD_KEY, []));   // panel sections the user folded, as "tab:title"
  // Clear on copy starts from data-clear-on-copy on this script tag, and a saved choice wins over it. A saved false must
  // win too, which load() cannot tell from nothing saved.
  const clearDefault = document.currentScript?.dataset.clearOnCopy === 'true';
  const savedClear = (() => { try { return JSON.parse(store?.getItem(CLEAR_KEY)); } catch (e) { return null; } })();
  const startHidden = document.currentScript?.dataset.startHidden === 'true';
  let active = !startHidden;   // false: the bar, panel and shortcuts are off (see setActive)
  let clearOnCopy = typeof savedClear === 'boolean' ? savedClear : clearDefault, copied = false;
  const history = L.createHistory(edits);
  let mode = 'off';           // 'off' | 'feedback' | 'edit' | 'tweaks'
  let hover = null, draft = null;   // feedback: element under the pointer, element with its note box open
  let selEl = null, selSel = '';    // edit: the element the panel reads, and its selector (the first one picked)
  let picked = [];            // [{ el, sel }]: edit: every element being edited; feedback: elements held with Cmd for one note
  let boxUi = {};             // padding and margin: which of None / All / X & Y / Individual the user picked

  // ---- Shadow root: panel, highlight boxes, pins and the bar ----

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font:13px/1.4 Inter,system-ui,sans-serif}
    .hl{position:fixed;border:2px solid #6366f1;background:#6366f11f;border-radius:3px;display:none}
    .sel{position:fixed;border:2px solid #6366f1;border-radius:3px;display:none;box-shadow:0 0 0 1px #fff8}
    .tag{position:fixed;background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;display:none;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pin{position:fixed;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#6366f1;color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px #0006}
    ${TIP_CSS}
    button{border:1px solid #444;background:#1c1c1f;color:#eee;border-radius:999px;padding:6px 12px;cursor:pointer}
    button.on{background:#6366f1;border-color:#6366f1;color:#fff}
    .box{position:fixed;width:280px;background:#1c1c1f;color:#eee;border:1px solid #444;border-radius:8px;padding:8px;pointer-events:auto;box-shadow:0 6px 24px #0008}
    .box small{display:block;color:#999;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    textarea{width:100%;height:64px;resize:none;background:#0a0a0b;color:#eee;border:1px solid #444;border-radius:6px;padding:6px}
    .box textarea{height:auto;min-height:160px;max-height:60vh;field-sizing:content;overflow:auto}
    .grab{height:14px;margin:-8px -8px 4px;border-radius:8px 8px 0 0;display:grid;place-items:center;color:#666;font-size:14px;line-height:1;letter-spacing:2px;cursor:grab;touch-action:none;user-select:none}
    .grab:hover{color:#aaa;background:#ffffff0a}.grab.drag{cursor:grabbing}
    .box .crumbs{padding:0 0 6px;border:0;align-items:center}
    .box .crumbs .sep{color:#666;font-size:11px}
    .row{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}.row button{border-radius:6px;padding:4px 10px}
    /* edit panel */
    .panel{position:fixed;left:0;top:${STRIP_H}px;bottom:0;width:${panelW}px;background:#1a1a1c;color:#e8e8ea;border-right:1px solid #333;overflow-y:auto;overflow-x:hidden;pointer-events:auto;display:none;scrollbar-width:thin;scrollbar-color:#4a4a50 transparent}
    .panel::-webkit-scrollbar{width:8px;background:transparent}
    .panel::-webkit-scrollbar-track,.panel::-webkit-scrollbar-corner{background:transparent}
    .panel::-webkit-scrollbar-thumb{background:#4a4a50;border-radius:4px}
    .grip{position:fixed;top:${STRIP_H}px;bottom:0;left:${panelW - 3}px;width:6px;cursor:ew-resize;pointer-events:auto;display:none;z-index:3}
    .grip.show{display:block}
    .grip.show:hover,.grip.drag{background:#6366f155}
    .panel.on{display:block}
    .hd{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid #333;position:sticky;top:0;background:#1a1a1c;z-index:2}
    .hd b{flex:1;font-size:14px;font-weight:600}
    .hd button,.act{border-radius:6px;padding:4px 10px;font-size:12px;background:transparent;border-color:transparent;color:#bbb}
    .hd button.save{background:#6366f1;border-color:#6366f1;color:#fff}
    .hd button:disabled{opacity:.4;cursor:default}
    .tools{display:flex;align-items:center;gap:4px;padding:8px 12px;border-bottom:1px solid #2c2c2f}
    .tools .ib{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:#ddd;display:grid;place-items:center}
    .tools .ib.on{background:#6366f1}
    .tools .ib:disabled{opacity:.3;cursor:default}
    .tools .tab{border:0;border-radius:6px;background:transparent;color:#a0a0a8;padding:4px 8px}
    .tools .tab:hover{color:#fff}
    .tools .tab.on{background:#2c2c30;color:#fff}
    .tools .gap{flex:1}
    .note{padding:8px 12px 0;color:#888;font-size:11px}
    .tw{margin-bottom:10px}.tw label{display:block;color:#a0a0a8;margin-bottom:4px}
    .panel .tw .seg{margin:0}
    .panel section{padding:12px;border-bottom:1px solid #2c2c2f}
    .panel h4{margin:0 0 8px;font-size:12px;font-weight:600;color:#a0a0a8;display:flex;justify-content:space-between;align-items:center}
    .panel h4 button{padding:0 6px;border:0;background:none;color:#8a8aff;font-size:11px}
    .panel h4 button.fold{display:flex;align-items:center;flex:1;justify-content:flex-start;padding:0;color:inherit;font-size:12px;font-weight:600;text-align:left;border-radius:4px}
    .panel .fold .chev{display:grid;place-items:center;width:12px;margin-left:-12px;opacity:0;transition:opacity .12s,transform .12s}
    .panel .fold .chev svg{width:10px;height:10px}
    .panel section:hover .fold .chev,.panel .fold:focus-visible .chev{opacity:1}
    .panel section.closed .fold .chev{transform:rotate(-90deg)}
    .panel section.closed h4{margin-bottom:0}
    .panel section.closed .body{display:none}
    .f{display:flex;align-items:center;gap:6px;background:#252528;border:1px solid #38383c;border-radius:7px;padding:0 8px;height:30px;margin-bottom:6px;min-width:0}
    .f span{flex:1;min-width:0;color:#a0a0a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .f b{flex:none;font:11px ui-monospace,Menlo,monospace;color:#ddd;font-weight:400}
    .f input,.f select{background:transparent;border:0;color:#eee;text-align:right;font:12px ui-monospace,Menlo,monospace;width:62px;outline:0;min-width:0;flex:none}
    .f select{width:auto;max-width:130px;cursor:pointer}
    .f select option{background:#252528}
    .f input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    .f input[type=color]{width:22px;height:22px;padding:0;border:1px solid #555;border-radius:4px;background:none;cursor:pointer;overflow:hidden}
    .f input[type=color]::-webkit-color-swatch-wrapper{padding:0}
    .f input[type=color]::-webkit-color-swatch{border:0}
    .f em{color:#777;font-style:normal;font-size:11px}
    .f .x{padding:0 4px;border:0;background:none;color:#888;font-size:14px;line-height:1}
    .f .seg{flex:none;margin:0;padding:0;background:transparent;gap:0}
    .f .seg button{display:grid;place-items:center;padding:3px 7px;font-size:11px}
    .f.sz input{width:40px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:0 6px}
    .seg{display:flex;background:#252528;border-radius:7px;padding:2px;gap:2px;margin-bottom:6px}
    .seg button{flex:1;border:0;background:transparent;color:#a0a0a8;border-radius:5px;padding:4px 6px;font-size:11px}
    .seg button.on{background:#3d3d44;color:#fff}
    .crumbs{display:flex;flex-wrap:wrap;gap:4px;padding:10px 12px;border-bottom:1px solid #2c2c2f}
    .crumbs button{padding:2px 8px;font-size:11px;border-radius:5px;background:#252528;border-color:#38383c;color:#bbb;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .crumbs button.on{background:#6366f1;border-color:#6366f1;color:#fff}
    .hint{padding:16px 12px;color:#888}
    .panel textarea{height:48px;background:#252528;border-color:#38383c;margin-bottom:6px;font-size:12px}
    .foot{padding:12px;display:flex;gap:6px}.foot button{flex:1;border-radius:6px;font-size:12px}
  </style><div class="hl"></div><div class="sels"></div><div class="tag"></div><div class="pins"></div><div class="box-slot"></div>
  <div class="panel"></div><div class="grip" title="Drag to resize"></div><div class="tip"></div>`;
  const $ = s => root.querySelector(s);
  const hl = $('.hl'), sels = $('.sels'), tag = $('.tag'), pins = $('.pins'), slot = $('.box-slot'), panel = $('.panel'), grip = $('.grip');

  // The mode switch lives in its own root so it can sit in the app's header: put an element with
  // data-edit-mode-slot where it should go. Without one it floats at the top right of the page.
  const barHost = document.createElement('div');
  const barRoot = barHost.attachShadow({ mode: 'open' });
  barRoot.innerHTML = `<style>
    *{box-sizing:border-box;font:13px/1.4 Inter,system-ui,sans-serif}
    ${TIP_CSS}
    [hidden]{display:none!important}
    .strip{display:flex;align-items:center;justify-content:space-between;gap:12px;height:${STRIP_H}px;padding:0 16px;background:#111113;border-bottom:1px solid #2a2a2e}
    .hint{color:#8a8a92;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar{display:flex;align-items:center;gap:8px}
    .plug{display:contents}
    button{display:flex;align-items:center;gap:6px;border:1px solid #444;background:#1c1c1f;color:#eee;border-radius:8px;padding:4px 10px;cursor:pointer;white-space:nowrap}
    button:hover{background:#2a2a2e}
    .seg{display:flex;gap:2px;padding:2px;background:#1c1c1f;border:1px solid #444;border-radius:10px}
    .seg button{border:0;background:transparent;color:#bbb;border-radius:7px}
    .seg button:hover{background:#2a2a2e}
    .seg button.on{background:#6366f1;color:#fff}
    .split{position:relative;display:flex}
    .split .copy{border-radius:8px 0 0 8px;border-right:0}
    .split .caret{border-radius:0 8px 8px 0;border-left:1px solid #555;padding:4px 7px}
    .menu{position:absolute;right:0;top:34px;min-width:210px;background:#1c1c1f;border:1px solid #444;border-radius:8px;padding:8px 10px;box-shadow:0 6px 24px #0008}
    .menu label{display:flex;align-items:center;gap:8px;cursor:pointer;color:#eee}
    .menu input{accent-color:#6366f1;margin:0}
    .menu small{display:block;margin:4px 0 0 22px;color:#8a8a92;font-size:11px}
    .dot{width:6px;height:6px;border-radius:50%;background:#fbbf24}
    .nosave{color:#999;font-size:11px}
  </style><div class="strip"><span class="hint"></span><div class="bar">
    <span class="nosave" data-tip="Storage is blocked here, so notes and saved edits last until reload" hidden>Not saved</span>
    <button class="clr" data-tip="Clear notes" data-key="X" hidden>${ICON.trash}</button>
    <div class="split" hidden>
      <button class="copy" data-tip="Copy notes, edits and tweaks for the agent" data-key="C"></button>
      <button class="caret" data-tip="Copy options" aria-haspopup="true" aria-expanded="false">${ICON.chev}</button>
      <div class="menu" hidden><label><input type="checkbox" class="clearon"><span>Clear on copy</span></label><small>Removes the notes after copying. Edits and tweaks stay.</small></div>
    </div>
    <div class="plug"></div><div class="seg"><button class="etog" data-tip="Edit mode" data-key="E"></button><button class="tog" data-tip="Feedback mode" data-key="F"></button><button class="ttog" data-tip="Tweaks" data-key="T"></button></div>
  </div></div><div class="tip"></div>`;
  const $b = s => barRoot.querySelector(s);
  const tog = $b('.tog'), etog = $b('.etog'), copy = $b('.copy'), clr = $b('.clr'), nosave = $b('.nosave');
  etog.innerHTML = ICON.edit + '<span>Edit</span><i class="dot" hidden></i>';
  tog.innerHTML = ICON.comment + '<span>Feedback</span>';
  const ttog = $b('.ttog'), split = $b('.split'), caret = $b('.caret'), menu = $b('.menu'), clearon = $b('.clearon');
  ttog.innerHTML = ICON.tweaks + '<span>Tweaks</span>';
  clearon.checked = clearOnCopy;
  if (!store) menu.querySelector('small').textContent += ' Storage is blocked here, so this resets on reload. Set data-clear-on-copy="true" on the script tag to start it on.';
  const dot = $b('.dot'), hint = $b('.hint');
  // Other plugins (grid-canvas.js) mark their own UI with data-edit-mode-ignore so a click on it is not picked as an element.
  const ours = t => t === host || t === barHost || !!(t && t.hasAttribute && t.hasAttribute('data-edit-mode-ignore'));
  barHost.style.cssText = 'all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483000';
  // The bar is a strip above the app, so push the app down by its height.
  if (active) document.documentElement.style.paddingTop = STRIP_H + 'px';
  document.documentElement.toggleAttribute('data-edit-mode-off', !active);

  // The edits are one stylesheet, so they apply with or without the panel open and survive the app re-rendering.
  const style = document.createElement('style');
  style.id = 'edit-mode-style';
  document.head.appendChild(style);

  // ---- Elements: selectors, labels, positions ----

  const nth = el => [...el.parentNode.children].indexOf(el) + 1;
  const selector = el => {
    const parts = [];
    for (; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); return parts.join(' > '); }
      parts.unshift(el.tagName.toLowerCase() + ':nth-child(' + nth(el) + ')');
    }
    return 'body > ' + parts.join(' > ');
  };
  const label = el => {
    const chain = [];
    for (let e = el; e; e = e.parentElement) if (e.dataset && e.dataset.anfraLabel) chain.unshift(e.dataset.anfraLabel);
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '';
    return { path: chain.join(' > '), name: el.tagName.toLowerCase() + cls, text };
  };
  const shortName = el => (el.dataset && el.dataset.anfraLabel) || label(el).name;
  const place = (el, node, dx = 0, dy = 0) => {
    const r = el.getBoundingClientRect();
    node.style.left = r.left + dx + 'px'; node.style.top = r.top + dy + 'px';
    return r;
  };
  const outline = (el, box) => {
    const r = place(el, box); box.style.width = r.width + 'px'; box.style.height = r.height + 'px'; box.style.display = 'block';
    return r;
  };

  // ---- Applying edits ----

  const textApplied = new Map();   // selector → the text before our edit, so undo can put it back
  function applyText () {
    for (const [s, from] of textApplied) {
      if (edits[s] && edits[s].text) continue;
      const el = document.querySelector(s);
      if (el && el.children.length === 0) el.textContent = from;
      textApplied.delete(s);
    }
    for (const s of Object.keys(edits)) {
      const t = edits[s].text;
      if (!t) continue;
      const el = document.querySelector(s);
      if (el && el.children.length === 0 && el.textContent !== t.to) el.textContent = t.to;
      textApplied.set(s, t.from);
    }
  }
  function applyAll () {
    style.textContent = L.cssFor(edits);
    applyText();
    requestAnimationFrame(syncSel);
    render();
  }
  // The app may re-render and drop an edited text; put it back once it settles.
  let reapply = 0;
  new MutationObserver(() => {
    clearTimeout(reapply); reapply = setTimeout(() => { if (textApplied.size) applyText(); applyTweaks(); }, 150);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  const panelOn = () => mode === 'edit' || mode === 'tweaks';
  const picking = () => mode === 'edit' || mode === 'feedback';   // a click picks an element instead of using it
  const dirty = () => JSON.stringify(edits) !== JSON.stringify(saved);
  const commit = () => { if (history.push(edits)) renderPanel(); };
  const persist = () => { try { store?.setItem(EDITS_KEY, JSON.stringify(saved)); } catch (e) {} };

  // Set one or more CSS properties on the selected elements to `value`.
  // `value` may be a function of the element, for a value that differs per element. Applies to every picked element.
  const targets = () => picked.filter(p => p.el.isConnected || (p.el = document.querySelector(p.sel)));
  function setCss (props, value) {
    targets().forEach(({ el, sel }) => {
      const cs = getComputedStyle(el), v = typeof value === 'function' ? value(el) : value;
      props.forEach(p => L.setProp(edits, sel, label(el), p, cs.getPropertyValue(p), v));
    });
    style.textContent = L.cssFor(edits);
    requestAnimationFrame(syncSel); render();
  }
  function setContent (value) {
    L.setText(edits, selSel, label(selEl), selEl.textContent, value);
    selEl.textContent = value;
    textApplied.set(selSel, edits[selSel] ? edits[selSel].text.from : value);
    requestAnimationFrame(syncSel); render();
  }
  function resetProps (props) {
    targets().forEach(({ el, sel }) => props.forEach(p => { const e = edits[sel] && edits[sel].props[p]; if (e) L.setProp(edits, sel, label(el), p, e.from, e.from); }));
    applyAll(); commit();
  }
  const jump = state => { edits = state; applyAll(); renderPanel(); };
  const undo = () => { if (history.canUndo()) jump(history.undo()); };
  const redo = () => { if (history.canRedo()) jump(history.redo()); };

  // ---- Edit panel ----

  const READ = { 'border-width': 'border-top-width', 'border-style': 'border-top-style', 'border-color': 'border-top-color', 'border-radius': 'border-top-left-radius', gap: 'row-gap' };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // Tweaks: what the page offers (elements marked data-tweak, plus declared ones) and what the user picked.
  const tweakGroups = () => {
    const items = [...document.querySelectorAll('[data-tweak]')].map(el => ({ key: el.dataset.tweak, value: el.dataset.tweakValue, group: el.dataset.tweakGroup, label: el.dataset.tweakLabel, isDefault: el.hasAttribute('data-tweak-default') }));
    document.querySelectorAll('script[data-edit-mode-tweaks]').forEach(s => {
      try { JSON.parse(s.textContent).forEach(d => (d.values || []).forEach((value, i) => items.push({ key: d.key, value, group: d.group, label: d.label, isDefault: d.default !== undefined ? d.default === value : i === 0 }))); } catch (e) {}
    });
    return L.collectTweaks(items, tweaks).groups;
  };
  const tweakList = () => tweakGroups().flatMap(g => g.tweaks);
  const changedTweaks = () => tweakList().filter(t => t.current !== t.def);
  const tweakStyle = document.createElement('style');
  tweakStyle.id = 'edit-mode-tweaks';
  document.head.appendChild(tweakStyle);
  function applyTweaks () {
    const list = tweakList();
    const css = L.tweakCss(list);
    if (tweakStyle.textContent !== css) tweakStyle.textContent = css;
    // Only when it changed: an attribute write is a mutation even with the same value, and the app may watch it.
    list.forEach(t => { const n = 'data-tweak-' + t.key; if (document.documentElement.getAttribute(n) !== t.current) document.documentElement.setAttribute(n, t.current); });
  }
  function setTweak (key, value) {
    tweaks[key] = value;
    try { store?.setItem(TWEAKS_KEY, JSON.stringify(tweaks)); } catch (e) {}
    applyTweaks();
    document.dispatchEvent(new CustomEvent('edit-mode:tweak', { detail: { key, value } }));
    requestAnimationFrame(syncSel); render(); renderPanel();
  }
  // A panel section that folds. The arrow shows on hover; the whole title is the button.
  const sec = (title, body, extra = '') => {
    const shut = folded.has(tab + ':' + title);
    return `<section class="${shut ? 'closed' : ''}"><h4><button class="fold" data-fold="${esc(title)}" aria-expanded="${!shut}"><span class="chev">${ICON.chev}</span>${esc(title)}</button>${extra}</h4><div class="body">${body}</div></section>`;
  };
  const tweaksHtml = () => {
    const groups = tweakGroups();
    if (!groups.length) return `<div class="hint">This page has no tweaks yet. Mark versions of an element with data-tweak and data-tweak-value to offer them here.</div>`;
    return groups.map(g => sec(g.name, g.tweaks.map(t => `<div class="tw"><label>${esc(t.label)}</label><div class="seg" data-tweak="${esc(t.key)}">${t.values.map(v => `<button data-v="${esc(v)}" class="${v === t.current ? 'on' : ''}">${esc(v)}</button>`).join('')}</div></div>`).join(''))).join('');
  };
  function renderPanel () {
    const keep = panel.scrollTop;
    const edited = L.countEdited(edits);
    const tabBtn = ([id, t]) => `<button class="tab${tab === id ? ' on' : ''}" data-tab="${id}">${t}</button>`;
    let html = `<div class="hd"><b>Edit</b><button data-act="discard"${dirty() ? '' : ' disabled'}>Discard</button><button class="save" data-act="save"${dirty() ? '' : ' disabled'}>Save</button></div>
      <div class="tools">${[['edit', 'Edit'], ['tweaks', 'Tweaks']].map(tabBtn).join('')}<span class="gap"></span><button class="ib" data-act="undo" data-tip="Undo" data-key="${MOD}Z"${history.canUndo() ? '' : ' disabled'}>${ICON.undo}</button><button class="ib" data-act="redo" data-tip="Redo" data-key="⇧${MOD}Z"${history.canRedo() ? '' : ' disabled'}>${ICON.redo}</button></div>`;
    if (tab === 'tweaks') { panel.innerHTML = html + tweaksHtml(); panel.scrollTop = keep; return; }
    if (edited) html += `<div class="note">${edited} element${edited === 1 ? '' : 's'} edited</div>`;
    if (!selEl || !selEl.isConnected) {
      html += `<div class="hint">Click an element to edit it.</div>`;
      if (edited) html += `<div class="foot"><button data-act="reset-all">Reset all edits</button></div>`;
      panel.innerHTML = html; return;
    }
    const cs = getComputedStyle(selEl);
    const chain = []; for (let e = selEl; e && e !== document.body && e !== document.documentElement && chain.length < 4; e = e.parentElement) chain.unshift(e);
    html += picked.length > 1
      ? `<div class="note" style="padding:8px 12px 0">${picked.length} elements selected: changes apply to all of them.</div><div class="crumbs">${picked.map((p, i) => `<button data-act="only" data-i="${i}" title="Edit only this one">${esc(shortName(p.el))}</button>`).join('')}</div>`
      : `<div class="crumbs">${chain.map((e, i) => `<button data-act="pick" data-i="${chain.length - 1 - i}" class="${e === selEl ? 'on' : ''}" title="${esc(shortName(e))}">${esc(shortName(e))}</button>`).join('')}</div>`;

    const num = (name, props, o = {}) => {
      const v = o.value !== undefined ? o.value : parseFloat(cs.getPropertyValue(o.read || READ[props] || props.split(',')[0]));
      const tagName = o.after ? 'div' : 'label';   // a control inside the field: not a label, or its clicks would focus the input
      return `<${tagName} class="f${o.after ? ' sz' : ''}"><span>${name}</span><input type="number" data-prop="${props}" data-unit="${o.unit ?? 'px'}" step="${o.step || 1}"${o.min !== undefined ? ` min="${o.min}"` : ''}${o.max !== undefined ? ` max="${o.max}"` : ''} value="${isNaN(v) ? '' : L.fmtNum(v)}"><em>${o.unit ?? 'px'}</em>${o.after || ''}</${tagName}>`;
    };
    // Line height takes a multiple of the font size (1.5) or an exact length (148px), so it is a text field.
    const lineHeight = () => {
      const typed = edits[selSel] && edits[selSel].props['line-height'];
      const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
      return `<label class="f"><span>Line height</span><input type="text" inputmode="decimal" data-prop="line-height" data-lh="1" data-min="0" value="${esc(typed ? typed.to : isNaN(ratio) ? '' : L.fmtNum(ratio))}"></label>`;
    };
    const color = (name, prop, clearable) => {
      const hex = L.rgbToHex(cs.getPropertyValue(READ[prop] || prop));
      return `<div class="f"><span>${name}</span><b>${hex || 'None'}</b><input type="color" data-prop="${prop}" value="${hex || '#ffffff'}">${clearable && hex ? `<button class="x" data-act="clear" data-prop="${prop}" title="Remove">×</button>` : ''}</div>`;
    };
    const select = (name, prop, options) => {
      const cur = cs.getPropertyValue(READ[prop] || prop);
      const opts = options.some(o => o[0] === cur) ? options : [[cur, cur], ...options];
      return `<label class="f"><span>${name}</span><select data-prop="${prop}">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    };
    const seg = (props, cur, options, attr = 'data-prop') => `<div class="seg" ${attr}="${props}">${options.map(([v, t, title]) => `<button data-v="${v}"${title ? ` data-tip="${esc(title)}"` : ''} class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const lines = ys => svg(ys.map(([x, w, y]) => `<path d="M${x} ${y}h${w}"/>`).join(''));
    const alignIcon = { left: [[2, 12, 3.5], [2, 8, 6.5], [2, 12, 9.5], [2, 8, 12.5]], center: [[2, 12, 3.5], [4, 8, 6.5], [2, 12, 9.5], [4, 8, 12.5]], right: [[2, 12, 3.5], [6, 8, 6.5], [2, 12, 9.5], [6, 8, 12.5]], justify: [[2, 12, 3.5], [2, 12, 6.5], [2, 12, 9.5], [2, 12, 12.5]] };
    const section = sec;

    // Text
    const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const ownText = picked.some(p => hasText(p.el));
    if (ownText) {
      const leaf = picked.length === 1 && selEl.children.length === 0;   // one text for many elements would overwrite each one's own
      const align = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign;
      html += section('Text',
        (leaf ? `<textarea data-text="1" placeholder="Text">${esc(selEl.textContent)}</textarea>` : '') +
        `<div class="two">${num('Size', 'font-size', { min: 1 })}${lineHeight()}</div>` +
        select('Weight', 'font-weight', [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold']]) +
        color('Color', 'color') +
        `<div class="f"><span>Align</span>${seg('text-align', align, ['left', 'center', 'right', 'justify'].map(a => [a, lines(alignIcon[a]), 'Align ' + a]))}</div>`);
    }

    // Sizing: Hug, Fixed or Fill, with the size now
    const mode = p => { const e = edits[selSel] && edits[selSel].props[p]; return e ? L.sizeMode(e.to) : null; };
    const sizeRow = (name, p) => num(name, p, { min: 0, after: seg(p, mode(p) === 'hug' ? 'fit-content' : mode(p) === 'fill' ? '100%' : mode(p) === 'fixed' ? 'fixed' : '', [['fit-content', 'Hug'], ['fixed', 'Fixed'], ['100%', 'Fill']]) });
    html += section('Sizing', sizeRow('Width', 'width') + sizeRow('Height', 'height'));

    // Layout: flex and grid containers only
    if (/flex/.test(cs.display)) {
      html += section('Layout',
        seg('flex-direction', cs.flexDirection, [['row', '→', 'Row'], ['column', '↓', 'Column'], ['row-reverse', '←', 'Row reverse'], ['column-reverse', '↑', 'Column reverse']]) +
        select('Wrap', 'flex-wrap', [['nowrap', 'nowrap'], ['wrap', 'wrap'], ['wrap-reverse', 'wrap-reverse']]) +
        select('Justify', 'justify-content', [['flex-start', 'start'], ['center', 'center'], ['flex-end', 'end'], ['space-between', 'space-between'], ['space-around', 'space-around'], ['space-evenly', 'space-evenly']]) +
        select('Align', 'align-items', [['stretch', 'stretch'], ['flex-start', 'start'], ['center', 'center'], ['flex-end', 'end'], ['baseline', 'baseline']]) +
        num('Gap', 'gap', { min: 0 }));
    } else if (/grid/.test(cs.display)) {
      html += section('Layout', num('Gap', 'gap', { min: 0 }));
    } else {
      html += section('Layout', `<button class="act" data-act="make-flex" title="Sets display: flex on this element">Make it a flex container</button>`);
    }

    // Padding and margin
    const box = (name, min) => {
      const sides = ['top', 'right', 'bottom', 'left'], v = {};
      sides.forEach(s => { v[s] = parseFloat(cs.getPropertyValue(name + '-' + s)) || 0; });
      const m = boxUi[name] || L.boxMode(v), p = s => name + '-' + s, o = { min };
      const body = m === 'all' ? num('All', sides.map(p).join(','), { ...o, read: p('top') })
        : m === 'xy' ? `<div class="two">${num('X', p('left') + ',' + p('right'), { ...o, read: p('left') })}${num('Y', p('top') + ',' + p('bottom'), { ...o, read: p('top') })}</div>`
        : m === 'individual' ? `<div class="two">${['left', 'top', 'right', 'bottom'].map(s => num(s[0].toUpperCase() + s.slice(1), p(s), o)).join('')}</div>` : '';
      const modes = [['none', 'None'], ['all', 'All'], ['xy', 'X & Y'], ['individual', 'Individual']];
      return sec(name[0].toUpperCase() + name.slice(1), seg(name, m, modes, 'data-box') + body);
    };
    html += box('padding', 0) + box('margin');

    // Appearance and border
    html += section('Appearance', color('Background', 'background-color', true) +
      `<div class="two">${num('Radius', 'border-radius', { min: 0 })}${num('Opacity', 'opacity', { unit: '', step: 0.05, min: 0, max: 1 })}</div>`);
    html += section('Border', `<div class="two">${num('Width', 'border-width', { min: 0 })}${select('Style', 'border-style', [['none', 'none'], ['solid', 'solid'], ['dashed', 'dashed'], ['dotted', 'dotted'], ['double', 'double']])}</div>` +
      color('Color', 'border-color'), `<button data-act="reset-border">Reset</button>`);

    const mine = picked.some(p => edits[p.sel]);
    html += `<div class="foot"><button data-act="reset-el"${mine ? '' : ' disabled'}>Reset element</button><button data-act="reset-all"${edited ? '' : ' disabled'}>Reset all</button></div>`;
    panel.innerHTML = html;
    panel.scrollTop = keep;
  }

  const setSide = (props, v) => setCss(props.split(','), v);
  function onField (e, done) {
    const t = e.target;
    if (!selEl) return;
    if (t.dataset.text) setContent(t.value);
    else if (t.dataset.prop) {
      if (t.dataset.lh) {
        const v = t.value.trim();
        if (!/^(\d*\.?\d+)(px|em|rem|%)?$/i.test(v)) { if (done) renderPanel(); return; }
        setSide(t.dataset.prop, v);
      }
      else if (t.type === 'number') { if (t.value === '') return; setSide(t.dataset.prop, t.value + (t.dataset.unit ?? 'px')); }
      else {
        setSide(t.dataset.prop, t.value);
        if (t.type === 'color') t.previousElementSibling.textContent = t.value;
        // A style on a border of no width shows nothing, so give it one.
        if (t.dataset.prop === 'border-style' && t.value !== 'none') setSide('border-width', el => parseFloat(getComputedStyle(el).borderTopWidth) ? getComputedStyle(el).borderTopWidth : '1px');
      }
    }
    if (done) { commit(); if (t.tagName === 'SELECT') renderPanel(); }
  }
  panel.addEventListener('input', e => onField(e, false));
  panel.addEventListener('change', e => onField(e, true));
  panel.addEventListener('keydown', e => {
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.stopPropagation();
    // Up and Down in a number field add or take away 1, whatever the field's own step.
    const t = e.target;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (t.type === 'number' || t.dataset.lh)) {
      e.preventDefault();
      const lim = k => { const v = t[k] || t.dataset[k]; return v === undefined || v === '' ? undefined : +v; };
      const next = L.stepValue(t.value.trim() === '' ? '0' : t.value, e.key === 'ArrowUp' ? 1 : -1, { min: lim('min'), max: lim('max') });
      if (next === null) return;
      t.value = next;
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset, parent = b.parentElement;
    if (d.fold) {
      const k = tab + ':' + d.fold;
      folded.has(k) ? folded.delete(k) : folded.add(k);
      try { store?.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch (e) {}
      renderPanel();
    }
    else if (d.tab) { tab = d.tab; if (mode !== d.tab) setMode(d.tab); renderPanel(); }
    else if (parent.dataset.tweak) setTweak(parent.dataset.tweak, d.v);
    else if (d.act === 'undo') undo();
    else if (d.act === 'redo') redo();
    else if (d.act === 'save') { saved = L.clone(edits); persist(); renderPanel(); render(); }
    else if (d.act === 'discard') { edits = L.clone(saved); history.push(edits); applyAll(); renderPanel(); }
    else if (d.act === 'reset-all') { edits = {}; history.push(edits); applyAll(); renderPanel(); }
    else if (d.act === 'reset-el') { picked.forEach(p => delete edits[p.sel]); history.push(edits); applyAll(); renderPanel(); }
    else if (d.act === 'reset-border') resetProps(['border-width', 'border-style', 'border-color']), renderPanel();
    else if (d.act === 'clear') { setCss([d.prop], 'transparent'); commit(); renderPanel(); }
    else if (d.act === 'make-flex') { setCss(['display'], 'flex'); commit(); renderPanel(); }
    else if (d.act === 'only') select(picked[+d.i].el);
    else if (d.act === 'pick') { let el = selEl; for (let i = +d.i; i > 0; i--) el = el.parentElement; select(el); }
    else if (parent.dataset.box) {
      const name = parent.dataset.box, sides = ['top', 'right', 'bottom', 'left'].map(s => name + '-' + s);
      const px = s => el => getComputedStyle(el).getPropertyValue(s);
      boxUi[name] = d.v;
      if (d.v === 'none') setCss(sides, '0px');
      else if (d.v === 'all') setCss(sides, px(sides[0]));
      else if (d.v === 'xy') { setCss([sides[0], sides[2]], px(sides[0])); setCss([sides[1], sides[3]], px(sides[3])); }
      commit(); renderPanel();
    } else if (parent.dataset.prop) {
      const prop = parent.dataset.prop;
      setSide(prop, d.v === 'fixed' ? el => Math.round(el.getBoundingClientRect()[prop === 'width' ? 'width' : 'height']) + 'px' : d.v);
      commit(); renderPanel();
    }
  });

  // Pick an element. `more` (Cmd/Ctrl held) adds it to the picked ones, or takes it out if it is already there.
  function pickEl (el, more) {
    if (!el) picked = [];
    else if (!more) picked = [{ el, sel: selector(el) }];
    else if (picked.some(p => p.el === el)) picked = picked.filter(p => p.el !== el);
    else picked.push({ el, sel: selector(el) });
    selEl = picked.length ? picked[0].el : null; selSel = picked.length ? picked[0].sel : '';
    syncSel();
  }
  function select (el, more = false) {
    pickEl(el, more); boxUi = {}; tab = 'edit';
    renderPanel();
  }
  function syncSel () {
    sels.textContent = '';
    if (!picked.length || (mode !== 'edit' && mode !== 'feedback')) return;
    picked = targets();   // the app may have re-rendered them
    selEl = picked.length ? picked[0].el : null; selSel = picked.length ? picked[0].sel : '';
    picked.forEach(p => { const b = document.createElement('div'); b.className = 'sel'; sels.appendChild(b); outline(p.el, b); });
  }

  // ---- Feedback pins and notes (the same as feedback.js) ----

  const save = () => { try { store?.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) {} render(); };

  function render () {
    pins.innerHTML = '';
    notes.forEach((n, i) => {
      // A note on several elements puts the same number on each of them.
      const els = [n.selector, ...(n.also || []).map(a => a.selector)].map(q => document.querySelector(q)).filter(Boolean);
      els.forEach(el => {
        const p = document.createElement('div');
        p.className = 'pin'; p.textContent = i + 1; p.title = n.comment + ' (click to edit)';
        place(el, p);
        p.onclick = e => { e.stopPropagation(); openBox(els[0], i); };
        pins.appendChild(p);
      });
    });
    const items = notes.length + L.countEdited(edits) + changedTweaks().length;
    split.hidden = !items && !copied; clr.hidden = !notes.length;
    if (split.hidden) { menu.hidden = true; caret.setAttribute('aria-expanded', 'false'); }
    copy.textContent = copied ? 'Copied ✓' : 'Copy ' + items + ' item' + (items === 1 ? '' : 's');
    nosave.hidden = !!store;
    tog.classList.toggle('on', mode === 'feedback');
    etog.classList.toggle('on', mode === 'edit');
    ttog.classList.toggle('on', mode === 'tweaks');
    dot.hidden = !dirty();
    hint.textContent = mode === 'feedback' ? `Click an element to leave a note. Hold ${MOD} to pick several. Enter saves, Esc exits.` : mode === 'edit' ? `Click an element to edit it. Hold ${MOD} and click to edit several. Esc exits.` : mode === 'tweaks' ? 'Pick a version in the panel. Esc exits.' : '';
    panel.classList.toggle('on', panelOn());
    grip.classList.toggle('show', panelOn());
  }

  function openBox (target, idx = -1) {
    const els = [].concat(target), el = els[0];
    const editing = idx >= 0, info = editing ? notes[idx] : label(el), r = el.getBoundingClientRect();
    const more = editing ? (notes[idx].also || []).length : els.length - 1;
    slot.innerHTML = `<div class="box"><div class="grab" title="Drag to move">⋯</div><small></small><div class="crumbs" hidden></div><textarea placeholder="What should change? (Enter to save)"></textarea>
      <div class="row"><button class="del" hidden>Delete</button><button class="cancel">Cancel</button><button class="ok on"></button></div></div>`;
    const box = slot.firstElementChild, ta = box.querySelector('textarea'), small = box.querySelector('small'), crumbs = box.querySelector('.crumbs'), grab = box.querySelector('.grab');
    small.textContent = (info.path || info.name) + (more ? ` + ${more} more` : '');
    box.querySelector('.ok').textContent = editing ? 'Save' : 'Add';
    box.querySelector('.del').hidden = !editing;
    if (editing) ta.value = info.comment;

    // The element's wrappers, outermost first: click one to give the note to it instead.
    let cur = el;
    const chain = [];
    for (let e = el; e && e !== document.body && e !== document.documentElement && chain.length < 6; e = e.parentElement) chain.unshift(e);
    const paintCrumbs = () => {
      crumbs.innerHTML = chain.map((e, i) => `${i ? '<span class="sep">›</span>' : ''}<button data-i="${i}" class="${e === cur ? 'on' : ''}" title="${esc(shortName(e))}">${esc(shortName(e))}</button>`).join('');
    };
    if (!more && chain.length > 1) {
      small.hidden = true; crumbs.hidden = false; paintCrumbs();
      crumbs.onclick = e => {
        const b = e.target.closest('button');
        if (!b) return;
        cur = chain[+b.dataset.i];
        picked = [{ el: cur, sel: selector(cur) }];
        selEl = cur; selSel = picked[0].sel;
        syncSel(); paintCrumbs(); ta.focus();
      };
      crumbs.onmouseover = e => { const b = e.target.closest('button'); if (b) { outline(chain[+b.dataset.i], hl); } };
      crumbs.onmouseout = () => { hl.style.display = 'none'; };
    }

    const top = Math.min(r.bottom + 8, innerHeight - 8);
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - 296)) + 'px';
    box.style.top = Math.max(8, top) + 'px';
    // After layout, pull the box up if the taller note field pushed it off the bottom.
    requestAnimationFrame(() => { box.style.top = Math.max(8, Math.min(parseFloat(box.style.top), innerHeight - box.offsetHeight - 8)) + 'px'; });
    // Without field-sizing the textarea grows with its text here.
    if (!CSS.supports('field-sizing', 'content')) ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(Math.max(160, ta.scrollHeight + 2), innerHeight * 0.6) + 'px'; };

    // Drag the box by its top edge.
    let off = null;
    grab.onpointerdown = e => { e.preventDefault(); grab.setPointerCapture(e.pointerId); grab.classList.add('drag'); const b = box.getBoundingClientRect(); off = { x: e.clientX - b.left, y: e.clientY - b.top }; };
    grab.onpointermove = e => {
      if (!off) return;
      box.style.left = Math.max(0, Math.min(e.clientX - off.x, innerWidth - box.offsetWidth)) + 'px';
      box.style.top = Math.max(0, Math.min(e.clientY - off.y, innerHeight - 40)) + 'px';
    };
    grab.onpointerup = grab.onpointercancel = e => { off = null; grab.classList.remove('drag'); if (grab.hasPointerCapture(e.pointerId)) grab.releasePointerCapture(e.pointerId); };

    const close = () => { slot.innerHTML = ''; draft = null; hl.style.display = 'none'; if (picked.length) { pickEl(null); } };
    const add = () => {
      const comment = ta.value.trim();
      if (comment) {
        if (editing) { notes[idx].comment = comment; if (cur !== el) Object.assign(notes[idx], { selector: selector(cur), ...label(cur) }); }
        else notes.push({ selector: selector(cur), ...label(cur), comment, ...(more ? { also: els.slice(1).map(e => ({ selector: selector(e), ...label(e) })) } : {}) });
      }
      close(); save();
    };
    box.querySelector('.del').onclick = () => { notes.splice(idx, 1); close(); save(); };
    box.querySelector('.cancel').onclick = close;
    box.querySelector('.ok').onclick = add;
    ta.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } if (e.key === 'Escape') close(); };
    draft = cur; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // Drag the edge of the panel to resize it. The page keeps its left padding equal to the panel, so it never sits underneath.
  function setPanelW (w) {
    panelW = clampW(w);
    panel.style.width = panelW + 'px';
    grip.style.left = (panelW - 3) + 'px';
    if (panelOn()) document.documentElement.style.paddingLeft = panelW + 'px';
    requestAnimationFrame(() => { syncSel(); render(); });
  }
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('drag');
  });
  grip.addEventListener('pointermove', e => { if (grip.hasPointerCapture(e.pointerId)) setPanelW(e.clientX); });
  const endDrag = e => {
    if (!grip.hasPointerCapture(e.pointerId)) return;
    grip.releasePointerCapture(e.pointerId);
    grip.classList.remove('drag');
    try { store?.setItem(WIDTH_KEY, JSON.stringify(panelW)); } catch (err) {}
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // ---- Modes and page events ----

  let htmlPad = '';
  function setMode (next) {
    if (next === mode) next = 'off';
    const willPanel = next === 'edit' || next === 'tweaks';
    if (panelOn() && !willPanel) document.documentElement.style.paddingLeft = htmlPad;
    if (!panelOn() && willPanel) { htmlPad = document.documentElement.style.paddingLeft; document.documentElement.style.paddingLeft = panelW + 'px'; }
    mode = next; hover = draft = null;
    if (mode === 'edit' && tab === 'tweaks') tab = 'edit';
    if (mode === 'tweaks' && tab === 'edit') tab = 'tweaks';
    hl.style.display = tag.style.display = 'none';
    document.documentElement.style.cursor = mode === 'feedback' ? 'crosshair' : mode === 'edit' ? 'default' : '';
    slot.innerHTML = '';
    picked = []; selEl = null; selSel = ''; sels.textContent = '';
    if (panelOn()) renderPanel();
    render(); requestAnimationFrame(() => { syncSel(); render(); });
  }

  document.addEventListener('mousemove', e => {
    if (!picking() || draft) return;
    const el = ours(e.target) ? null : e.target;
    if (!el) { if (hover) { hover = null; hl.style.display = tag.style.display = 'none'; } return; }
    if (el === hover) return;
    hover = el;
    const r = outline(el, hl);
    const l = label(el); tag.textContent = l.path ? l.path.split(' > ').pop() + ' · ' + l.name : l.name;
    place(el, tag, 0, -20); tag.style.top = Math.max(0, r.top - 20) + 'px'; tag.style.display = 'block';
  }, true);
  // In a mode, a click picks the element instead of using it; stop the app from seeing the whole gesture.
  ['pointerdown', 'mousedown', 'mouseup'].forEach(type => document.addEventListener(type, e => {
    if (!picking() || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation();
  }, true));
  document.addEventListener('click', e => {
    if (!picking() || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const more = e.metaKey || e.ctrlKey;
    if (mode === 'feedback') {
      if (draft) return;
      if (more) pickEl(e.target, true);   // the note box opens when the key is released
      else { if (!picked.some(p => p.el === e.target)) pickEl(e.target, picked.length > 0); openBox(picked.map(p => p.el)); }
    }
    else select(e.target === document.body || e.target === document.documentElement ? null : e.target, more);
  }, true);
  document.addEventListener('keyup', e => {
    if ((e.key === 'Meta' || e.key === 'Control') && mode === 'feedback' && picked.length && !draft) openBox(picked.map(p => p.el));
  });
  document.addEventListener('keydown', e => {
    if (!active) return;
    const t = e.composedPath()[0];
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
    else if (e.key === 'Escape' && mode !== 'off') setMode('off');
    else if ((e.metaKey || e.ctrlKey) && !e.altKey && panelOn() && !typing && (k === 'z' || k === 'y')) { e.preventDefault(); (k === 'y' || e.shiftKey) ? redo() : undo(); }
    else if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    else if (k === 'f') setMode('feedback');
    else if (k === 'e') setMode('edit');
    else if (k === 't') setMode('tweaks');
    else if (k === 'c' && (notes.length || L.countEdited(edits) || changedTweaks().length)) copyAll();
    else if (k === 'x' && notes.length) clearAll();
  });
  const refresh = () => { render(); syncSel(); };
  addEventListener('scroll', refresh, true);
  addEventListener('resize', refresh);

  tog.onclick = () => setMode('feedback');
  etog.onclick = () => setMode('edit');
  ttog.onclick = () => setMode('tweaks');
  const closeMenu = () => { menu.hidden = true; caret.setAttribute('aria-expanded', 'false'); };
  caret.onclick = () => { menu.hidden = !menu.hidden; caret.setAttribute('aria-expanded', String(!menu.hidden)); };
  clearon.onchange = () => { clearOnCopy = clearon.checked; try { store?.setItem(CLEAR_KEY, JSON.stringify(clearOnCopy)); } catch (e) {} };
  document.addEventListener('click', e => { if (!menu.hidden && !e.composedPath().includes(split)) closeMenu(); }, true);
  const clearAll = () => { slot.innerHTML = ''; notes = []; save(); };
  clr.onclick = clearAll;
  const copyAll = async () => {
    const md = L.formatCopy({ page, notes, edits, tweaks: tweakList() });
    let ok = false;
    try { await navigator.clipboard.writeText(md); ok = true; } catch (e) {}
    if (!ok) { // sandboxed iframe: fall back to a selected textarea
      const ta = document.createElement('textarea');
      ta.value = md; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    if (ok) { copied = true; closeMenu(); if (clearOnCopy && notes.length) clearAll(); render(); }
    else { slot.innerHTML = '<div class="box" style="right:16px;top:56px;width:420px"><small>Select all and copy</small><textarea style="height:200px"></textarea></div>'; const t = slot.querySelector('textarea'); t.value = md; t.focus(); t.select(); }
    setTimeout(() => { copied = false; render(); }, 1500);
  };
  copy.onclick = copyAll;

  function wireTips (rt) {
    const tip = rt.querySelector('.tip');
    rt.addEventListener('mouseover', e => {
      const b = e.target.closest && e.target.closest('[data-tip]');
      if (!b) { tip.classList.remove('on'); return; }
      tip.innerHTML = `<span>${esc(b.dataset.tip)}</span>` + (b.dataset.key ? `<kbd>${esc(b.dataset.key)}</kbd>` : '');
      tip.classList.add('on');
      const r = b.getBoundingClientRect();
      tip.style.top = r.bottom + 6 + 'px';
      tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8)) + 'px';
    });
    rt.addEventListener('mouseout', () => tip.classList.remove('on'));
  }
  wireTips(root); wireTips(barRoot);

  document.body.appendChild(host);
  document.body.appendChild(barHost);
  // Another plugin can put a button in the bar: grid-canvas.js adds its Grid button to `slot`, which sits left of Edit | Feedback | Tweaks.
  // setActive(false) puts the bar and panel away and leaves the page as the app drew it; mode() is 'off' | 'feedback' | 'edit' | 'tweaks'.
  function setActive (on) {
    on = !!on;
    if (on === active) return;
    if (!on && mode !== 'off') setMode('off');
    active = on;
    host.style.display = barHost.style.display = on ? '' : 'none';
    document.documentElement.style.paddingTop = on ? STRIP_H + 'px' : '';
    document.documentElement.toggleAttribute('data-edit-mode-off', !on);
    if (on) refresh();
  }
  if (!active) host.style.display = barHost.style.display = 'none';
  window.EditModeBar = { root: barRoot, slot: $b('.plug'), setActive, mode: () => mode, isActive: () => active, tweaks: () => changedTweaks().map(t => ({ key: t.key, label: t.label, value: t.current, def: t.def })) };
  applyTweaks();
  applyAll();
})();
