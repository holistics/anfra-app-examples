#!/usr/bin/env node
// Imports a synthetic source snapshot as the Admin demo persona, through the same database function the Import
// screen calls, as the app's own role (kk_app). Without --commit it is a preview: counts and row outcomes, no business
// records written.
//   node scripts/import_snapshot.mjs <snapshot-dir> [--commit] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { appPool } from './lib/db.mjs';
import { buildImport, SNAPSHOT_FILES } from '../shared/snapshot.mjs';
import { PERSONA_IDS } from '../shared/personas.mjs';

export async function runImport(dir, { commit = false, pool } = {}) {
  const files = {};
  for (const f of ['mapping.json', ...SNAPSHOT_FILES]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) files[f] = fs.readFileSync(p, 'utf8');
  }
  const { meta, rows } = await buildImport(files, PERSONA_IDS);
  const source = pool ?? appPool({ max: 1 });
  const db = await source.connect();
  try {
    await db.query('begin');
    await db.query(`select set_config('app.user_id', $1, true)`, [PERSONA_IDS.admin]);
    const { rows: [r] } = await db.query('select public.import_snapshot($1::jsonb, $2::jsonb, $3) as result', [JSON.stringify(meta), JSON.stringify(rows), commit]);
    await db.query('commit');
    return r.result;
  } catch (e) {
    await db.query('rollback').catch(() => {});
    throw new Error(`import_snapshot: ${e.message}${e.detail ? ` (${e.detail})` : ''}`);
  } finally {
    db.release();
    if (!pool) await source.end();
  }
}

export function summarize(result) {
  const lines = [`${result.batch_ref} ${result.run_kind}: totals ${JSON.stringify(result.totals)}`];
  for (const [entity, c] of Object.entries(result.counts)) {
    lines.push(`  ${entity.padEnd(10)} read ${c.read ?? 0}, new ${c.new ?? 0}, updated ${c.updated ?? 0}, unchanged ${c.unchanged ?? 0}, unresolved ${c.unresolved ?? 0}`);
  }
  for (const r of result.rows.filter((x) => x.outcome === 'unresolved' || x.message)) {
    lines.push(`  ${r.outcome.padEnd(10)} ${r.entity}/${r.source_key}: ${r.message ?? ''}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir || args.includes('--help')) {
    console.log('Usage: node scripts/import_snapshot.mjs <snapshot-dir> [--commit] [--json]');
    process.exit(dir ? 0 : 2);
  }
  const result = await runImport(dir, { commit: args.includes('--commit') });
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : summarize(result));
}
