const fs = require('fs');
const anfra = require('./anfra');
const { dependents, rewriteDefinition } = require('./index');

// Validates the new definition, then computes every affected value twice with Anfra:
// live repo (old definition) and a temporary copy with the new definition (live file untouched).
async function computeImpact(cfg, index, metricId, newDef) {
  const target = index.metrics[metricId];
  const text = fs.readFileSync(target.file, 'utf8');
  const edited = rewriteDefinition(text, target, newDef);
  const dir = anfra.makeTempRepo(cfg.repoPath, { [target.file]: edited });
  const valid = anfra.validateRepo(dir);
  if (!valid.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { valid: false, message: valid.message };
  }
  let temp;
  try {
    temp = await anfra.serveTemp(dir);
    const affectedIds = [metricId, ...dependents(index, metricId)];
    const metrics = await Promise.all(affectedIds.map(async (id) => {
      const m = index.metrics[id];
      const [oldV, newV] = await Promise.all([
        anfra.metricValue(cfg.anfra.url, m.dataset, m.name),
        anfra.metricValue(temp.url, m.dataset, m.name),
      ]);
      return { id, label: m.label, format: m.format, changed: id === metricId, old: oldV, new: newV };
    }));
    const queries = [];
    for (const q of index.queries) {
      if (!q.detectable || q.dataset !== target.dataset) continue;
      const hit = q.metrics.filter((id) => affectedIds.includes(id));
      if (!hit.length) continue;
      try {
        const [o, n] = await Promise.all([anfra.query(cfg.anfra.url, q.dataset, q.aql), anfra.query(temp.url, q.dataset, q.aql)]);
        const dim = o.fields.find((f) => !o.columns.find((c) => c.name === f).isMeasure);
        const nByKey = dim ? new Map(n.rows.map((r) => [String(r[dim]), r])) : null;
        queries.push({
          app: q.app, appTitle: q.appTitle, query: q.query, label: q.label, by: dim || null,
          items: hit.map((id) => {
            const m = index.metrics[id];
            const base = { id, label: m.label, format: m.format };
            if (!dim) return { ...base, old: o.rows[0] ? o.rows[0][m.name] : null, new: n.rows[0] ? n.rows[0][m.name] : null };
            let moved = 0, best = null;
            for (const r of o.rows) {
              const nr = nByKey.get(String(r[dim]));
              const a = r[m.name], b = nr ? nr[m.name] : null;
              if (a === null || b === null || a === b) continue;
              moved++;
              const rel = Math.abs(b - a) / (Math.abs(a) || 1);
              if (!best || rel > best.rel) best = { rel, at: String(r[dim]).slice(0, 10), old: a, new: b };
            }
            return { ...base, points: o.rows.length, moved, at: best && best.at, old: best && best.old, new: best && best.new };
          }),
        });
      } catch (e) {
        queries.push({ app: q.app, appTitle: q.appTitle, query: q.query, label: q.label, error: e.message, items: [] });
      }
    }
    return { valid: true, metrics, queries, computedAt: new Date().toISOString() };
  } finally {
    if (temp) temp.stop(); else fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { computeImpact };
