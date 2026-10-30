// The API tests' app: the real server (server/server.mjs), started in this process against the isolated test database,
// which is reset to the starting demo data first (scripts/lib/testdb.mjs refuses anything but a local *_test
// database). Each persona gets a demo session and the client the browser uses (shared/api.mjs over HTTP), so what the
// tests prove is what the screens do.
import { resetTestDatabase } from '../scripts/lib/testdb.mjs';
import { appPool } from '../scripts/lib/db.mjs';
import { createApi, httpTransport, newRequestId } from '../shared/api.mjs';
import { PERSONA_KEYS } from '../shared/personas.mjs';

let app; let sql;

// Resets the test database, then starts the server with `env` added to its environment (test-only settings).
export async function startTestApp({ env = {} } = {}) {
  await resetTestDatabase();
  Object.assign(process.env, env);
  const { startServer } = await import('../server/server.mjs');
  app = await startServer({ port: 0, build: false, log: () => {} });
  return app;
}

export async function stopTestApp() {
  await sql?.end();
  await app?.close();
}

// A persona's API, through a new demo session: what a reload in another tab, or a second person, sees.
export async function fresh(key) {
  const r = await fetch(`${app.url}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona: key }) });
  if (!r.ok) throw new Error(`no demo session for ${key}: HTTP ${r.status}`);
  const s = await r.json();
  const api = createApi(httpTransport({ base: app.url, getToken: () => s.access_token }));
  return Object.assign(api, { userId: s.user_id, token: s.access_token });
}

export async function signInAll() {
  const out = {};
  for (const key of PERSONA_KEYS) out[key] = await fresh(key);
  return out;
}

// No session at all, or a token the server did not issue.
export function anonymous(token = null) {
  return createApi(httpTransport({ base: app.url, getToken: () => token }));
}

// One statement as the app's database role with a persona's identity, the way the server runs a request, rolled back
// afterwards: for what the database itself refuses, whatever a client sends. Answers { rows, rowCount } or { error }.
export async function sqlAs(userId, text, params = []) {
  sql ??= appPool({ max: 2 });
  const db = await sql.connect();
  try {
    await db.query('begin');
    await db.query(`select set_config('app.user_id', $1, true)`, [userId]);
    const r = await db.query(text, params);
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (error) {
    return { error };
  } finally {
    await db.query('rollback').catch(() => {});
    db.release();
  }
}

export async function rejects(promise, kind, messagePart) {
  try {
    await promise;
  } catch (e) {
    if (kind && e.kind !== kind) throw new Error(`expected a ${kind} error, got ${e.kind}: ${e.message} (${e.code ?? ''} ${e.detail ?? ''})`);
    if (messagePart && !`${e.message} ${e.code} ${e.detail}`.includes(messagePart)) throw new Error(`expected "${messagePart}" in: ${e.message}`);
    return e;
  }
  throw new Error(`expected a ${kind ?? ''} error, but it succeeded`);
}

export { newRequestId };
