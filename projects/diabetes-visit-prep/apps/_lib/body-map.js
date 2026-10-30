// The body map view: silhouette, organ shapes, pulse rings and callouts. It draws what it is told and
// knows nothing about queries or clinical rules. Classic script (the app frame blocks ES modules).
window.VisitPrep = window.VisitPrep || {};
VisitPrep.bodyMap = (() => {
  const ORGANS = [
    { id: 'eyes', name: 'Eyes', left: 0, top: 18 },
    { id: 'glucose', name: 'Glucose · pancreas', left: 0, top: 186 },
    { id: 'feet', name: 'Feet & nerves', left: 0, top: 544 },
    { id: 'heart', name: 'Heart & vessels', left: 480, top: 104 },
    { id: 'kidneys', name: 'Kidneys', left: 480, top: 268 },
  ];
  const HATCH_FILL = 'url(#hm-hatch)';
  const CANVAS_WIDTH = 680, CANVAS_HEIGHT = 660;
  // Below this the callout text is too small to read, so the narrow layout takes over.
  const MIN_SCALE = 0.6;
  const SILHOUETTE_VIEWBOX = '226 0 228 660';

  const SILHOUETTE = `
    <svg viewBox="0 0 680 660" width="680" height="660" role="img" aria-label="Body silhouette with organs colored by status">
      <defs>
        <pattern id="hm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--hatch-ground)"></rect>
          <rect width="2" height="5" fill="var(--hatch-stripe)"></rect>
        </pattern>
      </defs>
      <g class="leaders" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="2 3">
        <line data-organ="eyes" x1="200" y1="64" x2="320" y2="64"></line>
        <line data-organ="glucose" x1="200" y1="232" x2="314" y2="228"></line>
        <line data-organ="feet" x1="200" y1="602" x2="300" y2="630"></line>
        <line data-organ="heart" x1="480" y1="150" x2="364" y2="168"></line>
        <line data-organ="kidneys" x1="480" y1="314" x2="380" y2="270"></line>
      </g>
      <g class="leader-ends" fill="var(--line-strong)"></g>
      <g class="silhouette" transform="translate(190 4)">
        <g fill="var(--body)">
          <ellipse cx="150" cy="64" rx="30" ry="36"></ellipse>
          <rect x="139" y="94" width="22" height="26" rx="8"></rect>
          <path d="M100,128 C100,116 122,112 150,112 C178,112 200,116 200,128 L194,250 C192,282 198,302 202,330 C204,352 196,368 180,372 L120,372 C104,368 96,352 98,330 C102,302 108,282 106,250 Z"></path>
          <rect x="72" y="124" width="26" height="148" rx="13" transform="rotate(10 85 124)"></rect>
          <rect x="47" y="262" width="24" height="128" rx="12" transform="rotate(4 59 262)"></rect>
          <ellipse cx="50" cy="404" rx="11" ry="15"></ellipse>
          <rect x="202" y="124" width="26" height="148" rx="13" transform="rotate(-10 215 124)"></rect>
          <rect x="229" y="262" width="24" height="128" rx="12" transform="rotate(-4 241 262)"></rect>
          <ellipse cx="250" cy="404" rx="11" ry="15"></ellipse>
          <rect x="110" y="352" width="38" height="150" rx="19"></rect>
          <rect x="152" y="352" width="38" height="150" rx="19"></rect>
          <rect x="114" y="492" width="32" height="128" rx="16"></rect>
          <rect x="154" y="492" width="32" height="128" rx="16"></rect>
        </g>
        <g fill="none" stroke-width="2">
          <circle class="ring" data-organ="eyes" cx="150" cy="60" r="26"></circle>
          <circle class="ring" data-organ="heart" cx="160" cy="166" r="26"></circle>
          <circle class="ring" data-organ="glucose" cx="154" cy="225" r="36"></circle>
          <circle class="ring" data-organ="kidneys" cx="150" cy="262" r="44"></circle>
          <circle class="ring" data-organ="feet" cx="150" cy="628" r="38"></circle>
        </g>
        <g stroke="var(--ink)" stroke-width="0">
          <ellipse class="organ" data-organ="eyes" cx="138" cy="60" rx="6.5" ry="4"></ellipse>
          <ellipse class="organ" data-organ="eyes" cx="162" cy="60" rx="6.5" ry="4"></ellipse>
          <path class="organ" data-organ="heart" d="M160,158 C156,150 144,150 144,160 C144,170 156,178 160,184 C164,178 176,170 176,160 C176,150 164,150 160,158 Z"></path>
          <ellipse class="organ" data-organ="kidneys" cx="122" cy="262" rx="9" ry="15" transform="rotate(-12 122 262)"></ellipse>
          <ellipse class="organ" data-organ="kidneys" cx="178" cy="262" rx="9" ry="15" transform="rotate(12 178 262)"></ellipse>
          <path class="organ" data-organ="glucose" d="M126,224 C136,214 168,214 182,220 C188,224 182,232 170,232 C156,232 142,236 132,235 C124,234 121,229 126,224 Z"></path>
          <ellipse class="organ" data-organ="feet" cx="128" cy="628" rx="20" ry="9"></ellipse>
          <ellipse class="organ" data-organ="feet" cx="172" cy="628" rx="20" ry="9"></ellipse>
        </g>
      </g>
    </svg>`;

  function buildCallout (organ) {
    const callout = document.createElement('button');
    callout.type = 'button';
    callout.className = 'callout';
    callout.style.left = `${organ.left}px`;
    callout.style.top = `${organ.top}px`;
    callout.dataset.organ = organ.id;
    callout.innerHTML = `<span class="callout-name"><span class="callout-dot"></span></span>
      <span class="callout-value"></span><span class="callout-sub"></span>
      <span class="callout-foot"><span class="callout-status"></span><span class="callout-more" aria-hidden="true"></span></span>`;
    callout.querySelector('.callout-name').append(organ.name);
    return callout;
  }

  // Draws the body into an empty element, scaled to the element's width: the 3D figure (body-3d.js) where WebGL, three.js
  // and the anatomy model are there, else the SVG silhouette, with a note when only WebGL is missing. Returns
  // paintOrgan(organId, look) for redrawing one organ and selectOrgan(organId) for marking the selected one; clicking a
  // callout or an organ calls onOrganClick(organId).
  function mount (stage, { onOrganClick, figureScripts }) {
    stage.classList.add('body-map-stage');
    const canvas = Object.assign(document.createElement('div'), { className: 'body-map-canvas', innerHTML: SILHOUETTE });
    const callouts = Object.fromEntries(ORGANS.map((organ) => [organ.id, buildCallout(organ)]));
    // Top to bottom, so the narrow layout's column and the tab order follow the body.
    canvas.append(...ORGANS.toSorted((a, b) => a.top - b.top).map((organ) => callouts[organ.id]));
    stage.append(canvas);
    for (const [organId, callout] of Object.entries(callouts)) callout.addEventListener('click', () => onOrganClick(organId));
    for (const shape of stage.querySelectorAll('.organ')) shape.addEventListener('click', () => onOrganClick(shape.dataset.organ));
    const svg = canvas.querySelector('svg');
    // three.js and the anatomy model load async (figureScripts); until both have, or if either never does, the
    // silhouette stands in. So does it until setBody names the patient's sex, so no patient is shown the other body first.
    let figure = null;
    const looks = {};
    let selectedOrganId = null;
    let narrow = false;
    let bodySex = null;
    let noWebGLNote = null;
    const upgradeToFigure = () => {
      if (figure || noWebGLNote || !bodySex || !VisitPrep.body3d.isReady()) return;
      if (!VisitPrep.body3d.hasWebGL()) {
        noWebGLNote = Object.assign(document.createElement('p'), { className: 'body-map-no-webgl',
          textContent: "Couldn't draw the 3D body because WebGL isn't available in this browser. Turn on WebGL to see it." });
        stage.after(noWebGLNote);
        return;
      }
      figure = mountFigure();
      figure.setNarrow(narrow);
      for (const [organId, look] of Object.entries(looks)) figure.paintOrgan(organId, look);
      if (selectedOrganId) figure.selectOrgan(selectedOrganId);
    };
    upgradeToFigure();
    for (const script of figureScripts) script.addEventListener('load', upgradeToFigure);

    // The 3D figure replaces the silhouette; the SVG keeps the leaders, which follow the organs as the body turns.
    function mountFigure () {
      svg.querySelector('.silhouette').remove();
      stage.classList.add('has-figure');
      const leaders = Object.fromEntries([...svg.querySelectorAll('.leaders line')].map((line) => [line.dataset.organ, line]));
      const leaderEnds = svg.querySelector('.leader-ends');
      const ends = Object.fromEntries(Object.keys(leaders).map((organId) => {
        const end = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        end.setAttribute('r', 2.5);
        leaderEnds.append(end);
        return [organId, end];
      }));
      const highlightCallout = (organId) => {
        for (const [id, callout] of Object.entries(callouts)) callout.classList.toggle('organ-hovered', id === organId);
      };
      const mounted = VisitPrep.body3d.mount(canvas, {
        sex: bodySex,
        onOrganClick,
        onOrganHover: highlightCallout,
        onProject (positions) {
          for (const organ of ORGANS) {
            const callout = callouts[organ.id], { x, y } = positions[organ.id];
            const onLeft = organ.left < CANVAS_WIDTH / 2;
            leaders[organ.id].setAttribute('x1', onLeft ? organ.left + callout.offsetWidth : organ.left);
            leaders[organ.id].setAttribute('y1', organ.top + callout.offsetHeight / 2);
            leaders[organ.id].setAttribute('x2', x);
            leaders[organ.id].setAttribute('y2', y);
            ends[organ.id].setAttribute('cx', x);
            ends[organ.id].setAttribute('cy', y);
          }
        },
      });
      for (const [organId, callout] of Object.entries(callouts)) {
        callout.addEventListener('pointerenter', () => mounted.highlightOrgan(organId));
        callout.addEventListener('pointerleave', () => mounted.highlightOrgan(null));
      }
      // The anatomy models' licences ask for these credits wherever they are shown.
      const credit = Object.assign(document.createElement('p'), { className: 'body-map-credit', textContent: '3D anatomy: ' });
      VisitPrep.bodyModel.credits.forEach(({ text, href }, i) => credit.append(i ? '; ' : '',
        Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener', textContent: text })));
      stage.closest('section').append(credit);
      return mounted;
    }
    // After the organs' fill transition, so the picture gets the colors they end on.
    let pinTimer = null;
    const pinSoon = () => {
      clearTimeout(pinTimer);
      pinTimer = setTimeout(() => VisitPrep.svgPaint.pin(stage), 300);
    };
    const fitToStage = () => {
      const scale = Math.min(1, stage.clientWidth / CANVAS_WIDTH);
      narrow = scale < MIN_SCALE;
      stage.classList.toggle('narrow', narrow);
      figure?.setNarrow(narrow);
      svg.setAttribute('viewBox', narrow ? SILHOUETTE_VIEWBOX : `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
      canvas.style.transform = narrow ? '' : `translateX(-50%) scale(${scale})`;
      stage.style.height = narrow ? '' : `${CANVAS_HEIGHT * scale}px`;
      pinSoon();
    };
    // Once now, so the first frame is laid out for this width rather than the observer's next pass.
    fitToStage();
    new ResizeObserver(fitToStage).observe(stage);

    // value, sub and statusLabel are text or a node. metrics names the governed metric behind each callout line
    // ({ value, sub, status }), written as data-metric.
    function paintOrgan (organId, { fill, dotColor, value, sub, statusLabel, pulse = false, metrics = {} }) {
      looks[organId] = { fill, pulse, noRecord: fill === HATCH_FILL };
      if (figure) {
        figure.paintOrgan(organId, looks[organId]);
      } else {
        for (const shape of stage.querySelectorAll(`.organ[data-organ="${organId}"]`)) shape.setAttribute('fill', fill);
        const ring = stage.querySelector(`.ring[data-organ="${organId}"]`);
        ring.setAttribute('stroke', fill);
        ring.classList.toggle('on', pulse);
      }
      const callout = callouts[organId];
      callout.querySelector('.callout-dot').style.background = dotColor;
      for (const [line, text] of Object.entries({ value, sub, status: statusLabel })) {
        const element = callout.querySelector(`.callout-${line}`);
        element.replaceChildren(text);
        if (metrics[line]) element.dataset.metric = metrics[line];
        else delete element.dataset.metric;
      }
      pinSoon();
    }
    function selectOrgan (organId) {
      for (const [id, callout] of Object.entries(callouts)) {
        callout.setAttribute('aria-pressed', String(id === organId));
        callout.querySelector('.callout-more').textContent = id === organId ? 'Showing details' : 'Details ›';
      }
      for (const shape of stage.querySelectorAll('.organ')) shape.setAttribute('stroke-width', shape.dataset.organ === organId ? 2 : 0);
      selectedOrganId = organId;
      figure?.selectOrgan(organId);
      pinSoon();
    }
    // recentEvents: { days: [{ day, labels, details }], arrived }, newest day first. Details (the record's own words) show
    // for the newest day only; arrived marks a day the time-lapse just moved onto; null hides the list.
    const eventList = Object.assign(document.createElement('div'), { className: 'body-map-events' });
    eventList.setAttribute('aria-hidden', 'true');
    canvas.append(eventList);
    function showRecentEvents (recentEvents) {
      eventList.classList.toggle('shown', Boolean(recentEvents?.days.length));
      if (!recentEvents?.days.length) return;
      eventList.replaceChildren(Object.assign(document.createElement('span'), { className: 'body-map-events-head', textContent: 'Recent changes' }),
        ...recentEvents.days.map(({ day, labels, details }, i) => {
          const row = Object.assign(document.createElement('div'), { className: 'body-map-event' });
          row.classList.toggle('newest', i === 0);
          row.classList.toggle('arrived', i === 0 && recentEvents.arrived);
          row.append(Object.assign(document.createElement('span'), { className: 'body-map-event-day', textContent: day }),
            Object.assign(document.createElement('span'), { className: 'body-map-event-label', textContent: labels.join(' · ') }));
          if (i === 0 && details) row.append(Object.assign(document.createElement('span'), { className: 'body-map-event-details', textContent: details }));
          return row;
        }));
    }
    // Shows the patient's body, 'male' or 'female' (the 3D figure only; the silhouette has one body).
    function setBody (sex) {
      bodySex = sex;
      if (figure) figure.setBody(sex);
      else upgradeToFigure();
    }
    return { paintOrgan, selectOrgan, showRecentEvents, setBody };
  }

  return { ORGANS, HATCH_FILL, mount };
})();
