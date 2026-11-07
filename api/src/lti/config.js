// LTI configuration: registered platforms, the tool's signing key, and signed teacher sessions.
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { b64u } from './jwt.js';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function checkUrl(label, value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`LTI config: ${label} is not a valid URL`);
  }
  const ok = u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname));
  if (!ok) throw new Error(`LTI config: ${label} must use https`);
  return u;
}

function loadPlatforms(env) {
  let raw = env.LTI_PLATFORMS;
  if (!raw && env.LTI_CONFIG_FILE) raw = readFileSync(env.LTI_CONFIG_FILE, 'utf8');
  if (!raw) return [];
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('LTI config: platforms must be a JSON array');
  return list.map((p, i) => {
    for (const f of ['issuer', 'clientId', 'authUrl', 'tokenUrl', 'jwksUrl']) {
      if (typeof p[f] !== 'string' || !p[f]) throw new Error(`LTI config: platform ${i} is missing ${f}`);
    }
    if (!Array.isArray(p.deploymentIds) || !p.deploymentIds.length || p.deploymentIds.some((d) => typeof d !== 'string' || !d)) {
      throw new Error(`LTI config: platform ${i} needs at least one deploymentId`);
    }
    const origins = new Set([checkUrl('issuer', p.issuer).origin, checkUrl('authUrl', p.authUrl).origin, checkUrl('jwksUrl', p.jwksUrl).origin]);
    checkUrl('tokenUrl', p.tokenUrl);
    for (const extra of p.serviceOrigins || []) origins.add(checkUrl('serviceOrigins', extra).origin);
    return {
      issuer: p.issuer,
      clientId: p.clientId,
      authUrl: p.authUrl,
      tokenUrl: p.tokenUrl,
      jwksUrl: p.jwksUrl,
      audience: p.audience || p.tokenUrl, // Brightspace publishes a separate "OAuth2 Audience"
      deploymentIds: p.deploymentIds,
      serviceOrigins: origins, // NRPS and AGS URLs must live on one of these origins
    };
  });
}

function loadPrivateKey(env, enabled) {
  let pem = null;
  if (env.LTI_PRIVATE_KEY_B64) pem = Buffer.from(env.LTI_PRIVATE_KEY_B64, 'base64').toString('utf8');
  else if (env.LTI_PRIVATE_KEY) pem = env.LTI_PRIVATE_KEY.replace(/\\n/g, '\n');
  if (pem) return createPrivateKey(pem);
  if (enabled && env.NODE_ENV === 'production') {
    console.warn('LTI: no LTI_PRIVATE_KEY_B64 set, using a temporary key that changes on every restart');
  }
  return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
}

export function loadLtiConfig(env = process.env) {
  const platforms = loadPlatforms(env);
  const enabled = platforms.length > 0;
  const toolBaseUrl = (env.LTI_TOOL_URL || (env.DOMAIN ? `https://${env.DOMAIN}` : '')).replace(/\/$/, '');
  if (enabled && !toolBaseUrl) throw new Error('LTI config: set LTI_TOOL_URL (or DOMAIN) so launch URLs can be built');
  if (toolBaseUrl) checkUrl('LTI_TOOL_URL', toolBaseUrl);

  const privateKey = loadPrivateKey(env, enabled);
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const kid = createHash('sha256').update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })).digest('hex').slice(0, 16);
  const publicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' };

  const secret = env.LTI_SESSION_SECRET ? Buffer.from(env.LTI_SESSION_SECRET) : randomBytes(32);
  const mac = (s) => createHmac('sha256', secret).update(s).digest();

  const scoreMode = env.LTI_SCORE_MODE === 'mastery' ? 'mastery' : 'completion';
  const storeNames = env.LTI_STORE_NAMES === '1';

  return {
    enabled,
    platforms,
    toolBaseUrl,
    privateKey,
    publicJwk,
    kid,
    scoreMode,
    storeNames,
    frameAncestors: [...new Set(platforms.flatMap((p) => [new URL(p.issuer).origin, new URL(p.authUrl).origin]))],

    findPlatform(issuer, clientId) {
      const hits = platforms.filter((p) => p.issuer === issuer && (!clientId || p.clientId === clientId));
      return hits.length === 1 ? hits[0] : null;
    },

    // Signed, expiring teacher session: "<payload>.<hmac>". Scoped to one class code.
    signSession(payload, ttlSeconds = 8 * 3600, nowMs = Date.now()) {
      const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(nowMs / 1000) + ttlSeconds }));
      return `${body}.${b64u(mac(body))}`;
    },
    verifySession(token, nowMs = Date.now()) {
      if (typeof token !== 'string' || token.length > 2000) return null;
      const [body, sig] = token.split('.');
      if (!body || !sig) return null;
      const want = mac(body);
      let got;
      try {
        got = Buffer.from(sig, 'base64url');
      } catch {
        return null;
      }
      if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
      try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        return payload.exp > Math.floor(nowMs / 1000) ? payload : null;
      } catch {
        return null;
      }
    },
  };
}
