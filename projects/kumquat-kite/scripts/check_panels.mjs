#!/usr/bin/env node
// Runs every query of every Anfra panel (anfra/apps/**/*.html) through the core API with the same Query Input the panel's
// controls send, and checks each one succeeds. "Execute every application query" — before a reader opens the app.
//   node scripts/check_panels.mjs [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { startAnfra } from './lib/anfra.mjs';
import { ROOT } from './lib/env.mjs';

const verbose = process.argv.includes('--verbose');
// The inputs each panel's controls produce (scope from the host context, default period, a cross-filter selection).
const PERIOD = { field: 'projects.contract_signed_date', operator: 'between', values: ['2026-07-01', '2026-10-31'] };
const CLIENT = { field: 'clients.display_name', operator: 'is', values: ['Calm Nut Milk (sample)'] };
const MONEY_REPORT = [{ label: 'period Jul–Oct 2026', input: { filters: [PERIOD] } }, { label: 'period + client', input: { filters: [PERIOD, CLIENT] } }];
const INPUTS = {
  'job360_money.html': [{ label: 'project NP-0001', input: { filters: [{ field: 'projects.project_ref', operator: 'is', values: ['NP-0001'] }] } },
                        { label: 'project NP-0007 (incomplete cost)', input: { filters: [{ field: 'projects.project_ref', operator: 'is', values: ['NP-0007'] }] } }],
  'reports/overview.html': MONEY_REPORT,
  'reports/monthly.html': MONEY_REPORT,
  'reports/ranking.html': [...MONEY_REPORT, { label: 'period + client + selection', input: { filters: [PERIOD, CLIENT], conditions: [{ expr: "projects.project_ref == 'NP-0009'" }] } }],
  'reports/pipeline.html': [{ label: 'all clients', input: {} }, { label: 'one client', input: { filters: [{ field: 'clients.display_name', operator: 'is', values: ['Starfish Sunscreen (sample)'] }] } }],
  'reports/cash.html': MONEY_REPORT,
  'reports/quality.html': MONEY_REPORT,
};

const dir = path.join(ROOT, 'anfra', 'apps');
const anfra = await startAnfra();
let failed = 0; let ran = 0;
try {
  const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.html')).sort();
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const queries = [...html.matchAll(/createQuery\('([^']+)',\s*\{[^`]*?(?:pageSize:\s*(\d+),\s*)?aql:\s*`([\s\S]*?)`\s*\}\)/g)].map((m) => ({ name: m[1], pageSize: m[2], aql: m[3] }));
    for (const { label, input } of INPUTS[file] ?? [{ label: 'no input', input: {} }]) {
      for (const q of queries) {
        ran++;
        try {
          const res = await anfra.call('core.query', { dataset: 'kumquat_finance', query: q.aql, lang: 'aql', timezone: 'Asia/Ho_Chi_Minh', input,
            ...(q.pageSize ? { page: 1, page_size: Number(q.pageSize) } : {}) });
          const n = res.result.records.length;
          console.log(`ok    ${file} · ${q.name} · ${label}: ${n} rows`);
          if (verbose && n) console.log('      first row', JSON.stringify(Object.fromEntries(res.result.fields.map((f, i) => [f, res.result.records[0][i]]))));
        } catch (e) {
          failed++;
          console.log(`FAIL  ${file} · ${q.name} · ${label}: ${e.message}`);
          if (e.body) console.log('     ', JSON.stringify(e.body).slice(0, 800));
        }
      }
    }
  }
} finally { await anfra.stop(); }
console.log(`${ran - failed} of ${ran} panel queries succeeded`);
process.exit(failed ? 1 : 0);
