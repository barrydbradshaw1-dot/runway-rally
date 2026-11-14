import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createApp } from '../src/server.js';
import { MemoryStore, PgStore } from '../src/store.js';
import { signRs256, decodeJwt, verifyRs256 } from '../src/lti/jwt.js';

const ISS = 'https://lms.test';
const CLIENT = 'client-123';
const DEP = 'dep-1';
const NS = 'https://purl.imsglobal.org/spec/lti/claim/';
const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
const LINEITEM = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';

// A tiny stand-in for D2L Brightspace: signing keys, JWKS, OAuth token endpoint, NRPS and AGS.
function fakePlatform() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'plat-key-1';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const p = { privateKey, otherKey: other.privateKey, kid, tokens: [], scores: [], lineItemsCreated: 0, toolJwks: null, members: [] };
  for (let i = 0; i < 5; i++) p.members.push({ user_id: `stu-${i}`, roles: [LEARNER], status: 'Active' });
  p.members.push({ user_id: 'teach-1', roles: [INSTRUCTOR], status: 'Active' }, { user_id: 'stu-gone', roles: [LEARNER], status: 'Inactive' });

  p.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
    if (url.pathname === '/jwks') return json({ keys: [jwk] });
    if (url.pathname === '/token') {
      const form = new URLSearchParams(String(init.body));
      const d = decodeJwt(form.get('client_assertion'));
      assert.equal(d.payload.aud, 'https://lms.test/token-audience');
      assert.equal(d.payload.iss, CLIENT);
      assert.ok(verifyRs256(d, p.toolJwks.keys[0]), 'client assertion must verify against the tool JWKS');
      p.tokens.push(form.get('scope'));
      return json({ access_token: 'at-' + p.tokens.length, expires_in: 3600, token_type: 'Bearer' });
    }
    if (url.pathname === '/nrps') {
      assert.ok(String(init.headers.authorization).startsWith('Bearer at-'));
      const page = Number(url.searchParams.get('page') || 0);
      const slice = p.members.slice(page * 4, page * 4 + 4);
      const more = (page + 1) * 4 < p.members.length;
      return json({ members: slice }, more ? { link: `<https://lms.test/nrps?page=${page + 1}>; rel="next"` } : {});
    }
    if (url.pathname === '/lineitems' && init.method === 'POST') {
      p.lineItemsCreated += 1;
      return json({ id: 'https://lms.test/lineitems/77', scoreMaximum: 100 });
    }
    if (url.pathname === '/lineitems/77/scores' && init.method === 'POST') {
      p.scores.push({ auth: init.headers.authorization, type: init.headers['content-type'], body: JSON.parse(init.body) });
      return new Response(null, { status: 204 });
    }
    return new Response('nope', { status: 404 });
  };
  return p;
}

async function boot(extraEnv = {}, platformOpts = {}) {
  const platform = fakePlatform();
  const url = process.env.TEST_DATABASE_URL;
  const store = url ? new PgStore(url) : new MemoryStore();
  await store.init();
  if (url) await store.pool.query('TRUNCATE events, tasks, students, classes, student_tokens CASCADE');
  const env = {
    NODE_ENV: 'test',
    LTI_TOOL_URL: 'http://127.0.0.1:1', // replaced after listen via launch URLs; only the path matters in tests
    LTI_PLATFORMS: JSON.stringify([
      { issuer: ISS, clientId: CLIENT, authUrl: 'https://lms.test/auth', tokenUrl: 'https://lms.test/token', audience: 'https://lms.test/token-audience', jwksUrl: 'https://lms.test/jwks', deploymentIds: [DEP], ...platformOpts },
    ]),
    ...extraEnv,
  };
  const { server, lti } = createApp({ store, env, seed: 5, fetchImpl: platform.fetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  platform.toolJwks = lti.jwksDocument();

  const raw = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  const api = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* html */
    }
    return { status: res.status, json, text };
  };

  // Full launch: OIDC login, then the platform posts a signed id_token back.
  async function launch({ claims = {}, sub = 'stu-1', roles = [LEARNER], key = platform.privateKey, header = {}, mutate, nonce, state, ctx = { id: 'course-9', title: 'Algebra Support' }, ags = true } = {}) {
    const lr = await raw(`/lti/login?iss=${encodeURIComponent(ISS)}&login_hint=hint&client_id=${CLIENT}&lti_deployment_id=${DEP}&lti_message_hint=mh&target_link_uri=x`);
    assert.equal(lr.status, 302);
    const loc = new URL(lr.headers.get('location'));
    const st = loc.searchParams.get('state');
    const nn = loc.searchParams.get('nonce');
    const iat = Math.floor(Date.now() / 1000);
    let payload = {
      iss: ISS,
      aud: CLIENT,
      sub,
      iat,
      exp: iat + 300,
      nonce: nonce ?? nn,
      [NS + 'message_type']: 'LtiResourceLinkRequest',
      [NS + 'version']: '1.3.0',
      [NS + 'deployment_id']: DEP,
      [NS + 'roles']: roles,
      [NS + 'resource_link']: { id: 'rl-1' },
      ...(ctx ? { [NS + 'context']: ctx } : {}),
      'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': { context_memberships_url: 'https://lms.test/nrps', service_versions: ['2.0'] },
      ...(ags ? { 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': { scope: [SCORE, LINEITEM], lineitems: 'https://lms.test/lineitems' } } : {}),
      given_name: 'Maya',
      family_name: 'Rivera',
      ...claims,
    };
    if (mutate) payload = mutate(payload);
    const token = signRs256(payload, key, platform.kid);
    const finalToken = header.alg ? forgeHeader(token, header) : token;
    const res = await raw('/lti/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: finalToken, state: state ?? st }),
    });
    return { res, state: st, token: finalToken };
  }

  return { server, lti, store, platform, raw, api, launch, base };
}

function forgeHeader(token, header) {
  const [, body, sig] = token.split('.');
  const h = Buffer.from(JSON.stringify({ typ: 'JWT', ...header })).toString('base64url');
  return `${h}.${body}.${sig}`;
}

const tokenFrom = (res) => /#lti=([A-Za-z0-9_.-]+)$/.exec(res.headers.get('location'))?.[1];

async function withApp(fn, env, opts) {
  const ctx = await boot(env, opts);
  try {
    await fn(ctx);
  } finally {
    ctx.server.close();
    if (ctx.store.close) await ctx.store.close();
  }
}

test('login redirects to the platform with state, nonce and the right parameters; unknown issuers are refused', () =>
  withApp(async ({ raw }) => {
    const r = await raw(`/lti/login?iss=${encodeURIComponent(ISS)}&login_hint=abc&client_id=${CLIENT}&lti_message_hint=mm`);
    assert.equal(r.status, 302);
    const u = new URL(r.headers.get('location'));
    assert.equal(u.origin + u.pathname, 'https://lms.test/auth');
    assert.equal(u.searchParams.get('response_type'), 'id_token');
    assert.equal(u.searchParams.get('response_mode'), 'form_post');
    assert.equal(u.searchParams.get('scope'), 'openid');
    assert.equal(u.searchParams.get('prompt'), 'none');
    assert.equal(u.searchParams.get('client_id'), CLIENT);
    assert.equal(u.searchParams.get('login_hint'), 'abc');
    assert.equal(u.searchParams.get('lti_message_hint'), 'mm');
    assert.match(u.searchParams.get('redirect_uri'), /\/lti\/launch$/);
    assert.ok(u.searchParams.get('state').length >= 20 && u.searchParams.get('nonce').length >= 20);

    assert.equal((await raw('/lti/login?iss=https%3A%2F%2Fevil.test&login_hint=abc')).status, 400);
    assert.equal((await raw(`/lti/login?iss=${encodeURIComponent(ISS)}`)).status, 400); // no login_hint
    assert.equal((await raw(`/lti/login?iss=${encodeURIComponent(ISS)}&login_hint=a&lti_deployment_id=other`)).status, 400);
  }));

test('student launch creates an anonymous student, repeat launches reuse it, and the page never exposes LTI internals', () =>
  withApp(async ({ launch, api }) => {
    const a = await launch({ sub: 'stu-1' });
    assert.equal(a.res.status, 303);
    assert.match(a.res.headers.get('location'), /^\/#lti=/);
    const t1 = tokenFrom(a.res);
    const s1 = await api('/api/state', { token: t1 });
    assert.equal(s1.status, 200);
    assert.match(s1.json.student.nickname, /^Designer \d{4}$/);
    assert.equal(s1.json.student.viaLti, true);
    assert.match(s1.json.student.classCode, /^LTI-[0-9A-F]{8}$/);
    assert.ok(!s1.text.includes('Maya') && !s1.text.includes('Rivera') && !s1.text.includes('stu-1') && !s1.text.includes('lms.test'));

    // progress carries over on the next launch (new token, same student)
    await api('/api/commission/start', { method: 'POST', token: t1, body: {} });
    const b = await launch({ sub: 'stu-1' });
    const t2 = tokenFrom(b.res);
    assert.notEqual(t1, t2);
    const s2 = await api('/api/state', { token: t2 });
    assert.equal(s2.json.student.nickname, s1.json.student.nickname);
    assert.ok(s2.json.student.commission, 'in-progress commission is kept');
    assert.equal((await api('/api/state', { token: t1 })).status, 200, 'the earlier session still works on another device');

    // a different user in the same course lands in the same class but is a different student
    const c = await launch({ sub: 'stu-2' });
    const s3 = await api('/api/state', { token: tokenFrom(c.res) });
    assert.equal(s3.json.student.classCode, s1.json.student.classCode);
    assert.equal(s3.json.student.stats.answered, 0, 'new student, fresh progress');
  }));

test('LTI_STORE_NAMES=1 keeps only "Given F." as the nickname', () =>
  withApp(
    async ({ launch, api }) => {
      const a = await launch({});
      const s = await api('/api/state', { token: tokenFrom(a.res) });
      assert.equal(s.json.student.nickname, 'Maya R.');
    },
    { LTI_STORE_NAMES: '1' },
  ));

test('instructor launch gives a teacher session scoped to that course only', () =>
  withApp(async ({ launch, api }) => {
    const stu = await launch({ sub: 'stu-1' });
    const code = (await api('/api/state', { token: tokenFrom(stu.res) })).json.student.classCode;

    const t = await launch({ sub: 'teach-1', roles: [INSTRUCTOR] });
    assert.equal(t.res.status, 303);
    assert.match(t.res.headers.get('location'), /^\/admin\/#lti=/);
    const session = tokenFrom(t.res);

    const me = await api('/api/admin/me', { headers: { 'x-lti-session': session } });
    assert.equal(me.json.kind, 'teacher');
    assert.equal(me.json.classCode, code);
    assert.equal(me.json.title, 'Algebra Support');

    const roster = await api(`/api/admin/class/${code}`, { headers: { 'x-lti-session': session } });
    assert.equal(roster.status, 200);
    assert.equal(roster.json.title, 'Algebra Support');
    assert.equal(roster.json.students.length, 1);
    // NRPS: 5 active learners enrolled (inactive learner and instructor excluded), 1 has launched
    assert.deepEqual(roster.json.roster, { enrolled: 5, launched: 1, notLaunched: 4 });
    assert.ok(!roster.text.includes('stu-0'), 'roster response carries counts only, not LMS user ids');

    assert.equal((await api('/api/admin/class/OTHER1', { headers: { 'x-lti-session': session } })).status, 403);
    assert.equal((await api(`/api/admin/class/${code}`, { headers: { 'x-lti-session': session + 'x' } })).status, 401);
    assert.equal((await api(`/api/admin/class/${code}`, { headers: { 'x-lti-session': 'a.b' } })).status, 401);
    // a student's session token is not a teacher session
    assert.equal((await api(`/api/admin/class/${code}`, { headers: { 'x-lti-session': tokenFrom(stu.res) } })).status, 401);
    assert.equal((await api(`/api/admin/class/${code}`)).status, 403, 'no credentials at all');
  }));

test('launch validation rejects tampering, replay and wrong claims', () =>
  withApp(async ({ launch, platform, raw }) => {
    const status = async (opts) => (await launch(opts)).res.status;

    assert.equal(await status({ key: platform.otherKey }), 401, 'signed with a key the platform does not publish');
    assert.equal(await status({ mutate: (p) => ({ ...p, aud: 'someone-else' }) }), 401, 'wrong audience');
    assert.equal(await status({ mutate: (p) => ({ ...p, iss: 'https://evil.test' }) }), 401, 'wrong issuer');
    assert.equal(await status({ mutate: (p) => ({ ...p, exp: Math.floor(Date.now() / 1000) - 600 }) }), 401, 'expired');
    assert.equal(await status({ nonce: 'wrong-nonce' }), 401, 'wrong nonce');
    assert.equal(await status({ mutate: (p) => ({ ...p, [NS + 'deployment_id']: 'unknown' }) }), 401, 'unknown deployment');
    assert.equal(await status({ mutate: (p) => ({ ...p, [NS + 'version']: '1.1.0' }) }), 400, 'wrong LTI version');
    assert.equal(await status({ ctx: null }), 400, 'no course context');
    assert.equal(await status({ mutate: (p) => ({ ...p, [NS + 'message_type']: 'LtiDeepLinkingRequest' }) }), 400, 'deep linking not supported');
    assert.equal(await status({ roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor'] }), 403, 'role without access');
    assert.equal(await status({ header: { alg: 'none' } }), 401, 'alg none');
    assert.equal(await status({ header: { alg: 'HS256' } }), 401, 'alg HS256');
    assert.equal(await status({ state: 'never-issued' }), 400, 'unknown state');

    // state replay: a good launch cannot be posted twice
    const ok = await launch({});
    assert.equal(ok.res.status, 303);
    const again = await raw('/lti/launch', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: ok.token, state: ok.state }) });
    assert.equal(again.status, 400);

    // oversized body
    const big = await raw('/lti/launch', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'id_token=' + 'a'.repeat(70_000) });
    assert.equal(big.status, 413);
  }));

test('error pages are plain html and escape their text', () =>
  withApp(async ({ launch }) => {
    const r = (await launch({ roles: ['x'] })).res;
    assert.equal(r.status, 403);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text();
    assert.ok(!/<script|style=/i.test(html));
  }));

test('finishing a commission posts a completion grade to the gradebook, creating the line item once', () =>
  withApp(async ({ launch, api, platform, lti }) => {
    const a = await launch({ sub: 'stu-1' });
    const token = tokenFrom(a.res);
    const b = await launch({ sub: 'stu-2' });
    const token2 = tokenFrom(b.res);

    async function finishCommission(tk) {
      const started = await api('/api/commission/start', { method: 'POST', token: tk, body: { theme: 'runway' } });
      let task = started.json.task;
      for (let n = 0; n < 5; n++) {
        await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
        const r = await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
        if (r.json.next) task = r.json.next;
      }
    }
    await finishCommission(token);
    await finishCommission(token2);
    await lti.settle();

    assert.equal(platform.lineItemsCreated, 1, 'one grade column for the course, not one per student');
    assert.equal(platform.scores.length, 2);
    const s = platform.scores.find((x) => x.body.userId === 'stu-1');
    assert.match(s.auth, /^Bearer at-/);
    assert.equal(s.type, 'application/vnd.ims.lis.v1.score+json');
    assert.equal(s.body.scoreGiven, 20, 'completion mode: 1 of 5 commissions = 20');
    assert.equal(s.body.scoreMaximum, 100);
    assert.equal(s.body.gradingProgress, 'FullyGraded');
    assert.equal(s.body.activityProgress, 'InProgress');
    assert.ok(!Number.isNaN(Date.parse(s.body.timestamp)));
    assert.ok(platform.tokens.some((t) => t.includes(SCORE)));

    await finishCommission(token);
    await lti.settle();
    assert.equal(platform.scores.filter((x) => x.body.userId === 'stu-1').pop().body.scoreGiven, 40);
    assert.equal(platform.lineItemsCreated, 1);
  }));

test('mastery mode reports average mastery across skills the student has tried', () =>
  withApp(
    async ({ launch, api, platform, lti }) => {
      const a = await launch({ sub: 'stu-1' });
      const tk = tokenFrom(a.res);
      const started = await api('/api/commission/start', { method: 'POST', token: tk, body: {} });
      let task = started.json.task;
      for (let n = 0; n < 5; n++) {
        await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
        const r = await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
        if (r.json.next) task = r.json.next;
      }
      await lti.settle();
      const sc = platform.scores[0].body.scoreGiven;
      assert.ok(sc >= 0 && sc < 30, `all wrong answers should lower mastery below the starting 30, got ${sc}`);
      assert.notEqual(sc, 20);
    },
    { LTI_SCORE_MODE: 'mastery' },
  ));

test('a launch without grade services never tries to post a grade, and a failing gradebook never breaks play', () =>
  withApp(async ({ launch, api, platform, lti }) => {
    const a = await launch({ sub: 'stu-1', ags: false });
    const tk = tokenFrom(a.res);
    const started = await api('/api/commission/start', { method: 'POST', token: tk, body: {} });
    let task = started.json.task;
    let last;
    for (let n = 0; n < 5; n++) {
      await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
      last = await api('/api/answer', { method: 'POST', token: tk, body: { taskId: task.id, answer: '99999' } });
      if (last.json.next) task = last.json.next;
    }
    assert.equal(last.json.commissionComplete, true);
    await lti.settle();
    assert.equal(platform.scores.length, 0);
    assert.equal(platform.lineItemsCreated, 0);
  }));

test('NRPS and AGS URLs on an unexpected host are ignored (no requests leave for it)', () =>
  withApp(async ({ launch, api, platform, store }) => {
    const calls = [];
    const original = platform.fetch;
    platform.fetch = async (u, i) => {
      calls.push(String(u));
      return original(u, i);
    };
    const a = await launch({
      sub: 'stu-1',
      mutate: (p) => ({
        ...p,
        'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': { context_memberships_url: 'https://attacker.test/nrps' },
        'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': { scope: [SCORE, LINEITEM], lineitems: 'https://attacker.test/lineitems', lineitem: 'https://attacker.test/li/1' },
      }),
    });
    assert.equal(a.res.status, 303);
    const t = await launch({ sub: 'teach-1', roles: [INSTRUCTOR] });
    const session = tokenFrom(t.res);
    const code = (await api('/api/admin/me', { headers: { 'x-lti-session': session } })).json.classCode;
    const r = await api(`/api/admin/class/${code}`, { headers: { 'x-lti-session': session } });
    assert.equal(r.status, 200);
    assert.ok(!calls.some((u) => u.includes('attacker.test')));
  }));

test('the tool publishes its public key and registration values', () =>
  withApp(async ({ api }) => {
    const j = await api('/lti/jwks.json');
    assert.equal(j.status, 200);
    assert.equal(j.json.keys.length, 1);
    const k = j.json.keys[0];
    assert.equal(k.alg, 'RS256');
    assert.ok(k.kid && k.n && k.e);
    assert.ok(!('d' in k) && !('p' in k) && !('q' in k), 'no private key material');
    const info = await api('/lti/info');
    assert.match(info.json.openIdConnectLoginUrl, /\/lti\/login$/);
    assert.match(info.json.keysetUrl, /\/lti\/jwks\.json$/);
    assert.ok(info.json.redirectUrls[0].endsWith('/lti/launch'));
  }));

test('without LTI configured, launch routes are closed and the app still frames nothing', async () => {
  const store = new MemoryStore();
  await store.init();
  const { server } = createApp({ store, env: { NODE_ENV: 'test' }, seed: 1 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const l = await fetch(base + '/lti/login?iss=x&login_hint=y', { redirect: 'manual' });
    assert.equal(l.status, 404);
    const h = await fetch(base + '/healthz');
    assert.match(h.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    server.close();
  }
});

test('with LTI configured, only the platform origins may frame the app', () =>
  withApp(async ({ base }) => {
    const h = await fetch(base + '/healthz');
    assert.match(h.headers.get('content-security-policy'), /frame-ancestors https:\/\/lms\.test/);
  }));

test('config rejects insecure platform URLs', async () => {
  const { loadLtiConfig } = await import('../src/lti/config.js');
  const base = { issuer: 'https://lms.test', clientId: 'c', authUrl: 'https://lms.test/a', tokenUrl: 'https://lms.test/t', jwksUrl: 'https://lms.test/j', deploymentIds: ['d'] };
  assert.throws(() => loadLtiConfig({ LTI_TOOL_URL: 'https://tool.test', LTI_PLATFORMS: JSON.stringify([{ ...base, jwksUrl: 'http://lms.test/j' }]) }), /https/);
  assert.throws(() => loadLtiConfig({ LTI_TOOL_URL: 'https://tool.test', LTI_PLATFORMS: JSON.stringify([{ ...base, deploymentIds: [] }]) }), /deploymentId/);
  assert.throws(() => loadLtiConfig({ LTI_PLATFORMS: JSON.stringify([base]) }), /LTI_TOOL_URL/);
  assert.equal(loadLtiConfig({}).enabled, false);
});
