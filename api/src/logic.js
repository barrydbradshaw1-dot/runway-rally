// Game rules. Pure functions over a student document, so they are easy to test.
// The server owns grading and rewards; the client never grants anything.
import { randomUUID } from 'node:crypto';
import { SKILL_NAMES_ES } from './skills.es.js';
import { SKILLS, SKILL_IDS, makeTask, makeExample, gradeAnswer, diagnose, diagnoseEs, storyFor, storyForEs, depthOf, ancestorsOf, descendantsOf } from './skills.js';
import {
  START_MASTERY,
  STRONG_AT,
  levelFor,
  updateMastery,
  pickSkill,
  weakestPrereq,
  chooseTheme,
  chooseLevel,
  recordInterest,
  recordResult,
  dueReviews,
  applyFade,
  isUnlocked,
  unlockedSkills,
  newInterest,
  topInterests,
} from './adaptive.js';
// The avatar's look is defined once in the web client and shared here, so both check the same list.
import { cleanLook } from '../../web/look.js';
import { SKILL_ITEMS, CARD_ITEMS, itemById, nextReward } from '../../web/items.js';

export const COMMISSION_LENGTH = 5;
export const MAX_ATTEMPTS = 2;
export const REWARD_MIN_CORRECT = 3; // a new piece needs 3 of 5 right...
export const REWARD_MIN_GAIN = 0.08; // ...or clear progress on the skill
export const ALL_COLLECTED_THREAD = 5; // once every piece and colour is theirs
export const REVIEW_SLOTS = [2, 4]; // 3rd and 5th problems can be review from another skill
export const MIXED_SLOT = 4; // with nothing due for review, the 5th problem mixes in another practiced skill
export const SESSION_COMMISSIONS = 3;
export const SESSION_SECONDS = 20 * 60;
export const PLACEMENT_MAX = 18;
// A short goal each day builds the habit: problems answered, right or not, so a student who is
// struggling can still reach it. Meeting it gives a small Thread bonus once a day.
export const DAILY_GOAL = 10;
export const DAILY_GOAL_BONUS = 5;
const DAY = 86_400_000;

// Skill pieces come from skill scores; reward pieces from finished commissions (see web/items.js).
export const ITEMS = SKILL_ITEMS;

// Saves the student's chosen look (features, hair, style, pieces worn). Only known choices and
// pieces the student owns are kept. wardrobe: only pieces were put on or taken off, so it doesn't
// count as designing a look.
export function setLook(student, raw, { wardrobe = false } = {}) {
  student.look = cleanLook(raw, { owned: student.unlocks });
  if (!wardrobe) student.lookSet = true;
  return student.look;
}

// Puts a piece on, taking off whatever was in the same spot. Returns the piece it replaced.
export function wearItem(student, id) {
  const it = itemById(id);
  if (!it) return null;
  const replacedId = student.look.wear.find((w) => itemById(w)?.slot === it.slot && w !== id) || null;
  student.look.wear = [...student.look.wear.filter((w) => itemById(w)?.slot !== it.slot), id];
  return replacedId ? itemById(replacedId) : null;
}

const brief = (it) => it && { id: it.id, name: it.name, slot: it.slot };

// Gives the next reward piece and puts it on. null once every piece and colour is theirs.
export function awardReward(student) {
  const id = nextReward(student.unlocks);
  if (!id) return null;
  student.unlocks.push(id);
  const replaced = wearItem(student, id);
  return { item: brief(itemById(id)), replaced: brief(replaced) };
}

// ---------- clock helpers (tz = minutes behind UTC, as Date#getTimezoneOffset reports) ----------
export const dayKey = (ms, tz = 0) => new Date(ms - tz * 60_000).toISOString().slice(0, 10);
const prevDay = (key) => new Date(Date.parse(key + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);

export function newStudent({ id, classCode, nickname }) {
  const s = { id, classCode, nickname, createdAt: new Date().toISOString() };
  return normalizeStudent(s);
}

// Fills in anything an older stored student is missing (new skills, new fields). Safe to call often.
export function normalizeStudent(s) {
  s.thread ??= 0;
  s.mastery ??= {};
  s.wrongStreak ??= {};
  s.skillStats ??= {};
  for (const k of SKILL_IDS) {
    s.mastery[k] ??= START_MASTERY;
    s.wrongStreak[k] ??= 0;
    s.skillStats[k] ??= { answered: 0, correct: 0 };
  }
  s.interest ??= newInterest();
  s.unlocks ??= ['basic-tee'];
  s.commission ??= null;
  s.currentTaskId ??= null;
  s.stats ??= { answered: 0, correct: 0, commissions: 0 };
  s.recent ??= {};
  s.review ??= {};
  s.lastPracticed ??= {};
  s.faded ??= {};
  s.examplesSeen ??= [];
  s.placement ??= null;
  s.spanishFirst ??= false; // the teacher can set Spanish to show first, for an English learner
  s.daily ??= {};
  s.snapshots ??= {};
  s.streak ??= { count: 0, lastDay: null };
  s.look = cleanLook(s.look, { owned: s.unlocks });
  s.lookSet ??= false;
  // Collectible cards from the first version become the matching pieces, kept in the wardrobe.
  if (Array.isArray(s.cards)) {
    for (const c of s.cards) if (CARD_ITEMS[c] && !s.unlocks.includes(CARD_ITEMS[c])) s.unlocks.push(CARD_ITEMS[c]);
  }
  delete s.cards;
  delete s.packsSinceRare;
  return s;
}

export function publicStudent(s) {
  return {
    nickname: s.nickname,
    classCode: s.classCode,
    thread: s.thread,
    mastery: s.mastery,
    unlockedSkills: unlockedSkills(s.mastery),
    unlocks: s.unlocks.map((id) => brief(itemById(id))).filter(Boolean),
    look: s.look,
    lookSet: s.lookSet,
    stats: s.stats,
    streak: s.streak.count,
    favorites: topInterests(s.interest),
    placement: s.placement ? { status: s.placement.status, asked: s.placement.asked } : null,
    reviewsDue: dueReviews(s).length,
    spanishFirst: s.spanishFirst === true,
    commission: s.commission && {
      id: s.commission.id,
      skill: s.commission.skill,
      theme: s.commission.theme,
      done: s.commission.done,
      total: s.commission.total,
      fromTeacher: s.commission.assignment ? s.commission.assignment.title : null,
    },
  };
}

function themeToArea(theme) {
  return { jewelry: 'jewelry_bench', fabric: 'pattern_table', runway: 'runway' }[theme];
}

export function startCommission(student, { theme, rng, now = Date.now(), es = false }) {
  applyFade(student, now);
  if (theme) recordInterest(student.interest, themeToArea(theme), 2); // an explicit choice is a strong signal
  const chosenTheme = theme || chooseTheme(student.interest, rng);
  // a review that is due can lead the commission when nothing is stuck
  let { skill, repair } = pickSkill(student, rng);
  const due = dueReviews(student, now);
  if (!repair && due.length && rng() < 0.3) skill = due[0];
  student.commission = {
    id: randomUUID(),
    skill,
    theme: chosenTheme,
    total: COMMISSION_LENGTH,
    done: 0,
    correct: 0,
    repair,
    startMastery: { ...student.mastery },
  };
  if (repair) student.wrongStreak[skill] = 0;
  return { story: storyFor(skill), repair, ...(es ? { storyEs: storyForEs(skill) } : {}) };
}

// A commission made from the teacher's own assignment (see homework.js). The problems are copied into
// the commission, so the teacher can edit or remove the assignment without breaking a game in progress.
export function startAssignment(student, assignment, { now = Date.now() } = {}) {
  applyFade(student, now);
  const problems = assignment.problems.slice(0, 25).map((p) => ({ ...p, hints: [...p.hints] }));
  student.commission = {
    id: randomUUID(),
    skill: problems[0].skill,
    theme: 'runway',
    total: problems.length,
    done: 0,
    correct: 0,
    repair: false,
    startMastery: { ...student.mastery },
    assignment: { id: assignment.id, title: assignment.title, problems },
  };
  const n = problems.length;
  return { story: `Your teacher sent this one: ${assignment.title}. ${n === 1 ? 'One problem' : `${n} problems`}, same rewards as any commission.` };
}

function assignmentTask(student, c) {
  const p = c.assignment.problems[c.done];
  return {
    id: randomUUID(),
    studentId: student.id,
    commissionId: c.id,
    skill: p.skill,
    level: 2,
    theme: c.theme,
    prompt: p.prompt,
    answer: p.answer,
    answerText: p.answerText,
    form: p.form,
    requireFraction: p.requireFraction,
    simplest: p.simplest,
    hints: p.hints,
    mistakes: [],
    review: false,
    example: null,
    fromTeacher: true,
    attempts: 0,
    hintLevel: 0,
    answered: false,
  };
}

// Returns the full task (with answer) for the server to store. Use publicTask() for the client.
export function nextTask(student, rng, { now = Date.now(), es = false } = {}) {
  const c = student.commission;
  if (!c) throw new Error('no active commission');
  if (c.assignment) {
    const task = assignmentTask(student, c);
    student.currentTaskId = task.id;
    return task;
  }
  // Mid-commission repair: repeated failure steps back to the weakest prerequisite.
  let repairedNow = false;
  if ((student.wrongStreak[c.skill] || 0) >= 3) {
    const pre = weakestPrereq(c.skill, student.mastery);
    if (pre) {
      student.wrongStreak[c.skill] = 0;
      c.skill = pre;
      c.repair = true;
      repairedNow = true;
    }
  }
  // "Try one like it": after a miss (or an answer the last hint gave away) the next problem is the
  // same kind, no harder, so she uses the steps she was just shown while they are fresh.
  const likeIt = !repairedNow && c.likeIt && SKILLS[c.likeIt.skill] ? c.likeIt : null;
  c.likeIt = null;
  // Interleaving: some slots bring back a different skill that is due for review. When nothing is
  // due, the last slot mixes in another skill she has practiced before, so topics stay mixed.
  let skill = likeIt ? likeIt.skill : c.skill;
  let review = false;
  let mixed = false;
  if (likeIt) {
    review = dueReviews(student, now).includes(skill);
  } else if (REVIEW_SLOTS.includes(c.done) && !c.repair) {
    const due = dueReviews(student, now).filter((s) => s !== c.skill);
    if (due.length) {
      skill = due[0];
      review = true;
    } else if (c.done === MIXED_SLOT) {
      const other = mixInSkill(student, c.skill);
      if (other) {
        skill = other;
        mixed = true;
      }
    }
  } else if (dueReviews(student, now).includes(skill)) {
    review = true;
  }
  let level = chooseLevel(student, skill);
  if ((student.wrongStreak[skill] || 0) >= 3) level = 1; // no prerequisite to fall back on
  if (likeIt) level = Math.min(level, likeIt.level);
  let t = makeTask(skill, level, c.theme, rng, { es });
  const key = `${skill}:${t.level}`;
  let example = null;
  if (!student.examplesSeen.includes(key)) {
    example = makeExample(skill, t.level, c.theme, rng, { es });
    student.examplesSeen.push(key);
  }
  // Never ask the question she just did, or the one just solved for her in the example.
  for (let i = 0; i < 10 && (t.prompt === c.lastPrompt || t.prompt === example?.prompt); i++) {
    t = makeTask(skill, level, c.theme, rng, { es });
  }
  c.lastPrompt = t.prompt;
  const task = {
    id: randomUUID(),
    studentId: student.id,
    commissionId: c.id,
    ...t,
    review,
    mixed,
    likeIt: Boolean(likeIt),
    example,
    attempts: 0,
    hintLevel: 0,
    answered: false,
  };
  student.currentTaskId = task.id;
  return task;
}

// Another skill to mix into a commission: open, practiced before, and the one left alone longest.
export function mixInSkill(student, current) {
  const tried = unlockedSkills(student.mastery).filter((k) => k !== current && (student.skillStats?.[k]?.answered ?? 0) > 0);
  tried.sort((a, b) => (student.lastPracticed[a] || '').localeCompare(student.lastPracticed[b] || ''));
  return tried[0] || null;
}

export function publicTask(task, commission) {
  return {
    id: task.id,
    skill: task.skill,
    level: task.level,
    theme: task.theme,
    prompt: task.prompt,
    form: task.form,
    requireFraction: Boolean(task.requireFraction),
    review: Boolean(task.review),
    mixed: Boolean(task.mixed),
    likeIt: Boolean(task.likeIt),
    example: task.example || null,
    placement: Boolean(task.placement),
    fromTeacher: Boolean(task.fromTeacher),
    // steps already shown (after a reload or a pause), never the ones still to come
    ...(task.hintLevel > 0 && !task.answered && !task.placement ? { shownSteps: hintSteps(task) } : {}),
    number: task.placement ? task.placementNumber : commission.done + 1,
    of: task.placement ? null : commission.total,
    // Spanish help, only when the class has it turned on
    ...(task.es ? { es: { prompt: task.es.prompt, example: task.example?.es || null } } : {}),
  };
}

// The hint steps shown so far, in order, so the method builds up on screen one step at a time.
export function hintSteps(task) {
  const out = { level: task.hintLevel, steps: task.hints.slice(0, task.hintLevel) };
  if (task.es) out.es = { steps: task.es.hints.slice(0, task.hintLevel) };
  return out;
}

export function giveHint(task) {
  if (task.answered) return { error: 'task already answered' };
  if (task.placement) return { error: 'hints are off during the skills check. Tap "Not sure yet" to skip it.' };
  task.hintLevel = Math.min(3, task.hintLevel + 1);
  const h = { level: task.hintLevel, text: task.hints[task.hintLevel - 1], ...hintSteps(task) };
  if (task.es) h.es = { text: task.es.hints[task.hintLevel - 1], steps: task.es.hints.slice(0, task.hintLevel) };
  return h;
}

const PRAISE = ['Perfect cut!', 'That fits beautifully.', 'Nailed it.', 'Runway ready.', 'Exactly right.'];
// Spanish, same order. Written so they never depend on the student's gender.
const REVEALED = 'You got there with the last hint. Next time, try it before the last hint to count it as right.';
const REVEALED_ES = 'Llegaste con la última pista. La próxima vez, inténtalo antes de la última pista para que cuente como correcta.';
const PRAISE_ES = ['¡Corte perfecto!', 'Queda precioso.', '¡Lo lograste!', '¡Listo para la pasarela!', '¡Exacto!'];
// After a miss the next step of the method shows on its own, so the words point to it.
const STEP_IN = ['Not quite yet. Here is a step to get you going.', 'Not yet. Try this step, then answer again.'];
const STEP_IN_ES = ['Todavía no. Aquí tienes un paso para empezar.', 'Todavía no. Prueba este paso y vuelve a responder.'];

// Daily log, streak and a once-a-day mastery snapshot for the family progress page.
function touchDay(student, now, tz) {
  const day = dayKey(now, tz);
  const d = (student.daily[day] ??= { answered: 0, correct: 0, commissions: 0, seconds: 0, lastAt: null, wrapShown: false });
  if (!student.snapshots[day]) student.snapshots[day] = { ...student.mastery };
  if (student.streak.lastDay !== day) {
    student.streak = { count: student.streak.lastDay === prevDay(day) ? student.streak.count + 1 : 1, lastDay: day };
  }
  const gap = d.lastAt ? (now - d.lastAt) / 1000 : 60;
  d.seconds += Math.min(Math.max(gap, 0), 180); // count active time only, at most 3 minutes per problem
  d.lastAt = now;
  for (const store of [student.daily, student.snapshots]) {
    const keys = Object.keys(store).sort();
    while (keys.length > 35) delete store[keys.shift()];
  }
  return d;
}

// Today's goal for the student: how many problems so far, and whether it is met.
export function dailyGoal(student, { now = Date.now(), tz = 0 } = {}) {
  const d = student.daily?.[dayKey(now, tz)];
  const answered = d?.answered ?? 0;
  return { goal: DAILY_GOAL, answered, met: Boolean(d?.goalMet) || answered >= DAILY_GOAL };
}

// Days in the last 7 (today included) on which the goal was met.
export function goalDays(student, now = Date.now(), tz = 0) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = student.daily?.[dayKey(now - i * DAY, tz)];
    if (d && (d.goalMet || d.answered >= DAILY_GOAL)) n++;
  }
  return n;
}

export function applyAnswer(student, task, raw, rng, { now = Date.now(), tz = 0 } = {}) {
  if (task.answered) return { error: 'task already answered' };
  if (task.placement) return { error: 'use the skills check to answer this' };
  if (student.currentTaskId !== task.id) return { error: 'not the current task' };
  const c = student.commission;
  if (!c) return { error: 'no active commission' };
  task.attempts += 1;
  const { correct } = gradeAnswer(task, raw);
  const why = correct ? null : diagnose(task, raw);

  if (!correct && task.attempts < MAX_ATTEMPTS) {
    const retry = { correct: false, retry: true, feedback: why || STEP_IN[task.attempts % STEP_IN.length], specific: Boolean(why) };
    if (task.es) retry.es = { feedback: (why && diagnoseEs(task, raw)) || STEP_IN_ES[task.attempts % STEP_IN_ES.length] };
    // Stuck: show the next step of the method right away, so she is not left guessing. It is free
    // (the wrong try already costs a little), and it never goes as far as the last step, which
    // states the answer.
    if (task.hintLevel < 2) {
      task.hintLevel += 1;
      task.freeHints = (task.freeHints || 0) + 1;
      retry.hint = hintSteps(task);
      if (task.es) retry.es.hint = hintSteps(task).es;
    }
    return retry;
  }

  task.answered = true;
  const today = touchDay(student, now, tz); // before mastery changes, so the day's snapshot is a true "before"
  const effective = Math.min(3, task.hintLevel - (task.freeHints || 0) + (task.attempts - 1));
  const aided = effective > 0;
  const revealed = correct && task.hintLevel >= 3; // the last hint states the answer, so typing it in is not counted as getting it right
  const openBefore = new Set(SKILL_IDS.filter((k) => isUnlocked(k, student.mastery))); // to announce only skills this answer opened
  const before = student.mastery[task.skill];
  student.mastery[task.skill] = updateMastery(before, correct, effective, task.level);
  student.wrongStreak[task.skill] = correct ? 0 : (student.wrongStreak[task.skill] || 0) + 1;
  recordResult(student, task.skill, { correct, level: task.level, aided, review: task.review, now });
  student.stats.answered += 1;
  if (correct) student.stats.correct += 1;
  const ss = (student.skillStats[task.skill] ??= { answered: 0, correct: 0 });
  ss.answered += 1;
  if (correct) ss.correct += 1;
  today.answered += 1;
  if (correct) today.correct += 1;
  let goalMet = null;
  if (!today.goalMet && today.answered >= DAILY_GOAL) {
    today.goalMet = true;
    student.thread += DAILY_GOAL_BONUS;
    goalMet = { goal: DAILY_GOAL, bonus: DAILY_GOAL_BONUS, daysThisWeek: goalDays(student, now, tz) };
  }

  const thread = correct ? [5, 4, 3, 2][effective] : 1; // trying always pays something
  const praise = correct ? Math.floor(rng() * PRAISE.length) : 0;
  student.thread += thread;
  c.done += 1;
  if (correct && !revealed) c.correct += 1;
  if (!c.assignment) c.likeIt = !correct || revealed ? { skill: task.skill, level: task.level } : null;

  const result = {
    correct,
    retry: false,
    thread,
    mastery: student.mastery[task.skill],
    skill: task.skill,
    review: Boolean(task.review),
    revealed,
    feedback: revealed ? REVEALED : correct ? PRAISE[praise] : why || 'Good effort. Here is how it works.',
    explanation: correct ? null : task.hints[2],
    steps: correct ? null : task.hints,
    revealedAnswer: correct ? null : task.answerText,
    likeItNext: !c.assignment && (!correct || revealed),
    unlocked: grantUnlocks(student),
    newlyUnlockedSkills: SKILL_IDS.filter((k) => isUnlocked(k, student.mastery) && !openBefore.has(k)),
    commissionComplete: false,
    today: dailyGoal(student, { now, tz }),
    ...(goalMet ? { goalMet } : {}),
  };
  if (task.es) {
    result.es = {
      feedback: revealed ? REVEALED_ES : correct ? PRAISE_ES[praise] : (why && diagnoseEs(task, raw)) || 'Buen esfuerzo. Así se resuelve.',
      explanation: correct ? null : task.es.hints[2],
      steps: correct ? null : task.es.hints,
    };
  }

  if (c.done >= c.total) {
    const gain = Object.keys(student.mastery).reduce((sum, k) => sum + Math.max(0, student.mastery[k] - (c.startMastery?.[k] ?? student.mastery[k])), 0);
    const earned = c.correct >= Math.min(REWARD_MIN_CORRECT, c.total) || gain >= REWARD_MIN_GAIN;
    const bonus = c.correct >= 4 ? 10 : 0;
    student.thread += bonus;
    student.stats.commissions += 1;
    today.commissions += 1;
    result.commissionComplete = true;
    result.bonusThread = bonus;
    result.score = { correct: c.correct, total: c.total };
    if (earned) {
      result.reward = awardReward(student);
      if (!result.reward) {
        result.allCollected = ALL_COLLECTED_THREAD;
        student.thread += ALL_COLLECTED_THREAD;
      }
    } else {
      result.reward = null;
      result.effortThread = 3;
      student.thread += 3;
      result.rewardHint = 'Get 3 right in a commission, or keep improving a skill, to earn a new piece to wear.';
      if (result.es) result.es.rewardHint = 'Acierta 3 en un encargo, o sigue mejorando una habilidad, para ganar una pieza nueva.';
    }
    result.repaired = Boolean(c.repair);
    if (!today.wrapShown && (today.commissions >= SESSION_COMMISSIONS || today.seconds >= SESSION_SECONDS)) {
      today.wrapShown = true;
      result.sessionDone = { streak: student.streak.count, minutes: Math.round(today.seconds / 60), answered: today.answered, correct: today.correct };
    }
    student.commission = null;
    student.currentTaskId = null;
  }
  return result;
}

export function grantUnlocks(student) {
  const got = [];
  for (const item of ITEMS) {
    if (student.unlocks.includes(item.id)) continue;
    if (item.skill && student.mastery[item.skill] >= item.threshold) {
      student.unlocks.push(item.id);
      wearItem(student, item.id); // a new piece goes on right away
      got.push(item);
    }
  }
  return got;
}

// ---------- placement check ----------
// Walks the skill graph from the foundations up. A right answer marks that skill and everything
// under it as known; a wrong answer (confirmed by a second try on skills many others depend on)
// marks it and everything built on it as a gap, so a struggling student answers few questions.
const PLACEMENT_KNOWN = 0.65;
const PLACEMENT_GAP = 0.2;

export function startPlacement(student, { now = Date.now() } = {}) {
  student.placement = { status: 'active', results: {}, misses: {}, asked: 0, taskId: null, startedAt: new Date(now).toISOString(), finishedAt: null };
}

function nextProbe(student) {
  const res = student.placement.results;
  const order = SKILL_IDS.slice().sort((a, b) => depthOf(a) - depthOf(b));
  return order.find((s) => !res[s]) || null;
}

// Returns a stored task for the next probe, or null when the check is finished.
export function placementTask(student, rng, { es = false } = {}) {
  const p = student.placement;
  if (!p || p.status !== 'active') return null;
  const skill = nextProbe(student);
  if (!skill || p.asked >= PLACEMENT_MAX) return null;
  const t = makeTask(skill, 2, chooseTheme(student.interest, rng), rng, { es });
  const task = { id: randomUUID(), studentId: student.id, ...t, placement: true, placementNumber: p.asked + 1, attempts: 0, hintLevel: 0, answered: false };
  p.taskId = task.id;
  return task;
}

export function applyPlacementAnswer(student, task, raw, { skip = false } = {}) {
  const p = student.placement;
  if (!p || p.status !== 'active' || p.taskId !== task.id || task.answered) return { error: 'not the current skills check question' };
  task.answered = true;
  p.asked += 1;
  const correct = !skip && gradeAnswer(task, raw).correct;
  const skill = task.skill;
  if (correct) {
    p.results[skill] = 'known';
    for (const a of ancestorsOf(skill)) p.results[a] ??= 'known';
  } else {
    p.misses[skill] = (p.misses[skill] || 0) + 1;
    const highStakes = descendantsOf(skill).length >= 3;
    if (!(highStakes && !skip && p.misses[skill] < 2)) {
      p.results[skill] = 'gap';
      for (const d of descendantsOf(skill)) p.results[d] ??= 'gap';
    } // otherwise ask that skill once more before calling it a gap
  }
  p.taskId = null;
  return { recorded: true };
}

export function finishPlacement(student, { now = Date.now() } = {}) {
  const p = student.placement;
  for (const [skill, r] of Object.entries(p.results)) {
    if (r === 'known') student.mastery[skill] = Math.max(student.mastery[skill], PLACEMENT_KNOWN);
    else student.mastery[skill] = Math.min(student.mastery[skill], PLACEMENT_GAP);
    student.wrongStreak[skill] = 0;
  }
  p.status = 'done';
  p.finishedAt = new Date(now).toISOString();
  return placementSummary(student);
}

export function placementSummary(student) {
  const res = student.placement?.results || {};
  const strong = SKILL_IDS.filter((s) => res[s] === 'known');
  // what practice will work on first: open skills she did not show she knows, foundations first
  const next = unlockedSkills(student.mastery)
    .filter((s) => res[s] !== 'known' && student.mastery[s] < STRONG_AT)
    .sort((a, b) => depthOf(a) - depthOf(b) || student.mastery[a] - student.mastery[b]);
  return { strong: strong.map((s) => SKILLS[s].name), startingWith: next.slice(0, 3).map((s) => SKILLS[s].name) };
}

// ---------- teacher and family views ----------
// A skill needs support when she has had a fair try (2+ answers) and mastery is still below the
// unlock line, or she has missed 3 in a row. Skills she has not tried yet are never flagged.
export const HELP_BELOW = 0.4;
export const HELP_MIN_ANSWERS = 2;

function needsHelp(s) {
  const out = [];
  for (const k of SKILL_IDS) {
    const n = s.skillStats?.[k]?.answered ?? 0;
    if ((s.wrongStreak[k] || 0) >= 3 || (n >= HELP_MIN_ANSWERS && s.mastery[k] < HELP_BELOW)) out.push(k);
  }
  return out;
}

// A student who has played before but not in this many days shows under "Check in with" for the teacher.
export const QUIET_DAYS = 7;

export function classSummary(students, { now = Date.now(), tz = 0 } = {}) {
  const quietSince = dayKey(now - QUIET_DAYS * DAY, tz);
  return students.map((raw) => {
    const s = normalizeStudent(raw);
    const accuracy = s.stats.answered ? Math.round((100 * s.stats.correct) / s.stats.answered) : null;
    const attempts = {};
    for (const k of SKILL_IDS) attempts[k] = s.skillStats?.[k]?.answered ?? 0;
    const recent = Object.values(s.recent).flat();
    return {
      id: s.id,
      nickname: s.nickname,
      mastery: s.mastery,
      attempts,
      answered: s.stats.answered,
      accuracy,
      recentAccuracy: recent.length ? Math.round((100 * recent.filter((x) => x.c).length) / recent.length) : null,
      commissions: s.stats.commissions,
      placement: s.placement?.status || 'not started',
      streak: s.streak.count,
      topAreas: topInterests(s.interest, 3),
      needsHelpWith: needsHelp(s),
      spanishFirst: s.spanishFirst === true,
      lastActive: lastActive(s),
      goalDaysThisWeek: goalDays(s, now, tz),
      quiet: s.stats.answered > 0 && (lastActive(s) || '') <= quietSince,
      stuckOn: SKILL_IDS.filter((k) => (s.wrongStreak[k] || 0) >= 3),
    };
  });
}

// Last day with any practice. Days are kept for 35 days, so after that it falls back to the last
// answer on any skill.
function lastActive(s) {
  const day = Object.keys(s.daily || {}).sort().pop();
  if (day) return day;
  const last = Object.values(s.lastPracticed || {}).sort().pop();
  return last ? String(last).slice(0, 10) : null;
}

// What a parent or grandparent sees: plain words, no ranking against other students.
export function progressSummary(student, { now = Date.now(), tz = 0 } = {}) {
  const s = normalizeStudent(student);
  const today = dayKey(now, tz);
  const week = [];
  for (let i = 0; i < 7; i++) week.push(dayKey(now - i * DAY, tz));
  const days = week.map((d) => s.daily[d]).filter(Boolean);
  const minutes = Math.round(days.reduce((t, d) => t + d.seconds, 0) / 60);
  const answered = days.reduce((t, d) => t + d.answered, 0);
  const correct = days.reduce((t, d) => t + d.correct, 0);
  // compare with the oldest snapshot in the last 7 days
  const snapDay = Object.keys(s.snapshots).filter((d) => d >= week[6]).sort()[0];
  const then = snapDay ? s.snapshots[snapDay] : null;
  const gains = then
    ? SKILL_IDS.map((k) => ({ k, from: then[k] ?? START_MASTERY, to: s.mastery[k] }))
        .filter((g) => g.to - g.from >= 0.05)
        .sort((a, b) => b.to - b.from - (a.to - a.from))
    : [];
  const strong = SKILL_IDS.filter((k) => s.mastery[k] >= STRONG_AT);
  const help = needsHelp(s);
  const working = unlockedSkills(s.mastery)
    .filter((k) => s.mastery[k] < STRONG_AT && (s.skillStats[k]?.answered ?? 0) > 0 && !help.includes(k))
    .sort((a, b) => (s.lastPracticed[b] || '').localeCompare(s.lastPracticed[a] || ''));
  const pct = (m) => Math.round(m * 100);
  const sk = (k) => ({ id: k, name: SKILLS[k].name, nameEs: SKILL_NAMES_ES[k], percent: pct(s.mastery[k]), standard: SKILLS[k].standard, grade: SKILLS[k].grade });
  return {
    nickname: s.nickname,
    today,
    streak: s.streak.lastDay === today || s.streak.lastDay === prevDay(today) ? s.streak.count : 0,
    thisWeek: { minutes, answered, correct, daysActive: days.length },
    placement: s.placement?.status || 'not started',
    strong: strong.map((k) => SKILLS[k].name),
    strongEs: strong.map((k) => SKILL_NAMES_ES[k]),
    strongStandards: [...new Set(strong.flatMap((k) => SKILLS[k].codes))].sort(),
    workingOn: working.slice(0, 4).map(sk),
    needsHelp: help.map(sk),
    improved: gains.slice(0, 3).map((g) => ({ ...sk(g.k), from: pct(g.from), to: pct(g.to) })),
    lastActive: Object.keys(s.daily).sort().pop() || null,
  };
}

// The weekly report a teacher prints or saves for a student's family. Built when asked from what is
// already kept (the daily log and skill levels); nothing new is stored and nothing is sent anywhere.
export function weeklyReport(student, { now = Date.now(), tz = 0 } = {}) {
  const s = normalizeStudent(student);
  const base = progressSummary(s, { now, tz });
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = dayKey(now - i * DAY, tz);
    const d = s.daily[day];
    days.push({ day, answered: d?.answered ?? 0, correct: d?.correct ?? 0, minutes: d ? Math.round(d.seconds / 60) : 0, goalMet: Boolean(d && (d.goalMet || d.answered >= DAILY_GOAL)) });
  }
  return { ...base, from: days[0].day, to: days[6].day, days, goal: DAILY_GOAL, goalDays: days.filter((d) => d.goalMet).length, spanishFirst: s.spanishFirst === true };
}

export { levelFor };
