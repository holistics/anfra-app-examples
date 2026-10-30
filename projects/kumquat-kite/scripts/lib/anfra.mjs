// Starts the repo's Anfra core (`anfra serve`, through bin/anfra) on a private loopback port and talks to its core
// API. Used by the app server, the reconciliation script and the tests. The core has no authentication of its
// own, so it is never bound to anything but 127.0.0.1 and is only reached through the app server's checked proxy.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { writeDataSource } from '../configure_anfra.mjs';

// bin/anfra wraps the CLI the brief names; the container image sets ANFRA_BIN to its own anfra 0.8.0 binary.
const ANFRA_BIN = process.env.ANFRA_BIN || path.join(ROOT, 'bin', 'anfra');
// The repo the core serves: anfra/ by default. KK_ANFRA_REPO points the test server and the test checks at a copy of
// the semantic layer whose data source is the test database (prepareAnfraRepo), so a test never shares the demo's
// core or data. (anfra reads its data source from a file in the repo, and allows one core per repo.)
export const anfraRepo = () => path.resolve(process.env.KK_ANFRA_REPO || path.join(ROOT, 'anfra'));

// A copy of the semantic layer (models, datasets, the context sources) in `dir`, with a data source for the database
// the environment names. Used for the test database; the apps are served by the app server, not by the core.
export function prepareAnfraRepo(dir) {
  for (const part of ['models', 'datasets']) {
    fs.rmSync(path.join(dir, part), { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'anfra', part), path.join(dir, part), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.anfra'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'anfra', '.anfra', 'context_sources.yml'), path.join(dir, '.anfra', 'context_sources.yml'));
  return writeDataSource(dir);
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// The URL of the core already serving this repo (anfra allows one per repo), or null.
export function runningAnfra() {
  try {
    const out = execFileSync(ANFRA_BIN, ['status'], { cwd: anfraRepo(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /state:\s*healthy/.test(out) ? (out.match(/url:\s*(http:\/\/127\.0\.0\.1:\d+)/) ?? [])[1] ?? null : null;
  } catch { return null; }
}

function client(base, child, getOutput) {
  return {
    base, child,
    output: getOutput,
    async call(op, body) {
      const r = await fetch(`${base}/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(json?.error?.message ?? `${op} failed (${r.status})`); e.status = r.status; e.body = json; throw e; }
      return json;
    },
    // AQL query → rows as objects keyed by field name, values as returned (numbers are strings with every digit).
    async rows(dataset, query, extra = {}) {
      const res = await this.call('core.query', { dataset, query, lang: 'aql', timezone: 'Asia/Ho_Chi_Minh', ...extra });
      return res.result.records.map((rec) => Object.fromEntries(res.result.fields.map((f, i) => [f, rec[i]])));
    },
    async stop() {
      if (!child || child.exitCode !== null) return; // a core we reused belongs to whoever started it
      child.kill('SIGTERM');
      await new Promise((r) => { const t = setTimeout(() => { child.kill('SIGKILL'); r(); }, 5000); child.once('exit', () => { clearTimeout(t); r(); }); });
    },
  };
}

export async function startAnfra({ port, apps = false, log = () => {}, reuse = true } = {}) {
  const existing = reuse ? runningAnfra() : null;
  if (existing) return client(existing, null, () => '');
  const p = port ?? await freePort();
  const args = ['serve', '--addr', `127.0.0.1:${p}`, '--no-mcp', '--no-watch'];
  if (!apps) args.push('--no-apps');
  const child = spawn(ANFRA_BIN, args, { cwd: anfraRepo(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env } });
  let output = '';
  const keep = (b) => { const s = b.toString(); output = (output + s).slice(-20000); log(s); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 90000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`anfra serve exited (${child.exitCode}): ${output.slice(-2000)}`);
    try { const r = await fetch(`${base}/health`); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) { child.kill(); throw new Error(`anfra serve did not become healthy: ${output.slice(-2000)}`); }
    await new Promise((r) => setTimeout(r, 300));
  }
  return client(base, child, () => output);
}
