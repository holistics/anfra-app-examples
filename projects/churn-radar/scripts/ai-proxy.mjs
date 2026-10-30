#!/usr/bin/env node
// Local proxy between the AI Margin Radar Data App and OpenAI.
//
// The app runs in a sandboxed frame, so it can't hold a secret safely. This proxy keeps the
// OpenAI key on your machine and adds it to each request. It listens on 127.0.0.1 only.
//
//   OPENAI_API_KEY=sk-... node scripts/ai-proxy.mjs
//
// Or put the variables in .env.local (git-ignored):
//   OPENAI_API_KEY=sk-...
//   OPENAI_MODEL=gpt-5-mini          # optional
//   OPENAI_REASONING_EFFORT=low      # optional, reasoning models only
//   AI_PROXY_PORT=7879               # optional (the app expects 7879)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const PORT = Number(process.env.AI_PROXY_PORT || 7879);
const EFFORT = process.env.OPENAI_REASONING_EFFORT || 'low';
const isReasoning = /^(gpt-5|o\d)/.test(MODEL);

const CORS = {
  'access-control-allow-origin': '*', // the Data App frame has an opaque origin ("null")
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-ai-token',
  'access-control-allow-private-network': 'true',
};

function send (res, status, body) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson (req, limit = 4 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: Boolean(KEY), model: MODEL });
  if (req.method !== 'POST' || req.url !== '/chat') return send(res, 404, { error: 'not found' });
  if (!KEY) return send(res, 503, { error: 'OPENAI_API_KEY is not set for the AI proxy' });

  let body;
  try { body = await readJson(req); } catch (err) { return send(res, 400, { error: String(err.message || err) }); }
  if (!Array.isArray(body.messages)) return send(res, 400, { error: 'messages must be an array' });

  // Only messages and tools come from the page. The model and settings are the proxy's.
  const payload = { model: MODEL, messages: body.messages };
  if (Array.isArray(body.tools) && body.tools.length) { payload.tools = body.tools; payload.tool_choice = 'auto'; }
  if (isReasoning) payload.reasoning_effort = EFFORT;

  const started = Date.now();
  try {
    const upstream = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    const calls = (() => { try { return JSON.parse(text).choices?.[0]?.message?.tool_calls?.map((c) => c.function.name).join(',') || 'answer'; } catch { return '?'; } })();
    console.log(`${new Date().toISOString()} ${upstream.status} ${Date.now() - started}ms ${calls}`);
    send(res, upstream.status, text);
  } catch (err) {
    console.error('upstream error:', err.message);
    send(res, 502, { error: `Could not reach OpenAI: ${err.message}` });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI proxy on http://127.0.0.1:${PORT} → ${BASE} (model ${MODEL})`);
  if (!KEY) console.warn('OPENAI_API_KEY is not set: the app will show the assistant as offline. Set it in the environment or .env.local.');
});
