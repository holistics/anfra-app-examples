const fs = require('fs');
const path = require('path');

function dir(cfg, name) {
  const d = path.join(cfg.storePath, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

function listRequests(cfg) {
  const d = dir(cfg, 'requests');
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => read(path.join(d, f)));
}
function getRequest(cfg, id) {
  const f = path.join(dir(cfg, 'requests'), `${id}.json`);
  return /^r-\d+$/.test(id) && fs.existsSync(f) ? read(f) : null;
}
function saveRequest(cfg, r) {
  write(path.join(dir(cfg, 'requests'), `${r.id}.json`), r);
  return r;
}
function nextRequestId(cfg) {
  const n = listRequests(cfg).length + 1;
  return `r-${String(n).padStart(3, '0')}`;
}

const requestFile = (cfg, id) => path.join(dir(cfg, 'requests'), `${id}.json`);
const logFile = (cfg, id) => path.join(dir(cfg, 'log'), `${id}.json`);
function writeLog(cfg, r) {
  write(logFile(cfg, r.id), r);
}
function listLog(cfg) {
  const d = dir(cfg, 'log');
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => read(path.join(d, f)));
}

function timelineFile(cfg, metricId) {
  return path.join(dir(cfg, 'timeline'), `${metricId}.json`);
}
function listTimeline(cfg, metricId) {
  const f = timelineFile(cfg, metricId);
  return fs.existsSync(f) ? read(f) : [];
}
// Ids count up from the highest one, so removing entries never hands an old id to a new entry.
function addTimeline(cfg, metricId, entry) {
  const list = listTimeline(cfg, metricId);
  const n = Math.max(0, ...list.map((e) => Number(String(e.id).slice(2)) || 0)) + 1;
  list.push({ id: `t-${String(n).padStart(3, '0')}`, at: new Date().toISOString(), ...entry });
  write(timelineFile(cfg, metricId), list);
  return list[list.length - 1];
}
function removeTimeline(cfg, metricId, drop) {
  const list = listTimeline(cfg, metricId);
  const keep = list.filter((e) => !drop(e));
  if (keep.length !== list.length) write(timelineFile(cfg, metricId), keep);
  return list.length - keep.length;
}

module.exports = { requestFile, logFile, timelineFile, listRequests, getRequest, saveRequest, nextRequestId, writeLog, listLog, listTimeline, addTimeline, removeTimeline };
