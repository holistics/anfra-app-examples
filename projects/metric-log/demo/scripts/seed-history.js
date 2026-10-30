#!/usr/bin/env node
// Seeds the demo's decision history from history.json through the same save path as a typed entry,
// so every number is Anfra's. Re-running replaces seeded entries and leaves typed ones alone.
// Needs `anfra serve` for the demo running at the config's anfra.url. `--store <dir>` writes somewhere else (for a dry run).
const path = require('path');
const { loadConfig } = require('../../src/config');
const store = require('../../src/store');
const flow = require('../../src/flow');
const { person } = require('../../src/config');

async function main() {
  const cfg = loadConfig(path.join(__dirname, '../../anfra-metric-log.yml'));
  const si = process.argv.indexOf('--store');
  if (si > 0) cfg.storePath = path.resolve(process.argv[si + 1]);
  const stories = require('./history.json');
  for (const id of new Set(stories.map((s) => s.metric))) store.removeTimeline(cfg, id, (e) => e.seeded);
  const saved = {};
  for (const s of stories) {
    const by = person(cfg, s.by);
    if (!by) throw new Error(`unknown person ${s.by} in story ${s.key}`);
    const e = await flow.addHistoryEntry(cfg, by, s.metric, { ...s, follows: s.follows && saved[s.follows] }, { seeded: true });
    saved[s.key] = `${s.metric}#${e.id}`;
    const pct = e.valuePrev ? ((e.value - e.valuePrev) / Math.abs(e.valuePrev)) * 100 : null;
    console.log(`${e.date}${e.end ? '→' + e.end : ''}  ${s.metric.padEnd(18)} ${e.type.padEnd(8)} ${String(e.value).slice(0, 8).padStart(8)}  ${pct === null ? '   n/a' : (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%'}  ${e.headline}`);
  }
  console.log(`${stories.length} stories saved`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
