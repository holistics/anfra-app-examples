// Builds the browser app into web/dist. The bundle holds no secret: the publishable key and project URL are fetched
// at runtime from /config.json.
//   app.js (+ chunks/)  esbuild: the plain-JavaScript app, with the React islands (web/src/ui, shadcn/ui components)
//                       split into chunks that load only when a screen mounts one
//   ui.css              Tailwind CSS v4: the utilities those components use, mapped to the shared tokens
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { ROOT } from '../scripts/lib/env.mjs';

const DIST = path.join(ROOT, 'web', 'dist');

// Values from .env.local that must never reach the browser: every password, secret, token and key in it (database
// host, port and names are plain settings and are not checked).
const SECRET = /PASSWORD|SECRET|TOKEN|_KEY(_ID)?$/;
function secretValues() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.match(/^([A-Z0-9_]+)=(.+)$/)).filter(Boolean)
    .filter(([, k, v]) => SECRET.test(k) && !/PUBLISHABLE/.test(k) && v.length >= 8).map(([, k, v]) => [k, v]);
}
// Refuses a bundle that contains a secret value: the output files are deleted and the build fails (names only).
export function assertNoSecrets(files) {
  const secrets = secretValues();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const leaked = secrets.filter(([, v]) => text.includes(v)).map(([k]) => k);
    if (leaked.length) {
      for (const g of files) fs.rmSync(g, { force: true });
      throw new Error(`${path.relative(ROOT, f)} contained the value of ${leaked.join(', ')}; the bundle was deleted`);
    }
  }
}

const options = {
  entryPoints: { app: path.join(ROOT, 'web', 'src', 'main.js') },
  outdir: DIST, entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  bundle: true, splitting: true, format: 'esm', target: 'es2022', sourcemap: true, minify: true, metafile: true,
  jsx: 'automatic', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
};

function buildCss() {
  const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss');
  execFileSync(bin, ['-i', path.join(ROOT, 'web', 'src', 'ui', 'ui.css'), '-o', path.join(DIST, 'ui.css'), '--minify'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

export async function buildWeb({ watch = false } = {}) {
  if (watch) { buildCss(); const ctx = await esbuild.context({ ...options, metafile: false }); await ctx.watch(); return ctx; }
  fs.rmSync(path.join(DIST, 'chunks'), { recursive: true, force: true });
  const result = await esbuild.build(options);
  buildCss();
  const outputs = [...Object.keys(result.metafile.outputs).map((f) => path.resolve(ROOT, f)), path.join(DIST, 'ui.css')];
  assertNoSecrets(outputs);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildWeb();
  const sizes = Object.entries(result.metafile.outputs).filter(([f]) => !f.endsWith('.map'))
    .map(([f, o]) => `${path.relative(DIST, path.resolve(ROOT, f))} ${(o.bytes / 1024).toFixed(0)} KiB`);
  console.log(`built web/dist: ${sizes.join(', ')}, ui.css ${(fs.statSync(path.join(DIST, 'ui.css')).size / 1024).toFixed(0)} KiB`);
}
