// Learning coach: step-by-step hints when stuck, "try one like it", mixed practice, daily goals,
// teacher alerts and weekly reports for families.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/skills.js';
import {
  newStudent,
  startCommission,
  nextTask,
  applyAnswer,
  giveHint,
  publicTask,
  classSummary,
  weeklyReport,
  dailyGoal,
  dayKey,
  DAILY_GOAL,
  DAILY_GOAL_BONUS,
  MIXED_SLOT,
} from '../src/logic.js';
import { createApp } from '../src/server.js';
import { MemoryStore } from '../src/store.js';

const NOW = Date.parse('2026-11-24T15:00:00Z');
const fresh = (seed = 5) => {
  const rng = mulberry32(seed);
  const s = newStudent({ id: 'c1', classCode: 'ROOM1', nickname: 'Coach' });
  return { s, rng };
};
const wrong = (t) => String(t.answer + 101);

test('a first miss shows the first step of the method on its own, and it costs nothing extra', () => {
  const { s, rng } = fresh();
  startCommission(s, { rng, now: NOW });
  const t = nextTask(s, rng, { now: NOW });
  const miss = applyAnswer(s, t, wrong(t), rng, { now: NOW });
  assert.equal(miss.retry, true);
  assert.deepEqual(miss.hint, { level: 1, steps: [t.hints[0]] });
  assert.ok(!miss.hint.steps.includes(t.hints[2]), 'never the step that states the answer');
  const hit = applyAnswer(s, t, t.answerText, rng, { now: NOW });
  assert.equal(hit.correct, true);
  assert.equal(hit.thread, 4, 'same Thread as a miss then a right answer always paid');
  assert.equal(hit.revealed, false);
});

test('the step shown after a miss never goes as far as the answer', () => {
  const { s, rng } = fresh(6);
  startCommission(s, { rng, now: NOW });
  const t = nextTask(s, rng, { now: NOW });
  giveHint(t);
  giveHint(t);
  const miss = applyAnswer(s, t, wrong(t), rng, { now: NOW });
  assert.equal(miss.retry, true);
  assert.equal(miss.hint, undefined, 'two steps already shown, so no third one is given away');
  assert.equal(t.hintLevel, 2);
});

test('copying the answer from the last hint still earns no credit', () => {
  const { s, rng } = fresh(7);
  startCommission(s, { rng, now: NOW });
  const t = nextTask(s, rng, { now: NOW });
  applyAnswer(s, t, wrong(t), rng, { now: NOW }); // step 1 shown on its own
  assert.equal(giveHint(t).level, 2);
  assert.equal(giveHint(t).level, 3);
  const r = applyAnswer(s, t, t.answerText, rng, { now: NOW });
  assert.equal(r.revealed, true);
  assert.equal(s.commission.correct, 0);
});

test('hint steps already shown come back after a pause, and the ones still to come do not', () => {
  const { s, rng } = fresh(8);
  startCommission(s, { rng, now: NOW });
  const t = nextTask(s, rng, { now: NOW });
  assert.equal('shownSteps' in publicTask(t, s.commission), false);
  const h = giveHint(t);
  assert.deepEqual(h.steps, [t.hints[0]]);
  const pub = publicTask(t, s.commission);
  assert.deepEqual(pub.shownSteps.steps, [t.hints[0]]);
  assert.ok(!JSON.stringify(pub).includes(t.hints[1]));
});

test('after a miss the next problem is one like it: same skill, no harder', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, rng } = fresh(seed);
    startCommission(s, { rng, now: NOW });
    const t = nextTask(s, rng, { now: NOW });
    applyAnswer(s, t, wrong(t), rng, { now: NOW });
    const r = applyAnswer(s, t, wrong(t), rng, { now: NOW });
    assert.equal(r.likeItNext, true);
    const next = nextTask(s, rng, { now: NOW });
    assert.equal(next.skill, t.skill, `seed ${seed}`);
    assert.ok(next.level <= t.level, `seed ${seed}`);
    assert.equal(next.likeIt, true);
    assert.notEqual(next.prompt, t.prompt);
    assert.equal(publicTask(next, s.commission).likeIt, true);
  }
});

test('a right answer is followed by the usual next problem, not "one like it"', () => {
  const { s, rng } = fresh(9);
  startCommission(s, { rng, now: NOW });
  const t = nextTask(s, rng, { now: NOW });
  const r = applyAnswer(s, t, t.answerText, rng, { now: NOW });
  assert.equal(r.likeItNext, false);
  assert.equal(nextTask(s, rng, { now: NOW }).likeIt, false);
});

test('with nothing due for review, the last problem mixes in another skill she has practiced', () => {
  const { s, rng } = fresh(10);
  s.skillStats.mult_facts = { answered: 4, correct: 3 };
  s.lastPracticed.mult_facts = new Date(NOW - 86_400_000).toISOString();
  startCommission(s, { rng, now: NOW });
  s.commission.skill = 'frac_equiv';
  s.mastery.mult_facts = 0.6;
  s.mastery.frac_equiv = 0.5;
  let t;
  for (let i = 0; i <= MIXED_SLOT; i++) {
    t = nextTask(s, rng, { now: NOW });
    if (i < MIXED_SLOT) applyAnswer(s, t, t.answerText, rng, { now: NOW });
  }
  assert.equal(t.mixed, true);
  assert.equal(t.skill, 'mult_facts');
});

test('the daily goal is met once, pays a small bonus once, and counts every answered problem', () => {
  const { s, rng } = fresh(11);
  let met = 0;
  let answered = 0;
  while (answered < DAILY_GOAL + 4) {
    if (!s.commission) startCommission(s, { rng, now: NOW });
    const t = nextTask(s, rng, { now: NOW });
    const before = s.thread;
    let r;
    do r = applyAnswer(s, t, answered % 2 ? t.answerText : wrong(t), rng, { now: NOW });
    while (r.retry);
    answered += 1;
    assert.equal(r.today.answered, answered);
    if (r.goalMet) {
      met += 1;
      assert.equal(answered, DAILY_GOAL, 'wrong answers count too, so a struggling student can reach it');
      assert.equal(r.goalMet.bonus, DAILY_GOAL_BONUS);
      assert.ok(s.thread - before >= DAILY_GOAL_BONUS);
    }
  }
  assert.equal(met, 1);
  assert.deepEqual(dailyGoal(s, { now: NOW }), { goal: DAILY_GOAL, answered, met: true });
  assert.equal(dailyGoal(s, { now: NOW + 86_400_000 }).answered, 0, 'a new day starts at zero');
});

test('the goal day follows the student\'s own clock', () => {
  const { s } = fresh();
  const late = Date.parse('2026-11-25T03:00:00Z'); // 10 PM on Nov 24 in Georgia (UTC-5 = +300 minutes)
  s.daily[dayKey(late, 300)] = { answered: 4, correct: 2, commissions: 0, seconds: 120, lastAt: late, wrapShown: false };
  assert.equal(dayKey(late, 300), '2026-11-24');
  assert.equal(dailyGoal(s, { now: late, tz: 300 }).answered, 4);
});

test('weekly report: seven days, goal days, skills in English and Spanish, no contact details', () => {
  const { s } = fresh();
  s.daily['2026-11-20'] = { answered: 12, correct: 9, commissions: 2, seconds: 900, lastAt: NOW, wrapShown: false, goalMet: true };
  s.daily['2026-11-23'] = { answered: 3, correct: 1, commissions: 0, seconds: 240, lastAt: NOW, wrapShown: false };
  s.mastery.mult_facts = 0.9;
  s.skillStats.frac_equiv = { answered: 4, correct: 1 };
  s.mastery.frac_equiv = 0.2;
  const r = weeklyReport(s, { now: NOW });
  assert.equal(r.days.length, 7);
  assert.equal(r.from, '2026-11-18');
  assert.equal(r.to, '2026-11-24');
  assert.equal(r.goalDays, 1);
  assert.equal(r.thisWeek.answered, 15);
  assert.deepEqual(r.strong, ['Multiplying']);
  assert.deepEqual(r.strongEs, ['Multiplicar']);
  assert.equal(r.needsHelp[0].nameEs, 'Fracciones equivalentes');
  assert.doesNotMatch(JSON.stringify(r), /email|phone|parent|address/i);
});

test('teacher alerts: stuck right now, and gone quiet after a week', () => {
  const { s } = fresh();
  s.stats.answered = 20;
  s.daily['2026-11-10'] = { answered: 5, correct: 3, commissions: 1, seconds: 300, lastAt: NOW, wrapShown: false };
  s.wrongStreak.ratio = 3;
  const other = newStudent({ id: 'c2', classCode: 'ROOM1', nickname: 'Busy' });
  other.stats.answered = 5;
  other.daily['2026-11-24'] = { answered: 5, correct: 5, commissions: 1, seconds: 300, lastAt: NOW, wrapShown: false };
  const [a, b] = classSummary([s, other], { now: NOW });
  assert.equal(a.quiet, true);
  assert.equal(a.lastActive, '2026-11-10');
  assert.deepEqual(a.stuckOn, ['ratio']);
  assert.equal(b.quiet, false);
  assert.deepEqual(b.stuckOn, []);
  const never = classSummary([newStudent({ id: 'c3', classCode: 'ROOM1', nickname: 'New' })], { now: NOW })[0];
  assert.equal(never.quiet, false, 'a student who has never played is "not started", not quiet');
});

test('API: today\'s goal reaches the student; reports need a teacher and are logged, never sent', async () => {
  const store = new MemoryStore();
  await store.init();
  await store.createClass('ROOM1', { kind: 'manual', name: 'Room 1' });
  const { server } = createApp({ store, env: { NODE_ENV: 'test' }, seed: 3 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    const joined = await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Goal Getter' } });
    const auth = { authorization: `Bearer ${joined.json.token}` };
    const st = await call('/api/state', { headers: auth });
    assert.deepEqual(st.json.student.today, { goal: DAILY_GOAL, answered: 0, met: false });
    const started = await call('/api/commission/start', { method: 'POST', body: {}, headers: auth });
    const ans = await call('/api/answer', { method: 'POST', body: { taskId: started.json.task.id, answer: '-99999' }, headers: auth });
    assert.equal(ans.json.retry, true);
    assert.equal(ans.json.hint.level, 1);
    assert.equal(ans.json.hint.steps.length, 1);

    const id = (await store.listClass('ROOM1'))[0].id;
    assert.ok([401, 403].includes((await call(`/api/admin/class/ROOM1/reports`)).status), "needs a teacher");
    const admin = { 'x-admin-token': 'dev-admin', 'x-tz-offset': '300' };
    const one = await call(`/api/admin/class/ROOM1/student/${id}/report`, { headers: admin });
    assert.equal(one.status, 200);
    assert.equal(one.json.reports.length, 1);
    assert.equal(one.json.reports[0].nickname, 'Goal Getter');
    assert.equal(one.json.title, 'Room 1');
    const all = await call('/api/admin/class/ROOM1/reports', { headers: admin });
    assert.equal(all.json.reports.length, 1);
    assert.equal((await call(`/api/admin/class/ROOM1/student/00000000-0000-4000-8000-000000000000/report`, { headers: admin })).status, 404);
    const audit = await store.listAudit();
    assert.equal(audit.filter((a) => a.action === 'weekly_report').length, 2);
    const cls = await call('/api/admin/class/ROOM1', { headers: admin });
    assert.ok('goalDaysThisWeek' in cls.json.students[0] && 'quiet' in cls.json.students[0]);
  } finally {
    server.close();
  }
});

test('the console prints reports and never emails them', () => {
  const admin = readFileSync(new URL('../../web/admin/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /window\.print\(\)/);
  assert.doesNotMatch(admin, /mailto:|sendMail|nodemailer/i);
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /nodemailer|smtp|sendgrid|mailgun/i);
});
