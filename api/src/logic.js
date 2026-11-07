// Game rules. Pure functions over a student document, so they are easy to test.
// The server owns grading and rewards; the client never grants anything.
import { randomUUID } from 'node:crypto';
import { SKILL_IDS, makeTask, checkAnswer, storyFor } from './skills.js';
import {
  START_MASTERY,
  levelFor,
  updateMastery,
  pickSkill,
  weakestPrereq,
  chooseTheme,
  recordInterest,
  newInterest,
  topInterests,
} from './adaptive.js';

export const COMMISSION_LENGTH = 5;
export const MAX_ATTEMPTS = 2;
export const PITY_LIMIT = 4; // a Rare or better is guaranteed within this many packs

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

export function newStudent({ id, classCode, nickname }) {
  const mastery = {};
  const wrongStreak = {};
  const skillStats = {};
  for (const s of SKILL_IDS) {
    mastery[s] = START_MASTERY;
    wrongStreak[s] = 0;
    skillStats[s] = { answered: 0, correct: 0 };
  }
  return {
    id,
    classCode,
    nickname,
    createdAt: new Date().toISOString(),
    thread: 0,
    mastery,
    wrongStreak,
    skillStats,
    interest: newInterest(),
    unlocks: ['basic-tee'],
    cards: [],
    packsSinceRare: 0,
    commission: null,
    currentTaskId: null,
    stats: { answered: 0, correct: 0, commissions: 0 },
  };
}

export function publicStudent(s) {
  return {
    nickname: s.nickname,
    classCode: s.classCode,
    thread: s.thread,
    mastery: s.mastery,
    unlocks: s.unlocks.map((id) => ITEMS.find((i) => i.id === id)).filter(Boolean),
    cards: s.cards,
    stats: s.stats,
    favorites: topInterests(s.interest),
    commission: s.commission && {
      id: s.commission.id,
      skill: s.commission.skill,
      theme: s.commission.theme,
      done: s.commission.done,
      total: s.commission.total,
    },
  };
}

export function startCommission(student, { theme, rng }) {
  if (theme) recordInterest(student.interest, themeToArea(theme), 2); // an explicit choice is a strong signal
  const chosenTheme = theme || chooseTheme(student.interest, rng);
  const { skill, repair } = pickSkill(student, rng);
  student.commission = {
    id: randomUUID(),
    skill,
    theme: chosenTheme,
    total: COMMISSION_LENGTH,
    done: 0,
    correct: 0,
    repair,
  };
  if (repair) student.wrongStreak[skill] = 0;
  return { story: storyFor(skill), repair };
}

function themeToArea(theme) {
  return { jewelry: 'jewelry_bench', fabric: 'pattern_table', runway: 'runway' }[theme];
}

// Returns the full task (with answer) for the server to store. Use publicTask() for the client.
export function nextTask(student, rng) {
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
  let level = levelFor(student.mastery[c.skill]);
  if ((student.wrongStreak[c.skill] || 0) >= 3) level = 1; // no prerequisite to fall back on
  const t = makeTask(c.skill, level, c.theme, rng);
  const task = {
    id: randomUUID(),
    studentId: student.id,
    commissionId: c.id,
    ...t,
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
    number: commission.done + 1,
    of: commission.total,
  };
}

export function giveHint(task) {
  if (task.answered) return { error: 'task already answered' };
  task.hintLevel = Math.min(3, task.hintLevel + 1);
  return { level: task.hintLevel, text: task.hints[task.hintLevel - 1] };
}

const PRAISE = ['Perfect cut!', 'That fits beautifully.', 'Nailed it.', 'Runway ready.', 'Exactly right.'];
const ENCOURAGE = ['Close. Take a look at the hint and try again.', 'Not quite yet. You can ask for a hint.'];

export function applyAnswer(student, task, raw, rng) {
  if (task.answered) return { error: 'task already answered' };
  if (student.currentTaskId !== task.id) return { error: 'not the current task' };
  const c = student.commission;
  task.attempts += 1;
  const correct = checkAnswer(task, raw);

  if (!correct && task.attempts < MAX_ATTEMPTS) {
    return { correct: false, retry: true, feedback: ENCOURAGE[task.attempts % ENCOURAGE.length] };
  }

  task.answered = true;
  const effective = Math.min(3, task.hintLevel + (task.attempts - 1));
  student.mastery[task.skill] = updateMastery(student.mastery[task.skill], correct, effective);
  student.wrongStreak[task.skill] = correct ? 0 : (student.wrongStreak[task.skill] || 0) + 1;
  student.stats.answered += 1;
  if (correct) student.stats.correct += 1;
  student.skillStats ??= {};
  const ss = (student.skillStats[task.skill] ??= { answered: 0, correct: 0 });
  ss.answered += 1;
  if (correct) ss.correct += 1;

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
    feedback: correct ? PRAISE[Math.floor(rng() * PRAISE.length)] : 'Good effort. Here is how it works.',
    explanation: correct ? null : task.hints[2],
    revealedAnswer: correct ? null : task.answer,
    unlocked: grantUnlocks(student),
    commissionComplete: false,
  };

  if (c.done >= c.total) {
    const bonus = c.correct >= 4 ? 10 : 0;
    student.thread += bonus;
    student.stats.commissions += 1;
    result.commissionComplete = true;
    result.bonusThread = bonus;
    result.pack = openPack(student, rng);
    result.repaired = Boolean(c.repair);
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
  let r = rng();
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

// A skill needs support when she has had a fair try (2+ answers) and mastery is still below the
// unlock line, or she has missed 3 in a row. Skills she has not tried yet are never flagged.
export const HELP_BELOW = 0.4;
export const HELP_MIN_ANSWERS = 2;

export function classSummary(students) {
  return students.map((s) => {
    const accuracy = s.stats.answered ? Math.round((100 * s.stats.correct) / s.stats.answered) : null;
    const attempts = {};
    const stuck = [];
    for (const k of SKILL_IDS) {
      const n = s.skillStats?.[k]?.answered ?? 0;
      attempts[k] = n;
      if ((s.wrongStreak[k] || 0) >= 3 || (n >= HELP_MIN_ANSWERS && s.mastery[k] < HELP_BELOW)) stuck.push(k);
    }
    return {
      nickname: s.nickname,
      mastery: s.mastery,
      attempts,
      answered: s.stats.answered,
      accuracy,
      commissions: s.stats.commissions,
      topAreas: topInterests(s.interest, 3),
      needsHelpWith: stuck,
    };
  });
}
