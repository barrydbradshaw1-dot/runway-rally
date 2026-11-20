// The Spanish help ("Ver en español"): every problem has a Spanish copy with the same numbers,
// English is unchanged, and it only appears for classes whose teacher turned it on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, THEMES, mulberry32, makeTask, makeExample, parseAnswer, diagnose, diagnoseEs, storyFor, storyForEs } from '../src/skills.js';
import { createApp } from '../src/server.js';
import { MemoryStore } from '../src/store.js';

const SEEDS = 120;
const BAD = /undefined|NaN|\[object|\$\{/;

test('every skill, level and theme has a Spanish copy with the same numbers', () => {
  const missing = [];
  for (const skill of SKILL_IDS) {
    for (const level of [1, 2, 3]) {
      for (const theme of THEMES) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const en = makeTask(skill, level, theme, mulberry32(seed));
          const both = makeTask(skill, level, theme, mulberry32(seed), { es: true });
          const where = `${skill} level ${level} ${theme} seed ${seed}`;
          if (!both.es) {
            missing.push(where);
            continue;
          }
          // turning Spanish on never changes the English problem
          const { es, ...rest } = both;
          assert.deepEqual(rest, en, where);
          assert.equal(typeof es.prompt, 'string', where);
          assert.ok(es.prompt.length > 10, where);
          assert.doesNotMatch(es.prompt, BAD, where);
          assert.notEqual(es.prompt, en.prompt, `${where}: prompt is not translated`);
          assert.equal(es.hints.length, en.hints.length, where);
          for (const hint of es.hints) {
            assert.equal(typeof hint, 'string', where);
            assert.doesNotMatch(hint, BAD, where);
          }
          assert.equal(es.mistakes.length, en.mistakes.length, where);
          es.mistakes.forEach((m, i) => {
            assert.equal(m.value, en.mistakes[i].value, where);
            assert.equal(typeof m.text, 'string', `${where}: mistake ${m.value} has no Spanish`);
            assert.doesNotMatch(m.text, BAD, where);
          });
        }
      }
    }
  }
  assert.deepEqual(missing.slice(0, 5), [], `${missing.length} problems have no Spanish copy`);
});

test('every skill has a Spanish story line', () => {
  for (const skill of SKILL_IDS) {
    assert.ok(storyFor(skill), skill);
    assert.ok(storyForEs(skill), `${skill} has no Spanish story`);
  }
});

test('Spanish never uses "billón" for a billion', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const level of [1, 2, 3]) {
      const t = makeTask('sci_notation', level, 'runway', mulberry32(seed), { es: true });
      assert.doesNotMatch([t.es.prompt, ...t.es.hints].join(' '), /bill[oó]n/i);
    }
  }
});

test('worked examples carry their Spanish steps', () => {
  const ex = makeExample('frac_add', 2, 'fabric', mulberry32(3), { es: true });
  assert.equal(ex.es.steps.length, 3);
  assert.ok(ex.es.prompt);
  assert.equal(makeExample('frac_add', 2, 'fabric', mulberry32(3)).es, undefined);
});

test('a decimal comma is read as a decimal point, a thousands comma is not', () => {
  assert.equal(parseAnswer('2,5').value, 2.5);
  assert.equal(parseAnswer('12,50').value, 12.5);
  assert.equal(parseAnswer('$12,50').value, 12.5);
  assert.equal(parseAnswer('-0,75').value, -0.75);
  assert.equal(parseAnswer('1,200').value, 1200);
  assert.equal(parseAnswer('12.50').value, 12.5);
  assert.equal(parseAnswer('3/4').value, 0.75);
});

test('Spanish feedback names the same slip as the English', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60 && checked < 20; seed++) {
    const t = makeTask('mult_facts', 1, 'fabric', mulberry32(seed), { es: true });
    for (const m of t.mistakes) {
      assert.equal(diagnose(t, String(m.value)), m.text);
      const es = diagnoseEs(t, String(m.value));
      assert.ok(es && es !== m.text, 'Spanish feedback missing');
      checked++;
    }
  }
  assert.ok(checked > 0);
  const t = makeTask('frac_simplify', 2, 'fabric', mulberry32(5), { es: true });
  assert.match(diagnoseEs(t, 'abc'), /Escribe un número/);
});

async function boot() {
  const store = new MemoryStore();
  await store.init();
  await store.createClass('ROOM1', { kind: 'manual', name: 'ROOM1' });
  const { server } = createApp({ store, env: { NODE_ENV: 'test' }, seed: 11 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { server, call };
}

test('the Spanish help is off by default and a teacher can turn it on for a class', async () => {
  const { server, call } = await boot();
  const admin = { 'x-admin-token': 'dev-admin' };
  try {
    const s = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Ana' } });
    const token = s.json.token;

    // off: nothing Spanish reaches the student
    const off = await call('/api/commission/start', { method: 'POST', token, body: { theme: 'fabric' } });
    assert.equal(off.status, 200);
    assert.equal(off.json.task.es, undefined);
    assert.equal(off.json.storyEs, undefined);
    assert.equal((await call('/api/admin/class/ROOM1', { headers: admin })).json.spanish, false);

    // a bad value is refused
    assert.equal((await call('/api/admin/class/ROOM1', { method: 'PATCH', headers: admin, body: { spanish: 'yes' } })).status, 400);

    // on
    const on = await call('/api/admin/class/ROOM1', { method: 'PATCH', headers: admin, body: { spanish: true } });
    assert.equal(on.status, 200);
    assert.equal(on.json.class.spanish, true);
    assert.equal((await call('/api/admin/class/ROOM1', { headers: admin })).json.spanish, true);

    // the current problem was made before the switch; answer it to get a new one in both languages
    let task = off.json.task;
    let r = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '0.123' } });
    if (r.json.retry) r = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '0.123' } });
    assert.equal(r.status, 200);
    task = r.json.next;
    assert.ok(task.es?.prompt, 'next problem has Spanish');
    assert.ok(!('answer' in task) && !('answer' in task.es), 'answers never leak');
    assert.ok(!JSON.stringify(task.es).includes('mistakes'), 'mistakes never leak');

    const hint = await call('/api/hint', { method: 'POST', token, body: { taskId: task.id } });
    assert.ok(hint.json.text && hint.json.es?.text, 'hint in both languages');

    const wrong = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '0.123' } });
    assert.ok(wrong.json.es?.feedback, 'feedback in Spanish');
    const last = await call('/api/answer', { method: 'POST', token, body: { taskId: task.id, answer: '0.123' } });
    assert.equal(last.json.correct, false);
    assert.equal(last.json.es.steps.length, 3);
    assert.ok(last.json.es.feedback);

    // the skills check gets Spanish too
    const p = await call('/api/placement/start', { method: 'POST', token, body: {} });
    assert.ok(p.json.task.es?.prompt);

    // off again: back to English only
    await call('/api/admin/class/ROOM1', { method: 'PATCH', headers: admin, body: { spanish: false } });
    const p2 = await call('/api/placement/answer', { method: 'POST', token, body: { taskId: p.json.task.id, skip: true } });
    if (p2.json.next) assert.equal(p2.json.next.es, undefined);
  } finally {
    server.close();
  }
});
