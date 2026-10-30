#!/usr/bin/env node
// Brings a PostgreSQL database up to date with db/migrations: each file once, in name order, in its own transaction,
// recorded in app.schema_migrations with its checksum. Running it again changes nothing and never touches a record;
// a file edited after it ran is refused (add a new migration instead). On a database server on this machine it first
// creates the database when it is missing. Then it gives the two login roles their passwords from the environment
// (KK_APP_DB_PASSWORD for kk_app, ANFRA_DB_PASSWORD for anfra_reader), so no secret is stored in a migration.
//   node scripts/migrate.mjs            the database named by KK_DB_NAME (default kumquat_demo)
//   node scripts/migrate.mjs --status   list what has run
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, loadEnv } from './lib/env.mjs';
import { ownerClient, dbSettings, describeDb, isLocalHost } from './lib/db.mjs';

const DIR = path.join(ROOT, 'db', 'migrations');

async function ensureDatabase(settings, log) {
  if (!isLocalHost(settings.host) && process.env.KK_DB_CREATE !== '1') return; // a hosted database is created by its owner
  const admin = await ownerClient({ database: 'postgres' });
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [settings.database]);
    if (!rowCount) { await admin.query(`create database ${admin.escapeIdentifier(settings.database)}`); log(`created database ${settings.database}`); }
  } finally { await admin.end(); }
}

export async function migrate({ log = console.log } = {}) {
  const env = loadEnv();
  const settings = dbSettings(env);
  await ensureDatabase(settings, log);
  const db = await ownerClient();
  try {
    // One migrator at a time (two containers starting together): the second waits, then finds nothing left to apply.
    await db.query(`select pg_advisory_lock(hashtext('kumquat-kite-migrate'))`);
    await db.query(`create schema if not exists app;
      create table if not exists app.schema_migrations (filename text primary key, sha256 text not null, applied_at timestamptz not null default now())`);
    const done = new Map((await db.query('select filename, sha256 from app.schema_migrations')).rows.map((r) => [r.filename, r.sha256]));
    let applied = 0;
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      const sha = crypto.createHash('sha256').update(sql).digest('hex');
      if (done.has(file)) {
        if (done.get(file) !== sha) throw new Error(`db/migrations/${file} changed after it was applied to ${describeDb(settings)}: add a new migration instead`);
        continue;
      }
      await db.query('begin');
      try {
        await db.query(sql);
        await db.query('insert into app.schema_migrations (filename, sha256) values ($1, $2)', [file, sha]);
        await db.query('commit');
      } catch (e) { await db.query('rollback'); throw new Error(`${file}: ${e.message}`); }
      applied += 1;
      log(`applied ${file}`);
    }
    // The login roles' passwords, from the environment. Roles belong to the whole server, so every database on it
    // (demo and test) shares them.
    for (const [role, key] of [['kk_app', 'KK_APP_DB_PASSWORD'], ['anfra_reader', 'ANFRA_DB_PASSWORD']]) {
      if (env[key]) await db.query(`alter role ${role} with login password ${db.escapeLiteral(env[key])}`);
      else log(`warning: ${key} is not set, so ${role} cannot log in`);
    }
    // The app's answers carry UTC timestamps (ISO 8601 with +00:00), whatever the server's own time zone; business
    // dates are computed in Asia/Ho_Chi_Minh by the database functions themselves.
    await db.query(`alter role kk_app set timezone to 'UTC'`);
    log(`${describeDb(settings)}: ${applied ? `${applied} migration(s) applied` : 'up to date'} (${done.size + applied} in all)`);
  } finally { await db.end(); }
}

async function status() {
  const db = await ownerClient();
  try {
    const rows = (await db.query('select filename, applied_at from app.schema_migrations order by filename').catch(() => ({ rows: [] }))).rows;
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) console.log(`${rows.find((r) => r.filename === f) ? 'applied' : 'pending'}  ${f}`);
  } finally { await db.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await (process.argv.includes('--status') ? status() : migrate()); }
  catch (e) { console.error(`migrate: ${e.message}`); process.exit(1); }
}
