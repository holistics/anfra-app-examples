// The live design panel: try tokens on the running app, undo / redo any single edit, and save the result as a named preset.
// Open it with the Design entry at the foot of the sidebar (More on phones) or the \ key; <html data-ds-tools="off"> hides both.
//   · every committed edit is a step in DS.history (js/ds/history.js): ↶ ↷ in the head, ⌘Z / ⇧⌘Z / ⌘Y, or jump in History
//   · the dot on a changed token reverts that token only (itself an undoable step); Reset reverts all (also undoable)
//   · Save names the current look and writes it to ds/presets.js through the local helper (python3 -I scripts/ds_save.py,
//     127.0.0.1:7879): the sandbox has no storage and no file access. With the helper off, the preset lives for this session.
//   · Export still gives the CSS block to paste into ds/tokens.css / ds/themes.css (promoting a look to the default).
// Used by app.html and the gallery (ds.html). Needs js/ds/tokens.js (DS) and js/ds/history.js (DS.history).
(() => {
  const root = document.documentElement;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const HELPER = 'http://127.0.0.1:7879';
  const ic = (n) => (window.OG?.icon ? OG.icon(n, 'sm') : '');

  // ---- what the panel offers. Edit these lists to expose more tokens.
  const COLOURS = [
    ['Surfaces', ['--page', '--surface', '--tint', '--fill-subtle', '--fill-active']],
    ['Lines', ['--border', '--border-strong', '--rule']],
    ['Ink', ['--ink', '--ink-2', '--ink-3', '--on-ink']],
    ['Status', ['--pos', '--pos-ink', '--neg', '--neg-ink', '--warn', '--budget', '--ai']],
    ['Charts', ['--area-line', '--area-fill', '--chart', '--chart-line', '--chart-soft', '--chart-past', '--chart-hist', '--chart-grid']],
  ];
  // [token, label, min, max, step, unit]
  const SIZES = [
    ['--fs-label', 'Label', 9, 14, 1, 'px'], ['--fs-2', 'Secondary', 11, 16, 1, 'px'], ['--fs-body', 'Body', 13, 18, 1, 'px'],
    ['--fs-card-hero', 'Card hero', 16, 32, 1, 'px'], ['--fs-page-title', 'Page title', 20, 44, 1, 'px'], ['--fs-page-hero', 'Page hero', 24, 56, 1, 'px'],
  ];
  const SHAPE = [['--r-sm', 'Radius S (pills, cells)', 0, 12, 1, 'px'], ['--r-md', 'Radius M (controls, boxes)', 0, 20, 1, 'px'], ['--r-lg', 'Radius L (cards)', 0, 28, 1, 'px']];
  // layout tokens are per breakpoint (ds/layout.css swaps them in): the panel edits the suffixed source tokens
  const LAYOUT = [
    ['Sidebar', [['--nav-w-xl', 'Width · xl', 180, 300, 4, 'px'], ['--nav-w-lg', 'Width · lg', 160, 280, 4, 'px'], ['--nav-rail-w', 'Icon rail · md, sm', 52, 88, 2, 'px']]],
    ['Grid', [['--gap-xl', 'Gap · xl', 4, 40, 2, 'px'], ['--gap-lg', 'Gap · lg, md', 4, 40, 2, 'px'], ['--gap-sm', 'Gap · sm, xs', 4, 32, 2, 'px'],
      ['--page-pad-x-xl', 'Side padding · xl', 8, 64, 2, 'px'], ['--page-pad-x-lg', 'Side padding · lg, md', 8, 56, 2, 'px'], ['--page-pad-x-sm', 'Side padding · sm, xs', 8, 32, 2, 'px']]],
    ['Cards', [['--card-pad-xl', 'Padding', 8, 36, 2, 'px'], ['--card-pad-xs', 'Padding · xs', 8, 28, 2, 'px'], ['--card-head-h', 'Head height', 40, 72, 2, 'px'],
      ['--chart-h-xl', 'Chart height · ≥ md', 160, 400, 10, 'px'], ['--chart-h-sm', 'Chart height · sm', 140, 320, 10, 'px'], ['--chart-h-xs', 'Chart height · xs', 120, 280, 10, 'px']]],
    ['Controls & rows', [['--ctl-h', 'Control height', 28, 44, 2, 'px'], ['--tile', 'Row tile', 24, 44, 2, 'px'], ['--row-h', 'Row height', 40, 72, 2, 'px']]],
  ];
  const MOTION = [['--dur-fast', 'Pop-in (hover cards)', 0, 400, 10, 'ms'], ['--dur', 'Slide (sheets)', 0, 600, 10, 'ms']];
  const SHADOWS = {
    '--shadow-card': { none: 'none', hairline: '0 0 0 0 transparent', soft: '0 1px 2px rgb(16 24 40 / .04), 0 1px 3px rgb(16 24 40 / .03)', raised: '0 2px 4px rgb(16 24 40 / .06), 0 8px 20px rgb(16 24 40 / .08)' },   // ds-lint: allow
  };
  // font families: the loaded ones first; Google Fonts extras load on pick (the export says which link to add)
  const FONTS = {
    '--sans': [["Inter, 'Helvetica Neue', Arial, sans-serif", 'Inter'], ["'DM Sans', sans-serif", 'DM Sans', 'DM+Sans:wght@400;500'],
      ["'IBM Plex Sans', sans-serif", 'IBM Plex Sans', 'IBM+Plex+Sans:wght@400;500'], ["Geist, sans-serif", 'Geist', 'Geist:wght@400;500'],
      ["system-ui, -apple-system, 'Segoe UI', sans-serif", 'System UI']],
    '--mono': [["'Roboto Mono', ui-monospace, monospace", 'Roboto Mono'], ["'JetBrains Mono', monospace", 'JetBrains Mono', 'JetBrains+Mono:wght@400'],
      ["'IBM Plex Mono', monospace", 'IBM Plex Mono', 'IBM+Plex+Mono:wght@400'], ['ui-monospace, Menlo, monospace', 'System mono']],
    '--serif': [['Merriweather, Georgia, serif', 'Merriweather'], ['Newsreader, Georgia, serif', 'Newsreader'], ["Fraunces, Georgia, serif", 'Fraunces', 'Fraunces:wght@400'],
      ["'Instrument Serif', Georgia, serif", 'Instrument Serif', 'Instrument+Serif'], ['Georgia, serif', 'Georgia']],
  };
  const loadedFonts = new Set();
  const loadFont = (spec) => {
    if (!spec || loadedFonts.has(spec)) return;
    loadedFonts.add(spec);
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${spec}&display=swap` }));
  };
  // a restored state (undo, a preset) may name a font that isn't loaded yet
  const loadFontsFor = (overrides) => Object.entries(FONTS).forEach(([t, list]) => { const v = overrides?.[t]; if (v) loadFont(list.find(([x]) => x === v)?.[2]); });

  // ---- presets: listeners (the gallery redraws its Presets section), the helper calls, the session fallback
  const presetListeners = new Set();
  const presetsChanged = () => presetListeners.forEach((f) => { try { f(); } catch (e) { console.error('presets listener', e); } });
  const slugOf = (name) => String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'preset';
  let msg = '';
  async function helper(path, opts = {}) {
    const r = await fetch(`${HELPER}${path}`, { ...opts, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw Object.assign(new Error(j.error || `helper answered ${r.status}`), { fromHelper: true });
    return j;
  }
  const setPresets = (list) => DS.PRESETS.splice(0, DS.PRESETS.length, ...list.map((p) => ({ ...p })));
  async function savePreset(name) {
    name = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) { msg = 'Give the look a name first.'; return draw(); }
    if (name.length > 40) { msg = 'Names are 40 characters at most.'; return draw(); }
    const body = { name, theme: DS.theme(), overrides: DS.overrides() };
    try {
      const j = await helper('/presets', { method: 'POST', body: JSON.stringify(body) });
      setPresets(j.presets);
      DS.active = { slug: j.slug, name: j.name, snap: DS.snapshot() };
      msg = `${j.updated ? 'Updated' : 'Saved'} “${j.name}” in ds/presets.js.`;
    } catch (e) {
      if (e.fromHelper) { msg = `Not saved: ${e.message}`; return draw(); }
      const slug = slugOf(name), p = { slug, name, theme: body.theme, overrides: body.overrides, savedAt: new Date().toISOString(), session: true };
      const k = DS.PRESETS.findIndex((x) => x.slug === slug);
      if (k >= 0) DS.PRESETS[k] = p; else DS.PRESETS.push(p);
      DS.active = { slug, name, snap: DS.snapshot() };
      msg = 'The save helper isn’t running, so this look is kept for this session only. Start it with python3 -I scripts/ds_save.py, then Save again.';
    }
    presetsChanged(); draw();
  }
  async function deletePreset(slug) {
    const p = DS.PRESETS.find((x) => x.slug === slug);
    if (!p) return;
    if (p.session) setPresets(DS.PRESETS.filter((x) => x.slug !== slug));
    else {
      try { setPresets((await helper(`/presets/${encodeURIComponent(slug)}`, { method: 'DELETE' })).presets); }
      catch (e) { msg = e.fromHelper ? `Not deleted: ${e.message}` : 'Start the save helper (python3 -I scripts/ds_save.py) to delete a saved preset.'; return draw(); }
    }
    if (DS.active?.slug === slug) DS.active = null;
    msg = `Deleted “${p.name}”.`;
    presetsChanged(); draw();
  }
  function applyPreset(slug) {
    const p = DS.applyPreset(slug);
    if (!p) return;
    loadFontsFor(p.overrides);
    DS.history.commit(`Preset “${p.name}”`);
    msg = '';
    presetsChanged();
  }

  // ---- DOM
  let panel = null;
  const hex = (v) => {
    const s = String(v).trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
    const m = s.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
    return m ? `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000';   // ds-lint: allow
  };
  // the dot on a changed token: a button that reverts that token only
  const changedDot = (t) => (DS.overrides()[t] != null ? `<button type="button" class="dsp-dot" data-revert="${t}" title="Revert ${t} (undoable)"></button>` : '');
  const slider = ([t, label, min, max, step, unit]) => {
    const v = parseFloat(DS.token(t)) || 0;
    return `<label class="dsp-row"><span class="dsp-k">${esc(label)}${changedDot(t)}<code>${t}</code></span>
      <span class="dsp-ctl"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-t="${t}" data-unit="${unit}"><span class="dsp-v">${v}${unit}</span></span></label>`;
  };
  const section = (key, title, html, open = false) => `<details class="dsp-sec" data-sec="${key}"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="dsp-body">${html}</div></details>`;
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
  const openSecs = () => new Set([...(panel?.querySelectorAll('details.dsp-sec[open]') ?? [])].map((d) => d.dataset.sec));

  function presetsHtml() {
    const a = DS.active, mod = DS.presetModified();
    const list = DS.PRESETS.map((p) => `<div class="dsp-preset${a?.slug === p.slug ? ' on' : ''}">
        <button type="button" class="dsp-pname" data-preset-apply="${esc(p.slug)}" title="Apply (undoable)"><span class="t">${esc(p.name)}</span>
          <span class="muted">${esc(p.theme)} · ${Object.keys(p.overrides ?? {}).length} tokens${p.session ? ' · this session' : ''}</span></button>
        <button type="button" class="dsp-pdel" data-preset-del="${esc(p.slug)}" title="Delete ${esc(p.name)}">${ic('x')}</button></div>`).join('');
    return `<div class="dsp-active">${a ? `Active: <b>${esc(a.name)}</b>${mod ? ' <span class="muted">· modified</span>' : ''}` : '<span class="muted">No preset applied</span>'}</div>
      ${list ? `<div class="dsp-presets">${list}</div>` : '<p class="dsp-note dsp-flush">No saved looks yet. Adjust tokens, then name and save them here.</p>'}
      <div class="dsp-save" data-preset-form><input type="text" maxlength="40" placeholder="Name this look" aria-label="Preset name" data-preset-name value="">
        <button class="btn primary" type="button" data-preset-save>Save</button></div>
      ${a && mod ? `<button class="btn link dsp-update" type="button" data-preset-update>Update “${esc(a.name)}” with these changes</button>` : ''}
      <div class="dsp-msg" aria-live="polite">${esc(msg)}</div>`;
  }
  function historyHtml() {
    const steps = DS.history.steps;
    return `<ol class="dsp-hist">${[...steps].reverse().map((s) => `<li><button type="button" data-hist="${s.n}" class="${s.current ? 'on' : ''}${s.n > DS.history.index ? ' ahead' : ''}">
        <span class="t">${esc(s.label)}</span><span class="muted">${s.n === 0 ? '' : ago(s.at)}</span></button></li>`).join('')}</ol>
      <p class="dsp-note dsp-flush">⌘Z undo · ⇧⌘Z redo. Greyed steps are undone; a new edit replaces them.</p>`;
  }

  function draw() {
    if (!panel || panel.hidden) return;
    const open = openSecs(), isOpen = (k, dflt) => (open.size ? open.has(k) : dflt);
    const cur = DS.theme();
    const fontSel = (t) => {
      const val = DS.token(t);
      const opts = FONTS[t].map(([v, label]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(label)}</option>`).join('');
      const custom = FONTS[t].some(([v]) => v === val) ? '' : `<option value="${esc(val)}" selected>${esc(val.split(',')[0].replace(/'/g, ''))}</option>`;
      return `<label class="dsp-row"><span class="dsp-k">${t.slice(2)}${changedDot(t)}<code>${t}</code></span><select data-font="${t}">${custom}${opts}</select></label>`;
    };
    const shadowSel = (t) => {
      const val = DS.token(t), opts = SHADOWS[t];
      const pick = Object.entries(opts).find(([, v]) => v.replace(/\s/g, '') === val.replace(/\s/g, ''))?.[0];
      return `<label class="dsp-row"><span class="dsp-k">Card shadow${changedDot(t)}<code>${t}</code></span><select data-shadow="${t}">${pick ? '' : '<option selected>custom</option>'}${Object.keys(opts).map((k) =>
        `<option value="${k}"${k === pick ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`;
    };
    const y = panel.querySelector('.dsp-scroll').scrollTop;
    panel.querySelector('.dsp-scroll').innerHTML = `
      <div class="dsp-themes" role="group" aria-label="Theme preset">${DS.THEMES.map((t) => `<button type="button" data-theme-pick="${t}" class="${t === cur ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${section('presets', `Saved looks · ${DS.PRESETS.length}`, presetsHtml(), isOpen('presets', true))}
      ${section('history', `History · ${DS.history.steps.length - 1} edits`, historyHtml(), isOpen('history', false))}
      ${section('colour', 'Colour', COLOURS.map(([g, ts]) => `<div class="dsp-g">${g}</div>${ts.map((t) =>
        `<label class="dsp-row"><span class="dsp-k">${t.slice(2)}${changedDot(t)}</span><span class="dsp-ctl"><input type="color" value="${hex(DS.token(t))}" data-colour="${t}"><code class="dsp-hex">${hex(DS.token(t))}</code></span></label>`).join('')}`).join(''), isOpen('colour', true))}
      ${section('type', 'Type', `${['--sans', '--mono', '--serif'].map(fontSel).join('')}${SIZES.map(slider).join('')}
        <label class="dsp-row"><span class="dsp-k">Medium weight${changedDot('--fw-medium')}<code>--fw-medium</code></span><select data-plain="--fw-medium">${[500, 600, 700].map((w) => `<option${String(w) === DS.token('--fw-medium') ? ' selected' : ''}>${w}</option>`).join('')}</select></label>`, isOpen('type'))}
      ${section('shape', 'Shape', SHAPE.map(slider).join(''), isOpen('shape'))}
      ${section('elevation', 'Elevation', shadowSel('--shadow-card'), isOpen('elevation'))}
      ${section('layout', 'Space & layout', `<p class="dsp-note dsp-flush">This frame: <b>${innerWidth}px · ${DS.bp()}</b>. Breakpoints xl ≥ 1280 · lg ≥ 1024 · md ≥ 900 · sm ≥ 600 · xs.</p>
        ${LAYOUT.map(([g, ts]) => `<div class="dsp-g">${g}</div>${ts.map(slider).join('')}`).join('')}<p class="dsp-note dsp-flush">Which card sits in which column is js/pages.js.</p>`, isOpen('layout'))}
      ${section('motion', 'Motion', MOTION.map(slider).join(''), isOpen('motion'))}
      <div class="dsp-export" hidden><div class="dsp-g dsp-where"></div><textarea readonly rows="8"></textarea><div class="dsp-copied" aria-live="polite"></div></div>`;
    panel.querySelector('.dsp-scroll').scrollTop = y;
    head();
  }
  // the head: count of changed tokens + undo / redo state (cheap; runs on every edit, even mid-drag)
  function head() {
    if (!panel) return;
    const n = Object.keys(DS.overrides()).length;
    panel.querySelector('.dsp-count').textContent = n ? `${n} changed` : 'no changes';
    panel.querySelector('[data-dsp-undo]').disabled = !DS.history.canUndo;
    panel.querySelector('[data-dsp-redo]').disabled = !DS.history.canRedo;
  }

  function build() {
    panel = document.createElement('aside');
    panel.className = 'ds-panel';
    panel.hidden = true;
    panel.dataset.anfraRender = 'skip';
    panel.setAttribute('aria-label', 'Design system panel');
    panel.innerHTML = `<div class="dsp-head"><span class="label">Design system</span><span class="dsp-count muted"></span><span class="grow"></span>
        <button class="sq bare" type="button" data-dsp-undo title="Undo (⌘Z)" aria-label="Undo">${ic('undo')}</button>
        <button class="sq bare" type="button" data-dsp-redo title="Redo (⇧⌘Z)" aria-label="Redo">${ic('redo')}</button>
        <button class="sq bare" type="button" data-dsp-close title="Close (\\)" aria-label="Close">${ic('x')}</button></div>
      <div class="dsp-scroll"></div>
      <div class="dsp-foot"><button class="btn" type="button" data-dsp-reset title="Revert every token (undoable)">Reset</button><span class="grow"></span><button class="btn" type="button" data-dsp-export>Export CSS</button></div>`;
    document.body.append(panel);
    // live while dragging / picking (input); one history step when the control is released (change)
    panel.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.t) { el.nextElementSibling.textContent = `${el.value}${el.dataset.unit}`; DS.set(el.dataset.t, `${el.value}${el.dataset.unit}`); mark(el); }
      if (el.dataset.colour) { el.nextElementSibling.textContent = el.value; DS.set(el.dataset.colour, el.value); mark(el); }
    });
    panel.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.t || el.dataset.colour) { DS.history.commit(); return; }
      if (el.dataset.font) { loadFont(FONTS[el.dataset.font].find(([v]) => v === el.value)?.[2]); DS.set(el.dataset.font, el.value); }
      else if (el.dataset.shadow) DS.set(el.dataset.shadow, SHADOWS[el.dataset.shadow][el.value]);
      else if (el.dataset.plain) DS.set(el.dataset.plain, el.value);
      else return;
      DS.history.commit(); draw();
    });
    // (no <form>: the sandbox blocks form submission, so Save is a button and Enter in the name field)
    const saveFromField = () => savePreset(panel.querySelector('[data-preset-name]')?.value);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-preset-name]')) { e.preventDefault(); saveFromField(); } });
    panel.addEventListener('click', (e) => {
      const rv = e.target.closest('[data-revert]');
      if (rv) { e.preventDefault(); DS.set(rv.dataset.revert, null); DS.history.commit(`Revert ${rv.dataset.revert}`); setTimeout(draw, 80); return; }
      const t = e.target.closest('[data-theme-pick]');
      if (t) { DS.theme(t.dataset.themePick); DS.history.commit(); setTimeout(draw, 80); return; }
      const h = e.target.closest('[data-hist]');
      if (h) { DS.history.jump(Number(h.dataset.hist)); afterRestore(); return; }
      const ap = e.target.closest('[data-preset-apply]');
      if (ap) { applyPreset(ap.dataset.presetApply); setTimeout(draw, 80); return; }
      const del = e.target.closest('[data-preset-del]');
      if (del) {   // two clicks: the sandbox blocks confirm()
        if (del.dataset.armed) deletePreset(del.dataset.presetDel);
        else { del.dataset.armed = '1'; del.classList.add('armed'); del.textContent = 'Delete'; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.classList.remove('armed'); del.innerHTML = ic('x'); } }, 3000); }
        return;
      }
      if (e.target.closest('[data-preset-save]')) { saveFromField(); return; }
      if (e.target.closest('[data-preset-update]')) { savePreset(DS.active?.name); return; }
      if (e.target.closest('[data-dsp-undo]')) { DS.history.undo(); afterRestore(); return; }
      if (e.target.closest('[data-dsp-redo]')) { DS.history.redo(); afterRestore(); return; }
      if (e.target.closest('[data-dsp-close]')) { toggle(false); return; }
      if (e.target.closest('[data-dsp-reset]')) { DS.reset(); DS.history.commit('Reset'); setTimeout(draw, 80); return; }
      if (e.target.closest('[data-dsp-export]')) exportBox();
    });
  }
  function afterRestore() { loadFontsFor(DS.overrides()); presetsChanged(); setTimeout(draw, 80); }
  // a changed token gets its dot without redrawing the whole panel (redrawing would drop the slider mid-drag)
  function mark(el) {
    const k = el.closest('.dsp-row')?.querySelector('.dsp-k'), t = el.dataset.t || el.dataset.colour;
    if (k && !k.querySelector('.dsp-dot')) k.querySelector('code') ? k.querySelector('code').insertAdjacentHTML('beforebegin', changedDot(t)) : k.insertAdjacentHTML('beforeend', changedDot(t));
    head();
  }
  async function exportBox() {
    const box = panel.querySelector('.dsp-export'), ta = box.querySelector('textarea'), note = box.querySelector('.dsp-copied');
    const fonts = [...loadedFonts].filter((f) => Object.values(DS.overrides()).some((v) => v.includes(f.split(':')[0].replace(/\+/g, ' '))));
    const { file, selector } = DS.target();
    box.querySelector('.dsp-where').textContent = `Paste into ${file}, in the ${selector} block`;
    const theme = `/* ${file} → ${selector}: replace or add these lines */\n`;
    const fontNote = fonts.length ? `/* add to the Google Fonts link in app.html: ${fonts.map((f) => `family=${f}`).join('&')} */\n` : '';
    ta.value = (theme + fontNote + DS.exportCss()) || '/* no token changes yet */';
    box.hidden = false;
    ta.focus(); ta.select();
    let ok = false;
    // the app frame is sandboxed: ask the permissions policy before touching the Clipboard API (a refused call logs an error)
    const canClip = !!navigator.clipboard && (document.featurePolicy?.allowsFeature?.('clipboard-write') ?? false);
    if (canClip) { try { await navigator.clipboard.writeText(ta.value); ok = true; } catch {} }
    if (!ok) { try { ok = document.execCommand('copy'); } catch {} }
    note.textContent = ok ? 'Copied to the clipboard.' : 'Selected: press ⌘C to copy.';
    box.scrollIntoView({ block: 'nearest' });
  }
  function toggle(open = panel?.hidden ?? true) {
    if (!panel) build();
    panel.hidden = !open;
    root.classList.toggle('ds-panel-open', open);
    if (open) draw();
  }
  const typing = (el) => el?.closest?.('input[type="text"], input:not([type]), textarea, select, [contenteditable]');
  document.addEventListener('keydown', (e) => {
    if (root.dataset.dsTools === 'off') return;
    if (e.key === '\\' && !typing(e.target) && !e.target.closest?.('input')) { e.preventDefault(); toggle(); return; }
    // undo / redo while the panel is open (not while typing a preset name)
    if (!panel || panel.hidden || !(e.metaKey || e.ctrlKey) || typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); if (DS.history.undo()) afterRestore(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); if (DS.history.redo()) afterRestore(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-ds-panel]')) toggle(); });
  DS.onChange(() => { if (panel && !panel.hidden && !panel.contains(document.activeElement)) draw(); });
  // the History list and its count follow every step, even when the step came from a slider (no full redraw mid-drag)
  DS.history.onChange(() => {
    head();
    const sec = panel?.querySelector('details[data-sec=history]');
    if (!sec) return;
    sec.querySelector('summary').textContent = `History · ${DS.history.steps.length - 1} edits`;
    sec.querySelector('.dsp-body').innerHTML = historyHtml();
  });

  // A save rewrites ds/presets.js; if anfra serve live-reloads the page on that write, re-apply the look just saved and
  // reopen the panel (DS_LAST_SAVED is a few seconds old). Tooling only: ignored when the tools are off.
  const last = window.DS_LAST_SAVED;
  if (last && root.dataset.dsTools !== 'off' && Date.now() - Number(last.at) < 15000 && DS.PRESETS.some((p) => p.slug === last.slug)) {
    const p = DS.applyPreset(last.slug);
    loadFontsFor(p.overrides);
    DS.history.commit(`Preset “${p.name}” (saved)`);
    msg = `Saved “${p.name}” in ds/presets.js.`;
    setTimeout(() => toggle(true), 0);
  }

  DS.panel = { open: () => toggle(true), close: () => toggle(false), toggle: () => toggle(), save: savePreset, applyPreset, deletePreset,
    onPresets: (f) => { presetListeners.add(f); return () => presetListeners.delete(f); }, HELPER };
})();
