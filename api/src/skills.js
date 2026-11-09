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

// gse = the Georgia Standards of Excellence strand each skill practices (grades 5-7).
// Codes use the standard domain.cluster.number form. Districts should confirm against their current GSE revision.
export const SKILLS = {
  frac_part: { name: 'Fractions of a length', prereq: [], gse: '5.NF.4' },
  ratio: { name: 'Ratios', prereq: [], gse: '6.RP.3' },
  frac_add: { name: 'Adding fractions', prereq: ['frac_part'], gse: '5.NF.1' },
  percent: { name: 'Percent and discounts', prereq: ['ratio', 'frac_part'], gse: '6.RP.3c' },
  unit_rate: { name: 'Unit rates', prereq: ['ratio'], gse: '6.RP.2' },
  scale: { name: 'Scale patterns', prereq: ['unit_rate'], gse: '7.RP.2' },
  markup: { name: 'Markup, tax and sales', prereq: ['percent'], gse: '7.RP.3' },
  integers: { name: 'Profit and loss', prereq: [], gse: '7.NS.1' },
  equations: { name: 'Budget equations', prereq: ['unit_rate'], gse: '7.EE.4a' },
};
export const SKILL_IDS = Object.keys(SKILLS);

const STORIES = {
  frac_part: 'Brief from Mira: "Exact cuts only. If the pieces do not fit, the whole look falls apart."',
  ratio: 'Brief from Juno: "I want this pattern repeated at the perfect balance. Not one bead off."',
  frac_add: 'Brief from Mira: "Mix the colors for the new drop. Show me you can split it right."',
  percent: 'Brief from the boutique: "Sale week is here. Price every piece before doors open."',
  unit_rate: 'Brief from Hana: "Suppliers quote bulk prices. Find the price for one so we can compare deals."',
  scale: 'Brief from Hana: "The pattern is drawn small. Scale it up to the real garment."',
  markup: 'Brief from the boutique: "Set the price tags. Cost, markup, tax, then the sale."',
  integers: 'Brief from the boutique: "Some weeks are red, some are green. Work out where the books land."',
  equations: 'Brief from Hana: "You have a budget. Figure out exactly how much you can make."',
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
      ? `A chain is ${L} inches long. The clasp section uses ${n}/${d} of it. How many inches is the clasp section?`
      : `A roll of ribbon is ${L} inches long. A trim uses ${n}/${d} of it. How many inches of trim is that?`;
  return {
    prompt,
    math: `${n}/${d} of ${L} inches = ?`,
    plain: `Cut ${L} inches into ${d} equal pieces. Take ${n} of those pieces.`,
    model: { kind: 'part', total: L, parts: d, take: n, unit: 'inches' },
    wrong: [k, L - n * k, n * k + k, n + k],
    answer: n * k,
    hints: [
      'Split the length into equal parts. The bottom number of the fraction tells you how many parts.',
      `Divide ${L} by ${d} to find the size of one part: ${L} ÷ ${d} = ${k}.`,
      `One part is ${k} inches and you need ${n} of them: ${n} × ${k} = ${n * k}.`,
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
    math: `(${n1}/${d} + ${n2}/${d}) of ${L} ${theme === 'jewelry' ? 'beads' : 'stripes'} = ?`,
    plain: `Cut ${L} ${theme === 'jewelry' ? 'beads' : 'stripes'} into ${d} equal groups. Take ${n1} groups, then ${n2} more groups.`,
    model: { kind: 'add', total: L, parts: d, take: [n1, n2], unit: theme === 'jewelry' ? 'beads' : 'stripes' },
    wrong: [k * n1, k * (n1 + n2) + k, L - k * (n1 + n2), k * n1 + n2],
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
    math: `${a} : ${b} = ${a * k} : ?`,
    plain: `The pattern is ${a} ${theme === 'jewelry' ? 'gold' : 'rose'} for every ${b} ${theme === 'jewelry' ? 'silver' : 'gold'}. How many times does the pattern repeat to reach ${a * k}?`,
    model: { kind: 'ratio', a, b, given: a * k, left: theme === 'jewelry' ? 'gold beads' : 'rose drops', right: theme === 'jewelry' ? 'silver beads' : 'gold drops' },
    wrong: [a * k + (b - a), k * b + b, k * b - b, b * 2],
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
    math: `$${P} − (${pct}% of $${P}) = ?`,
    plain: `Find ${pct}% of $${P}. That is the discount. Take it off the price.`,
    model: { kind: 'percent', price: P, pct },
    wrong: [disc, P - pct, P + disc, P - disc / 2],
    answer: P - disc,
    hints: [
      'Find the discount first. A percent is a part out of 100.',
      `${pct}% of ${P} is ${pct}/100 × ${P} = ${disc}.`,
      `Subtract the discount from the price: ${P} − ${disc} = ${P - disc}.`,
    ],
  };
}


const UNIT_NOUN = {
  jewelry: { one: 'foot', many: 'feet', mat: 'Sterling chain' },
  fabric: { one: 'yard', many: 'yards', mat: 'Silk' },
  runway: { one: 'yard', many: 'yards', mat: 'Satin ribbon' },
};

function unitRate(level, theme, rng) {
  const u = UNIT_NOUN[theme] || UNIT_NOUN.fabric;
  const r = int(rng, 3, 8 + level * 2);
  const y = int(rng, 2, 6);
  const C = r * y;
  if (level === 1) {
    return {
      prompt: `${y} ${u.many} of ${u.mat.toLowerCase()} cost $${C}. What is the price for 1 ${u.one}?`,
      math: `$${C} ÷ ${y} ${u.many} = $? per ${u.one}`,
      plain: `Share the $${C} evenly across ${y} ${u.many}. How much does each ${u.one} cost?`,
      model: { kind: 'table', head: [u.many, 'dollars'], rows: [[String(y), `$${C}`], ['1', '$?']], note: `÷ ${y} on both sides` },
      steps: [`Divide the cost by the length: $${C} ÷ ${y} = $?`, `So 1 ${u.one} costs $? .`],
      wrong: [C - y, y, C, r + y],
      answer: r,
      hints: ['A unit rate is the price for exactly 1. Divide the total cost by how many you bought.', `$${C} ÷ ${y} gives the cost for one ${u.one}.`, `${C} ÷ ${y} = ${r}, so 1 ${u.one} costs $${r}.`],
    };
  }
  if (level === 2) {
    const n = int(rng, 3, 9);
    return {
      prompt: `${u.mat} costs $${r} per ${u.one}. How much do ${n} ${u.many} cost?`,
      math: `$${r} × ${n} ${u.many} = $?`,
      plain: `Each ${u.one} costs $${r}. You need ${n} of them, so add $${r} up ${n} times.`,
      model: { kind: 'table', head: [u.many, 'dollars'], rows: [['1', `$${r}`], [String(n), '$?']], note: `× ${n} on both sides` },
      steps: [`Multiply the price for 1 by how many you need: $${r} × ${n} = $?`],
      wrong: [r + n, r * n - r, r * n + r, n],
      answer: r * n,
      hints: ['A rate tells you the price of one. For more, multiply.', `${n} ${u.many} at $${r} each: ${n} × ${r}.`, `${n} × ${r} = ${r * n}, so the cost is $${r * n}.`],
    };
  }
  let n = int(rng, 7, 12);
  if (n === y) n += 1;
  return {
    prompt: `${y} ${u.many} of ${u.mat.toLowerCase()} cost $${C}. At that rate, how much do ${n} ${u.many} cost?`,
    math: `$${C} for ${y} ${u.many}, so ${n} ${u.many} = $?`,
    plain: `First find the price of 1 ${u.one}. Then scale it up to ${n} ${u.many}.`,
    model: { kind: 'table', head: [u.many, 'dollars'], rows: [[String(y), `$${C}`], ['1', '$?'], [String(n), '$?']], note: 'find 1 first' },
    steps: [`Price for 1 ${u.one}: $${C} ÷ ${y} = $?`, `Price for ${n} ${u.many}: ${n} × $? = $?`],
    wrong: [C + (n - y), r + n, r * n - r, C * n],
    answer: r * n,
    hints: ['Two steps: find the price of 1 first, then multiply for the amount you need.', `$${C} ÷ ${y} = $${r} for one ${u.one}. Now multiply by ${n}.`, `${n} × ${r} = ${r * n}, so ${n} ${u.many} cost $${r * n}.`],
  };
}

function scale(level, theme, rng) {
  if (level === 1) {
    const s = int(rng, 2, 8), p = int(rng, 2, 9);
    return {
      prompt: `Your pattern is drawn at a scale where 1 inch on paper = ${s} inches on the real garment. A sleeve is ${p} inches on paper. How long is the real sleeve?`,
      math: `1 : ${s} = ${p} : ?`,
      plain: `Every 1 inch on paper becomes ${s} inches on the garment. The sleeve is ${p} paper inches, so multiply.`,
      model: { kind: 'table', head: ['on paper (in)', 'real garment (in)'], rows: [['1', String(s)], [String(p), '?']], note: `× ${p}` },
      steps: [`The sleeve is ${p} inches on paper and each inch is ${s} real inches.`, `${p} × ${s} = ? inches.`],
      wrong: [p + s, s, p * s - s, p * s + p],
      answer: s * p,
      hints: ['Scale tells you how many real inches each paper inch stands for.', `Each paper inch = ${s} real inches. Multiply ${p} × ${s}.`, `${p} × ${s} = ${s * p}, so the real sleeve is ${s * p} inches.`],
    };
  }
  if (level === 2) {
    const a = pick(rng, [2, 3, 4]), s = int(rng, 3, 7), m = int(rng, 2, 5);
    const b = a * s;
    return {
      prompt: `On a pattern, ${a} inches on paper = ${b} inches on the garment. A hem is ${a * m} inches on paper. How long is the real hem?`,
      math: `${a} : ${b} = ${a * m} : ?`,
      plain: `The paper length grew by the same number of times the pattern repeats. How many times does ${a} fit into ${a * m}?`,
      model: { kind: 'table', head: ['on paper (in)', 'real garment (in)'], rows: [[String(a), String(b)], [String(a * m), '?']], note: `× ? on both sides` },
      steps: [`How many times does ${a} fit in ${a * m}? ${a * m} ÷ ${a} = ?`, `Multiply the garment side the same way: ? × ${b} = ?`],
      wrong: [b + m, b * m - b, a * m + b, b * m + b],
      answer: b * m,
      hints: ['Find the multiplier: how many times does the paper length grow?', `${a * m} ÷ ${a} = ${m}. Use the same multiplier on the garment side.`, `${m} × ${b} = ${b * m}, so the real hem is ${b * m} inches.`],
    };
  }
  const s = int(rng, 3, 9), p = int(rng, 3, 9);
  return {
    prompt: `Scale: 1 inch on paper = ${s} inches on the garment. The real hem must be ${s * p} inches. How long should it be on the paper pattern?`,
    math: `1 : ${s} = ? : ${s * p}`,
    plain: `Work backward. The real length is ${s * p} inches and each paper inch is ${s} real inches. How many paper inches is that?`,
    model: { kind: 'table', head: ['on paper (in)', 'real garment (in)'], rows: [['1', String(s)], ['?', String(s * p)]], note: `÷ ${s} to go back` },
    steps: [`Going from garment to paper means dividing by ${s}.`, `${s * p} ÷ ${s} = ? inches on paper.`],
    wrong: [s * p - s, s * p + s, s, p + s],
    answer: p,
    hints: ['Going from the real garment back to the paper means dividing, not multiplying.', `${s * p} ÷ ${s}`, `${s * p} ÷ ${s} = ${p}, so draw it ${p} inches long.`],
  };
}

function markup(level, theme, rng) {
  if (level === 1) {
    const pct = pick(rng, [10, 20, 25, 50]), C = 20 * int(rng, 2, 10), mk = (C * pct) / 100;
    return {
      prompt: `A designer buys a belt for $${C} and marks it up ${pct}%. What is the selling price?`,
      math: `$${C} + (${pct}% of $${C}) = $?`,
      plain: `Markup is extra added on top of what you paid. Find ${pct}% of $${C}, then add it to $${C}.`,
      model: { kind: 'table', head: ['step', 'dollars'], rows: [['Cost', `$${C}`], [`+${pct}% markup`, '$?'], ['Selling price', '$?']], note: 'add the markup' },
      steps: [`Markup: $${C} × ${pct}/100 = $?`, `Selling price: $${C} + $? = $?`],
      wrong: [mk, C - mk, C + pct, C * 2 - mk],
      answer: C + mk,
      hints: ['Find the markup amount first. A percent means out of 100.', `${pct}% of $${C} = ${mk}. Now add that to the cost.`, `${C} + ${mk} = ${C + mk}, so the selling price is $${C + mk}.`],
    };
  }
  if (level === 2) {
    const t = pick(rng, [5, 8, 10]);
    const P = t === 5 ? 20 * int(rng, 3, 12) : t === 8 ? 25 * int(rng, 2, 10) : 10 * int(rng, 5, 20);
    const tax = (P * t) / 100;
    return {
      prompt: `A jacket costs $${P}. Sales tax is ${t}%. What is the total at checkout?`,
      math: `$${P} + (${t}% of $${P}) = $?`,
      plain: `Tax is extra on top of the price. Find ${t}% of $${P}, then add it.`,
      model: { kind: 'table', head: ['step', 'dollars'], rows: [['Price', `$${P}`], [`+${t}% tax`, '$?'], ['Total', '$?']], note: 'add the tax' },
      steps: [`Tax: $${P} × ${t}/100 = $?`, `Total: $${P} + $? = $?`],
      wrong: [tax, P - tax, P + t, P * 2],
      answer: P + tax,
      hints: ['Tax is a percent of the price. Find it first.', `${t}% of $${P} = ${tax}. Add it to the price.`, `${P} + ${tax} = ${P + tax}, so the total is $${P + tax}.`],
    };
  }
  const j = int(rng, 4, 15), C = 8 * j, up = 10 * j, d = pick(rng, [10, 20]), off = (up * d) / 100;
  return {
    prompt: `A designer buys a jacket for $${C}, marks it up 25%, then puts it on sale for ${d}% off the new price. What is the sale price?`,
    math: `$${C} → +25% → −${d}% = $?`,
    plain: `Two steps in order. First add 25% to $${C}. Then take ${d}% off that new price.`,
    model: { kind: 'table', head: ['step', 'dollars'], rows: [['Cost', `$${C}`], ['+25% markup', '$?'], [`−${d}% sale`, '$?']], note: 'do them in order' },
    steps: [`After markup: $${C} + 25% of $${C} = $?`, `Sale discount: ${d}% of $? = $?`, `Sale price: $? − $? = $?`],
    wrong: [up, C, up + off, C - off],
    answer: up - off,
    hints: ['Do the markup first, then the sale discount on the new price.', `25% of $${C} = ${C / 4}, so the new price is $${up}. Now take ${d}% off $${up}.`, `${d}% of ${up} = ${off}. ${up} − ${off} = ${up - off}.`],
  };
}

function integers(level, theme, rng) {
  if (level === 1) {
    const E = 10 * int(rng, 3, 9), S = E + 5 * int(rng, 2, 9);
    return {
      prompt: `This week the boutique earned $${E} in sales and spent $${S} on supplies. By how many dollars did it lose money?`,
      math: `$${E} − $${S} = −$?`,
      plain: `Earned minus spent is below zero. How far below zero is it?`,
      model: { kind: 'table', head: ['', 'dollars'], rows: [['Earned', `+$${E}`], ['Spent', `−$${S}`], ['Net', '−$?']], note: 'net = earned − spent' },
      steps: [`Spent is bigger than earned, so the net is negative.`, `Find the gap: $${S} − $${E} = $? lost.`],
      wrong: [E + S, S, E, S - E + 10],
      answer: S - E,
      hints: ['When you spend more than you earn, the net is a loss. A loss is a negative number.', `The loss is the gap between ${S} and ${E}.`, `${S} − ${E} = ${S - E}, so the boutique lost $${S - E}.`],
    };
  }
  if (level === 2) {
    const a = 5 * int(rng, 3, 12), b = a + 5 * int(rng, 2, 14);
    return {
      prompt: `The shop starts the week at −$${a} (it owes that much). Then it earns $${b}. What is the new balance in dollars?`,
      math: `−$${a} + $${b} = $?`,
      plain: `Start below zero, then climb up by $${b}. The first $${a} just gets you back to zero.`,
      model: { kind: 'table', head: ['', 'dollars'], rows: [['Start', `−$${a}`], ['Earned', `+$${b}`], ['Balance', '$?']], note: 'cancel the debt first' },
      steps: [`The first $${a} pays off the debt and gets you to 0.`, `What is left over: $${b} − $${a} = $?`],
      wrong: [a + b, b, a, b - a + 5],
      answer: b - a,
      hints: ['Money you owe counts as negative. Earning cancels it out.', `Use $${a} of the $${b} to get back to zero. What is left?`, `${b} − ${a} = ${b - a}, so the balance is $${b - a}.`],
    };
  }
  const u1 = 5 * int(rng, 8, 16), d1 = 5 * int(rng, 2, 6), u2 = 5 * int(rng, 6, 14), d2 = 5 * int(rng, 2, 6);
  return {
    prompt: `Daily results for the shop: +$${u1}, −$${d1}, +$${u2}, −$${d2}. What is the net profit for the four days?`,
    math: `+${u1} − ${d1} + ${u2} − ${d2} = $?`,
    plain: `Add up the good days and subtract the bad days. Green days go up, red days go down.`,
    model: { kind: 'table', head: ['Day', 'dollars'], rows: [['Day 1', `+$${u1}`], ['Day 2', `−$${d1}`], ['Day 3', `+$${u2}`], ['Day 4', `−$${d2}`], ['Net', '$?']], note: 'running total' },
    steps: [`Gains: ${u1} + ${u2} = ?`, `Losses: ${d1} + ${d2} = ?`, `Net: gains − losses = ?`],
    wrong: [u1 + u2 + d1 + d2, u1 + u2, u1 - d1 + u2 + d2, u1 - d1],
    answer: u1 + u2 - d1 - d2,
    hints: ['Group the gains together and the losses together.', `Gains ${u1 + u2}, losses ${d1 + d2}. Net = gains − losses.`, `${u1 + u2} − ${d1 + d2} = ${u1 + u2 - d1 - d2}, so the net profit is $${u1 + u2 - d1 - d2}.`],
  };
}

function equations(level, theme, rng) {
  const item = { jewelry: ['charm', 'charms'], fabric: ['yard of fabric', 'yards of fabric'], runway: ['ticket', 'tickets'] }[theme] || ['charm', 'charms'];
  if (level === 1) {
    const p = int(rng, 4, 15), x = int(rng, 3, 12), T = p * x;
    return {
      prompt: `Each ${item[0]} costs $${p}. You spend $${T} in total. How many ${item[1]} did you buy?`,
      math: `${p}x = ${T},  x = ?`,
      plain: `${p} times some mystery number gives ${T}. Undo the multiplying to find the mystery number.`,
      model: { kind: 'equation', p, q: 0, T, sign: 1 },
      steps: [`${p}x = ${T}. Undo the multiplication by dividing both sides by ${p}.`, `${T} ÷ ${p} = ?`],
      wrong: [T - p, T + p, p, x + p],
      answer: x,
      hints: ['x is the mystery number. Division undoes multiplication.', `Divide both sides: ${T} ÷ ${p}.`, `${T} ÷ ${p} = ${x}, so x = ${x}.`],
    };
  }
  if (level === 2) {
    const p = int(rng, 5, 15), x = int(rng, 3, 10), q = 5 * int(rng, 2, 8), T = p * x + q;
    return {
      prompt: `You have $${T}. ${item[1][0].toUpperCase() + item[1].slice(1)} cost $${p} each and the clasp costs $${q}. How many ${item[1]} can you buy?`,
      math: `${p}x + ${q} = ${T},  x = ?`,
      plain: `Take the clasp cost out first. What is left pays for ${item[1]} at $${p} each.`,
      model: { kind: 'equation', p, q, T, sign: 1 },
      steps: [`Subtract the clasp from the budget: ${T} − ${q} = ?`, `Divide by the price of each: ? ÷ ${p} = ?`],
      wrong: [Math.round(T / p), x + 1, x - 1, T - q],
      answer: x,
      hints: ['Two steps. Undo the adding first, then undo the multiplying.', `${T} − ${q} = ${T - q}. Now divide by ${p}.`, `${T - q} ÷ ${p} = ${x}, so x = ${x}.`],
    };
  }
  const p = int(rng, 8, 25), x = int(rng, 3, 9), q = 5 * int(rng, 2, 8), T = p * x - q;
  return {
    prompt: `Each top costs $${p}. You use a $${q} coupon and pay $${T} in total. How many tops did you buy?`,
    math: `${p}x − ${q} = ${T},  x = ?`,
    plain: `Before the coupon, the bill was $${q} more. Add that back, then divide by the price of each top.`,
    model: { kind: 'equation', p, q, T, sign: -1 },
    steps: [`Undo the coupon by adding it back: ${T} + ${q} = ?`, `Divide by the price of each top: ? ÷ ${p} = ?`],
    wrong: [Math.round(T / p), x + 1, x - 1, T + q],
    answer: x,
    hints: ['The coupon took money off. Add it back first.', `${T} + ${q} = ${T + q}. Now divide by ${p}.`, `${T + q} ÷ ${p} = ${x}, so x = ${x}.`],
  };
}

const GENERATORS = { frac_part: fracPart, frac_add: fracAdd, ratio, percent, unit_rate: unitRate, scale, markup, integers, equations };

export function makeTask(skill, level, theme, rng) {
  const gen = GENERATORS[skill];
  if (!gen) throw new Error('unknown skill ' + skill);
  const lvl = Math.min(3, Math.max(1, level));
  const t = { skill, level: lvl, theme, ...gen(lvl, theme, rng) };
  t.choices = buildChoices(t.answer, t.wrong, rng);
  delete t.wrong;
  return t;
}

// Three choices: the right answer plus two common mistakes (padded with near misses), shuffled.
export function buildChoices(answer, wrong, rng) {
  const ok = (v) => Number.isInteger(v) && v > 0 && v !== answer;
  const pool = [...new Set(wrong.filter(ok))];
  for (let i = 0; pool.length < 2; i++) {
    for (const v of [answer + 1 + i, answer + 10 + i, answer - 1 - i]) if (ok(v) && !pool.includes(v) && pool.length < 2) pool.push(v);
  }
  const picked = pool.slice(0, 2);
  const out = [answer, ...picked];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
