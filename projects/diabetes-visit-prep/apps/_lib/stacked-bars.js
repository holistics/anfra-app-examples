// Side-by-side 100% stacked bars, each named below; segments stack from the bottom in the order given, separated by a
// surface gap. Knows nothing about queries; the page passes values, colors and names. Classic script.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.stackedBars = (() => {
  // bars: { label, segments: [{ value, color, name }] }; a bar with no segments (no data) draws an empty track.
  function paint (container, bars) {
    container.classList.add('stacked-bars');
    container.replaceChildren(...bars.map(({ label, segments }) => {
      const bar = Object.assign(document.createElement('div'), { className: 'stacked-bar' });
      const track = Object.assign(document.createElement('div'), { className: 'stacked-bar-track' });
      const total = segments.reduce((sum, { value }) => sum + value, 0);
      track.append(...segments.filter(({ value }) => value > 0).map(({ value, color, name }) => {
        const segment = Object.assign(document.createElement('span'), { className: 'stacked-bar-segment', title: name });
        segment.style.flexGrow = value / total;
        segment.style.background = color;
        return segment;
      }));
      bar.append(track, Object.assign(document.createElement('span'), { className: 'stacked-bar-label', textContent: label }));
      return bar;
    }));
  }

  return { paint };
})();
