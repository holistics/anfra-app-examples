// Pure logic for the layout grid (grid-canvas.js): settings, column positions and snapping. No DOM here, so it is unit tested.
(function (root) {
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const int = (v, fallback, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : fallback; };

  // Stretch: the columns fill the canvas, minus a margin on each side.
  // Center: columns have a fixed width and the whole grid sits in the middle of the canvas.
  const DEFAULTS = Object.freeze({
    on: false,
    snap: true,
    shift: true,
    avoid: true,
    type: 'stretch',
    color: '#ff0000',
    opacity: 5,
    stretch: Object.freeze({ count: 12, margin: 24, gutter: 16 }),
    center: Object.freeze({ count: 12, width: 64, gutter: 16 }),
  });

  const hex = (v, fallback) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? '#' + m[1].toLowerCase() : fallback; };

  // Fill in anything missing and keep every number in range, so stored or typed values can never break the grid.
  function normalize (raw) {
    const r = raw || {}, st = r.stretch || {}, ce = r.center || {}, d = DEFAULTS;
    return {
      on: r.on === true,
      snap: r.snap !== false,
      shift: r.shift !== false,
      avoid: r.avoid !== false,
      type: r.type === 'center' ? 'center' : 'stretch',
      color: hex(r.color, d.color),
      opacity: int(r.opacity, d.opacity, 0, 100),
      stretch: { count: int(st.count, d.stretch.count, 1, 24), margin: int(st.margin, d.stretch.margin, 0, 400), gutter: int(st.gutter, d.stretch.gutter, 0, 100) },
      center: { count: int(ce.count, d.center.count, 1, 24), width: int(ce.width, d.center.width, 1, 400), gutter: int(ce.gutter, d.center.gutter, 0, 100) },
    };
  }

  // What to save: only the settings that differ from the defaults, so a default that changes later reaches everyone who never
  // touched that setting. `v` marks the format; settings saved before it held every field.
  function compact (settings) {
    const s = normalize(settings), d = DEFAULTS, out = { v: 2 };
    ['on', 'snap', 'shift', 'avoid', 'type', 'color', 'opacity'].forEach((k) => { if (s[k] !== d[k]) out[k] = s[k]; });
    ['stretch', 'center'].forEach((k) => {
      const diff = {};
      Object.keys(d[k]).forEach((f) => { if (s[k][f] !== d[k][f]) diff[f] = s[k][f]; });
      if (Object.keys(diff).length) out[k] = diff;
    });
    return out;
  }

  // Read saved settings back. Older saves held every field, including the 10% opacity that used to be the default and was never
  // a choice, so that one value is dropped and the current default applies.
  function revive (raw) {
    if (raw && typeof raw === 'object' && raw.v !== 2 && raw.opacity === 10) { const rest = { ...raw }; delete rest.opacity; return normalize(rest); }
    return normalize(raw);
  }

  // Columns as { left, right } in canvas coordinates (0 is the canvas's left edge).
  // A grid wider than the canvas (Center with big numbers) is squeezed to fit rather than cut off.
  function columns (settings, canvasWidth) {
    const s = normalize(settings), W = Math.max(0, canvasWidth);
    const cfg = s.type === 'center' ? s.center : s.stretch, n = cfg.count;
    let gutter = cfg.gutter, colW, x0;
    const fit = (inner) => {
      // The gutters alone must leave at least 1px per column.
      if (n > 1 && gutter * (n - 1) > inner - n) gutter = Math.max(0, (inner - n) / (n - 1));
      return (inner - gutter * (n - 1)) / n;
    };
    if (s.type === 'center') {
      const total = n * cfg.width + (n - 1) * gutter;
      if (total > W) { colW = fit(W); x0 = 0; } else { colW = cfg.width; x0 = (W - total) / 2; }
    } else {
      const margin = Math.min(cfg.margin, Math.max(0, (W - n) / 2));
      colW = fit(W - 2 * margin); x0 = margin;
    }
    if (!(colW > 0)) return [];
    return Array.from({ length: n }, (_, i) => { const left = x0 + i * (colW + gutter); return { left, right: left + colW }; });
  }

  // Every column edge a drag can land on, left to right: { x, col (1-based), side }.
  function edges (cols) {
    const out = [];
    cols.forEach((c, i) => { out.push({ x: c.left, col: i + 1, side: 'left' }, { x: c.right, col: i + 1, side: 'right' }); });
    return out.sort((a, b) => a.x - b.x);
  }

  // Move a drag onto the nearest column edge when one is within `threshold` px.
  // `candidates` are the x positions of the dragged thing's edges (a move has two: left and right; a resize from the corner has one).
  // Returns null when nothing is close enough, so the drag stays free. Otherwise { delta, hits } where `delta` is how far to
  // shift the drag, and `hits` lists every edge the shifted drag now sits exactly on (a card as wide as a column span lands on two).
  function snap (edgeList, candidates, threshold = 8) {
    let best = null;
    for (const c of candidates) for (const e of edgeList) {
      const gap = e.x - c;
      if (Math.abs(gap) <= threshold && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { gap, edge: e };
    }
    if (!best) return null;
    const hits = [];
    for (const c of candidates) {
      const e = edgeList.find((e2) => Math.abs(e2.x - (c + best.gap)) < 0.5);
      if (e) hits.push(e);
    }
    return { delta: best.gap, hits };
  }

  // "Column 6, right edge": what the guide says about the edge it snapped to.
  const describe = (hit) => `Column ${hit.col} ${hit.side === 'left' ? 'start' : 'end'}`;

  // The colour of the column bands and the guide line as CSS.
  function rgba (color, opacityPct) {
    const h = hex(color, DEFAULTS.color).slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${clamp(opacityPct, 0, 100) / 100})`;
  }

  const GridLogic = { DEFAULTS, normalize, compact, revive, columns, edges, snap, describe, rgba };
  if (typeof module !== 'undefined' && module.exports) module.exports = GridLogic;
  else root.GridLogic = GridLogic;
})(typeof window !== 'undefined' ? window : globalThis);
