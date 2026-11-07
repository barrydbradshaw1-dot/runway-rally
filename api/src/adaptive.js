// Adaptive engine v1: simple, explainable, rule-based.
// - Skill model: exponential moving average of mastery per skill (0..1).
// - Difficulty: level from mastery so success stays in the productive band.
// - Interest model: weights per game area and fashion theme.
// - Repair: repeated failure steps back to the weakest prerequisite.
import { SKILLS, SKILL_IDS, THEMES } from './skills.js';

export const START_MASTERY = 0.3;
export const UNLOCK_PREREQ_AT = 0.4;

export function levelFor(mastery) {
  if (mastery < 0.4) return 1;
  if (mastery < 0.7) return 2;
  return 3;
}

// effectiveHints: 0 = no help, up to 3 = full walkthrough or second attempt
export function updateMastery(m, correct, effectiveHints) {
  const credit = [1, 0.8, 0.6, 0.4][Math.min(3, Math.max(0, effectiveHints))];
  const target = correct ? credit : 0;
  const next = m + 0.2 * (target - m);
  return Math.min(1, Math.max(0, Math.round(next * 1000) / 1000));
}

export function isUnlocked(skill, mastery) {
  return SKILLS[skill].prereq.every((p) => (mastery[p] ?? 0) >= UNLOCK_PREREQ_AT);
}

export function weakestPrereq(skill, mastery) {
  const pre = SKILLS[skill].prereq;
  if (!pre.length) return null;
  return pre.slice().sort((a, b) => mastery[a] - mastery[b])[0];
}

export function pickSkill(student, rng) {
  const { mastery, wrongStreak } = student;
  const stuck = SKILL_IDS.find((s) => (wrongStreak[s] || 0) >= 3 && isUnlocked(s, mastery));
  if (stuck) {
    const pre = weakestPrereq(stuck, mastery);
    return { skill: pre || stuck, repair: Boolean(pre) };
  }
  const open = SKILL_IDS.filter((s) => isUnlocked(s, mastery));
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
