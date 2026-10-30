const anfra = require('./anfra');

const PRESETS = [
  ['all', 'All time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'], ['mtd', 'Month to date'], ['lastmonth', 'Last month'], ['ytd', 'Year to date'],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;
const parse = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
const days = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const short = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
const withYear = (s) => `${short(s)}, ${s.slice(0, 4)}`;

// First and last day with data, across the datasets that have a canvas date. Rolling presets count back from the last day.
const cache = {};
async function bounds(cfg, dataset) {
  const hit = cache[dataset || '*'];
  if (hit && Date.now() - hit.at < 15000) return hit.v;
  const out = { min: null, max: null };
  for (const [ds, date] of Object.entries((cfg.canvas || {}).date || {})) {
    if (dataset && ds !== dataset) continue;
    try {
      const r = await anfra.query(cfg.anfra.url, ds, `explore { measures { lo: min(${date}), hi: max(${date}) } }`);
      const lo = r.rows[0] && String(r.rows[0].lo).slice(0, 10), hi = r.rows[0] && String(r.rows[0].hi).slice(0, 10);
      if (lo && (!out.min || lo < out.min)) out.min = lo;
      if (hi && (!out.max || hi > out.max)) out.max = hi;
    } catch {}
  }
  cache[dataset || '*'] = { at: Date.now(), v: out };
  return out;
}

// A week or month bucket is drawn only if it lies fully inside the range: a part-filled edge bucket would look like a drop.
const nextMonth = (s) => iso(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 1)));
function complete(key, grain, span) {
  if (!span || grain === 'day') return true;
  const end = grain === 'week' ? add(key, 7) : nextMonth(key);
  return key >= span[0] && end <= span[1];
}

const autoGrain = (n) => (n <= 31 ? 'day' : n <= 730 ? 'week' : 'month');

// spec: a preset key, or "c:YYYY-MM-DD..YYYY-MM-DD" (both days included). `to` is exclusive.
function resolve(spec, b) {
  const all = () => ({ key: 'all', label: 'All time', cur: null, prev: null, span: b.min ? [b.min, add(b.max, 1)] : null, rolling: true, anchor: b.max, grain: b.min ? autoGrain(days(b.min, add(b.max, 1))) : 'week' });
  if (!b.max || !spec || spec === 'all') return all();
  const a = b.max;
  let from, to, key = spec, label;
  const m = /^c:(\d{4}-\d\d-\d\d)\.\.(\d{4}-\d\d-\d\d)$/.exec(spec);
  if (m) {
    [from, to] = m[1] <= m[2] ? [m[1], add(m[2], 1)] : [m[2], add(m[1], 1)];
    label = to === add(from, 1) ? withYear(from) : `${short(from)} – ${short(add(to, -1))}${from.slice(0, 4) === add(to, -1).slice(0, 4) ? '' : `, ${add(to, -1).slice(0, 4)}`}`;
    key = 'custom';
  } else {
    const first = `${a.slice(0, 8)}01`;
    const preset = {
      today: [a, add(a, 1)], yesterday: [add(a, -1), a], '7d': [add(a, -6), add(a, 1)], '30d': [add(a, -29), add(a, 1)], '90d': [add(a, -89), add(a, 1)],
      mtd: [first, add(a, 1)], lastmonth: [iso(new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 2, 1))), first], ytd: [`${a.slice(0, 4)}-01-01`, add(a, 1)],
    }[spec];
    if (!preset) return all();
    [from, to] = preset;
    label = PRESETS.find((p) => p[0] === spec)[1];
  }
  const n = days(from, to);
  return { key, label, cur: [from, to], prev: [add(from, -n), from], span: [from, to], rolling: key !== 'custom', anchor: a, grain: autoGrain(n) };
}

module.exports = { PRESETS, bounds, resolve, complete, short, withYear };
