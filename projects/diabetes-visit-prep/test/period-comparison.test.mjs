import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is a classic browser script that registers itself on window.VisitPrep.
globalThis.window = globalThis;
await import('../apps/_lib/period-comparison.js');
const { compareWindows } = globalThis.VisitPrep.periodComparison;

test('a rise in a measure where higher is better reads as better', () => {
  assert.deepEqual(compareWindows({ current: 75.7, earlier: 72.8, betterWhen: 'higher', decimals: 1 }),
    { change: 2.9, direction: 'up', verdict: 'better', meaningful: undefined });
});

test('a rise in a measure where lower is better reads as worse, also when the values arrive as text', () => {
  assert.deepEqual(compareWindows({ current: '5.49', earlier: '1.48', betterWhen: 'lower', decimals: 1 }),
    { change: 4, direction: 'up', verdict: 'worse', meaningful: undefined });
});

test('a change that rounds to zero at the shown precision is no change', () => {
  assert.deepEqual(compareWindows({ current: 96.5, earlier: 96.46, betterWhen: 'higher', decimals: 0 }),
    { change: 0, direction: 'same', verdict: null, meaningful: undefined });
});

test('a change is meaningful from the governed size up, judged on the change as shown', () => {
  const isMeaningful = (current, earlier) => compareWindows({ current, earlier, betterWhen: 'higher', decimals: 1, meaningfulChange: '5' }).meaningful;
  assert.equal(isMeaningful(75.7, 72.8), false);
  assert.equal(isMeaningful(66, 71), true);
  // 4.96 shows as 5.0 and counts; 4.94 shows as 4.9 and does not.
  assert.equal(isMeaningful(70.96, 66), true);
  assert.equal(isMeaningful(70.94, 66), false);
});

test('no comparison when either window has no value', () => {
  assert.equal(compareWindows({ current: 75, earlier: null, betterWhen: 'higher', decimals: 0 }), null);
  assert.equal(compareWindows({ current: undefined, earlier: 70, betterWhen: 'higher', decimals: 0 }), null);
});
