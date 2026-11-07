import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { MemoryStore, PgStore } from '../src/store.js';

// Set TEST_DATABASE_URL to run this whole file against a real Postgres.
async function boot() {
  const url = process.env.TEST_DATABASE_URL;
  const store = url ? new PgStore(url) : new MemoryStore();
  await store.init();
  if (url) await store.pool.query('TRUNCATE events, tasks, students CASCADE');
  const { server } = createApp({ store, env: { NODE_ENV: 'test' }, seed: 11 });
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
  return { server, call };
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
      const m1 = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '-7' } });
      assert.equal(m1.json.retry, true);
      const m2 = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '-7' } });
      assert.equal(m2.json.correct, false);
      assert.ok(Number.isFinite(m2.json.revealedAnswer));
      assert.ok(m2.json.thread >= 1);
      last = m2.json;
      if (m2.json.next) task = m2.json.next;
    }
    assert.equal(last.commissionComplete, true);
    assert.ok(last.pack.card.id);
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
