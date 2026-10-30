#!/usr/bin/env node
// Proves the limits of Anfra's SELECT-only role `anfra_reader` on the configured database (the reporting migration
// creates it; scripts/migrate.mjs gives it its login and the password ANFRA_DB_PASSWORD): it reads every column of every
// reporting view, and it is refused on the operational tables, the people, the migration history and any write. Prints
// results only, never the password, and exits non-zero when any proof fails.
//   node scripts/check_anfra_role.mjs        (npm run check:reader)
import { ownerClient, roleClient, dbSettings, describeDb } from './lib/db.mjs';
import { loadEnv, required } from './lib/env.mjs';

const env = loadEnv();
required(env, 'ANFRA_DB_PASSWORD');
console.log(`database: ${describeDb(dbSettings())}`);
const owner = await ownerClient();
const { rows } = await owner.query(`select rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls,
  (select array_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where has_table_privilege('anfra_reader', c.oid, 'SELECT') and n.nspname not in ('pg_catalog', 'information_schema')) as selectable
  from pg_roles where rolname = 'anfra_reader'`);
console.log('anfra_reader:', rows[0]);
const views = (await owner.query(`select viewname from pg_views where schemaname = 'reporting' order by 1`)).rows.map((r) => r.viewname);
await owner.end();

const reader = await roleClient('anfra_reader', env.ANFRA_DB_PASSWORD);
// Anfra may select any column, so every column of every view must be readable: a column that calls a function the
// role may not run, or reads a security-invoker view, fails here rather than in a panel.
const checks = [
  ...views.map((v) => [`read every column of reporting.${v}`, `select * from reporting.${v}`, true]),
  ['read an operational table', 'select count(*) from public.projects', false],
  ['read the people (public.profiles)', 'select count(*) from public.profiles', false],
  ['read the migration history', 'select count(*) from app.schema_migrations', false],
  ['write anything', 'create table reporting.should_not_exist (x int)', false],
];
let failures = 0;
for (const [label, sql, allowed] of checks) {
  let ok, detail;
  try { const r = await reader.query(sql); ok = true; detail = `${r.rowCount} rows`; }
  catch (e) { ok = false; detail = e.message; }
  if (ok !== allowed) failures++;
  console.log(`${ok === allowed ? 'PASS' : 'FAIL'}  ${label}: ${ok ? 'allowed' : 'denied'} (${detail})${allowed ? '' : ', as required'}`);
}
const s = await reader.query("select current_user, current_setting('default_transaction_read_only') as read_only, current_setting('statement_timeout') as timeout");
console.log('session:', s.rows[0]);
await reader.end();
if (failures) { console.error(`${failures} proof(s) failed`); process.exit(1); }
