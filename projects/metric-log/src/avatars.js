// People's faces: Open Peeps by Pablo Stanley (CC0), drawn with DiceBear (MIT), built here from the person's id.
// One normal and one eyes-closed drawing per person (the blink on hover). Teams are lettered circles in the team's colour, not faces.
const { createAvatar } = require('@dicebear/core');
const style = require('@dicebear/open-peeps');
const { person } = require('./config');
const { esc } = require('./ui');

const BG = ['dbeafe', 'fde68a', 'fbcfe8', 'bbf7d0', 'e9d5ff', 'fed7aa']; // soft, one per person by their place in the config
const FACES = ['calm', 'smile', 'cute', 'smileBig', 'driven', 'explaining', 'serious', 'solemn', 'cheeky', 'smileTeethGap', 'awe', 'eatingHappy'];
const HEADS = ['afro', 'bangs', 'bangs2', 'bantuKnots', 'bun', 'bun2', 'buns', 'cornrows', 'cornrows2', 'dreads1', 'dreads2', 'flatTop', 'flatTopLong', 'grayMedium', 'grayShort', 'hijab', 'long', 'longAfro', 'longBangs', 'longCurly', 'medium1', 'medium2', 'medium3', 'mediumBangs', 'mediumBangs2', 'mediumBangs3', 'mediumStraight', 'mohawk', 'mohawk2', 'noHair1', 'noHair2', 'noHair3', 'pomp', 'shaved1', 'shaved2', 'shaved3', 'short1', 'short2', 'short3', 'short4', 'short5', 'turban', 'twists', 'twists2'];

const cache = new Map();
function svg(cfg, id, blink) {
  const i = cfg.people.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const key = `${id}|${i}|${blink}`;
  if (!cache.has(key)) {
    cache.set(key, createAvatar(style, {
      seed: id, size: 64, radius: 50, backgroundColor: [BG[i % BG.length]],
      face: blink ? ['eyesClosed'] : FACES, head: HEADS, maskProbability: 0,
    }).toString());
  }
  return cache.get(key);
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// A person's face, or a team's lettered circle when the id is `team:<name>`. Class `av` keeps the older size rules working.
function face(cfg, id, size = 30) {
  if (String(id).startsWith('team:')) {
    const t = id.slice(5);
    return `<span class="face av team t-${esc(t)}" style="--s:${size}px" title="${esc(titleCase(t))} team">${esc(t.charAt(0).toUpperCase())}</span>`;
  }
  const p = person(cfg, id);
  if (!p) return `<span class="face av team" style="--s:${size}px" title="${esc(id)}">${esc(initials(String(id)))}</span>`;
  const u = `/av/${encodeURIComponent(p.id)}`;
  return `<span class="face av" style="--s:${size}px" title="${esc(p.name)} · ${esc(p.team)}"><img src="${u}.svg" alt="" width="${size}" height="${size}"><img class="blink" src="${u}.blink.svg" alt="" width="${size}" height="${size}"></span>`;
}

// What a face's hover title says, and the plain name used in text.
function nameOf(cfg, id) {
  if (String(id).startsWith('team:')) return `${titleCase(id.slice(5))} team`;
  return (person(cfg, id) || { name: id }).name;
}

module.exports = { svg, face, nameOf };
