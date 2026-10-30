import { execFileSync } from 'node:child_process';

// Runs AQL through the anfra CLI against the ingested `diabetes` dataset. `anfra query` prints YAML; result.records
// is a list of rows, each a list of scalars in result.fields order.
export function queryRows (aql) {
  const output = execFileSync('anfra', ['query', '-d', 'diabetes', aql], { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname });
  const [, resultBlock] = output.split(/^result:\n/m);
  const fields = [...resultBlock.split(/^ {4}records:/m)[0].matchAll(/^ {8}- (\S+)$/gm)].map(([, field]) => field);
  const values = [...resultBlock.split(/^ {4}records:/m)[1].split(/^\S/m)[0].matchAll(/^ {8}(?:- | {2})- (.*)$/gm)].map(([, value]) => value);
  const parse = (value) => value === 'null' ? null : value.replace(/^"(.*)"$/, '$1');
  return Array.from({ length: values.length / fields.length }, (_, row) =>
    Object.fromEntries(fields.map((field, column) => [field, parse(values[row * fields.length + column])])));
}
