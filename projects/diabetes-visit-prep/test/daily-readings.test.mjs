import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is a classic browser script that registers itself on window.VisitPrep.
globalThis.window = globalThis;
await import('../apps/_lib/daily-readings.js');
const { groupReadingsByDay, findRunAround } = globalThis.VisitPrep.dailyReadings;

const reading = (readAt, value, band) => ({ read_at: readAt, glucose_mgdl: value, band });

test('every day of the window gets a row, a day without readings an empty one', () => {
  const days = groupReadingsByDay([
    reading('2026-10-07T02:10:00', 68, 'low'),
    reading('2026-10-09 23:55:00', 120, 'in_range'),
  ], { from: '2026-10-07', to: '2026-10-09' });
  assert.deepEqual(days.map(({ day, readings }) => [day, readings.length]), [['2026-10-07', 1], ['2026-10-08', 0], ['2026-10-09', 1]]);
});

test('a reading is placed by its clock time as recorded, whatever the browser\'s time zone', () => {
  const [{ readings }] = groupReadingsByDay([reading('2026-10-07T02:10:00', '68', 'low')], { from: '2026-10-07', to: '2026-10-07' });
  assert.deepEqual(readings, [{ minute: 130, value: 68, band: 'low' }]);
});

test('a clicked low reads as the whole run of lows around it, up to a gap or a reading back in range', () => {
  const readings = [[120, 72], [125, 66], [130, 52], [135, 61], [140, 75], [145, 64], [155, 60]]
    .map(([minute, value]) => ({ minute, value }));
  const isLow = ({ value }) => value < 70;
  assert.deepEqual(findRunAround(readings, 2, 5, isLow).map(({ minute }) => minute), [125, 130, 135]);
  // 150 is missing, so 145 and 155 are two runs.
  assert.deepEqual(findRunAround(readings, 6, 5, isLow).map(({ minute }) => minute), [155]);
});
