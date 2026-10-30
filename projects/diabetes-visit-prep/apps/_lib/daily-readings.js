// A report's CGM readings by day, for the daily profiles. Read times are taken as recorded (clock time, no zone), so the
// browser's zone can't move a reading to another day or hour. Pure; classic script (the app frame blocks ES modules),
// unit-tested in Node (test/daily-readings.test.mjs).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.dailyReadings = (() => {
  const DAY_MS = 86400000;
  const READ_AT_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

  function listDays (from, to) {
    const days = [];
    for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += DAY_MS) {
      days.push(new Date(time).toISOString().slice(0, 10));
    }
    return days;
  }

  // rows: { read_at, glucose_mgdl, band } in time order; from and to: the window's first and last day.
  function groupReadingsByDay (rows, { from, to }) {
    const byDay = new Map(listDays(from, to).map((day) => [day, []]));
    for (const row of rows) {
      const [, day, hour, minute] = READ_AT_PATTERN.exec(row.read_at);
      byDay.get(day)?.push({ minute: Number(hour) * 60 + Number(minute), value: Number(row.glucose_mgdl), band: row.band });
    }
    return [...byDay].map(([day, readings]) => ({ day, readings }));
  }

  // The readings next to readings[index], one interval apart, that belong with it.
  function findRunAround (readings, index, intervalMinutes, belongsToRun) {
    const joins = (a, b) => readings[b].minute - readings[a].minute === intervalMinutes && belongsToRun(readings[a]) && belongsToRun(readings[b]);
    let first = index, last = index;
    while (first > 0 && joins(first - 1, first)) first--;
    while (last < readings.length - 1 && joins(last, last + 1)) last++;
    return readings.slice(first, last + 1);
  }

  return { groupReadingsByDay, findRunAround };
})();
