// copy of the semantic layer whose data source is that database. The API tests, the browser tests' server and their
// resets run only here: anything but a database on this machine whose name ends in _test is refused before a
// connection is made, so a test can never change the demo database, a shared one or a hosted one.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, loadEnv } from './env.mjs';
import { assertTestDatabase, dbSettings } from './db.mjs';
import { prepareAnfraRepo } from './anfra.mjs';

export const TEST_ANFRA_REPO = path.join(ROOT, 'test-results', 'anfra-test');

// Points this process, and every process it starts, at the test database and the test copy of the semantic layer.
export function useTestEnvironment() {
  const env = loadEnv();
  process.env.KK_DB_NAME = env.KK_DB_TEST_NAME || 'kumquat_test';
  process.env.KK_ANFRA_REPO = TEST_ANFRA_REPO;
  return assertTestDatabase(dbSettings());
}

// Brings the test database up to date and reloads the starting demo data, so every run starts from the same state.
export async function resetTestDatabase({ log = () => {} } = {}) {
  const settings = useTestEnvironment();
  const { migrate } = await import('../migrate.mjs');
  await migrate({ log });
  assertTestDatabase(dbSettings()); // checked again right before the reset, with the settings the seed will read
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed_demo.mjs'), '--reset', '--yes'],
    { stdio: log === console.log ? 'inherit' : 'ignore', env: process.env });
  prepareAnfraRepo(TEST_ANFRA_REPO);
  return settings;
}
