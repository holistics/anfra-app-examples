#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/config');
const { check } = require('../src/check');

const args = process.argv.slice(2);
const cmd = args[0];
const ci = args.indexOf('--config');
const cfgFile = ci >= 0 ? args[ci + 1] : 'anfra-metric-log.yml';

function usage() {
  console.log('usage: anfra-metric-log <check|serve> [--config anfra-metric-log.yml]');
  process.exit(cmd ? 1 : 0);
}

// The shipped data_sources.yml.example holds __REPO__; DuckDB needs an absolute path.
function ensureDataSources(cfg) {
  const dst = path.join(cfg.repoPath, '.anfra', 'data_sources.yml');
  const ex = dst + '.example';
  if (!fs.existsSync(dst) && fs.existsSync(ex)) fs.writeFileSync(dst, fs.readFileSync(ex, 'utf8').replaceAll('__REPO__', cfg.repoPath));
}

async function main() {
  if (cmd !== 'check' && cmd !== 'serve') return usage();
  if (!fs.existsSync(cfgFile)) { console.error(`config not found: ${cfgFile}`); process.exit(1); }
  const cfg = loadConfig(cfgFile);
  ensureDataSources(cfg);
  const { errors, metrics } = check(cfg);
  if (errors.length) { console.error('check failed:\n' + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
  console.log(`check ok: ${cfg.people.length} people, ${metrics} metrics, git repo found`);
  if (cmd === 'check') return;
  const { createServer, ensureAnfra } = require('../src/server');
  const child = await ensureAnfra(cfg);
  const [host, port] = (cfg.listen || '127.0.0.1:7900').split(':');
  createServer(cfg).listen(Number(port), host, () => console.log(`anfra-metric-log on http://${host}:${port} (anfra at ${cfg.anfra.url})`));
  const stop = () => { if (child) child.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
