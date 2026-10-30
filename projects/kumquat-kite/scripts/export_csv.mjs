// Exports the reporting views that Anfra reads to CSV, through the same read-only anfra_reader login Anfra uses,
// so the export cannot change anything and holds exactly what the governed analytics see: money facts by basis
// (approved, scenario, committed versions, recorded acceptance and receipts), the audit trail, projects, clients,
// services, people and work items. Values are exported as PostgreSQL text, so amounts keep their exact precision.
// Writes exports/<timestamp>/<view>.csv (owner-only, git-ignored), UTF-8 with a byte-order mark for spreadsheets;
// an interrupted run leaves exports/.incomplete-<timestamp>/ instead.
//   node scripts/export_csv.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, required, ROOT } from './lib/env.mjs';
import { roleClient } from './lib/db.mjs';
import { formatCsv } from '../shared/csv.mjs';

// Each view with the order its rows are written in (stable business keys, so two exports compare line by line).
const VIEWS = {
  money_facts: 'fact_key', money_versions: 'project_id, version_no, line_ref', money_audit: 'audit_key',
  projects: 'project_ref', clients: 'client_ref', services: 'code', people: 'display_name, user_id', work_items: 'work_ref',
};
const env = loadEnv();
required(env, 'ANFRA_DB_PASSWORD');
const d = new Date(), two = (n) => String(n).padStart(2, '0'); // local time, like backups/<timestamp>
const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
const dir = path.join(ROOT, 'exports', stamp);
const work = path.join(ROOT, 'exports', `.incomplete-${stamp}`); // renamed to exports/<timestamp> once every view is written
fs.mkdirSync(work, { recursive: true, mode: 0o700 });
const BOM = String.fromCharCode(0xfeff);

const db = await roleClient('anfra_reader', env.ANFRA_DB_PASSWORD);
try {
  for (const [view, order] of Object.entries(VIEWS)) {
    const res = await db.query({ text: `select * from reporting.${view} order by ${order}`, rowMode: 'array',
      types: { getTypeParser: () => (v) => v } }); // keep every value as PostgreSQL wrote it
    fs.writeFileSync(path.join(work, `${view}.csv`), BOM + formatCsv(res.fields.map((f) => f.name), res.rows), { mode: 0o600 });
    console.log(`  ${view}.csv  ${res.rows.length} rows`);
  }
} finally { await db.end(); }
fs.renameSync(work, dir);
console.log(`exported ${Object.keys(VIEWS).length} reporting views to ${path.relative(ROOT, dir)}/`);
