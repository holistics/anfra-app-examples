const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const YAML = require('yaml');

async function health(url) {
  try {
    const r = await fetch(url + '/health', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

async function waitHealthy(url, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await health(url)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function query(url, dataset, aql) {
  const r = await fetch(url + '/api/core.query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataset, query: aql }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = body.message || body.error || body;
    throw new Error(typeof e === 'string' ? e : JSON.stringify(e));
  }
  const fields = body.result.fields;
  const cols = Object.fromEntries((body.columns || []).map((c) => [c.name, c]));
  const rows = body.result.records.map((rec) =>
    Object.fromEntries(fields.map((f, i) => {
      const v = rec[i];
      const isNum = cols[f] && cols[f].semantic_type === 'number' && v !== null && v !== '';
      // Division by zero comes back as Infinity / NaN: a missing value, not a number to plot.
      return [f, isNum ? (Number.isFinite(Number(v)) ? Number(v) : null) : v];
    })));
  return { fields, columns: body.columns || [], rows, sql: body.sql };
}

async function metricValue(url, dataset, name) {
  const r = await query(url, dataset, `explore { measures { v: ${name} } }`);
  return r.rows[0] ? r.rows[0].v : null;
}

// A throwaway copy of the repo's AML (datasets, models, source config): the live files are never written.
function makeTempRepo(repoPath, edits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anfra-metric-log-'));
  if (fs.existsSync(path.join(repoPath, '.anfra'))) fs.cpSync(path.join(repoPath, '.anfra'), path.join(dir, '.anfra'), { recursive: true });
  // Every AML file, wherever the repo keeps it (datasets/, models/, or elsewhere), but not dependencies or app code.
  const skip = (p) => /(^|\/)(node_modules|\.git|\.anfra|apps|data)(\/|$)/.test(path.relative(repoPath, p));
  const walkAml = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return skip(p) ? [] : e.isDirectory() ? walkAml(p) : e.name.endsWith('.aml') ? [p] : [];
  });
  for (const f of walkAml(repoPath)) {
    const to = path.join(dir, path.relative(repoPath, f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
  }
  for (const [file, text] of Object.entries(edits)) fs.writeFileSync(path.join(dir, path.relative(repoPath, file)), text);
  copyDuckdbSources(dir);
  return dir;
}

// DuckDB allows one process on a file, and the live anfra serve holds it: the copy queries its own snapshot.
function copyDuckdbSources(dir) {
  const f = path.join(dir, '.anfra', 'data_sources.yml');
  if (!fs.existsSync(f)) return;
  const doc = YAML.parse(fs.readFileSync(f, 'utf8'));
  for (const [name, src] of Object.entries((doc && doc.data_sources) || {})) {
    if (src.type !== 'duckdb' || !src.connection || !fs.existsSync(src.connection.path)) continue;
    const to = path.join(dir, 'data', name + '.duckdb');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src.connection.path, to);
    src.connection.path = to;
  }
  fs.writeFileSync(f, YAML.stringify(doc));
}

function validateRepo(dir) {
  let out;
  try {
    out = execFileSync('anfra', ['validate'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  let doc = null;
  try { doc = YAML.parse(out); } catch {}
  if (doc && doc.valid === true) return { ok: true };
  const msgs = doc ? [...(doc.diagnostics || []), ...(doc.reports || [])].map((r) => String(r.message || '').trim()).filter(Boolean) : [];
  return { ok: false, message: msgs.length ? msgs.join('\n') : out.trim().slice(0, 600) };
}

async function serveTemp(dir) {
  const port = 7901 + Math.floor(Math.random() * 90);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn('anfra', ['serve', '--addr', `127.0.0.1:${port}`, '--no-apps', '--no-mcp', '--no-watch'], { cwd: dir, stdio: 'ignore' });
  const up = await waitHealthy(url);
  const stop = () => { try { child.kill(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  if (!up) { stop(); throw new Error('could not start a temporary anfra serve for the new definition'); }
  return { url, stop };
}

module.exports = { health, waitHealthy, query, metricValue, makeTempRepo, validateRepo, serveTemp };
