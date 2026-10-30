// DS: the bridge from the design tokens (ds/tokens.css, ds/themes.css) to JavaScript.
// ECharts paints on canvas, so it can't read CSS variables: every chart option asks DS for the current value at draw
// time, and DS.set / DS.theme redraw the charts on screen. Loaded before origin.js; the gallery (ds.html) uses it too.
(() => {
  const root = document.documentElement;
  const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const px = (name) => parseFloat(token(name)) || 0;
  const FS = { label: '--fs-label', 2: '--fs-2', body: '--fs-body', 'card-hero': '--fs-card-hero', 'page-hero': '--fs-page-hero', code: '--fs-code' };
  // font sizes as numbers for ECharts: DS.fs('label') → 11
  const fs = (k) => px(FS[k] ?? k);
  // font families for ECharts: DS.font('sans' | 'mono' | 'serif')
  const font = (k) => token(`--${k}`);

  // the presets in ds/themes.css; 'calm' is :root itself, 'terracotta' the default (app.html, 17 Oct: mouka in the
  // Supercart reference palette), 'mouka' the previous default
  const THEMES = ['mouka', 'terracotta', 'calm', 'dark', 'contrast'];
  const listeners = new Set();
  let redrawT = 0;
  // Charts on screen pick up the new values on their next render; views off screen redraw when they are next shown.
  const changed = () => {
    clearTimeout(redrawT);
    redrawT = setTimeout(() => {
      // views skip a redraw when their rows haven't changed (this.chartSig, this.treeSig …): a token change must repaint
      for (const v of window.WF?.views?.values?.() ?? []) for (const k of Object.keys(v)) if (k.endsWith('Sig')) v[k] = null;
      try { window.WF?.current?.render?.(); } catch (e) { console.error('redraw', e); }
      listeners.forEach((f) => f());
    }, 60);
  };
  // DS.theme('dark'): switch preset (sets <html data-theme>; charts redraw)
  function theme(name) {
    if (name == null) return root.dataset.theme || 'calm';
    root.dataset.theme = name;
    changed();
    return name;
  }
  // DS.set('--r-lg', '4px') or DS.set({ '--r-lg': '4px', '--chart': '#ff5500' }): live override (inline on <html>);   // ds-lint: allow
  // a null / '' value removes the override. The sandbox has no storage: Save in the panel persists through scripts/ds_save.py.
  function set(name, value) {
    const pairs = typeof name === 'object' ? Object.entries(name) : [[name, value]];
    for (const [k, v] of pairs) {
      if (v == null || v === '') root.style.removeProperty(k); else root.style.setProperty(k, String(v));
    }
    changed();
  }
  // the live overrides as a { token: value } map, and as a CSS block for the file that owns the active theme:
  // calm lives in ds/tokens.css (:root), every other preset in its block in ds/themes.css
  const target = (t = theme()) => (t === 'calm' ? { file: 'ds/tokens.css', selector: ':root' } : { file: 'ds/themes.css', selector: `:root[data-theme="${t}"]` });
  const overrides = () => Object.fromEntries([...root.style].filter((k) => k.startsWith('--')).map((k) => [k, root.style.getPropertyValue(k).trim()]));
  const exportCss = () => {
    const o = overrides(), keys = Object.keys(o);
    const { selector } = target();
    return keys.length ? `${selector} {\n${keys.map((k) => `  ${k}: ${o[k]};`).join('\n')}\n}\n` : '';
  };
  function reset() { for (const k of Object.keys(overrides())) root.style.removeProperty(k); changed(); }
  const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

  // ----- snapshots: the whole design state (theme + every live override). js/ds/history.js stacks them for undo / redo;
  // a saved preset is one (ds/presets.js, written by scripts/ds_save.py).
  const snapshot = () => ({ theme: theme(), overrides: overrides() });
  const sameSnap = (a, b) => !!a && !!b && a.theme === b.theme && JSON.stringify(Object.entries(a.overrides).sort()) === JSON.stringify(Object.entries(b.overrides).sort());
  function restore(snap) {
    if (!snap) return;
    for (const k of Object.keys(overrides())) root.style.removeProperty(k);
    for (const [k, v] of Object.entries(snap.overrides ?? {})) root.style.setProperty(k, v);
    root.dataset.theme = snap.theme || 'mouka';
    changed();
  }

  // ----- saved presets: named snapshots. DS.PRESETS comes from ds/presets.js (committed, read-only at runtime); a save made
  // while the helper is down lives only in this session (session: true). DS.active = the preset last applied or saved.
  const PRESETS = (Array.isArray(window.DS_PRESETS) ? window.DS_PRESETS : []).map((p) => ({ ...p }));
  const state = { active: null };   // { slug, name, snap }
  function applyPreset(slug) {
    const p = PRESETS.find((x) => x.slug === slug);
    if (!p) return null;
    restore({ theme: p.theme, overrides: p.overrides });
    state.active = { slug: p.slug, name: p.name, snap: snapshot() };
    return p;
  }
  // is the page still exactly the active preset? (false once any token moves after applying or saving it)
  const presetModified = () => !!state.active && !sameSnap(state.active.snap, snapshot());

  // ----- breakpoints (FRAME widths; ds/layout.css has the same four numbers in its @media rules)
  const BP = [['xl', 1280], ['lg', 1024], ['md', 900], ['sm', 600], ['xs', 0]];
  const bp = (w = innerWidth) => BP.find(([, min]) => w >= min)[0];

  window.DS = { token, px, fs, font, theme, set, reset, overrides, exportCss, target, onChange, THEMES, BP, bp,
    snapshot, sameSnap, restore, PRESETS, applyPreset, presetModified,
    get active() { return state.active; }, set active(v) { state.active = v; } };
})();
