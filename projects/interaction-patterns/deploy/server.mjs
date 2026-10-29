// Serves the gallery pages and lets the page run AQL against the local anfra server.
// POST /api/run { query, input?, timezone? } → anfra core.query on the ecommerce dataset, first 50 rows.
// Same origin as the page, so the portal's review button keeps working.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = Number(process.env.PORT || 8080);
const ANFRA = process.env.ANFRA_URL || 'http://127.0.0.1:5173';
// BASE_PATH=/interaction-patterns serves everything under that prefix, as on anfra.ai. The page
// finds its api/ and media/ relative to itself, so only the server needs to know.
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');

// Per-visitor limits a minute, as demo.anfra.ai's host has: queries (core.query and /api/run) and exports.
const LIMITS = { query: Number(process.env.QUERY_RATE_LIMIT ?? 600), export: Number(process.env.EXPORT_RATE_LIMIT ?? 10) };
// The visitor's address: CLIENT_IP_HEADER (such as cf-connecting-ip) when set, else with TRUST_PROXY=1
// the address the one proxy in front appended (the last in X-Forwarded-For), else the socket's.
const IP_HEADER = (process.env.CLIENT_IP_HEADER || '').toLowerCase();
function clientOf(req) {
	return (IP_HEADER && req.headers[IP_HEADER]?.toString().trim())
		|| (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.toString().split(',').at(-1).trim())
		|| req.socket.remoteAddress || 'unknown';
}
let windowStart = Date.now(), counts = new Map();
// true when this request goes over the visitor's limit for this minute
function limited(req, res, kind) {
	if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); counts = new Map(); }
	const key = kind + ' ' + clientOf(req);
	const n = (counts.get(key) || 0) + 1;
	counts.set(key, n);
	if (n <= LIMITS[kind]) return false;
	res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(Math.ceil((windowStart + 60_000 - Date.now()) / 1000)) });
	res.end(JSON.stringify({ code: 'rate_limited', message: 'Too many requests. Try again in a minute.', error: { message: 'Too many requests. Try again in a minute.' } }));
	return true;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.js': 'text/javascript' };

function send(res, code, body, type = 'application/json') {
	res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
	res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function run(req, res) {
	let raw = '';
	for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) return send(res, 413, { error: { message: 'Query too long' } }); }
	let body;
	try { body = JSON.parse(raw); } catch { return send(res, 400, { error: { message: 'Not JSON' } }); }
	if (typeof body.query !== 'string' || !body.query.trim()) return send(res, 400, { error: { message: 'No query' } });
	const payload = { dataset: 'ecommerce', lang: 'aql', query: body.query, page_size: 50 };
	if (body.input && typeof body.input === 'object') payload.input = body.input;
	if (typeof body.timezone === 'string' && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(body.timezone)) payload.timezone = body.timezone;
	const t0 = Date.now();
	try {
		const r = await fetch(`${ANFRA}/api/core.query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
		const out = await r.json();
		out.ms = Date.now() - t0;
		send(res, r.status, out);
	} catch (e) {
		send(res, 502, { error: { message: `anfra is not reachable: ${e.message}` } });
	}
}

// the live mini Data Apps: the SDK's host on the page calls these, as on demo.anfra.ai
const CORE = new Set(['/api/core.show', '/api/core.query', '/api/core.query.export']);
async function core(req, res, pathname) {
	const chunks = [];
	for await (const c of req) { chunks.push(c); if (chunks.reduce((n, x) => n + x.length, 0) > 256_000) return send(res, 413, { error: { message: 'Too large' } }); }
	try {
		const r = await fetch(ANFRA + pathname, { method: 'POST', headers: { 'content-type': req.headers['content-type'] || 'application/json' }, body: Buffer.concat(chunks) });
		const buf = Buffer.from(await r.arrayBuffer());
		res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
		res.end(buf);
	} catch (e) {
		send(res, 502, { code: 'unreachable', message: `anfra is not reachable: ${e.message}` });
	}
}

http.createServer(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	let pathname = url.pathname;
	if (BASE) {
		// the bare prefix gets its slash, so the page's relative links resolve under it
		if (pathname === BASE) { res.writeHead(301, { location: BASE + '/' + url.search }); return res.end(); }
		if (!pathname.startsWith(BASE + '/')) return send(res, 404, 'Not found', 'text/plain');
		pathname = pathname.slice(BASE.length);
	}
	if (req.method === 'POST' && pathname === '/api/run') return limited(req, res, 'query') || run(req, res);
	if (req.method === 'POST' && CORE.has(pathname)) {
		const kind = pathname === '/api/core.query' ? 'query' : pathname === '/api/core.query.export' ? 'export' : null;
		return (kind && limited(req, res, kind)) || core(req, res, pathname);
	}
	if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
	let file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
	if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
	if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
	const stat = fs.statSync(file);
	const type = TYPES[path.extname(file)] || 'application/octet-stream';
	const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
	if (range) {
		// videos seek with range requests
		const start = range[1] ? Number(range[1]) : 0;
		const end = range[2] ? Number(range[2]) : stat.size - 1;
		res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
		return fs.createReadStream(file, { start, end }).pipe(res);
	}
	res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
	if (req.method === 'HEAD') return res.end();
	fs.createReadStream(file).pipe(res);
}).listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`gallery on :${PORT}${BASE}/, root ${ROOT}, anfra ${ANFRA}`));
