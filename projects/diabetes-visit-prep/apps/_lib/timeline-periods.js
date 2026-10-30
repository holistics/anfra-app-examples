// The glucose timeline's periods (a day, or a week from its Monday) as spans of 'YYYY-MM-DD' days, in UTC so the
// browser's zone can't shift a day. Pure; classic script (the app frame blocks ES modules), unit-tested in Node
// (test/timeline-periods.test.mjs).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.timelinePeriods = (() => {
  const DAY_MS = 86400000;
  const truncateToDay = (value) => value.slice(0, 10);
  const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);

  // The days a period covers, cut to the timeline's first and last day: the first and last week are often partial.
  function getPeriodSpan (periodStart, { daysPerPeriod, firstDay, lastDay }) {
    const start = truncateToDay(periodStart);
    const end = addDays(start, daysPerPeriod - 1);
    return { from: start < firstDay ? firstDay : start, to: end > lastDay ? lastDay : end };
  }

  // The window a drag from period a to period b picks, dragged either way.
  function getWindowOfPeriods (periodStarts, a, b, bounds) {
    return {
      from: getPeriodSpan(periodStarts[Math.min(a, b)], bounds).from,
      to: getPeriodSpan(periodStarts[Math.max(a, b)], bounds).to,
    };
  }

  function findPeriodsOfWindow (periodStarts, window, bounds) {
    const touched = periodStarts.flatMap((start, index) => {
      const { from, to } = getPeriodSpan(start, bounds);
      return from <= window.to && to >= window.from ? [index] : [];
    });
    return touched.length ? { first: touched[0], last: touched.at(-1) } : null;
  }

  return { getPeriodSpan, getWindowOfPeriods, findPeriodsOfWindow };
})();
