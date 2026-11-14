// Game rules. Pure functions over a student document, so they are easy to test.
// The server owns grading and rewards; the client never grants anything.
import { randomUUID } from 'node:crypto';
import { SKILLS, SKILL_IDS, makeTask, makeExample, gradeAnswer, diagnose, storyFor, depthOf, ancestorsOf, descendantsOf } from './skills.js';
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

export const COMMISSION_LENGTH = 5;
export const MAX_ATTEMPTS = 2;
export const PITY_LIMIT = 4; // a Rare or better is guaranteed within this many packs
export const PACK_MIN_CORRECT = 3; // a pack needs 3 of 5 right...
export const PACK_MIN_GAIN = 0.08; // ...or clear progress on the skill
export const REVIEW_SLOTS = [2, 4]; // 3rd and 5th problems can be review from another skill
export const SESSION_COMMISSIONS = 3;
export const SESSION_SECONDS = 20 * 60;
export const PLACEMENT_MAX = 18;
const DAY = 86_400_000;

export const ITEMS = [
  { id: 'basic-tee', name: 'Studio Tee', slot: 'top', skill: null, threshold: 0 },
  { id: 'fraction-jacket', name: 'Fraction Jacket', slot: 'outer', skill: 'frac_part', threshold: 0.5 },
  { id: 'gala-gown', name: 'Gala Gown', slot: 'dress', skill: 'frac_add', threshold: 0.5 },
  { id: 'ratio-pearls', name: 'Ratio Pearl Set', slot: 'jewelry', skill: 'ratio', threshold: 0.5 },
  { id: 'sale-scarf', name: 'Sale-Day Scarf', slot: 'accessory', skill: 'percent', threshold: 0.5 },
  { id: 'couture-cape', name: 'Couture Cape', slot: 'outer', skill: 'frac_part', threshold: 0.8 },
  { id: 'crystal-crown', name: 'Crystal Crown', slot: 'jewelry', skill: 'ratio', threshold: 0.8 },
];

export const CARDS = [
  { id: 'muse-mira', name: 'Mira, Gala Client', type: 'muse', rarity: 'common' },
  { id: 'muse-juno', name: 'Juno, Street Stylist', type: 'muse', rarity: 'common' },
  { id: 'fabric-silk', name: 'Moonsilk', type: 'fabric', rarity: 'common' },
  { id: 'gem-opal', name: 'Aurora Opal', type: 'gem', rarity: 'common' },
  { id: 'skill-hint', name: 'Extra Hint Charm', type: 'skill', rarity: 'rare' },
  { id: 'style-neon', name: 'Neon Street Look', type: 'style', rarity: 'rare' },
  { id: 'muse-professor', name: 'Headmistress Hana', type: 'muse', rarity: 'epic' },
  { id: 'spot-crown', name: 'Spotlight: Starlit Crown', type: 'spotlight', rarity: 'legendary' },
];

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
  s.cards ??= [];
  s.packsSinceRare ??= 0;
  s.commission ??= null;
  s.currentTaskId ??= null;
  s.stats ??= { answered: 0, correct: 0, commissions: 0 };
  s.recent ??= {};
  s.review ??= {};
  s.lastPracticed ??= {};
  s.faded ??= {};
  s.examplesSeen ??= [];
  s.placement ??= null;
  s.daily ??= {};
  s.snapshots ??= {};
  s.streak ??= { count: 0, lastDay: null };
  return s;
}

export function publicStudent(s) {
  return {
    nickname: s.nickname,
    classCode: s.classCode,
    thread: s.thread,
    mastery: s.mastery,
    unlockedSkills: unlockedSkills(s.mastery),
    unlocks: s.unlocks.map((id) => ITEMS.find((i) => i.id === id)).filter(Boolean),
    cards: s.cards,
    stats: s.stats,
    streak: s.streak.count,
    favorites: topInterests(s.interest),
    placement: s.placement ? { status: s.placement.status, asked: s.placement.asked } : null,
    reviewsDue: dueReviews(s).length,
    commission: s.commission && {
      id: s.commission.id,
      skill: s.commission.skill,
      theme: s.commission.theme,
      done: s.commission.done,
      total: s.commission.total,
    },
  };
}

function themeToArea(theme) {
  return { jewelry: 'jewelry_bench', fabric: 'pattern_table', runway: 'runway' }[theme];
}

export function startCommission(student, { theme, rng, now = Date.now() }) {
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
  return { story: storyFor(skill), repair };
}

// Returns the full task (with answer) for the server to store. Use publicTask() for the client.
export function nextTask(student, rng, { now = Date.now() } = {}) {
  const c = student.commission;
  if (!c) throw new Error('no active commission');
  // Mid-commission repair: repeated failure steps back to the weakest prerequisite.
  if ((student.wrongStreak[c.skill] || 0) >= 3) {
    const pre = weakestPrereq(c.skill, student.mastery);
    if (pre) {
      student.wrongStreak[c.skill] = 0;
      c.skill = pre;
      c.repair = true;
    }
  }
  // Interleaving: some slots bring back a different skill that is due for review.
  let skill = c.skill;
  let review = false;
  if (REVIEW_SLOTS.includes(c.done) && !c.repair) {
    const due = dueReviews(student, now).filter((s) => s !== c.skill);
    if (due.length) {
      skill = due[0];
      review = true;
    }
  } else if (dueReviews(student, now).includes(skill)) {
    review = true;
  }
  let level = chooseLevel(student, skill);
  if ((student.wrongStreak[skill] || 0) >= 3) level = 1; // no prerequisite to fall back on
  const t = makeTask(skill, level, c.theme, rng);
  const key = `${skill}:${t.level}`;
  let example = null;
  if (!student.examplesSeen.includes(key)) {
    example = makeExample(skill, t.level, c.theme, rng);
    student.examplesSeen.push(key);
  }
  const task = {
    id: randomUUID(),
    studentId: student.id,
    commissionId: c.id,
    ...t,
    review,
    example,
    attempts: 0,
    hintLevel: 0,
    answered: false,
  };
  student.currentTaskId = task.id;
  return task;
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
    example: task.example || null,
    placement: Boolean(task.placement),
    number: task.placement ? task.placementNumber : commission.done + 1,
    of: task.placement ? null : commission.total,
  };
}

export function giveHint(task) {
  if (task.answered) return { error: 'task already answered' };
  if (task.placement) return { error: 'hints are off during the skills check. Tap "Not sure yet" to skip it.' };
  task.hintLevel = Math.min(3, task.hintLevel + 1);
  return { level: task.hintLevel, text: task.hints[task.hintLevel - 1] };
}

const PRAISE = ['Perfect cut!', 'That fits beautifully.', 'Nailed it.', 'Runway ready.', 'Exactly right.'];
const ENCOURAGE = ['Not quite yet. Try once more, or tap Hint.', 'Not yet. A hint can help, then try again.'];

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
    return { correct: false, retry: true, feedback: why || ENCOURAGE[task.attempts % ENCOURAGE.length], specific: Boolean(why) };
  }

  task.answered = true;
  const today = touchDay(student, now, tz); // before mastery changes, so the day's snapshot is a true "before"
  const effective = Math.min(3, task.hintLevel + (task.attempts - 1));
  const aided = effective > 0;
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

  const thread = correct ? [5, 4, 3, 2][effective] : 1; // trying always pays something
  student.thread += thread;
  c.done += 1;
  if (correct) c.correct += 1;

  const result = {
    correct,
    retry: false,
    thread,
    mastery: student.mastery[task.skill],
    skill: task.skill,
    review: Boolean(task.review),
    feedback: correct ? PRAISE[Math.floor(rng() * PRAISE.length)] : why || 'Good effort. Here is how it works.',
    explanation: correct ? null : task.hints[2],
    steps: correct ? null : task.hints,
    revealedAnswer: correct ? null : task.answerText,
    unlocked: grantUnlocks(student),
    newlyUnlockedSkills: SKILL_IDS.filter((k) => isUnlocked(k, student.mastery) && !isUnlocked(k, c.startMastery || {})),
    commissionComplete: false,
  };

  if (c.done >= c.total) {
    const gain = Object.keys(student.mastery).reduce((sum, k) => sum + Math.max(0, student.mastery[k] - (c.startMastery?.[k] ?? student.mastery[k])), 0);
    const earned = c.correct >= PACK_MIN_CORRECT || gain >= PACK_MIN_GAIN;
    const bonus = c.correct >= 4 ? 10 : 0;
    student.thread += bonus;
    student.stats.commissions += 1;
    today.commissions += 1;
    result.commissionComplete = true;
    result.bonusThread = bonus;
    result.score = { correct: c.correct, total: c.total };
    if (earned) {
      result.pack = openPack(student, rng);
    } else {
      result.pack = null;
      result.effortThread = 3;
      student.thread += 3;
      result.packHint = 'Get 3 right in a commission, or keep improving a skill, to earn a card pack.';
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
      got.push(item);
    }
  }
  return got;
}

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

export function openPack(student, rng) {
  const r = rng();
  let rarity = r < 0.7 ? 'common' : r < 0.92 ? 'rare' : r < 0.99 ? 'epic' : 'legendary';
  if (student.packsSinceRare >= PITY_LIMIT && rarity === 'common') rarity = 'rare';
  student.packsSinceRare = RARITY_ORDER.indexOf(rarity) >= 1 ? 0 : student.packsSinceRare + 1;
  const pool = CARDS.filter((c) => c.rarity === rarity);
  const card = pool[Math.floor(rng() * pool.length)];
  const duplicate = student.cards.includes(card.id);
  if (duplicate) student.thread += 3; // duplicates convert to Thread so nothing is wasted
  else student.cards.push(card.id);
  return { card, duplicate, threadFromDuplicate: duplicate ? 3 : 0 };
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
export function placementTask(student, rng) {
  const p = student.placement;
  if (!p || p.status !== 'active') return null;
  const skill = nextProbe(student);
  if (!skill || p.asked >= PLACEMENT_MAX) return null;
  const t = makeTask(skill, 2, chooseTheme(student.interest, rng), rng);
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

export function classSummary(students) {
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
    };
  });
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
  return {
    nickname: s.nickname,
    today,
    streak: s.streak.lastDay === today || s.streak.lastDay === prevDay(today) ? s.streak.count : 0,
    thisWeek: { minutes, answered, correct, daysActive: days.length },
    placement: s.placement?.status || 'not started',
    strong: strong.map((k) => SKILLS[k].name),
    strongStandards: [...new Set(strong.flatMap((k) => SKILLS[k].codes))].sort(),
    workingOn: working.slice(0, 4).map((k) => ({ name: SKILLS[k].name, percent: pct(s.mastery[k]), standard: SKILLS[k].standard, grade: SKILLS[k].grade })),
    needsHelp: help.map((k) => ({ name: SKILLS[k].name, percent: pct(s.mastery[k]), standard: SKILLS[k].standard, grade: SKILLS[k].grade })),
    improved: gains.slice(0, 3).map((g) => ({ name: SKILLS[g.k].name, from: pct(g.from), to: pct(g.to), standard: SKILLS[g.k].standard })),
    lastActive: Object.keys(s.daily).sort().pop() || null,
  };
}

export { levelFor };
