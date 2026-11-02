// Driftmouth Bay map scenery, rebuilt from design-reference/1-morning-map.mockup.html.
// The base map is drawn by tools/build_map.py (shared/driftmouth-map.svg) and rendered to shared/driftmouth-map.jpg by tools/render_map.sh.
(function () {

  // Houses and trees, placed with the mockup's seeded generator so the town looks the same each time.
  function buildScene () {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const pts = [[0, 300], [300, 420], [520, 600], [700, 780], [780, 900]];
    const coastX = (y) => {
      if (y < 300) return -999;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
      }
      return 800;
    };
    // Landmarks, plus the base map's fields, pond and beach huts (tools/build_map.py)
    const excl = [[985, 565, 112], [1066, 236, 92], [700, 400, 74], [812, 300, 42], [600, 612, 50], [150, 370, 110], [230, 332, 30],
      [787, 724, 64], [1053, 747, 62], [1240, 733, 82], [1385, 715, 58], [1098, 826, 72], [1273, 823, 68], [1342, 110, 62], [372, 466, 40]];
    // The base map's roads (tools/build_map.py ROADS), sampled so nothing is placed on them
    const ROADS = [[230, 332, 330, 330, 420, 380, 520, 470], [520, 470, 560, 510, 590, 560, 600, 600], [520, 470, 600, 420, 650, 400, 700, 395],
      [700, 395, 800, 390, 900, 430, 985, 560], [700, 395, 760, 320, 880, 270, 1060, 250], [1060, 250, 1160, 240, 1270, 230, 1440, 240],
      [985, 560, 1080, 620, 1200, 640, 1440, 640], [700, 395, 760, 500, 800, 640, 900, 760], [900, 760, 940, 810, 980, 860, 1000, 900]];
    const roadPts = ROADS.flatMap(([x0, y0, x1, y1, x2, y2, x3, y3]) => Array.from({ length: 41 }, (_, k) => {
      const t = k / 40, m = 1 - t;
      return [m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3];
    }));
    // A piece stands on (x, y) and rises above it: keep its foot and its middle off the road
    const offRoad = (x, y, rise) => roadPts.every(([rx, ry]) => Math.hypot(x - rx, y - ry) > 20 && Math.hypot(x - rx, y - rise / 2 - ry) > 18);
    const ok = (x, y, rise = 50) => offRoad(x, y, rise) && x > coastX(y) + 36 && x < 1430 && y > 70 && y < 890 && excl.every((e) => Math.hypot(x - e[0], y - e[1]) > e[2]);
    // Each spot gets its own set piece (Freepik pieces, shared/art/town/): [name, height, x, foot y]
    const SPOTS = [
      // University: the college hall, a glass science block, blossom trees
      ['hall', 118, 1062, 286], ['glass-tower', 116, 1168, 292], ['tree-blossom', 46, 990, 298], ['tree-blossom', 42, 1206, 300],
      // Old Town Square: a corner shop and an arched house facing the arcade, lamps and planters
      ['corner-shop', 62, 630, 410], ['house-arch', 56, 772, 414], ['lamp', 34, 654, 430], ['lamp', 34, 748, 430],
      ['planter', 13, 688, 438], ['planter-2', 13, 714, 438],
      // Harbour: a seaside hotel, lamps on the quay, a delivery van
      ['hotel', 96, 682, 596], ['lamp', 30, 578, 600], ['lamp', 30, 636, 640], ['van-red', 22, 724, 628],
      // Saturday Market: a delivery truck, planters and potted plants around the stalls
      ['truck', 30, 884, 584], ['planter', 14, 958, 636], ['planter-2', 14, 1012, 638], ['pot-plant', 16, 928, 622], ['pot-plant', 16, 1050, 624],
      // Lighthouse: grasses and reeds on the headland
      ['reeds', 22, 222, 352], ['grass', 16, 72, 340], ['grass', 14, 206, 324],
    ];
    const placed = SPOTS.map(([name, h, x, y]) => ({ x, y, kind: 'prop', name, h }));
    const clusters = [
      // [x, y, spread x, spread y, count, style, min gap x, min gap y]: fewer, bigger houses in tight neighbourhoods
      [700, 322, 105, 36, 8, 'oldtown', 40, 22], [478, 512, 28, 16, 3, 'cottage', 40, 22], [830, 232, 95, 36, 6, 'kettle', 48, 26],
      [1180, 420, 70, 60, 4, 'villa', 58, 34], [1250, 222, 55, 26, 3, 'campus', 54, 30], [1180, 884, 30, 8, 2, 'farm', 60, 36]
    ];
    clusters.forEach((c) => {
      let n = 0, tries = 0;
      while (n < c[4] && tries < c[4] * 25) {
        tries++;
        const x = c[0] + (rnd() * 2 - 1) * c[2];
        const y = c[1] + (rnd() * 2 - 1) * c[3];
        if (!ok(x, y)) continue;
        if (placed.some((p) => Math.abs(p.x - x) < c[6] && Math.abs(p.y - y) < c[7])) continue;
        placed.push({ x, y, kind: 'house', style: c[5] });
        n++;
      }
    });
    const woods = [[420, 190, 150, 72, 16], [1200, 460, 90, 70, 5], [600, 160, 80, 40, 5]];
    woods.forEach((c) => {
      for (let i = 0; i < c[4] * 4; i++) {
        const x = c[0] + (rnd() * 2 - 1) * c[2];
        const y = c[1] + (rnd() * 2 - 1) * c[3];
        if (!ok(x, y)) continue;
        if (placed.some((p) => Math.abs(p.x - x) < 26 && Math.abs(p.y - y) < 16)) continue;
        placed.push({ x, y, kind: 'tree' });
      }
    });
    for (let i = 0; i < 22; i++) {
      const x = rnd() * 1440, y = 60 + rnd() * 840;
      if (!ok(x, y)) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 20)) continue;
      placed.push({ x, y, kind: 'tree' });
    }
    placed.sort((a, b) => a.y - b.y);
    // Houses and trees are pieces of the Freepik "City Map Creator" set (shared/art/town/, credit on the page).
    const kinds = {
      oldtown: [['house-tall', 64], ['apartments', 66], ['house-gables', 58], ['house-purple', 56], ['house-tall', 58]],
      cottage: [['cottage-blue', 48], ['house-white', 44]],
      kettle: [['house-red', 54], ['cottage-cream', 48], ['house-solar', 46], ['cottage-blue', 48]],
      villa: [['house-solar', 48], ['house-white', 46], ['house-garage', 44]],
      campus: [['apartments', 70], ['tower', 72]],
      farm: [['house-garage', 46]]
    };
    const trees = [['tree-round', 48], ['tree-poplar', 48], ['tree-green', 46], ['tree-oak', 46], ['tree-autumn', 44], ['tree-autumn-yellow', 44],
      ['tree-fruit', 42], ['tree-poplar-2', 50], ['bush-round', 18], ['bush', 20]];
    // The second Freepik set is already deep in colour: only the first set's trees need deepening
    const PALE = new Set(['tree-round', 'tree-poplar', 'tree-small', 'bush', 'bush-small']);
    const f = (n) => n.toFixed(1);
    // The second Freepik set is brighter, with dark roof lines: soften it to sit with the first set's pastels
    const SECOND = new Set(['hall', 'glass-tower', 'house-gables', 'corner-shop', 'house-purple', 'house-arch', 'hotel', 'lamp', 'planter', 'planter-2',
      'van-red', 'truck', 'car-yellow', 'car-purple', 'car-red', 'pot-plant', 'reeds', 'grass', 'house-white', 'house-red', 'house-solar', 'house-garage',
      'tree-poplar-2', 'tree-autumn-yellow', 'tree-autumn', 'tree-autumn-2', 'tree-green', 'tree-oak', 'tree-blossom', 'tree-fruit', 'hedge', 'bush-round', 'bush-leafy']);
    const SOFT = 'saturate(.68) contrast(.86) brightness(1.06) sepia(.06) drop-shadow(1px 2px 0 rgba(70,80,50,.22))';
    const img = (name, h, x, y, fx = SECOND.has(name) ? SOFT : 'drop-shadow(1px 2px 0 rgba(70,80,50,.25))') => `<img src="shared/art/town/${name}.svg" alt="" style="position:absolute;height:${f(h)}px;left:${f(x)}px;top:${f(y - h)}px;transform:translateX(-50%);filter:${fx}">`;
    // The set's pale greens vanish on the grass: deepen trees and give them a shadow.
    const leafy = 'brightness(.78) saturate(1.5) drop-shadow(1px 2px 0 rgba(50,70,35,.35))';
    return placed.map((p) => {
      if (p.kind === 'prop') return img(p.name, p.h, p.x, p.y);
      if (p.kind === 'house') {
        const opts = kinds[p.style];
        const [name, h] = opts[Math.floor(rnd() * opts.length)];
        return img(name, h * (0.9 + rnd() * 0.2), p.x, p.y);
      }
      const [name, h] = trees[Math.floor(rnd() * trees.length)];
      return img(name, h * (0.85 + rnd() * 0.3), p.x, p.y + 6, PALE.has(name) ? leafy : undefined);
    }).join('') +
      // A little traffic on the lanes
      img('car-yellow', 22, 1212, 252) + img('car-purple', 20, 1330, 654) + img('car-red', 20, 860, 416);
  }

  const OVERLAY = `<svg width="1440" height="900" viewBox="0 0 1440 900" style="position:absolute;left:0;top:0;pointer-events:none" aria-hidden="true">
    <defs>
      <pattern id="wl-rain" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
        <line x1="12" y1="0" x2="12" y2="24" stroke="#FFFFFF" style="stroke-width:1.6;opacity:0.6"/>
        <line x1="46" y1="34" x2="46" y2="52" stroke="#FFFFFF" style="stroke-width:1.3;opacity:0.45"/>
        <line x1="30" y1="58" x2="30" y2="70" stroke="#FFFFFF" style="stroke-width:1.1;opacity:0.4"/>
      </pattern>
      <filter id="wl-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.6 0"/>
      </filter>
    </defs>
    <rect id="wl-wash" width="1440" height="900" fill="#8E9AA8" style="opacity:0.16"/>
    <rect id="wl-rainfall" width="1440" height="900" fill="url(#wl-rain)"/>
  </svg>
  <span class="hand" style="position:absolute;left:470px;top:790px;transform:rotate(-38deg);font-size:34px;color:#3F6F8C;pointer-events:none" aria-hidden="true">Driftmouth Bay</span>
  <span class="hand" style="position:absolute;left:760px;top:300px;transform:rotate(-16deg);font-size:26px;color:#56693F;pointer-events:none" aria-hidden="true">Kettle Lane</span>
  <span class="hand" style="position:absolute;left:1010px;top:680px;transform:rotate(8deg);font-size:26px;color:#56693F;pointer-events:none" aria-hidden="true">Gull Hill</span>
  <span class="hand" style="position:absolute;left:470px;top:410px;transform:rotate(38deg);font-size:24px;color:#56693F;pointer-events:none" aria-hidden="true">Tanners Row</span>`;

  window.WLScenery = {
    // The static map (with its hand-drawn wobble filter) is pre-rendered to driftmouth-map.jpg (tools/render_map.sh):
    // a live SVG displacement filter over the whole stage is too slow to repaint.
    html: () => '<img src="shared/driftmouth-map.jpg" alt="" width="1440" height="900" style="position:absolute;left:0;top:0;display:block">' +
      `<div style="position:absolute;inset:0;pointer-events:none" aria-hidden="true">${buildScene()}</div>` + OVERLAY,
    // Tint the map for the what-if weather, as the mockup does.
    setWeather: (root, weather) => {
      const wash = root.querySelector('#wl-wash');
      const rain = root.querySelector('#wl-rainfall');
      wash.setAttribute('fill', weather === 'sun' ? '#FFF4D6' : '#8E9AA8');
      wash.style.opacity = weather === 'rain' ? 0.16 : 0.10;
      rain.style.display = weather === 'rain' ? '' : 'none';
    },
  };
})();
