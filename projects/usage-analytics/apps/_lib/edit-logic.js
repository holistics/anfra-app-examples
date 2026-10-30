// The logic of Edit mode: no DOM, so Node can test it.
//
// `edits` is what the user changed, keyed by the CSS selector of the element:
//   { [selector]: { label: { path, name, text }, props: { [css property]: { from, to } }, text?: { from, to } } }
// `from` is the value before the first edit, so a prompt can say "8px → 16px" and an edit set back
// to its original value drops out. Everything here is plain data; edit-mode.js applies it to the page.
(function (root) {
  'use strict';

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function fmtNum (n) {
    return String(Math.round(n * 100) / 100);
  }

  // Up/Down in a number field: '148px' + 1 -> '149px', '1.5' - 1 -> '0.5'. Keeps the unit the user typed and stays inside
  // min/max. Returns null when the text holds no number to step.
  function stepValue (text, delta, o = {}) {
    const m = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(String(text));
    if (!m) return null;
    let n = Math.round((parseFloat(m[1]) + delta) * 1000) / 1000;
    if (o.min !== undefined) n = Math.max(o.min, n);
    if (o.max !== undefined) n = Math.min(o.max, n);
    return String(n) + m[2];
  }

  // '12.5px' -> 12.5. Anything else ('auto', 'normal', '') -> null.
  function parsePx (v) {
    const m = /^(-?\d*\.?\d+)px$/.exec(String(v || '').trim());
    return m ? parseFloat(m[1]) : null;
  }

  // Computed colours come as 'rgb(r, g, b)' or 'rgba(r, g, b, a)'. A colour input needs '#rrggbb';
  // a fully transparent colour has none (null), which the panel shows as "None".
  function rgbToHex (css) {
    const s = String(css || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
    const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  }

  // Which of "None / All / X & Y / Individual" fits four sides (numbers, px).
  function boxMode (v) {
    const { top, right, bottom, left } = v;
    if (top === 0 && right === 0 && bottom === 0 && left === 0) return 'none';
    if (top === right && right === bottom && bottom === left) return 'all';
    if (top === bottom && left === right) return 'xy';
    return 'individual';
  }

  // Width and height: Hug, Fixed (px) or Fill. Null when the value is none of them.
  function sizeMode (v) {
    if (v === 'fit-content') return 'hug';
    if (v === '100%') return 'fill';
    return parsePx(v) !== null ? 'fixed' : null;
  }

  function dropEmpty (edits, sel) {
    const e = edits[sel];
    if (e && !Object.keys(e.props).length && !e.text) delete edits[sel];
  }

  // Set one CSS property on one element. Setting it back to its original value removes the edit.
  function setProp (edits, sel, label, prop, from, to) {
    const e = edits[sel] || (edits[sel] = { label, props: {} });
    const prev = e.props[prop];
    const origin = prev ? prev.from : from;
    if (to === origin) delete e.props[prop];
    else e.props[prop] = { from: origin, to };
    dropEmpty(edits, sel);
  }

  function setText (edits, sel, label, from, to) {
    const e = edits[sel] || (edits[sel] = { label, props: {} });
    const origin = e.text ? e.text.from : from;
    if (to === origin) delete e.text;
    else e.text = { from: origin, to };
    dropEmpty(edits, sel);
  }

  // The stylesheet that shows the edits. !important so an edit beats the app's own rules and inline
  // styles; a rule (not an inline style) so it survives the app re-rendering the element.
  function cssFor (edits, important = true) {
    return Object.keys(edits).map((sel) => {
      const decls = Object.entries(edits[sel].props).map(([p, v]) => `${p}: ${v.to}${important ? ' !important' : ''};`);
      return decls.length ? `${sel} { ${decls.join(' ')} }` : '';
    }).filter(Boolean).join('\n');
  }

  const countEdited = (edits) => Object.keys(edits).length;

  // Undo and redo over snapshots of `edits`. push() ignores a snapshot equal to the current one,
  // so committing twice, or an edit set back to its start, adds no step.
  function createHistory (initial, limit = 100) {
    let stack = [clone(initial)], at = 0;
    return {
      push (state) {
        if (same(state, stack[at])) return false;
        stack = stack.slice(0, at + 1);
        stack.push(clone(state));
        if (stack.length > limit) stack.shift();
        at = stack.length - 1;
        return true;
      },
      undo () { if (at > 0) at--; return clone(stack[at]); },
      redo () { if (at < stack.length - 1) at++; return clone(stack[at]); },
      current () { return clone(stack[at]); },
      canUndo () { return at > 0; },
      canRedo () { return at < stack.length - 1; },
    };
  }

  // Tweaks: versions of part of the page the user can switch between. `items` are what the page declares,
  // one per version: { key, value, group?, label?, isDefault? }. `chosen` is { [key]: value } the user picked.
  // Returns { groups: [{ name, tweaks: [{ key, label, values, def, current }] }] }, in the order found.
  // The default is the version marked isDefault, else the first one.
  function collectTweaks (items, chosen = {}) {
    const byKey = new Map(), groups = new Map();
    for (const it of items) {
      if (!it.key || it.value === undefined || it.value === null) continue;
      let t = byKey.get(it.key);
      if (!t) {
        t = { key: it.key, label: it.label || it.key, values: [], def: null };
        byKey.set(it.key, t);
        const name = it.group || 'Tweaks';
        if (!groups.has(name)) groups.set(name, { name, tweaks: [] });
        groups.get(name).tweaks.push(t);
      }
      const v = String(it.value);
      if (!t.values.includes(v)) t.values.push(v);
      if (it.isDefault && t.def === null) t.def = v;
    }
    for (const t of byKey.values()) {
      if (t.def === null) t.def = t.values[0];
      t.current = t.values.includes(chosen[t.key]) ? chosen[t.key] : t.def;
    }
    return { groups: [...groups.values()] };
  }

  // The stylesheet that shows one version of each tweak: every element that carries another version of the
  // same key is hidden. `list` is the flat list of tweaks from collectTweaks.
  function tweakCss (list) {
    const q = (s) => '"' + String(s).replace(/["\\]/g, '\\$&') + '"';
    return list.map((t) => `[data-tweak=${q(t.key)}]:not([data-tweak-value=${q(t.current)}]) { display: none !important; }`).join('\n');
  }

  // What "Copy" puts on the clipboard: the feedback notes, then the style edits, then the tweaks that are not
  // on their default, ready to paste to a coding agent. `notes` are { comment, name, text, path, selector }
  // as the feedback pins hold them; `tweaks` is the flat list from collectTweaks.
  function formatCopy ({ page, notes = [], edits = {}, tweaks = [] }) {
    const parts = [];
    if (notes.length) {
      parts.push(`# Feedback on ${page}\n\n` + notes.map((n, i) =>
        `${i + 1}. ${n.comment}\n   - Element: \`${n.name}\`${n.text ? ' "' + n.text + '"' : ''}\n   - Path: ${n.path || '(no anfra label)'}\n   - Selector: \`${n.selector}\`` +
        (n.also && n.also.length ? '\n   - Also applies to:\n' + n.also.map((a) => `     - \`${a.name}\`${a.text ? ' "' + a.text + '"' : ''} · ${a.path || '(no anfra label)'} · \`${a.selector}\``).join('\n') : '')).join('\n\n'));
    }
    const sels = Object.keys(edits);
    if (sels.length) {
      const items = sels.map((sel, i) => {
        const e = edits[sel], l = e.label || {};
        const lines = [`${i + 1}. \`${l.name || sel}\`${l.text ? ' "' + l.text + '"' : ''}`,
          `   - Path: ${l.path || '(no anfra label)'}`, `   - Selector: \`${sel}\``];
        if (e.text) lines.push(`   - text: "${e.text.from}" → "${e.text.to}"`);
        Object.entries(e.props).forEach(([p, v]) => lines.push(`   - ${p}: ${v.from} → ${v.to}`));
        return lines.join('\n');
      });
      const css = cssFor(edits, false);
      parts.push(`# Style edits on ${page}\n\nApply these to the app's own CSS or markup so they stay after a reload.\n\n` +
        items.join('\n\n') + (css ? '\n\n```css\n' + css + '\n```' : ''));
    }
    const changed = tweaks.filter((t) => t.current !== t.def);
    if (changed.length) {
      parts.push(`# Tweaks on ${page}\n\nThe user picked these versions. Make them the default.\n\n` +
        changed.map((t, i) => `${i + 1}. ${t.label} (\`${t.key}\`): ${t.def} → ${t.current}`).join('\n'));
    }
    return parts.join('\n\n');
  }

  const EditLogic = { clone, fmtNum, stepValue, parsePx, rgbToHex, boxMode, sizeMode, setProp, setText, cssFor, countEdited, createHistory, collectTweaks, tweakCss, formatCopy };

  root.EditLogic = EditLogic;
  if (typeof module !== 'undefined' && module.exports) module.exports = EditLogic;
})(typeof globalThis !== 'undefined' ? globalThis : this);
