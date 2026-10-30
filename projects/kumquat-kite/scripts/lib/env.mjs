// Loads the git-ignored .env.local without printing it. A value already in the process environment wins, so a
// command can point at another database (the tests use KK_DB_NAME=kumquat_test). Values never leave this process.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = path.join(ROOT, '.env.local');

export function readEnvFile(file = ENV_FILE) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function loadEnv(file = ENV_FILE) {
  // In the container image (see Dockerfile) there is no .env.local: every setting comes from the environment, and the
  // secrets from the platform's secret store. Only an explicit KK_CONFIG_FROM_ENV=1 allows that, never a missing file.
  if (!fs.existsSync(file) && process.env.KK_CONFIG_FROM_ENV === '1') return process.env;
  if (!fs.existsSync(file)) throw new Error(`missing ${file}: run npm run setup (see README "Set it up")`);
  for (const [k, v] of Object.entries(readEnvFile(file))) if (process.env[k] === undefined) process.env[k] = v;
  return process.env;
}

export function required(env, ...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}: run npm run setup, or set them in the environment`);
}
