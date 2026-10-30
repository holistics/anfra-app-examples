// Synthetic demo records for Kumquat Kite Studio (fictional). Each project exists to show one situation the POC
// must handle; the comment above it says which. Times are Asia/Ho_Chi_Minh (+07:00) and assume a demo around
// 15 October 2026. People are persona keys (shared/personas.mjs). Every amount is whole VND, net of VAT, unless
// a receipt says gross. Links point at example.com: the documents themselves are not part of the demo.
const DOC = (slug) => `https://example.com/kumquat-demo/${slug}`;

export const SERVICES = [
  ['VEN-ROOM', 'Livestream room rental', 'venue'],
  ['VEN-EQUIP', 'Equipment rental', 'venue'],
  ['ECO-LIVE', 'Livestream operation', 'ecommerce'],
  ['ECO-SHOP', 'E-commerce shop operation', 'ecommerce'],
  ['PRD-SET', 'Stage and set build', 'production'],
  ['PRD-MEDIA', 'Photo and video shoots', 'production'],
  ['EVT-OPS', 'Event operations', 'event'],
  ['ACA-WS', 'Training workshop', 'academy'],
];

export const CLIENTS = [
  { key: 'sunrise', name: 'Sunrise Home Appliances (sample)', type: 'brand', owner: 'bd', at: '2026-06-20T10:00:00+07:00' },
  { key: 'starfish', name: 'Starfish Sunscreen (sample)', type: 'brand', owner: 'bd', at: '2026-06-24T14:00:00+07:00' },
  { key: 'calm', name: 'Calm Nut Milk (sample)', type: 'brand', owner: 'bd', at: '2026-06-25T09:00:00+07:00' },
  { key: 'rainbow', name: 'Rainbow Agency (sample)', type: 'agency', owner: 'bd', at: '2026-08-10T11:00:00+07:00' },
  { key: 'internal', name: 'TP Production Studio (internal)', type: 'internal', owner: 'admin', at: '2026-06-01T08:00:00+07:00' },
  { key: 'paperkite', name: 'Paper Kite Sweets (sample)', type: 'brand', owner: 'bd', at: '2026-10-14T16:20:00+07:00' },
];

const won = (ref, date, extra = {}) => ({ commercial_stage: 'won', contract_reference: ref, contract_signed_date: date, ...extra });
const next = (action, owner, due, doneWhen) => ({ next_action: action, next_action_owner_id: owner, next_action_due: due,
  next_action_done_when: doneWhen ?? null });

export const PROJECTS = [
  // Normal active project: won, job code issued, brief ready, work in progress, complete approved money.
  {
    key: 'A', client: 'sunrise', title: 'Air-fryer livestream series, Sep–Oct (sample)', group: 'ecommerce',
    created: { at: '2026-08-20T09:30:00+07:00', by: 'bd', set: next('Call to understand the brief', 'bd', '2026-08-22'),
               note: 'Client wants 4 livestreams a month for the air-fryer range.' },
    steps: [
      { at: '2026-08-22T15:00:00+07:00', by: 'bd', set: { commercial_stage: 'meeting', ...next('Studio demo meeting with the client', 'bd', '2026-08-26') },
        note: 'Called; the client will visit the studio.' },
      { at: '2026-08-26T17:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 150000000,
        ...next('Send the quotation for 8 sessions plus set build', 'bd', '2026-08-28') } },
      { at: '2026-09-01T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'negotiation' }, note: 'Client asked for 5% off for a 2-month deal; kept the price, added one cut-down.' },
      { at: '2026-09-05T16:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2609-01', '2026-09-05', { account_owner_id: 'account', delivery_state: 'planning',
        promised_delivery_date: '2026-10-31', ...next('Kick-off with the client', 'account', '2026-09-08') }), note: 'Two-month contract signed; handed over to Account.' },
      { at: '2026-09-06T09:10:00+07:00', by: 'finance', job: 'KK26-0101' },
      { at: '2026-09-08T11:00:00+07:00', by: 'account', set: { delivery_state: 'in_production', brief_status: 'ready', brief_url: DOC('briefs/a'),
        ...next('Lock the script for livestream 7', 'account', '2026-10-18', 'Client approves the script by email') } },
      { at: '2026-09-10T15:00:00+07:00', by: 'finance', payment: 'deposit_received' },
    ],
    lines: [
      { key: 'live', service: 'ECO-LIVE', desc: 'Operation of 8 livestreams', revisions: [{ amount: 100000000, at: '2026-09-06T09:00:00+07:00' }] },
      { key: 'set', service: 'PRD-SET', desc: 'Home-appliance set build', revisions: [{ amount: 50000000, at: '2026-09-06T09:00:00+07:00' }] },
    ],
    costs: [
      { key: 'host', line: 'live', desc: 'Host and livestream crew', stage: 'committed', revisions: [{ amount: 55000000, at: '2026-09-06T09:05:00+07:00' }] },
      { key: 'props', line: 'set', desc: 'Set materials', stage: 'forecast', revisions: [{ amount: 30000000, at: '2026-09-06T09:05:00+07:00' }] },
    ],
    work: [
      { team: 'design', title: 'Livestream schedule banner', assignee: 'design', due: '2026-09-12T17:00:00+07:00', brief_url: DOC('briefs/a'),
        done_when: 'Account approves the banner, with the final file link', created: { at: '2026-09-08T11:30:00+07:00', by: 'account' },
        steps: [
          { at: '2026-09-09T09:00:00+07:00', by: 'design', set: { status: 'in_progress' } },
          { at: '2026-09-11T11:00:00+07:00', by: 'design', set: { status: 'in_review', output_url: DOC('outputs/a-banner-v1') } },
          { at: '2026-09-11T16:00:00+07:00', by: 'account', set: { status: 'done', review_note: 'Approved and sent to the client.' } },
        ] },
      { team: 'studio', title: 'Livestream 7 — Studio B', assignee: 'studio', due: '2026-10-16T22:00:00+07:00', room: 'Studio B',
        planned: ['2026-10-16T19:00:00+07:00', '2026-10-16T22:00:00+07:00'], done_when: 'Actual start/end times and any incidents recorded',
        created: { at: '2026-10-10T10:00:00+07:00', by: 'account' } },
      { team: 'account', title: 'Send the weekly report to the client', assignee: 'account', due: '2026-10-17T18:00:00+07:00',
        done_when: 'Weekly report sent, with a link', created: { at: '2026-10-13T09:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-10-14T10:00:00+07:00', by: 'account', set: { status: 'in_progress' } }] },
    ],
    docs: [
      { type: 'quotation', title: 'Quotation: 8 livestreams plus set build', url: DOC('docs/a-quotation'), at: '2026-08-27T10:00:00+07:00', by: 'bd' },
      { type: 'contract', title: 'Contract CT-SAMPLE-2609-01', url: DOC('docs/a-contract'), at: '2026-09-05T16:10:00+07:00', by: 'bd' },
      { type: 'brief', title: 'Air-fryer campaign brief', url: DOC('briefs/a'), at: '2026-09-08T11:00:00+07:00', by: 'account' },
    ],
    receipts: [{ type: 'deposit', date: '2026-09-10', amount: 45000000, tax: 'net_of_vat', ref: 'BANK-0910-01', at: '2026-09-10T15:00:00+07:00' }],
  },

  // Overdue next action (BD) and overdue work (Account) on a won job.
  {
    key: 'B', client: 'sunrise', title: 'Black Friday livestream (sample)', group: 'ecommerce',
    created: { at: '2026-09-15T14:00:00+07:00', by: 'bd', set: next('Call to confirm the budget', 'bd', '2026-09-17') },
    steps: [
      { at: '2026-09-20T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 80000000,
        ...next('Send the quotation for 3 livestreams', 'bd', '2026-09-23') } },
      { at: '2026-10-01T15:30:00+07:00', by: 'bd', set: won('CT-SAMPLE-2610-01', '2026-10-01', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/b'), promised_delivery_date: '2026-11-28',
        ...next('Send the quotation for the extra session', 'bd', '2026-10-10', 'Client confirms the extra-session quotation by email') }),
        note: 'Client wants one more livestream on 28 Nov; needs a quotation for the extra session.' },
      { at: '2026-10-02T09:00:00+07:00', by: 'finance', job: 'KK26-0102' },
      { at: '2026-10-03T09:00:00+07:00', by: 'finance', payment: 'deposit_requested' },
    ],
    lines: [{ key: 'live', service: 'ECO-LIVE', desc: 'Black Friday package, 3 livestreams', revisions: [{ amount: 80000000, at: '2026-10-02T09:00:00+07:00' }] }],
    costs: [{ key: 'ops', line: 'live', desc: 'Operation and host', stage: 'forecast', revisions: [{ amount: 44000000, at: '2026-10-02T09:05:00+07:00' }] }],
    work: [
      { team: 'account', title: 'Send the livestream schedule for client approval', assignee: 'account', due: '2026-10-12T18:00:00+07:00',
        done_when: 'Client approves the schedule by email', created: { at: '2026-10-02T10:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-10-05T09:00:00+07:00', by: 'account', set: { status: 'in_progress' } }] },
      { team: 'design', title: 'Black Friday key visual', assignee: 'design', due: '2026-10-20T17:00:00+07:00', brief_url: DOC('briefs/b'),
        done_when: 'Account approves the key visual, with the final file link', created: { at: '2026-10-06T14:00:00+07:00', by: 'account' } },
    ],
    docs: [
      { type: 'contract', title: 'Contract CT-SAMPLE-2610-01', url: DOC('docs/b-contract'), at: '2026-10-01T15:40:00+07:00', by: 'bd' },
      { type: 'brief', title: 'Black Friday brief', url: DOC('briefs/b'), at: '2026-10-01T15:45:00+07:00', by: 'bd' },
    ],
  },

  // Missing brief, and Finance has not issued the job code yet: two separate, explicit blockers.
  {
    key: 'C', client: 'starfish', title: 'Lunar New Year lookbook shoot (sample)', group: 'production',
    created: { at: '2026-09-28T10:00:00+07:00', by: 'bd', set: next('Send the lookbook portfolio', 'bd', '2026-09-30') },
    steps: [
      { at: '2026-10-03T11:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 60000000,
        ...next('Agree the concept and price', 'bd', '2026-10-07') } },
      { at: '2026-10-08T16:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2610-02', '2026-10-08', { account_owner_id: 'account', delivery_state: 'planning',
        promised_delivery_date: '2026-12-05', ...next('Get the detailed brief from the client', 'account', '2026-10-16', 'Brief marked Ready, with a link') }) },
      { at: '2026-10-13T09:30:00+07:00', by: 'account', note: 'Design is waiting for the brief; the client promised it before 16 Oct.' },
    ],
    lines: [{ key: 'shoot', service: 'PRD-MEDIA', desc: 'Lookbook shoot, 30 photos', revisions: [{ amount: 60000000, at: '2026-10-09T10:00:00+07:00' }] }],
    costs: [{ key: 'photo', line: 'shoot', desc: 'Photographer and lighting', stage: 'forecast', revisions: [{ amount: 25000000, at: '2026-10-09T10:05:00+07:00' }] }],
    work: [
      { team: 'design', title: 'Lookbook moodboard', assignee: 'design', due: '2026-10-19T17:00:00+07:00',
        done_when: 'Moodboard sent for Account review', created: { at: '2026-10-09T09:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-10-10T09:00:00+07:00', by: 'design', set: { status: 'in_progress' } },
                { at: '2026-10-10T15:00:00+07:00', by: 'design', set: { status: 'blocked' } }] },
    ],
    docs: [{ type: 'contract', title: 'Contract CT-SAMPLE-2610-02', url: DOC('docs/c-contract'), at: '2026-10-08T16:10:00+07:00', by: 'bd' }],
  },

  // Incomplete cost: one approved cost line has no amount yet. It stays unknown, so margin is unavailable.
  {
    key: 'D', client: 'rainbow', title: 'Livestream workshop for resellers (sample)', group: 'academy',
    created: { at: '2026-09-02T09:00:00+07:00', by: 'bd', set: next('Send the workshop outline', 'bd', '2026-09-05') },
    steps: [
      { at: '2026-09-10T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 45000000,
        ...next('Agree the workshop date', 'bd', '2026-09-15') } },
      { at: '2026-09-20T11:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2609-03', '2026-09-20', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/d'), promised_delivery_date: '2026-10-25',
        ...next('Lock the attendee list', 'account', '2026-10-17', 'Final attendee list received') }) },
      { at: '2026-09-21T09:00:00+07:00', by: 'finance', job: 'KK26-0097' },
      { at: '2026-09-24T16:00:00+07:00', by: 'finance', payment: 'deposit_received' },
      { at: '2026-09-25T09:00:00+07:00', by: 'account', set: { delivery_state: 'in_production' }, note: 'Waiting for the guest speaker to quote a fee.' },
    ],
    lines: [{ key: 'ws', service: 'ACA-WS', desc: 'Two livestream workshops', revisions: [{ amount: 45000000, at: '2026-09-21T09:00:00+07:00' }] }],
    costs: [
      { key: 'venue', line: 'ws', desc: 'Venue hire', stage: 'committed', revisions: [{ amount: 12000000, at: '2026-09-21T09:05:00+07:00' }] },
      { key: 'speaker', line: 'ws', desc: 'Guest speaker', stage: 'forecast', revisions: [{ amount: null, at: '2026-09-21T09:05:00+07:00' }] },
    ],
    work: [
      { team: 'studio', title: 'Prepare the workshop room', assignee: 'studio', due: '2026-10-24T12:00:00+07:00', room: 'Second-floor hall',
        planned: ['2026-10-24T08:00:00+07:00', '2026-10-24T12:00:00+07:00'], done_when: 'Room ready; actual times recorded',
        created: { at: '2026-09-26T10:00:00+07:00', by: 'account' } },
    ],
    receipts: [{ type: 'deposit', date: '2026-09-24', amount: 13500000, tax: 'net_of_vat', ref: 'BANK-0924-07', at: '2026-09-24T16:00:00+07:00' }],
  },

  // Pending Finance review: Account asks to raise the contract value; the scenario differs from the approved value.
  {
    key: 'E', client: 'calm', title: 'TikTok Shop operation, Q4 (sample)', group: 'ecommerce',
    created: { at: '2026-08-28T10:00:00+07:00', by: 'bd', set: next('Send the e-commerce credentials deck', 'bd', '2026-08-30') },
    steps: [
      { at: '2026-09-05T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'negotiation', estimate_basis: 'total', estimated_amount: 90000000,
        ...next('Agree the KPIs and operating fee', 'bd', '2026-09-10') } },
      { at: '2026-09-12T10:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2609-02', '2026-09-12', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/e'), promised_delivery_date: '2026-12-31',
        ...next('Send the weekly sales report', 'account', '2026-10-19', 'Weekly report sent to the client') }) },
      { at: '2026-09-13T09:10:00+07:00', by: 'finance', job: 'KK26-0099' },
      { at: '2026-09-16T09:00:00+07:00', by: 'account', set: { delivery_state: 'in_production' } },
      { at: '2026-10-05T16:00:00+07:00', by: 'finance', payment: 'partially_received' },
      { at: '2026-10-14T15:30:00+07:00', by: 'account', note: 'Client signed a scope extension: one more month plus weekend livestreams. Sent the new value to Finance.' },
    ],
    lines: [{ key: 'shop', service: 'ECO-SHOP', desc: 'Shop operation, 3 months', revisions: [{ amount: 90000000, at: '2026-09-13T09:00:00+07:00' }] }],
    costs: [{ key: 'staff', line: 'shop', desc: 'Shop operations staff', stage: 'committed', revisions: [{ amount: 40000000, at: '2026-09-13T09:05:00+07:00' }] }],
    changes: [{ line: 'shop', base: 1, amount: 110000000, reason: 'Scope extension: one more month of operation plus weekend livestreams',
      evidence: DOC('evidence/e-contract-addendum-01'), by: 'account', at: '2026-10-14T15:40:00+07:00', status: 'pending' }],
    work: [
      { team: 'design', title: 'Weekend flash-sale banner', assignee: 'design', due: '2026-10-16T17:00:00+07:00', brief_url: DOC('briefs/e'),
        done_when: 'Account approves the banner, with the final file link', created: { at: '2026-10-12T10:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-10-13T09:00:00+07:00', by: 'design', set: { status: 'in_progress' } },
                { at: '2026-10-14T17:30:00+07:00', by: 'design', set: { status: 'in_review', output_url: DOC('outputs/e-banner-v1') } }] },
    ],
    docs: [
      { type: 'contract', title: 'Contract CT-SAMPLE-2609-02', url: DOC('docs/e-contract'), at: '2026-09-12T10:10:00+07:00', by: 'bd' },
      { type: 'evidence', title: 'Contract addendum extending the scope', url: DOC('evidence/e-contract-addendum-01'), at: '2026-10-14T15:35:00+07:00', by: 'account' },
    ],
    receipts: [{ type: 'payment', date: '2026-10-05', amount: 45000000, tax: 'gross_incl_vat', ref: 'BANK-1005-03', at: '2026-10-05T16:00:00+07:00',
                 note: 'First instalment (incl. VAT)' }],
  },

  // An approved change (cost 40m → 45m, a new version) and a rejected one (→ 60m, with the reason), plus
  // acceptance verified by Finance and cash received against it.
  {
    key: 'F', client: 'calm', title: 'New nut-milk flavour launch livestream (sample)', group: 'ecommerce',
    created: { at: '2026-07-25T09:00:00+07:00', by: 'bd', set: next('Send the product-launch proposal', 'bd', '2026-07-28') },
    steps: [
      { at: '2026-08-05T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 120000000,
        ...next('Agree the KOLs and the livestream schedule', 'bd', '2026-08-12') } },
      { at: '2026-08-18T14:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2608-01', '2026-08-18', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/f'), promised_delivery_date: '2026-09-08',
        ...next('Confirm the KOLs', 'account', '2026-08-22') }) },
      { at: '2026-08-19T09:10:00+07:00', by: 'finance', job: 'KK26-0090' },
      { at: '2026-08-20T15:00:00+07:00', by: 'finance', payment: 'deposit_received' },
      { at: '2026-08-25T09:00:00+07:00', by: 'account', set: { delivery_state: 'in_production', ...next('Run the 2 livestreams', 'account', '2026-09-07') } },
      { at: '2026-09-08T18:00:00+07:00', by: 'account', set: { delivery_state: 'delivered', ...next('Send the acceptance minutes', 'account', '2026-09-10') } },
      { at: '2026-09-11T15:30:00+07:00', by: 'account', set: { delivery_state: 'client_accepted',
        ...next('Close the project once fully paid', 'account', '2026-10-22', 'Finance confirms full payment') } },
      { at: '2026-10-05T16:30:00+07:00', by: 'finance', payment: 'fully_received' },
    ],
    lines: [{ key: 'live', service: 'ECO-LIVE', desc: 'Launch livestreams (2) with KOLs', revisions: [{ amount: 120000000, at: '2026-08-19T09:00:00+07:00' }] }],
    costs: [
      { key: 'kol', line: 'live', desc: 'KOL booking, 2 sessions', stage: 'committed',
        revisions: [{ amount: 40000000, at: '2026-08-19T09:05:00+07:00' }, { amount: 45000000, at: '2026-08-28T16:20:00+07:00' }] },
      { key: 'gear', line: 'live', desc: 'Set and equipment', stage: 'actual', revisions: [{ amount: 30000000, at: '2026-08-19T09:05:00+07:00' }] },
    ],
    changes: [
      { cost: 'kol', base: 1, amount: 45000000, reason: 'The KOL raised the fee for the second livestream', evidence: DOC('evidence/f-kol-quote-v2'), by: 'account',
        at: '2026-08-27T11:00:00+07:00', status: 'approved', reviewer: 'finance', reviewed_at: '2026-08-28T16:20:00+07:00',
        comment: 'Checked against the new KOL quotation', result: 2 },
      { cost: 'kol', base: 2, amount: 60000000, reason: 'Proposed a second, supporting KOL for session 2', evidence: DOC('evidence/f-extra-kol'), by: 'account',
        at: '2026-09-02T10:00:00+07:00', status: 'rejected', reviewer: 'finance', reviewed_at: '2026-09-03T09:15:00+07:00',
        comment: 'No supplier quotation and no client confirmation' },
    ],
    work: [
      { team: 'studio', title: 'Launch livestream 1 — Studio A', assignee: 'studio', due: '2026-09-05T21:30:00+07:00', room: 'Studio A',
        planned: ['2026-09-05T19:00:00+07:00', '2026-09-05T21:30:00+07:00'], done_when: 'Actual times and incidents recorded',
        created: { at: '2026-08-26T10:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-09-05T21:45:00+07:00', by: 'studio', set: { status: 'in_progress', actual_start: '2026-09-05T19:05:00+07:00' } },
                { at: '2026-09-05T21:50:00+07:00', by: 'studio', set: { status: 'done', actual_end: '2026-09-05T21:40:00+07:00',
                  session_note: 'Network dropped for 3 minutes at 20:10; switched to the 4G backup.' } }] },
      { team: 'design', title: 'Launch livestream frame', assignee: 'design', due: '2026-08-30T17:00:00+07:00', brief_url: DOC('briefs/f'),
        done_when: 'Account approves the livestream frame', created: { at: '2026-08-25T10:00:00+07:00', by: 'account' },
        steps: [{ at: '2026-08-26T09:00:00+07:00', by: 'design', set: { status: 'in_progress' } },
                { at: '2026-08-28T15:00:00+07:00', by: 'design', set: { status: 'in_review', output_url: DOC('outputs/f-frame-v1') } },
                { at: '2026-08-28T17:00:00+07:00', by: 'account', set: { status: 'changes_requested', review_note: 'Use the new brand colours for the logo.' } },
                { at: '2026-08-29T09:00:00+07:00', by: 'design', set: { status: 'in_progress' } },
                { at: '2026-08-29T14:00:00+07:00', by: 'design', set: { status: 'in_review', output_url: DOC('outputs/f-frame-v2') } },
                { at: '2026-08-29T16:00:00+07:00', by: 'account', set: { status: 'done', review_note: 'Version 2 approved.' } }] },
    ],
    docs: [
      { type: 'contract', title: 'Contract CT-SAMPLE-2608-01', url: DOC('docs/f-contract'), at: '2026-08-18T14:10:00+07:00', by: 'bd' },
      { type: 'evidence', title: 'KOL quotation, version 2', url: DOC('evidence/f-kol-quote-v2'), at: '2026-08-27T10:50:00+07:00', by: 'account' },
      { type: 'acceptance_minutes', title: 'Acceptance minutes, 2 livestreams', url: DOC('docs/f-acceptance'), at: '2026-09-10T10:00:00+07:00', by: 'account' },
    ],
    acceptance: [{ key: 'm1', desc: 'Acceptance of the 2 launch livestreams', amount: 120000000, date: '2026-09-10', evidence: DOC('docs/f-acceptance'),
                   submitted: { at: '2026-09-10T10:05:00+07:00', by: 'account' }, verified: { at: '2026-09-11T15:00:00+07:00', by: 'finance' } }],
    receipts: [
      { type: 'deposit', date: '2026-08-20', amount: 36000000, tax: 'net_of_vat', ref: 'BANK-0820-02', at: '2026-08-20T15:00:00+07:00' },
      { type: 'payment', date: '2026-10-05', amount: 84000000, tax: 'net_of_vat', ref: 'BANK-1005-01', at: '2026-10-05T16:30:00+07:00', milestone: 'm1' },
    ],
  },

  // Sponsored internal project: revenue is intentionally zero (confirmed), its cost is real; margin does not apply.
  {
    key: 'G', client: 'internal', title: 'Creator community workshop (internal, sponsored)', group: 'event', kind: 'sponsored',
    created: { at: '2026-09-10T10:00:00+07:00', by: 'bd', set: next('Get the sponsorship budget approved', 'bd', '2026-09-20') },
    steps: [
      { at: '2026-09-25T11:00:00+07:00', by: 'bd', set: won('INT-2609-01', '2026-09-25', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/g'), promised_delivery_date: '2026-10-05', ...next('Prepare the event', 'account', '2026-10-04') }),
        note: 'Management approved the sponsorship: free of charge, community goal.' },
      { at: '2026-09-26T09:00:00+07:00', by: 'finance', job: 'KK26-0100' },
      { at: '2026-10-05T20:00:00+07:00', by: 'account', set: { delivery_state: 'delivered',
        ...next('Write the event wrap-up and send the internal report', 'account', '2026-10-17', 'Wrap-up report sent to management') } },
    ],
    lines: [{ key: 'event', service: 'EVT-OPS', desc: 'Workshop organisation (sponsored, free of charge)', revisions: [{ amount: 0, zero: true, at: '2026-09-26T09:00:00+07:00' }] }],
    costs: [{ key: 'venue', line: 'event', desc: 'Venue, refreshments and gifts', stage: 'actual', revisions: [{ amount: 12000000, at: '2026-09-26T09:05:00+07:00' }] }],
    acceptance: [{ key: 'm1', desc: 'Event wrap-up minutes (free of charge)', amount: 0, date: '2026-10-06', evidence: DOC('docs/g-wrap-up'),
                   submitted: { at: '2026-10-06T10:00:00+07:00', by: 'account' }, verified: { at: '2026-10-07T09:00:00+07:00', by: 'finance' } }],
  },

  // Closed job with the same gross profit as F (45m): the ranking's tie is broken by the project ID. Cash
  // was received gross of VAT, so it is not compared with net acceptance.
  {
    key: 'H', client: 'starfish', title: 'Summer sunscreen TVC shoot (sample)', group: 'production',
    created: { at: '2026-06-28T14:00:00+07:00', by: 'bd', set: next('Send the draft script', 'bd', '2026-07-02') },
    steps: [
      { at: '2026-07-05T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 75000000,
        ...next('Agree the script and the quotation', 'bd', '2026-07-10') } },
      { at: '2026-07-14T10:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2607-01', '2026-07-14', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/h'), promised_delivery_date: '2026-08-10', ...next('Schedule the shoot', 'account', '2026-07-18') }) },
      { at: '2026-07-15T09:10:00+07:00', by: 'finance', job: 'KK26-0081' },
      { at: '2026-07-20T09:00:00+07:00', by: 'account', set: { delivery_state: 'in_production', ...next('Deliver the final cut', 'account', '2026-08-10') } },
      { at: '2026-08-10T17:00:00+07:00', by: 'account', set: { delivery_state: 'delivered', ...next('Send the acceptance minutes', 'account', '2026-08-12') } },
      { at: '2026-08-30T16:00:00+07:00', by: 'finance', payment: 'fully_received' },
      { at: '2026-09-01T10:00:00+07:00', by: 'account', set: { delivery_state: 'closed', next_action: null, next_action_owner_id: null,
        next_action_due: null, next_action_done_when: null }, note: 'Project closed: accepted and fully paid.' },
    ],
    lines: [{ key: 'tvc', service: 'PRD-MEDIA', desc: '30-second TVC and 3 cut-downs', revisions: [{ amount: 75000000, at: '2026-07-15T09:00:00+07:00' }] }],
    costs: [{ key: 'crew', line: 'tvc', desc: 'Film crew and post-production', stage: 'actual', revisions: [{ amount: 30000000, at: '2026-07-15T09:05:00+07:00' }] }],
    acceptance: [{ key: 'm1', desc: 'Acceptance of the TVC and 3 cut-downs', amount: 75000000, date: '2026-08-12', evidence: DOC('docs/h-acceptance'),
                   submitted: { at: '2026-08-12T10:00:00+07:00', by: 'account' }, verified: { at: '2026-08-13T11:00:00+07:00', by: 'finance' } }],
    receipts: [{ type: 'payment', date: '2026-08-30', amount: 82500000, tax: 'gross_incl_vat', ref: 'BANK-0830-05', at: '2026-08-30T16:00:00+07:00',
                 milestone: 'm1', note: 'Full payment (incl. 10% VAT)' }],
  },

  // Closed job with two service lines, so a project's margin is shown at service-line level of detail.
  {
    key: 'I', client: 'calm', title: 'Summer livestream series (sample)', group: 'ecommerce',
    created: { at: '2026-06-25T09:30:00+07:00', by: 'bd', set: next('Send the quotation for 4 livestreams', 'bd', '2026-06-28') },
    steps: [
      { at: '2026-07-03T11:00:00+07:00', by: 'bd', set: won('CT-SAMPLE-2607-02', '2026-07-03', { account_owner_id: 'account', delivery_state: 'planning',
        brief_status: 'ready', brief_url: DOC('briefs/i'), promised_delivery_date: '2026-07-30', ...next('Kick-off', 'account', '2026-07-06') }) },
      { at: '2026-07-04T09:10:00+07:00', by: 'finance', job: 'KK26-0078' },
      { at: '2026-07-07T09:00:00+07:00', by: 'account', set: { delivery_state: 'in_production', ...next('Run the 4 livestreams', 'account', '2026-07-29') } },
      { at: '2026-07-30T18:00:00+07:00', by: 'account', set: { delivery_state: 'delivered', ...next('Send the acceptance minutes', 'account', '2026-08-01') } },
      { at: '2026-08-10T15:00:00+07:00', by: 'finance', payment: 'fully_received' },
      { at: '2026-08-11T09:00:00+07:00', by: 'account', set: { delivery_state: 'closed', next_action: null, next_action_owner_id: null,
        next_action_due: null, next_action_done_when: null } },
    ],
    lines: [
      { key: 'live', service: 'ECO-LIVE', desc: '4 livestreams', revisions: [{ amount: 60000000, at: '2026-07-04T09:00:00+07:00' }] },
      { key: 'gear', service: 'VEN-EQUIP', desc: 'Lighting equipment rental', revisions: [{ amount: 15000000, at: '2026-07-04T09:00:00+07:00' }] },
    ],
    costs: [
      { key: 'host', line: 'live', desc: 'Host and operation', stage: 'actual', revisions: [{ amount: 30000000, at: '2026-07-04T09:05:00+07:00' }] },
      { key: 'light', line: 'gear', desc: 'Hired lighting equipment', stage: 'actual', revisions: [{ amount: 9000000, at: '2026-07-04T09:05:00+07:00' }] },
    ],
    acceptance: [{ key: 'm1', desc: 'Acceptance of the 4 livestreams', amount: 75000000, date: '2026-07-31', evidence: DOC('docs/i-acceptance'),
                   submitted: { at: '2026-07-31T10:00:00+07:00', by: 'account' }, verified: { at: '2026-08-01T10:00:00+07:00', by: 'finance' } }],
    receipts: [{ type: 'payment', date: '2026-08-10', amount: 75000000, tax: 'net_of_vat', ref: 'BANK-0810-04', at: '2026-08-10T15:00:00+07:00', milestone: 'm1' }],
  },

  // Pipeline: a monthly estimate is kept apart from total estimates and never counted as revenue.
  {
    key: 'J', client: 'starfish', title: 'Tet 2027 livestream (sample)', group: 'ecommerce',
    created: { at: '2026-10-05T10:00:00+07:00', by: 'bd', set: next('Call about Tet plans', 'bd', '2026-10-07') },
    steps: [
      { at: '2026-10-07T15:00:00+07:00', by: 'bd', set: { commercial_stage: 'qualified', estimate_basis: 'monthly', estimated_amount: 30000000,
        ...next('Book a meeting with the client', 'bd', '2026-10-12') }, note: 'Client wants 2 livestreams a week during the Tet month.' },
      { at: '2026-10-12T11:00:00+07:00', by: 'bd', set: { commercial_stage: 'meeting',
        ...next('Meeting to lock the scope and schedule', 'bd', '2026-10-16', 'Client confirms the scope by email') } },
    ],
  },
  // Pipeline: a range estimate.
  {
    key: 'K', client: 'rainbow', title: '6-month shop operation package (sample)', group: 'ecommerce',
    created: { at: '2026-09-29T09:00:00+07:00', by: 'bd', set: next('Send the credentials deck', 'bd', '2026-10-01') },
    steps: [
      { at: '2026-10-06T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'range', estimate_low: 50000000,
        estimate_high: 80000000, ...next('Send the revised quotation', 'bd', '2026-10-15', 'Client receives the revised quotation') },
        note: 'The agency needs two price options: standard, and with livestreams.' },
    ],
  },
  // Lost opportunity: the reason is required and kept.
  {
    key: 'L', client: 'rainbow', title: 'Store opening event (sample)', group: 'event',
    created: { at: '2026-08-12T09:00:00+07:00', by: 'bd', set: next('Survey the venue', 'bd', '2026-08-15') },
    steps: [
      { at: '2026-08-20T10:00:00+07:00', by: 'bd', set: { commercial_stage: 'proposal', estimate_basis: 'total', estimated_amount: 70000000,
        ...next('Follow up on the quotation', 'bd', '2026-08-27') } },
      { at: '2026-09-03T16:00:00+07:00', by: 'bd', set: { commercial_stage: 'lost', lost_reason: 'The client chose another supplier with a lower budget',
        next_action: null, next_action_owner_id: null, next_action_due: null, next_action_done_when: null } },
    ],
  },
  // A fresh lead from yesterday.
  {
    key: 'M', client: 'paperkite', title: 'New lead from the fan page (sample)', group: 'ecommerce',
    created: { at: '2026-10-14T16:20:00+07:00', by: 'bd', set: next('Call back to understand the needs', 'bd', '2026-10-16'),
               note: 'Left a number on the fan page; interested in Mid-Autumn livestreams next year.' },
    steps: [],
  },
];
