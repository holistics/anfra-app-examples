// The explicit host ↔ panel lifecycle between this app and its Anfra Data App panels, using only what the installed
// SDK (0.8.0) supports:
//   • scope (host → panel): the host writes a JSON context block into the definition it mounts; the panel turns it
//     into an SDK filter condition, so the scope is visible in every query's executed AQL;
//   • refresh (host → panel): after a save commits, the host unmounts and remounts the panel with a new generation and
//     what it expects to see (e.g. the new revision); the panel re-queries the committed version and says whether it
//     sees it. There is no host-side refresh/filter API in the SDK, and none is assumed;
//   • selection (panel → host): the host turns on the SDK's inspection snapshots and reads the panel's cross-filter
//     selection (dimension values only, e.g. a project ID) to offer navigation outside the sandbox, and the controls'
//     applied conditions (a report's period and client) to carry them to the next report;
//   • height (panel → host, layout only): a panel posts its content height as one number, so its frame is as tall as
//     its content and the page scrolls, not the frame. Accepted only from this host's own frame, within bounds.
// Panels run in sandboxed frames and reach data only through this host's Backend, which calls the app server's
// checked proxy with the signed-in user's token.
import { mountDataApp } from '@holistics/anfra-sdk/host';
import { coreApiBackend, coreClient, toDescriptor } from '@holistics/anfra-sdk/api';
import { esc, fmtDateTime } from './ui.js';

let catalog = null; // { client, backend, datasets, definitions, loadedAt }

export async function loadCatalog(getToken, { force = false } = {}) {
  if (catalog && !force) return catalog;
  const authFetch = async (input, init) => {
    const req = new Request(input, init);
    req.headers.set('Authorization', `Bearer ${await getToken()}`);
    return fetch(req);
  };
  const client = coreClient('/anfra/api', authFetch);
  const { data, error, response } = await client.POST('/core.show', { body: {} });
  if (!data) {
    const e = new Error(error?.error?.message ?? `Anfra did not answer (${response.status}).`);
    e.status = response.status;
    throw e;
  }
  const datasets = {}; const definitions = {};
  for (const d of data.object.datasets.filter((x) => x.models)) {
    datasets[d.fqn] = toDescriptor(d);
    definitions[d.fqn] = Object.fromEntries((d.metrics ?? []).map((m) => [m.name, { label: m.label, description: m.description ?? '', definition: m.definition ?? '', hidden: Boolean(m.hidden) }]));
  }
  // The definition version a panel shows: a SHA-256 fingerprint of the dataset's compiled metric definitions, which
  // changes whenever any definition changes (names, labels, descriptions and AQL).
  const fingerprints = {};
  for (const [fqn, defs] of Object.entries(definitions)) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(defs)));
    fingerprints[fqn] = [...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // No exports through this host: without exportQuery the SDK tells panels exports are off.
  const { exportQuery, ...backend } = coreApiBackend(client, { datasets });
  catalog = { client, backend, datasets, definitions, fingerprints, loadedAt: new Date(), diagnostics: data.diagnostics ?? [] };
  return catalog;
}
export function resetCatalog() { catalog = null; }

const definitionCache = new Map();
async function definitionOf(app) {
  if (!definitionCache.has(app)) {
    const r = await fetch(`/panels/${app}.html`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Could not load panel ${app} (${r.status}).`);
    definitionCache.set(app, await r.text());
  }
  return definitionCache.get(app);
}

function withContext(definition, context) {
  const json = JSON.stringify(context).replace(/</g, '\\u003c');
  const block = `<script type="application/json" id="kk-host-context">${json}</script>`;
  return definition.includes('<head>') ? definition.replace('<head>', `<head>\n${block}`) : block + definition;
}

function numericId(uuid) { let h = 0; for (const c of String(uuid)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// Mounts one panel. Returns a handle with refresh(), setScope() and unmount(): the whole lifecycle.
export async function mountPanel(host, { app, scope = {}, session, getToken, height = 520, label, onSelection, onControls }) {
  host.classList.add('panel-host');
  host.innerHTML = `<div class="panel-bar" data-role="bar"><b>${esc(label ?? 'Anfra figures')}</b><span data-role="status">Preparing…</span>
      <span data-role="fresh" class="muted"></span><span style="margin-left:auto" class="small">Governed figures · dataset kumquat_finance</span></div>
    <div class="panel-selection" data-role="selection"></div><div data-role="frame"></div>`;
  const bar = { status: host.querySelector('[data-role=status]'), fresh: host.querySelector('[data-role=fresh]'),
    selection: host.querySelector('[data-role=selection]'), frame: host.querySelector('[data-role=frame]') };
  let mounted = null; let generation = 0; let current = { ...scope }; let lastSelection = null;
  const onMessage = (e) => {
    if (!mounted || e.source !== mounted.frame.contentWindow) return;
    const d = e.data;
    if (!d || d.type !== 'kk:height' || typeof d.height !== 'number' || !Number.isFinite(d.height)) return;
    mounted.frame.style.height = `${Math.min(Math.max(Math.ceil(d.height), 240), 20000)}px`;
  };
  window.addEventListener('message', onMessage);

  const showStatus = (apps) => {
    const queries = Object.values(apps?.[0]?.queries ?? {});
    const executing = queries.filter((q) => q.state === 'executing').length;
    const failed = queries.filter((q) => q.state === 'error');
    const at = queries.map((q) => q.debug?.executedAt).filter(Boolean).map((d) => new Date(d)).sort((a, b) => b - a)[0];
    if (failed.length) bar.status.innerHTML = `<span class="chip bad">Query error</span> ${esc(failed[0].error?.message ?? '')}`;
    else if (executing) bar.status.innerHTML = '<span class="chip info">Querying…</span>';
    else if (queries.length) bar.status.innerHTML = '<span class="chip ok">Loaded</span>';
    if (at) bar.fresh.textContent = `Queried ${fmtDateTime(at)} (load ${generation})`;
  };
  const showSelection = (apps) => {
    const sel = apps?.[0]?.selection;
    const cond = sel?.conditions?.find((c) => c.field === 'projects.project_ref');
    const refs = cond?.values?.map(String).filter((v) => /^NP-\d{4,}$/.test(v)) ?? [];
    const key = refs.join(',');
    if (key === lastSelection) return;
    lastSelection = key;
    if (!refs.length) { bar.selection.classList.remove('visible'); bar.selection.innerHTML = ''; onSelection?.([]); return; }
    bar.selection.classList.add('visible');
    bar.selection.innerHTML = `<span>Selected in the panel: <b>${refs.map(esc).join(', ')}</b></span>` +
      refs.slice(0, 3).map((r) => `<a class="btn small blue" href="#/p/${esc(r)}/money">Open Job 360 ${esc(r)}</a>`).join('');
    onSelection?.(refs);
  };

  async function mount(reason, expect) {
    generation += 1;
    mounted?.unmount();
    mounted = null;
    bar.status.innerHTML = '<span class="chip info">Loading figures…</span>';
    try {
      const cat = await loadCatalog(getToken);
      const definition = await definitionOf(app);
      const context = { ...current, generation, reason: reason ?? 'mount', expect: expect ?? null, mountedAt: new Date().toISOString(),
        definitions: cat.definitions.kumquat_finance ?? {}, definitionsVersion: cat.fingerprints.kumquat_finance ?? null, viewer: { name: session.profile?.display_name, roles: session.roles } };
      bar.frame.innerHTML = '';
      mounted = mountDataApp({
        container: bar.frame,
        definition: withContext(definition, context),
        baseHref: new URL('/panels/', location.href).href,
        datasets: cat.datasets,
        user: { id: numericId(session.id), name: session.profile?.display_name ?? session.email, email: session.email, role: session.roles.join(','),
          timezone: 'Asia/Ho_Chi_Minh', permissions: { canViewGeneratedSql: false, canExportData: false } },
        backend: cat.backend,
        title: label,
        onInspect: (apps) => { showStatus(apps); showSelection(apps); if (onControls && apps?.[0]?.controls) onControls(apps[0].controls); },
      });
      // A starting height until the panel reports its own (see onMessage above).
      mounted.frame.style.height = typeof height === 'number' ? `${height}px` : height;
      mounted.frame.title = label ?? app;
      mounted.setInspecting(true);
    } catch (e) {
      const denied = e.status === 401 || e.status === 403;
      bar.status.innerHTML = `<span class="chip ${denied ? 'warn' : 'bad'}">${denied ? 'Not allowed to see these figures' : 'Could not load the figures'}</span> ${esc(e.message)}`;
      bar.frame.innerHTML = `<div class="banner ${denied ? 'warn' : 'bad'}" style="margin:12px">${esc(denied
        ? 'Your role may not see governed finance figures. Work actions still work.'
        : 'The figures server is not ready.')} <button class="btn small" type="button" data-role="retry">Try again</button></div>`;
      bar.frame.querySelector('[data-role=retry]')?.addEventListener('click', () => mount('retry'));
    }
  }

  await mount('mount');
  return {
    // After a save: re-run every query against the committed data; `expect` lets the panel flag stale results.
    refresh: (reason = 'saved', expect = null) => mount(reason, expect),
    // A different scope (another project, another period) is a new mount with that scope.
    setScope: (next) => { current = { ...current, ...next }; return mount('scope'); },
    unmount: () => { mounted?.unmount(); mounted = null; window.removeEventListener('message', onMessage); },
    get generation() { return generation; },
  };
}
