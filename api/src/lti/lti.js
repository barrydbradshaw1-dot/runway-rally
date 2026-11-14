// LTI 1.3 (LTI Advantage) tool side: OIDC login, launch validation, roster (NRPS) and grade passback (AGS).
// Written against the 1EdTech spec and D2L Brightspace's registration model (client id, deployment id,
// auth endpoint, token endpoint, keyset URL, audience). Student privacy: no names or emails are stored unless
// LTI_STORE_NAMES=1, and then only "First L." is kept as the display nickname.
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { LtiError, decodeJwt, verifyRs256, signRs256, JwksCache } from './jwt.js';
import { newStudent } from '../logic.js';
import { SKILL_IDS } from '../skills.js';

const NS = 'https://purl.imsglobal.org/spec/lti/claim/';
const CLAIM = {
  type: NS + 'message_type',
  version: NS + 'version',
  deployment: NS + 'deployment_id',
  roles: NS + 'roles',
  context: NS + 'context',
  resourceLink: NS + 'resource_link',
  ags: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  nrps: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
};
export const SCOPE = {
  nrps: 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  lineitem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const str = (v, max = 2000) => (typeof v === 'string' && v.length <= max ? v : '');

export function createLtiService({ store, config, fetchImpl = globalThis.fetch, now = () => Date.now(), log = console }) {
  const jwks = new JwksCache(fetchImpl, { now });
  const states = new Map(); // OIDC state -> { nonce, iss, clientId, exp }. Single container; use the database if you scale out.
  const tokenCache = new Map();
  const rosterCache = new Map();
  const classLocks = new Map();
  const pending = new Set();

  const allowedService = (platform, url) => {
    try {
      return platform.serviceOrigins.has(new URL(url).origin);
    } catch {
      return false;
    }
  };

  // ---------- step 1: OIDC third-party initiated login ----------
  function login(params) {
    const iss = str(params.iss);
    const loginHint = str(params.login_hint);
    const clientId = str(params.client_id, 200);
    if (!iss || !loginHint) throw new LtiError(400, 'The login request is missing required details.');
    const platform = config.findPlatform(iss, clientId || undefined);
    if (!platform) throw new LtiError(400, 'This learning platform is not registered with Runway Rally.');
    const dep = str(params.lti_deployment_id, 200);
    if (dep && !platform.deploymentIds.includes(dep)) throw new LtiError(400, 'This deployment is not registered with Runway Rally.');

    const t = now();
    for (const [k, v] of states) if (v.exp < t) states.delete(k);
    if (states.size > 5000) throw new LtiError(429, 'Too many launches at once. Try again in a minute.');

    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    states.set(state, { nonce, iss: platform.issuer, clientId: platform.clientId, exp: t + 10 * 60_000 });

    const url = new URL(platform.authUrl);
    const q = url.searchParams;
    q.set('scope', 'openid');
    q.set('response_type', 'id_token');
    q.set('client_id', platform.clientId);
    q.set('redirect_uri', `${config.toolBaseUrl}/lti/launch`);
    q.set('login_hint', loginHint);
    q.set('state', state);
    q.set('response_mode', 'form_post');
    q.set('nonce', nonce);
    q.set('prompt', 'none');
    const hint = str(params.lti_message_hint, 4000);
    if (hint) q.set('lti_message_hint', hint);
    return url.toString();
  }

  // ---------- step 2: launch (validate the signed id_token) ----------
  async function launch(form) {
    const state = str(form.state, 200);
    const st = states.get(state);
    states.delete(state); // single use, even when validation fails
    if (!st || st.exp < now()) throw new LtiError(400, 'This launch expired. Please open it again from your course.');

    const decoded = decodeJwt(form.id_token);
    const platform = config.findPlatform(st.iss, st.clientId);
    if (!platform) throw new LtiError(400, 'This learning platform is not registered with Runway Rally.');

    const jwk = await jwks.keyFor(platform.jwksUrl, decoded.header.kid);
    if (!verifyRs256(decoded, jwk)) throw new LtiError(401, 'The launch could not be verified.');

    const c = decoded.payload;
    const nowSec = Math.floor(now() / 1000);
    if (c.iss !== platform.issuer) throw new LtiError(401, 'The launch came from an unexpected platform.');
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(platform.clientId) || (aud.length > 1 && c.azp !== platform.clientId)) throw new LtiError(401, 'The launch was not meant for Runway Rally.');
    if (typeof c.exp !== 'number' || c.exp + 60 < nowSec) throw new LtiError(401, 'This launch expired. Please open it again from your course.');
    if (typeof c.iat !== 'number' || c.iat - 60 > nowSec) throw new LtiError(401, 'The launch has an invalid time.');
    if (c.nonce !== st.nonce) throw new LtiError(401, 'The launch could not be verified.');

    const deploymentId = c[CLAIM.deployment];
    if (!platform.deploymentIds.includes(deploymentId)) throw new LtiError(401, 'This deployment is not registered with Runway Rally.');
    const type = c[CLAIM.type];
    if (type === 'LtiDeepLinkingRequest') throw new LtiError(400, 'Selecting content is not supported yet. Add Runway Rally to your course as a link instead.');
    if (type !== 'LtiResourceLinkRequest') throw new LtiError(400, 'This kind of launch is not supported.');
    if (c[CLAIM.version] !== '1.3.0') throw new LtiError(400, 'This LTI version is not supported.');
    if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) throw new LtiError(400, 'The launch is missing a user.');
    const ctx = c[CLAIM.context];
    if (!ctx || typeof ctx.id !== 'string' || !ctx.id) throw new LtiError(400, 'Open Runway Rally from inside a course.');

    const roles = Array.isArray(c[CLAIM.roles]) ? c[CLAIM.roles].filter((r) => typeof r === 'string') : [];
    const isInstructor = roles.some((r) => /membership(\/[A-Za-z]+)?#(Instructor|Administrator|ContentDeveloper|TeachingAssistant)$/.test(r) || /institution\/person#(Instructor|Administrator|Faculty)$/.test(r));
    const isLearner = roles.some((r) => /#Learner$/.test(r));
    if (!isInstructor && !isLearner) throw new LtiError(403, 'Your role in this course does not have access to Runway Rally.');

    const classCode = 'LTI-' + sha256(`${platform.issuer}|${deploymentId}|${ctx.id}`).slice(0, 8).toUpperCase();
    const ags = readAgs(platform, c[CLAIM.ags]);
    const nrps = c[CLAIM.nrps];
    const rl = c[CLAIM.resourceLink];
    const patch = {
      kind: 'lti',
      iss: platform.issuer,
      clientId: platform.clientId,
      deploymentId,
      contextId: ctx.id,
      contextTitle: str(ctx.title || ctx.label, 120).replace(/[<>]/g, ''),
      lastLaunchAt: new Date(now()).toISOString(),
    };
    if (nrps?.context_memberships_url && allowedService(platform, nrps.context_memberships_url)) patch.nrpsUrl = nrps.context_memberships_url;
    if (ags?.lineitems) patch.agsLineitems = ags.lineitems;
    const cls = await store.upsertClass(classCode, patch);

    if (isInstructor) {
      const session = config.signSession({ kind: 'teacher', classCode, title: cls.contextTitle || classCode }, 8 * 3600, now());
      return { kind: 'teacher', location: `/admin/#lti=${session}` };
    }

    const ltiKey = sha256(`${platform.issuer}|${deploymentId}|${ctx.id}|${c.sub}`);
    const info = { ltiKey, iss: platform.issuer, clientId: platform.clientId, deploymentId, sub: c.sub, contextId: ctx.id, resourceLinkId: str(rl?.id, 200) || null, ags };
    const token = randomBytes(24).toString('base64url');
    const hash = sha256(token);
    let student = await store.getStudentByLtiKey(ltiKey);
    if (!student) {
      student = newStudent({ id: randomUUID(), classCode, nickname: nicknameFor(c) });
      student.lti = info;
      await store.createStudent(student, hash);
      await store.addEvent(student.id, 'lti_first_launch');
    } else {
      student.lti = info;
      await store.saveStudent(student);
      await store.addToken(student.id, hash);
    }
    return { kind: 'student', location: `/#lti=${token}` };
  }

  function readAgs(platform, claim) {
    if (!claim || typeof claim !== 'object') return null;
    const ok = (u) => (u && allowedService(platform, u) ? u : null);
    return { lineitem: ok(claim.lineitem), lineitems: ok(claim.lineitems), scope: Array.isArray(claim.scope) ? claim.scope.filter((s) => typeof s === 'string') : [] };
  }

  function nicknameFor(c) {
    if (config.storeNames && typeof c.given_name === 'string') {
      const initial = typeof c.family_name === 'string' && c.family_name ? ` ${[...c.family_name][0]}.` : '';
      const n = `${c.given_name}${initial}`.replace(/[^\p{L}\p{N} .'_-]/gu, '').trim().slice(0, 20);
      if (n.length >= 2) return n;
    }
    return `Designer ${randomInt(1000, 10000)}`;
  }

  // ---------- OAuth2 client credentials (signed JWT assertion) for NRPS and AGS ----------
  async function accessToken(platform, scopes) {
    const key = `${platform.issuer}|${platform.clientId}|${[...scopes].sort().join(' ')}`;
    const hit = tokenCache.get(key);
    if (hit && hit.exp > now() + 30_000) return hit.token;
    const iat = Math.floor(now() / 1000);
    const assertion = signRs256({ iss: platform.clientId, sub: platform.clientId, aud: platform.audience, jti: randomUUID(), iat, exp: iat + 300 }, config.privateKey, config.kid);
    const res = await fetchImpl(platform.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        scope: scopes.join(' '),
      }),
    });
    if (!res.ok) throw new Error(`token request failed (${res.status})`);
    const j = await res.json();
    if (!j.access_token) throw new Error('token response had no access_token');
    tokenCache.set(key, { token: j.access_token, exp: now() + (Number(j.expires_in) || 300) * 1000 });
    return j.access_token;
  }

  // ---------- NRPS: who is enrolled (ids and roles only, no names) ----------
  async function roster(cls) {
    if (!cls?.nrpsUrl) return null;
    const cached = rosterCache.get(cls.code);
    if (cached && cached.exp > now()) return cached.value;
    const platform = config.findPlatform(cls.iss, cls.clientId);
    if (!platform) return null;
    const token = await accessToken(platform, [SCOPE.nrps]);
    const learners = new Set();
    let url = cls.nrpsUrl;
    for (let page = 0; url && page < 20; page++) {
      if (!allowedService(platform, url)) break;
      const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json' } });
      if (!res.ok) throw new Error(`roster request failed (${res.status})`);
      const body = await res.json();
      for (const m of body.members || []) {
        const isLearner = (m.roles || []).some((r) => /(^|#)Learner$/.test(r));
        if (isLearner && m.status !== 'Inactive' && typeof m.user_id === 'string') learners.add(m.user_id);
      }
      const next = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(res.headers.get('link') || '');
      url = next ? new URL(next[1], url).toString() : null;
    }
    const value = { learners };
    rosterCache.set(cls.code, { value, exp: now() + 5 * 60_000 });
    return value;
  }

  async function rosterSummary(classCode, students) {
    const cls = await store.getClass(classCode);
    if (!cls?.nrpsUrl) return null;
    try {
      const r = await roster(cls);
      if (!r) return null;
      const launched = students.filter((s) => s.lti?.sub && r.learners.has(s.lti.sub)).length;
      return { enrolled: r.learners.size, launched, notLaunched: Math.max(0, r.learners.size - launched) };
    } catch (err) {
      log.warn?.(`roster lookup failed for ${classCode}: ${err.message}`);
      return { error: 'unavailable' };
    }
  }

  // ---------- AGS: send a grade back to the Brightspace gradebook ----------
  function computeScore(student) {
    if (config.scoreMode === 'mastery') {
      const tried = SKILL_IDS.filter((k) => (student.skillStats?.[k]?.answered ?? 0) > 0);
      if (!tried.length) return 0;
      return Math.round((100 * tried.reduce((s, k) => s + student.mastery[k], 0)) / tried.length);
    }
    return Math.min(100, student.stats.commissions * 20); // effort based: 5 finished commissions = full marks
  }

  async function ensureLineItem(cls, platform, ags, resourceLinkId) {
    const key = resourceLinkId || 'default';
    const prev = classLocks.get(cls.code) || Promise.resolve();
    let release;
    classLocks.set(cls.code, new Promise((r) => (release = r)));
    await prev;
    try {
      const fresh = await store.getClass(cls.code);
      if (fresh?.lineitems?.[key]) return fresh.lineitems[key];
      if (!ags.lineitems || !ags.scope.includes(SCOPE.lineitem)) return null;
      const token = await accessToken(platform, [SCOPE.lineitem]);
      const res = await fetchImpl(ags.lineitems, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/vnd.ims.lis.v2.lineitem+json', accept: 'application/vnd.ims.lis.v2.lineitem+json' },
        body: JSON.stringify({ scoreMaximum: 100, label: 'Runway Rally practice', tag: 'runway-rally', ...(resourceLinkId ? { resourceLinkId } : {}) }),
      });
      if (!res.ok) throw new Error(`line item create failed (${res.status})`);
      const item = await res.json();
      if (!item.id || !allowedService(platform, item.id)) throw new Error('line item response was not usable');
      await store.upsertClass(cls.code, { lineitems: { ...(fresh?.lineitems || {}), [key]: item.id } });
      return item.id;
    } finally {
      release();
    }
  }

  async function postScore(student) {
    const l = student.lti;
    if (!l?.sub || !l.ags) return { skipped: 'no grade service for this launch' };
    if (!l.ags.scope.includes(SCOPE.score)) return { skipped: 'score scope was not granted' };
    const platform = config.findPlatform(l.iss, l.clientId);
    const cls = await store.getClass(student.classCode);
    if (!platform || !cls) return { skipped: 'unknown platform or class' };
    const lineitem = l.ags.lineitem || cls.lineitems?.[l.resourceLinkId || 'default'] || (await ensureLineItem(cls, platform, l.ags, l.resourceLinkId));
    if (!lineitem) return { skipped: 'no grade column available' };

    const score = computeScore(student);
    const token = await accessToken(platform, [SCOPE.score]);
    const url = new URL(lineitem);
    url.pathname = url.pathname.replace(/\/$/, '') + '/scores'; // keeps any query string intact
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify({
        userId: l.sub,
        scoreGiven: score,
        scoreMaximum: 100,
        activityProgress: score >= 100 ? 'Completed' : 'InProgress',
        gradingProgress: 'FullyGraded',
        timestamp: new Date(now()).toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`score post failed (${res.status})`);
    return { posted: true, score };
  }

  // fire and forget from the request path; failures are logged, never shown to the student
  function schedulePostScore(student) {
    if (!student.lti) return;
    const p = postScore(student)
      .catch((err) => log.warn?.(`grade passback failed for a student in ${student.classCode}: ${err.message}`))
      .finally(() => pending.delete(p));
    pending.add(p);
  }

  return {
    enabled: config.enabled,
    login,
    launch,
    roster,
    rosterSummary,
    postScore,
    schedulePostScore,
    settle: () => Promise.allSettled([...pending]),
    jwksDocument: () => ({ keys: [config.publicJwk] }),
    info() {
      const base = config.toolBaseUrl;
      return {
        enabled: config.enabled,
        name: 'Runway Rally',
        description: 'A fashion-themed math practice game. Students earn outfits and cards by solving math.',
        domain: base,
        redirectUrls: [`${base}/lti/launch`],
        openIdConnectLoginUrl: `${base}/lti/login`,
        targetLinkUri: `${base}/lti/launch`,
        keysetUrl: `${base}/lti/jwks.json`,
        extensions: ['Assignment and Grade Services', 'Names and Role Provisioning Services'],
        scoreMode: config.scoreMode,
      };
    },
  };
}
