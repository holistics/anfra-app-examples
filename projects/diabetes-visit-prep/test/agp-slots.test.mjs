import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is a classic browser script that registers itself on window.VisitPrep.
globalThis.window = globalThis;
await import('../apps/_lib/agp-slots.js');
const { formatSlotRange, formatHourTick, splitIntoRuns, findSlotIndexAt } = globalThis.VisitPrep.agpSlots;

test('a slot reads as its clock times, the last one ending at midnight', () => {
  assert.equal(formatSlotRange(180, 30), '03:00–03:30');
  assert.equal(formatSlotRange(1410, 30), '23:30–24:00');
});

test('the time axis reads midnight as 12am at both ends of the day and noon as 12pm', () => {
  assert.deepEqual([0, 180, 720, 1260, 1440].map(formatHourTick), ['12am', '3am', '12pm', '9pm', '12am']);
});

test('a line breaks where a slot has no readings, so no value is drawn across the gap', () => {
  assert.deepEqual(splitIntoRuns([0, 30, 60, 120, 150], 30), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(splitIntoRuns([], 30), []);
});

test('the pointer reads the slot it is over, and nothing over a slot without readings', () => {
  const slots = [0, 30, 90];
  assert.equal(findSlotIndexAt(45, slots, 30), 1);
  assert.equal(findSlotIndexAt(30, slots, 30), 1);
  assert.equal(findSlotIndexAt(70, slots, 30), -1);
});
