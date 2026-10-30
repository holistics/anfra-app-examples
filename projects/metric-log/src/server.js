const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const store = require('./store');
const anfra = require('./anfra');
const flow = require('./flow');
const panel = require('./panel');
const { buildIndex } = require('./index');
const breakdown = require('./breakdown');
const rangeLib = require('./range');
const history = require('./history');
const avatars = require('./avatars');
const { person, applyDefaults } = require('./config');

const CLIENT = path.join(__dirname, 'client');
const STATIC = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/chart.js': ['chart.js', 'text/javascript'], '/datepicker.js': ['datepicker.js', 'text/javascript'], '/app.css': ['app.css', 'text/css'] };

function parseCookies(h) {
  return Object.fromEntries((h || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(d))));
  });
}

// Per dataset, over the chosen period: one total query, one weekly query, and the prior period's total.
async function series(cfg, ms, r) {
  const ds = ms[0].dataset;
  const date = ((cfg.canvas || {}).date || {})[ds];
  const filter = (range) => (range ? `filters { ${date} matches @(${range[0]} until ${range[1]}) }` : '');
  const measures = ms.map((m) => `${m.name}: ${m.name}`).join(', ');
  const out = Object.fromEntries(ms.map((m) => [m.id, { value: null, prev: null, spark: [], weeks: [], grain: r.grain }]));
  const total = (range, key) => anfra.query(cfg.anfra.url, ds, `explore { measures { ${measures} } ${date ? filter(range) : ''} }`)
    .then((t) => { for (const m of ms) out[m.id][key] = t.rows[0] ? t.rows[0][m.name] : null; }).catch(() => {});
  await Promise.all([
    total(r.cur, 'value'),
    date && r.prev && total(r.prev, 'prev'),
    date && anfra.query(cfg.anfra.url, ds, `explore { dimensions { t: ${date} | ${r.grain}() } measures { ${measures} } ${filter(r.cur)} sorts { t asc } }`)
      .then((t) => {
        const rows = t.rows.filter((x) => rangeLib.complete(String(x.t).slice(0, 10), r.grain, r.span));
        for (const m of ms) { out[m.id].spark = rows.map((x) => x[m.name]); out[m.id].weeks = rows.map((x) => String(x.t).slice(0, 10)); }
      }).catch(() => {}),
  ]);
  return out;
}

async function tree(cfg, index, r) {
  const metrics = Object.values(index.metrics);
  const byDs = {};
  for (const m of metrics) (byDs[m.dataset] = byDs[m.dataset] || []).push(m);
  const all = Object.assign({}, ...(await Promise.all(Object.values(byDs).map((ms) => series(cfg, ms, r)))));
  return metrics.map((m) => ({
    id: m.id, label: m.label, format: m.format, owner: cfg.metrics[m.id] ? cfg.metrics[m.id].owner : null,
    references: m.references, referencedBy: m.referencedBy, ...all[m.id],
  }));
}

function createServer(cfg) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body, type = 'text/html; charset=utf-8', headers = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...headers }); res.end(body); };
    const json = (v, code = 200) => send(code, JSON.stringify(v), 'application/json');
    try {
      if (req.method === 'GET' && STATIC[url.pathname]) {
        const [f, type] = STATIC[url.pathname];
        return send(200, fs.readFileSync(path.join(CLIENT, f)), `${type}; charset=utf-8`);
      }
      const av = req.method === 'GET' && /^\/av\/(.+?)(\.blink)?\.svg$/.exec(url.pathname);
      if (av) {
        const out = avatars.svg(cfg, decodeURIComponent(av[1]), !!av[2]);
        return out ? send(200, out, 'image/svg+xml', { 'cache-control': 'public, max-age=300' }) : send(404, 'No such person', 'text/plain');
      }
      if (url.pathname === '/health') return send(200, 'ok', 'text/plain');
      if (url.pathname === '/about') return send(200, fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html')));
      const cookies = parseCookies(req.headers.cookie);
      const me = person(cfg, cookies.as) || cfg.people[0];
      const index = buildIndex(cfg.repoPath);
      applyDefaults(cfg, Object.keys(index.metrics));
      const requests = store.listRequests(cfg);
      const ctx = { cfg, me };
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const metricOr404 = (id) => { const m = index.metrics[id]; if (!m) throw Object.assign(new Error('No such metric'), { code: 404 }); return m; };

      if (req.method === 'POST') {
        const body = await readBody(req);
        try {
          if (url.pathname === '/api/as') {
            const p = person(cfg, body.to);
            return send(200, JSON.stringify({ ok: !!p }), 'application/json', { 'set-cookie': `as=${encodeURIComponent(p ? p.id : me.id)}; Path=/; SameSite=Lax` });
          }
          if (url.pathname === '/api/requests') {
            const r = flow.createRequest(cfg, me, body.sentence || '', body.metric);
            return json({ ok: true, open: `request:${r.id}` });
          }
          if (parts[0] === 'api' && parts[1] === 'm' && parts[3] === 'entry') {
            const h = history.fromForm(body);
            if (h) await flow.addHistoryEntry(cfg, me, metricOr404(parts[2]).id, h);
            else await flow.addEntry(cfg, me, metricOr404(parts[2]).id, body.decided, body.note);
            return json({ ok: true });
          }
          if (parts[0] === 'api' && parts[1] === 'r') {
            const id = parts[2];
            if (parts[3] === 'submit') await flow.submit(cfg, me, id, body.definition || '', body.reason || '');
            else if (parts[3] === 'approve') await flow.decide(cfg, me, id, true, body.note || '');
            else if (parts[3] === 'reject') await flow.decide(cfg, me, id, false, body.note || '');
            else return json({ error: 'Unknown action' }, 404);
            return json({ ok: true, open: `request:${id}`, refresh: parts[3] === 'approve' });
          }
          return json({ error: 'Not found' }, 404);
        } catch (e) {
          return json({ error: e.message }, e.code === 404 ? 404 : 400);
        }
      }

      if (url.pathname === '/api/state') {
        return json({ me: me.id, people: cfg.people.map((p) => ({ id: p.id, name: p.name, role: p.role })), notifications: panel.inboxData(cfg, me, requests).mine.length });
      }
      // Each dataset is its own view: its metrics, its date bounds. The client names the one it is showing.
      const datasets = [...new Map(Object.values(index.metrics).map((m) => [m.dataset, m.datasetLabel])).entries()].map(([name, label]) => ({ name, label }));
      const dsName = (v) => (datasets.some((d) => d.name === v) ? v : (datasets[0] || {}).name);
      const rangeFor = async (dataset) => rangeLib.resolve(url.searchParams.get('range'), await rangeLib.bounds(cfg, dataset));
      const dataset = dsName(url.searchParams.get('dataset'));
      const range = await rangeFor(dataset);
      if (url.pathname === '/api/meta') return json({ ...(await rangeLib.bounds(cfg, dataset)), presets: rangeLib.PRESETS, range, datasets, dataset });
      if (url.pathname === '/api/tree') return json(await tree(cfg, { ...index, metrics: Object.fromEntries(Object.entries(index.metrics).filter(([, m]) => m.dataset === dataset)) }, range));
      if (parts[0] === 'api' && parts[1] === 'request' && parts[2]) {
        const r = store.getRequest(cfg, parts[2]);
        return r ? json({ id: r.id, metric: r.metric, state: r.state, impact: r.impact ? r.impact.metrics : null }) : json({ error: 'No such request' }, 404);
      }
      if (url.pathname === '/p/notifications') return send(200, panel.notifications(ctx, index, requests));
      if (parts[0] === 'p' && parts[1] === 'metric' && parts[2]) {
        const m = metricOr404(parts[2]);
        const range = await rangeFor(m.dataset);
        const fields = await breakdown.usable(cfg, m, breakdown.fieldsFor(cfg, m.dataset));
        const asked = url.searchParams.get('bd');
        const dateDim = ((cfg.canvas || {}).date || {})[m.dataset];
        const picked = (fields.find((f) => f.id === asked) || fields.find((f) => f.id === `${dateDim}|${range.grain}`) || {}).id || null;
        const field = fields.find((f) => f.id === picked);
        const [one, split, trend] = await Promise.all([
          series(cfg, [m], range).then((x) => x[m.id]),
          picked ? breakdown.split(cfg, m, picked, range).catch(() => ({ rows: [], total: null, additive: false })) : null,
          breakdown.trend(cfg, m, field, range).catch(() => null),
        ]);
        const vizType = ['area', 'column', 'table'].includes(url.searchParams.get('viz')) ? url.searchParams.get('viz') : 'area';
        const tab = ['comments', 'changes'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'insights';
        const hist = tab === 'insights' ? await history.render(cfg, index, m, { me: me.id, filter: url.searchParams.get('hf'), connected: url.searchParams.get('hc') === '1', hl: url.searchParams.get('hl') }) : null;
        return send(200, panel.metric(ctx, index, m, one, store.listTimeline(cfg, m.id), requests.filter((r) => r.metric === m.id), tab, range, panel.vizCard(m, fields, picked, vizType, split, trend, one, range), hist));
      }
      if (parts[0] === 'p' && parts[1] === 'request' && parts[2]) {
        const r = store.getRequest(cfg, parts[2]);
        return r ? send(200, panel.request(ctx, index, r)) : send(404, '<p class="muted pad">No such request.</p>');
      }
      if (url.pathname === '/p/new') return send(200, panel.newRequest(ctx, index, url.searchParams.get('metric')));
      if (url.pathname === '/p/settings') return send(200, panel.settings(ctx));
      send(404, 'Not found', 'text/plain');
    } catch (e) {
      send(e.code === 404 ? 404 : 500, e.code === 404 ? e.message : 'Something broke: ' + e.message, 'text/plain');
    }
  });
}

// anfra serve must be up: start one for the repo when the configured URL is not answering.
async function ensureAnfra(cfg) {
  if (await anfra.health(cfg.anfra.url)) return null;
  const addr = new URL(cfg.anfra.url).host;
  const child = spawn('anfra', ['serve', '--addr', addr, '--no-mcp'], { cwd: cfg.repoPath, stdio: 'ignore' });
  if (!(await anfra.waitHealthy(cfg.anfra.url))) { child.kill(); throw new Error(`anfra serve did not start on ${cfg.anfra.url}`); }
  return child;
}

module.exports = { createServer, ensureAnfra };
