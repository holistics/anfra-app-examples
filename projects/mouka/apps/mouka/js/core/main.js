// Sidebar and header wiring, then boot. Event delegation: views re-render their own markup.
(() => {
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav-item[data-nav]');
    if (nav) return WF.go(nav.dataset.nav);
    const go = e.target.closest('[data-go]');
    if (go) return WF.go(go.dataset.go);
    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'trace') { WF.tracer?.toggle(); document.querySelectorAll('[data-action="trace"]').forEach((b) => b.classList.toggle('on', WF.tracer.on)); }
    if (act.dataset.action === 'privacy') { document.body.classList.toggle('privacy'); document.querySelectorAll('[data-action="privacy"]').forEach((b) => b.classList.toggle('on')); }
    if (act.dataset.action === 'expand') document.querySelector('.shell').classList.toggle('expanded');
  });
  WF.boot(document.body.dataset.defaultView ?? 'dashboard/investments');
})();
