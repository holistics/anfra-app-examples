// Daily glucose profiles: one strip per day on a midnight-to-midnight axis, each reading a cell above a center line
// (side 'up'), below it (side 'down') or none (on the line); the line is drawn only where there are readings. Reports
// the day under the pointer and a clicked reading, or the same from the keyboard; one span of a day can be outlined.
// Draws what it is given; knows nothing about queries or clinical rules. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.dailyProfiles = (() => {
  const DAY_MINUTES = 1440;
  const TICK_EVERY_MINUTES = 180;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // In viewBox units: each side of the line is 1 tall; a cell stops short of the line so the line stays visible.
  const LINE_GAP = 0.08;

  const buildSpan = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text ?? '' });
  const buildSvgElement = (name, attributes) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };

  function mount (container, { onDayHover, onReadingClick, keyboardLabel }) {
    container.classList.add('daily-profiles');
    container.innerHTML = `
      <div class="daily-profiles-legend"></div>
      <div class="daily-profiles-days"></div>
      <div class="daily-profiles-ticks"></div>`;
    const daysBox = container.querySelector('.daily-profiles-days');
    daysBox.tabIndex = 0;
    daysBox.setAttribute('aria-label', keyboardLabel);
    let paintOptions = null;
    let hoveredDayIndex = null;

    // days: [{ label, readings: [{ minute, color, side }] }] in time order; intervalMinutes: how much of the day a
    // reading stands for. outline: { dayIndex, from, to } in minutes, or null. selectedDayIndex: the day shown as
    // selected, or null. legend: { label, color } or { label, heading } to start a group.
    function paint ({ days, intervalMinutes, outline, selectedDayIndex, legend }) {
      paintOptions = { days, intervalMinutes, outline, selectedDayIndex };
      daysBox.replaceChildren(...days.flatMap(({ label, readings }, dayIndex) => {
        const name = buildSpan(`daily-profiles-day-label${dayIndex === selectedDayIndex ? ' selected' : ''}`, label);
        const svg = buildSvgElement('svg', { class: 'daily-profiles-strip', viewBox: `0 0 ${DAY_MINUTES} 2`, preserveAspectRatio: 'none' });
        svg.dataset.dayIndex = dayIndex;
        if (dayIndex === selectedDayIndex) svg.classList.add('selected');
        if (dayIndex === hoveredDayIndex) svg.classList.add('hovered');
        const runs = VisitPrep.agpSlots.splitIntoRuns(readings.map(({ minute }) => minute), intervalMinutes);
        svg.append(
          ...readings.filter(({ side }) => side).map(({ minute, color, side }) => buildSvgElement('rect', {
            x: minute, width: intervalMinutes, y: side === 'up' ? 0 : 1 + LINE_GAP, height: 1 - LINE_GAP, fill: color,
          })),
          ...runs.map((run) => buildSvgElement('line', {
            class: 'daily-profiles-line', x1: readings[run[0]].minute, x2: readings[run.at(-1)].minute + intervalMinutes, y1: 1, y2: 1,
          })),
        );
        if (outline?.dayIndex === dayIndex) {
          svg.append(buildSvgElement('rect', { class: 'daily-profiles-outline', x: outline.from, width: outline.to - outline.from, y: 0, height: 2 }));
        }
        return [name, svg];
      }));
      container.querySelector('.daily-profiles-ticks').replaceChildren(...Array.from({ length: DAY_MINUTES / TICK_EVERY_MINUTES + 1 }, (_, i) => {
        const tick = buildSpan('daily-profiles-tick', VisitPrep.agpSlots.formatHourTick(i * TICK_EVERY_MINUTES));
        tick.style.left = `${(i * TICK_EVERY_MINUTES / DAY_MINUTES) * 100}%`;
        return tick;
      }));
      container.querySelector('.daily-profiles-legend').replaceChildren(...legend.map(({ label, color, heading }) => {
        if (heading) return buildSpan('daily-profiles-legend-heading', label);
        const item = buildSpan('daily-profiles-legend-item');
        const swatch = buildSpan('daily-profiles-swatch');
        swatch.style.background = color;
        item.append(swatch, label);
        return item;
      }));
      if (hoveredDayIndex >= days.length) hoverDay(null);
      VisitPrep.svgPaint.pin(container);
    }

    const getDayIndex = (event) => {
      const strip = event.target.closest('.daily-profiles-strip');
      return strip ? Number(strip.dataset.dayIndex) : null;
    };
    function hoverDay (dayIndex) {
      if (dayIndex === hoveredDayIndex) return;
      hoveredDayIndex = dayIndex;
      for (const strip of daysBox.querySelectorAll('.daily-profiles-strip')) strip.classList.toggle('hovered', Number(strip.dataset.dayIndex) === dayIndex);
      onDayHover(dayIndex);
    }
    daysBox.addEventListener('pointermove', (event) => hoverDay(getDayIndex(event)));
    daysBox.addEventListener('pointerleave', () => hoverDay(null));
    daysBox.addEventListener('blur', () => hoverDay(null));
    daysBox.addEventListener('keydown', (event) => {
      const { days, outline, selectedDayIndex } = paintOptions ?? {};
      if (!days?.length || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const dayIndex = hoveredDayIndex ?? selectedDayIndex ?? -1;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        hoverDay(dayIndex === -1 ? (step === 1 ? 0 : days.length - 1) : Math.min(Math.max(dayIndex + step, 0), days.length - 1));
        return;
      }
      if (dayIndex === -1) return;
      const dayOutline = outline?.dayIndex === dayIndex ? outline : null;
      const offLine = days[dayIndex].readings.map((reading, index) => ({ ...reading, index })).filter(({ side }) => side);
      const nearest = event.key === 'ArrowRight'
        ? offLine.find(({ minute }) => !dayOutline || minute >= dayOutline.to)
        : offLine.findLast(({ minute }) => !dayOutline || minute < dayOutline.from);
      if (nearest) onReadingClick(dayIndex, nearest.index);
    });
    daysBox.addEventListener('click', (event) => {
      const dayIndex = getDayIndex(event);
      if (dayIndex === null) return;
      const box = event.target.closest('.daily-profiles-strip').getBoundingClientRect();
      const minute = ((event.clientX - box.left) / box.width) * DAY_MINUTES;
      const { readings } = paintOptions.days[dayIndex];
      const readingIndex = readings.findIndex((reading) => minute >= reading.minute && minute < reading.minute + paintOptions.intervalMinutes);
      onReadingClick(dayIndex, readingIndex);
    });

    return { paint };
  }

  return { mount };
})();
