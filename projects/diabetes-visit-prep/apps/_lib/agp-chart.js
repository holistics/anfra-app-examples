// The Ambulatory Glucose Profile (AGP Report): every day of a window laid over one 24-hour day. The current window is
// drawn in full (5–95 and 25–75 percentile bands, median line), earlier windows as a median line; a target range and
// reference lines across; a readout of every window's percentiles in the slot under the pointer, or stepped to with the
// arrow keys; one day's readings traced over it on request. Draws what it is given; knows nothing about queries or
// clinical rules. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.agpChart = (() => {
  const DAY_MINUTES = 1440;
  const TICK_EVERY_MINUTES = 180;
  const PERCENTILES = [
    { key: 'p95', label: '95th percentile' }, { key: 'p75', label: '75th percentile' }, { key: 'p50', label: 'Median' },
    { key: 'p25', label: '25th percentile' }, { key: 'p5', label: '5th percentile' },
  ];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const buildSpan = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text ?? '' });
  const buildSvgElement = (name, attributes) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };

  // A curve through the points (Catmull-Rom as cubic Béziers); it only shapes the line between two slots' values.
  function buildCurve (points) {
    const format = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
    return `M${format(points[0])}` + points.slice(1).map((point, i) => {
      const before = points[i - 1] ?? points[i], start = points[i], after = points[i + 2] ?? point;
      const control1 = [start[0] + (point[0] - before[0]) / 6, start[1] + (point[1] - before[1]) / 6];
      const control2 = [point[0] - (after[0] - start[0]) / 6, point[1] - (after[1] - start[1]) / 6];
      return `C${format(control1)} ${format(control2)} ${format(point)}`;
    }).join('');
  }

  function mount (container) {
    container.classList.add('agp-chart');
    container.innerHTML = `
      <div class="agp-chart-legend"></div>
      <div class="agp-chart-stage">
        <div class="agp-chart-y-labels"></div>
        <div class="agp-chart-plot" tabindex="0">
          <svg class="agp-chart-svg" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="agp-chart-crosshair" hidden></div>
          <div class="agp-chart-dots"></div>
        </div>
        <div class="agp-chart-limit-labels"></div>
      </div>
      <div class="agp-chart-ticks"></div>
      <div class="agp-chart-tooltip" role="tooltip" hidden></div>`;
    const plot = container.querySelector('.agp-chart-plot');
    const svg = container.querySelector('.agp-chart-svg');
    const crosshair = container.querySelector('.agp-chart-crosshair');
    const dotsBox = container.querySelector('.agp-chart-dots');
    const tooltip = container.querySelector('.agp-chart-tooltip');
    let paintOptions = null;
    let shownSlotIndex = -1;

    // windows: [{ name, rows: [{ slot, p5, p25, p50, p75, p95 }] }] in slot order; the first (current) is drawn in
    // full, the others (earlier) as a median line. slotMinutes: each slot's length; a slot is drawn at its middle.
    // yMax: the top of the value axis. targetRange: { from, to, label } washed across. referenceLines: { value,
    // label, emphasis }. format(value) and unit: the readout's numbers. A missing slot breaks the lines and bands
    // there.
    function paint ({ windows, slotMinutes, yMax, targetRange, referenceLines, format, unit }) {
      paintOptions = { windows, slotMinutes, yMax, format, unit };
      hideTrace();
      svg.setAttribute('viewBox', `0 0 ${DAY_MINUTES} ${yMax}`);
      const toY = (value) => yMax - Math.min(Number(value), yMax);
      const buildRunPoints = (rows, run, key) => {
        const points = run.map((index) => [Number(rows[index].slot) + slotMinutes / 2, toY(rows[index][key])]);
        // A run that reaches midnight holds its edge slot's value to the edge of the day.
        if (Number(rows[run[0]].slot) === 0) points.unshift([0, points[0][1]]);
        if (Number(rows[run.at(-1)].slot) + slotMinutes === DAY_MINUTES) points.push([DAY_MINUTES, points.at(-1)[1]]);
        return points;
      };
      const getRuns = (rows) => VisitPrep.agpSlots.splitIntoRuns(rows.map(({ slot }) => Number(slot)), slotMinutes);
      const buildBand = (rows, from, to, className) => getRuns(rows).map((run) => {
        const upper = buildCurve(buildRunPoints(rows, run, to));
        const lower = buildCurve(buildRunPoints(rows, run, from).reverse());
        return buildSvgElement('path', { class: className, d: `${upper}L${lower.slice(1)}Z` });
      });
      const buildMedian = (rows, className) => getRuns(rows).map((run) => buildSvgElement('path', { class: className, d: buildCurve(buildRunPoints(rows, run, 'p50')) }));
      const [current, ...earlier] = windows;
      svg.replaceChildren(
        buildSvgElement('rect', { class: 'agp-chart-target', x: 0, width: DAY_MINUTES, y: toY(targetRange.to), height: targetRange.to - targetRange.from }),
        ...Array.from({ length: DAY_MINUTES / TICK_EVERY_MINUTES - 1 }, (_, i) => buildSvgElement('line', {
          class: 'agp-chart-grid', x1: (i + 1) * TICK_EVERY_MINUTES, x2: (i + 1) * TICK_EVERY_MINUTES, y1: 0, y2: yMax,
        })),
        ...referenceLines.map(({ value, emphasis }) => buildSvgElement('line', {
          class: `agp-chart-reference${emphasis ? ' emphasis' : ''}`, x1: 0, x2: DAY_MINUTES, y1: toY(value), y2: toY(value),
        })),
        ...buildBand(current.rows, 'p5', 'p95', 'agp-chart-band outer'),
        ...buildBand(current.rows, 'p25', 'p75', 'agp-chart-band inner'),
        ...earlier.flatMap(({ rows }) => buildMedian(rows, 'agp-chart-median earlier')),
        ...buildMedian(current.rows, 'agp-chart-median'),
      );
      const toTop = (value) => `${(toY(value) / yMax) * 100}%`;
      container.querySelector('.agp-chart-limit-labels').replaceChildren(...referenceLines.map(({ value, label }) => {
        const tick = buildSpan('agp-chart-y-label', label);
        tick.style.top = toTop(value);
        return tick;
      }));
      container.querySelector('.agp-chart-y-labels').replaceChildren(...[yMax, 0].map((value) => {
        const tick = buildSpan('agp-chart-y-label', format(value));
        tick.style.top = toTop(value);
        return tick;
      }));
      container.querySelector('.agp-chart-ticks').replaceChildren(...Array.from({ length: DAY_MINUTES / TICK_EVERY_MINUTES + 1 }, (_, i) => {
        const tick = buildSpan('agp-chart-tick', VisitPrep.agpSlots.formatHourTick(i * TICK_EVERY_MINUTES));
        tick.style.left = `${(i * TICK_EVERY_MINUTES / DAY_MINUTES) * 100}%`;
        return tick;
      }));
      const buildLegendItem = (className, label) => {
        const item = buildSpan('agp-chart-legend-item');
        item.append(buildSpan(`agp-chart-key ${className}`), label);
        return item;
      };
      container.querySelector('.agp-chart-legend').replaceChildren(
        buildLegendItem('outer', '5–95%'), buildLegendItem('inner', '25–75%'), buildLegendItem('median', 'Median'),
        ...earlier.map(({ name }) => buildLegendItem('median earlier', `${name}, median`)),
        buildLegendItem('target', targetRange.label),
        // Held empty until a day is traced, so tracing never reflows the chart.
        buildLegendItem('trace', ''),
      );
      if (shownSlotIndex !== -1) showSlotReadout(Math.min(shownSlotIndex, current.rows.length - 1));
      VisitPrep.svgPaint.pin(container);
    }

    function showSlotReadout (index) {
      const { windows, slotMinutes, yMax, format, unit } = paintOptions;
      const [current] = windows;
      shownSlotIndex = index;
      const slot = Number(current.rows[index].slot);
      const left = `${((slot + slotMinutes / 2) / DAY_MINUTES) * 100}%`;
      crosshair.hidden = false;
      crosshair.style.left = left;
      const rowsInSlot = windows.map(({ rows }) => rows.find((row) => Number(row.slot) === slot));
      dotsBox.replaceChildren(...rowsInSlot.flatMap((row, i) => {
        if (row?.p50 == null) return [];
        const dot = buildSpan(`agp-chart-dot${i ? ' earlier' : ''}`);
        Object.assign(dot.style, { left, top: `${((yMax - Math.min(Number(row.p50), yMax)) / yMax) * 100}%` });
        return [dot];
      }));
      const table = document.createElement('table');
      const head = table.createTHead().insertRow();
      head.append(...[`${VisitPrep.agpSlots.formatSlotRange(slot, slotMinutes)} · ${unit}`, ...windows.map(({ name }) => name)]
        .map((text) => Object.assign(document.createElement('th'), { textContent: text })));
      const body = table.createTBody();
      for (const { key, label } of PERCENTILES) {
        const row = body.insertRow();
        row.dataset.percentile = key;
        row.append(Object.assign(document.createElement('th'), { textContent: label, scope: 'row' }),
          ...rowsInSlot.map((slotRow) => Object.assign(document.createElement('td'), { textContent: slotRow?.[key] == null ? '—' : format(slotRow[key]) })));
      }
      tooltip.replaceChildren(table);
      tooltip.hidden = false;
      const box = container.getBoundingClientRect(), plotBox = plot.getBoundingClientRect();
      const x = plotBox.left - box.left + ((slot + slotMinutes / 2) / DAY_MINUTES) * plotBox.width;
      const fitsRight = x + 12 + tooltip.offsetWidth <= box.width;
      tooltip.style.left = `${fitsRight ? x + 12 : x - 12 - tooltip.offsetWidth}px`;
      tooltip.style.top = `${plotBox.top - box.top + 8}px`;
    }

    // trace: { name, intervalMinutes, readings: [{ minute, value }] } in time order, drawn over the profile, which fades
    // behind it; a gap between readings breaks the line.
    function showTrace ({ name, intervalMinutes, readings }) {
      hideTrace();
      const { yMax } = paintOptions;
      const toPoint = ({ minute, value }) => `${minute + intervalMinutes / 2},${yMax - Math.min(value, yMax)}`;
      const runs = VisitPrep.agpSlots.splitIntoRuns(readings.map(({ minute }) => minute), intervalMinutes);
      svg.append(...runs.map((run) => buildSvgElement('polyline', { class: 'agp-chart-trace', points: run.map((index) => toPoint(readings[index])).join(' ') })));
      container.classList.add('tracing');
      const item = container.querySelector('.agp-chart-key.trace').parentElement;
      item.lastChild.textContent = name;
    }

    function hideTrace () {
      container.classList.remove('tracing');
      for (const element of container.querySelectorAll('.agp-chart-trace')) element.remove();
    }

    function hideSlotReadout () {
      shownSlotIndex = -1;
      crosshair.hidden = true;
      tooltip.hidden = true;
      dotsBox.replaceChildren();
    }

    plot.addEventListener('pointermove', (event) => {
      if (!paintOptions) return;
      const box = plot.getBoundingClientRect();
      const minute = Math.min(Math.max(((event.clientX - box.left) / box.width) * DAY_MINUTES, 0), DAY_MINUTES - 1);
      const slots = paintOptions.windows[0].rows.map(({ slot }) => Number(slot));
      const index = VisitPrep.agpSlots.findSlotIndexAt(minute, slots, paintOptions.slotMinutes);
      if (index === -1) hideSlotReadout();
      else if (index !== shownSlotIndex) showSlotReadout(index);
    });
    plot.addEventListener('pointerleave', hideSlotReadout);
    plot.addEventListener('blur', hideSlotReadout);
    plot.addEventListener('keydown', (event) => {
      const count = paintOptions?.windows[0].rows.length;
      if (!count || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      showSlotReadout(shownSlotIndex === -1 ? 0 : (shownSlotIndex + step + count) % count);
    });

    return { paint, showTrace, hideTrace };
  }

  return { mount };
})();
