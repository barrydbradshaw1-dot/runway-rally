import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, makeTask, checkAnswer, parseNumber, mulberry32, THEMES } from '../src/skills.js';
import { levelFor, updateMastery, pickSkill, chooseTheme, recordInterest, newInterest, isUnlocked } from '../src/adaptive.js';
import { classSummary, newStudent, startCommission, nextTask, applyAnswer, giveHint, giveExplain, openPack, COMMISSION_LENGTH, PITY_LIMIT } from '../src/logic.js';

test('every generator yields integer answers and distinct hints for many seeds', () => {
  for (const skill of SKILL_IDS) {
    for (const level of [1, 2, 3]) {
      for (const theme of THEMES) {
        for (let seed = 1; seed <= 300; seed++) {
          const t = makeTask(skill, level, theme, mulberry32(seed));
          assert.ok(Number.isInteger(t.answer) && t.answer > 0, `${skill} L${level} seed ${seed}: answer ${t.answer}`);
          assert.equal(t.hints.length, 3);
          assert.ok(t.hints[2].includes(String(t.answer)), `${skill} final hint should show the answer`);
          assert.ok(checkAnswer(t, String(t.answer)));
          assert.ok(!checkAnswer(t, String(t.answer + 1)));
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
  s.mastery = { frac_part: 0.5, ratio: 0.45, frac_add: 0.5, percent: 0.5 };
  s.wrongStreak.percent = 3;
  const { skill, repair } = pickSkill(s, mulberry32(1));
  assert.equal(repair, true);
  assert.equal(skill, 'ratio');
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
  applyAnswer(s, task, '0', rng);
  const r = applyAnswer(s, task, '0', rng);
  assert.equal(r.correct, false);
  assert.equal(r.revealedAnswer, task.answer);
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

test('every task shows the math and offers 3 distinct positive choices including the answer', () => {
  for (const skill of SKILL_IDS) {
    for (const level of [1, 2, 3]) {
      for (const theme of THEMES) {
        for (let seed = 1; seed <= 200; seed++) {
          const t = makeTask(skill, level, theme, mulberry32(seed));
          assert.equal(typeof t.math, 'string');
          assert.ok(t.math.includes('?'));
          assert.equal(t.choices.length, 3);
          assert.equal(new Set(t.choices).size, 3, `${skill} L${level} seed ${seed}: ${t.choices}`);
          assert.ok(t.choices.every((c) => Number.isInteger(c) && c > 0));
          assert.equal(t.choices.filter((c) => c === t.answer).length, 1);
          assert.equal(t.wrong, undefined);
        }
      }
    }
  }
});

test('every task has plain words and a model for the Show me how panel', () => {
  const kinds = new Set();
  for (const skill of SKILL_IDS) {
    for (const level of [1, 2, 3]) {
      for (const theme of THEMES) {
        for (let seed = 1; seed <= 100; seed++) {
          const t = makeTask(skill, level, theme, mulberry32(seed));
          assert.ok(t.plain.length > 10);
          assert.ok(['part', 'add', 'ratio', 'percent', 'table', 'equation'].includes(t.model.kind));
          kinds.add(t.model.kind);
          if (skill === 'frac_part' || skill === 'frac_add') assert.ok(!t.math.includes('×'), 'fraction math reads as "of"');
        }
      }
    }
  }
  assert.equal(kinds.size, 6);
});

test('every skill carries a GSE standard tag and its prerequisites exist', async () => {
  const { SKILLS } = await import('../src/skills.js');
  for (const [id, sk] of Object.entries(SKILLS)) {
    assert.match(sk.gse, /^[5-8]\.[A-Z]{1,2}\.\d[a-z]?$/, `${id} gse tag`);
    for (const p of sk.prereq) assert.ok(SKILLS[p], `${id} prereq ${p}`);
  }
  assert.equal(Object.keys(SKILLS).length, 9);
});

test('students saved before new skills existed are healed with starting values', async () => {
  const { healStudent } = await import('../src/logic.js');
  const old = { mastery: { ratio: 0.6 }, wrongStreak: {}, skillStats: {} };
  healStudent(old);
  assert.equal(old.mastery.ratio, 0.6);
  assert.equal(old.mastery.equations, 0.3);
  assert.equal(old.skillStats.markup.answered, 0);
});

test('every item points at a real skill and every set at real items', async () => {
  const { ITEMS, SETS } = await import('../src/logic.js');
  const { SKILLS } = await import('../src/skills.js');
  const ids = new Set(ITEMS.map((i) => i.id));
  for (const i of ITEMS) assert.ok(i.skill === null || SKILLS[i.skill], i.id);
  for (const s of SETS) for (const id of s.items) assert.ok(ids.has(id), `${s.id}: ${id}`);
});

test('a student who answers everything correctly reaches all 9 skills, unlocks items, and never breaks', () => {
  const rng = mulberry32(2026);
  const s = newStudent({ id: 'sim', classCode: 'SIM', nickname: 'Sim' });
  const touched = new Set();
  for (let c = 0; c < 140; c++) {
    startCommission(s, { rng });
    for (let i = 0; i < COMMISSION_LENGTH; i++) {
      const task = nextTask(s, rng);
      touched.add(task.skill);
      assert.equal(task.choices.length, 3);
      const r = applyAnswer(s, task, String(task.answer), rng);
      assert.ok(!r.error, r.error);
      for (const k of Object.keys(s.mastery)) assert.ok(Number.isFinite(s.mastery[k]));
    }
  }
  assert.equal(touched.size, 9, [...touched].join());
  assert.ok(s.unlocks.length >= 10, `unlocked ${s.unlocks.length}`);
});

test('guessing from the 3 choices earns less than working it out; Show me how counts once as a hint', () => {
  const rng = mulberry32(5);
  const fresh = (id) => {
    const s = newStudent({ id, classCode: 'ABC', nickname: id });
    startCommission(s, { rng: mulberry32(9) });
    return { s, task: nextTask(s, mulberry32(9)) };
  };
  const typed = fresh('t1');
  const rT = applyAnswer(typed.s, typed.task, String(typed.task.answer), rng, 'typed');
  const chose = fresh('t2');
  const rC = applyAnswer(chose.s, chose.task, String(chose.task.answer), rng, 'choice');
  assert.equal(rT.thread, 5);
  assert.equal(rC.thread, 4);
  assert.ok(rT.mastery > rC.mastery);

  const ex = fresh('t3');
  assert.equal(giveExplain(ex.task).counted, true);
  assert.equal(giveExplain(ex.task).counted, false); // only once
  assert.equal(ex.task.hintLevel, 0); // does not consume a hint text
  const rE = applyAnswer(ex.s, ex.task, String(ex.task.answer), rng, 'typed');
  assert.equal(rE.thread, 4);
  const stacked = fresh('t4');
  giveExplain(stacked.task);
  const rS = applyAnswer(stacked.s, stacked.task, String(stacked.task.answer), rng, 'choice');
  assert.equal(rS.thread, 3);
});
