const fs = require('fs');
const anfra = require('./anfra');
const { complete } = require('./range');
const { walk, blockEnd } = require('./index');

// Fields a metric can be split by: dimensions of the models on the "one" side of the dataset's relationships
// (splitting by those cannot double-count). Datasets with no relationships offer every model's dimensions.
function dimensionsOf(text) {
  const model = /(^|\n)\s*Model\s+(\w+)\s*\{/.exec(text);
  if (!model) return null;
  const label = /label:\s*(['"])(.*?)\1/.exec(text.slice(model.index + model[0].length));
  const out = [];
  const re = /(^|\n)[ \t]*dimension\s+(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const end = blockEnd(text, open);
    if (end < 0) continue;
    const body = text.slice(open, end);
    const l = /label:\s*(['"])(.*?)\1/.exec(body);
    const t = /type:\s*(['"])(.*?)\1/.exec(body);
    out.push({ name: m[2], label: l ? l[2] : m[2], type: t ? t[2] : '', pk: /primary_key:\s*true/.test(body) });
  }
  return { name: model[2], label: label ? label[2] : model[2], dims: out };
}

function fieldsFor(cfg, dataset) {
  const dsFile = walk(`${cfg.repoPath}/datasets`, '.aml').map((f) => fs.readFileSync(f, 'utf8')).find((t) => new RegExp(`Dataset\\s+${dataset}\\s*\\{`).test(t));
  if (!dsFile) return [];
  const names = ((/models:\s*\[([^\]]*)\]/.exec(dsFile) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const oneSide = [...dsFile.matchAll(/relationship\(\s*\w+\.\w+\s*[>-]\s*(\w+)\./g)].map((m) => m[1]);
  const models = walk(`${cfg.repoPath}/models`, '.aml').map((f) => dimensionsOf(fs.readFileSync(f, 'utf8'))).filter((m) => m && names.includes(m.name));
  const out = [];
  for (const m of models.filter((x) => !oneSide.length || oneSide.includes(x.name))) {
    for (const d of m.dims.filter((x) => !x.pk)) {
      if (d.type === 'text') out.push({ id: `${m.name}.${d.name}`, model: m.label, label: d.label, kind: 'text' });
      if (d.type === 'date' || d.type === 'datetime') {
        for (const g of ['day', 'week', 'month']) out.push({ id: `${m.name}.${d.name}|${g}`, model: m.label, label: `${d.label} (${g[0].toUpperCase()})`, kind: 'date' });
      }
    }
  }
  return out.sort((a, b) => (b.kind === 'date') - (a.kind === 'date'));
}

const aqlOf = (id) => { const [f, g] = id.split('|'); return g ? `${f} | ${g}()` : f; };

// One query per pick: the metric split by the field, over the period; with a period, also the prior period.
async function split(cfg, metric, fieldId, range) {
  const date = ((cfg.canvas || {}).date || {})[metric.dataset];
  const filter = (r) => (r && date ? `filters { ${date} matches @(${r[0]} until ${r[1]}) }` : '');
  const run = (r) => anfra.query(cfg.anfra.url, metric.dataset,
    `explore { dimensions { d: ${aqlOf(fieldId)} } measures { v: ${metric.name} } ${filter(r)} }`).then((t) => t.rows);
  const [cur, prev, total] = await Promise.all([
    run(range && range.cur),
    range && range.prev ? run(range.prev) : null,
    anfra.query(cfg.anfra.url, metric.dataset, `explore { measures { v: ${metric.name} } ${filter(range && range.cur)} }`).then((t) => (t.rows[0] ? t.rows[0].v : null)),
  ]);
  const key = (r) => (r.d === null || r.d === undefined ? '(none)' : /^\d{4}-\d\d-\d\d/.test(String(r.d)) ? String(r.d).slice(0, 10) : String(r.d));
  const before = new Map((prev || []).map((r) => [key(r), r.v]));
  const rows = cur.map((r) => ({ key: key(r), value: r.v, prev: before.has(key(r)) ? before.get(key(r)) : null }));
  const sum = rows.reduce((s, r) => s + (r.value || 0), 0);
  return { rows, total, additive: total !== null && Math.abs(sum - total) <= Math.abs(total) * 0.005 };
}

// The same metric over time for the chart. A text field splits it into one series per segment (largest first);
// a date field becomes the x axis itself. No field: one series, by week.
async function trend(cfg, metric, field, range) {
  const date = ((cfg.canvas || {}).date || {})[metric.dataset];
  const filter = (r) => (r && date ? `filters { ${date} matches @(${r[0]} until ${r[1]}) }` : '');
  const byDate = field && field.kind === 'date';
  const grain = byDate ? field.id.split('|')[1] : range.grain;
  const xExpr = byDate ? aqlOf(field.id) : date ? `${date} | ${grain}()` : null;
  if (!xExpr) return null;
  const split = field && !byDate;
  const t = await anfra.query(cfg.anfra.url, metric.dataset,
    `explore { dimensions { t: ${xExpr}${split ? `, d: ${aqlOf(field.id)}` : ''} } measures { v: ${metric.name} } ${filter(range && range.cur)} sorts { t asc } }`);
  const day = (v) => String(v).slice(0, 10);
  const rows = t.rows.filter((r) => complete(day(r.t), grain, range && range.span));
  const x = [...new Set(rows.map((r) => day(r.t)))].sort();
  const names = split ? [...new Set(rows.map((r) => String(r.d ?? '(none)')))] : [metric.label || metric.name];
  const series = names.map((name) => ({ name, values: x.map((k) => {
    const r = rows.find((q) => day(q.t) === k && (!split || String(q.d ?? '(none)') === name));
    return r ? r.v : null;
  }) }));
  series.sort((a, b) => b.values.reduce((s, v) => s + (v || 0), 0) - a.values.reduce((s, v) => s + (v || 0), 0));
  return { x, series: series.slice(0, 8), grain };
}

// A field is worth offering only if it really splits the metric: two or more segments with a value, or a date.
async function usable(cfg, metric, fields) {
  const ok = await Promise.all(fields.map(async (f) => {
    if (f.kind === 'date') return true;
    try {
      const t = await anfra.query(cfg.anfra.url, metric.dataset, `explore { dimensions { d: ${aqlOf(f.id)} } measures { v: ${metric.name} } }`);
      return t.rows.filter((r) => r.v !== null && r.v !== undefined).length >= 2;
    } catch { return false; }
  }));
  return fields.filter((_, i) => ok[i]);
}

module.exports = { fieldsFor, split, trend, usable };
