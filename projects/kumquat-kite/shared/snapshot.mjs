// Turns a snapshot folder's files into the arguments of the import_snapshot database function. Used by the
// import command (Node) and the Import screen (browser), so both send exactly the same rows.
import { parseCsv } from './csv.mjs';

export const SNAPSHOT_FILES = ['clients.csv', 'projects.csv', 'work_items.csv', 'cost_lines.csv', 'activities.csv'];
const ENTITY_KEY = { 'clients.csv': 'clients', 'projects.csv': 'projects', 'work_items.csv': 'work_items',
  'cost_lines.csv': 'cost_lines', 'activities.csv': 'activities' };

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// files: { 'mapping.json': text, 'clients.csv': text, ... }; personaIds: { bd: uuid, account: uuid, ... }.
export async function buildImport(files, personaIds) {
  if (!files['mapping.json']) throw new Error('mapping.json is missing');
  const mapping = JSON.parse(files['mapping.json']);
  for (const k of ['source_system', 'source_as_of', 'snapshot_label']) {
    if (!mapping[k]) throw new Error(`mapping.json has no ${k}`);
  }
  const rows = {};
  const present = SNAPSHOT_FILES.filter((f) => files[f] !== undefined);
  for (const f of present) rows[ENTITY_KEY[f]] = parseCsv(files[f]);
  // The payload hash covers every file byte for byte, so a batch names exactly what it read.
  const payload = ['mapping.json', ...present].map((f) => `--- ${f}\n${files[f]}`).join('\n');
  const ownerRoles = {};
  for (const [sourceRole, personaKey] of Object.entries(mapping.owner_roles ?? {})) {
    if (personaIds[personaKey]) ownerRoles[sourceRole] = personaIds[personaKey];
  }
  const meta = {
    source_system: mapping.source_system,
    snapshot_label: mapping.snapshot_label,
    source_as_of: mapping.source_as_of,
    payload_sha256: await sha256Hex(payload),
    mapping: {
      stage_dictionary: mapping.stage_dictionary ?? {},
      work_status_dictionary: mapping.work_status_dictionary ?? {},
      owner_roles: ownerRoles,
      owner_role_personas: mapping.owner_roles ?? {},
      default_service_code: mapping.default_service_code,
      default_done_when: mapping.default_done_when,
      default_work_done_when: mapping.default_work_done_when,
    },
  };
  return { meta, rows, files: present };
}
