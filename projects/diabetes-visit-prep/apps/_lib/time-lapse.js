// The time-lapse view: play and range controls, event markers, one status lane per organ, a playhead, labelled guides
// through the lanes, a scrubber and date ticks. It draws the cells it is given and reports where the playhead
// moved and which range was picked; it knows nothing
// about queries or clinical rules. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.timeLapse = (() => {
  const MIN_TICK_GAP_PX = 8;
  const MIN_MARKER_LABEL_GAP_PX = 8;
  const MIN_STEM_GAP_PX = 4;
  // The marker pointer's width in time-lapse.css (two 5px borders).
  const MARKER_POINTER_WIDTH_PX = 10;
  const FRAME_TARGET_SELECTOR = '.time-lapse-cell, .time-lapse-marker';
  const TOOLTIP_TARGET_SELECTOR = `${FRAME_TARGET_SELECTOR}, .time-lapse-range[aria-disabled="true"], .time-lapse-guide-label`;
  const MIN_GUIDE_LABEL_GAP_PX = 8;
  // A play runs the whole range in about this long, whatever its frame count, but never faster than one frame per MIN_PLAY_STEP_MS.
  const PLAY_DURATION_MS = 7000;
  const MIN_PLAY_STEP_MS = 25;
  const PLAY_ICON = '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5 L12.5 7 L3 12.5 Z" fill="currentColor"/></svg>';
  const PAUSE_ICON = '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>';

  function mount (container, { onFrameSelect, onRangeSelect, floatOver }) {
    container.classList.add('time-lapse');
    container.innerHTML = `
      <div class="time-lapse-controls">
        <div class="time-lapse-ranges" role="group" aria-label="Time range"></div>
        <span class="time-lapse-cell-caption"></span>
      </div>
      <div class="time-lapse-grid">
        <span></span><div class="time-lapse-markers"></div>
        <div class="time-lapse-lanes"></div>
        <span></span><div class="time-lapse-guide-labels"></div>
        <button class="time-lapse-play" type="button" aria-keyshortcuts="Space" disabled></button>
        <input class="time-lapse-scrubber" type="range" min="0" max="0" step="1" value="0">
        <span></span><div class="time-lapse-ticks"></div>
      </div>
      <div class="time-lapse-tooltip" role="tooltip" hidden></div>
      <div class="time-lapse-floating" hidden>
        <button class="time-lapse-play" type="button" disabled></button>
        <input class="time-lapse-scrubber" type="range" min="0" max="0" step="1" value="0">
        <span class="time-lapse-floating-label"></span>
      </div>`;
    const playButton = container.querySelector('.time-lapse-grid .time-lapse-play');
    const rangesBox = container.querySelector('.time-lapse-ranges');
    const cellCaptionBox = container.querySelector('.time-lapse-cell-caption');
    const markersBox = container.querySelector('.time-lapse-markers');
    const lanesBox = container.querySelector('.time-lapse-lanes');
    const scrubber = container.querySelector('.time-lapse-grid .time-lapse-scrubber');
    const floatingPlayer = container.querySelector('.time-lapse-floating');
    const floatingPlayButton = floatingPlayer.querySelector('.time-lapse-play');
    const floatingScrubber = floatingPlayer.querySelector('.time-lapse-scrubber');
    const floatingFrameLabel = floatingPlayer.querySelector('.time-lapse-floating-label');
    const ticksBox = container.querySelector('.time-lapse-ticks');
    const guideLabelsBox = container.querySelector('.time-lapse-guide-labels');
    const tooltip = container.querySelector('.time-lapse-tooltip');
    let frameLabels = [];
    let selectedIndex = 0;
    let playTimer = null;

    const getFrameLeft = (index) => `${((index + 0.5) / frameLabels.length) * 100}%`;

    // ranges: { key, label, unavailableReason } per chip; a chip with a reason can't be picked and shows the reason on hover.
    function paintRanges (ranges, selectedKey) {
      rangesBox.replaceChildren(...ranges.map(({ key, label, unavailableReason }) => {
        const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'time-lapse-range', textContent: label });
        chip.dataset.key = key;
        chip.setAttribute('aria-pressed', String(key === selectedKey));
        if (unavailableReason) {
          chip.setAttribute('aria-disabled', 'true');
          chip.dataset.label = unavailableReason;
        }
        return chip;
      }));
    }

    // frameLabels: one per frame (tooltip, screen readers). scrubberLabel names the scrubber ("Day", "Week"); cellCaption
    // says what one cell stands for. ticks: month ticks { index, label }; the two ends get their own labels.
    // markers: { index, label, details, priority } per frame with events; details is the hover text. When labels crowd,
    // a lower priority number gets its label placed first. guides: { index, label, details } per guide through the lanes at
    // the start of frame index, labelled under them; details is the label's hover text. loading: the lanes (named, no
    // cells yet), the cell caption and the end ticks show as grey bars in their final places.
    function paintLanes ({ loading = false, lanes, frameLabels: labels, scrubberLabel = '', cellCaption = '', ticks, startLabel, endLabel, markers, guides }) {
      stopPlaying();
      container.classList.toggle('loading', loading);
      frameLabels = labels;
      for (const input of [scrubber, floatingScrubber]) input.setAttribute('aria-label', scrubberLabel);
      cellCaptionBox.textContent = cellCaption;
      playButton.disabled = floatingPlayButton.disabled = labels.length < 2;
      markersBox.replaceChildren(...markers.map(({ index, label, details, priority }) => {
        const marker = Object.assign(document.createElement('span'), { className: 'time-lapse-marker' });
        marker.style.left = getFrameLeft(index);
        marker.dataset.index = index;
        marker.dataset.priority = priority;
        marker.dataset.ownLabel = label;
        marker.dataset.ownTooltip = `${label} · ${labels[index]}\n${details}`;
        marker.append(Object.assign(document.createElement('span'), { className: 'time-lapse-marker-label', textContent: label }),
          Object.assign(document.createElement('span'), { className: 'time-lapse-marker-stem' }),
          Object.assign(document.createElement('span'), { className: 'time-lapse-marker-pointer' }));
        return marker;
      }));
      lanesBox.replaceChildren(...lanes.flatMap((lane) => {
        const name = Object.assign(document.createElement('span'), { className: 'time-lapse-lane-name', textContent: lane.name });
        const strip = Object.assign(document.createElement('div'), { className: 'time-lapse-lane' });
        strip.classList.toggle('dense', lane.cells.length > 120);
        strip.append(...lane.cells.map(({ fill, label }, index) => {
          const cell = Object.assign(document.createElement('span'), { className: 'time-lapse-cell' });
          cell.style.background = fill;
          cell.dataset.index = index;
          cell.dataset.label = `${labels[index]} · ${label}`;
          return cell;
        }), ...markers.map(({ index }) => {
          const guide = Object.assign(document.createElement('span'), { className: 'time-lapse-event-guide' });
          guide.style.left = getFrameLeft(index);
          guide.dataset.index = index;
          return guide;
        }), ...guides.map(({ index }) => buildGuide(index)), Object.assign(document.createElement('span'), { className: 'time-lapse-playhead' }));
        return [name, strip];
      }));
      scrubber.max = floatingScrubber.max = Math.max(labels.length - 1, 0);
      // As wide as the longest label, so the centred pill keeps its width while it plays.
      floatingFrameLabel.style.minWidth = `${Math.max(0, ...labels.map((label) => label.length))}ch`;
      paintFloatingPlayer();
      ticksBox.replaceChildren(...[
        { index: 0, label: startLabel, edge: 'start' },
        ...ticks,
        // A single frame is both ends: label it once.
        ...(labels.length > 1 ? [{ index: labels.length - 1, label: endLabel, edge: 'end' }] : []),
      ].filter(({ label }) => label).map(({ index, label, edge }) => {
        const tick = Object.assign(document.createElement('span'), { className: `time-lapse-tick${edge ? ` ${edge}` : ''}`, textContent: label });
        if (!edge) tick.style.left = getFrameLeft(index);
        return tick;
      }));
      guideLabelsBox.replaceChildren(...[...guides].sort((a, b) => a.index - b.index).map(({ index, label, details }) => {
        const guideLabel = Object.assign(document.createElement('span'), { className: 'time-lapse-guide-label', textContent: label });
        guideLabel.dataset.guideLeft = getGuideLeft(index);
        guideLabel.dataset.label = details;
        return guideLabel;
      }));
      layoutLabels();
    }

    const getGuideLeft = (index) => `${(index / frameLabels.length) * 100}%`;

    function buildGuide (index) {
      const guide = Object.assign(document.createElement('span'), { className: 'time-lapse-guide' });
      guide.style.left = getGuideLeft(index);
      return guide;
    }

    function fitGuideLabels () {
      let roomEnd = guideLabelsBox.clientWidth;
      for (const label of [...guideLabelsBox.children].reverse()) {
        label.style.left = label.dataset.guideLeft;
        const left = Math.max(Math.min(label.offsetLeft - label.offsetWidth / 2, roomEnd - label.offsetWidth), 0);
        label.style.left = `${left}px`;
        roomEnd = left - MIN_GUIDE_LABEL_GAP_PX;
      }
    }

    function layoutLabels () {
      fitGuideLabels();
      hideCrowdedTicks();
      mergeOverlappingMarkers();
      fitMarkerLabels();
    }

    // Markers whose pointers would overlap are drawn as one: the first shows "label +n" and its hover lists every event.
    function mergeOverlappingMarkers () {
      const getPointerX = (marker) => ((Number(marker.dataset.index) + 0.5) / frameLabels.length) * markersBox.clientWidth;
      const groups = [];
      for (const marker of markersBox.querySelectorAll('.time-lapse-marker')) {
        const group = groups.at(-1);
        if (group && getPointerX(marker) - getPointerX(group[0]) < MARKER_POINTER_WIDTH_PX) group.push(marker);
        else groups.push([marker]);
      }
      for (const [lead, ...merged] of groups) {
        lead.hidden = false;
        lead.dataset.groupPriority = Math.min(...[lead, ...merged].map((marker) => Number(marker.dataset.priority)));
        lead.querySelector('.time-lapse-marker-label').textContent = merged.length ? `${lead.dataset.ownLabel} +${merged.length}` : lead.dataset.ownLabel;
        lead.dataset.label = [lead, ...merged].map((marker) => marker.dataset.ownTooltip).join('\n\n');
        for (const marker of merged) marker.hidden = true;
      }
      for (const guide of container.querySelectorAll('.time-lapse-event-guide')) {
        guide.hidden = markersBox.querySelector(`.time-lapse-marker[data-index="${guide.dataset.index}"]`).hidden;
      }
    }

    // Labels are placed by priority, then left to right, on the first row with room; a second-row stem must clear the
    // first row's labels. A label that fits nowhere is hidden, and its marker still shows the events on hover.
    function fitMarkerLabels () {
      const track = markersBox.getBoundingClientRect();
      const firstRowLabels = [];
      const secondRowLabels = [];
      const secondRowStems = [];
      const overlaps = (spans, left, right, gap) => spans.some((span) => left < span.right + gap && right > span.left - gap);
      const markers = [...markersBox.querySelectorAll('.time-lapse-marker:not([hidden])')]
        .sort((a, b) => Number(a.dataset.groupPriority) - Number(b.dataset.groupPriority) || Number(a.dataset.index) - Number(b.dataset.index));
      for (const marker of markers) {
        const label = marker.querySelector('.time-lapse-marker-label');
        label.style.transform = '';
        label.style.visibility = '';
        marker.classList.remove('second-row');
        const box = label.getBoundingClientRect();
        const shift = Math.max(track.left - box.left, 0) + Math.min(track.right - box.right, 0);
        label.style.transform = `translateX(${shift}px)`;
        const span = { left: box.left + shift, right: box.right + shift };
        const stemX = marker.getBoundingClientRect().left + marker.offsetWidth / 2;
        const stemSpans = secondRowStems.map((x) => ({ left: x, right: x }));
        if (!overlaps(firstRowLabels, span.left, span.right, MIN_MARKER_LABEL_GAP_PX) && !overlaps(stemSpans, span.left, span.right, MIN_STEM_GAP_PX)) {
          firstRowLabels.push(span);
        } else if (!overlaps(secondRowLabels, span.left, span.right, MIN_MARKER_LABEL_GAP_PX) && !overlaps(firstRowLabels, stemX, stemX, MIN_STEM_GAP_PX)) {
          secondRowLabels.push(span);
          secondRowStems.push(stemX);
          marker.classList.add('second-row');
        } else {
          label.style.visibility = 'hidden';
        }
      }
    }

    function hideCrowdedTicks () {
      const ends = [...ticksBox.querySelectorAll('.time-lapse-tick.start, .time-lapse-tick.end')].map((end) => end.getBoundingClientRect());
      const monthTicks = [...ticksBox.querySelectorAll('.time-lapse-tick:not(.start):not(.end)')];
      for (const tick of monthTicks) tick.hidden = false;
      for (const tick of monthTicks) {
        const box = tick.getBoundingClientRect();
        tick.hidden = ends.some((end) => box.left < end.right + MIN_TICK_GAP_PX && box.right > end.left - MIN_TICK_GAP_PX);
      }
    }
    new ResizeObserver(layoutLabels).observe(ticksBox);

    function selectFrame (index) {
      selectedIndex = Math.min(Math.max(index, 0), frameLabels.length - 1);
      const frameLabel = frameLabels[selectedIndex] ?? '';
      for (const input of [scrubber, floatingScrubber]) {
        input.value = selectedIndex;
        input.setAttribute('aria-valuetext', frameLabel);
      }
      floatingFrameLabel.textContent = frameLabel;
      for (const playhead of container.querySelectorAll('.time-lapse-playhead')) playhead.style.left = getFrameLeft(selectedIndex);
      for (const cell of container.querySelectorAll('.time-lapse-cell')) cell.classList.toggle('ahead', Number(cell.dataset.index) > selectedIndex);
      // The playhead shows only away from the newest frame, the default.
      container.classList.toggle('at-newest-frame', selectedIndex === frameLabels.length - 1);
    }

    function selectFrameAndNotify (index) {
      selectFrame(index);
      onFrameSelect(selectedIndex);
    }

    function paintPlayButton () {
      const isPlaying = playTimer !== null;
      for (const button of [playButton, floatingPlayButton]) {
        button.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
        button.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      }
    }

    function stopPlaying () {
      clearInterval(playTimer);
      playTimer = null;
      paintPlayButton();
    }

    function startPlaying () {
      if (selectedIndex >= frameLabels.length - 1) selectFrameAndNotify(0);
      playTimer = setInterval(() => {
        selectFrameAndNotify(selectedIndex + 1);
        if (selectedIndex >= frameLabels.length - 1) stopPlaying();
      }, Math.max(MIN_PLAY_STEP_MS, Math.round(PLAY_DURATION_MS / frameLabels.length)));
      paintPlayButton();
    }

    function togglePlaying () {
      if (playButton.disabled) return;
      if (playTimer === null) startPlaying();
      else stopPlaying();
    }

    for (const button of [playButton, floatingPlayButton]) button.addEventListener('click', togglePlaying);
    // Space plays and pauses while the time-lapse is on screen, except in a text field and on a button or select the
    // keyboard focused, where it presses or opens. A click leaves focus on the control it hit, and Space should still play.
    let isFocusFromPointer = false;
    document.addEventListener('pointerdown', () => { isFocusFromPointer = true; }, true);
    document.addEventListener('keydown', (event) => { if (event.key === 'Tab') isFocusFromPointer = false; }, true);
    let isSpaceUsedForPlay = false;
    document.addEventListener('keydown', (event) => {
      if (event.key !== ' ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !container.checkVisibility()) return;
      if (event.target.closest('textarea, [contenteditable], input:not([type="range"])')) return;
      if (!isFocusFromPointer && event.target.closest('button, select')) return;
      event.preventDefault();
      isSpaceUsedForPlay = true;
      togglePlaying();
    });
    // A button acts on Space's keyup, so that is held back too.
    document.addEventListener('keyup', (event) => {
      if (event.key !== ' ' || !isSpaceUsedForPlay) return;
      isSpaceUsedForPlay = false;
      event.preventDefault();
    });
    rangesBox.addEventListener('click', (event) => {
      const chip = event.target.closest('.time-lapse-range');
      if (!chip || chip.getAttribute('aria-disabled') === 'true' || chip.getAttribute('aria-pressed') === 'true') return;
      stopPlaying();
      onRangeSelect(chip.dataset.key);
    });
    for (const input of [scrubber, floatingScrubber]) {
      input.addEventListener('input', () => {
        stopPlaying();
        selectFrameAndNotify(Number(input.value));
      });
    }

    // A small copy of the play button and scrubber, for when floatOver is on screen but the scrubber is below the window.
    function paintFloatingPlayer () {
      const box = floatOver.getBoundingClientRect();
      const isShown = !container.classList.contains('loading') && container.checkVisibility()
        && box.top < innerHeight && scrubber.getBoundingClientRect().bottom > innerHeight;
      floatingPlayer.hidden = !isShown;
      if (!isShown) return;
      Object.assign(floatingPlayer.style, { left: `${box.left + box.width / 2}px`, maxWidth: `${box.width - 24}px` });
    }
    addEventListener('scroll', paintFloatingPlayer, { passive: true });
    addEventListener('resize', paintFloatingPlayer);
    new ResizeObserver(paintFloatingPlayer).observe(floatOver);
    container.addEventListener('click', (event) => {
      const target = event.target.closest(FRAME_TARGET_SELECTOR);
      if (!target) return;
      stopPlaying();
      selectFrameAndNotify(Number(target.dataset.index));
    });
    container.addEventListener('pointerover', (event) => {
      const target = event.target.closest(TOOLTIP_TARGET_SELECTOR);
      if (!target) return;
      markDescribed(target.classList.contains('time-lapse-marker') ? target : null);
      tooltip.textContent = target.dataset.label;
      tooltip.hidden = false;
      // A marker's anchor is its pointer: its label may be shifted or hidden.
      const anchor = target.querySelector('.time-lapse-marker-pointer') ?? target;
      const box = container.getBoundingClientRect(), targetBox = target.getBoundingClientRect(), anchorBox = anchor.getBoundingClientRect();
      const half = tooltip.offsetWidth / 2;
      const anchorX = anchorBox.left + anchorBox.width / 2 - box.left;
      const center = Math.min(Math.max(anchorX, half), box.width - half);
      tooltip.style.left = `${center}px`;
      tooltip.style.top = `${targetBox.top - box.top - tooltip.offsetHeight - 8}px`;
      tooltip.style.setProperty('--arrow-left', `${anchorX - center + half}px`);
    });
    container.addEventListener('pointerout', (event) => {
      if (event.target.closest(TOOLTIP_TARGET_SELECTOR) && !event.relatedTarget?.closest(TOOLTIP_TARGET_SELECTOR)) {
        tooltip.hidden = true;
        markDescribed(null);
      }
    });

    // The hovered marker and its guide through the lanes, so the tooltip's marker is the one that is lit.
    function markDescribed (marker) {
      for (const element of container.querySelectorAll('.time-lapse-marker, .time-lapse-event-guide')) {
        element.classList.toggle('described', marker !== null && element.dataset.index === marker.dataset.index);
      }
    }

    paintPlayButton();
    return { paintRanges, paintLanes, selectFrame, stopPlaying };
  }

  return { mount };
})();
