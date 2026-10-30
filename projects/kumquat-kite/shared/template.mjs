// The single import template: one row per opportunity or project, with its client and its next action — what a small
// team usually keeps in one sheet (Google Sheets, Excel, Lark Sheets, a Notion database or an Obsidian table, exported
// as CSV). buildTemplateImport() checks every row against the rules the database enforces, so a row that needs fixing
// is reported with its fix instead of failing the import, and turns the good rows into the arguments of the governed
// import (import_snapshot): clients, projects and notes, matched on every re-import by the sheet's own IDs — never by
// a name or a row number. Used by the Import & access screen and by the tests.
import { parseCsv, formatCsv } from './csv.mjs';

export const STAGES = {
  lead: 'Lead', qualified: 'Qualified', meeting: 'Meeting', proposal: 'Proposal', negotiation: 'Negotiation',
  contract_sent: 'Contract sent', won: 'Won', lost: 'Lost', on_hold: 'On hold',
};
const CLIENT_TYPES = ['brand', 'agency', 'mcn', 'partner', 'internal'];
const SERVICE_GROUPS = { venue: 'VEN-ROOM', ecommerce: 'ECO-LIVE', production: 'PRD-MEDIA', event: 'EVT-OPS', academy: 'ACA-WS' };
const BASES = ['total', 'monthly', 'range'];

// The columns, in template order, with what the field guide on the screen says about each.
export const TEMPLATE_COLUMNS = [
  { key: 'record_id', required: true, example: 'DEAL-001', help: 'Your own stable ID for this row, e.g. a sheet ID column. Never the row number. Keep it the same when you import again.' },
  { key: 'client_id', required: true, example: 'CL-ACME', help: 'Your own stable ID for the client. Rows with the same client_id are one client.' },
  { key: 'client_name', required: true, example: 'Acme Coffee (sample)', help: 'The client as people know it.' },
  { key: 'client_type', example: 'brand', values: CLIENT_TYPES, help: 'Blank means brand.' },
  { key: 'title', required: true, example: 'Holiday livestream series (sample)', help: 'The opportunity or project.' },
  { key: 'service_group', example: 'ecommerce', values: Object.keys(SERVICE_GROUPS), help: 'What kind of work it is.' },
  { key: 'stage', required: true, example: 'proposal', values: Object.keys(STAGES), help: 'The code or its name (e.g. "Contract sent").' },
  { key: 'owner_email', required: true, example: 'bd.demo@example.com', help: 'Who owns it: the email of a Kumquat Kite user.' },
  { key: 'next_action', example: 'Send the quotation', help: 'What happens next. Needs a due date.' },
  { key: 'next_action_due', example: '2026-10-25', help: 'YYYY-MM-DD or DD/MM/YYYY.' },
  { key: 'done_when', example: 'The client has the quotation', help: 'How everyone knows the next action is done.' },
  { key: 'estimate_basis', example: 'total', values: BASES, help: 'total (one-off), monthly (per month) or range. An estimate is never revenue.' },
  { key: 'estimate_vnd', example: '50000000', help: 'For total or monthly. Whole VND, separators allowed.' },
  { key: 'estimate_low_vnd', example: '', help: 'For range: the low end.' },
  { key: 'estimate_high_vnd', example: '', help: 'For range: the high end.' },
  { key: 'contract_reference', example: '', help: 'Required when the stage is won.' },
  { key: 'contract_signed_date', example: '', help: 'Required when the stage is won.' },
  { key: 'contract_value_vnd', example: '', help: 'Only for won rows: becomes the project\'s imported revenue baseline, net of VAT.' },
  { key: 'lost_reason', example: '', help: 'Required when the stage is lost.' },
  { key: 'note', example: 'Client asked for two options', help: 'A first conversation note, kept in the project history.' },
  { key: 'data_classification', required: true, example: 'synthetic', values: ['synthetic'],
    help: 'This demo database takes synthetic (sample) data only, so every row must say synthetic. A deployment for real data is configured separately.' },
];

const SAMPLE_ROWS = [
  ['DEAL-001', 'CL-ACME', 'Acme Coffee (sample)', 'brand', 'Holiday livestream series (sample)', 'ecommerce', 'proposal', 'bd.demo@example.com',
    'Send the quotation', '2026-10-25', 'The client has the quotation', 'total', '50000000', '', '', '', '', '', '', 'Client asked for two options', 'synthetic'],
  ['DEAL-002', 'CL-ACME', 'Acme Coffee (sample)', 'brand', 'Monthly shop operation (sample)', 'ecommerce', 'meeting', 'account.demo@example.com',
    'Agree the scope', '2026-10-28', 'Scope agreed by email', 'monthly', '15000000', '', '', '', '', '', '', '', 'synthetic'],
  ['DEAL-003', 'CL-RIVER', 'River Tea House (sample)', 'brand', 'Grand opening event (sample)', 'event', 'won', 'bd.demo@example.com',
    'Kick-off meeting', '2026-10-30', 'Kick-off held', '', '', '', '', 'CT-TPL-2610-01', '2026-10-12', '80000000', '', 'Contract signed after the second pitch', 'synthetic'],
];

// The template as a CSV file (UTF-8 with a byte-order mark, so Excel reads it as UTF-8), with three sample rows.
export function templateCsv() {
  return String.fromCharCode(0xfeff) + formatCsv(TEMPLATE_COLUMNS.map((c) => c.key), SAMPLE_ROWS);
}

const clean = (v) => String(v ?? '').trim();
function money(v) {
  const s = clean(v).replace(/[\s,.]/g, '').replace(/vnd$/i, '');
  if (!s) return { value: '' };
  if (!/^\d{1,15}$/.test(s)) return { error: 'must be a whole VND amount (digits, separators allowed)' };
  return { value: String(Number(s)) };
}
function date(v) {
  const s = clean(v);
  if (!s) return { value: '' };
  let y; let m; let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) [y, m, d] = s.split('-').map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) [d, m, y] = s.split('/').map(Number);
  else return { error: 'must be a date as YYYY-MM-DD or DD/MM/YYYY' };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: 'is not a real date' };
  return { value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-crm-sheet';

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// csvText: the filled template; people: [{ user_id, email }]; source: the sheet's name ("Google Sheets — Deals"),
// which must stay the same for re-imports (it is the source system the IDs belong to).
export async function buildTemplateImport(csvText, people, { source = 'My CRM sheet', asOf = new Date().toISOString() } = {}) {
  const issues = [];
  let raw;
  try { raw = parseCsv(csvText); } catch (e) { return { issues: [{ row: null, field: null, message: `The file is not a readable CSV: ${e.message}` }], rows: null }; }
  if (!raw.length) return { issues: [{ row: null, field: null, message: 'The file has a header but no rows.' }], rows: null };
  const header = Object.keys(raw[0]);
  const missingCols = TEMPLATE_COLUMNS.filter((c) => c.required && !header.includes(c.key)).map((c) => c.key);
  if (missingCols.length) return { issues: [{ row: null, field: null, message: `Columns missing: ${missingCols.join(', ')}. Start from the downloaded template.` }], rows: null };

  const users = new Map(people.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p.user_id]));
  const stageByName = new Map(Object.entries(STAGES).flatMap(([code, name]) => [[code, code], [name.toLowerCase(), code], [code.replace(/_/g, ' '), code]]));
  const seen = new Map(); const clientsById = new Map(); const ownerRoles = {};
  const clients = []; const projects = []; const activities = [];

  raw.forEach((r, i) => {
    const row = i + 2; // the sheet row, counting the header as row 1
    const errs = [];
    const bad = (field, message) => errs.push({ row, record_id: clean(r.record_id) || null, field, message });
    for (const c of TEMPLATE_COLUMNS) if (c.required && !clean(r[c.key])) bad(c.key, `${c.key} is required`);
    const id = clean(r.record_id);
    if (id && seen.has(id)) bad('record_id', `record_id ${id} is also used on row ${seen.get(id)}: every row needs its own ID`);
    else if (id) seen.set(id, row);
    const stage = stageByName.get(clean(r.stage).toLowerCase());
    if (clean(r.stage) && !stage) bad('stage', `stage "${clean(r.stage)}" is not one of: ${Object.keys(STAGES).join(', ')}`);
    const email = clean(r.owner_email).toLowerCase();
    if (email && !users.has(email)) bad('owner_email', `${email} is not a Kumquat Kite user (ask an Admin to add them first)`);
    const ctype = clean(r.client_type).toLowerCase() || 'brand';
    if (!CLIENT_TYPES.includes(ctype)) bad('client_type', `client_type must be one of: ${CLIENT_TYPES.join(', ')}`);
    const group = clean(r.service_group).toLowerCase();
    if (group && !SERVICE_GROUPS[group]) bad('service_group', `service_group must be one of: ${Object.keys(SERVICE_GROUPS).join(', ')}`);
    const due = date(r.next_action_due); if (due.error) bad('next_action_due', `next_action_due ${due.error}`);
    const signed = date(r.contract_signed_date); if (signed.error) bad('contract_signed_date', `contract_signed_date ${signed.error}`);
    const est = money(r.estimate_vnd); const low = money(r.estimate_low_vnd); const high = money(r.estimate_high_vnd); const value = money(r.contract_value_vnd);
    for (const [k, m] of [['estimate_vnd', est], ['estimate_low_vnd', low], ['estimate_high_vnd', high], ['contract_value_vnd', value]]) if (m.error) bad(k, `${k} ${m.error}`);
    if (clean(r.next_action) && !due.value && !due.error) bad('next_action_due', 'a next action needs next_action_due');
    const basis = clean(r.estimate_basis).toLowerCase();
    if (basis && !BASES.includes(basis)) bad('estimate_basis', `estimate_basis must be one of: ${BASES.join(', ')}`);
    else if (!basis && (est.value || low.value || high.value)) bad('estimate_basis', 'say whether the estimate is a total, monthly or a range');
    else if ((basis === 'total' || basis === 'monthly') && (!est.value || low.value || high.value)) bad('estimate_vnd', `a ${basis} estimate needs estimate_vnd only`);
    else if (basis === 'range' && (!low.value || !high.value || est.value || Number(low.value) > Number(high.value))) bad('estimate_low_vnd', 'a range needs estimate_low_vnd ≤ estimate_high_vnd, and no estimate_vnd');
    if (stage === 'won' && (!clean(r.contract_reference) || !signed.value)) bad('contract_reference', 'a won row needs contract_reference and contract_signed_date');
    if (stage === 'lost' && !clean(r.lost_reason)) bad('lost_reason', 'a lost row needs lost_reason');
    if (value.value && stage !== 'won') bad('contract_value_vnd', 'contract_value_vnd is only for won rows');
    const klass = clean(r.data_classification).toLowerCase();
    if (klass && klass !== 'synthetic') bad('data_classification', 'this demo database takes synthetic (sample) data only: label the row synthetic, or keep real data out of the demo');
    const cid = clean(r.client_id);
    const known = clientsById.get(cid);
    if (cid && known && (known.display_name !== clean(r.client_name) || known.client_type !== ctype)) {
      bad('client_name', `client ${cid} has another name or type on row ${known.row}: use one name per client_id`);
    }
    if (errs.length) { issues.push(...errs); return; }

    if (!known) {
      const c = { client_id: cid, display_name: clean(r.client_name), client_type: ctype, data_classification: klass };
      clientsById.set(cid, { ...c, row });
      clients.push(c);
    }
    ownerRoles[email] = users.get(email);
    projects.push({
      project_id: id, client_id: cid, title: clean(r.title), job_code: '', commercial_stage: stage, delivery_state: 'not_started',
      owner_role: email, next_action: clean(r.next_action), next_action_due: due.value, done_when: clean(r.done_when), currency: 'VND',
      contract_value_net: value.value, contract_reference: clean(r.contract_reference), contract_signed_date: signed.value,
      service_code: group ? SERVICE_GROUPS[group] : '', service_group: group, brief_status: 'missing', lost_reason: clean(r.lost_reason),
      estimate_basis: basis, estimated_amount: basis === 'range' ? '' : est.value, estimate_low: basis === 'range' ? low.value : '',
      estimate_high: basis === 'range' ? high.value : '', data_classification: klass,
    });
    if (clean(r.note)) activities.push({ activity_id: `${id}:note`, project_id: id, stage, author_role: email, note: clean(r.note), data_classification: klass });
  });

  const sourceSystem = `sheet:${slug(source)}`;
  const meta = {
    source_system: sourceSystem,
    snapshot_label: `Import template: ${clean(source) || 'My CRM sheet'}`,
    source_as_of: asOf,
    payload_sha256: await sha256Hex(csvText),
    mapping: {
      stage_dictionary: {}, work_status_dictionary: {}, owner_roles: ownerRoles, owner_role_personas: {},
      default_service_code: 'ECO-LIVE', default_done_when: 'Update the project and set the next action',
      default_work_done_when: 'Done, with a link to the output',
    },
  };
  return { meta, rows: { clients, projects, activities }, issues, read: raw.length, sourceSystem };
}
