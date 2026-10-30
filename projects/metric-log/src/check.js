const fs = require('fs');
const path = require('path');
const { matches, person, applyDefaults } = require('./config');
const { buildIndex } = require('./index');
const { gitRoot } = require('./git');

function check(cfg) {
  const errors = [];
  const ids = cfg.people.map((p) => p.id);
  if (cfg.version !== 1) errors.push('version must be 1');
  if (new Set(ids).size !== ids.length) errors.push('people ids must be unique');
  if (!fs.existsSync(path.join(cfg.repoPath, 'datasets'))) errors.push(`no datasets/ folder in ${cfg.repoPath}: not an Anfra repo`);
  if (!gitRoot(cfg.repoPath)) errors.push(`${cfg.repoPath} is not inside a git repository`);
  const index = buildIndex(cfg.repoPath);
  const own = new Set(Object.keys(cfg.metrics));
  applyDefaults(cfg, Object.keys(index.metrics));
  const selector = (s, where) => {
    const [kind, val] = String(s).split(':');
    if (!['role', 'team', 'person'].includes(kind) || !val) return errors.push(`${where}: "${s}" is not role:, team: or person:`);
    if (!cfg.people.some((p) => matches(p, s))) errors.push(`${where}: nobody matches ${s}`);
  };
  for (const [id, m] of Object.entries(cfg.metrics)) {
    if (!index.metrics[id]) errors.push(`metrics.${id}: no such metric in the dataset files`);
    if (!own.has(id)) continue;
    if (!m.owner) errors.push(`metrics.${id}: owner is missing (add it, or set defaults.owner)`); else selector(m.owner, `metrics.${id}.owner`);
    if (!Array.isArray(m.approval) || !m.approval.length) errors.push(`metrics.${id}: approval needs at least one stage (add it, or set defaults.approval)`);
    else if (m.approval.length > 1) errors.push(`metrics.${id}: only one approval stage is enforced in this version`);
    for (const st of m.approval || []) (st.any_of || []).forEach((s) => selector(s, `metrics.${id}.approval`));
  }
  const dflt = cfg.defaults || {};
  if (dflt.owner) selector(dflt.owner, 'defaults.owner');
  if (dflt.approval) {
    if (!Array.isArray(dflt.approval) || dflt.approval.length !== 1) errors.push('defaults.approval: give exactly one stage');
    else (dflt.approval[0].any_of || []).forEach((s) => selector(s, 'defaults.approval'));
  }
  const missing = Object.keys(index.metrics).filter((id) => !cfg.metrics[id] || !cfg.metrics[id].owner || !cfg.metrics[id].approval);
  if (missing.length) errors.push(`${missing.length} metric(s) have no owner or approver and no defaults cover them (for example ${missing[0]}): set defaults.owner and defaults.approval`);
  for (const d of cfg.simulated_drafts) if (!index.metrics[d.metric]) errors.push(`simulated draft "${d.sentence}": no such metric ${d.metric}`);
  if (!cfg.anfra.url) errors.push('anfra.url is missing');
  return { errors, metrics: Object.keys(index.metrics).length };
}

module.exports = { check, person };
