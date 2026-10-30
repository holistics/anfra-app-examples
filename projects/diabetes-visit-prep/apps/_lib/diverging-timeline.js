// A timeline of diverging columns: per period, segments stacked up from a center line and segments stacked down from
// it, on one scale; event markers above, reference lines across, windows bracketed below, and a drag to pick a window.
// It draws what it is given and reports which periods were dragged over; it knows nothing about queries or clinical
// rules. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.divergingTimeline = (() => {
  const PLOT_HEIGHT_PX = 180;
  const MIN_LABEL_GAP_PX = 8;
  const HOVER_TARGET_SELECTOR = '.diverging-timeline-column, .diverging-timeline-marker, .diverging-timeline-bracket';

  function mount (container, { onDrag }) {
    container.classList.add('diverging-timeline');
    container.innerHTML = `
      <div class="diverging-timeline-legend"></div>
      <div class="diverging-timeline-stage">
        <div class="diverging-timeline-markers"></div>
        <div class="diverging-timeline-plot">
          <div class="diverging-timeline-windows"></div>
          <div class="diverging-timeline-columns"></div>
          <div class="diverging-timeline-lines"></div>
          <div class="diverging-timeline-drag" hidden></div>
        </div>
      </div>
      <div class="diverging-timeline-ticks"></div>
      <div class="diverging-timeline-brackets"></div>
      <div class="diverging-timeline-tooltip" role="tooltip" hidden></div>`;
    const markersBox = container.querySelector('.diverging-timeline-markers');
    const plot = container.querySelector('.diverging-timeline-plot');
    const windowsBox = container.querySelector('.diverging-timeline-windows');
    const columnsBox = container.querySelector('.diverging-timeline-columns');
    const linesBox = container.querySelector('.diverging-timeline-lines');
    const dragBox = container.querySelector('.diverging-timeline-drag');
    const ticksBox = container.querySelector('.diverging-timeline-ticks');
    const bracketsBox = container.querySelector('.diverging-timeline-brackets');
    const legendBox = container.querySelector('.diverging-timeline-legend');
    const tooltip = container.querySelector('.diverging-timeline-tooltip');
    let periodCount = 0;
    let dragStart = null;

    const getLeft = (index) => `${(index / periodCount) * 100}%`;
    const getCenter = (index) => `${((index + 0.5) / periodCount) * 100}%`;
    const getWidth = (first, last) => `${((last - first + 1) / periodCount) * 100}%`;
    const buildSpan = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text ?? '' });

    // periods: { label, up: [{ value, color, name }], down: [...], hatched, partial, details } per period, in time order;
    // up segments stack from the center line upward, down segments downward, each list from the center out. hatched
    // marks a period whose values can't be trusted; partial one that covers only part of its span. details: hover lines.
    // scale: { up, down }, the extent of each side in the values' unit. referenceLines: { side, value, label }.
    // ticks: { index, label }; startLabel and endLabel name the two ends. markers: { index, label, details, emphasis }.
    // windows: { key, first, last, label, details, emphasis } brackets below the axis, with a wash over their periods;
    // details is the hover text. legend: { label, color }, { label, hatched }, or { label, heading } to start a group.
    function paint ({ periods, scale, referenceLines, ticks, startLabel, endLabel, markers, windows, legend }) {
      periodCount = periods.length;
      tooltip.hidden = true;
      const pxPerUnit = PLOT_HEIGHT_PX / (scale.up + scale.down);
      const upHeight = scale.up * pxPerUnit;
      container.style.setProperty('--up-height', `${upHeight}px`);
      container.style.setProperty('--down-height', `${scale.down * pxPerUnit}px`);
      columnsBox.classList.toggle('dense', periodCount > 60);
      const buildStack = (className, segments) => {
        const stack = buildSpan(className);
        stack.append(...segments.filter(({ value }) => value > 0).map(({ value, color }) => {
          const segment = buildSpan('diverging-timeline-segment');
          segment.style.height = `${value * pxPerUnit}px`;
          segment.style.background = color;
          return segment;
        }));
        return stack;
      };
      columnsBox.replaceChildren(...periods.map(({ label, up, down, hatched, partial, details }, index) => {
        const column = buildSpan(`diverging-timeline-column${hatched ? ' hatched' : ''}${partial ? ' partial' : ''}`);
        column.dataset.index = index;
        column.dataset.label = [label, ...details].join('\n');
        column.append(buildStack('diverging-timeline-up', up), buildStack('diverging-timeline-down', down));
        return column;
      }));
      linesBox.replaceChildren(buildSpan('diverging-timeline-center'), ...referenceLines.map(({ side, value, label }) => {
        const line = buildSpan(`diverging-timeline-reference ${side}`);
        line.style.top = `${side === 'up' ? upHeight - value * pxPerUnit : upHeight + value * pxPerUnit}px`;
        line.append(buildSpan('diverging-timeline-reference-label', label));
        return line;
      }));
      windowsBox.replaceChildren(...windows.map(({ key, first, last, emphasis }) => {
        const wash = buildSpan(`diverging-timeline-wash${emphasis ? ' emphasis' : ''}`);
        wash.dataset.key = key;
        Object.assign(wash.style, { left: getLeft(first), width: getWidth(first, last) });
        return wash;
      }));
      bracketsBox.replaceChildren(...windows.map(({ key, first, last, label, details, emphasis }) => {
        const bracket = buildSpan(`diverging-timeline-bracket${emphasis ? ' emphasis' : ''}`);
        bracket.dataset.key = key;
        bracket.dataset.label = details;
        Object.assign(bracket.style, { left: getLeft(first), width: getWidth(first, last) });
        bracket.append(buildSpan('diverging-timeline-bracket-label', label));
        return bracket;
      }));
      ticksBox.replaceChildren(...[
        { index: 0, label: startLabel, edge: 'start' },
        ...ticks,
        ...(periodCount > 1 ? [{ index: periodCount - 1, label: endLabel, edge: 'end' }] : []),
      ].filter(({ label }) => label).map(({ index, label, edge }) => {
        const tick = buildSpan(`diverging-timeline-tick${edge ? ` ${edge}` : ''}`, label);
        if (!edge) tick.style.left = getCenter(index);
        return tick;
      }));
      markersBox.replaceChildren(...markers.map(({ index, label, details, emphasis }) => {
        const marker = buildSpan(`diverging-timeline-marker${emphasis ? ' emphasis' : ''}`);
        marker.style.left = getCenter(index);
        marker.dataset.label = details;
        marker.append(buildSpan('diverging-timeline-marker-label', label), buildSpan('diverging-timeline-marker-stem'));
        return marker;
      }));
      legendBox.replaceChildren(...legend.map(({ label, color, hatched, heading }) => {
        if (heading) return buildSpan('diverging-timeline-legend-heading', label);
        const item = buildSpan('diverging-timeline-legend-item');
        const swatch = buildSpan(`diverging-timeline-swatch${hatched ? ' hatched' : ''}`);
        if (color) swatch.style.background = color;
        item.append(swatch, label);
        return item;
      }));
      layoutLabels();
    }

    function layoutLabels () {
      hideCrowdedTicks();
      fitMarkerLabels();
      fitBrackets();
    }

    // Left to right, a marker label takes the first row where it fits; one that fits nowhere is hidden and its marker
    // still shows the events on hover.
    function fitMarkerLabels () {
      const track = markersBox.getBoundingClientRect();
      const rows = [[], []];
      for (const marker of markersBox.querySelectorAll('.diverging-timeline-marker')) {
        const label = marker.querySelector('.diverging-timeline-marker-label');
        label.style.transform = '';
        label.style.visibility = '';
        marker.classList.remove('second-row');
        const box = label.getBoundingClientRect();
        const shift = Math.max(track.left - box.left, 0) + Math.min(track.right - box.right, 0);
        label.style.transform = `translateX(${shift}px)`;
        const span = { left: box.left + shift, right: box.right + shift };
        const row = rows.findIndex((spans) => !spans.some((other) => span.left < other.right + MIN_LABEL_GAP_PX && span.right > other.left - MIN_LABEL_GAP_PX));
        if (row === -1) {
          label.style.visibility = 'hidden';
          continue;
        }
        rows[row].push(span);
        marker.classList.toggle('second-row', row === 1);
      }
    }

    // A bracket's label sits under it, kept inside the track; when two labels would overlap, the later bracket drops a row.
    function fitBrackets () {
      const track = bracketsBox.getBoundingClientRect();
      const placed = [];
      for (const bracket of bracketsBox.querySelectorAll('.diverging-timeline-bracket')) {
        const label = bracket.querySelector('.diverging-timeline-bracket-label');
        label.style.transform = 'translateX(-50%)';
        bracket.classList.remove('second-row');
        const box = label.getBoundingClientRect();
        const shift = Math.max(track.left - box.left, 0) + Math.min(track.right - box.right, 0);
        label.style.transform = `translateX(calc(-50% + ${shift}px))`;
        const bracketBox = bracket.getBoundingClientRect();
        const span = { left: Math.min(box.left + shift, bracketBox.left), right: Math.max(box.right + shift, bracketBox.right) };
        const overlaps = placed.some((other) => span.left < other.right + MIN_LABEL_GAP_PX && span.right > other.left - MIN_LABEL_GAP_PX);
        bracket.classList.toggle('second-row', overlaps);
        if (!overlaps) placed.push(span);
      }
      bracketsBox.classList.toggle('two-rows', Boolean(bracketsBox.querySelector('.second-row')));
    }

    function hideCrowdedTicks () {
      const ends = [...ticksBox.querySelectorAll('.diverging-timeline-tick.start, .diverging-timeline-tick.end')].map((end) => end.getBoundingClientRect());
      for (const tick of ticksBox.querySelectorAll('.diverging-timeline-tick:not(.start):not(.end)')) {
        tick.hidden = false;
        const box = tick.getBoundingClientRect();
        tick.hidden = ends.some((end) => box.left < end.right + MIN_LABEL_GAP_PX && box.right > end.left - MIN_LABEL_GAP_PX);
      }
    }
    new ResizeObserver(layoutLabels).observe(ticksBox);

    const getIndexAt = (clientX) => {
      const box = columnsBox.getBoundingClientRect();
      return Math.min(Math.max(Math.floor(((clientX - box.left) / box.width) * periodCount), 0), periodCount - 1);
    };
    function paintDrag (a, b) {
      const first = Math.min(a, b), last = Math.max(a, b);
      dragBox.hidden = false;
      Object.assign(dragBox.style, { left: getLeft(first), width: getWidth(first, last) });
    }
    plot.addEventListener('pointerdown', (event) => {
      if (!periodCount || event.button !== 0) return;
      event.preventDefault();
      plot.setPointerCapture(event.pointerId);
      dragStart = getIndexAt(event.clientX);
      tooltip.hidden = true;
      paintDrag(dragStart, dragStart);
    });
    plot.addEventListener('pointermove', (event) => {
      if (dragStart === null) return;
      paintDrag(dragStart, getIndexAt(event.clientX));
    });
    plot.addEventListener('pointerup', (event) => {
      if (dragStart === null) return;
      const start = dragStart;
      dragStart = null;
      dragBox.hidden = true;
      onDrag(start, getIndexAt(event.clientX));
    });
    plot.addEventListener('pointercancel', () => {
      dragStart = null;
      dragBox.hidden = true;
    });

    container.addEventListener('pointerover', (event) => {
      const target = event.target.closest(HOVER_TARGET_SELECTOR);
      if (!target || dragStart !== null) return;
      markDescribed(target.classList.contains('diverging-timeline-marker') ? target : null);
      tooltip.textContent = target.dataset.label;
      tooltip.hidden = false;
      const box = container.getBoundingClientRect(), targetBox = target.getBoundingClientRect();
      const half = tooltip.offsetWidth / 2;
      const center = Math.min(Math.max(targetBox.left + targetBox.width / 2 - box.left, half), box.width - half);
      tooltip.style.left = `${center}px`;
      const anchorTop = target.classList.contains('diverging-timeline-column') ? plot.getBoundingClientRect().top : targetBox.top;
      tooltip.style.top = `${anchorTop - box.top - tooltip.offsetHeight - 8}px`;
    });
    container.addEventListener('pointerout', (event) => {
      if (event.target.closest(HOVER_TARGET_SELECTOR) && !event.relatedTarget?.closest(HOVER_TARGET_SELECTOR)) {
        tooltip.hidden = true;
        markDescribed(null);
      }
    });

    // The hovered marker is lit, so the tooltip's marker is the one that stands out.
    function markDescribed (marker) {
      for (const element of markersBox.querySelectorAll('.diverging-timeline-marker')) element.classList.toggle('described', element === marker);
    }

    return { paint };
  }

  return { mount };
})();
