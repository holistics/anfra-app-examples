// A stale edit never overwrites newer data. This shows what the user changed next to what is saved now, keeps the
// draft, and lets the user re-apply their changes on the latest version (a new save with the new version).
import { esc, errorBanner } from '../ui.js';

const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function renderConflict(host, { error, latest, draft, original, labels, onReapply, onDiscard }) {
  const fields = Object.keys(draft);
  const rows = fields.map((f) => {
    const theirs = latest?.[f];
    const changedByOther = show(theirs) !== show(original?.[f]);
    return `<tr><td>${esc(labels[f] ?? f)}</td><td class="mine">${esc(show(draft[f]))}</td>
      <td class="theirs">${esc(show(theirs))}${changedByOther ? ' <span class="chip warn">changed by someone else</span>' : ''}</td></tr>`;
  }).join('');
  host.innerHTML = `${errorBanner(error)}
    <div class="card tight"><h3>Your changes compared with the latest saved version (v${esc(latest?.version ?? '?')})</h3>
      <div class="table-wrap"><table class="diff"><thead><tr><th>Field</th><th>You were saving</th><th>Saved now</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" data-act="reapply">Apply my changes to the latest version</button>
        <button class="btn" type="button" data-act="discard">Discard my draft, use the latest</button></div></div>`;
  host.querySelector('[data-act=reapply]').addEventListener('click', onReapply);
  host.querySelector('[data-act=discard]').addEventListener('click', onDiscard);
}
