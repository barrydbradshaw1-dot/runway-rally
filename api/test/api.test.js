import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { MemoryStore, PgStore } from '../src/store.js';

// Set TEST_DATABASE_URL to run this whole file against a real Postgres.
async function boot({ env = {}, now } = {}) {
  const url = process.env.TEST_DATABASE_URL;
  const store = url ? new PgStore(url) : new MemoryStore();
  await store.init();
  if (url) await store.pool.query('TRUNCATE events, tasks, students, classes, teachers, audit_log CASCADE');
  // students can only join a class a teacher has created
  for (const code of ['ROOM1', 'HOME', 'MATH-7A']) await store.createClass(code, { kind: 'manual', name: code });
  const { server, runRetention } = createApp({ store, env: { NODE_ENV: 'test', ...env }, seed: 11, ...(now ? { now } : {}) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { server, call, store, runRetention };
}

test('health, sign-in validation, and auth required', async () => {
  const { server, call } = await boot();
  try {
    assert.equal((await call('/healthz')).status, 200);
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: '!', nickname: 'Ava' } })).status, 400);
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: 'ABC1', nickname: '' } })).status, 400);
    assert.equal((await call('/api/state')).status, 401);
    assert.equal((await call('/api/state', { token: 'x'.repeat(32) })).status, 401);
  } finally {
    server.close();
  }
});

test('full play-through over HTTP; answers never leak to the client', async () => {
  const { server, call } = await boot();
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'math-7a', nickname: 'Ava' } });
    assert.equal(s.status, 201);
    const token = s.json.token;
    assert.equal(s.json.student.classCode, 'MATH-7A');

    await call('/api/event', { method: 'POST', token, body: { area: 'jewelry_bench' } });
    assert.equal((await call('/api/event', { method: 'POST', token, body: { area: 'nope' } })).status, 400);

    const started = await call('/api/commission/start', { method: 'POST', token, body: { theme: 'jewelry' } });
    assert.equal(started.status, 200);
    assert.ok(!('answer' in started.json.task) && !('hints' in started.json.task));
    assert.ok(!started.text.includes('"answer"'));

    // resume returns the same task
    const resumed = await call('/api/commission/start', { method: 'POST', token, body: {} });
    assert.equal(resumed.json.resumed, true);
    assert.equal(resumed.json.task.id, started.json.task.id);

    // a hint, then play to the end. Ask the dev-only helper (memory store) for answers via the engine.
    const h = await call('/api/hint', { method: 'POST', token, body: { taskId: started.json.task.id } });
    assert.equal(h.json.level, 1);

    let task = started.json.task;
    let last;
    for (let n = 0; n < 5; n++) {
      // wrong twice reveals the correct answer, which lets this test continue without peeking at the store
      const m1 = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '99999' } });
      assert.equal(m1.json.retry, true);
      const m2 = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '99999' } });
      assert.equal(m2.json.correct, false);
      assert.equal(typeof m2.json.revealedAnswer, 'string');
      assert.ok(m2.json.steps.length > 0);
      assert.ok(m2.json.thread >= 1);
      last = m2.json;
      if (m2.json.next) task = m2.json.next;
    }
    assert.equal(last.commissionComplete, true);
    assert.equal(last.pack, null, 'all wrong: no pack, so packs mean learning');
    assert.ok(last.effortThread > 0, 'effort still earns thread');
    assert.ok(last.packHint);
    assert.equal(last.student.commission, null);
    assert.equal(last.student.stats.answered, 5);

    // answered task cannot be replayed
    const replay = await call('/api/answer', { method: 'POST', token, body: { taskId: started.json.task.id, answer: '1' } });
    assert.equal(replay.status, 409);
  } finally {
    server.close();
  }
});

test("a student cannot touch another student's task", async () => {
  const { server, call } = await boot();
  try {
    const a = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Ana' } });
    const b = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Bea' } });
    const t = await call('/api/commission/start', { method: 'POST', token: a.json.token, body: {} });
    const r = await call('/api/answer', { method: 'POST', token: b.json.token, body: { taskId: t.json.task.id, answer: '1' } });
    assert.equal(r.status, 404);
  } finally {
    server.close();
  }
});

test('admin dashboard needs the admin token and lists the class', async () => {
  const { server, call } = await boot();
  try {
    const a = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Ana' } });
    await call('/api/commission/start', { method: 'POST', token: a.json.token, body: {} });
    assert.equal((await call('/api/admin/class/ROOM1')).status, 403);
    const ok = await call('/api/admin/class/ROOM1', { headers: { 'x-admin-token': 'dev-admin' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.students.length, 1);
    assert.equal(ok.json.students[0].nickname, 'Ana');
    assert.equal(ok.json.skills.ratio, 'Ratios');
  } finally {
    server.close();
  }
});

test('production without ADMIN_TOKEN refuses admin access', async () => {
  const { server } = createApp({ store: new MemoryStore(), env: { NODE_ENV: 'production' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/class/ROOM1`, { headers: { 'x-admin-token': 'dev-admin' } });
    assert.equal(res.status, 503);
  } finally {
    server.close();
  }
});

test('static serving blocks path traversal and sets security headers', async () => {
  const { server, call } = await boot();
  try {
    const bad = await call('/..%2f..%2fapi%2fpackage.json');
    assert.notEqual(bad.status, 200);
    assert.ok(!bad.text.includes('runway-rally-api'));
    const r = await call('/healthz');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy').includes("default-src 'self'"));
  } finally {
    server.close();
  }
});

test('admin endpoint is rate limited against token guessing', async () => {
  const { server, call } = await boot();
  try {
    let last;
    for (let n = 0; n < 32; n++) last = await call('/api/admin/class/ROOM1', { headers: { 'x-admin-token': 'wrong-' + n } });
    assert.equal(last.status, 429);
  } finally {
    server.close();
  }
});

test('admin console page is served', async () => {
  const { server, call } = await boot();
  try {
    const page = await call('/admin/');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('Teacher console'));
  } finally {
    server.close();
  }
});

test('a recovery code signs her back in on another device, and a new code replaces the old one', async () => {
  const { server, call } = await boot();
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'HOME', nickname: 'Ava' } });
    assert.match(s.json.recoveryCode, /^RR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await call('/api/commission/start', { method: 'POST', token: s.json.token, body: {} });

    const bad = await call('/api/session/recover', { method: 'POST', body: { code: 'RR-2222-2222' } });
    assert.equal(bad.status, 404);
    assert.equal((await call('/api/session/recover', { method: 'POST', body: { code: 'x' } })).status, 400);

    const typed = s.json.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const back = await call('/api/session/recover', { method: 'POST', body: { code: typed } });
    assert.equal(back.status, 200);
    assert.equal(back.json.student.nickname, 'Ava');
    assert.ok(back.json.student.commission, 'same progress, same open commission');
    assert.ok(!back.text.includes('recoveryCode'));

    const fresh = await call('/api/recovery-code', { method: 'POST', token: back.json.token });
    assert.notEqual(fresh.json.recoveryCode, s.json.recoveryCode);
    assert.equal((await call('/api/session/recover', { method: 'POST', body: { code: s.json.recoveryCode } })).status, 404);
    assert.equal((await call('/api/session/recover', { method: 'POST', body: { code: fresh.json.recoveryCode } })).status, 200);
  } finally {
    server.close();
  }
});

test('the family progress link is read-only, private, and can be replaced', async () => {
  const { server, call } = await boot();
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'HOME', nickname: 'Ava' } });
    const token = s.json.token;
    const link = await call('/api/progress-link', { method: 'POST', token });
    assert.match(link.json.path, /^\/progress\/#k=[A-Za-z0-9_-]{32,64}$/);
    const key = link.json.path.split('#k=')[1];

    assert.equal((await call('/api/progress')).status, 401);
    const p = await call('/api/progress', { headers: { 'x-progress-key': key, 'x-tz-offset': '300' } });
    assert.equal(p.status, 200);
    assert.equal(p.json.nickname, 'Ava');
    assert.equal(p.json.thisWeek.answered, 0);
    assert.ok(!p.text.includes('token') && !p.text.includes('HOME'));
    // the progress key is not a sign-in
    assert.equal((await call('/api/state', { token: key })).status, 401);
    assert.notEqual((await call('/api/progress', { method: 'POST', headers: { 'x-progress-key': key } })).status, 200, 'cannot write through it');

    const again = await call('/api/progress-link', { method: 'POST', token });
    assert.equal((await call('/api/progress', { headers: { 'x-progress-key': key } })).status, 404, 'old link stops working');
    const key2 = again.json.path.split('#k=')[1];
    assert.equal((await call('/api/progress', { headers: { 'x-progress-key': key2 } })).status, 200);
  } finally {
    server.close();
  }
});

test('the skills check over HTTP: skip through, see a summary, then practice starts at her level', async () => {
  const { server, call } = await boot();
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'HOME', nickname: 'Ava' } });
    const token = s.json.token;
    const start = await call('/api/placement/start', { method: 'POST', token, body: {} });
    assert.equal(start.status, 200);
    let task = start.json.task;
    assert.equal(task.placement, true);
    assert.ok(!start.text.includes('"answer"') && !start.text.includes('answerText'));
    assert.equal((await call('/api/hint', { method: 'POST', token, body: { taskId: task.id } })).status, 409);
    assert.equal((await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '1' } })).status, 409);

    const resumed = await call('/api/placement/start', { method: 'POST', token, body: {} });
    assert.equal(resumed.json.task.id, task.id);

    let r;
    let n = 0;
    do {
      r = await call('/api/placement/answer', { method: 'POST', token, body: { taskId: task.id, skip: true } });
      assert.equal(r.status, 200);
      task = r.json.next;
      n++;
    } while (task && n < 20);
    assert.ok(r.json.summary, 'finished with a summary');
    assert.ok(r.json.summary.startingWith.length > 0);
    assert.equal(r.json.student.placement.status, 'done');
    assert.ok(n <= 6, `skipping everything should end quickly, took ${n}`);

    const c = await call('/api/commission/start', { method: 'POST', token, body: {} });
    assert.equal(c.status, 200);
    assert.ok(c.json.task.example, 'first practice problem comes with a worked example');
    assert.ok(['mult_facts', 'decimals', 'int_add'].includes(c.json.task.skill), `starts at a foundation, got ${c.json.task.skill}`);
  } finally {
    server.close();
  }
});

// ----- privacy: teacher logins, class codes, deletion, retention -----
const OWNER = { 'x-admin-token': 'dev-admin' };

test('students can only join a class a teacher created, and class codes cannot be guessed', async () => {
  const { server, call, store } = await boot();
  try {
    const miss = await call('/api/session', { method: 'POST', body: { classCode: 'GUESS1', nickname: 'Ava' } });
    assert.equal(miss.status, 404);
    // a Brightspace course code cannot be joined by typing it
    await store.upsertClass('LTI-ABCDEF12', { kind: 'lti' });
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: 'LTI-ABCDEF12', nickname: 'Ava' } })).status, 404);

    const codes = new Set();
    for (let i = 0; i < 5; i++) {
      const made = await call('/api/admin/classes', { method: 'POST', headers: OWNER, body: { name: `Period ${i}` } });
      assert.equal(made.status, 201);
      assert.match(made.json.class.code, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      codes.add(made.json.class.code);
    }
    assert.equal(codes.size, 5);
    const code = [...codes][0];
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ava' } })).status, 201);

    // an ended class takes no new students
    await call(`/api/admin/class/${code}`, { method: 'PATCH', headers: OWNER, body: { endsOn: '2020-01-01' } });
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ben' } })).status, 403);

    // guessing is rate limited
    let last;
    for (let n = 0; n < 25; n++) last = await call('/api/session', { method: 'POST', body: { classCode: 'TRY' + n, nickname: 'Cy' } });
    assert.equal(last.status, 429);
  } finally {
    server.close();
  }
});

test('each teacher has their own key and sees only their own classes', async () => {
  const { server, call } = await boot();
  try {
    const a = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Ms Lee' } });
    const b = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Mr Diaz' } });
    assert.equal(a.status, 201);
    assert.match(a.json.key, /^rt_/);
    const A = { 'x-admin-token': a.json.key };
    const B = { 'x-admin-token': b.json.key };

    // keys are not stored or shown again
    const list = await call('/api/admin/teachers', { headers: OWNER });
    assert.equal(list.json.teachers.length, 2);
    assert.ok(!list.text.includes(a.json.key) && !list.text.includes('keyHash'));

    assert.equal((await call('/api/admin/me', { headers: A })).json.kind, 'teacher');
    const made = await call('/api/admin/classes', { method: 'POST', headers: A, body: { name: 'Period 3' } });
    const code = made.json.class.code;
    await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ava' } });

    assert.equal((await call(`/api/admin/class/${code}`, { headers: A })).json.students.length, 1);
    assert.equal((await call(`/api/admin/class/${code}`, { headers: B })).status, 403);
    assert.equal((await call('/api/admin/class/ROOM1', { headers: A })).status, 403);
    assert.deepEqual((await call('/api/admin/classes', { headers: B })).json.classes, []);
    assert.deepEqual((await call('/api/admin/classes', { headers: A })).json.classes.map((c) => c.code), [code]);
    // teachers cannot manage other teachers or pick a class code
    assert.equal((await call('/api/admin/teachers', { headers: A })).status, 403);
    const own = await call('/api/admin/classes', { method: 'POST', headers: A, body: { name: 'X', code: 'EASY1' } });
    assert.notEqual(own.json.class.code, 'EASY1');
    // the owner sees every class
    const all = (await call('/api/admin/classes', { headers: OWNER })).json.classes.map((c) => c.code);
    assert.ok(all.includes(code) && all.includes('ROOM1'));

    // a new key replaces the old one; removing a teacher ends their access
    const fresh = await call(`/api/admin/teachers/${a.json.teacher.id}/key`, { method: 'POST', headers: OWNER });
    assert.equal((await call('/api/admin/me', { headers: A })).status, 403);
    assert.equal((await call('/api/admin/me', { headers: { 'x-admin-token': fresh.json.key } })).status, 200);
    await call(`/api/admin/teachers/${a.json.teacher.id}`, { method: 'DELETE', headers: OWNER });
    assert.equal((await call('/api/admin/me', { headers: { 'x-admin-token': fresh.json.key } })).status, 403);
  } finally {
    server.close();
  }
});

test('a teacher can delete one student or a whole class, and each deletion is logged without names', async () => {
  const { server, call } = await boot();
  try {
    const t = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Ms Lee' } });
    const T = { 'x-admin-token': t.json.key };
    const code = (await call('/api/admin/classes', { method: 'POST', headers: T, body: { name: 'Period 3' } })).json.class.code;
    const ava = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ava' } });
    const ben = await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Ben' } });
    await call('/api/commission/start', { method: 'POST', token: ava.json.token, body: { theme: 'jewelry' } });

    const roster = (await call(`/api/admin/class/${code}`, { headers: T })).json.students;
    const avaId = roster.find((s) => s.nickname === 'Ava').id;
    // another class's teacher cannot delete her
    const other = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Mr Diaz' } });
    assert.equal((await call(`/api/admin/class/${code}/student/${avaId}`, { method: 'DELETE', headers: { 'x-admin-token': other.json.key } })).status, 403);

    assert.equal((await call(`/api/admin/class/${code}/student/${avaId}`, { method: 'DELETE', headers: T })).json.deleted, 1);
    assert.equal((await call('/api/state', { token: ava.json.token })).status, 401);
    assert.equal((await call(`/api/admin/class/${code}`, { headers: T })).json.students.length, 1);

    // deleting a class needs its code typed back
    assert.equal((await call(`/api/admin/class/${code}`, { method: 'DELETE', headers: T, body: {} })).status, 400);
    assert.equal((await call(`/api/admin/class/${code}`, { method: 'DELETE', headers: T, body: { confirm: code } })).json.deleted, 1);
    assert.equal((await call('/api/state', { token: ben.json.token })).status, 401);
    assert.equal((await call('/api/session', { method: 'POST', body: { classCode: code, nickname: 'Cy' } })).status, 404);

    const audit = await call('/api/admin/audit', { headers: OWNER });
    const actions = audit.json.entries.map((e) => e.action);
    assert.ok(actions.includes('delete_student') && actions.includes('delete_class'));
    assert.ok(!audit.text.includes('Ava') && !audit.text.includes('Ben'));
    assert.equal((await call('/api/admin/audit', { headers: T })).status, 403);
  } finally {
    server.close();
  }
});

test('the retention schedule deletes old answers, inactive students and ended classes, and keeps current work', async () => {
  const { server, call, store, runRetention } = await boot();
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Ava' } });
    const started = await call('/api/commission/start', { method: 'POST', token: s.json.token, body: { theme: 'jewelry' } });
    const day = 86_400_000;

    // nothing is old yet
    assert.deepEqual(Object.values(await runRetention()).filter(Boolean), []);

    // after 13 months, answer history goes but the student and the problem in front of her stay
    const later = await runRetention(Date.now() + 400 * day);
    assert.ok(later.events > 0);
    assert.equal(later.students, 0);
    const resumed = await call('/api/commission/start', { method: 'POST', token: s.json.token, body: {} });
    assert.equal(resumed.json.task.id, started.json.task.id);

    // after two years without use, the student is deleted
    assert.equal((await runRetention(Date.now() + 800 * day)).students, 1);
    assert.equal((await call('/api/state', { token: s.json.token })).status, 401);

    // a class that ended more than 30 days ago is deleted with its students
    await store.createClass('OLD1', { kind: 'manual', name: 'Old', endsOn: '2020-06-01' });
    await store.upsertClass('OLD1', {});
    const b = await call('/api/session', { method: 'POST', body: { classCode: 'HOME', nickname: 'Ben' } });
    assert.equal(b.status, 201);
    const ended = await runRetention();
    assert.equal(ended.classes, 1);
    assert.ok(!(await store.getClass('OLD1')));
    assert.ok((await store.listAudit(10)).some((e) => e.action === 'retention'));
  } finally {
    server.close();
  }
});

test('retention days can be changed or turned off with settings', async () => {
  const { retentionConfig } = await import('../src/server.js');
  assert.deepEqual(retentionConfig({}), { answerDays: 365, inactiveDays: 730, classEndDays: 30, auditDays: 1095 });
  assert.equal(retentionConfig({ RETENTION_ANSWER_DAYS: '180' }).answerDays, 180);
  assert.equal(retentionConfig({ RETENTION_ANSWER_DAYS: 'soon' }).answerDays, 365);
  assert.equal(retentionConfig({ RETENTION_INACTIVE_DAYS: '0' }).inactiveDays, 0);
});
