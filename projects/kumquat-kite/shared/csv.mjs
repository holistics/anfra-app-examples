// A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF.
// Returns objects keyed by the header row. Values stay strings exactly as written (the import keeps raw rows).
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a byte-order mark
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body.map((cells, n) => {
    if (cells.length !== header.length) throw new Error(`row ${n + 2} has ${cells.length} fields, the header has ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h.trim(), cells[i]]));
  });
}

// Writes rows (arrays of strings or nulls) as RFC 4180 CSV with CRLF line ends. A text cell that a spreadsheet would
// run as a formula (=, +, -, @ at the start, other than a plain number) gets a leading apostrophe.
export function formatCsv(header, rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
