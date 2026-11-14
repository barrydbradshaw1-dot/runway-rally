import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, makeTask, checkAnswer, parseNumber, mulberry32, THEMES } from '../src/skills.js';
import { levelFor, updateMastery, pickSkill, chooseTheme, recordInterest, newInterest, isUnlocked } from '../src/adaptive.js';
import { classSummary, newStudent, startCommission, nextTask, applyAnswer, giveHint, openPack, COMMISSION_LENGTH, PITY_LIMIT } from '../src/logic.js';

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

test('a full commission: wrong then right, rewards, pack, and cleanup', () => {
  const rng = mulberry32(42);
  const s = newStudent({ id: 'u1', classCode: 'ABC', nickname: 'Test' });
  startCommission(s, { rng });
  let complete = false;
  for (let n = 0; n < COMMISSION_LENGTH; n++) {
    const task = nextTask(s, rng);
    if (n === 0) {
      const miss = applyAnswer(s, task, '-1', rng);
      assert.equal(miss.retry, true, 'first miss allows a retry');
      assert.equal(giveHint(task).level, 1);
    }
    const hit = applyAnswer(s, task, String(task.answer), rng);
    assert.equal(hit.correct, true);
    assert.ok(hit.thread >= 2);
    complete = hit.commissionComplete;
  }
  assert.equal(complete, true);
  assert.equal(s.commission, null);
  assert.equal(s.stats.commissions, 1);
  assert.ok(s.cards.length === 1 || s.thread > 20);
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

test('pity: a Rare or better arrives within the pity limit', () => {
  const s = newStudent({ id: 'u4', classCode: 'ABC', nickname: 'Test' });
  const alwaysCommon = () => 0.01; // worst-case luck for rarity rolls
  let sinceRare = 0;
  for (let n = 0; n < 40; n++) {
    const { card } = openPack(s, alwaysCommon);
    sinceRare = card.rarity === 'common' ? sinceRare + 1 : 0;
    assert.ok(sinceRare <= PITY_LIMIT, `went ${sinceRare} packs without a Rare`);
  }
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
