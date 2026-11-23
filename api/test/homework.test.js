import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { MemoryStore } from '../src/store.js';
import { evalArithmetic, cleanProblem, cleanAssignment, draftFromReading, cleanImage, makePhotoReader, homeworkConfig, READ_INSTRUCTIONS } from '../src/homework.js';

const OWNER = { 'x-admin-token': 'dev-admin' };
const PNG = 'data:image/png;base64,' + Buffer.from('not really a png but fine for the fake reader').toString('base64');

async function boot({ env = {}, readPhoto } = {}) {
  const store = new MemoryStore();
  await store.init();
  await store.createClass('ROOM1', { kind: 'manual', name: 'Room 1' });
  const { server } = createApp({ store, env: { NODE_ENV: 'test', ...env }, seed: 7, ...(readPhoto ? { readPhoto } : {}) });
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
      /* not json */
    }
    return { status: res.status, json, text };
  };
  return { server, call, store };
}

const SAMPLE = {
  title: 'Tuesday homework, page 42',
  live: true,
  problems: [
    { prompt: 'Solve for x: x + 7 = 12', answer: '5', skill: 'eq_one_step', hints: ['Take 7 from both sides.', '12 - 7 = 5', 'x = 5'] },
    { prompt: 'What is 3/4 of 20?', answer: '15', skill: 'frac_mult' },
    { prompt: 'Add 1/4 + 1/4. Answer as a fraction.', answer: '1/2', skill: 'frac_add' },
  ],
};

test('arithmetic check reads numbers and operators, and nothing else', () => {
  assert.equal(evalArithmetic('(18-4)/2'), 7);
  assert.equal(evalArithmetic('2^3 + -1'), 7);
  assert.equal(evalArithmetic('3 × 4 ÷ 2'), 6);
  assert.equal(evalArithmetic('0.5*10'), 5);
  assert.equal(evalArithmetic('process.exit()'), null);
  assert.equal(evalArithmetic('2+'), null);
  assert.equal(evalArithmetic(''), null);
});

test('problems are checked before they are saved', () => {
  assert.match(cleanProblem({ prompt: '', answer: '3', skill: 'mult_facts' }).error, /needs the question/);
  assert.match(cleanProblem({ prompt: 'Explain why', answer: 'because', skill: 'mult_facts' }).error, /one number/);
  assert.match(cleanProblem({ prompt: '2 x 3', answer: '6', skill: 'nope' }).error, /skill/);
  const p = cleanProblem({ prompt: 'Simplify 6/8', answer: '3/4', skill: 'frac_simplify' }).problem;
  assert.equal(p.answer, 0.75);
  assert.equal(p.form, 'fraction');
  assert.equal(p.requireFraction, true);
  assert.equal(p.simplest, true);
  assert.equal(p.hints.length, 3);
  assert.match(p.hints[2], /3\/4/); // the last hint always states the answer
  const neg = cleanProblem({ prompt: '-3 + -4', answer: '-7', skill: 'int_add' }).problem;
  assert.equal(neg.form, 'int');
  assert.equal(neg.answer, -7);
  assert.match(cleanAssignment({ title: '', problems: [] }).error, /name/);
  assert.match(cleanAssignment({ title: 'x', problems: [] }).error, /at least one/);
  assert.match(cleanAssignment({ title: 'x', problems: Array(26).fill(SAMPLE.problems[0]) }).error, /up to 25/);
});

test('a reading becomes a draft with flags where the teacher should look twice', () => {
  const draft = draftFromReading({
    problems: [
      { prompt: '12 x 3', answer: '36', check: '12*3', skill: 'mult_facts', hints: ['a', 'b', 'c'], unsure: false },
      { prompt: '45 / 9', answer: '6', check: '45/9', skill: 'div_facts', hints: [], unsure: false },
      { prompt: 'Smudged problem', answer: '4', check: '2+2', skill: 'int_add', hints: [], unsure: true },
      { prompt: 'Describe the pattern', answer: 'it grows', check: '', skill: 'expr_eval', hints: [], unsure: false },
    ],
    skipped: [{ text: 'Draw a number line', reason: 'needs a drawing' }],
    note: '',
  });
  assert.equal(draft.problems.length, 3);
  assert.equal(draft.problems[0].flag, null);
  assert.match(draft.problems[1].flag, /do not agree/);
  assert.match(draft.problems[2].flag, /Hard to read/);
  assert.equal(draft.skipped.length, 2);
  assert.ok(draft.skipped.some((s) => s.text === 'Describe the pattern'));
});

test('uploads must be pictures of a sensible size', () => {
  assert.ok(cleanImage({ image: PNG }).mediaType === 'image/png');
  assert.match(cleanImage({ image: 'data:application/pdf;base64,AAAA' }).error, /photo/);
  assert.match(cleanImage({ image: 'data:image/png;base64,!!!' }).error, /did not upload/);
  assert.match(cleanImage({ image: 'data:image/jpeg;base64,' + 'A'.repeat(7_000_000) }).error, /too large/);
});

test('photo reading is off without a key, and the instructions keep names out', () => {
  assert.equal(homeworkConfig({}).photos, false);
  assert.equal(homeworkConfig({ ANTHROPIC_API_KEY: 'k' }).photos, true);
  assert.equal(homeworkConfig({ HOMEWORK_DAILY_LIMIT: '0' }).dailyLimit, 0);
  assert.equal(homeworkConfig({}).dailyLimit, 200);
  assert.match(READ_INSTRUCTIONS, /Never copy a person's name/);
});

test('the photo reader sends one image to Claude and reads the answer back', async () => {
  let sent;
  const fakeFetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    const reading = { problems: [{ prompt: '7 x 8', answer: '56', check: '7*8', skill: 'mult_facts', hints: ['a', 'b', '56'], unsure: false }], skipped: [], note: '' };
    return new Response(
      JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify(reading) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const read = makePhotoReader({ apiKey: 'test-key', model: 'claude-sonnet-5-5', fetchImpl: fakeFetch });
  const out = await read({ mediaType: 'image/png', data: 'AAAA' });
  assert.equal(out.problems[0].answer, '56');
  assert.match(sent.url, /\/v1\/messages/);
  assert.equal(sent.body.model, 'claude-sonnet-5-5');
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  const img = sent.body.messages[0].content.find((b) => b.type === 'image');
  assert.equal(img.source.media_type, 'image/png');
});

test('without a key the console can still type assignments, but not read photos', async () => {
  const { server, call } = await boot();
  try {
    const cls = await call('/api/admin/class/ROOM1', { headers: OWNER });
    assert.equal(cls.json.homework.photos, false);
    assert.deepEqual(cls.json.assignments, []);
    const r = await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: OWNER, body: { image: PNG } });
    assert.equal(r.status, 503);
    const made = await call('/api/admin/class/ROOM1/assignments', { method: 'POST', headers: OWNER, body: SAMPLE });
    assert.equal(made.status, 201);
    assert.equal(made.json.assignment.problems.length, 3);
  } finally {
    server.close();
  }
});

test('a photo is read for the teacher and never kept', async () => {
  let seen = null;
  const readPhoto = async (img) => {
    seen = img;
    return { problems: [{ prompt: '9 x 6', answer: '54', check: '9*6', skill: 'mult_facts', hints: ['', '', ''], unsure: false }], skipped: [], note: '' };
  };
  const { server, call, store } = await boot({ readPhoto });
  try {
    const r = await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: OWNER, body: { image: PNG } });
    assert.equal(r.status, 200);
    assert.equal(seen.mediaType, 'image/png');
    assert.equal(r.json.problems[0].answer, '54');
    assert.equal(r.json.problems[0].flag, null);
    // nothing about the photo is stored: not on the class, and the audit log has only a count
    const c = await store.getClass('ROOM1');
    assert.ok(!JSON.stringify(c).includes(seen.data));
    const audit = await store.listAudit(10);
    const entry = audit.find((a) => a.action === 'read_homework_photo');
    assert.ok(entry);
    assert.ok(!JSON.stringify(audit).includes(seen.data));
    assert.equal((await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: OWNER, body: { image: 'data:text/plain;base64,AAAA' } })).status, 400);
    assert.equal((await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', body: { image: PNG } })).status, 403);
  } finally {
    server.close();
  }
});

test('the daily photo limit stops reading but not typing', async () => {
  const readPhoto = async () => ({ problems: [], skipped: [], note: '' });
  const { server, call } = await boot({ readPhoto, env: { HOMEWORK_DAILY_LIMIT: '1' } });
  try {
    assert.equal((await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: OWNER, body: { image: PNG } })).status, 200);
    const second = await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: OWNER, body: { image: PNG } });
    assert.equal(second.status, 429);
    assert.match(second.json.error, /limit for today/);
  } finally {
    server.close();
  }
});

test('only the class teacher can see or change its assignments', async () => {
  const { server, call } = await boot();
  try {
    const t = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Ms. Other' } });
    const other = { 'x-admin-token': t.json.key };
    assert.equal((await call('/api/admin/class/ROOM1/assignments', { method: 'POST', headers: other, body: SAMPLE })).status, 403);
    assert.equal((await call('/api/admin/class/ROOM1/homework/read', { method: 'POST', headers: other, body: { image: PNG } })).status, 403);
  } finally {
    server.close();
  }
});

test('students play a live assignment like any commission, and never see the answers first', async () => {
  const { server, call } = await boot();
  try {
    const hidden = await call('/api/admin/class/ROOM1/assignments', { method: 'POST', headers: OWNER, body: { ...SAMPLE, title: 'Not yet', live: false } });
    const made = await call('/api/admin/class/ROOM1/assignments', { method: 'POST', headers: OWNER, body: SAMPLE });
    const id = made.json.assignment.id;

    const s = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Ava' } });
    const token = s.json.token;
    const st = await call('/api/state', { token });
    assert.deepEqual(st.json.assignments, [{ id, title: SAMPLE.title, count: 3 }]); // the hidden one is not listed
    assert.ok(!st.text.includes('x + 7'));

    assert.equal((await call('/api/commission/start', { method: 'POST', token, body: { assignmentId: hidden.json.assignment.id } })).status, 404);
    const started = await call('/api/commission/start', { method: 'POST', token, body: { assignmentId: id } });
    assert.equal(started.status, 200);
    assert.match(started.json.story, /Tuesday homework/);
    assert.equal(started.json.task.prompt, 'Solve for x: x + 7 = 12');
    assert.equal(started.json.task.fromTeacher, true);
    assert.equal(started.json.task.of, 3);
    assert.ok(!started.text.includes('"answer"'));
    assert.equal(started.json.student.commission.fromTeacher, SAMPLE.title);

    // the teacher edits the assignment mid-game: the game in progress keeps its own copy
    await call(`/api/admin/class/ROOM1/assignments/${id}`, { method: 'PUT', headers: OWNER, body: { ...SAMPLE, problems: [SAMPLE.problems[1]] } });

    const a1 = await call('/api/answer', { method: 'POST', token, body: { taskId: started.json.task.id, answer: '5' } });
    assert.equal(a1.json.correct, true);
    assert.equal(a1.json.next.prompt, 'What is 3/4 of 20?');
    const a2 = await call('/api/answer', { method: 'POST', token, body: { taskId: a1.json.next.id, answer: '15' } });
    assert.equal(a2.json.correct, true);
    assert.equal(a2.json.next.requireFraction, true);
    const wrong = await call('/api/answer', { method: 'POST', token, body: { taskId: a2.json.next.id, answer: '0.5' } });
    assert.equal(wrong.json.retry, true);
    assert.match(wrong.json.feedback, /fraction/);
    const a3 = await call('/api/answer', { method: 'POST', token, body: { taskId: a2.json.next.id, answer: '1/2' } });
    assert.equal(a3.json.commissionComplete, true);
    assert.deepEqual(a3.json.score, { correct: 3, total: 3 });
    assert.ok(a3.json.reward, 'a full assignment earns a piece to wear');

    // hide it, then delete it
    assert.equal((await call(`/api/admin/class/ROOM1/assignments/${id}`, { method: 'PATCH', headers: OWNER, body: { live: false } })).json.assignment.live, false);
    assert.deepEqual((await call('/api/state', { token })).json.assignments, []);
    assert.equal((await call(`/api/admin/class/ROOM1/assignments/${id}`, { method: 'DELETE', headers: OWNER })).status, 200);
    assert.equal((await call('/api/admin/class/ROOM1', { headers: OWNER })).json.assignments.length, 1);
  } finally {
    server.close();
  }
});

test('a problem whose skill was not recognised is kept for the teacher to pick', () => {
  const d = draftFromReading({ problems: [{ prompt: '9 + 3', answer: '12', check: '9+3', skill: 'not-a-skill', hints: [], unsure: false }], skipped: [], note: '' });
  assert.equal(d.problems.length, 1);
  assert.equal(d.problems[0].skill, '');
  assert.match(d.problems[0].flag, /Pick the skill/);
  assert.equal(d.skipped.length, 0);
});
