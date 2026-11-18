import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, POLICY_VERSION } from '../src/server.js';
import { MemoryStore, PgStore } from '../src/store.js';
import { checkNickname, extraBlocklist } from '../src/nickname.js';

// Set TEST_DATABASE_URL to run this file against a real Postgres too.
async function boot({ env = {} } = {}) {
  const url = process.env.TEST_DATABASE_URL;
  const store = url ? new PgStore(url) : new MemoryStore();
  await store.init();
  if (url) await store.pool.query('TRUNCATE events, tasks, students, classes, teachers, audit_log CASCADE');
  const { server } = createApp({ store, env: { NODE_ENV: 'test', ...env }, seed: 7 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
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
      /* not JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { server, call, store };
}
const OWNER = { 'x-admin-token': 'dev-admin' };

async function teacherWithClass(call, name = 'Ms Lee') {
  const t = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name } });
  const T = { 'x-admin-token': t.json.key };
  const made = await call('/api/admin/classes', { method: 'POST', headers: T, body: { name: 'Period 3', agree: true } });
  return { T, code: made.json.class.code, made };
}

test('nickname filter: rude words, look-alike spellings and full real names are turned down', () => {
  for (const bad of ['fuuuck', 'F_U_C_K', '5h1t', 'a s s', 'Big Ass', 'kkkk', 'SexyGirl', 'b1tch'])
    assert.equal(checkNickname(bad).error, 'please pick a different nickname', bad);
  for (const real of ['Maya Lopez', 'maya_lopez', 'MayaLopez', 'jayden smith'])
    assert.match(checkNickname(real).error, /real name/, real);
  // ordinary nicknames, words that merely contain a short bad word, and first name + initial are fine
  for (const ok of ['Ava', 'Cassie', 'Classy Cat', 'Grape', 'Peacock', 'Butterfly', 'Thorny', 'Maya Rocks', 'Star Stitcher', 'Emma W', 'José', 'Designer 1234'])
    assert.equal(checkNickname(ok).nickname, ok, ok);
  assert.ok(checkNickname('a').error && checkNickname(null).error);
  // the owner can add words without a release
  const extra = extraBlocklist({ NICKNAME_BLOCKLIST: 'Banana, x' });
  assert.deepEqual(extra, ['banana']);
  assert.ok(checkNickname('BananaQueen', { extra }).error);
});

test('joining checks the nickname and tells the student why', async () => {
  const { server, call } = await boot({ env: { NICKNAME_BLOCKLIST: 'mrsmith' } });
  try {
    const { code } = await teacherWithClass(call);
    const rude = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'b1tch' } });
    assert.equal(rude.status, 400);
    assert.equal(rude.json.error, 'please pick a different nickname');
    const real = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Maya Lopez' } });
    assert.equal(real.status, 400);
    assert.match(real.json.error, /real name/);
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Mr Smith!' } })).status, 400);
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Maya R' } })).status, 201);
  } finally {
    server.close();
  }
});

test('a class needs the teacher to confirm school approval, and old classes can confirm later', async () => {
  const { server, call, store } = await boot();
  try {
    const t = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Ms Lee' } });
    const T = { 'x-admin-token': t.json.key };
    const no = await call('/api/admin/classes', { method: 'POST', headers: T, body: { name: 'Period 3' } });
    assert.equal(no.status, 400);
    assert.match(no.json.error, /tick the box/);

    const yes = await call('/api/admin/classes', { method: 'POST', headers: T, body: { name: 'Period 3', agree: true } });
    assert.equal(yes.status, 201);
    assert.ok(yes.json.class.authorizedAt);
    assert.equal(yes.json.class.authorizedPolicy, POLICY_VERSION);
    assert.equal(yes.json.class.joinOpen, true);
    const stored = await store.getClass(yes.json.class.code);
    assert.equal(stored.authorization.by, `teacher:${t.json.teacher.id}`);

    // a class made before this change has no confirmation; students can still join it,
    // and the teacher confirms from the console
    await store.createClass('OLD1', { kind: 'manual', name: 'Old', teacherId: t.json.teacher.id });
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: 'OLD1', nickname: 'Ava' } })).status, 201);
    assert.equal((await call('/api/admin/class/OLD1', { headers: T })).json.authorizedAt, null);
    await call('/api/admin/class/OLD1', { method: 'PATCH', headers: T, body: { agree: true } });
    const after = await call('/api/admin/class/OLD1', { headers: T });
    assert.ok(after.json.authorizedAt);
    assert.equal(after.json.policyVersion, POLICY_VERSION);
    assert.equal((await call('/api/admin/me', { headers: T })).json.policyVersion, POLICY_VERSION);
  } finally {
    server.close();
  }
});

test('a teacher can close a class to new students; students already in it carry on', async () => {
  const { server, call } = await boot();
  try {
    const { T, code } = await teacherWithClass(call);
    const ava = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ava' } });

    assert.equal((await call(`/api/admin/class/${code}`, { method: 'PATCH', headers: T, body: { joinOpen: 'no' } })).status, 400);
    const closed = await call(`/api/admin/class/${code}`, { method: 'PATCH', headers: T, body: { joinOpen: false } });
    assert.equal(closed.json.class.joinOpen, false);
    const ben = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ben' } });
    assert.equal(ben.status, 403);
    assert.match(ben.json.error, /not taking new students/);

    // Ava keeps playing and can still sign back in with her code
    assert.equal((await call('/api/state', { token: ava.json.token })).status, 200);
    assert.equal((await call('/api/session/recover', { method: 'POST', body: { code: ava.json.recoveryCode } })).status, 200);

    await call(`/api/admin/class/${code}`, { method: 'PATCH', headers: T, body: { joinOpen: true } });
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ben' } })).status, 201);
  } finally {
    server.close();
  }
});

test('a teacher can rename a student, only in their own class, and the log keeps no names', async () => {
  const { server, call } = await boot();
  try {
    const { T, code } = await teacherWithClass(call);
    const other = await teacherWithClass(call, 'Mr Diaz');
    const s = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Maya R' } });
    const id = (await call(`/api/admin/class/${code}`, { headers: T })).json.students[0].id;

    assert.equal((await call(`/api/admin/class/${code}/student/${id}`, { method: 'PATCH', headers: other.T, body: { nickname: 'Comet' } })).status, 403);
    assert.equal((await call(`/api/admin/class/${other.code}/student/${id}`, { method: 'PATCH', headers: other.T, body: { nickname: 'Comet' } })).status, 404);
    assert.equal((await call(`/api/admin/class/${code}/student/${id}`, { method: 'PATCH', headers: T, body: { nickname: 'b1tch' } })).status, 400);

    const r = await call(`/api/admin/class/${code}/student/${id}`, { method: 'PATCH', headers: T, body: { nickname: 'Comet' } });
    assert.equal(r.status, 200);
    assert.equal((await call('/api/state', { token: s.json.token })).json.student.nickname, 'Comet');

    const audit = await call('/api/admin/audit', { headers: OWNER });
    assert.ok(audit.json.entries.some((e) => e.action === 'rename_student'));
    assert.ok(!audit.text.includes('Maya') && !audit.text.includes('Comet'));
  } finally {
    server.close();
  }
});

test("a teacher can download everything kept about one student, and nobody else's", async () => {
  const { server, call } = await boot();
  try {
    const { T, code } = await teacherWithClass(call);
    const other = await teacherWithClass(call, 'Mr Diaz');
    const s = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ava' } });
    await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ben' } });
    const started = await call('/api/commission/start', { method: 'POST', token: s.json.token, body: { theme: 'jewelry' } });
    await call('/api/answer', { method: 'POST', token: s.json.token, body: { taskId: started.json.task.id, answer: '99999' } });
    await call('/api/progress-link', { method: 'POST', token: s.json.token });
    const id = (await call(`/api/admin/class/${code}`, { headers: T })).json.students.find((x) => x.nickname === 'Ava').id;

    const ex = await call(`/api/admin/class/${code}/student/${id}/export`, { headers: T });
    assert.equal(ex.status, 200);
    assert.match(ex.headers.get('content-disposition'), /attachment; filename="runway-rally-.*-Ava-\d{4}-\d{2}-\d{2}\.json"/);
    assert.equal(ex.json.student.id, id);
    assert.equal(ex.json.student.nickname, 'Ava');
    assert.ok(ex.json.problems.length >= 1 && ex.json.problems.every((p) => p.studentId === id));
    const types = ex.json.activity.map((e) => e.type);
    assert.ok(types.includes('session_start') && types.includes('answer') && types.includes('progress_link_new'));
    // only Ava, and no sign-in secrets
    assert.ok(!ex.text.includes('Ben'));
    assert.ok(!ex.text.includes(s.json.token) && !ex.text.includes(s.json.recoveryCode));
    assert.ok(!/token_?hash|key_?hash/i.test(ex.text));

    assert.equal((await call(`/api/admin/class/${code}/student/${id}/export`, { headers: other.T })).status, 403);
    assert.equal((await call(`/api/admin/class/${other.code}/student/${id}/export`, { headers: other.T })).status, 404);
    assert.equal((await call(`/api/admin/class/${code}/student/${id}/export`)).status, 403);
    const audit = await call('/api/admin/audit', { headers: OWNER });
    assert.ok(audit.json.entries.some((e) => e.action === 'export_student'));
    assert.ok(!audit.text.includes('Ava'));
  } finally {
    server.close();
  }
});

test('the privacy policy page is served and linked from the app and the console', async () => {
  const { server, call } = await boot();
  try {
    const page = await call('/privacy/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.text, /Runway Rally Privacy Policy/);
    assert.ok(page.text.includes(POLICY_VERSION), 'the page shows the policy version teachers agree to');
    assert.ok(!/<script/i.test(page.text), 'plain page, no scripts');
    const app = await call('/app.js');
    assert.ok(app.text.includes('/privacy/'));
    const admin = await call('/admin/admin.js');
    assert.ok(admin.text.includes('/privacy/'));
  } finally {
    server.close();
  }
});
