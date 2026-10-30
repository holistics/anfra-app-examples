#!/usr/bin/env node
// One-command local setup (npm run setup), safe to run again at any time:
//   1. adds the missing settings to the git-ignored .env.local (see config/environment.example), with generated passwords; existing
//      lines are never changed, and nothing secret is printed;
//   2. starts PostgreSQL (docker compose, compose.yaml) and waits until it accepts connections;
//   3. migrates the demo database and the separate test database (scripts/migrate.mjs; records are never touched);
//   4. seeds the demo database only if it has no projects yet (scripts/seed_demo.mjs --if-empty);
//   5. writes Anfra's data source for the demo database (scripts/configure_anfra.mjs).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, ENV_FILE, readEnvFile } from './lib/env.mjs';

const secret = () => crypto.randomBytes(24).toString('base64url');
const DEFAULTS = {
  KK_DB_HOST: '127.0.0.1', KK_DB_PORT: '54339', KK_DB_NAME: 'kumquat_demo', KK_DB_DEMO_NAME: 'kumquat_demo', KK_DB_TEST_NAME: 'kumquat_test',
  KK_DB_OWNER: 'kumquat', KK_DB_OWNER_PASSWORD: secret, KK_APP_DB_PASSWORD: secret, ANFRA_DB_PASSWORD: secret, KK_SESSION_SECRET: secret,
};

function step(title, command, args, env = {}) {
  console.log(`\n▸ ${title}`);
  const r = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`setup stopped: ${title} failed`); process.exit(r.status ?? 1); }
}

// 1. Settings
const present = readEnvFile(ENV_FILE);
const added = Object.entries(DEFAULTS).filter(([k]) => !present[k]).map(([k, v]) => `${k}=${typeof v === 'function' ? v() : v}`);
if (added.length) {
  const before = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  fs.writeFileSync(ENV_FILE, `${before}${before && !before.endsWith('\n') ? '\n' : ''}# Added by npm run setup (local PostgreSQL)\n${added.join('\n')}\n`, { mode: 0o600 });
  console.log(`▸ .env.local: added ${added.map((l) => l.split('=')[0]).join(', ')}`);
} else console.log('▸ .env.local: every setting is there');
fs.chmodSync(ENV_FILE, 0o600);
const env = readEnvFile(ENV_FILE);

// 2. PostgreSQL
step('PostgreSQL (docker compose up --wait)', 'docker', ['compose', '--env-file', '.env.local', 'up', '--detach', '--wait', 'postgres']);
// 3. Migrations: the demo database, then the test database (the browser and API tests reset only that one).
step(`migrate ${env.KK_DB_DEMO_NAME}`, 'node', ['scripts/migrate.mjs'], { KK_DB_NAME: env.KK_DB_DEMO_NAME });
step(`migrate ${env.KK_DB_TEST_NAME}`, 'node', ['scripts/migrate.mjs'], { KK_DB_NAME: env.KK_DB_TEST_NAME });
// 4. Synthetic demo data, once.
step(`seed ${env.KK_DB_DEMO_NAME} if empty`, 'node', ['scripts/seed_demo.mjs', '--if-empty'], { KK_DB_NAME: env.KK_DB_DEMO_NAME });
// 5. Anfra
step('Anfra data source', 'node', ['scripts/configure_anfra.mjs'], { KK_DB_NAME: env.KK_DB_DEMO_NAME });
console.log('\nReady. Start the app with: npm start   (then open http://127.0.0.1:8787 and choose a demo persona)');
