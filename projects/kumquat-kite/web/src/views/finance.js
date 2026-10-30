// Finance review: pending cost/commercial changes and acceptance milestones. Finance compares the previous and the
// proposed value with the evidence and the governed scenario, then approves (a new revision and its audit event, in
// one database transaction) or rejects with a reason. The decision is checked by the database: anyone else who tries
// is refused there, which this screen shows rather than hides.
// 1100px they stack, and a chosen proposal shows alone, full width, with a link back to the inbox (styles.css .split).
import { esc, link, vnd, fmtDate, fmtDateTime, fmtVnd, toast, errorBanner, loading, emptyState, saving, qs, tip } from '../ui.js';
import { CR_STATUS, label } from '../labels.js';
import { mountPanel } from '../anfra-host.js';

let panel = null;
export async function leave() { panel?.unmount(); panel = null; }

export async function render(el, ctx, _parts, params) {
  await leave();
  el.innerHTML = loading('Loading the review inbox…');
  const finance = ctx.has('finance');
  const selCr = params.get('cr'); const selAc = params.get('ac');
  let data;
  const load = async () => {
    const [pending, acceptance, recent] = await Promise.all([ctx.api.changeRequests({ status: 'pending' }), ctx.api.acceptance(), ctx.api.changeRequests()]);
    data = { pending, acceptance, recent };
  };
  try { await load(); } catch (e) { el.innerHTML = errorBanner(e); return; }
  el.innerHTML = `<div class="title-row"><h1>Finance review</h1>${tip('Compare the approved and the proposed value with the evidence and the governed scenario, then approve or reject with a reason. Approval saves a new revision and its audit event in one transaction.', { step: 5 })}</div><p class="sub">${finance ? 'Compare the approved value with the proposal and its evidence; approving writes a new revision and its history entry in one transaction.'
      : 'You can see the inbox; only Finance may approve or reject — and the database enforces it.'}</p>
    <div class="split${selCr || selAc ? ' has-selection' : ''}"><section class="stack split-list" id="lists" aria-label="Review inbox"></section>
      <section class="split-detail" aria-label="Selected item"><a class="btn small split-back" href="#/finance">← Back to the review inbox</a>
        <div id="detail">${selCr || selAc ? loading() : '<div class="empty">Pick a proposal to see its details and decide.</div>'}</div></section></div>`;
  if (selCr || selAc) window.scrollTo(0, 0);
  const due = (ts) => fmtDate(new Date(new Date(ts).getTime() + 2 * 86400000));
  // The lists are redrawn on their own after a decision, so the panel beside them is not remounted a second time.
  const drawLists = () => {
    const { pending, acceptance, recent } = data;
    const submitted = acceptance.filter((m) => m.status === 'submitted');
    qs('#lists', el).innerHTML = `<h2>Proposals waiting (${pending.length})</h2><div class="queue">${pending.map((r) => `<a class="item ${r.id === selCr ? 'review' : ''}" href="#/finance?cr=${esc(r.id)}" style="text-decoration:none;color:inherit">
        <div class="reason">${esc(r.request_ref)} · ${esc(r.project?.project_ref)} ${esc(r.project?.title)}</div>
        <div class="actions"><span class="chip warn">Review by ${esc(due(r.requested_at))}</span></div>
        <div class="small">${r.previous_amount_status ? vnd(r.previous_amount) : 'new line'} → <b>${vnd(r.proposed_amount)}</b> · ${esc(ctx.personName(r.requested_by))} · ${esc(fmtDateTime(r.requested_at))}</div>
        <div class="done">Reason: <b>${esc(r.reason)}</b></div></a>`).join('') || emptyState('No proposal is waiting.')}</div>
      <h2>Acceptance waiting for verification (${submitted.length})</h2><div class="queue">${submitted.map((m) => `<a class="item ${m.id === selAc ? 'review' : ''}" href="#/finance?ac=${esc(m.id)}" style="text-decoration:none;color:inherit">
        <div class="reason">${esc(m.milestone_ref)} · ${esc(m.project?.project_ref)} ${esc(m.project?.title)}</div><div class="small">${vnd(m.amount)} · dated ${esc(fmtDate(m.effective_date))}</div></a>`).join('') || emptyState('No acceptance is waiting.')}</div>
      <h2>Recently decided</h2><div class="table-wrap"><table><tbody>${recent.filter((r) => r.status !== 'pending').slice(0, 8).map((r) => `<tr><td class="ref"><b>${esc(r.request_ref)}</b><span class="sub">${esc(r.project?.project_ref)}</span></td>
        <td class="change"><span class="v">${r.previous_amount_status ? vnd(r.previous_amount) : 'New line'}</span> <span class="v">→ ${vnd(r.proposed_amount)}</span></td><td><span class="chip ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'ghost'}">${esc(label(CR_STATUS, r.status))}</span></td></tr>`).join('')}</tbody></table></div>`;
  };
  drawLists();
  const refreshLists = async () => { try { await load(); drawLists(); } catch { /* the decision itself already reported */ } };
  const detail = qs('#detail', el);
  if (selCr) {
    const r = data.recent.find((x) => x.id === selCr) ?? data.pending.find((x) => x.id === selCr);
    if (!r) { detail.innerHTML = errorBanner({ kind: 'not_found', message: 'Proposal not found (it may already have been decided).' }); return; }
    await crDetail(detail, r, ctx, refreshLists);
  } else if (selAc) {
    const m = data.acceptance.find((x) => x.id === selAc);
    if (!m) { detail.innerHTML = errorBanner({ kind: 'not_found', message: 'Acceptance milestone not found.' }); return; }
    acDetail(detail, m, ctx, () => render(el, ctx, _parts, params));
  }
}

async function crDetail(host, r, ctx, reload) {
  const finance = ctx.has('finance');
  const own = r.requested_by === ctx.session.id;
  const lines = await ctx.api.moneyLines(r.project_id);
  const line = [...lines.revenue, ...lines.cost].find((l) => l.id === (r.cost_line_id ?? r.service_line_id));
  const delta = r.previous_amount !== null && r.proposed_amount !== null ? Number(r.proposed_amount) - Number(r.previous_amount) : null;
  host.innerHTML = `<div class="card stack"><div class="row spread"><h2 style="margin:0">${esc(r.request_ref)} · <a href="#/p/${esc(r.project?.project_ref)}/money">${esc(r.project?.project_ref)}</a> ${esc(r.project?.title)}</h2>
      <span class="chip ${r.status === 'pending' ? 'warn' : r.status === 'approved' ? 'ok' : 'bad'}">${esc(label(CR_STATUS, r.status))}</span></div>
    <div class="table-wrap"><table class="reflow"><thead><tr><th>Line</th><th class="num">Approved (before)</th><th class="num">Proposed</th><th class="num">Difference</th></tr></thead><tbody><tr>
      <td data-label="Line">${esc(line?.line_ref ?? 'New line')} ${esc(line?.description ?? r.proposed_description ?? '')}<br><span class="small muted">${esc(r.target_type === 'service_line' || r.target_type === 'new_service_line' ? 'Revenue' : 'Cost')} · VND net of VAT</span></td>
      <td class="num" data-label="Approved (before)">${r.previous_amount_status ? vnd(r.previous_amount) : '—'}</td><td class="num" data-label="Proposed"><b>${vnd(r.proposed_amount)}</b></td>
      <td class="num" data-label="Difference">${delta === null ? '—' : `${delta > 0 ? '+' : ''}${esc(fmtVnd(delta))} VND`}</td></tr></tbody></table></div>
    <dl class="kv"><dt>Requested by</dt><dd>${esc(ctx.personName(r.requested_by))} · ${esc(fmtDateTime(r.requested_at))}</dd><dt>Reason</dt><dd>${esc(r.reason)}</dd>
      <dt>Evidence</dt><dd>${link(r.evidence_url)}</dd><dt>Based on revision</dt><dd class="mono">${esc(line?.current?.revision_ref ?? '—')}</dd>
      ${r.review_comment ? `<dt>Review comment</dt><dd>${esc(r.review_comment)}</dd>` : ''}</dl>
    <div id="review-panel"></div>
    ${r.status === 'pending' ? `<form class="form" id="decide"><label class="f full">Comment / reason (required to reject)<textarea name="comment"></textarea></label>
      <div class="form-actions"><button class="btn primary" type="submit" name="d" value="approve">Approve — save a new revision</button><button class="btn danger" type="submit" name="d" value="reject">Reject</button>
      ${!finance ? '<span class="small muted">You are not Finance: the server will refuse if you try.</span>' : own ? '<span class="small muted">This is your own proposal: the server will not let you approve it.</span>' : ''}</div>
      <div class="full" data-role="result"></div></form>` : ''}</div>`;
  // The decision is bound before the panel mounts, so a click while the figures load is never lost.
  const mounting = mountPanel(qs('#review-panel', host), { app: 'job360_money', scope: { projectRef: r.project?.project_ref, projectTitle: r.project?.title, mode: 'review', focusRequestRef: r.request_ref },
    session: ctx.session, getToken: ctx.getToken, height: 560, label: `Approved vs scenario — ${r.project?.project_ref}` })
    .then((p) => { panel = p; return p; });
  const form = qs('#decide', host);
  if (!form) { await mounting; return; }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const decision = ev.submitter?.value ?? 'approve';
    const comment = form.comment.value.trim();
    const out = qs('[data-role=result]', form);
    if (decision === 'reject' && comment.length < 5) { form.comment.setAttribute('aria-invalid', 'true'); form.comment.focus(); out.innerHTML = errorBanner({ kind: 'invalid', message: 'Give a reason for the rejection (at least 5 characters).' }); return; }
    try {
      const res = await saving(ev.submitter, () => ctx.api.reviewChange(r.id, decision, comment || null, r.version));
      if (decision === 'approve') {
        toast(`Approved ${r.request_ref}: revision ${res.revision?.revision_ref} saved`, 'ok');
        out.innerHTML = `<div class="banner ok">Saved the new revision <b>${esc(res.revision?.revision_ref)}</b> (revision ${esc(res.revision?.revision_no)}). The figures above were reloaded from the committed data.</div>`;
        await (await mounting)?.refresh('approved', { revisionRef: res.revision?.revision_ref, committedAt: res.revision?.approved_at });
      } else {
        toast(`Rejected ${r.request_ref}`, 'ok');
        await (await mounting)?.refresh('rejected');
      }
      ctx.refreshCounts?.();
      form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      await reload();
    } catch (e) {
      out.innerHTML = errorBanner(e, { actions: e.kind === 'conflict' ? '<button class="btn small" type="button" data-reload>Reload the proposal</button>' : '' });
      qs('[data-reload]', out)?.addEventListener('click', reload);
    }
  });
  await mounting;
}

function acDetail(host, m, ctx, reload) {
  host.innerHTML = `<div class="card stack"><h2>${esc(m.milestone_ref)} · <a href="#/p/${esc(m.project?.project_ref)}/money">${esc(m.project?.project_ref)}</a> ${esc(m.project?.title)}</h2>
    <dl class="kv"><dt>What was accepted</dt><dd>${esc(m.description)}</dd><dt>Amount</dt><dd>${vnd(m.amount)} (net of VAT)</dd><dt>Date</dt><dd>${esc(fmtDate(m.effective_date))}</dd>
      <dt>Evidence</dt><dd>${link(m.evidence_url)}</dd><dt>Submitted by</dt><dd>${esc(ctx.personName(m.submitted_by))} · ${esc(fmtDateTime(m.submitted_at))}</dd></dl>
    ${m.status === 'submitted' ? `<form class="form" id="ac-decide"><label class="f full">Comment / reason (required to reject)<textarea name="comment"></textarea></label>
      <div class="form-actions"><button class="btn primary" type="submit" value="verify">Verify acceptance</button><button class="btn danger" type="submit" value="reject">Reject</button></div>
      <div class="full" data-role="result"></div></form>` : `<p>Status: <b>${esc(m.status)}</b></p>`}</div>`;
  const form = qs('#ac-decide', host);
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const decision = ev.submitter?.value ?? 'verify';
    const comment = form.comment.value.trim();
    try { await saving(ev.submitter, () => ctx.api.reviewAcceptance(m.id, decision, comment || null, m.version)); toast(`${decision === 'verify' ? 'Verified' : 'Rejected'} ${m.milestone_ref}`, 'ok'); reload(); }
    catch (e) { qs('[data-role=result]', form).innerHTML = errorBanner(e); }
  });
}
