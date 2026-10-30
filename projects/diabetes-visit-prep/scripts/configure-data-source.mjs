// DuckDB needs an absolute path, so .anfra/data_sources.yml is per machine and git-ignored.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const dataSourcesFile = `${repoRoot}/.anfra/data_sources.yml`;

if (existsSync(dataSourcesFile)) {
  console.log(`kept existing ${dataSourcesFile}`);
} else {
  const example = readFileSync(`${repoRoot}/.anfra/data_sources.yml.example`, 'utf8');
  writeFileSync(dataSourcesFile, example.replace('<absolute path to this repo>', repoRoot), { mode: 0o600 });
  console.log(`wrote ${dataSourcesFile}`);
}
