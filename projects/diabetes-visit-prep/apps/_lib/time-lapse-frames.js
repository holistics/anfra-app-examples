// Pure functions on 'YYYY-MM-DD' day strings, in UTC so the browser's zone can't shift a day.
// Classic script (the app frame blocks ES modules), unit-tested in Node (test/time-lapse-frames.test.mjs).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.timeLapseFrames = (() => {
  const DAY_MS = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const truncateToDay = (value) => value.slice(0, 10);
  const parseDay = (day) => new Date(`${day}T00:00:00Z`);

  // Frames daysPerFrame apart, each the daily status on its last day, ending on the patient's last day of data so the
  // newest frame is today's status. Either frameCount frames, or as many as reach back to firstDay. A frame day with
  // no row (before the first record) keeps row: null.
  function pickFrames (rows, { daysPerFrame, frameCount, firstDay }) {
    if (!rows.length) return [];
    const rowsByDay = new Map(rows.map((row) => [truncateToDay(row.day), row]));
    const lastDay = parseDay([...rowsByDay.keys()].sort().at(-1)).getTime();
    const count = frameCount ?? Math.floor((lastDay - parseDay(firstDay)) / (daysPerFrame * DAY_MS)) + 1;
    return Array.from({ length: Math.max(count, 0) }, (_, i) => {
      const day = new Date(lastDay - (count - 1 - i) * daysPerFrame * DAY_MS).toISOString().slice(0, 10);
      return { day, row: rowsByDay.get(day) ?? null };
    });
  }

  // The frame whose span (the daysPerFrame days ending on its day) holds day, or -1 when no frame does.
  function findFrameIndexOfDay (days, day, daysPerFrame) {
    const index = days.findIndex((frameDay) => frameDay >= day);
    return index === -1 || parseDay(days[index]) - parseDay(day) >= daysPerFrame * DAY_MS ? -1 : index;
  }

  // A tick at the first frame of each month whose number (0 = January) is a multiple of everyMonths. Only January names
  // the year: the range's two ends carry full dates.
  function buildMonthTicks (days, everyMonths) {
    return days.flatMap((day, index) => {
      const date = parseDay(day);
      const month = date.getUTCMonth();
      const isNewMonth = index > 0 && parseDay(days[index - 1]).getUTCMonth() !== month;
      return isNewMonth && month % everyMonths === 0 ? [{ index, label: month === 0 ? `${MONTHS[month]} ${date.getUTCFullYear()}` : MONTHS[month] }] : [];
    });
  }

  function placeEvents (days, daysPerFrame, events) {
    const markers = new Map();
    for (const event of events) {
      const index = findFrameIndexOfDay(days, truncateToDay(event.occurred_on), daysPerFrame);
      if (index === -1) continue;
      if (!markers.has(index)) markers.set(index, { index, events: [] });
      markers.get(index).events.push(event);
    }
    return [...markers.values()].sort((a, b) => a.index - b.index);
  }

  return { pickFrames, findFrameIndexOfDay, buildMonthTicks, placeEvents };
})();
