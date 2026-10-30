// The body map's 3D figure: a glass body, male or female, with the organs inside, from real anatomy models
// (body-model.js, which names its sources and licences), drawn with three.js. It colors, pulses and selects the organs it
// is told to and reports where each organ sits on screen, so the callouts' leaders can follow it as it turns; it knows
// nothing about queries or clinical rules. Classic script; needs window.THREE (three.js r160, loaded from cdnjs) and
// VisitPrep.bodyModel (isReady()) and WebGL (hasWebGL()), else the body map keeps its SVG silhouette.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.body3d = (() => {
  // The scene is in the SVG silhouette's canvas pixels (680 × 660, body centered on x 340) so the callouts keep their
  // places: x from the centre, y up from the canvas's middle row, z toward the viewer.
  const CANVAS_WIDTH = 680, CANVAS_HEIGHT = 660, CENTER_Y = 330;
  // The body spans these canvas rows, as the silhouette does.
  const BODY_TOP = 14, BODY_BOTTOM = 650;
  // The narrow layout shows only the body's column of the canvas.
  const NARROW_WIDTH = 228;
  const FIELD_OF_VIEW = 18;
  const SWAY_RADIANS = 0.42;
  const SWAY_SECONDS = 22;
  const SCAN_SECONDS = 1.6;
  const PULSE_SECONDS = 1.8;
  const COLOR_SECONDS = 0.25;
  const DRAG_PX = 4;
  const RETURN_AFTER_MS = 4000;
  // The layer the seam pass draws: the organs' solid parts only.
  const SEAM_LAYER = 1;

  function decodeBase64 (text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // One body's parts as geometries in scene units, with each organ's leader end. Positions arrive as 16-bit integers
  // over the body's bounds (body-model.js), in metres, y up, the body facing +z; each body fills the canvas's height.
  function buildBody ({ min, max, parts }) {
    const scale = (BODY_BOTTOM - BODY_TOP) / (max[1] - min[1]);
    const middle = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
    const toScene = ([x, y, z]) => [(x - middle[0]) * scale, CENTER_Y - BODY_TOP - (max[1] - y) * scale, (z - middle[2]) * scale];
    return {
      parts: parts.map(({ organ, kind, positions, indices, wideIndices, anchor }) => {
        const quantized = new Int16Array(decodeBase64(positions));
        const scenePositions = new Float32Array(quantized.length);
        for (let i = 0; i < quantized.length; i += 3) {
          const point = [0, 1, 2].map((a) => min[a] + ((quantized[i + a] + 32767) / 65534) * (max[a] - min[a]));
          scenePositions.set(toScene(point), i);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(scenePositions, 3));
        geometry.setIndex(new THREE.BufferAttribute(wideIndices ? new Uint32Array(decodeBase64(indices)) : new Uint16Array(decodeBase64(indices)), 1));
        geometry.computeVertexNormals();
        return { organ, kind, geometry, anchor: anchor && new THREE.Vector3(...toScene(anchor)) };
      }),
    };
  }

  // --- Materials --------------------------------------------------------------------------------------------------
  // Glass: faint in the middle, strong at the silhouette's edge (Fresnel), with a bright band where the scan line is.
  function buildGlassMaterial () {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        inner: { value: new THREE.Color() }, rim: { value: new THREE.Color() }, scan: { value: new THREE.Color() },
        innerAlpha: { value: 0.1 }, rimAlpha: { value: 0.8 }, scanY: { value: -9999 }, scanStrength: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vView; varying float vY;
        void main () {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-viewPosition.xyz);
          vY = position.y;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        uniform vec3 inner; uniform vec3 rim; uniform vec3 scan;
        uniform float innerAlpha; uniform float rimAlpha; uniform float scanY; uniform float scanStrength;
        varying vec3 vNormal; varying vec3 vView; varying float vY;
        void main () {
          float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
          float band = scanStrength * exp(-pow((vY - scanY) / 7.0, 2.0));
          vec3 color = mix(mix(inner, rim, edge), scan, clamp(band, 0.0, 1.0));
          gl_FragColor = vec4(color, clamp(mix(innerAlpha, rimAlpha, edge) + band * 0.6, 0.0, 1.0));
        }`,
    });
  }

  function buildSpriteTexture (ring) {
    const size = 128;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (ring) {
      gradient.addColorStop(0.72, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.86, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  function isReady () {
    return Boolean(window.THREE && VisitPrep.bodyModel);
  }

  // Whether this browser gives a WebGL context; asked once, as each failed try logs a warning.
  let webGLAvailable = null;
  function hasWebGL () {
    if (webGLAvailable == null) {
      try {
        const canvas = document.createElement('canvas');
        webGLAvailable = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      } catch {
        webGLAvailable = false;
      }
    }
    return webGLAvailable;
  }

  // Reads a CSS color (a var() included) as the browser resolves it on element.
  function resolveColor (probe, css) {
    probe.style.color = '';
    probe.style.color = css;
    return new THREE.Color(getComputedStyle(probe).color);
  }

  // Draws the figure into container (a positioned element), showing the sex ('male' or 'female') body.
  // onOrganClick(organId) on a click; onOrganHover(organId or null) as the pointer moves over organs;
  // onProject({ organId: { x, y } }) after every drawn frame, in canvas pixels.
  // Returns paintOrgan(organId, { fill, pulse, noRecord }) where fill is any CSS color, selectOrgan(organId),
  // highlightOrgan(organId or null), setNarrow(isNarrow) and setBody('male' or 'female').
  function mount (container, { sex, onOrganClick, onOrganHover, onProject }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.className = 'body-3d';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Body with organs colored by status');
    container.append(canvas);
    const probe = Object.assign(document.createElement('span'), { hidden: true });
    container.append(probe);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, CANVAS_WIDTH / CANVAS_HEIGHT, 100, 6000);
    camera.position.set(0, 0, (CANVAS_HEIGHT / 2) / Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW / 2)));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x99aabb, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(300, 500, 900);
    scene.add(keyLight);
    const figure = new THREE.Group();
    scene.add(figure);

    const glass = buildGlassMaterial();
    const buildStartedAt = performance.now();
    const bodies = Object.fromEntries(Object.entries(VisitPrep.bodyModel.bodies).map(([sex, body]) => [sex, buildBody(body)]));

    const glowTexture = buildSpriteTexture(false);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(190, 46), new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, CENTER_Y - BODY_BOTTOM + 2, 0);
    figure.add(shadow);
    const ringTexture = buildSpriteTexture(true);
    const organs = {};
    const bodyMeshes = {}, pickables = {}, anchors = {}, seamMeshes = [];
    // Skin is glass; an organ's solid parts share one material, its vessels or nerves ("line" parts) a fainter one.
    for (const [sex, { parts }] of Object.entries(bodies)) {
      bodyMeshes[sex] = [];
      pickables[sex] = [];
      anchors[sex] = {};
      for (const { organ: organId, kind, geometry, anchor } of parts) {
        if (kind === 'skin') {
          const skin = new THREE.Mesh(geometry, glass);
          skin.renderOrder = 2;
          figure.add(skin);
          bodyMeshes[sex].push(skin);
          continue;
        }
        const organ = organs[organId] ??= addOrgan(organId);
        if (kind === 'line') organ.lineMaterial ??= new THREE.MeshStandardMaterial({ roughness: 0.4, transparent: true, opacity: 0.7, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, kind === 'line' ? organ.lineMaterial : organ.material);
        mesh.userData.organId = organId;
        organ.group.add(mesh);
        bodyMeshes[sex].push(mesh);
        pickables[sex].push(mesh);
        if (kind !== 'line') {
          mesh.layers.enable(SEAM_LAYER);
          seamMeshes.push(mesh);
        }
        if (anchor) anchors[sex][organId] = anchor;
      }
    }
    let shownSex = null;
    // Shows the male or female body; the organs keep their colors, pulses and selection.
    function setBody (sex) {
      if (sex === shownSex || !bodies[sex]) return;
      shownSex = sex;
      for (const [bodySex, meshes] of Object.entries(bodyMeshes)) for (const mesh of meshes) mesh.visible = bodySex === sex;
      for (const [organId, anchor] of Object.entries(anchors[sex])) organs[organId].setAnchor(anchor);
    }
    setBody(sex);

    function addOrgan (organId) {
      const group = new THREE.Group();
      const material = new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, emissiveIntensity: 0.35 });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(70);
      const pulseRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture, transparent: true, depthWrite: false, opacity: 0 }));
      const selectRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture, transparent: true, depthWrite: false, opacity: 0 }));
      selectRing.scale.setScalar(organId === 'kidneys' || organId === 'feet' ? 64 : 54);
      for (const sprite of [glow, pulseRing, selectRing]) sprite.renderOrder = 3;
      group.add(glow, pulseRing, selectRing);
      figure.add(group);
      const color = new THREE.Color(0xc4ccd5);
      const anchorPoint = new THREE.Vector3();
      return {
        group, material, lineMaterial: null, glow, pulseRing, selectRing, anchorPoint,
        setAnchor (point) {
          anchorPoint.copy(point);
          for (const sprite of [glow, pulseRing, selectRing]) sprite.position.copy(point);
        },
        color, fromColor: color.clone(), toColor: color.clone(), colorStartedAt: -Infinity,
        // A color that arrived during a scan waits until the scan line passes the organ.
        waitingColor: null, pulse: false, noRecord: false, selected: false, highlighted: false,
        rippleStartedAt: -Infinity,
      };
    }

    console.debug(`body-3d: model built in ${Math.round(performance.now() - buildStartedAt)} ms`);
    let narrow = false;
    let colors = {};
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const darkScheme = matchMedia('(prefers-color-scheme: dark)');
    function applyTheme () {
      const dark = darkScheme.matches;
      colors = {
        accent: resolveColor(probe, 'var(--accent)'),
        pending: resolveColor(probe, 'var(--organ-pending)'),
      };
      glass.uniforms.inner.value.set(dark ? 0x3a4a5c : 0xe8f1fa);
      glass.uniforms.rim.value.set(dark ? 0x9ec9f0 : 0x2d5f93);
      glass.uniforms.scan.value.copy(colors.accent);
      glass.uniforms.innerAlpha.value = dark ? 0.12 : 0.35;
      glass.uniforms.rimAlpha.value = dark ? 0.85 : 0.9;
      shadow.material.color.set(dark ? 0x000000 : 0x1d3a5c);
      shadow.material.opacity = dark ? 0.5 : 0.22;
      for (const organ of Object.values(organs)) {
        for (const sprite of [organ.glow, organ.pulseRing]) sprite.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        organ.selectRing.material.color.copy(colors.accent);
      }
      for (const [organId, paint] of Object.entries(lastPaints)) paintOrgan(organId, paint, false);
    }
    const lastPaints = {};

    // --- Turning: a slow sway, or the reader's drag ----------------------------------------------------------------
    let yaw = 0, pitch = 0, dragYaw = 0, dragPitch = 0, swayStartedAt = performance.now();
    let pointerDown = null, hoveredOrganId = null, releasedAt = -Infinity;
    const raycaster = new THREE.Raycaster();
    function pickOrganAt (event) {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickables[shownSex], false)[0]?.object.userData.organId ?? null;
    }
    canvas.addEventListener('pointerdown', (event) => {
      pointerDown = { x: event.clientX, y: event.clientY, yaw: dragYaw, pitch: dragPitch, dragging: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (pointerDown) {
        const dx = event.clientX - pointerDown.x, dy = event.clientY - pointerDown.y;
        if (!pointerDown.dragging && Math.hypot(dx, dy) > DRAG_PX) pointerDown.dragging = true;
        if (pointerDown.dragging) {
          dragYaw = pointerDown.yaw + dx * 0.012;
          dragPitch = THREE.MathUtils.clamp(pointerDown.pitch + dy * 0.006, -0.35, 0.35);
          canvas.style.cursor = 'grabbing';
          return;
        }
      }
      const organId = pickOrganAt(event);
      canvas.style.cursor = organId ? 'pointer' : 'grab';
      if (organId !== hoveredOrganId) {
        hoveredOrganId = organId;
        onOrganHover?.(organId);
      }
    });
    canvas.addEventListener('pointerup', (event) => {
      const wasDrag = pointerDown?.dragging;
      pointerDown = null;
      canvas.style.cursor = 'grab';
      if (wasDrag) {
        releasedAt = performance.now();
        return;
      }
      const organId = pickOrganAt(event);
      if (organId) onOrganClick(organId);
    });
    canvas.addEventListener('pointerleave', () => {
      if (hoveredOrganId) onOrganHover?.(null);
      hoveredOrganId = null;
    });

    // --- Scan: a line down the body while statuses load; each organ takes its color as the line passes it ------------
    const SCAN_TOP = CENTER_Y - BODY_TOP + 6, SCAN_BOTTOM = CENTER_Y - BODY_BOTTOM - 6;
    let scanStartedAt = null, lastScanY = null;
    function startScan () {
      if (reducedMotion.matches) return;
      scanStartedAt ??= performance.now();
    }
    function getScanY (now) {
      if (scanStartedAt == null) return null;
      const phase = ((now - scanStartedAt) / 1000 / SCAN_SECONDS) % 1;
      return SCAN_TOP + (SCAN_BOTTOM - SCAN_TOP) * phase;
    }

    function setColor (organ, color, now) {
      organ.fromColor.copy(organ.color);
      organ.toColor.copy(color);
      organ.colorStartedAt = now;
    }

    function paintOrgan (organId, { fill, pulse, noRecord }, remember = true) {
      const organ = organs[organId];
      if (!organ) return;
      if (remember) lastPaints[organId] = { fill, pulse, noRecord };
      const color = noRecord ? colors.pending.clone() : resolveColor(probe, fill);
      const isPending = !noRecord && color.equals(colors.pending);
      const now = performance.now();
      const wasPending = organ.toColor.equals(colors.pending);
      const changed = !organ.toColor.equals(color);
      organ.pulse = pulse && !isPending;
      organ.noRecord = noRecord;
      organ.material.wireframe = noRecord;
      if (isPending) {
        organ.waitingColor = null;
        setColor(organ, color, now);
        startScan();
        return;
      }
      if (scanStartedAt != null && wasPending) {
        organ.waitingColor = color;
        return;
      }
      organ.waitingColor = null;
      setColor(organ, color, now);
      // A status that changes (as the time-lapse plays, or on a scrub) sends one ripple out of the organ.
      if (changed && !wasPending && !reducedMotion.matches) organ.rippleStartedAt = now;
    }

    function selectOrgan (organId) {
      for (const [id, organ] of Object.entries(organs)) organ.selected = id === organId;
    }
    function highlightOrgan (organId) {
      for (const [id, organ] of Object.entries(organs)) organ.highlighted = id === organId;
    }
    function setNarrow (isNarrow) {
      narrow = isNarrow;
      resize();
    }

    function resize () {
      const width = narrow ? NARROW_WIDTH : CANVAS_WIDTH;
      renderer.setSize(width, CANVAS_HEIGHT, false);
      camera.aspect = width / CANVAS_HEIGHT;
      camera.updateProjectionMatrix();
    }

    // --- Seams: a soft shadow on an organ along the edge of another lying in front of it on screen, so two organs of one
    // status color (the pancreas over the kidneys) stay apart as the body turns. Each frame draws the organs' solid parts
    // again into idTarget, an id and a depth per organ, then darkens the pixels of the organ behind at the edge. --------
    const idTarget = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    // Depth across the body only (the camera's distance ± 300), so 8 bits still tell two organs apart.
    const SEAM_NEAREST_DEPTH = camera.position.z - 300, SEAM_DEPTH_RANGE = 600;
    const idMaterials = Object.fromEntries(Object.keys(organs).map((organId, i) => [organId, new THREE.ShaderMaterial({
      uniforms: { id: { value: (i + 1) / 16 } },
      vertexShader: `
        varying float vDepth;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -viewPosition.z;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        uniform float id; varying float vDepth;
        void main() { gl_FragColor = vec4(id, clamp((vDepth - ${SEAM_NEAREST_DEPTH.toFixed(1)}) / ${SEAM_DEPTH_RANGE.toFixed(1)}, 0.0, 1.0), 0.0, 1.0); }`,
    })]));
    const SEAM_WIDTH_PX = 2;
    const seamMaterial = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { ids: { value: idTarget.texture }, texel: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D ids; uniform vec2 texel; varying vec2 vUv;
        // Whether the neighbour at offset is another organ, nearer the viewer than this one.
        bool isInFront (vec2 here, vec2 offset) {
          vec2 other = texture2D(ids, vUv + offset).rg;
          return other.r > 0.0 && abs(other.r - here.r) > 0.01 && other.g < here.g;
        }
        void main() {
          vec2 here = texture2D(ids, vUv).rg;
          if (here.r == 0.0) discard;
          if (!isInFront(here, vec2(texel.x, 0.0)) && !isInFront(here, vec2(-texel.x, 0.0))
            && !isInFront(here, vec2(0.0, texel.y)) && !isInFront(here, vec2(0.0, -texel.y))) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.25);
        }`,
    });
    const seamScene = new THREE.Scene();
    const seamQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), seamMaterial);
    seamQuad.frustumCulled = false;
    seamScene.add(seamQuad);
    const seamCamera = new THREE.Camera();
    const drawingSize = new THREE.Vector2(), clearColor = new THREE.Color();
    function drawSeams () {
      renderer.getDrawingBufferSize(drawingSize);
      if (idTarget.width !== drawingSize.x || idTarget.height !== drawingSize.y) idTarget.setSize(drawingSize.x, drawingSize.y);
      seamMaterial.uniforms.texel.value.set(SEAM_WIDTH_PX * renderer.getPixelRatio() / drawingSize.x, SEAM_WIDTH_PX * renderer.getPixelRatio() / drawingSize.y);
      const materials = seamMeshes.map((mesh) => mesh.material);
      for (const mesh of seamMeshes) mesh.material = idMaterials[mesh.userData.organId];
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      camera.layers.set(SEAM_LAYER);
      renderer.setRenderTarget(idTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor, clearAlpha);
      camera.layers.set(0);
      seamMeshes.forEach((mesh, i) => { mesh.material = materials[i]; });
      renderer.autoClear = false;
      renderer.render(seamScene, seamCamera);
      renderer.autoClear = true;
    }

    // --- Frame loop ---------------------------------------------------------------------------------------------
    const projected = new THREE.Vector3();
    let visible = true;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);
    function drawFrame (now) {
      if (!visible || document.hidden || !canvas.clientWidth) return;
      const still = reducedMotion.matches;
      const sway = still ? 0.28 : Math.sin(((now - swayStartedAt) / 1000 / SWAY_SECONDS) * Math.PI * 2) * SWAY_RADIANS;
      // A few seconds after a drag the body turns back to face the reader, so the leaders stop crossing.
      if (!pointerDown && now - releasedAt > RETURN_AFTER_MS) {
        dragYaw *= 0.97;
        dragPitch *= 0.97;
      }
      yaw += (dragYaw + sway - yaw) * 0.12;
      pitch += (dragPitch - pitch) * 0.12;
      figure.rotation.set(pitch, yaw, 0);

      const anyWaiting = Object.values(organs).some((organ) => organ.waitingColor || organ.toColor.equals(colors.pending));
      // The line has passed an organ once it is at or below it, or has started over at the head since the last frame
      // (a slow frame rate can skip the organ's row). The scan stops once it starts over with no organ waiting.
      let scanY = getScanY(now);
      const startedOver = scanY != null && lastScanY != null && scanY > lastScanY;
      if (startedOver && !anyWaiting) {
        scanStartedAt = null;
        scanY = null;
      }
      lastScanY = scanY;
      glass.uniforms.scanY.value = scanY ?? -9999;
      glass.uniforms.scanStrength.value = scanY == null ? 0 : 0.9;
      figure.updateMatrixWorld();
      for (const organ of Object.values(organs)) {
        const organY = organ.anchorPoint.y;
        if (organ.waitingColor && scanY != null && (scanY <= organY || startedOver)) {
          setColor(organ, organ.waitingColor, now);
          organ.rippleStartedAt = now;
          organ.waitingColor = null;
        }
        const t = Math.min(1, (now - organ.colorStartedAt) / 1000 / COLOR_SECONDS);
        organ.color.copy(organ.fromColor).lerp(organ.toColor, t);
        const pulsePhase = ((now / 1000) % PULSE_SECONDS) / PULSE_SECONDS;
        const breathe = organ.pulse && !still ? 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2) : 0;
        const lift = (organ.highlighted ? 0.35 : 0) + (organ.selected ? 0.15 : 0);
        organ.material.color.copy(organ.color);
        organ.material.emissive.copy(organ.color);
        organ.material.emissiveIntensity = 0.55 + 0.4 * breathe + lift;
        if (organ.lineMaterial) {
          organ.lineMaterial.color.copy(organ.color);
          organ.lineMaterial.emissive.copy(organ.color);
          organ.lineMaterial.emissiveIntensity = 0.6 + 0.4 * breathe + lift;
          organ.lineMaterial.wireframe = organ.noRecord;
        }
        const glowOn = !organ.noRecord && !organ.toColor.equals(colors.pending);
        organ.glow.material.color.copy(organ.color);
        organ.glow.material.opacity = glowOn ? (organ.pulse ? 0.22 + 0.25 * breathe : 0.1) + (organ.highlighted ? 0.15 : 0) : 0;
        // The pulse ring grows and fades like the SVG body's; a ripple is one bigger ring after a change.
        const rippleAge = (now - organ.rippleStartedAt) / 1000;
        if (rippleAge < 0.9) {
          organ.pulseRing.material.color.copy(organ.color);
          organ.pulseRing.material.opacity = 0.9 * (1 - rippleAge / 0.9);
          organ.pulseRing.scale.setScalar(30 + 90 * rippleAge);
        } else if (organ.pulse && !still) {
          organ.pulseRing.material.color.copy(organ.color);
          organ.pulseRing.material.opacity = 0.75 * (1 - pulsePhase);
          organ.pulseRing.scale.setScalar(36 + 40 * pulsePhase);
        } else {
          organ.pulseRing.material.opacity = organ.pulse ? 0.6 : 0;
          organ.pulseRing.scale.setScalar(52);
        }
        organ.selectRing.material.opacity = organ.selected ? 0.9 : 0;
      }

      renderer.render(scene, camera);
      drawSeams();
      const width = narrow ? NARROW_WIDTH : CANVAS_WIDTH;
      const positions = {};
      for (const [organId, organ] of Object.entries(organs)) {
        projected.copy(organ.anchorPoint).applyMatrix4(figure.matrixWorld).project(camera);
        positions[organId] = { x: (projected.x + 1) / 2 * width, y: (1 - projected.y) / 2 * CANVAS_HEIGHT };
      }
      onProject?.(positions);
    }
    renderer.setAnimationLoop(drawFrame);
    darkScheme.addEventListener('change', applyTheme);
    resize();
    applyTheme();
    return { paintOrgan, selectOrgan, highlightOrgan, setNarrow, setBody };
  }

  return { isReady, hasWebGL, mount };
})();
