// Explains governed metrics in place: any element with data-metric="<metric name>" shows that metric's
// label and description from the catalog on hover or keyboard focus. The text lives in AML, never here.
window.VisitPrep = window.VisitPrep || {};
VisitPrep.metricDescriptions = (() => {
  // One lineage call is enough: the dataset's card lists every metric of the dataset, not only the traced one.
  async function load (dataset, anyMetric) {
    const { results: [result] } = await Anfra.lineage({ parent: dataset, child: anyMetric });
    if (result.error) throw new Error(result.error);
    const descriptions = new Map();
    const datasetCard = result.diagram.cards.find((card) => card.props?.fqn === dataset);
    if (!datasetCard) throw new Error(`the catalog has no dataset "${dataset}"; run anfra ingest`);
    for (const section of datasetCard.sections) {
      if (section.type !== 'aml.metric') continue;
      for (const { props } of section.nodes) descriptions.set(props.name, { label: props.label, text: props.description, fqn: props.fqn });
    }
    return descriptions;
  }

  const ARROW_GAP = 9;

  // Makes every [data-metric] element under root explain itself, including ones added or retagged later.
  function attachTooltips (root, descriptions) {
    const tooltip = document.createElement('div');
    tooltip.className = 'metric-tooltip';
    tooltip.id = 'metric-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    root.classList.add('has-metric-tooltips');

    // The described element is lit while its tooltip is open, so neighbouring metrics can't be mistaken for it.
    let describedElement;
    function show (element) {
      const description = descriptions.get(element.dataset.metric);
      if (!description) return;
      describedElement?.classList.remove('metric-described');
      describedElement = element;
      element.classList.add('metric-described');
      tooltip.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: description.label }),
        Object.assign(document.createElement('p'), { textContent: description.text ?? '' }),
        Object.assign(document.createElement('code'), { textContent: description.fqn }),
      );
      tooltip.hidden = false;
      element.setAttribute('aria-describedby', tooltip.id);
      const box = element.getBoundingClientRect();
      const left = Math.max(8, Math.min(box.left, document.documentElement.clientWidth - tooltip.offsetWidth - 8));
      const below = box.bottom + ARROW_GAP + tooltip.offsetHeight <= document.documentElement.clientHeight;
      tooltip.style.left = `${left + window.scrollX}px`;
      tooltip.style.top = `${(below ? box.bottom + ARROW_GAP : box.top - ARROW_GAP - tooltip.offsetHeight) + window.scrollY}px`;
      // The arrow points at the element's centre, kept clear of the tooltip's rounded corners.
      const arrowLeft = Math.max(12, Math.min(box.left + box.width / 2 - left, tooltip.offsetWidth - 12));
      tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
      tooltip.dataset.side = below ? 'below' : 'above';
    }
    function hide (element) {
      tooltip.hidden = true;
      element?.removeAttribute('aria-describedby');
      element?.classList.remove('metric-described');
    }

    const findMetricElement = (event) => event.target.closest?.('[data-metric]');
    root.addEventListener('mouseover', (event) => { const element = findMetricElement(event); if (element) show(element); });
    root.addEventListener('mouseout', (event) => { const element = findMetricElement(event); if (element && !element.contains(event.relatedTarget)) hide(element); });
    // Keyboard focus only: a click also focuses, and its tooltip would then stay up after the mouse leaves.
    root.addEventListener('focusin', (event) => { const element = findMetricElement(event); if (element?.matches(':focus-visible')) show(element); });
    root.addEventListener('focusout', (event) => hide(findMetricElement(event)));
    // Tagged elements join the tab order so the descriptions are reachable without a mouse.
    new MutationObserver(() => {
      for (const element of root.querySelectorAll('[data-metric]:not([tabindex])')) element.tabIndex = 0;
    }).observe(root, { subtree: true, attributes: true, attributeFilter: ['data-metric'], childList: true });
    for (const element of root.querySelectorAll('[data-metric]')) element.tabIndex = 0;
  }

  return { load, attachTooltips };
})();
