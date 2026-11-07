// Minimal RS256 JWT helpers on node:crypto (no dependencies).
// Only RS256 is accepted. Tokens claiming "none", HS256 or anything else are rejected before any key is used.
import { createSign, createVerify, createPublicKey } from 'node:crypto';

export class LtiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const b64u = (input) => Buffer.from(input).toString('base64url');

export function decodeJwt(token) {
  if (typeof token !== 'string' || token.length > 20_000) throw new LtiError(400, 'The launch token is missing or too large.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new LtiError(400, 'The launch token is malformed.');
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
      payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], 'base64url'),
    };
  } catch {
    throw new LtiError(400, 'The launch token is malformed.');
  }
}

export function verifyRs256(decoded, jwk) {
  if (decoded.header.alg !== 'RS256') throw new LtiError(401, 'The launch token uses an unsupported signature type.');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const v = createVerify('RSA-SHA256');
  v.update(decoded.signingInput);
  return v.verify(key, decoded.signature);
}

export function signRs256(payload, privateKey, kid) {
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64u(JSON.stringify(payload));
  const sig = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey);
  return `${header}.${body}.${b64u(sig)}`;
}

// Fetches and caches a platform's public keys. An unknown key id triggers one refetch (rate limited),
// so a platform can rotate keys without a restart.
export class JwksCache {
  constructor(fetchImpl = fetch, { ttlMs = 10 * 60_000, minRefetchMs = 30_000, now = () => Date.now() } = {}) {
    this.fetch = fetchImpl;
    this.ttlMs = ttlMs;
    this.minRefetchMs = minRefetchMs;
    this.now = now;
    this.entries = new Map();
  }

  async keyFor(url, kid) {
    const e = this.entries.get(url);
    const fresh = e && this.now() - e.at < this.ttlMs;
    if (fresh) {
      const hit = pick(e.keys, kid);
      if (hit) return hit;
      if (this.now() - e.at < this.minRefetchMs) throw new LtiError(401, 'The launch token was signed with an unknown key.');
    }
    const res = await this.fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new LtiError(502, 'Could not fetch the platform signing keys.');
    const body = await res.json();
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    this.entries.set(url, { keys, at: this.now() });
    const hit = pick(keys, kid);
    if (!hit) throw new LtiError(401, 'The launch token was signed with an unknown key.');
    return hit;
  }
}

function pick(keys, kid) {
  const rsa = keys.filter((k) => k.kty === 'RSA');
  if (kid) return rsa.find((k) => k.kid === kid) || null;
  return rsa.length === 1 ? rsa[0] : null;
}
