// The logic of "Usage analytics": no DOM, no SDK, so Node can test it.
//
// Dates are days, 'YYYY-MM-DD' strings, compared as strings and stepped in UTC so no time zone
// moves them. The log's times are local without a zone; a result's '2026-10-20T21:46:59Z' is read
// as the day it starts with, never converted.
(function (root) {
  'use strict';

  const MS_DAY = 86400000;
  const RANGES = [7, 30, 90, 180];
  const SPARK_DAYS = 30;
  const IDLE_DAYS = 90;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A result value as a number, or null. Numbers arrive as strings; Number(null) would be 0.
  function num (v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function day (v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  }

  function toMs (d) { return Date.parse(d + 'T00:00:00Z'); }
  function fromMs (ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays (d, n) { return fromMs(toMs(d) + n * MS_DAY); }
  function daysBetween (a, b) { return Math.round((toMs(b) - toMs(a)) / MS_DAY); }

  // Monday of the ISO week a day falls in, as AQL's week() truncates.
  function weekStart (d) {
    const dow = new Date(toMs(d)).getUTCDay();
    return addDays(d, -((dow + 6) % 7));
  }

  // The windows a range compares, all inclusive and ending on `today`: the period, the equal
  // period before it (null when that starts before the log does), and the last 7 days against the
  // 7 before.
  function windows (today, rangeDays, logStart) {
    const start = addDays(today, 1 - rangeDays);
    const prevStart = addDays(start, -rangeDays);
    return {
      period: [start, today],
      prev: logStart && prevStart < logStart ? null : [prevStart, addDays(start, -1)],
      last7: [addDays(today, -6), today],
      prev7: [addDays(today, -13), addDays(today, -7)],
    };
  }

  function grainFor (rangeDays) { return rangeDays <= 30 ? 'day' : 'week'; }

  // The buckets a trend shows, every one present even with no events. A week cut by the period's
  // edge keeps its Monday as the key and says how many of its days are in.
  function buckets (start, end, grain) {
    const out = [];
    if (grain === 'day') {
      for (let d = start; d <= end; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, days: 1 });
      return out;
    }
    for (let w = weekStart(start); w <= end; w = addDays(w, 7)) {
      const from = w < start ? start : w;
      const last = addDays(w, 6);
      const to = last > end ? end : last;
      out.push({ key: w, from, to, days: daysBetween(from, to) + 1 });
    }
    return out;
  }

  // Values per bucket from rows keyed by a day-truncated column; a missing bucket is 0.
  function fillSeries (rows, bucketList, keyField, valueField) {
    const byKey = new Map();
    for (const r of rows) byKey.set(day(r[keyField]), num(r[valueField]) || 0);
    return bucketList.map((b) => byKey.get(b.key) || 0);
  }

  // One series of daily values per entity over the `days` ending on `end`, from rows of
  // (entity, day, value).
  function sparkSeries (rows, entityField, dayField, valueField, end, days) {
    const n = days || SPARK_DAYS;
    const start = addDays(end, 1 - n);
    const out = new Map();
    for (const r of rows) {
      const i = daysBetween(start, day(r[dayField]));
      if (i < 0 || i >= n) continue;
      const key = r[entityField];
      if (!out.has(key)) out.set(key, new Array(n).fill(0));
      out.get(key)[i] += num(r[valueField]) || 0;
    }
    return out;
  }

  // An SVG polyline's points for a sparkline, the baseline at the bottom; a flat zero line sits on it.
  function sparkPoints (values, width, height, pad) {
    const p = pad === undefined ? 1 : pad;
    if (!values.length) return '';
    const max = Math.max(...values);
    const step = values.length > 1 ? (width - 2 * p) / (values.length - 1) : 0;
    return values.map((v, i) => {
      const x = p + i * step;
      const y = max > 0 ? height - p - (v / max) * (height - 2 * p) : height - p;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  // Change from `prev` to `cur`, or null when there is nothing to compare against.
  function delta (cur, prev) {
    if (cur === null || prev === null || prev === 0) return null;
    const pct = (cur - prev) / prev * 100;
    const rounded = Math.round(pct);
    return { pct, dir: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat', text: (rounded > 0 ? '+' : '') + rounded + '%' };
  }

  function indexBy (rows, key) {
    const m = new Map();
    for (const r of rows) m.set(r[key], r);
    return m;
  }

  const intFormat = new Intl.NumberFormat('en-US');
  function fmtInt (v) { return v === null || v === undefined ? '' : intFormat.format(v); }

  function fmtDay (d, withYear) {
    if (!d) return '';
    const [y, m, dd] = d.split('-');
    return Number(dd) + ' ' + MONTHS[Number(m) - 1] + (withYear ? ' ' + y : '');
  }

  function fmtRange (from, to) {
    if (from === to) return fmtDay(from, true);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return fmtDay(from, !sameYear) + ' to ' + fmtDay(to, true);
  }

  // How long ago a day was, from `today`: 'Today', 'Yesterday', '12 d ago'; '' when never.
  function ago (d, today) {
    if (!d) return '';
    const n = daysBetween(d, today);
    return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n + ' d ago';
  }

  // Days a dashboard has gone unopened: since its last view or, if never opened, since created.
  function idleDays (lastView, createdOn, today) {
    const from = lastView || createdOn;
    return from ? daysBetween(from, today) : null;
  }

  function idleReason (lastView, createdOn, today) {
    return lastView ? 'Not opened in ' + daysBetween(lastView, today) + ' d' : 'Never opened';
  }

  // Where a person stands: never active, stopped (active once, nothing in the last `idle` days,
  // whatever the period), active in the period, or quiet (none of these).
  function personStatus (lastActive, periodStart, today, idle) {
    if (!lastActive) return 'never';
    if (daysBetween(lastActive, today) >= (idle || IDLE_DAYS)) return 'stopped';
    return lastActive >= periodStart ? 'active' : 'quiet';
  }

  function plural (n, one, many) { return fmtInt(n) + ' ' + (n === 1 ? one : (many || one + 's')); }

  // The overview's sentence, from the numbers on the page.
  function headline (o) {
    const parts = [plural(o.views, 'dashboard view') + ' in the last ' + o.rangeDays + ' days'];
    if (o.change) {
      parts[0] += o.change.dir === 'flat'
        ? ', level with the ' + o.rangeDays + ' days before'
        : ', ' + (o.change.dir === 'up' ? 'up ' : 'down ') + Math.abs(Math.round(o.change.pct)) + '% on the ' + o.rangeDays + ' days before';
    }
    let text = parts[0] + '.';
    const notes = [];
    if (o.idle > 0) notes.push(o.idle + ' of ' + o.dashboards + ' dashboards were not opened in ' + IDLE_DAYS + ' days');
    if (o.stopped > 0) notes.push(plural(o.stopped, 'person', 'people') + ' stopped coming');
    if (notes.length) text += ' ' + notes.join(', and ').replace(/^./, (c) => c.toUpperCase()) + '.';
    return text;
  }

  // A stable sort of rows by a key function; nulls last whichever the direction.
  function sortRows (rows, keyFn, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    return rows.map((r, i) => ({ r, i, k: keyFn(r) })).sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      if (a.k < b.k) return -sign;
      if (a.k > b.k) return sign;
      return a.i - b.i;
    }).map((x) => x.r);
  }

  const UsageLogic = {
    RANGES, SPARK_DAYS, IDLE_DAYS,
    num, day, addDays, daysBetween, weekStart,
    windows, grainFor, buckets, fillSeries, sparkSeries, sparkPoints,
    delta, indexBy, fmtInt, fmtDay, fmtRange, ago,
    idleDays, idleReason, personStatus, headline, sortRows,
  };

  root.UsageLogic = UsageLogic;
  if (typeof module !== 'undefined' && module.exports) module.exports = UsageLogic;
})(typeof globalThis !== 'undefined' ? globalThis : this);
