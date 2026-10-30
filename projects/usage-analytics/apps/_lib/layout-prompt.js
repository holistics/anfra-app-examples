// Turns a saved layout into a prompt for a coding agent, so what the user arranged in the page becomes the page's own default.
// No DOM here, so it is unit tested. The page gathers the facts (what moved, what was resized, what was deleted, which Tweaks were picked)
// and this writes them up. It returns '' when nothing differs from the default.
(function (root) {
  const px = (n) => `${Math.round(n * 100) / 100}px`;

  // facts: { file, width, moves: [{ label, selector, x, y }], sizes: [{ label, selector, width, height }],
  //          wave: { width, height } | null, deleted: [{ label, block }], tweaks: [{ key, label, value, def }] }
  function build (facts) {
    const f = facts || {};
    const moves = f.moves || [], sizes = f.sizes || [], deleted = f.deleted || [], tweaks = f.tweaks || [];
    if (!moves.length && !sizes.length && !f.wave && !deleted.length && !tweaks.length) return '';

    const out = [
      `Change the default layout of ${f.file || 'this Data App'} so it matches the layout below. Edit the app's own CSS and markup, not data or queries.`,
      '',
      `The layout editor applies these as inline styles at runtime and keeps them in the browser (localStorage key "${f.storageKey || 'lay-saved'}"). ` +
        'Move them into the page itself so they are the default for everyone and survive a cleared browser. Offsets are in px, measured with the window ' +
        `${f.width ? `${Math.round(f.width)}px` : ''} wide, from where the layout puts each block with no offset.`,
    ];

    if (moves.length) {
      out.push('', 'Moved blocks (apply as `translate: X Y` on the element):');
      moves.forEach((m) => out.push(`- ${m.label} (${m.selector}): translate ${px(m.x)} ${px(m.y)}`));
    }
    if (sizes.length) {
      out.push('', 'Resized cards (give the card this width and height; the editor also adds the class "sized"):');
      sizes.forEach((s) => out.push(`- ${s.label} (${s.selector}): width ${s.width || 'unchanged'}, height ${s.height || 'unchanged'}`));
    }
    if (f.wave) out.push('', `Wave behind the title (.hero .wave): width ${f.wave.width || 'unchanged'}, height ${f.wave.height || 'unchanged'}`);
    if (deleted.length) {
      out.push('', 'Deleted blocks (remove them from the markup, with the code that renders them):');
      deleted.forEach((d) => out.push(`- ${d.label} (data-anfra-block="${d.block}")`));
    }
    if (tweaks.length) {
      out.push('', 'Tweaks to make the default (in the data-edit-mode-tweaks JSON, set "default" to the picked value):');
      tweaks.forEach((t) => out.push(`- ${t.label || t.key} (${t.key}): ${t.def} → ${t.value}`));
    }

    out.push('', 'When it is done, reload the page with browser storage cleared and check it looks like this layout.');
    return out.join('\n');
  }

  const LayoutPrompt = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = LayoutPrompt;
  else root.LayoutPrompt = LayoutPrompt;
})(typeof window !== 'undefined' ? window : globalThis);
