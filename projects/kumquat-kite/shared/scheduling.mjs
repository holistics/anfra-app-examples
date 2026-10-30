//
// What the system records, and so what this uses:
//   - dependencies: a step waits for the step before it (a proposal must be submitted before Finance can approve it);
//   - deadlines: the project's promised delivery date, and the readiness rule's own target date (the queue's POC rule:
//     a number of days after the contract date, or after delivery for acceptance).
// What it does not record, so this never invents it: a working calendar, effort per task, and anyone's availability
// or capacity. The demo's calendar and efforts are fixed estimates in config/scheduling.json, labelled as estimates.
// Workload and holidays are not part of the demo's estimate. A setting may still add them (capacityItemsPerDay,
// holidays), and then they are used as below; a task count is never treated as measured capacity.
//
// The method, in order:
//   1. Earliest start: the first working day on or after today (Asia/Ho_Chi_Minh), or after the dependency, if any.
//      A step whose dependency is still open is "blocked", with no date.
//   2. Owner's commitments, only when a capacity is set: a working day on which the owner already has that many items
//      due is skipped. The explanation gives counts, never other people's task titles.
//   3. Completion: the start plus the step's effort in working days, on the calendar and in the time zone.
//   4. Deadline: the earlier of the promised delivery date and the rule's target date, when either exists.
//   5. Feasibility: a completion after the deadline is "infeasible", shown as such, never as an achievable date.
// No owner, or no effort estimate, means "Needs scheduling information", with what is missing.

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MS_DAY = 86400000;

// Dates are calendar days ("YYYY-MM-DD") in the business time zone, handled as UTC midnights so arithmetic is exact.
export const toDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
export const fmtDay = (d) => d.toISOString().slice(0, 10);
// How a date reads in an explanation: with its weekday, because working days are the point.
const SHOW = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const showDay = (iso) => SHOW.format(toDay(iso)).replace(',', '');
export function todayIn(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function calendar(config) {
  const days = new Set((config.workingDays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).map((d) => DOW[d]));
  const holidays = new Set(config.holidays ?? []);
  const isWorking = (d) => days.has(d.getUTCDay()) && !holidays.has(fmtDay(d));
  const nextWorking = (d) => { let x = new Date(d); for (let i = 0; i < 400 && !isWorking(x); i++) x = new Date(x.getTime() + MS_DAY); return x; };
  const addWorking = (d, n) => { let x = nextWorking(d); let left = Math.max(1, Math.ceil(n)) - 1; while (left > 0) { x = nextWorking(new Date(x.getTime() + MS_DAY)); left -= 1; } return x; };
  return { isWorking, nextWorking, addWorking };
}

// commitments: [{ ownerId, due: 'YYYY-MM-DD' }] — the open items already assigned (titles are never passed in).
export function estimateDue({ stepKey, ownerId, today, dependencyOpen = false, dependencyLabel, commitments = [], promisedDelivery, ruleTarget, ruleTargetLabel, config }) {
  const lines = [];
  const effort = config.effortWorkingDays?.[stepKey];
  const cal = calendar(config);
  const wd = config.workingDays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const calNote = `${wd.join(',') === 'Mon,Tue,Wed,Thu,Fri' ? 'Monday to Friday' : wd.join(', ')} in ${config.timezone}`;
  if (dependencyOpen) {
    return { status: 'blocked', date: null, lines: [`Waits for: ${dependencyLabel}. It can start once that is done.`] };
  }
  const missing = [];
  if (!ownerId) missing.push('an owner');
  if (!effort) missing.push('an effort estimate for this step');
  // 1. earliest start
  const start0 = cal.nextWorking(toDay(today));
  lines.push(`Earliest start: ${showDay(fmtDay(start0))}, the first working day from today (${showDay(today)}).`);
  // 2. the owner's commitments
  const mine = ownerId ? commitments.filter((c) => c.ownerId === ownerId) : [];
  const capacity = config.capacityItemsPerDay;
  let start = start0;
  if (!ownerId) lines.push('No owner: assign one before this can be scheduled.');
  else if (capacity > 0) {
    const dueOn = (d) => mine.filter((c) => c.due === fmtDay(d)).length;
    let guard = 0;
    while (dueOn(start) >= capacity && guard++ < 260) start = cal.nextWorking(new Date(start.getTime() + MS_DAY));
    const skipped = Math.round((start - start0) / MS_DAY);
    lines.push(`Owner's workload: capacity ${capacity} item(s) a day (configured estimate); ${mine.length} open item(s) assigned${skipped ? `, so the start moves ${skipped} day(s), to ${showDay(fmtDay(start))}` : ', with room on the start day'}.`);
  }
  if (!effort) {
    return { status: 'needs_info', date: null, missing, lines: [...lines, `Needs scheduling information: ${missing.join(', ')}.`] };
  }
  // 3. completion
  const done = cal.addWorking(start, effort);
  lines.push(`Effort: ${effort} working day(s) (an estimate for this step). Estimated completion: ${showDay(fmtDay(done))} (${calNote}).`);
  // 4–5. deadline and feasibility
  const deadlines = [[promisedDelivery, 'the promised delivery date'], [ruleTarget, ruleTargetLabel ?? "the readiness rule's target date"]].filter(([d]) => d);
  deadlines.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const [deadline, deadlineName] = deadlines[0] ?? [];
  let status = 'estimate';
  let late = false;
  const dl = deadline ? String(deadline).slice(0, 10) : null;
  if (deadline) {
    if (fmtDay(done) > dl) {
      status = 'infeasible';
      late = dl < today;
      lines.push(dl < today
        ? `Deadline: ${showDay(dl)} (${deadlineName}) has already passed, so this step is late whatever the date: agree a new date with the people involved.`
        : `Deadline: ${showDay(dl)} (${deadlineName}). The estimate is later, so this schedule is not feasible as it stands: change the scope, the owner or the deadline.`);
    } else lines.push(`Deadline: ${showDay(dl)} (${deadlineName}); the estimate fits.`);
  } else lines.push('Deadline: none recorded for this step.');
  if (missing.length) lines.push(`Needs scheduling information: ${missing.join(', ')}.`);
  // Without an owner there is nobody to schedule: no date, only what is missing.
  if (!ownerId) return { status: 'needs_info', date: null, deadline: dl, missing, lines };
  return { status, date: fmtDay(done), start: fmtDay(start), deadline: dl, late, missing, lines };
}
