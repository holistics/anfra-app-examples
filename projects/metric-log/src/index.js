const fs = require('fs');
const path = require('path');

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// Index just past the "}" that closes the "{" at `open`, skipping @aql/@sql/@md bodies and strings.
function blockEnd(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '@' && /^@(aql|sql|md)\b/.test(text.slice(i, i + 5))) {
      const j = text.indexOf(';;', i);
      if (j < 0) return -1;
      i = j + 1;
      continue;
    }
    if (text.startsWith("'''", i)) {
      const j = text.indexOf("'''", i + 3);
      if (j < 0) return -1;
      i = j + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      i = j;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

function parseDatasetFile(file, text) {
  const out = [];
  const dm = /(^|\n)\s*Dataset\s+(\w+)\s*\{/.exec(text);
  if (!dm) return out;
  const dataset = dm[2];
  const dlabel = /label:\s*(['"])(.*?)\1/.exec(text.slice(dm.index + dm[0].length, dm.index + dm[0].length + 400));
  const re = /(^|\n)[ \t]*metric\s+(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const end = blockEnd(text, open);
    if (end < 0) continue;
    const body = text.slice(open, end);
    const label = /label:\s*(['"])(.*?)\1/.exec(body);
    const format = /format:\s*(['"])(.*?)\1/.exec(body);
    const def = /definition:\s*@aql\s*([\s\S]*?)\s*;;/.exec(body);
    if (!def) continue;
    const defStart = open + def.index + def[0].indexOf(def[1]);
    out.push({
      id: `${dataset}.${m[2]}`,
      dataset,
      datasetLabel: dlabel ? dlabel[2] : dataset,
      name: m[2],
      label: label ? label[2] : m[2],
      format: format ? format[2] : '',
      definition: def[1].trim(),
      file,
      defStart,
      defEnd: defStart + def[1].length,
    });
  }
  return out;
}

function stripLiterals(s) {
  return s
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function mentions(text, name) {
  return new RegExp(`(?<![\\w.])${name}(?![\\w])`).test(stripLiterals(text));
}

function parseApps(appsDir) {
  const queries = [];
  for (const file of walk(appsDir, '.html')) {
    const html = fs.readFileSync(file, 'utf8');
    const app = path.relative(appsDir, file).replace(/\.html$/, '');
    const title = (/<title>(.*?)<\/title>/.exec(html) || [])[1] || app;
    const labels = {};
    const parts = html.split(/(?=data-anfra-block=)/);
    for (const part of parts.slice(1)) {
      const lab = /data-anfra-label="([^"]*)"/.exec(part.slice(0, 400));
      if (!lab) continue;
      for (const q of part.matchAll(/data-anfra-query="([^"]+)"/g)) labels[q[1]] = labels[q[1]] || lab[1];
    }
    const calls = html.split(/\.createQuery\(/).slice(1);
    for (const call of calls) {
      const name = /^\s*(['"`])([\w-]+)\1/.exec(call);
      if (!name) continue;
      const ds = /dataset:\s*(['"`])([^'"`]+)\1/.exec(call);
      const aql = /aql:\s*`([\s\S]*?)`/.exec(call);
      const detectable = !!(ds && aql && !aql[1].includes('${'));
      queries.push({
        app, appTitle: title, query: name[2], label: labels[name[2]] || name[2],
        dataset: ds ? ds[2] : null, aql: detectable ? aql[1].trim() : null, detectable,
      });
    }
  }
  return queries;
}

function buildIndex(repoPath) {
  const metrics = {};
  for (const file of walk(path.join(repoPath, 'datasets'), '.aml')) {
    for (const m of parseDatasetFile(file, fs.readFileSync(file, 'utf8'))) metrics[m.id] = { ...m, references: [], referencedBy: [] };
  }
  const list = Object.values(metrics);
  for (const a of list) {
    for (const b of list) {
      if (a !== b && a.dataset === b.dataset && mentions(a.definition, b.name)) {
        a.references.push(b.id);
        b.referencedBy.push(a.id);
      }
    }
  }
  const queries = parseApps(path.join(repoPath, 'apps'));
  for (const q of queries) {
    q.metrics = q.detectable ? list.filter((m) => m.dataset === q.dataset && mentions(q.aql, m.name)).map((m) => m.id) : [];
  }
  for (const m of list) m.usedBy = queries.filter((q) => q.metrics.includes(m.id));
  return { metrics, queries };
}

function dependents(index, id) {
  const seen = [];
  const walkDeps = (x) => {
    for (const d of index.metrics[x].referencedBy) {
      if (!seen.includes(d)) { seen.push(d); walkDeps(d); }
    }
  };
  walkDeps(id);
  return seen;
}

function rewriteDefinition(text, metric, newDef) {
  return text.slice(0, metric.defStart) + newDef.trim() + text.slice(metric.defEnd);
}

module.exports = { buildIndex, dependents, rewriteDefinition, walk, blockEnd };
