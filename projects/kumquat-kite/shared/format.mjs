// Display formats shared by the app, the seed and the tests: English text, VND amounts, Asia/Ho_Chi_Minh business
// time. Formatting only: no business rule or financial formula lives here (those are SQL functions and Anfra metrics).
export const TZ = 'Asia/Ho_Chi_Minh';
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const PCT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

// 100000000 -> "100,000,000"; null/undefined -> null (an unknown amount is never shown as 0).
export function fmtVnd(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? NUM.format(n) : null;
}

export function fmtDate(value) {
  if (!value) return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  return DATE.format(d);
}

export function fmtDateTime(value) {
  return value ? DATETIME.format(new Date(value)) : '';
}

export function fmtPercent(ratio) {
  if (ratio === null || ratio === undefined || ratio === '') return null;
  const n = Number(ratio);
  return Number.isFinite(n) ? PCT.format(n) : null;
}

// Today's business date in Asia/Ho_Chi_Minh as YYYY-MM-DD.
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
