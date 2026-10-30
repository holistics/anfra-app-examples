// Formatting for the Wealthfolio clone. The SDK sends every number as a string; these only display.
window.WF = window.WF || {};
(() => {
  const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const two = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n = (v) => (v === null || v === undefined || v === '' || v === 'NaN' ? null : Number(v));
  const sign = (x, signed) => (x < 0 ? '-' : signed && x > 0 ? '+' : '');   // zero is unsigned
  const money = (v, signed = false) => { const x = n(v); return x === null ? '—' : `${sign(x, signed)}₫${int.format(Math.abs(Math.round(x)))}`; };
  function compact(v, signed = false) {
    const x = n(v); if (x === null) return '—';
    const a = Math.abs(x), s = sign(x, signed);
    if (a >= 1e9) return `${s}₫${two.format(a / 1e9)}B`;
    if (a >= 1e6) return `${s}₫${two.format(a / 1e6)}M`;
    if (a >= 1e3) return `${s}₫${two.format(a / 1e3)}K`;
    return `${s}₫${int.format(a)}`;
  }
  const pct = (v, signed = false) => { const x = n(v); return x === null || !Number.isFinite(x) ? 'N/A' : `${sign(x, signed)}${two.format(Math.abs(x) * 100)}%`; };
  const qty = (v) => (n(v) === null ? '—' : int.format(n(v)));
  const price = (v) => (n(v) === null ? '—' : `₫${two.format(n(v))}`);
  const tone = (v, invert = false) => { const x = n(v); if (x === null || x === 0) return ''; return (x > 0) !== invert ? 'up' : 'down'; };
  function bigMoney(el, v) {   // ₫1,067,269,164 then a dimmed .00
    const x = n(v);
    el.replaceChildren();
    if (x === null) { el.textContent = '—'; return; }
    if (x < 0) el.append('-');
    el.append(Object.assign(document.createElement('span'), { className: 'cur', textContent: '₫' }));
    el.append(int.format(Math.abs(Math.trunc(x))));
    el.append(Object.assign(document.createElement('span'), { className: 'dec', textContent: '.00' }));
  }
  const ymd = (v) => String(v).slice(0, 10);
  const date = (v) => (v ? new Date(`${ymd(v)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const dayLabel = (v) => new Date(`${ymd(v)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthLabel = (v) => new Date(`${ymd(v)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const time = (v) => (v && String(v).length > 10 ? new Date(String(v).slice(0, 19)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');
  WF.fmt = { n, money, compact, pct, qty, price, tone, bigMoney, ymd, date, dayLabel, monthLabel, time };
})();
