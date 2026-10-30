import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is a classic browser script that registers itself on window.VisitPrep.
globalThis.window = globalThis;
await import('../apps/_lib/time-lapse-frames.js');
const { pickFrames, findFrameIndexOfDay, buildMonthTicks, placeEvents } = globalThis.VisitPrep.timeLapseFrames;

const dailyRows = (first, last) => {
  const rows = [];
  for (let day = Date.parse(`${first}T00:00:00Z`); day <= Date.parse(`${last}T00:00:00Z`); day += 86400000) {
    rows.push({ day: new Date(day).toISOString().slice(0, 10), status: 'on_target' });
  }
  return rows;
};

test('week-end frames end on the last day of data and step back a week at a time, oldest first', () => {
  const frames = pickFrames(dailyRows('2026-08-01', '2026-10-12'), { daysPerFrame: 7, frameCount: 3 });
  assert.deepEqual(frames.map((frame) => frame.day), ['2026-09-28', '2026-10-05', '2026-10-12']);
  assert.equal(frames[2].row.day, '2026-10-12');
});

test('a week end before the patient has any record is a frame without a row', () => {
  const frames = pickFrames(dailyRows('2026-10-01', '2026-10-12'), { daysPerFrame: 7, frameCount: 3 });
  assert.deepEqual(frames.map((frame) => frame.row?.day ?? null), [null, '2026-10-05', '2026-10-12']);
});

test('days that arrive with a time part still match their frame', () => {
  const frames = pickFrames([{ day: '2026-10-12 00:00:00', status: 'act_now' }], { daysPerFrame: 7, frameCount: 1 });
  assert.deepEqual(frames, [{ day: '2026-10-12', row: { day: '2026-10-12 00:00:00', status: 'act_now' } }]);
});

test('a patient with no rows has no frames', () => {
  assert.deepEqual(pickFrames([], { daysPerFrame: 7, frameCount: 104 }), []);
});

test('since the previous visit shows every day from that visit to the last day of data', () => {
  const frames = pickFrames(dailyRows('2026-07-01', '2026-10-12'), { daysPerFrame: 1, firstDay: '2026-10-09' });
  assert.deepEqual(frames.map((frame) => frame.day), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
});

test('switching to weekly frames keeps a selected day on the week that holds it', () => {
  const weekEnds = ['2026-09-28', '2026-10-05', '2026-10-12'];
  assert.equal(findFrameIndexOfDay(weekEnds, '2026-10-01', 7), 1);
  assert.equal(findFrameIndexOfDay(weekEnds, '2026-10-05', 7), 1);
});

test('a selected day before the new range starts has no frame to keep', () => {
  assert.equal(findFrameIndexOfDay(['2026-09-28', '2026-10-05'], '2026-09-21', 7), -1);
  assert.equal(findFrameIndexOfDay(['2026-10-11', '2026-10-12'], '2026-10-10', 1), -1);
});

test('month ticks mark the first frame of every sixth month; only January names the year', () => {
  const days = pickFrames(dailyRows('2024-10-01', '2026-10-12'), { daysPerFrame: 7, frameCount: 104 }).map((frame) => frame.day);
  assert.deepEqual(buildMonthTicks(days, 6).map((tick) => [days[tick.index], tick.label]), [
    ['2025-01-06', 'Jan 2025'],
    ['2025-07-07', 'Jul'],
    ['2026-01-05', 'Jan 2026'],
    ['2026-07-06', 'Jul'],
  ]);
});

test('an event is marked on the frame of the week it happened in', () => {
  const days = ['2026-09-28', '2026-10-05', '2026-10-12'];
  const markers = placeEvents(days, 7, [{ occurred_on: '2026-10-01', kind: 'basal_dose_change' }, { occurred_on: '2026-10-05', kind: 'cgm_resumed' }]);
  assert.deepEqual(markers.map((marker) => [marker.index, marker.events.map((event) => event.kind)]), [[1, ['basal_dose_change', 'cgm_resumed']]]);
});

test('on daily frames an event is marked on its own day', () => {
  const markers = placeEvents(['2026-08-27', '2026-08-28', '2026-08-29'], 1, [{ occurred_on: '2026-08-28 00:00:00', kind: 'basal_dose_change' }]);
  assert.deepEqual(markers.map((marker) => marker.index), [1]);
});

test('events before the first frame\'s week or after the last frame are left off', () => {
  const days = ['2026-09-28', '2026-10-05'];
  const markers = placeEvents(days, 7, [
    { occurred_on: '2026-09-21', kind: 'cgm_started' },
    { occurred_on: '2026-09-22', kind: 'basal_started' },
    { occurred_on: '2026-10-06', kind: 'cgm_interrupted' },
  ]);
  assert.deepEqual(markers.map((marker) => [marker.index, marker.events.map((event) => event.kind)]), [[0, ['basal_started']]]);
});
