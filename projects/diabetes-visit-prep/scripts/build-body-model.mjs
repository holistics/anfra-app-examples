// Writes apps/_lib/body-model.js, the 3D body map's anatomy: a male and a female body, each a glass skin with the same
// organs inside, so the body map can show the patient's sex.
// - Male: BodyParts3D 4.0 (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html, CC BY 4.0): skin and organs.
// - Female: Anny (NAVER LABS, https://github.com/naver/anny), built on MakeHuman's CC0 assets, written as an OBJ by
//   scripts/generate-female-body.py, with BodyParts3D's organs warped into her: a thin-plate spline through landmarks
//   both skins have (head, torso outline, legs, feet) carries every organ, artery and foot bone from his body to the
//   same place in hers.
// Download partof_BP3D_4.0_obj_99.zip and partof_element_parts.txt (BodyParts3D), unzip the first, write the female OBJ,
// then: node scripts/build-body-model.mjs <obj folder> <partof_element_parts.txt> <female.obj>
// Each part is simplified (meshoptimizer) to a size a page can load. The app frame can't fetch() files, so the geometry
// ships as a classic script: positions as 16-bit integers over the body's bounds (under 0.03 mm at 1.7 m), triangle
// indices as 16- or 32-bit integers, both base64.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const OUTPUT = new URL('../apps/_lib/body-model.js', import.meta.url).pathname;
// BodyParts3D's licence asks for its credit in this wording; Anny's body is CC0, credited anyway.
const CREDITS = [
  { text: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International', href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html' },
  { text: 'female body: Anny by NAVER LABS, from MakeHuman assets (CC0)', href: 'https://github.com/naver/anny' },
];
// organ: the body map's organ the part colors with (null for the skin). kind: 'skin' is drawn as glass, 'line' (vessels)
// fainter than an 'organ'. keep: the share of triangles kept (femaleKeep for her skin). yBelow (m): drops triangles above
// it; drop([x, y, z]) drops triangles with a vertex for which it is true. anchor: where the callout's leader ends, the
// centre of the part's left or right half (the viewer's) or of all of it.
const PARTS = [
  { name: 'body', organ: null, kind: 'skin', concepts: ['FMA7163'], keep: 0.12, femaleKeep: 0.5, error: 0.002 },
  { name: 'eyes', organ: 'eyes', kind: 'organ', concepts: ['FMA12514', 'FMA12515'], keep: 0.03, anchor: 'left' },
  { name: 'heart', organ: 'heart', kind: 'organ', concepts: ['FMA7088'], keep: 0.25, anchor: 'center' },
  {
    // The main arteries from the heart to the feet: aorta, brachiocephalic, common carotid, subclavian, renal, common and
    // external iliac, femoral, popliteal, tibial, dorsalis pedis, plantar arch. Cut at the neck, so the head's small
    // arteries don't web the eyes, and where the subclavians leave the chest (drop), since the warp into the female body
    // has no landmarks in the arms to carry them into hers.
    name: 'vessels', organ: 'heart', kind: 'line', keep: 0.22, yBelow: 1.4, drop: ([x, y]) => Math.abs(x) > 0.16 || (y > 1.15 && Math.abs(x) > 0.06),
    concepts: ['FMA3734', 'FMA3932', 'FMA3941', 'FMA4058', 'FMA3953', 'FMA4694', 'FMA14752', 'FMA14753', 'FMA14765', 'FMA14766',
      'FMA18806', 'FMA18807', 'FMA70249', 'FMA70250', 'FMA77380', 'FMA77381', 'FMA43896', 'FMA43897', 'FMA43898', 'FMA43899',
      'FMA43916', 'FMA43917', 'FMA43943', 'FMA43944'],
  },
  { name: 'glucose', organ: 'glucose', kind: 'organ', concepts: ['FMA7198'], keep: 0.5, anchor: 'left' },
  { name: 'kidneys', organ: 'kidneys', kind: 'organ', concepts: ['FMA7204', 'FMA7205'], keep: 0.5, anchor: 'right' },
  // The bones of both feet.
  { name: 'feet', organ: 'feet', kind: 'organ', concepts: ['FMA11343', 'FMA11344'], keep: 0.4, anchor: 'left' },
];
// His genitals smoothed away, as on a mannequin: a body map for a clinic, not an anatomy lesson. Ellipsoids ({ center,
// radii }, m). Hers: sealFemaleSkin.
const MALE_SMOOTH_REGIONS = [{ center: [0, 0.74, 0.14], radii: [0.075, 0.09, 0.1] }];

const [objFolder, elementPartsFile, femaleObjFile] = process.argv.slice(2);
if (!objFolder || !elementPartsFile || !femaleObjFile) {
  console.error('Usage: node scripts/build-body-model.mjs <obj folder> <partof_element_parts.txt> <female.obj>');
  process.exit(1);
}
await MeshoptSimplifier.ready;

// --- Reading -----------------------------------------------------------------------------------------------------
const elementsOfConcept = new Map();
for (const line of readFileSync(elementPartsFile, 'utf8').split('\n').slice(1)) {
  const [concept, , element] = line.trim().split('\t');
  if (!element) continue;
  if (!elementsOfConcept.has(concept)) elementsOfConcept.set(concept, new Set());
  elementsOfConcept.get(concept).add(element);
}
const objFiles = new Map(readdirSync(objFolder, { recursive: true }).filter((file) => file.endsWith('.obj'))
  .map((file) => [basename(file, '.obj'), join(objFolder, file)]));

// An OBJ's triangles, Z-up facing -y turned Y-up facing +z, in metres (scale: metres per file unit), added to a mesh.
function readObj (file, scale, { positions, indices } = { positions: [], indices: [] }) {
  const base = positions.length / 3;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      positions.push(x * scale, z * scale, -y * scale);
    } else if (line.startsWith('f ')) {
      const face = line.slice(2).trim().split(/\s+/).map((token) => parseInt(token, 10) - 1 + base);
      for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
    }
  }
  return { positions, indices };
}

function readConcepts (concepts) {
  const mesh = { positions: [], indices: [] };
  for (const element of new Set(concepts.flatMap((concept) => {
    if (!elementsOfConcept.has(concept)) throw new Error(`${concept} is not in ${elementPartsFile}`);
    return [...elementsOfConcept.get(concept)];
  }))) {
    const file = objFiles.get(element);
    if (!file) throw new Error(`${element}.obj is missing from ${objFolder}`);
    readObj(file, 0.001, mesh);
  }
  return mesh;
}

// Coincident vertices welded, so the smoothing and the simplifier see one surface; yBelow and drop leave triangles out.
function weld ({ positions, indices }, { yBelow, drop } = {}) {
  const welded = [], weldedIndexOf = new Map(), remap = new Int32Array(positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const key = `${positions[v * 3].toFixed(5)},${positions[v * 3 + 1].toFixed(5)},${positions[v * 3 + 2].toFixed(5)}`;
    if (!weldedIndexOf.has(key)) {
      weldedIndexOf.set(key, welded.length / 3);
      welded.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    remap[v] = weldedIndexOf.get(key);
  }
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) {
    const triangle = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    const corners = triangle.map((i) => [welded[i * 3], welded[i * 3 + 1], welded[i * 3 + 2]]);
    if (yBelow != null && corners.some(([, y]) => y >= yBelow)) continue;
    if (drop && corners.some(drop)) continue;
    kept.push(...triangle);
  }
  return { positions: new Float32Array(welded), indices: new Uint32Array(kept) };
}

// --- Shaping -----------------------------------------------------------------------------------------------------
// Each region ({ center, radii }, an ellipsoid) has its vertices moved while the skin around it is held, so it meets
// that skin with no hole and no seam. Plain regions relax: each vertex goes to the average of its neighbours, over and
// over, which flattens a bump away. A fair region (a bump on a curved surface, like a nipple, where relaxing would leave
// a flat disc with a rim) is faired instead: its vertices take the positions that bend the surface least (minimum
// ‖Lx‖², L the mesh's graph Laplacian), so it keeps the curve and the slope of the skin around it.
const RELAX_ROUNDS = 3000;
function smoothRegions (mesh, regions) {
  const neighbours = Array.from({ length: mesh.positions.length / 3 }, () => new Set());
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) neighbours[mesh.indices[t + k]].add(mesh.indices[t + (k + 1) % 3]).add(mesh.indices[t + (k + 2) % 3]);
  }
  const { positions } = mesh;
  const isInside = (v, { center, radii }) => [0, 1, 2].reduce((sum, a) => sum + ((positions[v * 3 + a] - center[a]) / radii[a]) ** 2, 0) < 1;
  // A vertex no triangle uses any more (a sealed pocket's) has nothing to average.
  const vertices = Array.from({ length: positions.length / 3 }, (_, v) => v).filter((v) => neighbours[v].size);
  const relaxed = vertices.filter((v) => regions.some((region) => !region.fair && isInside(v, region)));
  relax(positions, neighbours, relaxed);
  for (const region of regions.filter(({ fair: isFair }) => isFair)) fair(positions, neighbours, vertices.filter((v) => isInside(v, region)));
  return mesh;
}

function relax (positions, neighbours, inside) {
  const next = new Float32Array(positions);
  for (let round = 0; round < RELAX_ROUNDS; round++) {
    for (const v of inside) {
      for (let a = 0; a < 3; a++) {
        let sum = 0;
        for (const n of neighbours[v]) sum += positions[n * 3 + a];
        next[v * 3 + a] = sum / neighbours[v].size;
      }
    }
    for (const v of inside) for (let a = 0; a < 3; a++) positions[v * 3 + a] = next[v * 3 + a];
  }
}

// Solves (LᵀL)ᵢᵢ xᵢ = −(LᵀL)ᵢₒ xₒ per axis by conjugate gradients, i the region's vertices, o the held ones. L is
// symmetric, so LᵀL applies as L twice, over the region and the two rings of vertices around it.
function fair (positions, neighbours, inside) {
  const isInside = new Set(inside);
  const near = new Set(inside);
  for (let ring = 0; ring < 2; ring++) for (const v of [...near]) for (const n of neighbours[v]) near.add(n);
  const local = [...near], slot = new Map(local.map((v, i) => [v, i]));
  const laplacian = (values) => local.map((v, i) => {
    let sum = 0;
    for (const n of neighbours[v]) sum += (slot.has(n) ? values[slot.get(n)] : 0) - values[i];
    return sum;
  });
  const bend = (values) => laplacian(laplacian(values));
  const dot = (a, b) => inside.reduce((sum, v) => sum + a[slot.get(v)] * b[slot.get(v)], 0);
  for (let a = 0; a < 3; a++) {
    const held = local.map((v) => (isInside.has(v) ? 0 : positions[v * 3 + a]));
    const residual = bend(held).map((value, i) => (isInside.has(local[i]) ? -value : 0));
    const x = local.map(() => 0), direction = [...residual];
    let rr = dot(residual, residual);
    for (let step = 0; step < 4000 && rr > 1e-20; step++) {
      const bent = bend(direction).map((value, i) => (isInside.has(local[i]) ? value : 0));
      const alpha = rr / dot(direction, bent);
      for (const v of inside) {
        const i = slot.get(v);
        x[i] += alpha * direction[i];
        residual[i] -= alpha * bent[i];
      }
      const rrNext = dot(residual, residual);
      for (const v of inside) direction[slot.get(v)] = residual[slot.get(v)] + (rrNext / rr) * direction[slot.get(v)];
      rr = rrNext;
    }
    for (const v of inside) positions[v * 3 + a] = x[slot.get(v)];
  }
}

// Anny's body has pockets the glass would show: a mouth cavity and eye sockets in the head, a slit at the groin. In each
// box (x, y and z ranges, m), a vertex with skin straight in front of it lies in a pocket: its triangles go, and each
// opening left (the lips, the eyelids, the slit) is closed by a fan to its centre, to be relaxed smooth.
function sealPockets ({ positions, indices }, boxes) {
  const at = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
  const inBox = (point) => boxes.some((box) => [0, 1, 2].every((a) => point[a] >= box[a][0] && point[a] <= box[a][1]));
  const faceTriangles = [];
  for (let t = 0; t < indices.length; t += 3) if ([0, 1, 2].some((k) => inBox(at(indices[t + k])))) faceTriangles.push(t);
  // Does a ray from point toward +z cross a face triangle not touching vertex v? (Möller–Trumbore, direction (0, 0, 1).)
  const hasSkinInFront = (v) => {
    const [px, py, pz] = at(v);
    return faceTriangles.some((t) => {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      if (a === v || b === v || c === v) return false;
      const [ax, ay, az] = at(a), [bx, by, bz] = at(b), [cx, cy, cz] = at(c);
      const e1 = [bx - ax, by - ay, bz - az], e2 = [cx - ax, cy - ay, cz - az];
      const p = [-e2[1], e2[0], 0], det = e1[0] * p[0] + e1[1] * p[1];
      if (Math.abs(det) < 1e-12) return false;
      const s = [px - ax, py - ay, pz - az], u = (s[0] * p[0] + s[1] * p[1]) / det;
      if (u < 0 || u > 1) return false;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const w = q[2] / det;
      if (w < 0 || u + w > 1) return false;
      return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-5;
    });
  };
  const inside = new Set();
  for (let v = 0; v < positions.length / 3; v++) if (inBox(at(v)) && hasSkinInFront(v)) inside.add(v);
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) if (![0, 1, 2].some((k) => inside.has(indices[t + k]))) kept.push(indices[t], indices[t + 1], indices[t + 2]);
  // The openings: directed edges no other kept triangle shares, chained into loops.
  const edges = new Map();
  for (let t = 0; t < kept.length; t += 3) for (let k = 0; k < 3; k++) edges.set(`${kept[t + k]},${kept[t + (k + 1) % 3]}`, [kept[t + k], kept[t + (k + 1) % 3]]);
  const next = new Map();
  for (const [a, b] of edges.values()) if (!edges.has(`${b},${a}`)) next.set(a, b);
  const fill = [...positions];
  const patchCentres = [];
  while (next.size) {
    const [start] = next.keys(), loop = [start];
    for (let v = next.get(start); v !== start && v != null && loop.length < 5000; v = next.get(v)) loop.push(v);
    for (const v of loop) next.delete(v);
    // Every opening is one this made: the skin is closed elsewhere.
    if (loop.length < 3) continue;
    const centre = fill.length / 3;
    fill.push(...centroid(loop.map(at)));
    patchCentres.push(centre);
    loop.forEach((v, i) => kept.push(loop[(i + 1) % loop.length], v, centre));
  }
  const mesh = { positions: new Float32Array(fill), indices: kept };
  return { mesh, patchCentres, removedCount: inside.size };
}

function simplify ({ positions, indices }, { keep, error = 0.01 }) {
  const target = Math.floor((indices.length * keep) / 3) * 3;
  const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target, error, []);
  const newIndexOf = new Map(), compact = [];
  const compactIndices = simplified.map((i) => {
    if (!newIndexOf.has(i)) {
      newIndexOf.set(i, compact.length / 3);
      compact.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    return newIndexOf.get(i);
  });
  return { positions: new Float32Array(compact), indices: compactIndices };
}

// --- The warp from his body to hers --------------------------------------------------------------------------------
// Landmarks from a standing skin alone (Y-up, facing +z, arms down, centred on x = 0), in the same order for any body:
// the top of the head, the nose, the chin, the head's sides and back; the torso's front, back and two sides at five
// heights between the crotch and the shoulders, and the neck's; each leg's centre at three heights between the ankle and
// the crotch; each foot's centre, toe and heel. The arms and hands are left out: they hang apart from the torso and
// legs, past a gap the slices look for.
const SHOULDER_FRACTION = 0.81, ANKLE_FRACTION = 0.05;
const centroid = (points) => [0, 1, 2].map((a) => points.reduce((sum, point) => sum + point[a], 0) / points.length);
function findSkinLandmarks ({ positions }) {
  const points = Array.from({ length: positions.length / 3 }, (_, v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
  const yMin = Math.min(...points.map(([, y]) => y)), yMax = Math.max(...points.map(([, y]) => y)), height = yMax - yMin;
  const slice = (y) => points.filter((point) => Math.abs(point[1] - y) < 0.006);
  // The points of a slice from the midline outward on one side, up to the first gap wider than 1.5 cm.
  const findInnerRun = (slicePoints, side, fromMidline = true) => {
    const sorted = slicePoints.filter(([x]) => Math.sign(x) === side).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
    const run = [];
    for (const point of sorted) {
      if (run.length && Math.abs(point[0]) - Math.abs(run.at(-1)[0]) > 0.015) break;
      if (!run.length && fromMidline && Math.abs(point[0]) > 0.05) break;
      run.push(point);
    }
    return run;
  };
  const midline = points.filter(([x]) => Math.abs(x) < 0.01);
  const crotchY = Math.min(...midline.filter(([, y]) => y < yMin + 0.6 * height).map(([, y]) => y));
  const shoulderY = yMin + SHOULDER_FRACTION * height, ankleY = yMin + ANKLE_FRACTION * height;
  const head = points.filter(([x, y]) => Math.abs(x) < 0.12 && y > yMin + 0.88 * height);
  const nose = head.filter(([x]) => Math.abs(x) < 0.02).reduce((best, point) => (point[2] > best[2] ? point : best));
  const noseLevel = head.filter(([, y]) => Math.abs(y - nose[1]) < 0.01);
  // The chin: the lowest midline point still at the front of the face (within 4 cm of the nose's depth).
  const chin = midline.filter(([, y, z]) => y < nose[1] && y > nose[1] - 0.15 && z > nose[2] - 0.04).reduce((best, point) => (point[1] < best[1] ? point : best));
  const landmarks = [
    midline.reduce((best, point) => (point[1] > best[1] ? point : best)), nose, chin,
    noseLevel.reduce((best, point) => (point[0] > best[0] ? point : best)), noseLevel.reduce((best, point) => (point[0] < best[0] ? point : best)),
    noseLevel.reduce((best, point) => (point[2] < best[2] ? point : best)),
  ];
  // The torso at five heights, then the neck halfway between the shoulders and the chin.
  for (const levelY of [...[0.1, 0.3, 0.5, 0.7, 0.9].map((fraction) => crotchY + (shoulderY - crotchY) * fraction), (shoulderY + chin[1]) / 2]) {
    const level = slice(levelY);
    const centre = level.filter(([x]) => Math.abs(x) < 0.02);
    landmarks.push(centre.reduce((best, point) => (point[2] > best[2] ? point : best)), centre.reduce((best, point) => (point[2] < best[2] ? point : best)));
    for (const side of [-1, 1]) landmarks.push(findInnerRun(level, side).at(-1));
  }
  for (const side of [-1, 1]) {
    for (const fraction of [0.25, 0.5, 0.75]) {
      // Below the crotch the legs part at the midline, so a leg's run starts at its inner edge.
      const leg = findInnerRun(slice(ankleY + (crotchY - ankleY) * fraction), side, false);
      landmarks.push(centroid(leg));
    }
    const foot = points.filter(([x, y]) => Math.sign(x) === side && Math.abs(x) < 0.3 && y < ankleY);
    landmarks.push(centroid(foot), foot.reduce((best, point) => (point[2] > best[2] ? point : best)), foot.reduce((best, point) => (point[2] < best[2] ? point : best)));
  }
  return landmarks;
}

// A thin-plate spline through the landmark pairs: f(p) = affine(p) + Σ wᵢ |p − cᵢ|, solved per output axis.
function fitWarp (from, to) {
  const n = from.length, size = n + 4;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const matrix = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => {
    if (i < n && j < n) return distance(from[i], from[j]);
    if (i < n) return j === n ? 1 : from[i][j - n - 1];
    if (j < n) return i === n ? 1 : from[j][i - n - 1];
    return 0;
  }));
  const solve = (rhs) => {
    const a = matrix.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < size; col++) {
      const pivot = a.slice(col).reduce((best, row, i) => (Math.abs(row[col]) > Math.abs(a[best][col]) ? col + i : best), col);
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let row = 0; row < size; row++) {
        if (row === col) continue;
        const factor = a[row][col] / a[col][col];
        for (let k = col; k <= size; k++) a[row][k] -= factor * a[col][k];
      }
    }
    return a.map((row, i) => row[size] / row[i]);
  };
  const coefficients = [0, 1, 2].map((axis) => solve([...to.map((point) => point[axis]), 0, 0, 0, 0]));
  return (point) => coefficients.map((c) => {
    let value = c[n] + c[n + 1] * point[0] + c[n + 2] * point[1] + c[n + 3] * point[2];
    for (let i = 0; i < n; i++) value += c[i] * distance(point, from[i]);
    return value;
  });
}

// --- Building ------------------------------------------------------------------------------------------------------
const maleSkin = weld(readConcepts(['FMA7163']));
const femaleSkin = sealFemaleSkin(weld(readObj(femaleObjFile, 1)));
// Her pockets sealed (the mouth and eyes, from her nose: 5.5 cm below it, above the chin, whose front would hide the
// throat, to 7 cm above, 4.8 cm to each side, from 12 cm behind its tip; the groin slit, its front only, from just above
// the crotch up 7 cm), then the patches, her lips, eyelids, ears, nipples and groin relaxed, as on a mannequin.
function sealFemaleSkin (skin) {
  const nose = findSkinLandmarks(skin)[1];
  const crotchY = Math.min(...Array.from({ length: skin.positions.length / 3 }, (_, v) => v)
    .filter((v) => Math.abs(skin.positions[v * 3]) < 0.01 && skin.positions[v * 3 + 1] < nose[1] - 0.5).map((v) => skin.positions[v * 3 + 1]));
  const { mesh, patchCentres, removedCount } = sealPockets(skin, [
    [[-0.048, 0.048], [nose[1] - 0.055, nose[1] + 0.07], [nose[2] - 0.12, nose[2] + 0.01]],
    [[-0.03, 0.03], [crotchY + 0.012, crotchY + 0.07], [0.03, 0.2]],
  ]);
  console.log(`female skin: ${removedCount} pocket vertices removed, ${patchCentres.length} openings closed`);
  const welded = weld(mesh);
  const at = (v) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
  // Her nipples: the front-most point of each breast (4–15 cm from the midline, 20–45 cm below the nose).
  const nipples = [-1, 1].map((side) => Array.from({ length: skin.positions.length / 3 }, (_, v) => at(v))
    .filter(([x, y]) => x * side > 0.04 && x * side < 0.15 && y > nose[1] - 0.45 && y < nose[1] - 0.2)
    .reduce((best, point) => (point[2] > best[2] ? point : best)));
  return smoothRegions(welded, [
    ...patchCentres.map((v) => ({ center: at(v), radii: [0.02, 0.015, 0.02] })),
    ...[-1, 1].flatMap((side) => [
      { center: [side * 0.032, nose[1] + 0.034, nose[2] - 0.04], radii: [0.024, 0.016, 0.04] },
      { center: [side * 0.078, nose[1] + 0.031, 0.075], radii: [0.022, 0.045, 0.04] },
    ]),
    { center: [0, nose[1] - 0.035, nose[2] - 0.02], radii: [0.03, 0.022, 0.04] },
    ...nipples.map((nipple) => ({ center: nipple, radii: [0.013, 0.013, 0.012], fair: true })),
    { center: [0, crotchY + 0.03, 0.07], radii: [0.03, 0.045, 0.06] },
  ]);
}
const warpToFemale = fitWarp(findSkinLandmarks(maleSkin), findSkinLandmarks(femaleSkin));

const maleMeshes = PARTS.map((part) => {
  const mesh = part.kind === 'skin' ? smoothRegions(maleSkin, MALE_SMOOTH_REGIONS) : weld(readConcepts(part.concepts), part);
  return simplify(mesh, part);
});
const femaleMeshes = PARTS.map((part, p) => {
  if (part.kind === 'skin') return simplify(femaleSkin, { ...part, keep: part.femaleKeep });
  const { positions, indices } = maleMeshes[p];
  const warped = new Float32Array(positions.length);
  for (let v = 0; v < positions.length / 3; v++) warped.set(warpToFemale([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]), v * 3);
  return { positions: warped, indices };
});

function findAnchor ({ positions }, side) {
  const sum = [0, 0, 0];
  let count = 0, front = -Infinity;
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3];
    if ((side === 'left' && x > 0) || (side === 'right' && x < 0)) continue;
    for (let a = 0; a < 3; a++) sum[a] += positions[v * 3 + a];
    front = Math.max(front, positions[v * 3 + 2]);
    count++;
  }
  // On the part's front surface, so the leader's end shows in front of it.
  return [sum[0] / count, sum[1] / count, front].map((value) => +value.toFixed(4));
}

const toBase64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
function packBody (meshes, name) {
  const bound = (axis, pick) => meshes.reduce((best, { positions }) => {
    for (let i = axis; i < positions.length; i += 3) best = pick(best, positions[i]);
    return best;
  }, pick === Math.min ? Infinity : -Infinity);
  const min = [0, 1, 2].map((axis) => bound(axis, Math.min)), max = [0, 1, 2].map((axis) => bound(axis, Math.max));
  const parts = PARTS.map(({ name: partName, organ, kind, anchor }, p) => {
    const { positions, indices } = meshes[p];
    const quantized = Int16Array.from(positions, (value, i) => Math.round(((value - min[i % 3]) / (max[i % 3] - min[i % 3])) * 65534 - 32767));
    const wideIndices = positions.length / 3 >= 65536;
    return {
      name: partName, organ, kind, positions: toBase64(quantized),
      indices: toBase64(wideIndices ? Uint32Array.from(indices) : Uint16Array.from(indices)), wideIndices,
      ...(anchor && { anchor: findAnchor(meshes[p], anchor) }),
    };
  });
  console.log(`${name}: ${parts.length} parts, ${meshes.reduce((sum, { indices }) => sum + indices.length / 3, 0)} triangles`);
  return { min: min.map((v) => +v.toFixed(5)), max: max.map((v) => +v.toFixed(5)), parts };
}
const model = { credits: CREDITS, bodies: { male: packBody(maleMeshes, 'male'), female: packBody(femaleMeshes, 'female') } };
writeFileSync(OUTPUT, `// Generated by scripts/build-body-model.mjs; do not edit. A male body (BodyParts3D 4.0) and a female body (Anny's skin
// with BodyParts3D's organs warped into it), each: skin, eyeballs, heart, main arteries below the neck, pancreas,
// kidneys, foot bones; simplified, genitals smoothed. ${CREDITS.map(({ text }) => text).join('; ')}.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.bodyModel = ${JSON.stringify(model).replace(/\{"name"/g, '\n  {"name"')};
`);
console.log(`wrote ${OUTPUT}`);
