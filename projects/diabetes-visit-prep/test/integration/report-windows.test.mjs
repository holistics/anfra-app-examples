import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryRows } from './anfra-query.mjs';

// Needs `anfra` on PATH and the dataset ingested (`anfra ingest`).
// A report window reaches a query two ways: a truefalse dimension in a where() (the body map's statuses) or a date
// filter on its governed bounds over both cgm_readings.read_at and patient_days.day (the glucose view, and any window
// the reader drags). For the same window both must give the same numbers.

const WINDOWS = [
  { name: 'current report', dimension: 'cgm_readings.in_current_window', starts: 'patients.current_window_starts_on', ends: 'patients.current_window_ends_on' },
  { name: 'previous treatment', dimension: 'cgm_readings.in_previous_treatment_window', starts: 'patients.previous_treatment_window_starts_on', ends: 'patients.previous_treatment_window_ends_on' },
  { name: 'previous visit', dimension: 'cgm_readings.in_previous_visit_window', starts: 'patients.previous_visit_window_starts_on', ends: 'patients.previous_visit_on' },
];
const METRICS = ['readings_count', 'tir_pct', 'tbr_pct', 'tbr_severe_pct', 'tar_pct', 'tar_severe_pct', 'gmi', 'cv_pct'];
// The two routes compile to different SQL that may sum floats in a different order; 6 decimals is far finer than any shown value.
const roundValues = (row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column, value == null ? null : Number(Number(value).toFixed(6))]));
const toDay = (value) => value.slice(0, 10);

const windowBounds = queryRows(`explore { dimensions { id: patients.id, ${WINDOWS.map((window, i) => `starts_${i}: ${window.starts}, ends_${i}: ${window.ends}`).join(', ')} } }`);

// Every patient's windows that have both bounds.
const windowCases = windowBounds.flatMap((row) => WINDOWS.map((window, i) => ({ id: row.id, window, starts: row[`starts_${i}`], ends: row[`ends_${i}`] })))
  .filter(({ starts, ends }) => starts && ends);

function getMetricsByDimension ({ id, window }) {
  const [row] = queryRows(`explore {
    measures { ${METRICS.map((metric) => `${metric}: ${metric} | where(${window.dimension} == true)`).join(', ')} }
    filters { patients.id == ${id} } }`);
  return roundValues(row ?? {});
}

function getMetricsByBounds ({ id, starts, ends }) {
  const range = `@${toDay(starts)} - ${toDay(ends)}`;
  const [row] = queryRows(`explore {
    measures { ${METRICS.map((metric) => `${metric}: ${metric}`).join(', ')} }
    filters { patients.id == ${id}, cgm_readings.read_at matches ${range}, patient_days.day matches ${range} } }`);
  return roundValues(row ?? {});
}

// Guards the parsing: with no windowCases the comparisons below would pass on nothing.
test('the checks cover all three of Maria\'s windows', () => {
  assert.deepEqual(windowCases.filter(({ id }) => id === '1').map(({ window }) => window.name), WINDOWS.map((window) => window.name));
});

test('a report window gives the same numbers as a where() or as a date filter on its bounds', () => {
  for (const windowCase of windowCases) {
    assert.deepEqual(getMetricsByBounds(windowCase), getMetricsByDimension(windowCase), `patient ${windowCase.id}, ${windowCase.window.name}`);
  }
});

test('over a full 14-day report, sensor wear for a chosen window equals the 14-day sensor wear', () => {
  for (const { id, starts, ends } of windowCases.filter(({ window }) => window.name === 'current report')) {
    const range = `@${toDay(starts)} - ${toDay(ends)}`;
    const [byBounds] = queryRows(`explore { measures { days: window_days, wear: window_sensor_wear_pct }
      filters { patients.id == ${id}, cgm_readings.read_at matches ${range}, patient_days.day matches ${range} } }`);
    const [byDimension] = queryRows(`explore { measures { wear: sensor_wear_pct | where(cgm_readings.in_current_window == true) } filters { patients.id == ${id} } }`);
    assert.equal(Number(byBounds.days), 14, `patient ${id}: current report is not 14 days`);
    assert.equal(roundValues(byBounds).wear, roundValues(byDimension).wear, `patient ${id}`);
  }
});

// The glucose timeline counts each day's readings by band on the day spine (period_* metrics); over a window's days
// those counts must give the shares the report metrics give from the readings.
test('over a report window, the timeline\'s shares from day counts equal the report metrics', () => {
  const PERIOD_METRICS = { period_tbr_pct: 'tbr_pct', period_tbr_severe_pct: 'tbr_severe_pct', period_tar_pct: 'tar_pct', period_tar_severe_pct: 'tar_severe_pct' };
  for (const windowCase of windowCases) {
    const [row] = queryRows(`explore {
      measures { ${Object.keys(PERIOD_METRICS).map((metric) => `${metric}: ${metric}`).join(', ')} }
      filters { patients.id == ${windowCase.id}, patient_days.day matches @${toDay(windowCase.starts)} - ${toDay(windowCase.ends)} } }`);
    const byDayCounts = roundValues(row ?? {});
    const byReadings = getMetricsByDimension(windowCase);
    for (const [periodMetric, metric] of Object.entries(PERIOD_METRICS)) {
      assert.equal(byDayCounts[periodMetric], byReadings[metric], `patient ${windowCase.id}, ${windowCase.window.name}, ${periodMetric}`);
    }
  }
});
