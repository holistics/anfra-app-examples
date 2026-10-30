const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function loadConfig(file) {
  const abs = path.resolve(file);
  const dir = path.dirname(abs);
  const c = YAML.parse(fs.readFileSync(abs, 'utf8')) || {};
  c.file = abs;
  c.repoPath = path.resolve(dir, (c.anfra && c.anfra.repo) || '.');
  c.storePath = path.resolve(dir, c.store || path.join(c.repoPath, 'metric-log'));
  c.anfra = c.anfra || {};
  c.people = c.people || [];
  c.metrics = c.metrics || {};
  c.defaults = c.defaults || {};
  c.simulated_drafts = c.simulated_drafts || [];
  c.notifications = c.notifications || { slack: { enabled: false } };
  return c;
}

// Metrics without their own entry get defaults.owner and defaults.approval, so a repo with many metrics
// needs entries only for the exceptions.
function applyDefaults(cfg, ids) {
  const d = cfg.defaults;
  if (!d || (!d.owner && !d.approval)) return;
  for (const id of ids) {
    const own = cfg.metrics[id] || {};
    cfg.metrics[id] = { ...own, owner: own.owner || d.owner, approval: own.approval || d.approval };
  }
}

function person(cfg, id) {
  return cfg.people.find((p) => p.id === id);
}

function matches(p, selector) {
  const [kind, val] = String(selector).split(':');
  if (kind === 'role') return p.role === val;
  if (kind === 'team') return p.team === val;
  if (kind === 'person') return p.id === val;
  return false;
}

function matchesAny(p, selectors) {
  return (selectors || []).some((s) => matches(p, s));
}

function approvers(cfg, metricId) {
  const stages = ((cfg.metrics[metricId] || {}).approval) || [];
  return stages[0] ? stages[0].any_of || [] : [];
}

function canApprove(cfg, p, metricId) {
  return matchesAny(p, approvers(cfg, metricId));
}

function owns(cfg, p, metricId) {
  const o = (cfg.metrics[metricId] || {}).owner;
  return o ? matches(p, o) : false;
}

function describeSelectors(cfg, selectors) {
  return selectors
    .map((s) => {
      const [kind, val] = s.split(':');
      const names = cfg.people.filter((p) => matches(p, s)).map((p) => p.name);
      return `${kind} ${val}${names.length ? ' (' + names.join(', ') + ')' : ''}`;
    })
    .join(' or ');
}

// Teams are whatever the people list names.
const teams = (cfg) => [...new Set(cfg.people.map((p) => p.team).filter(Boolean))];

module.exports = { loadConfig, applyDefaults, person, teams, matches, matchesAny, approvers, canApprove, owns, describeSelectors };
