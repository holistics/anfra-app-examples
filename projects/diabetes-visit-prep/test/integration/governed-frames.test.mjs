import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryRows } from './anfra-query.mjs';

// Runs the AML through the anfra CLI, so it needs `anfra` on PATH and the dataset ingested (`anfra ingest`).
// The time-lapse frames (frame_* metrics over patient_days) and today's body (the status metrics) are separate
// calculations of the same rules; on each patient's last day of data they must agree.

const ORGAN_STATUSES = { glucose: 'glycemic_status', kidneys: 'kidney_status', heart: 'heart_status', eyes: 'eye_status', feet: 'foot_status' };
const ORGAN_COUNTS = { act_now: 'organs_act_now_count', review: 'organs_review_count', on_target: 'organs_on_target_count' };

const measures = (metricsByColumn, prefix = '') => Object.entries(metricsByColumn).map(([column, metric]) => `${column}: ${prefix}${metric}`).join(', ');

const patientIds = queryRows('explore { dimensions { id: patients.id } }').map((row) => row.id);

// Every patient has a row today, also without any test (the organ is then due), so a missing row reads as null and fails.
function getTodayByPatient (metricsByColumn) {
  const rowsByPatient = new Map(queryRows(`explore { dimensions { id: patients.id } measures { ${measures(metricsByColumn)} } }`).map((row) => [row.id, row]));
  return Object.fromEntries(patientIds.map((id) => [id, Object.fromEntries(Object.keys(metricsByColumn)
    .map((column) => [column, rowsByPatient.get(id)?.[column] ?? null]))]));
}

function getNewestFrameByPatient (metricsByColumn) {
  const rows = queryRows(`explore { dimensions { id: patients.id, day: patient_days.day } measures { ${measures(metricsByColumn, 'frame_')} } sorts { day asc } }`);
  const newestByPatient = new Map(rows.map((row) => [row.id, row]));
  return Object.fromEntries(patientIds.map((id) => [id, Object.fromEntries(Object.keys(metricsByColumn)
    .map((column) => [column, newestByPatient.get(id)?.[column] ?? null]))]));
}

// Guards the hand-written YAML parsing: if it read nothing, both sides would be empty and the comparisons below would pass.
test('the checks see every patient, each with a newest frame and today\'s organ counts', () => {
  assert.ok(patientIds.length > 0, 'no patients parsed from `anfra query`');
  for (const [side, countsByPatient] of Object.entries({ frame: getNewestFrameByPatient(ORGAN_COUNTS), today: getTodayByPatient(ORGAN_COUNTS) })) {
    for (const id of patientIds) {
      assert.ok(Object.values(countsByPatient[id]).every((count) => count !== null), `patient ${id} has no ${side} organ counts`);
    }
  }
});

test('the time-lapse ends on the status each organ has today, for every patient', () => {
  assert.deepEqual(getNewestFrameByPatient(ORGAN_STATUSES), getTodayByPatient(ORGAN_STATUSES));
});

test('the time-lapse ends on today\'s organ counts, for every patient', () => {
  assert.deepEqual(getNewestFrameByPatient(ORGAN_COUNTS), getTodayByPatient(ORGAN_COUNTS));
});
