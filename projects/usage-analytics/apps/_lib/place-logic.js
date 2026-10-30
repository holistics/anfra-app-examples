// Pure logic for moving blocks around a canvas: when two blocks overlap, either the other one slides out of the way or the
// dragged one settles in the nearest free spot. No DOM here, so it is unit tested. A rect is { left, top, right, bottom }.
(function (root) {
  const GAP = 12;   // clear space left between blocks that were pushed or settled apart

  // How deep a overlaps b on each axis ({ x, y }), or null when they only touch or are apart.
  function overlap (a, b) {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 0 && y > 0 ? { x, y } : null;
  }

  const shifted = (r, dx, dy) => ({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });

  // Smart shifting: slide every block the mover overlaps out of its way along the axis it overlaps least, away from the
  // mover's centre. A block that is pushed onto another one pushes that one too. Returns { [index in peers]: { dx, dy } }
  // for the blocks that have to move; the rest stay where they are. Nothing is changed, so the caller can call this on every
  // pointer move from the same starting rects and blocks slide back when the mover leaves.
  // `bounds` ({ left, right }, optional) is the canvas: a sideways push that would leave it becomes a push up or down instead.
  function push (mover, peers, gap = GAP, bounds = null) {
    const cur = peers.map((r) => r), out = {};
    const queue = [{ r: mover, i: -1, mx: 0, my: 0 }];
    let guard = peers.length * 4 + 4;   // a ring of blocks pushing each other cannot loop for ever
    while (queue.length && guard-- > 0) {
      const { r: m, i: self, mx, my } = queue.shift();
      cur.forEach((r, i) => {
        if (i === self) return;
        const o = overlap(m, r);
        if (!o) return;
        // Clear the whole of the pusher's edge, so a block that sits inside it still ends up outside it.
        const sideways = (dir) => (dir > 0 ? m.right + gap - r.left : m.left - gap - r.right);
        const vertical = (dir) => (dir > 0 ? m.bottom + gap - r.top : m.top - gap - r.bottom);
        const away = (a, b, c, d) => ((a + b) >= (c + d) ? 1 : -1);
        let dx = 0, dy = 0;
        if (self >= 0) {
          // A block that was itself pushed keeps pushing the way it went, and only the blocks that were ahead of it in that
          // direction to begin with, so two blocks never push each other back and forth and never double back onto the mover.
          const o0 = peers[self], r0 = peers[i];
          if (Math.abs(mx) > Math.abs(my)) { if (Math.sign(mx) * ((r0.left + r0.right) - (o0.left + o0.right)) < 0) return; dx = sideways(Math.sign(mx)); }
          else { if (Math.sign(my) * ((r0.top + r0.bottom) - (o0.top + o0.bottom)) < 0) return; dy = vertical(Math.sign(my)); }
        } else if (o.y <= o.x) dy = vertical(away(r.top, r.bottom, m.top, m.bottom));
        else dx = sideways(away(r.left, r.right, m.left, m.right));
        if (dx && bounds && (r.left + dx < bounds.left - 0.5 || r.right + dx > bounds.right + 0.5)) { dx = 0; dy = vertical(away(r.top, r.bottom, m.top, m.bottom)); }
        cur[i] = shifted(r, dx, dy);
        const t = out[i] || { dx: 0, dy: 0 };
        out[i] = { dx: t.dx + dx, dy: t.dy + dy };
        queue.push({ r: cur[i], i, mx: dx, my: dy });
      });
    }
    return out;
  }

  // Prioritize non-overlap: when `rect` sits on other blocks, the smallest shift that puts it beside them (left, right, above or
  // below one it overlaps) without landing on a third. Returns { dx, dy }, or null when it overlaps nothing or the nearest free
  // spot is further than `reach` px (the drag then stays where the pointer put it).
  function nearestFree (rect, peers, reach, gap = GAP) {
    const hit = peers.filter((p) => overlap(rect, p));
    if (!hit.length) return null;
    let best = null;
    for (const p of hit) {
      for (const [dx, dy] of [[p.left - gap - rect.right, 0], [p.right + gap - rect.left, 0], [0, p.top - gap - rect.bottom], [0, p.bottom + gap - rect.top]]) {
        const r = shifted(rect, dx, dy);
        if (peers.some((q) => overlap(r, q))) continue;
        const d = Math.hypot(dx, dy);
        if (d <= reach && (!best || d < best.d)) best = { dx, dy, d };
      }
    }
    return best && { dx: best.dx, dy: best.dy };
  }

  const PlaceLogic = { GAP, overlap, push, nearestFree };
  if (typeof module !== 'undefined' && module.exports) module.exports = PlaceLogic;
  else root.PlaceLogic = PlaceLogic;
})(typeof window !== 'undefined' ? window : globalThis);
