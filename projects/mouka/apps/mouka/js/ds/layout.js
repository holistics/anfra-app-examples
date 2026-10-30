// OG.layout(view): turns a page's arrangement in js/pages.js into HTML, filling it with the view's blocks.
// A view defines `this.blocks = { 'block-id': () => html }` in init (each block is one card); pages.js says where they go.
//
// Page grammar (nodes nest freely; ds/layout.css styles them):
//   'block-id'                                       one block
//   [node, node]                                     siblings, no wrapper
//   { row: [node…], …common }                        the 12-column grid                           → .row
//   { stack: [node…], span?, rail?, …common }        one column of cards; inside a row it spans    → .stack.span-N
//                                                    span (8 | 6 | 4 | 12, default 12) columns. rail: true marks the
//                                                    right rail, whose cards go side by side at sm (DESIGN.md § Breakpoints)
//   { pair: [node, node], …common }                  two equal halves (inside a span-8 column: 4 + 4)  → .pair
//   { grid: 'css-class', items: [node…], …common }   a page-specific grid defined in css/<page>.css
// common: container / label become data-anfra-container / data-anfra-label (the Anfra outline of the page); id; cls.
//
// A block id that no view defines renders a red placeholder card (and a console warning) instead of vanishing.
// A block the page doesn't place is still rendered, hidden, so the view's code that fills it keeps working.
(() => {
  const SPANS = [4, 6, 8, 12];
  const esc = (s) => OG.esc(s);
  const attrs = (n) => `${n.id ? ` id="${esc(n.id)}"` : ''}${n.container ? ` data-anfra-container="${esc(n.container)}"` : ''}${n.label ? ` data-anfra-label="${esc(n.label)}"` : ''}`;
  const cls = (...c) => c.filter(Boolean).join(' ');

  function render(node, ctx) {
    if (Array.isArray(node)) return node.map((n) => render(n, ctx)).join('\n');
    if (typeof node === 'string') {
      const b = ctx.blocks[node];
      if (!b) {
        console.warn(`pages.js: "${ctx.page}" places block "${node}", but the view defines: ${Object.keys(ctx.blocks).join(', ')}`);
        return `<section class="card ds-missing" data-anfra-block="missing-${esc(node)}">Unknown block “${esc(node)}” in js/pages.js (${esc(ctx.page)})</section>`;
      }
      ctx.used.add(node);
      return b();
    }
    if (node && node.row) return `<div class="${cls('row', node.cls)}"${attrs(node)}>\n${render(node.row, ctx)}\n</div>`;
    if (node && node.stack) {
      if (node.span && !SPANS.includes(node.span)) console.warn(`pages.js: span ${node.span} on "${ctx.page}" (use ${SPANS.join(' | ')})`);
      return `<div class="${cls('stack', node.span && `span-${node.span}`, node.rail && 'rail', node.cls)}"${attrs(node)}>\n${render(node.stack, ctx)}\n</div>`;
    }
    if (node && node.pair) return `<div class="${cls('pair', node.cls)}"${attrs(node)}>\n${render(node.pair, ctx)}\n</div>`;
    if (node && node.grid) return `<div class="${cls(node.grid, node.cls)}"${attrs(node)}>\n${render(node.items ?? [], ctx)}\n</div>`;
    console.warn(`pages.js: can't read node on "${ctx.page}"`, node);
    return '';
  }

  OG.layout = (view) => {
    const blocks = view.blocks ?? {};
    const page = OG.PAGES?.[view.id] ?? { stack: Object.keys(blocks) };
    const ctx = { blocks, used: new Set(), page: view.id };
    let html = render(page, ctx);
    const left = Object.keys(blocks).filter((k) => !ctx.used.has(k));
    if (left.length) html += `\n<div hidden data-ds-unplaced="${esc(left.join(' '))}">${left.map((k) => blocks[k]()).join('\n')}</div>`;
    return html;
  };
  OG.SPANS = SPANS;
})();

// The sticky right rail (ds/layout.css): top = the gap when the rail fits the window, else window − rail − gap (negative),
// so a rail taller than the window scrolls to its last card and then holds. Re-measured whenever a rail or the window resizes.
(() => {
  const seen = new WeakSet();
  const place = (r) => {
    const gap = parseFloat(getComputedStyle(r).getPropertyValue('--sp-5')) || 20;
    r.style.setProperty('--rail-top', `${Math.min(gap, window.innerHeight - r.offsetHeight - gap)}px`);
  };
  const ro = new ResizeObserver((es) => es.forEach((e) => place(e.target)));
  OG.stickRails = () => document.querySelectorAll('.row > .rail').forEach((r) => { if (!seen.has(r)) { seen.add(r); ro.observe(r); } place(r); });
  window.addEventListener('resize', () => OG.stickRails());
  WF.app.subscribe(() => OG.stickRails());
})();
