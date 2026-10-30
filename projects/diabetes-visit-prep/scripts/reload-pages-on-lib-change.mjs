// `anfra serve` live-reloads a Data App when its own .html changes, not when a shared file in apps/_lib/ does.
// This touches every page when apps/_lib/ changes (modification time only, no content), so the open page reloads.
// Run it next to `anfra serve`: npm run watch-lib
import { readdirSync, utimesSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appsDir = fileURLToPath(new URL('../apps/', import.meta.url));
// An editor save can fire several events; one touch per burst is enough.
const DEBOUNCE_MS = 150;

let pending;
watch(`${appsDir}_lib`, () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const now = new Date();
    const pages = readdirSync(appsDir).filter((name) => name.endsWith('.html'));
    for (const page of pages) utimesSync(`${appsDir}${page}`, now, now);
    console.log(`apps/_lib changed: touched ${pages.join(', ')}`);
  }, DEBOUNCE_MS);
});
console.log('watching apps/_lib/ (Ctrl+C to stop)');
