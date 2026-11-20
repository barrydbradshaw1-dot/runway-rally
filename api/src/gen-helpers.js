// Small helpers shared by the English problem generators (skills.js) and the Spanish ones (skills.es.js).
// Both files must draw random numbers in exactly the same order, so they share these.

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
export const lcm = (a, b) => (a / gcd(a, b)) * b;
export const money = (cents) => (cents / 100).toFixed(2);
export const neg = (n) => (n < 0 ? `(${n})` : String(n)); // wrap negatives inside expressions: 5 + (-3)
export const say = (theme, byTheme) => byTheme[theme] ?? byTheme.fabric;

// ---------- answer helpers ----------
export const intAns = (v) => ({ answer: v, answerText: String(v), form: 'int' });
export const decAns = (cents) => ({ answer: cents / 100, answerText: money(cents), form: 'decimal' });
export function fracAns(n, d, { requireFraction = false, simplest = false } = {}) {
  const g = gcd(n, d);
  const rn = n / g;
  const rd = d / g;
  return { answer: rn / rd, answerText: rd === 1 ? String(rn) : `${rn}/${rd}`, form: 'fraction', requireFraction, simplest };
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
// US number style (1,500.25) in both languages: Mexico and Central America write numbers the same way,
// and students are answering in US classrooms.
export const commas = (n) => n.toLocaleString('en-US');

export const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
