(function (root) {
  let uid = 0;

  // Monotone cubic (Fritsch–Carlson): smooth, and flat stretches stay flat instead of overshooting.
  function smooth(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const d = [], m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    let p = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (pts[i + 1].x - pts[i].x) / 3;
      p += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + m[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - m[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return p;
  }

  function chart(values, { w = 200, h = 40, grid = false, dot = true, pad = 4 } = {}) {
    const v = values.filter((x) => x !== null && x !== undefined);
    if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
    const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
    const pts = values.map((x, i) => ({ x: pad + (i / (values.length - 1)) * (w - pad * 2), y: pad + (1 - ((x ?? min) - min) / r) * (h - pad * 2) }));
    const line = smooth(pts);
    const last = pts[pts.length - 1];
    const id = `g${++uid}${Math.random().toString(36).slice(2, 6)}`;
    const lines = grid ? [0.25, 0.5, 0.75].map((f) => `<line class="grid" x1="0" x2="${w}" y1="${(h * f).toFixed(1)}" y2="${(h * f).toFixed(1)}"/>`).join('') : '';
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f0"/><stop offset="1" class="f1"/></linearGradient></defs>
${lines}<path class="area" d="${line} L${last.x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z" fill="url(#${id})"/>
<path class="line" d="${line}"/>${dot ? `<circle class="dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.6"/>` : ''}</svg>`;
  }

  const api = { chart, smooth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Charts = api;
})(this);
