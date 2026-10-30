// Connections to the app's PostgreSQL database: the Docker Compose service on this machine by default (compose.yaml),
// or any PostgreSQL 17 named by KK_DB_HOST, KK_DB_PORT, KK_DB_NAME and KK_DB_SSL. On the prototype platform the chart's
// database injects DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD (its owner), which
// are read when the KK_DB_* setting is not given (deploy/README.md).
//   ownerClient()  the database owner (KK_DB_OWNER): migrations, the seed, the command-line demo reset, backups
//   appPool()      the app server's role kk_app, which owns nothing: row-level security and the triggers apply to it
//   readerPool()   Anfra's SELECT-only role anfra_reader (the server reads the committed data version with it)
//   roleClient()   one login role, for the checks of what it may read
// Commands that reset data run only against a local database whose name ends in _test (assertTestDatabase), apart
// from the explicit demo reset.
import pg from 'pg';
import { loadEnv, required } from './env.mjs';

export function dbSettings(env = loadEnv()) {
  const ssl = (env.KK_DB_SSL ?? '').toLowerCase();
  return {
    host: env.KK_DB_HOST || env.DATABASE_HOST || '127.0.0.1',
    port: Number(env.KK_DB_PORT || env.DATABASE_PORT || 54329),
    database: env.KK_DB_NAME || env.DATABASE_NAME || 'kumquat_demo',
    owner: env.KK_DB_OWNER || env.DATABASE_USER || 'kumquat',
    // require: encrypted; verify-full: encrypted and the server certificate checked against the system's roots.
    ssl: ssl === 'verify-full' ? { rejectUnauthorized: true } : ['require', 'on', '1', 'true'].includes(ssl) ? { rejectUnauthorized: false } : false,
  };
}

export const describeDb = (s) => `${s.database} on ${s.host}:${s.port}`;
export const isLocalHost = (host) => ['127.0.0.1', 'localhost', '::1'].includes(host);

// A database that is still starting refuses the first connections; retry a few times (not a wrong password or a
// missing database, which retrying cannot fix).
async function connectWithRetry(makeClient, attempts = 8) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const client = makeClient();
    try { await client.connect(); return client; } catch (e) {
      last = e;
      await client.end().catch(() => {});
      if (i === attempts || ['28P01', '3D000', '28000'].includes(e.code)) break;
      await new Promise((r) => setTimeout(r, 750 * i));
    }
  }
  throw last;
}

// The owner's password: KK_DB_OWNER_PASSWORD, or the platform database's DATABASE_PASSWORD.
export const ownerPassword = (env = loadEnv()) => env.KK_DB_OWNER_PASSWORD || env.DATABASE_PASSWORD || null;

export async function ownerClient({ database } = {}) {
  const env = loadEnv();
  if (!ownerPassword(env)) required(env, 'KK_DB_OWNER_PASSWORD');
  const s = dbSettings(env);
  return connectWithRetry(() => new pg.Client({ host: s.host, port: s.port, database: database ?? s.database, user: s.owner,
    password: ownerPassword(env), ssl: s.ssl, connectionTimeoutMillis: 10000 }));
}

export function appPool({ max = 10 } = {}) {
  const env = loadEnv();
  required(env, 'KK_APP_DB_PASSWORD');
  const s = dbSettings(env);
  const pool = new pg.Pool({ host: s.host, port: s.port, database: s.database, user: 'kk_app', password: env.KK_APP_DB_PASSWORD,
    ssl: s.ssl, max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, application_name: 'kumquat-kite-app' });
  pool.on('error', () => { /* a dropped idle connection is replaced on the next request */ });
  return pool;
}

export function readerPool({ max = 3 } = {}) {
  const env = loadEnv();
  if (!env.ANFRA_DB_PASSWORD) return null;
  const s = dbSettings(env);
  const pool = new pg.Pool({ host: s.host, port: s.port, database: s.database, user: 'anfra_reader', password: env.ANFRA_DB_PASSWORD,
    ssl: s.ssl, max, idleTimeoutMillis: 60000, connectionTimeoutMillis: 10000, application_name: 'kumquat-kite-reader' });
  pool.on('error', () => {});
  return pool;
}

// One login role (anfra_reader, holistics_reader) on the configured database: to prove what it may and may not read.
export async function roleClient(user, password) {
  const s = dbSettings();
  return connectWithRetry(() => new pg.Client({ host: s.host, port: s.port, database: s.database, user, password, ssl: s.ssl,
    connectionTimeoutMillis: 10000, application_name: 'kumquat-kite-check' }));
}

// The tests and the test server reset their database: only a database on this machine whose name ends in _test.
export function assertTestDatabase(s = dbSettings()) {
  if (!isLocalHost(s.host) || !/_test$/.test(s.database)) {
    throw new Error(`refusing to reset ${describeDb(s)}: tests run only against a local database whose name ends in _test (KK_DB_NAME=kumquat_test)`);
  }
  return s;
}
