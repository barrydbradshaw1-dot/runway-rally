// Adaptive engine v2: simple, explainable, rule-based.
// - Skill model: moving average of mastery per skill (0..1). Easy problems can only lift mastery so
//   far, so a run of level-1 wins cannot jump a student to the hardest problems.
// - Difficulty: level from mastery, then steadied by her last few answers so success stays roughly
//   in the 70 to 85% band: two misses in a row step down, and stepping up needs two clean wins.
// - Spaced review: a missed skill comes back after 1 day, a newly strong skill after 3 days, then
//   7 and 21 days. Skills left alone for two weeks fade a little and come back for review.
// - Repair: repeated failure steps back to the weakest prerequisite.
// - Interest model: weights per game area and fashion theme.
import { SKILLS, SKILL_IDS, THEMES } from './skills.js';

export const START_MASTERY = 0.3;
export const UNLOCK_PREREQ_AT = 0.4;
export const STRONG_AT = 0.7;
const DAY = 86_400_000;
export const REVIEW_DAYS = [1, 3, 7, 21];
export const LEVEL_CAP = [0.6, 0.85, 1]; // the most mastery a correct answer at each level can show
export const FADE_AFTER_DAYS = 14;
export const FADE_FLOOR = 0.45; // fading never locks a skill again

export function levelFor(mastery) {
  if (mastery < 0.4) return 1;
  if (mastery < 0.7) return 2;
  return 3;
}

// effectiveHints: 0 = no help, up to 3 = full walkthrough or second attempt. level: 1..3.
// A correct answer never lowers mastery; it just cannot lift it past what that level shows.
export function updateMastery(m, correct, effectiveHints, level = 2) {
  const credit = [1, 0.8, 0.6, 0.4][Math.min(3, Math.max(0, effectiveHints))];
  const cap = LEVEL_CAP[Math.min(3, Math.max(1, level)) - 1];
  const target = correct ? Math.min(cap, credit) : 0;
  let next = m + 0.2 * (target - m);
  if (correct && next < m) next = m;
  return Math.min(1, Math.max(0, Math.round(next * 1000) / 1000));
}

export function isUnlocked(skill, mastery) {
  return SKILLS[skill].prereq.every((p) => (mastery[p] ?? 0) >= UNLOCK_PREREQ_AT);
}

export function unlockedSkills(mastery) {
  return SKILL_IDS.filter((s) => isUnlocked(s, mastery));
}

export function weakestPrereq(skill, mastery) {
  const pre = SKILLS[skill].prereq;
  if (!pre.length) return null;
  return pre.slice().sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0))[0];
}

// Level for the next problem, from mastery and her recent answers on this skill.
export function chooseLevel(student, skill) {
  const base = levelFor(student.mastery[skill] ?? START_MASTERY);
  const r = student.recent?.[skill] || [];
  if (!r.length) return base;
  const last = r[r.length - 1].lvl;
  const last2 = r.slice(-2);
  const last6 = r.slice(-6);
  if (last6.length >= 4 && last6.filter((x) => x.c).length / last6.length < 0.5) return 1; // struggling: rebuild confidence
  if (last2.length === 2 && last2.every((x) => !x.c)) return Math.max(1, Math.min(base, last - 1));
  if (base > last) {
    const ready = last2.length === 2 && last2.every((x) => x.c && !x.aided && x.lvl === last);
    return ready ? last + 1 : last;
  }
  return base;
}

// Called once per finished problem (after any retry).
export function recordResult(student, skill, { correct, level, aided, review = false, now = Date.now() }) {
  student.recent ??= {};
  student.review ??= {};
  student.lastPracticed ??= {};
  const r = (student.recent[skill] ??= []);
  r.push({ c: correct, lvl: level, aided });
  if (r.length > 8) r.shift();
  student.lastPracticed[skill] = new Date(now).toISOString();

  const rv = student.review[skill];
  if (!correct) {
    student.review[skill] = { due: now + REVIEW_DAYS[0] * DAY, step: 0 };
  } else if (review && rv && !aided) {
    const step = rv.step + 1;
    student.review[skill] = step >= REVIEW_DAYS.length ? { due: null, step } : { due: now + REVIEW_DAYS[step] * DAY, step };
  } else if (!rv && (student.mastery[skill] ?? 0) >= STRONG_AT) {
    student.review[skill] = { due: now + REVIEW_DAYS[1] * DAY, step: 1 };
  }
}

export function dueReviews(student, now = Date.now()) {
  return Object.entries(student.review || {})
    .filter(([s, v]) => v.due !== null && v.due <= now && SKILLS[s] && isUnlocked(s, student.mastery))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([s]) => s);
}

// A skill left alone for two weeks fades a little (once per idle stretch) and is queued for review.
export function applyFade(student, now = Date.now()) {
  student.faded ??= {};
  student.review ??= {};
  const faded = [];
  for (const [skill, at] of Object.entries(student.lastPracticed || {})) {
    if (!SKILLS[skill]) continue;
    const idle = (now - Date.parse(at)) / DAY;
    if (idle < FADE_AFTER_DAYS || student.faded[skill] === at) continue;
    student.faded[skill] = at;
    const m = student.mastery[skill];
    if (m > FADE_FLOOR) student.mastery[skill] = Math.max(FADE_FLOOR, Math.round((m - 0.1) * 1000) / 1000);
    student.review[skill] = { due: now, step: Math.max(0, (student.review[skill]?.step ?? 1) - 1) };
    faded.push(skill);
  }
  return faded;
}

export function pickSkill(student, rng) {
  const { mastery, wrongStreak } = student;
  const stuck = SKILL_IDS.find((s) => (wrongStreak[s] || 0) >= 3 && isUnlocked(s, mastery));
  if (stuck) {
    const pre = weakestPrereq(stuck, mastery);
    return { skill: pre || stuck, repair: Boolean(pre) };
  }
  const open = unlockedSkills(mastery);
  const learning = open.filter((s) => mastery[s] < 0.85);
  const pool = learning.length ? learning : open;
  if (rng() < 0.6) {
    const weakest = pool.slice().sort((a, b) => mastery[a] - mastery[b])[0];
    return { skill: weakest, repair: false };
  }
  return { skill: pool[Math.floor(rng() * pool.length)], repair: false };
}

export const AREA_TO_THEME = {
  jewelry_bench: 'jewelry',
  pattern_table: 'fabric',
  runway: 'runway',
};

export function newInterest() {
  return { areas: {}, themes: {} };
}

export function recordInterest(interest, area, weight = 1) {
  if (typeof area !== 'string' || !/^[a-z_]{1,24}$/.test(area)) return;
  interest.areas[area] = (interest.areas[area] || 0) + weight;
  const theme = AREA_TO_THEME[area];
  if (theme) interest.themes[theme] = (interest.themes[theme] || 0) + weight;
}

// Mostly follow the strongest interest, with 20% exploration so new interests can surface.
export function chooseTheme(interest, rng) {
  const entries = THEMES.map((t) => [t, interest.themes[t] || 0]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total === 0 || rng() < 0.2) return THEMES[Math.floor(rng() * THEMES.length)];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function topInterests(interest, n = 2) {
  return Object.entries(interest.areas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([area]) => area);
}
