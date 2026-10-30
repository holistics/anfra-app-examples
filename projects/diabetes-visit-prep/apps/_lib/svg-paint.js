// The host's picture of the app (Anfra.render) clones an <svg> without the page's CSS, so a shape colored by a CSS rule or
// a var() comes out black. pin() writes each shape's computed paint into its attributes; the page looks the same, as
// CSS beats attributes. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.svgPaint = (() => {
  const PROPERTIES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'vector-effect'];
  // Per shape, what pin() wrote and what the code had set before, so the next pin() reads the styles as the code and the
  // CSS set them now, not as the last pin froze them. An attribute the code changed since is the code's.
  const pins = new WeakMap();
  const roots = new Set();

  function unpin (shape) {
    const pinned = pins.get(shape);
    if (!pinned) return;
    for (const property of PROPERTIES) {
      if (shape.getAttribute(property) !== pinned.written[property]) continue;
      if (pinned.authored[property] === null) shape.removeAttribute(property);
      else shape.setAttribute(property, pinned.authored[property]);
    }
    pins.delete(shape);
  }

  function pin (root) {
    roots.add(root);
    const shapes = [...root.querySelectorAll('svg *')];
    for (const shape of shapes) unpin(shape);
    // Every value is read before any is written: a child inherits from its parent's attributes.
    const computed = shapes.map((shape) => {
      const style = getComputedStyle(shape);
      return Object.fromEntries(PROPERTIES.map((property) => [property, style.getPropertyValue(property)]));
    });
    shapes.forEach((shape, i) => {
      const authored = Object.fromEntries(PROPERTIES.map((property) => [property, shape.getAttribute(property)]));
      for (const [property, value] of Object.entries(computed[i])) shape.setAttribute(property, value);
      pins.set(shape, { authored, written: computed[i] });
    });
  }

  // A switch between light and dark changes the tokens under every pinned color.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { for (const root of roots) pin(root); });

  return { pin };
})();
