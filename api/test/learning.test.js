import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, SKILL_IDS, makeTask, gradeAnswer, diagnose, parseAnswer, mulberry32, ancestorsOf, descendantsOf, depthOf } from '../src/skills.js';
import { updateMastery, chooseLevel, recordResult, dueReviews, applyFade, isUnlocked, REVIEW_DAYS, LEVEL_CAP, FADE_FLOOR } from '../src/adaptive.js';
import {
  newStudent,
  normalizeStudent,
  startCommission,
  nextTask,
  applyAnswer,
  startPlacement,
  placementTask,
  applyPlacementAnswer,
  finishPlacement,
  progressSummary,
  placementSummary,
  publicTask,
  PLACEMENT_MAX,
  REVIEW_SLOTS,
} from '../src/logic.js';
import { newRecoveryCode, normalizeRecoveryCode } from '../src/server.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-02T15:00:00Z');
const fresh = (id = 's') => newStudent({ id, classCode: 'HOME', nickname: 'Test' });

// ---------- skills ----------

test('the skill map is a sound graph that starts from foundations', () => {
  for (const id of SKILL_IDS) {
    for (const p of SKILLS[id].prereq) assert.ok(SKILLS[p], `${id} needs unknown ${p}`);
    assert.ok(!ancestorsOf(id).has(id), `${id} depends on itself`);
  }
  for (const base of ['mult_facts', 'div_facts', 'frac_equiv', 'decimals', 'int_add']) assert.ok(SKILLS[base], base);
  assert.equal(depthOf('mult_facts'), 0);
  assert.ok(depthOf('eq_two_step') > depthOf('eq_one_step'));
  assert.ok(descendantsOf('mult_facts').includes('percent'));
  assert.ok(SKILL_IDS.length >= 19);
});

test('answers can be negative, decimal or a fraction', () => {
  assert.deepEqual(parseAnswer('-3').value, -3);
  assert.deepEqual(parseAnswer('−3').value, -3);
  assert.equal(parseAnswer('12.50').value, 12.5);
  assert.equal(parseAnswer('3/4').value, 0.75);
  assert.ok(!Number.isFinite(parseAnswer('3//4')?.value));
});

test('fraction problems want a fraction, and say so kindly when it is not simplified', () => {
  let t;
  for (let seed = 1; seed < 200 && !t; seed++) {
    const c = makeTask('frac_simplify', 2, 'fabric', mulberry32(seed));
    if (c.requireFraction && c.simplest) t = c;
  }
  assert.ok(t, 'found a simplify-the-fraction task');
  assert.ok(gradeAnswer(t, t.answerText).correct);
  const [n, d] = t.answerText.split('/').map(Number);
  const unsimplified = gradeAnswer(t, `${n * 2}/${d * 2}`);
  assert.equal(unsimplified.correct, false);
  assert.match(unsimplified.note, /simpl|lowest/i);
});

test('a wrong answer gets feedback about the specific slip', () => {
  let checked = 0;
  for (const skill of SKILL_IDS) {
    for (let seed = 1; seed <= 40; seed++) {
      const t = makeTask(skill, 2, 'jewelry', mulberry32(seed));
      for (const m of t.mistakes || []) {
        assert.notEqual(m.value, t.answer);
        assert.equal(diagnose(t, String(m.value)), m.text);
        checked++;
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} known mistakes`);
  const t = makeTask('int_add', 2, 'runway', mulberry32(9));
  if (t.answer !== 0 && !(t.mistakes || []).some((m) => m.value === -t.answer)) assert.match(diagnose(t, String(-t.answer)), /sign/);
  assert.equal(diagnose(t, t.answerText), null);
  assert.match(diagnose(t, 'banana'), /number like/, 'junk gets a how-to-type tip');
});

// ---------- difficulty and mastery ----------

test('easy problems cannot show full mastery, and a right answer never lowers it', () => {
  let m = 0.3;
  for (let i = 0; i < 200; i++) m = updateMastery(m, true, 0, 1);
  assert.ok(m <= LEVEL_CAP[0] + 1e-9, `level 1 only shows ${LEVEL_CAP[0]}, got ${m}`);
  assert.equal(updateMastery(0.9, true, 0, 1), 0.9, 'a right answer on an easy problem keeps what she has');
  assert.ok(updateMastery(0.5, false, 0, 2) < 0.5);
  let hard = 0.3;
  for (let i = 0; i < 60; i++) hard = updateMastery(hard, true, 0, 3);
  assert.ok(hard > 0.9);
});

test('difficulty steps down after two misses and up only after two clean wins', () => {
  const s = fresh();
  s.mastery.ratio = 0.75; // would be level 3 by mastery alone
  s.recent.ratio = [{ c: true, lvl: 2, aided: false }];
  assert.equal(chooseLevel(s, 'ratio'), 2, 'one win is not enough to move up');
  s.recent.ratio.push({ c: true, lvl: 2, aided: true });
  assert.equal(chooseLevel(s, 'ratio'), 2, 'a hinted win does not count');
  s.recent.ratio.push({ c: true, lvl: 2, aided: false }, { c: true, lvl: 2, aided: false });
  assert.equal(chooseLevel(s, 'ratio'), 3);
  s.recent.ratio.push({ c: false, lvl: 3, aided: false }, { c: false, lvl: 3, aided: false });
  assert.equal(chooseLevel(s, 'ratio'), 2);
  s.recent.ratio = [false, false, true, false, false].map((c) => ({ c, lvl: 2, aided: false }));
  assert.equal(chooseLevel(s, 'ratio'), 1, 'mostly wrong lately: back to confidence builders');
});

// ---------- spaced review and fade ----------

test('a missed skill comes back tomorrow, and clean reviews space out', () => {
  const s = fresh();
  s.mastery.mult_facts = 0.6; // ratio is open
  s.mastery.ratio = 0.5;
  recordResult(s, 'ratio', { correct: false, level: 2, aided: false, now: T0 });
  assert.deepEqual(dueReviews(s, T0), []);
  assert.deepEqual(dueReviews(s, T0 + DAY), ['ratio']);
  let now = T0 + DAY;
  for (let step = 1; step < REVIEW_DAYS.length; step++) {
    recordResult(s, 'ratio', { correct: true, level: 2, aided: false, review: true, now });
    assert.equal(s.review.ratio.due, now + REVIEW_DAYS[step] * DAY);
    now = s.review.ratio.due;
  }
  recordResult(s, 'ratio', { correct: true, level: 2, aided: false, review: true, now });
  assert.equal(s.review.ratio.due, null, 'retired after the last spacing');
});

test('review problems are mixed into a commission from another skill', () => {
  const rng = mulberry32(4);
  const s = fresh();
  for (const k of SKILL_IDS) s.mastery[k] = 0.6;
  s.review.ratio = { due: T0 - 1, step: 1 };
  s.review.decimals = { due: T0 - 1, step: 1 };
  startCommission(s, { rng, now: T0 });
  const seen = [];
  for (let n = 0; n < 5; n++) {
    const t = nextTask(s, rng, { now: T0 });
    seen.push(t);
    applyAnswer(s, t, t.answerText, rng, { now: T0 + n * 60_000 });
  }
  const reviews = seen.filter((t) => t.review);
  assert.ok(reviews.length >= 1, 'at least one review slot used');
  assert.ok(REVIEW_SLOTS.some((i) => seen[i].review && seen[i].skill !== seen[0].skill), 'a review slot brought in a different skill');
  assert.ok(publicTask(reviews[0], { done: 0, total: 5 }).review);
});

test('two idle weeks fade a skill a little, never below the floor, and only once', () => {
  const s = fresh();
  s.mastery.mult_facts = 0.6; // ratio is open
  s.mastery.ratio = 0.8;
  s.mastery.decimals = 0.46;
  s.lastPracticed = { ratio: new Date(T0).toISOString(), decimals: new Date(T0).toISOString() };
  assert.deepEqual(applyFade(s, T0 + 13 * DAY), []);
  const later = T0 + 15 * DAY;
  assert.deepEqual(applyFade(s, later).sort(), ['decimals', 'ratio']);
  assert.equal(s.mastery.mult_facts, 0.6, 'a skill she never practiced does not fade');
  assert.ok(Math.abs(s.mastery.ratio - 0.7) < 1e-9);
  assert.equal(s.mastery.decimals, FADE_FLOOR);
  assert.ok(dueReviews(s, later).includes('ratio'));
  assert.deepEqual(applyFade(s, later + DAY), [], 'the same idle stretch fades once');
});

// ---------- worked examples ----------

test('the first problem at a new skill and level comes with a worked example, once', () => {
  const rng = mulberry32(8);
  const s = fresh();
  startCommission(s, { rng, now: T0 });
  const first = nextTask(s, rng, { now: T0 });
  assert.ok(first.example && first.example.prompt && first.example.steps.length > 0);
  assert.ok(!first.example.prompt.includes(first.prompt), 'the example is a different problem');
  applyAnswer(s, first, first.answerText, rng, { now: T0 });
  const key = `${first.skill}:${first.level}`;
  assert.ok(s.examplesSeen.includes(key));
  const second = nextTask(s, rng, { now: T0 });
  if (`${second.skill}:${second.level}` === key) assert.equal(second.example, null);
});

// ---------- packs and session end ----------

test('a pack is earned with 3 of 5 right; fewer earns effort thread and a hint', () => {
  const play = (rights) => {
    const rng = mulberry32(21);
    const s = fresh();
    startCommission(s, { rng, now: T0 });
    let last;
    for (let n = 0; n < 5; n++) {
      const t = nextTask(s, rng, { now: T0 });
      if (n < rights) last = applyAnswer(s, t, t.answerText, rng, { now: T0 });
      else {
        applyAnswer(s, t, '99999', rng, { now: T0 });
        last = applyAnswer(s, t, '99999', rng, { now: T0 });
      }
    }
    return last;
  };
  const good = play(3);
  assert.ok(good.pack && good.pack.card.id);
  assert.deepEqual(good.score, { correct: 3, total: 5 });
  const poor = play(1);
  assert.equal(poor.pack, null);
  assert.equal(poor.effortThread, 3);
  assert.ok(poor.packHint);
});

test('after 3 commissions in a day she gets one gentle wrap-up, with a streak', () => {
  const rng = mulberry32(31);
  const s = fresh();
  const wraps = [];
  for (let day = 0; day < 2; day++) {
    for (let c = 0; c < 4; c++) {
      const base = T0 + day * DAY + c * 10 * 60_000;
      startCommission(s, { rng, now: base });
      let last;
      for (let n = 0; n < 5; n++) {
        const t = nextTask(s, rng, { now: base });
        last = applyAnswer(s, t, t.answerText, rng, { now: base + n * 30_000 });
      }
      if (last.sessionDone) wraps.push({ day, c, ...last.sessionDone });
    }
  }
  assert.equal(wraps.length, 2, 'once per day');
  assert.equal(wraps[0].c, 2);
  assert.equal(wraps[0].streak, 1);
  assert.equal(wraps[1].streak, 2);
  assert.ok(wraps[0].answered >= 15);
});

// ---------- placement ----------

function runPlacement(s, rng, answerFor) {
  startPlacement(s, { now: T0 });
  let t;
  let asked = 0;
  while ((t = placementTask(s, rng))) {
    asked++;
    const a = answerFor(t);
    applyPlacementAnswer(s, t, a === null ? '' : a, { skip: a === null });
    assert.ok(asked <= PLACEMENT_MAX);
  }
  return { asked, summary: finishPlacement(s, { now: T0 }) };
}

test('placement: a student who knows everything is placed high in few questions', () => {
  const rng = mulberry32(2);
  const s = fresh();
  const { asked } = runPlacement(s, rng, (t) => t.answerText);
  assert.ok(asked <= PLACEMENT_MAX);
  assert.equal(s.placement.status, 'done');
  assert.ok(SKILL_IDS.filter((k) => s.mastery[k] >= 0.65).length >= 10);
  const { summary } = { summary: placementSummary(s) };
  assert.ok(!summary.startingWith.includes(SKILLS.mult_facts.name), 'does not restart her on what she just showed she knows');
});

test('placement: a gap at the base marks what depends on it, and the rest starts there', () => {
  const rng = mulberry32(3);
  const s = fresh();
  // knows integers and decimals, does not know times tables yet
  const { asked, summary } = runPlacement(s, rng, (t) => (t.skill === 'mult_facts' ? null : t.answerText));
  assert.equal(s.placement.results.mult_facts, 'gap');
  for (const d of descendantsOf('mult_facts')) assert.equal(s.placement.results[d], 'gap', d);
  assert.ok(s.mastery.mult_facts <= 0.2 + 1e-9);
  assert.ok(s.mastery.decimals >= 0.65);
  assert.ok(!isUnlocked('div_facts', s.mastery), 'division waits for times tables');
  assert.ok(summary.startingWith.includes(SKILLS.mult_facts.name));
  assert.ok(asked < 8, `a struggling student should not face a long test (asked ${asked})`);
});

test('placement: one wrong answer on a big foundation is confirmed before calling it a gap', () => {
  const rng = mulberry32(5);
  const s = fresh();
  let firstMiss = true;
  runPlacement(s, rng, (t) => {
    if (t.skill === 'mult_facts' && firstMiss) {
      firstMiss = false;
      return '99999';
    }
    return t.answerText;
  });
  assert.equal(s.placement.results.mult_facts, 'known', 'a slip followed by a right answer is not a gap');
});

test('placement questions have no hints and cannot be answered as practice', () => {
  const rng = mulberry32(6);
  const s = fresh();
  startPlacement(s, { now: T0 });
  const t = placementTask(s, rng);
  assert.ok(publicTask(t).placement);
  assert.ok(applyAnswer(s, t, t.answerText, rng).error);
});

// ---------- older students and family view ----------

test('a student saved before this update gets every new skill and field', () => {
  const old = {
    id: 'old',
    classCode: 'HOME',
    nickname: 'Ava',
    thread: 40,
    mastery: { frac_part: 0.5, ratio: 0.6, frac_add: 0.3, percent: 0.2 },
    wrongStreak: { frac_part: 0, ratio: 0, frac_add: 0, percent: 1 },
    stats: { answered: 30, correct: 20, commissions: 6 },
    unlocks: ['basic-tee'],
    cards: [],
  };
  const s = normalizeStudent(old);
  for (const k of SKILL_IDS) assert.equal(typeof s.mastery[k], 'number', k);
  assert.equal(s.mastery.ratio, 0.6, 'old progress kept');
  assert.deepEqual(s.examplesSeen, []);
  assert.equal(s.streak.count, 0);
  const rng = mulberry32(1);
  startCommission(s, { rng, now: T0 });
  const t = nextTask(s, rng, { now: T0 });
  assert.ok(applyAnswer(s, t, t.answerText, rng, { now: T0 }).correct);
});

test('the family summary shows this week in plain words', () => {
  const rng = mulberry32(12);
  const s = fresh();
  s.nickname = 'Ava';
  for (let day = 0; day < 3; day++) {
    const base = T0 + day * DAY;
    startCommission(s, { rng, now: base });
    for (let n = 0; n < 5; n++) {
      const t = nextTask(s, rng, { now: base });
      applyAnswer(s, t, t.answerText, rng, { now: base + n * 60_000 });
    }
  }
  const p = progressSummary(s, { now: T0 + 2 * DAY + 3600_000 });
  assert.equal(p.nickname, 'Ava');
  assert.equal(p.thisWeek.daysActive, 3);
  assert.equal(p.thisWeek.answered, 15);
  assert.equal(p.thisWeek.correct, 15);
  assert.equal(p.streak, 3);
  assert.ok(p.improved.length >= 1, 'shows what got better');
  assert.ok(p.thisWeek.minutes > 0);
  assert.ok(!JSON.stringify(p).includes('classCode'), 'no class details');
  assert.equal(progressSummary(s, { now: T0 + 6 * DAY }).streak, 0, 'a broken streak shows 0');
});

test('the day follows the family clock, not the server clock', () => {
  const rng = mulberry32(13);
  const s = fresh();
  const lateEvening = Date.parse('2026-11-03T03:30:00Z'); // 10:30 PM on Nov 2 in Georgia (UTC-5)
  startCommission(s, { rng, now: lateEvening });
  const t = nextTask(s, rng, { now: lateEvening });
  applyAnswer(s, t, t.answerText, rng, { now: lateEvening, tz: 300 });
  assert.ok(s.daily['2026-11-02']);
  assert.ok(!s.daily['2026-11-03']);
});

// ---------- recovery code ----------

test('recovery codes are readable and forgiving to type', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = newRecoveryCode();
    assert.match(c, /^RR-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    seen.add(c);
    assert.equal(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, ' ')), normalizeRecoveryCode(c));
  }
  assert.equal(seen.size, 200);
  assert.equal(normalizeRecoveryCode('rr-abcd-2345'), normalizeRecoveryCode('ABCD2345'));
  assert.equal(normalizeRecoveryCode('nope'), null);
});

// ---------- Georgia standards and the grade 6 and 7 additions ----------

test('every skill carries Georgia standard codes and the grade Georgia first teaches it', () => {
  const code = /^[3-8]\.(NR|PAR|GSR|PR|MDR|DSR|FGR)\.\d+$/;
  for (const id of SKILL_IDS) {
    const s = SKILLS[id];
    assert.ok(s.codes.length > 0, `${id} has no code`);
    for (const c of s.codes) assert.match(c, code, `${id}: ${c}`);
    assert.ok(s.grade >= 3 && s.grade <= 8, `${id} grade ${s.grade}`);
    assert.equal(Number(s.codes[0][0]), Math.min(...s.codes.map((c) => Number(c[0]))), `${id}: earliest code first`);
    assert.equal(s.standard, s.codes.join(', '));
  }
  assert.deepEqual(SKILLS.expr_eval.codes, ['6.PAR.6'], 'evaluating is 6.PAR.6; 7.PAR.2 is rewriting');
  assert.deepEqual(SKILLS.expr_equiv.codes, ['7.PAR.2']);
  assert.deepEqual(SKILLS.eq_two_step.codes, ['7.PAR.3']);
});

test('the skill map covers the grade 6 and 7 standards found missing in the November check', () => {
  const covered = new Set(SKILL_IDS.flatMap((id) => SKILLS[id].codes));
  for (const c of ['6.NR.1', '6.NR.3', '6.NR.4', '6.PAR.6', '6.PAR.7', '6.PAR.8', '6.GSR.5', '7.NR.1', '7.PAR.2', '7.PAR.3', '7.PAR.4', '7.GSR.5', '7.PR.6']) {
    assert.ok(covered.has(c), `${c} not covered`);
  }
});

test('dividing fractions: flip the second fraction, and multiplying straight across gets named', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const t = makeTask('frac_div', 2, 'fabric', mulberry32(seed));
    const [, a, b, c, d] = /(\d+)\/(\d+) yard of lace\. Each cuff uses (\d+)\/(\d+)/.exec(t.prompt).map(Number);
    assert.ok(Math.abs(t.answer - (a * d) / (b * c)) < 1e-9);
    if (Math.abs((a * c) / (b * d) - t.answer) > 1e-9) assert.match(diagnose(t, `${a * c}/${b * d}`), /flip the second/);
  }
});

test('inequality word problems ask for the smallest whole number that works', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const t = makeTask('inequalities', 3, 'jewelry', mulberry32(seed));
    const [, a, b, goal] = /Solve (\d+)n − (\d+) > (\d+)/.exec(t.prompt).map(Number);
    const n = t.answer;
    assert.ok(a * n - b > goal, 'the answer works');
    assert.ok(!(a * (n - 1) - b > goal), 'one less does not');
  }
});

test('circle problems use 3.14 and accept the exact decimal', () => {
  const t = makeTask('circles', 3, 'runway', mulberry32(4));
  const r = Number(/radius of (\d+)/.exec(t.prompt)[1]);
  assert.ok(Math.abs(t.answer - 3.14 * r * r) < 1e-9);
  assert.ok(gradeAnswer(t, String(Math.round(3.14 * r * r * 100) / 100)).correct);
  assert.match(diagnose(t, String((628 * r) / 100)), /circumference/);
});

test('the new skills sit in the right places on the map', () => {
  assert.ok(ancestorsOf('frac_div').has('frac_mult'));
  assert.ok(ancestorsOf('expr_equiv').has('int_mult'));
  assert.ok(ancestorsOf('inequalities').has('eq_one_step'));
  assert.ok(ancestorsOf('proportion').has('unit_rate'));
  assert.ok(ancestorsOf('circles').has('dec_mult_div'));
  assert.ok(descendantsOf('mult_facts').includes('area_volume'));
});

test('the family summary carries Georgia codes and grades', () => {
  const rng = mulberry32(44);
  const s = fresh();
  for (const k of SKILL_IDS) s.mastery[k] = 0.75;
  s.mastery.inequalities = 0.5;
  s.skillStats.inequalities = { answered: 4, correct: 2 };
  s.lastPracticed.inequalities = new Date(T0).toISOString();
  const p = progressSummary(s, { now: T0 });
  assert.ok(p.strongStandards.includes('7.PAR.2'));
  const w = p.workingOn.find((x) => x.name === 'Inequalities');
  assert.equal(w.standard, '6.PAR.7, 7.PAR.3');
  assert.equal(w.grade, 6);
  void rng;
});

// ---------- grade 8 ----------

test('the skill map covers all eight grade 8 standards', () => {
  const covered = new Set(SKILL_IDS.flatMap((id) => SKILLS[id].codes));
  for (const c of ['8.NR.1', '8.NR.2', '8.PAR.3', '8.PAR.4', '8.FGR.5', '8.FGR.6', '8.FGR.7', '8.GSR.8']) {
    assert.ok(covered.has(c), `${c} not covered`);
  }
  for (const id of ['exponents', 'sq_roots', 'sci_notation', 'eq_multi_step', 'slope', 'linear_models', 'systems', 'pythagorean', 'volume_curved']) {
    assert.equal(SKILLS[id].grade, 8, id);
  }
});

test('grade 8 skills build on grade 7 skills', () => {
  assert.ok(ancestorsOf('systems').has('eq_two_step'));
  assert.ok(ancestorsOf('pythagorean').has('sq_roots'));
  assert.ok(ancestorsOf('volume_curved').has('circles'));
  assert.ok(ancestorsOf('linear_models').has('coord_plane'));
  assert.ok(depthOf('systems') > depthOf('eq_two_step'));
});

test('negative exponents want a fraction, and a negative number gets named', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const t = makeTask('exponents', 3, 'fabric', mulberry32(seed));
    if (!/as a fraction/.test(t.prompt)) continue;
    assert.ok(gradeAnswer(t, t.answerText).correct);
    assert.match(gradeAnswer(t, String(t.answer)).note || '', /fraction/);
    assert.match(diagnose(t, String(-1 / t.answer)), /not make the number negative/);
  }
});

test('equations with x on both sides have whole-number answers that check', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const t = makeTask('eq_multi_step', 1, 'runway', mulberry32(seed));
    const [, a, b, c, d] = /Solve for x: (\d+)x \+ (\d+) = (\d*)x \+ \(?(-?\d+)\)?/.exec(t.prompt);
    const x = t.answer;
    assert.ok(Number.isInteger(x));
    assert.equal(Number(a) * x + Number(b), Number(c || 1) * x + Number(d));
  }
});

test('slope takes rise over run, simplified, and names the flip', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const t = makeTask('slope', 2, 'jewelry', mulberry32(seed));
    const [, x1, y1, x2, y2] = /\((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)/.exec(t.prompt).map(Number);
    assert.ok(Math.abs(t.answer - (y2 - y1) / (x2 - x1)) < 1e-9);
    assert.match(diagnose(t, String((x2 - x1) / (y2 - y1))), /run over rise/);
  }
});

test('Pythagorean problems and volumes come out exact', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = makeTask('pythagorean', 1, 'fabric', mulberry32(seed));
    const [, a, b] = /legs (\d+) and (\d+)/.exec(t.prompt).map(Number);
    assert.equal(t.answer * t.answer, a * a + b * b);
    assert.match(diagnose(t, String(a + b)), /added the sides/);
  }
  const cone = makeTask('volume_curved', 2, 'runway', mulberry32(5));
  const [, r, h] = /radius (\d+) feet and height (\d+)/.exec(cone.prompt).map(Number);
  assert.ok(Math.abs(cone.answer - (3.14 * r * r * h) / 3) < 1e-9);
  assert.match(diagnose(cone, String(Math.round(314 * r * r * h) / 100)), /one third/);
});
