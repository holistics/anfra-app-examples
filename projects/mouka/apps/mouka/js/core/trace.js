// The trace overlay: hover (or click to pin) any number marked data-trace="query:alias" to see
// the metric behind it, its governed definition, and the exact AQL / SQL that produced it.
(() => {
  const pop = document.getElementById('trace-pop');
  let on = false, pinned = false;

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function info(el) {
    const [qname, alias] = (el.dataset.trace || '').split(':');
    const reg = WF.registry.get(qname);
    if (!reg) return null;
    const metric = reg.metrics[alias];
    const def = metric ? WF.DEFS?.[reg.dataset]?.[metric] : null;
    const sdk = metric ? Anfra.datasets?.[reg.dataset]?.metrics?.find((m) => m.name === metric) : null;
    return { qname, alias, reg, metric, def, label: def?.label ?? sdk?.label ?? metric ?? alias };
  }
  function show(el, x, y, anchor) {
    const i = info(el);
    if (!i) return;
    const { reg } = i, res = reg.query.result;
    let body = `<h4>${esc(i.label)}</h4><div class="meta">${i.metric ? `metric <b>${esc(i.metric)}</b>` : 'computed in this query from governed metrics'} · dataset ${esc(reg.dataset)} · query ${esc(i.qname)}</div>`;
    if (i.def?.description) body += `<div>${esc(i.def.description)}</div>`;
    if (i.def?.definition) {
      body += `<div class="k">Definition (AML)</div><pre>${esc(i.def.definition)}</pre>`;
      // One level down: the governed metrics this definition is built on, with their own definitions.
      const defs = WF.DEFS?.[reg.dataset] ?? {};
      const parts = [...new Set(i.def.definition.match(/\b[a-z_][a-z0-9_]*\b/g) ?? [])].filter((n) => n !== i.metric && defs[n]?.definition);
      for (const n of parts) body += `<div class="k">Built on ${esc(n)}</div><pre>${esc(defs[n].definition)}</pre>`;
    }
    if (reg.query.state === 'error') body += `<div class="k">State</div><pre>Query failed: ${esc(reg.query.error?.message)}</pre>`;
    else if (!res) body += `<div class="k">State</div><pre>Still loading…</pre>`;
    else {
      body += `<div class="k">AQL that ran (with this page's filters)</div><pre>${esc(res.debug?.executedAql ?? '(not available)')}</pre>`;
      if (Anfra.user?.permissions?.canViewGeneratedSql && res.debug?.executedSql) body += `<button type="button" data-sql>Show SQL</button><pre data-sqlbox hidden>${esc(res.debug.executedSql)}</pre>`;
    }
    pop.innerHTML = body;
    pop.hidden = false;
    pop.scrollTop = 0;
    if (anchor) { lastAnchor = anchor; place(anchor); return; }
    lastAnchor = null;
    pop.style.maxHeight = '';
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.min(x + 14, innerWidth - w - 12)}px`;
    pop.style.top = `${Math.min(y + 14, innerHeight - h - 12)}px`;
  }
  // beside an anchor (a card's ⓘ): on the side with the most room. Left or right when the popover's width fits (top
  // aligned with the anchor), else below or above; its height is capped by the room on that side and the rest scrolls.
  let lastAnchor = null;
  function place(a) {
    const M = 12, G = 8;
    pop.style.maxHeight = '';
    const w = pop.offsetWidth;
    const room = { right: innerWidth - a.right - G - M, left: a.left - G - M, below: innerHeight - a.bottom - G - M, above: a.top - G - M };
    const side = (room.right >= w || room.left >= w) ? (room.right >= room.left ? 'right' : 'left') : (room.below >= room.above ? 'below' : 'above');
    const cap = side === 'below' ? room.below : side === 'above' ? room.above : innerHeight - 2 * M;
    pop.style.maxHeight = `${Math.max(160, Math.min(cap, 520))}px`;
    const h = pop.offsetHeight;
    const clampX = (v) => Math.max(M, Math.min(v, innerWidth - w - M)), clampY = (v) => Math.max(M, Math.min(v, innerHeight - h - M));
    if (side === 'right') { pop.style.left = `${a.right + G}px`; pop.style.top = `${clampY(a.top - 8)}px`; }
    else if (side === 'left') { pop.style.left = `${a.left - G - w}px`; pop.style.top = `${clampY(a.top - 8)}px`; }
    else if (side === 'below') { pop.style.left = `${clampX(a.left - 8)}px`; pop.style.top = `${a.bottom + G}px`; }
    else { pop.style.left = `${clampX(a.left - 8)}px`; pop.style.top = `${Math.max(M, a.top - G - h)}px`; }
    pop.dataset.side = side;
  }
  pop.addEventListener('click', (e) => {
    if (e.target.matches('[data-sql]')) { pop.querySelector('[data-sqlbox]').hidden = false; e.target.remove(); }
  });
  document.addEventListener('mouseover', (e) => {
    if (!on || pinned) return;
    const el = e.target.closest('[data-trace]');
    if (el) show(el, e.clientX, e.clientY); else if (!pop.contains(e.target)) pop.hidden = true;
  });
  document.addEventListener('click', (e) => {
    // Off: only a pinned explain() popover is live; a click elsewhere closes it.
    if (!on) { if (pinned && !pop.contains(e.target) && !e.target.closest('[data-explain]')) { pinned = false; pop.hidden = true; } return; }
    const el = e.target.closest('[data-trace]');
    if (el) { pinned = true; show(el, e.clientX, e.clientY); e.preventDefault(); e.stopPropagation(); }
    else if (!pop.contains(e.target)) { pinned = false; pop.hidden = true; }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = false; pop.hidden = true; } });
  WF.tracer = {
    get on() { return on; },
    toggle() { on = !on; pinned = false; pop.hidden = true; document.body.classList.toggle('tracing', on); },
    // Pin the popover for one "query:alias" without turning trace mode on (a sibling look's per-card button).
    explain(trace, x, y, anchor) { pinned = true; show({ dataset: { trace } }, x, y, anchor); },
    reposition() { if (lastAnchor && !pop.hidden) place(lastAnchor); },
    close() { pinned = false; pop.hidden = true; },
  };
})();
