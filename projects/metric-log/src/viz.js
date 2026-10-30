const { smooth } = require('./client/chart');
const { esc, fmt } = require('./ui');

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `var(--s${i})`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let uid = 0;

function xLabel(key, grain) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(key);
  if (!m) return key;
  return grain === 'month' ? `${MONTHS[+m[2] - 1]} ${String(m[1]).slice(2)}` : `${MONTHS[+m[2] - 1]} ${+m[3]}`;
}

function short(v, format = '') {
  if (format.includes('%')) return `${Math.round(v * 100)}%`;
  const a = Math.abs(v), cur = format.includes('$') ? '$' : '';
  const n = a >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${+v.toFixed(a < 10 && a % 1 ? 1 : 0)}`;
  return cur + n;
}

function ticks(lo, hi, n = 4) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw);
  const start = Math.floor(lo / step) * step, out = [];
  for (let t = start; t <= hi + step * 0.001; t += step) out.push(+t.toFixed(10));
  return out;
}

// series: [{ name, values[] }] over x keys. stacked: parts add up to the whole. type: 'area' | 'column'.
function viz({ x, series, type, stacked, format, grain = 'week', w = 392, h = 210 }) {
  if (!x.length || !series.length) return '<p class="muted">No data for this period.</p>';
  const L = 4, R = 46, T = 10, B = 24, cw = w - L - R, ch = h - T - B, n = x.length;
  const vals = series.map((s) => s.values.map((v) => v ?? null));
  const totals = x.map((_, i) => vals.reduce((a, s) => a + (s[i] || 0), 0));
  const flat = vals.flat().filter((v) => v !== null);
  const hi = stacked ? Math.max(...totals) : Math.max(...flat);
  const single = series.length === 1 && type === 'area';
  const lo = single ? Math.min(...flat) - (hi - Math.min(...flat)) * 0.15 : Math.min(0, ...flat);
  const ts = ticks(lo, hi);
  const top = Math.max(hi, ts[ts.length - 1]), bot = Math.min(lo, ts[0]);
  const Y = (v) => T + (1 - (v - bot) / (top - bot || 1)) * ch;
  const step = n > 1 ? cw / (n - 1) : cw;
  const X = (i) => L + (type === 'column' ? (i + 0.5) * (cw / n) : n > 1 ? i * step : cw / 2);
  const id = `a${++uid}`;

  const grid = ts.map((t) => `<line class="vg" x1="${L}" x2="${w - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="vy" x="${w - R + 8}" y="${(Y(t) + 4).toFixed(1)}">${esc(short(t, format))}</text>`).join('');
  const every = Math.max(1, Math.ceil(n / 5));
  const xs = x.map((k, i) => ((n - 1 - i) % every === 0 ? `<text class="vx" x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 && type !== 'column' ? 'start' : i === n - 1 && type !== 'column' ? 'end' : 'middle'}">${esc(xLabel(k, grain))}</text>` : '')).join('');
  const tip = (i) => `${xLabel(x[i], grain)}\n${series.map((s) => `${series.length > 1 ? s.name + ': ' : ''}${fmt(s.values[i], format)}`).join('\n')}`;

  let body = '';
  if (type === 'column') {
    const slot = cw / n, bw = Math.min(26, slot * 0.62);
    x.forEach((_, i) => {
      if (stacked) {
        let acc = 0;
        series.forEach((s, k) => {
          const v = s.values[i] || 0;
          if (!v) return;
          body += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, Y(acc) - Y(acc + v)).toFixed(1)}" rx="${k === series.length - 1 ? 3 : 0}" style="fill:${COLORS[k % COLORS.length]}"/>`;
          acc += v;
        });
      } else {
        const g = bw / series.length;
        series.forEach((s, k) => {
          const v = s.values[i];
          if (v === null || v === undefined) return;
          body += `<rect x="${(X(i) - bw / 2 + k * g).toFixed(1)}" y="${Y(Math.max(v, 0)).toFixed(1)}" width="${Math.max(2, g - 1).toFixed(1)}" height="${Math.abs(Y(v) - Y(0)).toFixed(1)}" rx="2" style="fill:${COLORS[k % COLORS.length]}"/>`;
        });
      }
    });
  } else if (stacked) {
    let base = x.map(() => 0);
    series.forEach((s, k) => {
      const upper = x.map((_, i) => base[i] + (s.values[i] || 0));
      const up = upper.map((v, i) => ({ x: X(i), y: Y(v) }));
      const lowPts = base.map((v, i) => ({ x: X(i), y: Y(v) })).reverse();
      const low = lowPts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      body += `<path d="${smooth(up)} ${low} Z" style="fill:${COLORS[k % COLORS.length]}" fill-opacity=".9"/>`;
      if (k === series.length - 1) body += `<path d="${smooth(up)}" class="vl" style="stroke:${COLORS[0]}"/>`;
      base = upper;
    });
  } else {
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => (v === null || v === undefined ? null : { x: X(i), y: Y(v) })).filter(Boolean);
      if (pts.length < 2) return;
      const c = COLORS[k % COLORS.length], line = smooth(pts), last = pts[pts.length - 1];
      if (single) {
        body += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c}" stop-opacity=".16"/><stop offset="1" style="stop-color:${c}" stop-opacity="0"/></linearGradient></defs>
<path d="${line} L${last.x.toFixed(1)},${(T + ch).toFixed(1)} L${pts[0].x.toFixed(1)},${(T + ch).toFixed(1)} Z" fill="url(#${id})"/>`;
      }
      body += `<path d="${line}" class="vl" style="stroke:${c}"/><circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" style="fill:${c}"/>`;
    });
  }
  const hit = x.map((_, i) => {
    const slot = type === 'column' ? cw / n : Math.max(step, 8);
    return `<rect class="vh" x="${(X(i) - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ch}"><title>${esc(tip(i))}</title></rect>`;
  }).join('');
  const legend = series.length > 1 ? `<div class="vlegend">${series.map((s, k) => `<span><i style="background:${COLORS[k % COLORS.length]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg class="viz" viewBox="0 0 ${w} ${h}" role="img">${grid}${body}${xs}${hit}</svg>${legend}`;
}

module.exports = { viz, xLabel, COLORS };
