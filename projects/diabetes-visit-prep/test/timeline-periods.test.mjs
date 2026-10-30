import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is a classic browser script that registers itself on window.VisitPrep.
globalThis.window = globalThis;
await import('../apps/_lib/timeline-periods.js');
const { getPeriodSpan, getWindowOfPeriods, findPeriodsOfWindow } = globalThis.VisitPrep.timelinePeriods;

// A timeline from Saturday 27 Jun to Monday 12 Oct 2026; weeks start on Monday, as the date drill truncates them.
const days = { daysPerPeriod: 1, firstDay: '2026-06-27', lastDay: '2026-10-12' };
const weeks = { daysPerPeriod: 7, firstDay: '2026-06-27', lastDay: '2026-10-12' };
const weekStarts = ['2026-06-22T00:00:00Z', '2026-06-29T00:00:00Z', '2026-07-06T00:00:00Z', '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z'];

test('a week covers its seven days, cut to the days on the timeline at either end', () => {
  assert.deepEqual(getPeriodSpan('2026-06-29T00:00:00Z', weeks), { from: '2026-06-29', to: '2026-07-05' });
  assert.deepEqual(getPeriodSpan('2026-06-22T00:00:00Z', weeks), { from: '2026-06-27', to: '2026-06-28' });
  assert.deepEqual(getPeriodSpan('2026-10-12T00:00:00Z', weeks), { from: '2026-10-12', to: '2026-10-12' });
});

test('a drag over periods picks the days from the first to the last, dragged either way', () => {
  const dayStarts = ['2026-08-07', '2026-08-08', '2026-08-09'];
  assert.deepEqual(getWindowOfPeriods(dayStarts, 2, 0, days), { from: '2026-08-07', to: '2026-08-09' });
  assert.deepEqual(getWindowOfPeriods(weekStarts, 1, 2, weeks), { from: '2026-06-29', to: '2026-07-12' });
  assert.deepEqual(getWindowOfPeriods(weekStarts, 0, 0, weeks), { from: '2026-06-27', to: '2026-06-28' });
});

test('a window is drawn over every period it touches, also when it covers only part of a week', () => {
  assert.deepEqual(findPeriodsOfWindow(weekStarts, { from: '2026-07-01', to: '2026-07-07' }, weeks), { first: 1, last: 2 });
  assert.deepEqual(findPeriodsOfWindow(weekStarts, { from: '2026-06-01', to: '2026-06-27' }, weeks), { first: 0, last: 0 });
});

test('a window that touches no period on the timeline is not drawn', () => {
  assert.equal(findPeriodsOfWindow(weekStarts, { from: '2025-11-03', to: '2025-11-16' }, weeks), null);
  assert.equal(findPeriodsOfWindow([], { from: '2026-07-01', to: '2026-07-07' }, days), null);
});
