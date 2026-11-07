// Skill graph and parameterized problem generators.
// Every task is generated from a template, so retries are fresh variants and
// answers are checked on the server. Fashion context is a skin over the math.

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export const THEMES = ['jewelry', 'fabric', 'runway'];

export const SKILLS = {
  frac_part: { name: 'Fractions of a length', prereq: [] },
  ratio: { name: 'Ratios', prereq: [] },
  frac_add: { name: 'Adding fractions', prereq: ['frac_part'] },
  percent: { name: 'Percent and discounts', prereq: ['ratio', 'frac_part'] },
};
export const SKILL_IDS = Object.keys(SKILLS);

const STORIES = {
  frac_part: 'A client needs exact cuts so every piece fits.',
  ratio: 'A client wants a pattern repeated at the perfect balance.',
  frac_add: 'A client wants a mix of colors in a new collection.',
  percent: 'The boutique is planning its seasonal sale.',
};
export const storyFor = (skill) => STORIES[skill];

// level 1..3
function fracPart(level, theme, rng) {
  const d = pick(rng, [[2, 4, 5], [3, 6, 8], [8, 10, 12]][level - 1]);
  const n = int(rng, 1, d - 1);
  const k = int(rng, 2, 4 + level * 3);
  const L = d * k;
  const prompt =
    theme === 'jewelry'
      ? `A chain is ${L} cm long. The clasp section uses ${n}/${d} of it. How many cm is the clasp section?`
      : `A roll of ribbon is ${L} cm long. A trim uses ${n}/${d} of it. How many cm of trim is that?`;
  return {
    prompt,
    answer: n * k,
    hints: [
      'Split the length into equal parts. The bottom number of the fraction tells you how many parts.',
      `Divide ${L} by ${d} to find the size of one part: ${L} ÷ ${d} = ${k}.`,
      `One part is ${k} cm and you need ${n} of them: ${n} × ${k} = ${n * k}.`,
    ],
  };
}

function fracAdd(level, theme, rng) {
  const d = pick(rng, [[3, 4, 5], [6, 8, 10], [12, 15, 20]][level - 1]);
  const n1 = int(rng, 1, d - 2);
  const n2 = int(rng, 1, d - 1 - n1);
  const k = int(rng, 2, 4 + level * 2);
  const L = d * k;
  const prompt =
    theme === 'jewelry'
      ? `A necklace has ${L} beads. ${n1}/${d} of them are pearls and ${n2}/${d} are crystals. How many beads are pearls or crystals?`
      : `A scarf pattern has ${L} stripes. ${n1}/${d} are gold and ${n2}/${d} are silver. How many stripes are gold or silver?`;
  return {
    prompt,
    answer: k * (n1 + n2),
    hints: [
      'The fractions share the same bottom number, so you can add the top numbers.',
      `${n1}/${d} + ${n2}/${d} = ${n1 + n2}/${d}. Now find ${n1 + n2}/${d} of ${L}.`,
      `One part is ${L} ÷ ${d} = ${k}. Then ${n1 + n2} × ${k} = ${k * (n1 + n2)}.`,
    ],
  };
}

function ratio(level, theme, rng) {
  const [aLo, aHi, bLo, bHi, kHi] = [
    [1, 3, 2, 4, 5],
    [2, 5, 3, 7, 8],
    [3, 8, 4, 9, 9],
  ][level - 1];
  const a = int(rng, aLo, aHi);
  let b = int(rng, bLo, bHi);
  if (b === a) b += 1;
  const k = int(rng, 2, kHi);
  const prompt =
    theme === 'jewelry'
      ? `A bracelet pattern uses ${a} gold beads for every ${b} silver beads. You use ${a * k} gold beads. How many silver beads do you need?`
      : `A dye mix needs ${a} drops of rose for every ${b} drops of gold. You use ${a * k} drops of rose. How many drops of gold?`;
  return {
    prompt,
    answer: k * b,
    hints: [
      'Figure out how many times the basic pattern repeats.',
      `${a * k} ÷ ${a} = ${k}, so the pattern repeats ${k} times.`,
      `Each repeat needs ${b} of the second item: ${k} × ${b} = ${k * b}.`,
    ],
  };
}

function percent(level, theme, rng) {
  const pcts = [[10, 20, 25, 50], [15, 30, 35, 45], [12, 18, 24, 36]][level - 1];
  const pct = pick(rng, pcts);
  const P = level === 1 ? 20 * int(rng, 2, 10) : level === 2 ? 20 * int(rng, 3, 15) : 50 * int(rng, 2, 8);
  const disc = (P * pct) / 100;
  const prompt =
    theme === 'jewelry'
      ? `A pendant costs $${P}. It is ${pct}% off today. What is the sale price in dollars?`
      : `A silk scarf costs $${P}. The tag says ${pct}% off. What is the sale price in dollars?`;
  return {
    prompt,
    answer: P - disc,
    hints: [
      'Find the discount first. A percent is a part out of 100.',
      `${pct}% of ${P} is ${pct}/100 × ${P} = ${disc}.`,
      `Subtract the discount from the price: ${P} − ${disc} = ${P - disc}.`,
    ],
  };
}

const GENERATORS = { frac_part: fracPart, frac_add: fracAdd, ratio, percent };

export function makeTask(skill, level, theme, rng) {
  const gen = GENERATORS[skill];
  if (!gen) throw new Error('unknown skill ' + skill);
  const lvl = Math.min(3, Math.max(1, level));
  return { skill, level: lvl, theme, ...gen(lvl, theme, rng) };
}

export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== 'string') return NaN;
  const s = raw.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function checkAnswer(task, raw) {
  const n = parseNumber(raw);
  return Number.isFinite(n) && Math.abs(n - task.answer) < 1e-9;
}
