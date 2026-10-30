// How a measure moved between an earlier window and the current one. Pure; classic script (the app frame blocks
// ES modules), unit-tested in Node (test/period-comparison.test.mjs).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.periodComparison = (() => {
  // current and earlier may arrive as strings (query values). The change is rounded to the shown decimals, and
  // "same" and "meaningful" are judged on that rounded change, so the verdict always agrees with the number shown.
  function compareWindows ({ current, earlier, betterWhen, decimals, meaningfulChange }) {
    if (current == null || earlier == null) return null;
    const scale = 10 ** decimals;
    const change = Math.round((Number(current) - Number(earlier)) * scale) / scale;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    const verdict = direction === 'same' ? null : (direction === 'up') === (betterWhen === 'higher') ? 'better' : 'worse';
    const meaningful = meaningfulChange == null ? undefined : Math.abs(change) >= Number(meaningfulChange);
    return { change, direction, verdict, meaningful };
  }

  return { compareWindows };
})();
