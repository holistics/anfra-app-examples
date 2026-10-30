#!/usr/bin/env node
// Kumquat Kite POC server, on 127.0.0.1 (HOST=0.0.0.0 in the container image; the anfra core stays on loopback):
//   /                    the web app (web/public + the bundle in web/dist)
//   /config.json         public settings: the demo personas, the dataset, the scheduling estimates
//   /api/session         demo identity selection: choose a persona, get a signed session token (server/session.mjs)
//   /api/data/<op>       the application's data API: every read and write of the screens, run in PostgreSQL as the
//                        persona (server/data.mjs); the database's row-level security and functions decide what is allowed
//   /panels/<app>.html   the Anfra Data App definitions (code only; their data comes through the proxy)
//   /api/case-study/<f>  the anonymized TP Production Studio case study of the Welcome guide (content/case-study), for a persona
//   /api/holistics/embed a signed, short-lived URL for viewing a connected Holistics dashboard inside the app, for a
//                        persona who may read the link; off unless the workspace's embed credentials are set
//   /anfra/api/core.show, /anfra/api/core.query
//                        the only two Anfra operations reachable, and only for a persona whose roles may read the requested
//                        dataset, AQL only (no raw SQL, no data source). The Anfra core itself listens on a private
//                        loopback port and has no authentication of its own.
//   /healthz, /readyz    the process is up · the database answers and the figures are ready
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv, required, ROOT } from '../scripts/lib/env.mjs';
import { appPool, readerPool, dbSettings, describeDb } from '../scripts/lib/db.mjs';
import { startAnfra, anfraRepo } from '../scripts/lib/anfra.mjs';
import { writeDataSource } from '../scripts/configure_anfra.mjs';
import { PERSONAS } from '../shared/personas.mjs';
import { createDataApi, httpError } from './data.mjs';
import { createSessions } from './session.mjs';

const env = loadEnv();
required(env, 'KK_APP_DB_PASSWORD');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
// Governed figures need the reader's password; without it (a deployment whose secret is missing) the app still runs.
const FIGURES = Boolean(env.ANFRA_DB_PASSWORD);
// The Holistics workspace the Reports "Add report" flow opens (https only). The owner's workspace is the default;
// HOLISTICS_REPORTS_URL changes it, and HOLISTICS_REPORTS_URL=off removes the button.
const HOLISTICS_URL = (() => {
  const raw = process.env.HOLISTICS_REPORTS_URL ?? 'https://bi.holistics.io';
  try { const u = new URL(raw); return u.protocol === 'https:' && /(^|\.)holistics\.io$/i.test(u.hostname) ? u.href : null; } catch { return null; }
})();
// Embedded viewing (Holistics embedded analytics): the workspace's embed Key ID and Secret, from the secret store, and
// the host of its data center (secure.holistics.io for APAC, us.holistics.io, eu.holistics.io, or a custom domain).
// The secret never leaves the server: the browser gets a URL whose token expires in 10 minutes.
const EMBED = {
  keyId: process.env.HOLISTICS_EMBED_KEY_ID || null,
  secret: process.env.HOLISTICS_EMBED_SECRET || null,
  host: /^[a-z0-9.-]+\.holistics\.io$/i.test(process.env.HOLISTICS_EMBED_HOST ?? '') ? process.env.HOLISTICS_EMBED_HOST : 'secure.holistics.io',
};
EMBED.enabled = Boolean(EMBED.keyId && EMBED.secret);
const REPORT_ROLES = ['bd', 'account', 'finance', 'admin'];
// Which roles may query which governed dataset through the proxy.
export const DATASET_ROLES = { kumquat_finance: ['bd', 'account', 'finance', 'admin'] };
const ALLOWED_OPS = new Set(['core.show', 'core.query']);
const LOG_DIR = process.env.KK_LOG_DIR || path.join(ROOT, 'logs'); // the image writes to its home
fs.mkdirSync(LOG_DIR, { recursive: true });
const accessLog = fs.createWriteStream(path.join(LOG_DIR, 'anfra-proxy.log'), { flags: 'a' });

// The database: the app role's pool (every request as the persona, server/data.mjs) and the demo sessions, whose
// roles are read from the database.
const pool = appPool();
const data = createDataApi(pool);
const sessions = createSessions({ secret: env.KK_SESSION_SECRET,
  lookup: (userId) => data.run(userId, async (db) => (await db.query('select role from public.role_memberships where user_id = app.uid()')).rows.map((r) => r.role)) });
const verify = (token) => sessions.verify(token);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.map': 'application/json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2' };
// No Content-Security-Policy on purpose: the SDK mounts panels as sandboxed srcdoc frames, which inherit the page's
// policy, and its provisioned inline scripts and <base> must run there. Framing of this app is still refused.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8' });

async function readJson(req, limit = 256 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function serveFile(res, file, { cache = false } = {}) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    send(res, 200, data, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': cache ? 'max-age=60' : 'no-store' });
  });
}
// Resolves a URL path inside a directory, refusing anything that escapes it.
function inside(dir, rel) {
  const p = path.resolve(dir, '.' + path.posix.normalize('/' + decodeURIComponent(rel)));
  return p.startsWith(dir + path.sep) ? p : null;
}

// ---- Result cache ------------------------------------------------------------------------------------------------
// An Anfra result is reused only for the identical query (the whole request body), on the same committed data version
// (reporting.data_version, moved by a trigger on every business table) and the same business date (relative dates and
// "overdue" depend on it). Any committed change makes the next query run fresh. A result does not depend on who asks:
// by then the proxy has checked that the caller may query the dataset. No version, no cache.
let versionPool = null;
const CACHE_ON = process.env.KK_RESULT_CACHE !== '0'; // KK_RESULT_CACHE=0 turns it off (to measure cold queries)
function dataVersionPool() {
  if (versionPool === null) versionPool = CACHE_ON && FIGURES ? readerPool() ?? false : false;
  return versionPool;
}
async function dataVersion() {
  const pool = dataVersionPool();
  if (!pool) return null;
  try { return (await pool.query('select version::text as v from reporting.data_version')).rows[0]?.v ?? null; } catch { return null; }
}
const businessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const resultCache = new Map(); // key -> response text, least recently used first
const CACHE_MAX = 400;

function logAccess(entry) {
  accessLog.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

// A JSON Web Token signed with HMAC-SHA256, as Holistics embedded analytics expects (HS256, with an expiry).
export function signHs256(payload, secret) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function embedUrl({ host, keyId, object, token }) {
  return `https://${host}/embed/${encodeURIComponent(keyId)}/objects/${encodeURIComponent(object)}?_token=${encodeURIComponent(token)}`;
}

// The Welcome guide's case study: anonymized presentation copies, served only to signed-in staff and never as public
// static files. The originals stay outside this repository.
const CASE_STUDY_DIR = path.join(ROOT, 'content', 'case-study');
async function caseStudy(req, res, file) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  if (!/^[a-z0-9-]{1,60}\.(md|json)$/.test(file)) return send(res, 404, 'Not found');
  const auth = req.headers.authorization ?? '';
  const who = auth.startsWith('Bearer ') ? await verify(auth.slice(7).trim()).catch(() => null) : null;
  if (!who) return json(res, 401, { error: 'Choose a demo persona to read the case study.' });
  if (!who.roles.length) return json(res, 403, { error: 'This persona has no role yet.' });
  const f = inside(CASE_STUDY_DIR, file);
  if (!f || !fs.existsSync(f)) return send(res, 404, 'Not found');
  fs.readFile(f, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, { 'content-type': file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8' });
  });
}

async function holisticsEmbed(req, res) {
  const fail = (status, code, message) => { logAccess({ op: 'holistics.embed', status, code }); return json(res, status, { error: { code, message } }); };
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only.');
  if (!EMBED.enabled) return fail(503, 'embed_not_configured', 'Viewing Holistics dashboards inside Kumquat Kite is not set up: the server has no embed credentials for the Holistics workspace.');
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const who = token ? await verify(token).catch(() => null) : null;
  if (!who) return fail(401, 'unauthenticated', 'Choose a demo persona again to view this report.');
  if (!who.roles.some((r) => REPORT_ROLES.includes(r))) return fail(403, 'forbidden', 'Reports are for BD, Account, Finance and Admin.');
  let body;
  try { body = await readJson(req, 4096); } catch (e) { return fail(e.status ?? 400, 'invalid_request', e.message); }
  if (!/^[0-9a-f-]{36}$/i.test(String(body.id ?? ''))) return fail(400, 'invalid_request', 'A report link id is needed.');
  // The link is read as the persona, so the database decides whether this persona may see it.
  let link;
  try {
    link = await data.run(who.userId, async (db) => (await db.query('select id, report_ref, embed_object, archived_at from public.report_links where id = $1', [body.id])).rows[0] ?? null);
  } catch { return fail(502, 'unavailable', 'The report link could not be read.'); }
  if (!link || link.archived_at) return fail(404, 'not_found', 'This report link does not exist or was removed.');
  if (!link.embed_object) return fail(409, 'embed_object_missing', 'An Admin has not named the embedded dashboard for this report yet.');
  const exp = Math.floor(Date.now() / 1000) + 600;
  const url = embedUrl({ host: EMBED.host, keyId: EMBED.keyId, object: link.embed_object, token: signHs256({ objects: { dashboards: [link.embed_object] }, exp }, EMBED.secret) });
  logAccess({ op: 'holistics.embed', status: 200, user: who.email, report: link.report_ref, object: link.embed_object });
  return json(res, 200, { url, expiresAt: new Date(exp * 1000).toISOString() });
}

async function proxyAnfra(req, res, op, figures) {
  const started = Date.now();
  const deny = (status, code, message, extra = {}) => {
    logAccess({ op, status, code, ...extra });
    return json(res, status, { error: { code, scope: 'user', message } });
  };
  if (req.method !== 'POST') return deny(405, 'method_not_allowed', 'POST only.');
  if (!ALLOWED_OPS.has(op)) return deny(404, 'not_found', 'This Anfra operation is not available through the app.');
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return deny(401, 'unauthenticated', 'Choose a demo persona to see the figures.');
  const who = await verify(token).catch(() => null);
  if (!who) return deny(401, 'unauthenticated', 'The demo session is invalid or has ended. Choose a persona again.');
  let body;
  try { body = await readJson(req); } catch (e) { return deny(e.status ?? 400, 'invalid_request', e.message, { user: who.email }); }
  const readable = Object.entries(DATASET_ROLES).filter(([, roles]) => who.roles.some((r) => roles.includes(r))).map(([d]) => d);
  if (op === 'core.query') {
    if (body.lang !== undefined && body.lang !== 'aql') return deny(403, 'forbidden', 'Only AQL queries on a governed dataset are allowed.', { user: who.email });
    if (body.data_source !== undefined) return deny(403, 'forbidden', 'Querying a data source directly is not allowed.', { user: who.email });
    if (!readable.includes(body.dataset)) {
      return deny(403, 'forbidden', 'Your role may not query this finance dataset.', { user: who.email, dataset: body.dataset });
    }
  }
  if (op === 'core.show' && readable.length === 0) return deny(403, 'forbidden', 'Your role has no dataset to query.', { user: who.email });
  if (op === 'core.show' && body.fqn !== undefined && !readable.includes(body.fqn)) return deny(403, 'forbidden', 'You may not see this dataset.', { user: who.email });
  let cacheKey = null;
  if (op === 'core.query') {
    const version = await dataVersion();
    if (version) {
      cacheKey = crypto.createHash('sha256').update(JSON.stringify([version, businessDate(), body])).digest('hex');
      const hit = resultCache.get(cacheKey);
      if (hit !== undefined) {
        resultCache.delete(cacheKey); resultCache.set(cacheKey, hit);
        logAccess({ op, status: 200, user: who.email, roles: who.roles, dataset: body.dataset, ms: Date.now() - started, cache: 'hit', data_version: version,
          aql_sha256: body.query ? crypto.createHash('sha256').update(body.query).digest('hex').slice(0, 16) : undefined });
        return send(res, 200, hit, { 'content-type': 'application/json; charset=utf-8', 'x-kk-cache': 'hit' });
      }
    }
  }
  let anfra;
  try { anfra = await figures(); } catch (e) {
    logAccess({ op, status: 503, user: who.email, code: e.code ?? 'figures_unavailable' });
    return json(res, 503, { error: { code: e.code ?? 'figures_unavailable', scope: 'server', message: e.message } });
  }
  try {
    const r = await fetch(`${anfra.base}/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let text = await r.text();
    if (cacheKey && r.status === 200) {
      resultCache.set(cacheKey, text);
      if (resultCache.size > CACHE_MAX) resultCache.delete(resultCache.keys().next().value);
    }
    if (op === 'core.show' && r.ok) {
      // Only the datasets this session may query are described to it.
      const shown = JSON.parse(text);
      if (shown?.object?.kind === 'repo') shown.object.datasets = shown.object.datasets.filter((d) => readable.includes(d.fqn));
      text = JSON.stringify(shown);
    }
    logAccess({ op, status: r.status, user: who.email, roles: who.roles, dataset: body.dataset ?? body.fqn ?? null, ms: Date.now() - started,
      ...(cacheKey ? { cache: 'miss' } : {}),
      aql_sha256: body.query ? crypto.createHash('sha256').update(body.query).digest('hex').slice(0, 16) : undefined });
    send(res, r.status, text, { 'content-type': 'application/json; charset=utf-8' });
  } catch (e) {
    logAccess({ op, status: 502, user: who.email, error: e.message });
    json(res, 502, { error: { code: 'sidecar_unavailable', scope: 'server', message: 'The Anfra figures server is not answering. Try again in a moment.' } });
  }
}

// The bundled synthetic snapshot, so Admin can preview and import it without a file picker. Admin sessions only.
const SNAPSHOT_FILES = new Set(['mapping.json', 'clients.csv', 'projects.csv', 'work_items.csv', 'cost_lines.csv', 'activities.csv']);
async function sampleSnapshot(req, res, rel) {
  const [folder, file, ...rest] = rel.split('/');
  if (folder !== '2026-10-14-synthetic' || !SNAPSHOT_FILES.has(file) || rest.length) return send(res, 404, 'Not found');
  const auth = req.headers.authorization ?? '';
  const who = auth.startsWith('Bearer ') ? await verify(auth.slice(7).trim()).catch(() => null) : null;
  if (!who) return json(res, 401, { error: 'choose a demo persona first' });
  if (!who.roles.includes('admin')) return json(res, 403, { error: 'Admin only' });
  return serveFile(res, path.join(ROOT, 'data', 'snapshots', folder, file));
}

// Demo identity selection: any of the six personas, for this browser tab (server/session.mjs).
async function sessionEndpoint(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const { persona } = await readJson(req, 4096);
  const session = sessions.issue(String(persona ?? ''));
  if (!session) return json(res, 400, { error: 'unknown persona' });
  return json(res, 200, session);
}

// The data API: one operation per request, as the persona (server/data.mjs). Role changes and a demo reset drop the
// cached roles, so the next request sees them.
async function dataEndpoint(req, res, op) {
  if (req.method !== 'POST') return json(res, 405, { error: { kind: 'invalid', message: 'POST only.' } });
  const auth = req.headers.authorization ?? '';
  const who = auth.startsWith('Bearer ') ? await verify(auth.slice(7).trim()).catch(() => null) : null;
  if (!who) return json(res, 401, { error: { kind: 'forbidden', code: 'unauthenticated', message: 'Your demo session has ended. Choose a persona again.' } });
  const { args = [] } = await readJson(req, 2 * 1024 * 1024);
  try {
    const result = await data.perform(who.userId, op, args);
    if (['grantRole', 'revokeRole', 'resetDemo'].includes(op)) sessions.forget();
    return json(res, 200, { data: result ?? null });
  } catch (e) {
    const answer = httpError(e);
    if (answer) return json(res, answer.status, answer.body);
    console.error(`data API ${op}:`, e);
    return json(res, 500, { error: { kind: 'unknown', message: 'Server error' } });
  }
}

export async function startServer({ port = PORT, build = true, log = console.log } = {}) {
  if (build) await (await import('./build.mjs')).buildWeb();
  const publicDir = path.join(ROOT, 'web', 'public');
  const distDir = path.join(ROOT, 'web', 'dist');
  const appsDir = path.join(ROOT, 'anfra', 'apps');
  // Listen first, so sign-in and every form work (and health checks pass) while the anfra core starts; a request for
  // figures waits for it. Without the reader's password the core is not started and figures say why.
  let anfra = null;
  // The core reads its data source from a file in its repo: written now from the environment, so it always queries the
  // database this server uses (KK_ANFRA_REPO gives the test server its own repo and database).
  if (FIGURES) writeDataSource(anfraRepo());
  const anfraReady = FIGURES
    ? startAnfra({ reuse: false }).then((a) => { anfra = a; log(`anfra core on ${a.base} (private, loopback)`); return a; })
    : Promise.reject(Object.assign(new Error('Governed figures are not configured on this deployment: the database password secret (ANFRA_DB_PASSWORD) is missing. Everything else works.'), { code: 'figures_not_configured' }));
  anfraReady.catch((e) => { if (FIGURES) log(`anfra core did not start: ${String(e.message).split('\n')[0]}`); });
  // Warm-up: run every panel query once in the background, so the first reader does not pay for the engine's start
  // (its compiler and database connections). Results are discarded; nothing is cached from it.
  anfraReady.then(async (a) => {
    const t = Date.now(); let n = 0;
    const files = fs.readdirSync(appsDir, { recursive: true }).map(String).filter((f) => f.endsWith('.html'));
    const [y, mo] = businessDate().split('-').map(Number); // the reports' default period: this month and the three before
    const period = { field: 'projects.contract_signed_date', operator: 'between',
      values: [new Date(Date.UTC(y, mo - 4, 1)).toISOString().slice(0, 10), new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)] };
    // The same filter shapes the panels send, so the engine prepares exactly those queries.
    const inputFor = (f) => (f.startsWith('job360') ? { filters: [{ field: 'projects.project_ref', operator: 'is', values: ['NP-0001'] }] }
      : f.includes('pipeline') ? {} : { filters: [period] });
    for (const f of files) {
      const html = fs.readFileSync(path.join(appsDir, f), 'utf8');
      for (const m of html.matchAll(/createQuery\('([^']+)',\s*\{[^`]*?aql:\s*`([\s\S]*?)`\s*\}\)/g)) {
        await fetch(`${a.base}/api/core.query`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dataset: 'kumquat_finance', query: m[2], lang: 'aql', timezone: 'Asia/Ho_Chi_Minh', input: inputFor(f) }) }).then((r) => r.text()).catch(() => {});
        n++;
      }
    }
    log(`anfra warm-up: ${n} panel queries in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }).catch(() => {});
  const figures = () => Promise.race([anfraReady.catch((e) => { throw Object.assign(new Error(e.code ? e.message : 'The Anfra figures server did not start. Try again later.'), { code: e.code ?? 'figures_unavailable' }); }),
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('The Anfra figures server is still starting. Try again in a moment.'), { code: 'figures_starting' })), 60000).unref())]);
  // sent to the browser as they are. If the file is missing or broken they are left out, and every suggestion then
  // says "Needs scheduling information".
  let scheduling = null;
  try { const { about, ...settings } = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'scheduling.json'), 'utf8')); scheduling = settings; }
  catch (e) { console.warn(`Scheduling settings not loaded (config/scheduling.json): ${e.message}`); }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${HOST}`);
      const p = url.pathname;
      if (p === '/' || p === '/index.html') return serveFile(res, path.join(publicDir, 'index.html'));
      if (p === '/config.json') {
        return json(res, 200, { figures: FIGURES, holisticsUrl: HOLISTICS_URL, holistics: { url: HOLISTICS_URL, embed: EMBED.enabled },
          personas: Object.entries(PERSONAS).map(([key, v]) => ({ key, id: v.id, name: v.name, title: v.title, email: v.email, roles: v.roles })),
          dataset: 'kumquat_finance', datasetRoles: DATASET_ROLES, timezone: 'Asia/Ho_Chi_Minh', scheduling, synthetic: true });
      }
      if (p === '/healthz') return json(res, 200, { ok: true });
      if (p === '/readyz') {
        const db = await pool.query('select 1').then(() => true, () => false);
        return json(res, db && (anfra || !FIGURES) ? 200 : 503, { ok: db && Boolean(anfra || !FIGURES), database: db, figures: FIGURES && Boolean(anfra) });
      }
      if (p === '/api/session') return await sessionEndpoint(req, res);
      if (p.startsWith('/api/data/')) return await dataEndpoint(req, res, p.slice('/api/data/'.length));
      if (p === '/api/holistics/embed') return await holisticsEmbed(req, res);
      if (p.startsWith('/api/case-study/')) return await caseStudy(req, res, p.slice('/api/case-study/'.length));
      if (p.startsWith('/anfra/api/')) return await proxyAnfra(req, res, p.slice('/anfra/api/'.length), figures);
      if (p.startsWith('/snapshots/')) return await sampleSnapshot(req, res, p.slice('/snapshots/'.length));
      if (p.startsWith('/panels/')) { const f = inside(appsDir, p.slice('/panels/'.length)); return f ? serveFile(res, f) : send(res, 404, 'Not found'); }
      if (p.startsWith('/assets/')) {
        const rel = p.slice('/assets/'.length);
        const f = inside(distDir, rel) && fs.existsSync(inside(distDir, rel)) ? inside(distDir, rel) : inside(path.join(publicDir, 'assets'), rel);
        return f ? serveFile(res, f, { cache: true }) : send(res, 404, 'Not found');
      }
      if (p === '/favicon.ico') return serveFile(res, path.join(publicDir, 'assets', 'favicon.svg'));
      send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    } catch (e) {
      json(res, e.status ?? 500, { error: e.status ? e.message : 'internal error' });
      if (!e.status) console.error(e);
    }
  });
  await new Promise((resolve) => server.listen(port, HOST, resolve));
  const close = async () => {
    await new Promise((r) => server.close(r)); await anfra?.stop();
    if (versionPool) await versionPool.end().catch(() => {});
    await pool.end().catch(() => {}); accessLog.end();
  };
  await anfraReady.catch(() => {}); // the caller gets a server whose figures are ready (or known to be off)
  return { server, get anfra() { return anfra; }, url: `http://${HOST}:${server.address().port}`, close };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer({ build: process.env.SKIP_BUILD !== '1' }); // the image ships a prebuilt bundle
  console.log(`Kumquat Kite POC on ${s.url}  (database ${describeDb(dbSettings())}; synthetic demo data; demo personas, no sign-in${sessions.ephemeral ? ' (KK_SESSION_SECRET not set: sessions end when the server restarts)' : ''}; governed figures ${FIGURES ? 'on' : 'OFF: ANFRA_DB_PASSWORD missing'}; result cache ${FIGURES && CACHE_ON ? 'on' : 'off'})`);
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
