// case-study.tsx): why the CRM exists, what it does about each documented problem, how the teams use it, and the
// supporting documents (#/welcome/doc/<id>). Reached from the person's menu in the top bar, and offered on Home until
// it has been read. #/welcome?section=why|what|how|sources opens it at a section.
import { errorBanner, loading, qs } from '../ui.js';
import { mountIsland } from '../islands.js';
import { actions as walkthrough } from '../walkthrough.js';

export const WELCOME_SEEN_KEY = 'kk.welcome.seen';

// The workflows of the How section. The pictures are this copy's own screens with sample data
const FLOW = [
  { title: 'Capture the opportunity', role: 'BD', href: '#/crm', cta: 'Clients & opportunities', image: '/assets/welcome/crm-card.jpg',
    alt: 'Quick intake: the client, the opportunity, its owner and its first next action with a due date.',
    text: 'Client, stage, owner, notes, next action and due date, entered once. When it is won, the same record becomes the project: nothing is typed twice.' },
  { title: 'See what to do next', role: 'Everyone', href: '#/home', cta: 'My next actions', image: '/assets/welcome/home-card.jpg',
    alt: 'My next actions: a list of items, each with its reason, its owner, its due date and what "done" means.',
    text: 'Home lists your items. Each one says why it is there, who owns it, when it is due and what "done" means.' },
  { title: 'Check what a job still needs', role: 'Account, Finance', href: '#/p/NP-0003/overview', cta: 'Open a sample job', image: '/assets/welcome/help-card.jpg',
    alt: 'A readiness check on Job 360 with its help open: the two steps (prepare and submit, then approve), who does each and where.',
    text: 'Each readiness check says what is missing, who does the next step and where. Its link opens the control that completes it, if your role may do it.' },
  { title: 'Hand work over with a brief', role: 'Account → Design, Studio', href: '#/tasks/mine', cta: 'Tasks', image: '/assets/welcome/tasks-card.jpg',
    alt: 'My work: a piece of work with its brief, its due date, its status and what "done" means.',
    text: 'Assign work with a brief link and a due date. The designer finds it in My work and sends the output back for review.' },
  { title: 'Propose a cost or scope change', role: 'Account', href: '#/p/NP-0001/money', cta: 'Try it on NP-0001', image: '/assets/welcome/money-card.jpg',
    alt: 'The money lines in force of a sample job, with the buttons that propose a new cost or revenue line.',
    text: 'Propose it with a reason and evidence. The governed scenario shows the new margin, while the approved figure stays where it is.' },
  { title: 'Review and approve', role: 'Finance', href: '#/finance', cta: 'Finance review', image: '/assets/welcome/finance-card.jpg',
    alt: 'Finance review: a proposal compared with the approved value and its evidence, with the governed figures beside it.',
    text: 'Compare the previous and proposed values with the evidence. Approval saves a new revision and its audit event in one transaction.' },
  { title: 'Read governed reports', role: 'BD, Account, Finance', href: '#/reports', cta: 'Reports', image: '/assets/welcome/reports-card.jpg',
    alt: 'The Reports overview: approved gross profit and margin, what is excluded and why, and the margin if every proposal is approved.',
    text: 'The same definitions from the job to the portfolio. "Why this number?" shows the definition, date basis, filters, freshness and records behind it.' },
];

const NEXT = {
  bd: { text: 'Add your next opportunity, or update one you own.', href: '#/crm', cta: 'Open Clients & opportunities' },
  account: { text: 'Start with what waits for you, then try a proposal on the demo project NP-0001.', href: '#/home', cta: 'Open My next actions' },
  finance: { text: 'Review the proposals and acceptance that wait for you.', href: '#/finance', cta: 'Open Finance review' },
  design: { text: 'Open the work assigned to you and its brief.', href: '#/tasks/mine', cta: 'Open My work' },
  studio: { text: 'Open your studio sessions; they work on a phone too.', href: '#/tasks/mine', cta: 'Open My work' },
  admin: { text: 'Bring a sheet in with the import template, or put the demo back to its starting point.', href: '#/admin/import', cta: 'Open Import & access' },
};

let island = null;
export async function leave() { island?.unmount(); island = null; }

export async function render(el, ctx, parts = [], params) {
  await leave();
  try { localStorage.setItem(`${WELCOME_SEEN_KEY}.${ctx.session.id}`, '1'); } catch { /* private window */ }
  const next = ctx.session.roles.map((r) => NEXT[r]).filter(Boolean);
  const docId = parts[0] === 'doc' ? parts[1] : undefined;
  el.innerHTML = `<div class="welcome" id="case-study-slot">${loading('Loading the case study…')}</div>`;
  const slot = qs('#case-study-slot', el);
  try {
    island = await mountIsland(slot, 'case-study', { ctx, flow: FLOW, next, docId, section: params?.get('section') ?? undefined,
      onWalkthrough: () => walkthrough.open() });
  } catch (e) { slot.innerHTML = errorBanner({ kind: 'unknown', message: `The case study could not load: ${e.message}` }); }
}
