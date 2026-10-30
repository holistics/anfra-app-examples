// Time-of-day slots of the AGP, each starting so many minutes after midnight. Pure; classic script (the app frame
// blocks ES modules), unit-tested in Node (test/agp-slots.test.mjs).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.agpSlots = (() => {
  const formatClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const formatSlotRange = (slot, slotMinutes) => `${formatClock(slot)}–${formatClock(slot + slotMinutes)}`;

  const formatHourTick = (minutes) => {
    const hour = (minutes / 60) % 24;
    return `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;
  };

  // Index runs of consecutive slots: a window with gaps in its readings can lack a slot, and a line must not bridge it.
  function splitIntoRuns (slots, slotMinutes) {
    const runs = [];
    slots.forEach((slot, index) => {
      if (index && slot === slots[index - 1] + slotMinutes) runs.at(-1).push(index);
      else runs.push([index]);
    });
    return runs;
  }

  const findSlotIndexAt = (minute, slots, slotMinutes) => slots.indexOf(Math.floor(minute / slotMinutes) * slotMinutes);

  return { formatSlotRange, formatHourTick, splitIntoRuns, findSlotIndexAt };
})();
