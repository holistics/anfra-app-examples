// server answers with a token naming the persona, signed with KK_SESSION_SECRET (HMAC-SHA256), which the browser keeps
// for its tab and sends back as a bearer token; the server stores nothing. This is demo identity selection, not
// authentication: anyone using the demo may switch persona, and the database still checks every permission for the
// persona chosen. The token only stops a request from claiming a persona the server did not hand out.
import crypto from 'node:crypto';
import { PERSONAS } from '../shared/personas.mjs';

export function createSessions({ secret, lookup, hours = 12 }) {
  const key = secret || crypto.randomBytes(32).toString('hex'); // without a configured secret, sessions end on restart
  const sign = (body) => crypto.createHmac('sha256', key).update(body).digest('base64url');

  function issue(personaKey) {
    const p = Object.hasOwn(PERSONAS, personaKey) ? PERSONAS[personaKey] : null;
    if (!p) return null;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + hours * 3600;
    const body = Buffer.from(JSON.stringify({ sub: p.id, persona: personaKey, iat: now, exp })).toString('base64url');
    return { access_token: `${body}.${sign(body)}`, expires_at: exp, persona: personaKey, user_id: p.id };
  }

  function read(token) {
    const [body, sig, extra] = String(token ?? '').split('.');
    if (!body || !sig || extra !== undefined) return null;
    const want = Buffer.from(sign(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    let claims;
    try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
    const p = PERSONAS[claims?.persona];
    if (!p || p.id !== claims.sub || !(claims.exp * 1000 > Date.now())) return null;
    return claims;
  }

  // The persona's roles come from the database (an Admin may change them), read at most every 30 s per persona.
  const known = new Map();
  async function verify(token) {
    const claims = read(token);
    if (!claims) return null;
    const hit = known.get(claims.sub);
    if (hit && hit.until > Date.now()) return hit.who;
    const roles = await lookup(claims.sub);
    const p = PERSONAS[claims.persona];
    const who = { userId: claims.sub, persona: claims.persona, email: p.email, name: p.name, roles };
    known.set(claims.sub, { who, until: Date.now() + 30000 });
    return who;
  }

  return { issue, read, verify, ephemeral: !secret, forget: () => known.clear() };
}
