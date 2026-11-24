import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, makeTask, checkAnswer, parseNumber, mulberry32, THEMES } from '../src/skills.js';
import { levelFor, updateMastery, pickSkill, chooseTheme, recordInterest, newInterest, isUnlocked } from '../src/adaptive.js';
import { classSummary, newStudent, startCommission, nextTask, applyAnswer, giveHint, COMMISSION_LENGTH } from '../src/logic.js';

test('every generator yields a checkable answer and a final hint that shows it, for many seeds', () => {
  for (const skill of SKILL_IDS) {
    for (const level of [1, 2, 3]) {
      for (const theme of THEMES) {
        for (let seed = 1; seed <= 300; seed++) {
          const t = makeTask(skill, level, theme, mulberry32(seed));
          const where = `${skill} L${level} ${theme} seed ${seed}`;
          assert.ok(Number.isFinite(t.answer), `${where}: answer ${t.answer}`);
          assert.equal(typeof t.answerText, 'string');
          assert.equal(t.hints.length, 3);
          assert.ok(t.hints[2].includes(t.answerText), `${where}: final hint should show the answer`);
          assert.ok(checkAnswer(t, t.answerText), `${where}: its own answer text should be accepted`);
          assert.ok(!checkAnswer(t, String(t.answer + 1)), `${where}: a wrong answer should be refused`);
          assert.ok(t.prompt.length > 10);
        }
      }
    }
  }
});

test('retries are fresh variants', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 50; seed++) seen.add(makeTask('ratio', 2, 'jewelry', mulberry32(seed)).prompt);
  assert.ok(seen.size > 20);
});

test('parseNumber accepts money and rejects junk', () => {
  assert.equal(parseNumber('$1,200'), 1200);
  assert.equal(parseNumber(' 42 '), 42);
  assert.equal(parseNumber('4/5'), NaN);
  assert.equal(parseNumber('abc'), NaN);
  assert.equal(parseNumber('1e3'), NaN);
});

test('mastery rises with unaided success, falls on misses, and credit shrinks with help', () => {
  const a = updateMastery(0.3, true, 0);
  const b = updateMastery(0.3, true, 3);
  assert.ok(a > b && b > 0.3);
  assert.ok(updateMastery(0.5, false, 0) < 0.5);
  assert.equal(levelFor(0.2), 1);
  assert.equal(levelFor(0.5), 2);
  assert.equal(levelFor(0.9), 3);
});

test('prerequisites gate skills until they reach the unlock threshold', () => {
  const s = newStudent({ id: 'x', classCode: 'ABC', nickname: 'Test' });
  s.mastery.frac_part = 0.2;
  assert.equal(isUnlocked('frac_add', s.mastery), false);
  s.mastery.frac_part = 0.45;
  assert.equal(isUnlocked('frac_add', s.mastery), true);
});

test('repeated failure steps back to the weakest prerequisite', () => {
  const s = newStudent({ id: 'x', classCode: 'ABC', nickname: 'Test' });
  // eq_two_step needs eq_one_step and int_mult; the weaker one is where she goes back to
  for (const k of Object.keys(s.mastery)) s.mastery[k] = 0.6;
  s.mastery.eq_one_step = 0.55;
  s.mastery.int_mult = 0.42;
  s.mastery.eq_two_step = 0.3;
  s.wrongStreak.eq_two_step = 3;
  const { skill, repair } = pickSkill(s, mulberry32(1));
  assert.equal(repair, true);
  assert.equal(skill, 'int_mult');
});

test('interest model follows explicit choices but still explores', () => {
  const i = newInterest();
  for (let n = 0; n < 5; n++) recordInterest(i, 'jewelry_bench', 2);
  const rng = mulberry32(7);
  let jewelry = 0;
  for (let n = 0; n < 1000; n++) if (chooseTheme(i, rng) === 'jewelry') jewelry++;
  assert.ok(jewelry > 750, `jewelry share ${jewelry}`);
  assert.ok(jewelry < 950, 'should keep exploring other themes');
});

test('a full commission: wrong then right, rewards, a new piece, and cleanup', () => {
  const rng = mulberry32(42);
  const s = newStudent({ id: 'u1', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  let complete = false;
  for (let n = 0; n < COMMISSION_LENGTH; n++) {
    const task = nextTask(s, rng);
    if (n === 0) {
      const miss = applyAnswer(s, task, '-1', rng);
      assert.equal(miss.retry, true, 'first miss allows a retry');
      assert.equal(miss.hint.level, 1, 'a miss shows the first step on its own');
      assert.equal(giveHint(task).level, 2);
    }
    const hit = applyAnswer(s, task, String(task.answer), rng);
    assert.equal(hit.correct, true);
    assert.ok(hit.thread >= 2);
    complete = hit.commissionComplete;
  }
  assert.equal(complete, true);
  assert.equal(s.commission, null);
  assert.equal(s.stats.commissions, 1);
  assert.ok(s.unlocks.includes('sun-hat'), 'a good commission earns the first reward piece');
  assert.ok(s.look.wear.includes('sun-hat'), 'and it goes on right away');
});

test('two misses reveal the answer, pay effort thread, and never score below zero', () => {
  const rng = mulberry32(3);
  const s = newStudent({ id: 'u2', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  const task = nextTask(s, rng);
  applyAnswer(s, task, '99999', rng);
  const r = applyAnswer(s, task, '99999', rng);
  assert.equal(r.correct, false);
  assert.equal(r.revealedAnswer, task.answerText);
  assert.ok(Array.isArray(r.steps) && r.steps.length > 0, 'a miss shows the worked steps');
  assert.equal(r.thread, 1);
  assert.ok(s.mastery[task.skill] >= 0);
});

test('cannot answer the same task twice or an old task', () => {
  const rng = mulberry32(5);
  const s = newStudent({ id: 'u3', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  const task = nextTask(s, rng);
  applyAnswer(s, task, String(task.answer), rng);
  assert.ok(applyAnswer(s, task, String(task.answer), rng).error);
});

test('class summary never flags a skill the student has not tried', () => {
  const rng = mulberry32(8);
  const s = newStudent({ id: 'u5', classCode: 'ABC', nickname: 'Test' });
  assert.deepEqual(classSummary([s])[0].needsHelpWith, []); // everything sits at the starting 30%
  startCommission(s, { theme: 'jewelry', rng });
  const skill = s.commission.skill;
  for (let i = 0; i < 5; i++) {
    const t = nextTask(s, rng);
    applyAnswer(s, t, '-1', rng);
    applyAnswer(s, t, '-1', rng);
  }
  const row = classSummary([s])[0];
  assert.ok(row.needsHelpWith.includes(skill));
  assert.ok(row.attempts[skill] >= 2);
  for (const k of Object.keys(row.attempts)) if (row.attempts[k] === 0) assert.ok(!row.needsHelpWith.includes(k));
});

test('a newly opened skill is announced once, on the answer that opened it', () => {
  const rng = mulberry32(11);
  const s = newStudent({ id: 'u9', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  const seen = [];
  for (let n = 0; n < COMMISSION_LENGTH; n++) {
    const t = nextTask(s, rng);
    if (!t) break;
    const r = applyAnswer(s, t, t.answerText, rng);
    seen.push(...(r.newlyUnlockedSkills || []));
  }
  assert.ok(seen.length > 0, 'a fresh student opens at least one skill in a perfect commission');
  assert.equal(new Set(seen).size, seen.length, 'no skill is announced twice');
});

test('an answer typed in after the last hint (which states it) does not count as right', () => {
  const rng = mulberry32(21);
  const s = newStudent({ id: 'u10', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  let last;
  for (let n = 0; n < COMMISSION_LENGTH; n++) {
    const t = nextTask(s, rng);
    if (!t) break;
    giveHint(t); giveHint(t); giveHint(t);
    last = applyAnswer(s, t, t.answerText, rng);
    assert.equal(last.correct, true);
    assert.equal(last.revealed, true);
    assert.match(last.feedback, /last hint/);
  }
  assert.ok(last.commissionComplete);
  assert.equal(last.score.correct, 0, 'none counted as right');
  assert.equal(last.bonusThread, 0, 'no great-work bonus');
});

test('an answer found with one or two hints still counts as right', () => {
  const rng = mulberry32(22);
  const s = newStudent({ id: 'u11', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  const t = nextTask(s, rng);
  giveHint(t); giveHint(t);
  const r = applyAnswer(s, t, t.answerText, rng);
  assert.equal(r.correct, true);
  assert.equal(r.revealed, false);
  assert.doesNotMatch(r.feedback, /last hint/);
});

test('the count-up hint for multiplying never lists the answer itself', () => {
  for (let seed = 1; seed < 400; seed++) {
    const t = makeTask('mult_facts', 1, 'jewelry', mulberry32(seed));
    const m = /Count up by (\d+)s, (\d+) times: ([\d, ]+), and so on\./.exec(t.hints[1]);
    if (!m) continue;
    const listed = m[3].split(',').map((x) => Number(x.trim()));
    assert.ok(!listed.includes(Number(m[1]) * Number(m[2])), t.hints[1]);
  }
});
