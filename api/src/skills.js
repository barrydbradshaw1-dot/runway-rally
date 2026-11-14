// Skill graph and parameterized problem generators.
// Every task is generated from a template, so retries are fresh variants and answers are checked
// on the server. Fashion context is a skin over the math.
//
// A generator returns { prompt, answer, answerText, hints[3], mistakes[], form?, requireFraction?, simplest? }.
//   answer      numeric value (integer, decimal, or the value of a fraction)
//   answerText  how the answer is written for the student ("3/4", "-6", "12.50")
//   hints       three steps; the last one states the answer
//   mistakes    common wrong answers with feedback that names the slip: [{ value, text }]

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
export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcm = (a, b) => (a / gcd(a, b)) * b;
const money = (cents) => (cents / 100).toFixed(2);
const neg = (n) => (n < 0 ? `(${n})` : String(n)); // wrap negatives inside expressions: 5 + (-3)

export const THEMES = ['jewelry', 'fabric', 'runway'];
const say = (theme, byTheme) => byTheme[theme] ?? byTheme.fabric;

// Georgia's K-12 Mathematics Standards (adopted 2021, taught from fall 2023). Codes were checked on
// Nov 14, 2026 against GaDOE's grade 5 and grade 7 curriculum maps (2023), the K-8 standards document,
// and the standards registry at case.georgiastandards.org. `codes` lists every Georgia standard a skill
// practices, earliest grade first; `grade` is the grade where Georgia first teaches it.
// Students never see codes. The family page and teacher console do.
const sk = (name, prereq, codes, grade) => ({ name, prereq, codes, grade, standard: codes.join(', ') });
export const SKILLS = {
  // foundations (grades 3 to 5)
  mult_facts: sk('Multiplying', [], ['3.PAR.3'], 3),
  div_facts: sk('Dividing into equal groups', ['mult_facts'], ['3.PAR.3'], 3),
  frac_equiv: sk('Equivalent fractions', ['mult_facts'], ['3.NR.4', '4.NR.4'], 3),
  frac_simplify: sk('Simplifying fractions', ['frac_equiv', 'div_facts'], ['4.NR.4'], 4),
  decimals: sk('Money and decimals', [], ['5.NR.4'], 5),
  frac_part: sk('Fractions of a length', ['div_facts'], ['5.NR.3'], 5),
  frac_add: sk('Adding fractions', ['frac_part'], ['4.NR.4'], 4),
  frac_add_unlike: sk('Adding fractions with different bottoms', ['frac_add', 'frac_equiv'], ['5.NR.3'], 5),
  // grade 6
  frac_mult: sk('Multiplying fractions', ['frac_part', 'frac_simplify'], ['5.NR.3', '6.NR.1'], 5),
  frac_div: sk('Dividing fractions', ['frac_mult'], ['6.NR.1'], 6),
  dec_mult_div: sk('Multiplying and dividing decimals', ['decimals', 'mult_facts', 'div_facts'], ['6.NR.1'], 6),
  ratio: sk('Ratios', ['mult_facts'], ['6.NR.4'], 6),
  unit_rate: sk('Unit rates and best buys', ['ratio', 'div_facts'], ['6.NR.4', '7.PAR.4'], 6),
  fdp_convert: sk('Fractions, decimals and percents', ['frac_equiv', 'decimals'], ['6.NR.4', '7.NR.1'], 6),
  percent_of: sk('Percent of a number', ['fdp_convert'], ['6.NR.4'], 6),
  expr_eval: sk('Evaluating expressions', ['mult_facts'], ['6.PAR.6'], 6),
  eq_one_step: sk('One-step equations', ['expr_eval', 'div_facts'], ['6.PAR.7'], 6),
  inequalities: sk('Inequalities', ['eq_one_step'], ['6.PAR.7', '7.PAR.3'], 6),
  coord_plane: sk('The coordinate plane', ['int_add'], ['6.PAR.8'], 6),
  area_volume: sk('Area, volume and surface area', ['mult_facts', 'div_facts'], ['6.GSR.5'], 6),
  // grade 7
  percent: sk('Percent and discounts', ['percent_of'], ['7.PAR.4'], 7),
  int_add: sk('Adding and subtracting negatives', [], ['6.NR.3', '7.NR.1'], 6),
  int_mult: sk('Multiplying and dividing negatives', ['int_add', 'mult_facts'], ['7.NR.1'], 7),
  expr_equiv: sk('Simplifying and expanding expressions', ['expr_eval', 'int_mult'], ['7.PAR.2'], 7),
  eq_two_step: sk('Two-step equations', ['eq_one_step', 'int_mult'], ['7.PAR.3'], 7),
  proportion: sk('Proportions and scale drawings', ['unit_rate', 'dec_mult_div'], ['7.PAR.4'], 7),
  circles: sk('Circles', ['dec_mult_div'], ['7.GSR.5'], 7),
  probability: sk('Probability', ['frac_simplify', 'frac_mult'], ['7.PR.6'], 7),
};
export const SKILL_IDS = Object.keys(SKILLS);

// Longest prerequisite chain under a skill (roots are 0). Used to order the placement check.
export function depthOf(skill, memo = {}) {
  if (memo[skill] !== undefined) return memo[skill];
  const pre = SKILLS[skill].prereq;
  return (memo[skill] = pre.length ? 1 + Math.max(...pre.map((p) => depthOf(p, memo))) : 0);
}
export function ancestorsOf(skill, out = new Set()) {
  for (const p of SKILLS[skill].prereq) {
    out.add(p);
    ancestorsOf(p, out);
  }
  return out;
}
export function descendantsOf(skill) {
  return SKILL_IDS.filter((s) => ancestorsOf(s).has(skill));
}

const STORIES = {
  mult_facts: 'A client ordered matching sets, and every set needs the same pieces.',
  div_facts: 'A big delivery of supplies needs to be shared out evenly.',
  frac_equiv: 'Two pattern books write the same amount in different ways.',
  frac_simplify: 'The cutting chart is messy. Make the numbers as simple as they can be.',
  decimals: 'The boutique register needs a careful cashier.',
  frac_part: 'A client needs exact cuts so every piece fits.',
  frac_add: 'A client wants a mix of colors in a new collection.',
  frac_add_unlike: 'Two fabrics were measured with different rulers. Combine them.',
  frac_mult: 'Only part of the leftover fabric is needed. How much is that?',
  ratio: 'A client wants a pattern repeated at the perfect balance.',
  unit_rate: 'Two suppliers, two prices. Work out what one costs.',
  fdp_convert: 'Sale signs, price tags and order forms all write numbers differently.',
  percent_of: 'The studio tracks what share of each order is finished.',
  percent: 'The boutique is planning its seasonal sale.',
  int_add: 'The outdoor show is in the mountains, where it gets cold fast.',
  int_mult: 'The studio budget goes up and down. Track the changes.',
  expr_eval: 'Every designer has a price formula. Plug in the numbers.',
  eq_one_step: 'A receipt lost one number. Work backwards to find it.',
  eq_two_step: 'An invoice lost a number. Undo the steps to find it.',
  frac_div: 'There is only so much material. How many pieces can you cut?',
  dec_mult_div: 'The boutique register handles prices, splits and fabric by the yard.',
  inequalities: 'Budgets and goals: find the limit you have to stay under, or beat.',
  expr_equiv: 'The order forms are messy. Tidy the formulas without changing what they mean.',
  proportion: 'Plans and sketches are drawn to scale. Find the real sizes.',
  area_volume: 'Every piece needs the right amount of fabric, and every box the right size.',
  circles: 'Round designs need careful measuring.',
  coord_plane: 'The studio is laid out on a grid. Find the distances.',
  probability: 'Mystery bags are the hit of the season. What are the chances?',
};
export const storyFor = (skill) => STORIES[skill];

// ---------- answer helpers ----------
const intAns = (v) => ({ answer: v, answerText: String(v), form: 'int' });
const decAns = (cents) => ({ answer: cents / 100, answerText: money(cents), form: 'decimal' });
function fracAns(n, d, { requireFraction = false, simplest = false } = {}) {
  const g = gcd(n, d);
  const rn = n / g;
  const rd = d / g;
  return { answer: rn / rd, answerText: rd === 1 ? String(rn) : `${rn}/${rd}`, form: 'fraction', requireFraction, simplest };
}

// ---------- foundations ----------
function multFacts(level, theme, rng) {
  const [a, b] = level === 1 ? [int(rng, 2, 5), int(rng, 2, 9)] : level === 2 ? [int(rng, 3, 9), int(rng, 6, 9)] : [int(rng, 12, 25), int(rng, 3, 9)];
  const p = a * b;
  const tens = Math.floor(a / 10) * 10;
  return {
    prompt: say(theme, {
      jewelry: `Each bracelet has ${b} charms. How many charms do you need for ${a} bracelets?`,
      fabric: `Each jacket needs ${b} buttons. How many buttons for ${a} jackets?`,
      runway: `Each of the ${a} models wears ${b} hair clips. How many hair clips in all?`,
    }),
    ...intAns(p),
    hints: [
      `This is ${a} equal groups of ${b}, so multiply: ${a} × ${b}.`,
      level === 3
        ? `Break ${a} apart: ${tens} × ${b} = ${tens * b} and ${a - tens} × ${b} = ${(a - tens) * b}.`
        : `Count up by ${b}s, ${a} times: ${Array.from({ length: Math.min(a, 4) }, (_, i) => b * (i + 1)).join(', ')}, and so on.`,
      `${a} × ${b} = ${p}.`,
    ],
    mistakes: [{ value: a + b, text: `You added. There are ${a} groups with ${b} in each, so multiply.` }],
  };
}

function divFacts(level, theme, rng) {
  const b = level === 1 ? int(rng, 2, 5) : level === 2 ? int(rng, 3, 9) : int(rng, 6, 12);
  const q = level === 1 ? int(rng, 2, 6) : level === 2 ? int(rng, 4, 9) : int(rng, 7, 15);
  const total = b * q;
  return {
    prompt: say(theme, {
      jewelry: `You have ${total} beads. Each necklace uses ${b} beads. How many necklaces can you make?`,
      fabric: `A roll has ${total} feet of ribbon. Each bow uses ${b} feet. How many bows can you make?`,
      runway: `${total} models are split into teams of ${b}. How many teams are there?`,
    }),
    ...intAns(q),
    hints: [
      `Sharing ${total} into groups of ${b} means divide: ${total} ÷ ${b}.`,
      `Ask yourself: ${b} times what number makes ${total}?`,
      `${b} × ${q} = ${total}, so ${total} ÷ ${b} = ${q}.`,
    ],
    mistakes: [
      { value: total * b, text: 'You multiplied. Sharing into equal groups means divide.' },
      { value: total - b, text: 'You subtracted one group. Find how many groups fit, which means divide.' },
    ],
  };
}

function fracEquiv(level, theme, rng) {
  const d = pick(rng, [[2, 3, 4], [3, 4, 5, 6, 8], [5, 6, 8, 9, 10]][level - 1]);
  let n = int(rng, 1, d - 1);
  while (gcd(n, d) !== 1) n -= 1;
  const k = level === 1 ? int(rng, 2, 3) : level === 2 ? int(rng, 2, 5) : int(rng, 3, 7);
  const D = d * k;
  return {
    prompt: say(theme, {
      jewelry: `A design says ${n}/${d} of the beads are gold. The bead counter works in ${D}ths. Fill in the blank: ${n}/${d} = ?/${D}`,
      fabric: `A pattern uses ${n}/${d} of a yard. Your ruler is marked in ${D}ths of a yard. Fill in the blank: ${n}/${d} = ?/${D}`,
      runway: `${n}/${d} of the show is evening wear. The schedule has ${D} equal slots. Fill in the blank: ${n}/${d} = ?/${D}`,
    }),
    ...intAns(n * k),
    hints: [
      `What do you multiply ${d} by to get ${D}? Do the same to the top.`,
      `${D} ÷ ${d} = ${k}, so multiply the top by ${k} too.`,
      `${n} × ${k} = ${n * k}, so ${n}/${d} = ${n * k}/${D}.`,
    ],
    mistakes: [{ value: n + (D - d), text: `You added ${D - d} to the top. Fractions stay equal when you multiply the top and bottom by the same number.` }],
  };
}

function fracSimplify(level, theme, rng) {
  const d = pick(rng, [[2, 3, 4, 5], [3, 4, 5, 6, 7, 8], [5, 7, 8, 9, 11, 12]][level - 1]);
  let n = int(rng, 1, d - 1);
  while (gcd(n, d) !== 1) n -= 1;
  const k = level === 1 ? pick(rng, [2, 3]) : level === 2 ? int(rng, 2, 6) : pick(rng, [4, 6, 8, 9, 12]);
  const N = n * k;
  const D = d * k;
  return {
    prompt: say(theme, {
      jewelry: `${N} of the ${D} gems in a crown are blue. Write the fraction ${N}/${D} in simplest form.`,
      fabric: `You used ${N}/${D} of a bolt of silk. Write ${N}/${D} in simplest form.`,
      runway: `${N} of the ${D} looks in the show are red. Write ${N}/${D} in simplest form.`,
    }),
    ...fracAns(N, D, { requireFraction: true, simplest: true }),
    hints: [
      `Find the biggest number that divides both ${N} and ${D} evenly.`,
      `Both divide by ${k}: ${N} ÷ ${k} = ${n} and ${D} ÷ ${k} = ${d}.`,
      `So ${N}/${D} = ${n}/${d}. Type it with the / key.`,
    ],
    mistakes: [],
  };
}

function decimals(level, theme, rng) {
  if (level < 3) {
    const a = level === 1 ? int(rng, 10, 60) * 10 : int(rng, 101, 999);
    const b = level === 1 ? int(rng, 5, 40) * 10 : int(rng, 101, 999);
    const cents = (a % 100) + (b % 100);
    return {
      prompt: say(theme, {
        jewelry: `A clasp costs $${money(a)} and a chain costs $${money(b)}. What is the total in dollars?`,
        fabric: `Thread costs $${money(a)} and buttons cost $${money(b)}. What is the total in dollars?`,
        runway: `Lip gloss costs $${money(a)} and a hair bow costs $${money(b)}. What is the total in dollars?`,
      }),
      ...decAns(a + b),
      hints: [
        'Line up the decimal points, then add like whole numbers.',
        `Dollars: ${Math.floor(a / 100)} + ${Math.floor(b / 100)}. Cents: ${a % 100} + ${b % 100} = ${cents} cents${cents >= 100 ? ', which makes one more dollar' : ''}.`,
        `$${money(a)} + $${money(b)} = $${money(a + b)}.`,
      ],
      mistakes: [{ value: Math.abs(a - b) / 100, text: 'You subtracted. A total means add.' }],
    };
  }
  const bill = pick(rng, [2000, 5000]);
  const cost = int(rng, 501, bill - 101);
  return {
    prompt: say(theme, {
      jewelry: `Earrings cost $${money(cost)}. You pay with a $${bill / 100} bill. How much change do you get?`,
      fabric: `Fabric costs $${money(cost)}. You pay with a $${bill / 100} bill. How much change do you get?`,
      runway: `Show tickets cost $${money(cost)}. You pay with a $${bill / 100} bill. How much change do you get?`,
    }),
    ...decAns(bill - cost),
    hints: [
      'Change is what you paid minus what it cost.',
      `Write the bill as $${money(bill)} and line up the decimal points: ${money(bill)} − ${money(cost)}.`,
      `$${money(bill)} − $${money(cost)} = $${money(bill - cost)}.`,
    ],
    mistakes: [{ value: (bill + cost) / 100, text: 'You added. Change means subtract the cost from what you paid.' }],
  };
}

// ---------- fractions ----------
function fracPart(level, theme, rng) {
  const d = pick(rng, [[2, 4, 5], [3, 6, 8], [8, 10, 12]][level - 1]);
  const n = int(rng, 1, d - 1);
  const k = int(rng, 2, 4 + level * 3);
  const L = d * k;
  return {
    prompt: say(theme, {
      jewelry: `A chain is ${L} cm long. The clasp section uses ${n}/${d} of it. How many cm is the clasp section?`,
      fabric: `A roll of ribbon is ${L} cm long. A trim uses ${n}/${d} of it. How many cm of trim is that?`,
      runway: `The runway is ${L} feet long. Lights cover ${n}/${d} of it. How many feet have lights?`,
    }),
    ...intAns(n * k),
    hints: [
      'Split the length into equal parts. The bottom number of the fraction tells you how many parts.',
      `Divide ${L} by ${d} to find the size of one part: ${L} ÷ ${d} = ${k}.`,
      `One part is ${k} and you need ${n} of them: ${n} × ${k} = ${n * k}.`,
    ],
    mistakes: n === 1 ? [] : [{ value: k, text: `That's one part. You need ${n} parts.` }],
  };
}

function fracAdd(level, theme, rng) {
  const d = pick(rng, [[3, 4, 5], [6, 8, 10], [12, 15, 20]][level - 1]);
  const n1 = int(rng, 1, d - 2);
  const n2 = int(rng, 1, d - 1 - n1);
  const k = int(rng, 2, 4 + level * 2);
  const L = d * k;
  return {
    prompt: say(theme, {
      jewelry: `A necklace has ${L} beads. ${n1}/${d} of them are pearls and ${n2}/${d} are crystals. How many beads are pearls or crystals?`,
      fabric: `A scarf pattern has ${L} stripes. ${n1}/${d} are gold and ${n2}/${d} are silver. How many stripes are gold or silver?`,
      runway: `A show has ${L} outfits. ${n1}/${d} are red and ${n2}/${d} are black. How many outfits are red or black?`,
    }),
    ...intAns(k * (n1 + n2)),
    hints: [
      'The fractions share the same bottom number, so you can add the top numbers.',
      `${n1}/${d} + ${n2}/${d} = ${n1 + n2}/${d}. Now find ${n1 + n2}/${d} of ${L}.`,
      `One part is ${L} ÷ ${d} = ${k}. Then ${n1 + n2} × ${k} = ${k * (n1 + n2)}.`,
    ],
    mistakes: [
      { value: n1 + n2, text: `That's the number of parts. Each part is ${L} ÷ ${d}, so multiply.` },
      { value: k * n1, text: 'That only counts the first group. Add both fractions first.' },
    ],
  };
}

function fracAddUnlike(level, theme, rng) {
  const pairs = [
    [[2, 4], [3, 6], [4, 8], [2, 6], [5, 10]],
    [[2, 3], [3, 4], [2, 5], [4, 6], [6, 8]],
    [[3, 5], [4, 5], [5, 6], [3, 8], [4, 10], [6, 9]],
  ][level - 1];
  let a = 1;
  let b = 2;
  let c = 1;
  let d = 4;
  for (let tries = 0; tries < 40; tries++) {
    [b, d] = pick(rng, pairs);
    a = int(rng, 1, b - 1);
    c = int(rng, 1, d - 1);
    if (a * d + c * b < b * d && gcd(a, b) === 1 && gcd(c, d) === 1) break; // simple parts, sum under 1
  }
  if (a * d + c * b >= b * d || gcd(a, b) !== 1 || gcd(c, d) !== 1) [a, c] = [1, 1];
  const L = lcm(b, d);
  const x = (a * L) / b;
  const y = (c * L) / d;
  const ans = fracAns(x + y, L);
  const simpler = ans.answerText !== `${x + y}/${L}` ? ` = ${ans.answerText}` : '';
  return {
    prompt: say(theme, {
      jewelry: `A pendant uses ${a}/${b} ounce of silver and ${c}/${d} ounce of gold. How many ounces of metal in all? Answer as a fraction.`,
      fabric: `A dress uses ${a}/${b} yard of lace and ${c}/${d} yard of satin. How many yards in all? Answer as a fraction.`,
      runway: `The show spends ${a}/${b} hour on casual looks and ${c}/${d} hour on gowns. How many hours is that? Answer as a fraction.`,
    }),
    ...ans,
    hints: [
      `The bottoms are different, so make them match first. A common bottom for ${b} and ${d} is ${L}.`,
      `${a}/${b} = ${x}/${L} and ${c}/${d} = ${y}/${L}.`,
      `Add the tops: ${x} + ${y} = ${x + y}, so the total is ${x + y}/${L}${simpler}.`,
    ],
    mistakes: [{ value: (a + c) / (b + d), text: 'You added the bottoms too. Make the bottoms match, then add only the tops.' }],
  };
}

function fracMult(level, theme, rng) {
  let a = 1;
  let b = pick(rng, [2, 3, 4]);
  if (level > 1) {
    b = pick(rng, [3, 4, 5, 6]);
    a = int(rng, 1, b - 1);
    while (gcd(a, b) !== 1) a -= 1;
  }
  const d = level === 3 ? pick(rng, [4, 6, 8, 9]) : pick(rng, [2, 3, 4, 5]);
  let c = int(rng, 1, d - 1);
  while (gcd(c, d) !== 1) c -= 1;
  const ans = fracAns(a * c, b * d);
  const simpler = ans.answerText !== `${a * c}/${b * d}` ? ` = ${ans.answerText}` : '';
  return {
    prompt: say(theme, {
      jewelry: `You have ${c}/${d} meter of chain and use ${a}/${b} of it for an anklet. How many meters do you use? Answer as a fraction.`,
      fabric: `There is ${c}/${d} yard of velvet left. A collar uses ${a}/${b} of it. How many yards is the collar? Answer as a fraction.`,
      runway: `The rehearsal is ${c}/${d} hour long and ${a}/${b} of it is the finale. How many hours is the finale? Answer as a fraction.`,
    }),
    ...ans,
    hints: [
      `"${a}/${b} of" something means multiply: ${a}/${b} × ${c}/${d}.`,
      `Multiply the tops: ${a} × ${c} = ${a * c}. Multiply the bottoms: ${b} × ${d} = ${b * d}.`,
      `So the answer is ${a * c}/${b * d}${simpler}.`,
    ],
    mistakes: [
      { value: (a + c) / (b + d), text: 'You added. "Of" means multiply the tops and multiply the bottoms.' },
      { value: (a * d) / (b * c), text: 'You flipped one fraction. Just multiply straight across.' },
    ],
  };
}

// ---------- ratios, rates, percents ----------
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
  return {
    prompt: say(theme, {
      jewelry: `A bracelet pattern uses ${a} gold beads for every ${b} silver beads. You use ${a * k} gold beads. How many silver beads do you need?`,
      fabric: `A dye mix needs ${a} drops of rose for every ${b} drops of gold. You use ${a * k} drops of rose. How many drops of gold?`,
      runway: `The show has ${a} stylists for every ${b} models. There are ${a * k} stylists. How many models are there?`,
    }),
    ...intAns(k * b),
    hints: [
      'Figure out how many times the basic pattern repeats.',
      `${a * k} ÷ ${a} = ${k}, so the pattern repeats ${k} times.`,
      `Each repeat needs ${b}: ${k} × ${b} = ${k * b}.`,
    ],
    mistakes: [{ value: b + (a * k - a), text: `You added the same amount to both. Ratios grow by multiplying, so find how many times ${a} fits into ${a * k}.` }],
  };
}

function unitRate(level, theme, rng) {
  const q = level === 1 ? int(rng, 2, 6) : int(rng, 3, 8);
  const unit = level === 3 ? pick(rng, [125, 150, 175, 225, 250, 275, 350]) : 100 * int(rng, 2, 9);
  const price = q * unit;
  const m = int(rng, 2, 9) + (level === 3 ? 1 : 0);
  const [many, one] = say(theme, { jewelry: ['hair clips', 'clip'], fabric: ['spools of thread', 'spool'], runway: ['lip glosses', 'lip gloss'] });
  if (level === 1) {
    return {
      prompt: `${q} ${many} cost $${money(price)}. How much does one ${one} cost in dollars?`,
      ...decAns(unit),
      hints: ['A unit rate is the price of one. Divide the total cost by how many you get.', `$${money(price)} ÷ ${q}.`, `$${money(price)} ÷ ${q} = $${money(unit)} each.`],
      mistakes: [{ value: (price * q) / 100, text: 'You multiplied. To find the price of one, divide the cost by how many you get.' }],
    };
  }
  return {
    prompt: `${q} ${many} cost $${money(price)}. At the same price, how much do ${m} cost in dollars?`,
    ...decAns(unit * m),
    hints: ['Find the price of one first, then multiply.', `One costs $${money(price)} ÷ ${q} = $${money(unit)}.`, `${m} × $${money(unit)} = $${money(unit * m)}.`],
    mistakes: [
      { value: (price * m) / 100, text: `That's the price of ${q}, times ${m}. Find the price of one first.` },
      { value: unit / 100, text: `That's the price of one. Now multiply by ${m}.` },
    ],
  };
}

function fdpConvert(level, theme, rng) {
  if (level === 1) {
    const [n, d] = pick(rng, [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10], [7, 10]]);
    const p = (100 * n) / d;
    return {
      prompt: say(theme, {
        jewelry: `${n}/${d} of the rings are on sale. What percent is that?`,
        fabric: `${n}/${d} of the fabric is cotton. What percent is that?`,
        runway: `${n}/${d} of the seats are filled. What percent is that?`,
      }),
      ...intAns(p),
      hints: ['Percent means "out of 100". Make the bottom 100.', `100 ÷ ${d} = ${100 / d}, so multiply the top by ${100 / d}: ${n}/${d} = ${p}/100.`, `${p}/100 = ${p}%.`],
      mistakes: [{ value: n / d, text: 'That is the decimal. Percent means out of 100, so multiply by 100.' }],
    };
  }
  if (level === 2) {
    const p = int(rng, 1, 19) * 5;
    const dec = p / 100;
    return {
      prompt: say(theme, {
        jewelry: `A gem scale shows ${dec}. Write ${dec} as a percent.`,
        fabric: `A fabric chart says ${dec} of the bolt is used. Write ${dec} as a percent.`,
        runway: `A poll shows ${dec} of the crowd loved the show. Write ${dec} as a percent.`,
      }),
      ...intAns(p),
      hints: ['To turn a decimal into a percent, multiply by 100.', 'Multiplying by 100 moves the decimal point two places to the right.', `${dec} × 100 = ${p}, so it is ${p}%.`],
      mistakes: [{ value: p / 10, text: 'Move the decimal point two places, not one.' }],
    };
  }
  const [n, d] = pick(rng, [[3, 20], [7, 20], [9, 25], [12, 25], [17, 50], [1, 8], [3, 8]]);
  const p = (100 * n) / d;
  return {
    prompt: say(theme, {
      jewelry: `${n} out of ${d} bracelets sold today. What percent sold?`,
      fabric: `${n} out of ${d} patterns are finished. What percent are finished?`,
      runway: `${n} out of ${d} looks got a standing ovation. What percent is that?`,
    }),
    ...(Number.isInteger(p) ? intAns(p) : { answer: p, answerText: String(p), form: 'decimal' }),
    hints: [`Write it as a fraction, ${n}/${d}, then find what it is out of 100.`, `Divide: ${n} ÷ ${d} = ${n / d}.`, `${n / d} × 100 = ${p}, so ${p}%.`],
    mistakes: [{ value: n / d, text: 'That is the decimal. Multiply by 100 to get the percent.' }],
  };
}

function percentOf(level, theme, rng) {
  const pct = pick(rng, [[10, 50, 25], [20, 30, 40, 75], [15, 35, 60, 45]][level - 1]);
  const N = 20 * int(rng, 2, level === 3 ? 20 : 10);
  const part = (N * pct) / 100;
  return {
    prompt: say(theme, {
      jewelry: `A shop has ${N} rings. ${pct}% of them have gems. How many rings have gems?`,
      fabric: `An order has ${N} shirts. ${pct}% are finished. How many shirts are finished?`,
      runway: `${N} people came to the show. ${pct}% were designers. How many designers came?`,
    }),
    ...intAns(part),
    hints: [
      `${pct}% means ${pct} out of every 100. Find 10% or 1% first.`,
      pct % 10 === 0 ? `10% of ${N} is ${N / 10}. You need ${pct / 10} of those.` : `1% of ${N} is ${N / 100}. You need ${pct} of those.`,
      `${pct}% of ${N} = ${pct}/100 × ${N} = ${part}.`,
    ],
    mistakes: [
      { value: N - part, text: `That's the other part. The question asks for the ${pct}% part.` },
      { value: N * pct, text: 'Remember to divide by 100. Percent means out of 100.' },
    ],
  };
}

function percent(level, theme, rng) {
  const pct = pick(rng, [[10, 20, 25, 50], [15, 30, 35, 45], [12, 18, 24, 36]][level - 1]);
  const P = level === 1 ? 20 * int(rng, 2, 10) : level === 2 ? 20 * int(rng, 3, 15) : 50 * int(rng, 2, 8);
  const disc = (P * pct) / 100;
  return {
    prompt: say(theme, {
      jewelry: `A pendant costs $${P}. It is ${pct}% off today. What is the sale price in dollars?`,
      fabric: `A silk scarf costs $${P}. The tag says ${pct}% off. What is the sale price in dollars?`,
      runway: `Runway boots cost $${P}. They are ${pct}% off. What is the sale price in dollars?`,
    }),
    ...intAns(P - disc),
    hints: [
      'Find the discount first. A percent is a part out of 100.',
      `${pct}% of ${P} is ${pct}/100 × ${P} = ${disc}.`,
      `Subtract the discount from the price: ${P} − ${disc} = ${P - disc}.`,
    ],
    mistakes: [
      { value: disc, text: "That's the discount. The question asks for the sale price, so subtract it from the price." },
      { value: P + disc, text: 'You added the discount. A sale makes the price go down.' },
      { value: P - pct, text: `You took off $${pct}. You need ${pct}% of $${P}, which is a different number.` },
    ],
  };
}

// ---------- negatives and algebra ----------
function intAdd(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = a + int(rng, 1, 8);
    const ans = a - b;
    return {
      prompt: say(theme, {
        jewelry: `Your jewelry budget is $${a}. You spend $${b}. What is your balance now? (Use − for money you owe.)`,
        fabric: `It is ${a}°F outside the studio. The temperature drops ${b} degrees. What is the temperature now?`,
        runway: `The mountain show starts at ${a}°F. It drops ${b} degrees by night. What is the temperature at night?`,
      }),
      ...intAns(ans),
      hints: [`Start at ${a} on a number line and move ${b} to the left.`, `You reach 0 after ${a} steps, then go ${b - a} more below zero.`, `${a} − ${b} = ${ans}.`],
      mistakes: [{ value: -ans, text: 'Check the sign. You went past zero, so the answer is negative. Use the − key.' }],
    };
  }
  if (level === 2) {
    const a = -int(rng, 2, 12);
    const b = int(rng, 1, 15);
    const ans = a + b;
    return {
      prompt: say(theme, {
        jewelry: `Your balance is ${a} dollars because you owe for supplies. You sell a ring for $${b}. What is your balance now?`,
        fabric: `The dye room is ${a}°C. It warms up ${b} degrees. What is the temperature now?`,
        runway: `At dawn it is ${a}°F on the mountain runway. It warms up ${b} degrees. What is the temperature now?`,
      }),
      ...intAns(ans),
      hints: [`Start at ${a} and move ${b} to the right.`, `It takes ${-a} steps to get back to 0.${b > -a ? ` Then go ${b + a} more.` : ''}`, `${a} + ${b} = ${ans}.`],
      mistakes: [
        { value: -ans, text: 'Check the sign. Picture the number line: which side of zero do you end on?' },
        { value: a - b, text: 'Warming up or earning money means moving right, so add.' },
      ],
    };
  }
  const a = int(rng, -5, 15);
  const b = -int(rng, 2, 15);
  const ans = a - b;
  return {
    prompt: say(theme, {
      jewelry: `A ring is stored at ${a}°F and a pearl is stored at ${b}°F. How many degrees warmer is the ring? Work out ${neg(a)} − ${neg(b)}.`,
      fabric: `The Atlanta studio is ${a}°F and the Oslo studio is ${b}°F. How many degrees warmer is Atlanta? Work out ${neg(a)} − ${neg(b)}.`,
      runway: `The runway is ${a}°F and the ice tent is ${b}°F. How many degrees warmer is the runway? Work out ${neg(a)} − ${neg(b)}.`,
    }),
    ...intAns(ans),
    hints: ['Subtracting a negative is the same as adding a positive.', `${neg(a)} − ${neg(b)} = ${a} + ${-b}.`, `${a} + ${-b} = ${ans}.`],
    mistakes: [{ value: a + b, text: 'Subtracting a negative is like adding. Change − (−) into +.' }],
  };
}

function intMult(level, theme, rng) {
  const tag = say(theme, { jewelry: 'Gem code', fabric: 'Pattern code', runway: 'Show code' });
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    return {
      prompt: say(theme, {
        jewelry: `The price of silver drops $${a} a day for ${b} days. What is the total change? Work out ${b} × (−${a}).`,
        fabric: `A bolt of fabric loses ${a} yards a week for ${b} weeks. What is the total change? Work out ${b} × (−${a}).`,
        runway: `The temperature drops ${a} degrees each hour for ${b} hours. What is the total change? Work out ${b} × (−${a}).`,
      }),
      ...intAns(-a * b),
      hints: ['A positive times a negative is negative.', `${b} × ${a} = ${a * b}.`, `So ${b} × (−${a}) = ${-a * b}.`],
      mistakes: [{ value: a * b, text: 'Check the sign: a drop is negative, and positive × negative is negative.' }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    return {
      prompt: `${tag}: (−${a}) × (−${b}) = ?`,
      ...intAns(a * b),
      hints: ['A negative times a negative is positive.', `${a} × ${b} = ${a * b}.`, `So (−${a}) × (−${b}) = ${a * b}.`],
      mistakes: [{ value: -a * b, text: 'Check the sign: a negative times a negative is positive.' }],
    };
  }
  const b = int(rng, 2, 9);
  const q = int(rng, 2, 9) * pick(rng, [1, -1]);
  const divisor = pick(rng, [b, -b]);
  const total = q * divisor;
  return {
    prompt: `${tag}: ${total} ÷ ${neg(divisor)} = ?`,
    ...intAns(q),
    hints: ['Divide the numbers, then work out the sign. Same signs give positive, different signs give negative.', `${Math.abs(total)} ÷ ${b} = ${Math.abs(q)}.`, `The answer is ${q}.`],
    mistakes: [{ value: -q, text: 'Check the sign: same signs give positive, different signs give negative.' }],
  };
}

function exprEval(level, theme, rng) {
  const a = int(rng, 2, level === 1 ? 6 : 9);
  const b = int(rng, 3, 20);
  const x = level === 3 ? -int(rng, 1, 6) : int(rng, 2, 9);
  const minus = level === 2;
  const val = minus ? a * x - b : a * x + b;
  const expr = minus ? `${a}h − ${b}` : `${a}h + ${b}`;
  return {
    prompt: say(theme, {
      jewelry: level === 3 ? `A gem cooling formula is ${a}h + ${b}. What is it when h = ${x}?` : `A jeweler charges ${expr} dollars for h hours of work. What is the cost when h = ${x}?`,
      fabric: level === 3 ? `A stretch test uses the formula ${a}h + ${b}. What is it when h = ${x}?` : `A tailor's price formula is ${expr} dollars for h hours. What is the price when h = ${x}?`,
      runway: level === 3 ? `A lighting formula is ${a}h + ${b}. What is it when h = ${x}?` : `A stylist's formula is ${expr} dollars for h hours. What is the price when h = ${x}?`,
    }),
    ...intAns(val),
    hints: [
      `Put ${x} in place of h. ${a}h means ${a} × h.`,
      `${a} × ${neg(x)} = ${a * x}. Multiply before you ${minus ? 'subtract' : 'add'}.`,
      `${a * x} ${minus ? '−' : '+'} ${b} = ${val}.`,
    ],
    mistakes: [
      { value: minus ? a * (x - b) : a * (x + b), text: `Multiply first: work out ${a} × ${x} before you ${minus ? 'subtract' : 'add'} ${b}.` },
      { value: minus ? a + x - b : a + x + b, text: `${a}h means ${a} times h, not ${a} plus h.` },
    ],
  };
}

function eqOneStep(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 3, 25);
    const x = int(rng, 2, 30);
    return {
      prompt: say(theme, {
        jewelry: `You had some beads, then bought ${a} more. Now you have ${x + a}. Solve x + ${a} = ${x + a}.`,
        fabric: `You had some yards of fabric and got ${a} more. Now you have ${x + a}. Solve x + ${a} = ${x + a}.`,
        runway: `Some models were backstage, then ${a} more arrived. Now there are ${x + a}. Solve x + ${a} = ${x + a}.`,
      }),
      ...intAns(x),
      hints: [`Undo adding ${a} by subtracting ${a} from both sides.`, `x = ${x + a} − ${a}.`, `x = ${x}. Check: ${x} + ${a} = ${x + a}.`],
      mistakes: [{ value: x + 2 * a, text: `You added ${a}. To undo + ${a}, subtract ${a}.` }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const x = int(rng, 2, 12);
    return {
      prompt: say(theme, {
        jewelry: `Charms cost $${a} each. You spent $${a * x}. How many did you buy? Solve ${a}x = ${a * x}.`,
        fabric: `Patches cost $${a} each. You spent $${a * x}. How many did you buy? Solve ${a}x = ${a * x}.`,
        runway: `Tickets cost $${a} each. A group spent $${a * x}. How many tickets? Solve ${a}x = ${a * x}.`,
      }),
      ...intAns(x),
      hints: [`${a}x means ${a} times x. Undo multiplying by dividing both sides by ${a}.`, `x = ${a * x} ÷ ${a}.`, `x = ${x}. Check: ${a} × ${x} = ${a * x}.`],
      mistakes: [
        { value: a * a * x, text: `You multiplied. To undo × ${a}, divide by ${a}.` },
        { value: a * x - a, text: `${a}x means ${a} times x, so divide instead of subtracting.` },
      ],
    };
  }
  const a = int(rng, 3, 15);
  const x = int(rng, -10, 10) || 4;
  const c = x - a;
  return {
    prompt: `Solve x − ${a} = ${c}.`,
    ...intAns(x),
    hints: [`Undo subtracting ${a} by adding ${a} to both sides.`, `x = ${neg(c)} + ${a}.`, `x = ${x}. Check: ${neg(x)} − ${a} = ${c}.`],
    mistakes: [{ value: c - a, text: `You subtracted again. To undo − ${a}, add ${a}.` }],
  };
}

function eqTwoStep(level, theme, rng) {
  const a = int(rng, 2, level === 1 ? 6 : 9);
  const x = level === 3 ? int(rng, -9, -1) : int(rng, 2, 12);
  const b = int(rng, 2, 25) * (level === 2 ? -1 : 1);
  const c = a * x + b;
  const eq = `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}`;
  const prompt =
    level === 1
      ? say(theme, {
          jewelry: `A jeweler charges a $${b} design fee plus $${a} per charm. A client paid $${c}. How many charms? Solve ${eq}.`,
          fabric: `A tailor charges a $${b} fitting fee plus $${a} per hem. A client paid $${c}. How many hems? Solve ${eq}.`,
          runway: `A stylist charges a $${b} booking fee plus $${a} per look. A client paid $${c}. How many looks? Solve ${eq}.`,
        })
      : `Solve ${eq}.`;
  const undo = b < 0 ? `add ${-b} to` : `subtract ${b} from`;
  return {
    prompt,
    ...intAns(x),
    hints: [
      `Undo the steps in reverse order. First ${undo} both sides.`,
      `${a}x = ${c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${c - b}. Now divide both sides by ${a}.`,
      `x = ${c - b} ÷ ${a} = ${x}. Check: ${a} × ${neg(x)} ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}.`,
    ],
    mistakes: [
      { value: (c + b) / a, text: b < 0 ? `To undo − ${-b}, add ${-b} first.` : `To undo + ${b}, subtract ${b} first.` },
      { value: c / a - b, text: 'Undo the adding or subtracting first, then divide.' },
    ],
  };
}

// ---------- grade 6 and 7 additions ----------
// 6.NR.1: dividing fractions
function fracDiv(level, theme, rng) {
  if (level === 1) {
    const w = int(rng, 2, 6);
    const d = pick(rng, [2, 3, 4, 5, 6, 8]);
    return {
      prompt: say(theme, {
        jewelry: `You have ${w} meters of chain. Each anklet uses 1/${d} meter. How many anklets can you make?`,
        fabric: `You have ${w} yards of ribbon. Each bow uses 1/${d} yard. How many bows can you make?`,
        runway: `The runway show lasts ${w} hours. Each look gets 1/${d} hour. How many looks fit?`,
      }),
      ...intAns(w * d),
      hints: [
        `How many 1/${d}s fit in ${w}? That is ${w} ÷ 1/${d}.`,
        `Each whole holds ${d} pieces of size 1/${d}. Dividing by 1/${d} is the same as multiplying by ${d}.`,
        `${w} × ${d} = ${w * d}.`,
      ],
      mistakes: [
        { value: w / d, text: `That splits ${w} into ${d} parts. The question asks how many 1/${d}-size pieces fit, so multiply by ${d}.` },
        { value: w + d, text: `You added. Each whole holds ${d} pieces, so multiply.` },
      ],
    };
  }
  const b = level === 2 ? pick(rng, [2, 3, 4]) : pick(rng, [3, 4, 5, 6]);
  let a = level === 2 ? int(rng, 1, b) : int(rng, b + 1, 3 * b);
  while (gcd(a, b) !== 1) a += 1;
  const d = level === 2 ? pick(rng, [4, 6, 8]) : pick(rng, [5, 6, 8, 9, 10]);
  let c = int(rng, 1, d - 1);
  while (gcd(c, d) !== 1) c -= 1;
  const ans = fracAns(a * d, b * c);
  const raw = `${a * d}/${b * c}`;
  return {
    prompt: say(theme, {
      jewelry: `You have ${a}/${b} pound of beads. Each bag holds ${c}/${d} pound. How many bags can you fill? Answer as a fraction or whole number.`,
      fabric: `You have ${a}/${b} yard of lace. Each cuff uses ${c}/${d} yard. How many cuffs can you make? Answer as a fraction or whole number.`,
      runway: `There are ${a}/${b} hour left. Each walk takes ${c}/${d} hour. How many walks fit? Answer as a fraction or whole number.`,
    }),
    ...ans,
    hints: [
      `"How many ${c}/${d}s fit in ${a}/${b}?" means ${a}/${b} ÷ ${c}/${d}.`,
      `Keep the first fraction, change ÷ to ×, and flip the second: ${a}/${b} × ${d}/${c}.`,
      `${a} × ${d} = ${a * d} and ${b} × ${c} = ${b * c}, so the answer is ${raw}${raw !== ans.answerText ? ` = ${ans.answerText}` : ''}.`,
    ],
    mistakes: [
      { value: (a * c) / (b * d), text: 'You multiplied straight across. To divide, flip the second fraction first, then multiply.' },
      { value: (b * c) / (a * d), text: 'You flipped the first fraction. Keep the first one and flip the one you divide by.' },
    ],
  };
}

// 6.NR.1: multiplying and dividing decimals
function decMultDiv(level, theme, rng) {
  if (level === 1) {
    const p = int(rng, 105, 895);
    const n = int(rng, 2, 6);
    return {
      prompt: say(theme, {
        jewelry: `One charm costs $${money(p)}. How much do ${n} charms cost?`,
        fabric: `One spool of thread costs $${money(p)}. How much do ${n} spools cost?`,
        runway: `One pair of lashes costs $${money(p)}. How much for ${n} models?`,
      }),
      ...decAns(p * n),
      hints: [
        `Multiply: ${money(p)} × ${n}.`,
        `Think in cents: ${p} × ${n} = ${p * n} cents.`,
        `${p * n} cents is $${money(p * n)}.`,
      ],
      mistakes: [{ value: (p + n) / 100, text: `You added ${n}. ${n} items at the same price means multiply.` }],
    };
  }
  if (level === 2) {
    const n = int(rng, 3, 8);
    const each = int(rng, 105, 995);
    const total = each * n;
    return {
      prompt: say(theme, {
        jewelry: `${n} friends split a $${money(total)} bead order evenly. How much does each pay?`,
        fabric: `A $${money(total)} fabric bill is shared by ${n} designers. How much does each pay?`,
        runway: `${n} models share a $${money(total)} taxi fare evenly. How much does each pay?`,
      }),
      ...decAns(each),
      hints: [
        `Divide: ${money(total)} ÷ ${n}.`,
        `Think in cents: ${total} ÷ ${n} = ${each} cents.`,
        `Each pays $${money(each)}.`,
      ],
      mistakes: [{ value: (total * n) / 100, text: 'You multiplied. Sharing a bill means divide.' }],
    };
  }
  let t = int(rng, 11, 39); // tenths of a yard
  if (t % 10 === 0) t += 1; // keep one decimal place
  const c = 10 * int(rng, 12, 60); // price in cents, a multiple of 10
  const cents = (t * c) / 10;
  return {
    prompt: say(theme, {
      jewelry: `Silver wire costs $${money(c)} per meter. You buy ${t / 10} meters. What is the cost?`,
      fabric: `Velvet costs $${money(c)} per yard. You buy ${t / 10} yards. What is the cost?`,
      runway: `Runway tape costs $${money(c)} per meter. You need ${t / 10} meters. What is the cost?`,
    }),
    ...decAns(cents),
    hints: [
      `Multiply: ${t / 10} × ${money(c)}.`,
      `Ignore the decimal points first: ${t} × ${c / 10} = ${t * (c / 10)}. Then count decimal places: one in ${t / 10} and one in ${(c / 100).toFixed(1)}, so two in all.`,
      `${t / 10} × ${money(c)} = $${money(cents)}.`,
    ],
    mistakes: [],
  };
}

// 6.PAR.7 and 7.PAR.3: inequalities (the answer is the boundary, or the smallest whole number that works)
function inequalities(level, theme, rng) {
  if (level === 1) {
    const b = int(rng, 3, 20);
    const x = int(rng, 4, 30);
    const c = x + b;
    return {
      prompt: say(theme, {
        jewelry: `You have ${b} beads and need more than ${c} for a necklace. Solve b + ${b} > ${c}. b > what number?`,
        fabric: `You have ${b} feet of trim and need more than ${c}. Solve t + ${b} > ${c}. t > what number?`,
        runway: `${b} seats are filled and the show needs more than ${c}. Solve s + ${b} > ${c}. s > what number?`,
      }),
      ...intAns(x),
      hints: [
        'Solve it like an equation. Undo the + by subtracting on both sides.',
        `Subtract ${b}: ${c} − ${b} = ${x}.`,
        `So the answer is greater than ${x}. The boundary is ${x}.`,
      ],
      mistakes: [{ value: c + b, text: `To undo + ${b}, subtract ${b}, don't add it.` }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const x = int(rng, 3, 15);
    const c = a * x;
    return {
      prompt: say(theme, {
        jewelry: `Each ring costs $${a}. You can spend at most $${c}. Solve ${a}r ≤ ${c}. r ≤ what number?`,
        fabric: `Each patch costs $${a}. Your limit is $${c}. Solve ${a}p ≤ ${c}. p ≤ what number?`,
        runway: `Each look takes ${a} minutes. The show can run at most ${c} minutes. Solve ${a}m ≤ ${c}. m ≤ what number?`,
      }),
      ...intAns(x),
      hints: [
        `Undo the multiplying by dividing both sides by ${a}. Dividing by a positive number keeps the sign the same.`,
        `${c} ÷ ${a} = ${x}.`,
        `So the answer is at most ${x}. The boundary is ${x}.`,
      ],
      mistakes: [{ value: c - a, text: `${a}r means ${a} times r. Undo it by dividing, not subtracting.` }],
    };
  }
  const a = int(rng, 3, 9);
  const b = int(rng, 10, 40);
  const goal = int(rng, 30, 120);
  const exact = (goal + b) / a;
  const ans = Math.floor(exact) + 1; // smallest whole number with a·n − b > goal
  return {
    prompt: say(theme, {
      jewelry: `Bracelets sell for $${a} each and the craft fair table costs $${b}. How many bracelets must you sell to make more than $${goal} profit? Solve ${a}n − ${b} > ${goal}. What is the smallest whole number that works?`,
      fabric: `Tote bags sell for $${a} each and the booth costs $${b}. How many must you sell to make more than $${goal} profit? Solve ${a}n − ${b} > ${goal}. What is the smallest whole number that works?`,
      runway: `Show tickets sell for $${a} each and the lights cost $${b}. How many tickets must you sell to make more than $${goal}? Solve ${a}n − ${b} > ${goal}. What is the smallest whole number that works?`,
    }),
    ...intAns(ans),
    hints: [
      `First add ${b} to both sides: ${a}n > ${goal + b}.`,
      `Divide by ${a}: n > ${Number.isInteger(exact) ? exact : `${goal + b}/${a}, which is about ${exact.toFixed(2)}`}.`,
      `n has to be more than that, so the smallest whole number is ${ans}.`,
    ],
    mistakes: [
      { value: Math.floor(exact), text: Number.isInteger(exact) ? `At exactly ${exact} you make exactly $${goal}. You need more than that.` : `${Math.floor(exact)} is not enough. Check: ${a} × ${Math.floor(exact)} − ${b} is not more than ${goal}. Round up.` },
      { value: Math.floor((goal - b) / a) + 1, text: `The table cost is subtracted, so add ${b} to both sides first.` },
    ],
  };
}

// 7.PAR.2: equivalent expressions
function exprEquiv(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    const k = int(rng, 2, 15);
    return {
      prompt: say(theme, {
        jewelry: `A tray has ${a}x rings, then ${k} more pearls and ${b}x more rings. Simplify ${a}x + ${k} + ${b}x = ?x + ${k}. What number goes in front of x?`,
        fabric: `A pattern uses ${a}x inches, then ${k} inches, then ${b}x inches. Simplify ${a}x + ${k} + ${b}x = ?x + ${k}. What number goes in front of x?`,
        runway: `A show has ${a}x looks, ${k} bows, then ${b}x more looks. Simplify ${a}x + ${k} + ${b}x = ?x + ${k}. What number goes in front of x?`,
      }),
      ...intAns(a + b),
      hints: [
        `Like terms have the same letter. ${a}x and ${b}x are like terms; ${k} is not.`,
        `Add the x terms: ${a}x + ${b}x.`,
        `${a} + ${b} = ${a + b}, so it is ${a + b}x + ${k}.`,
      ],
      mistakes: [{ value: a + b + k, text: `${k} has no x, so it is not a like term. Add only the numbers in front of x.` }],
    };
  }
  const a = level === 2 ? int(rng, 2, 9) : -int(rng, 2, 9);
  const b = level === 2 ? int(rng, 2, 12) : -int(rng, 2, 12);
  const inside = `x ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
  const prod = a * b;
  return {
    prompt:
      level === 2
        ? say(theme, {
            jewelry: `Each of ${a} gift boxes holds x rings and ${b} earrings: ${a}(${inside}). Fill in the blank: ${a}(${inside}) = ${a}x + ?`,
            fabric: `Each of ${a} outfits uses x buttons and ${b} snaps: ${a}(${inside}). Fill in the blank: ${a}(${inside}) = ${a}x + ?`,
            runway: `Each of ${a} models wears x pins and ${b} clips: ${a}(${inside}). Fill in the blank: ${a}(${inside}) = ${a}x + ?`,
          })
        : `Use the distributive property. Fill in the blank: ${a}(${inside}) = ${a}x + ?`,
    ...intAns(prod),
    hints: [
      `Multiply ${neg(a)} by each term inside the parentheses.`,
      `${neg(a)} × x = ${a}x and ${neg(a)} × ${neg(b)} = ?`,
      `${neg(a)} × ${neg(b)} = ${prod}, so ${a}(${inside}) = ${a}x + ${neg(prod)}.`,
    ],
    mistakes: [
      { value: b, text: `Multiply ${neg(a)} by both terms inside, not just x.` },
      { value: a + b, text: `You added ${neg(a)} and ${neg(b)}. The distributive property multiplies.` },
    ],
  };
}

// 7.PAR.4: proportional relationships and scale drawings
function proportion(level, theme, rng) {
  if (level === 1) {
    const k = 50 * int(rng, 3, 18); // cents per unit
    const x1 = int(rng, 2, 5);
    const x2 = x1 + int(rng, 1, 4);
    return {
      prompt: say(theme, {
        jewelry: `${x1} meters of chain cost $${money(k * x1)} and ${x2} meters cost $${money(k * x2)}. The cost is proportional. What is the unit rate (dollars per meter)?`,
        fabric: `${x1} yards of silk cost $${money(k * x1)} and ${x2} yards cost $${money(k * x2)}. The cost is proportional. What is the cost per yard?`,
        runway: `${x1} hours of lighting cost $${money(k * x1)} and ${x2} hours cost $${money(k * x2)}. The cost is proportional. What is the cost per hour?`,
      }),
      ...decAns(k),
      hints: [
        'In a proportional relationship, y ÷ x is the same every time. That number is the unit rate, k.',
        `Divide: ${money(k * x1)} ÷ ${x1}.`,
        `k = $${money(k)}. Check: ${money(k * x2)} ÷ ${x2} gives the same.`,
      ],
      mistakes: [
        { value: (k * x1) / 100, text: `That is the cost for ${x1}. The unit rate is the cost for 1, so divide by ${x1}.` },
        { value: (k * (x2 - x1)) / 100, text: `That is the cost of the extra ${x2 - x1}. Divide a cost by its amount to get the cost for 1.` },
      ],
    };
  }
  if (level === 2) {
    const s = pick(rng, [2, 4, 5, 6, 8, 10]);
    const halves = int(rng, 3, 19);
    const d = halves / 2;
    const real = halves * s / 2;
    return {
      prompt: say(theme, {
        jewelry: `On a display plan, 1 cm stands for ${s} cm of real case. The case is ${d} cm long on the plan. How long is the real case, in cm?`,
        fabric: `On a pattern sketch, 1 inch stands for ${s} inches of fabric. A sleeve is ${d} inches on the sketch. How long is the real sleeve?`,
        runway: `On a stage plan, 1 cm stands for ${s} meters. The runway is ${d} cm on the plan. How long is the real runway, in meters?`,
      }),
      ...(Number.isInteger(real) ? intAns(real) : decAns(Math.round(real * 100))),
      hints: [
        `Every 1 unit on the drawing is ${s} real units, so multiply by ${s}.`,
        `${d} × ${s}.`,
        `${d} × ${s} = ${Number.isInteger(real) ? real : money(Math.round(real * 100))}.`,
      ],
      mistakes: [
        { value: d / s, text: `The drawing is smaller than the real thing, so the real length is bigger. Multiply by ${s}.` },
        { value: d + s, text: `Scale means "times ${s}", not "plus ${s}".` },
      ],
    };
  }
  const a = int(rng, 2, 5);
  let b = int(rng, 3, 11);
  if (b === a) b += 1;
  const m = int(rng, 3, 6);
  return {
    prompt: say(theme, {
      jewelry: `${a} necklaces need ${b} meters of chain. At the same rate, how many meters for ${a * m} necklaces?`,
      fabric: `${a} dresses need ${b} yards of fabric. At the same rate, how many yards for ${a * m} dresses?`,
      runway: `${a} shows need ${b} hours of rehearsal. At the same rate, how many hours for ${a * m} shows?`,
    }),
    ...intAns(b * m),
    hints: [
      `Set up equal ratios: ${a}/${b} = ${a * m}/?`,
      `${a * m} is ${m} times ${a}, so the answer is ${m} times ${b}.`,
      `${b} × ${m} = ${b * m}.`,
    ],
    mistakes: [
      { value: b + (a * m - a), text: `You added ${a * m - a}. Proportions grow by multiplying: ${a * m} is ${m} times ${a}.` },
      { value: (a * m * a) / b, text: 'You flipped the ratio. Keep the same thing on top in both ratios.' },
    ],
  };
}

// 6.GSR.5: area, volume and surface area
function areaVolume(level, theme, rng) {
  if (level === 1) {
    const b = 2 * int(rng, 2, 10);
    const h = int(rng, 3, 12);
    return {
      prompt: say(theme, {
        jewelry: `A triangle pendant has a base of ${b} mm and a height of ${h} mm. What is its area in square mm?`,
        fabric: `A triangle scarf has a base of ${b} inches and a height of ${h} inches. What is its area in square inches?`,
        runway: `A triangle banner has a base of ${b} feet and a height of ${h} feet. What is its area in square feet?`,
      }),
      ...intAns((b * h) / 2),
      hints: [
        'A triangle is half of a rectangle with the same base and height.',
        `Rectangle: ${b} × ${h} = ${b * h}. Now take half.`,
        `${b * h} ÷ 2 = ${(b * h) / 2}.`,
      ],
      mistakes: [{ value: b * h, text: 'That is the whole rectangle. A triangle is half of it, so divide by 2.' }],
    };
  }
  const l = int(rng, 2, 9);
  const w = int(rng, 2, 8);
  const h = int(rng, 2, 7);
  const vol = l * w * h;
  const sa = 2 * (l * w + l * h + w * h);
  const what = say(theme, { jewelry: 'jewelry box', fabric: 'gift box', runway: 'shoe box' });
  if (level === 2) {
    return {
      prompt: `A ${what} is ${l} inches long, ${w} inches wide and ${h} inches tall. What is its volume in cubic inches?`,
      ...intAns(vol),
      hints: ['Volume of a box is length × width × height.', `${l} × ${w} = ${l * w} for the bottom layer.`, `${l * w} × ${h} = ${vol} cubic inches.`],
      mistakes: [
        { value: l + w + h, text: 'You added the sides. Volume multiplies length, width and height.' },
        { value: l * w, text: `That is one layer. There are ${h} layers, so multiply by ${h}.` },
        { value: sa, text: 'That is the surface area, the wrapping paper. Volume is how much fits inside.' },
      ],
    };
  }
  return {
    prompt: `You want to cover a ${what} with paper. It is ${l} inches long, ${w} inches wide and ${h} inches tall. What is its surface area in square inches?`,
    ...intAns(sa),
    hints: [
      'A box has 6 faces in 3 matching pairs: top and bottom, front and back, two ends.',
      `One of each: ${l}×${w} = ${l * w}, ${l}×${h} = ${l * h}, ${w}×${h} = ${w * h}. Add them, then double.`,
      `${l * w} + ${l * h} + ${w * h} = ${sa / 2}, and doubled is ${sa}.`,
    ],
    mistakes: [
      { value: vol, text: 'That is the volume. Surface area adds up the area of all 6 faces.' },
      { value: sa / 2, text: 'That covers only 3 faces. Each face has a matching partner, so double it.' },
    ],
  };
}

// 7.GSR.5: circles (use 3.14 for pi)
function circles(level, theme, rng) {
  const thing = say(theme, { jewelry: 'round pendant', fabric: 'circle skirt', runway: 'round stage' });
  const unit = say(theme, { jewelry: 'cm', fabric: 'inches', runway: 'feet' });
  if (level === 1) {
    const d = int(rng, 2, 20);
    return {
      prompt: `A ${thing} has a diameter of ${d} ${unit}. Use 3.14 for pi. What is its circumference, the distance around?`,
      ...decAns(314 * d),
      hints: ['Circumference = pi × diameter.', `3.14 × ${d}.`, `3.14 × ${d} = ${money(314 * d)} ${unit}.`],
      mistakes: [{ value: (314 * d) / 200, text: 'You used half the diameter. Circumference is pi times the whole diameter.' }],
    };
  }
  const r = int(rng, 2, 12);
  if (level === 2) {
    return {
      prompt: `A ${thing} has a radius of ${r} ${unit}. Use 3.14 for pi. What is its circumference?`,
      ...decAns(628 * r),
      hints: [`The diameter is twice the radius: ${2 * r} ${unit}.`, `Circumference = 3.14 × ${2 * r}.`, `3.14 × ${2 * r} = ${money(628 * r)} ${unit}.`],
      mistakes: [{ value: (314 * r) / 100, text: 'You used the radius as the diameter. Double the radius first.' }],
    };
  }
  return {
    prompt: `A ${thing} has a radius of ${r} ${unit}. Use 3.14 for pi. What is its area in square ${unit}?`,
    ...decAns(314 * r * r),
    hints: ['Area of a circle = pi × radius × radius.', `3.14 × ${r} × ${r} = 3.14 × ${r * r}.`, `3.14 × ${r * r} = ${money(314 * r * r)} square ${unit}.`],
    mistakes: [
      { value: (628 * r) / 100, text: 'That is the circumference. Area is pi × radius × radius.' },
      { value: (314 * 4 * r * r) / 100, text: 'You squared the diameter. Use the radius.' },
    ],
  };
}

// 6.PAR.8: the coordinate plane
function coordPlane(level, theme, rng) {
  const place = say(theme, { jewelry: 'a display grid', fabric: 'a cutting mat grid', runway: 'the stage grid' });
  if (level < 3) {
    const y = level === 1 ? int(rng, 1, 9) : int(rng, -9, 9);
    const x1 = level === 1 ? int(rng, 1, 6) : -int(rng, 1, 9);
    const x2 = level === 1 ? x1 + int(rng, 2, 9) : int(rng, 1, 9);
    const dist = x2 - x1;
    return {
      prompt: `On ${place}, one mark is at (${x1}, ${y}) and another is at (${x2}, ${y}). How many units apart are they?`,
      ...intAns(dist),
      hints: [
        'The y-values match, so the points are on the same horizontal line. Count across.',
        level === 1 ? `Subtract the x-values: ${x2} − ${x1}.` : `From ${x1} to 0 is ${-x1} units. From 0 to ${x2} is ${x2} units.`,
        `${level === 1 ? `${x2} − ${x1}` : `${-x1} + ${x2}`} = ${dist} units.`,
      ],
      mistakes: level === 1 ? [{ value: x1 + x2, text: 'Distance is the difference between the x-values, so subtract.' }] : [{ value: Math.abs(x2 + x1), text: `The points are on opposite sides of 0. Add the distances to 0: ${-x1} + ${x2}.` }],
    };
  }
  const a = int(rng, 1, 6);
  const c = int(rng, 1, 6);
  const b = int(rng, 1, 6);
  const e = int(rng, 1, 6);
  const w = a + c;
  const h = b + e;
  return {
    prompt: `On ${place}, a rectangle has corners at (−${a}, ${b}), (${c}, ${b}), (${c}, −${e}) and (−${a}, −${e}). What is its perimeter?`,
    ...intAns(2 * (w + h)),
    hints: [
      `Width: from x = −${a} to x = ${c} is ${a} + ${c} = ${w}.`,
      `Height: from y = −${e} to y = ${b} is ${e} + ${b} = ${h}.`,
      `Perimeter = 2 × (${w} + ${h}) = ${2 * (w + h)}.`,
    ],
    mistakes: [
      { value: w * h, text: 'That is the area. Perimeter is the distance around.' },
      { value: w + h, text: 'That is only two sides. A rectangle has four, so double it.' },
      { value: 2 * (Math.abs(c - a) + Math.abs(b - e)), text: 'The corners are on both sides of 0, so add the distances to 0.' },
    ],
  };
}

// 7.PR.6: probability
function probability(level, theme, rng) {
  const [itemA, itemB, itemC] = say(theme, { jewelry: ['pink', 'purple', 'gold'], fabric: ['striped', 'plain', 'floral'], runway: ['red', 'black', 'white'] });
  const things = say(theme, { jewelry: 'beads', fabric: 'scraps', runway: 'tickets' });
  const container = say(theme, { jewelry: 'bag', fabric: 'bin', runway: 'hat' });
  if (level === 1) {
    const p = int(rng, 1, 9);
    const q = int(rng, 1, 9);
    const ans = fracAns(p, p + q);
    return {
      prompt: `A ${container} has ${p} ${itemA} and ${q} ${itemB} ${things}. You pick one without looking. What is the probability it is ${itemA}? Answer as a fraction.`,
      ...ans,
      hints: ['Probability = favorable outcomes ÷ total outcomes.', `There are ${p} ${itemA} out of ${p} + ${q} = ${p + q} in all.`, `${p}/${p + q}${`${p}/${p + q}` !== ans.answerText ? ` = ${ans.answerText}` : ''}.`],
      mistakes: [{ value: p / q, text: `Compare ${itemA} to all the ${things}, not just to the ${itemB} ones.` }],
    };
  }
  if (level === 2) {
    const p = int(rng, 1, 8);
    const q = int(rng, 1, 8);
    const r = int(rng, 1, 8);
    const t = p + q + r;
    const ans = fracAns(t - r, t);
    return {
      prompt: `A ${container} has ${p} ${itemA}, ${q} ${itemB} and ${r} ${itemC} ${things}. You pick one without looking. What is the probability it is NOT ${itemC}? Answer as a fraction.`,
      ...ans,
      hints: [`"Not ${itemC}" means ${itemA} or ${itemB}.`, `${p} + ${q} = ${t - r} out of ${t} in all.`, `${t - r}/${t}${`${t - r}/${t}` !== ans.answerText ? ` = ${ans.answerText}` : ''}.`],
      mistakes: [{ value: r / t, text: `That is the chance it IS ${itemC}. You want every other color.` }],
    };
  }
  const p = int(rng, 1, 4);
  const q = int(rng, 1, 6);
  const t = p + q;
  const k = int(rng, 3, 12);
  const n = t * k;
  return {
    prompt: `A ${container} has ${p} ${itemA} and ${q} ${itemB} ${things}. You pick one, put it back, and do this ${n} times. About how many times should you expect ${itemA}?`,
    ...intAns(p * k),
    hints: [`The chance of ${itemA} each time is ${p}/${t}.`, `Expected count = probability × number of tries = ${p}/${t} × ${n}.`, `${n} ÷ ${t} = ${k}, and ${k} × ${p} = ${p * k}.`],
    mistakes: [
      { value: n / p, text: `Multiply the chance, ${p}/${t}, by ${n}.` },
      { value: q * k, text: `That is how many ${itemB} to expect. The question asks about ${itemA}.` },
    ],
  };
}

const GENERATORS = {
  mult_facts: multFacts,
  div_facts: divFacts,
  frac_equiv: fracEquiv,
  frac_simplify: fracSimplify,
  decimals,
  frac_part: fracPart,
  frac_add: fracAdd,
  frac_add_unlike: fracAddUnlike,
  frac_mult: fracMult,
  ratio,
  unit_rate: unitRate,
  fdp_convert: fdpConvert,
  percent_of: percentOf,
  percent,
  int_add: intAdd,
  int_mult: intMult,
  expr_eval: exprEval,
  eq_one_step: eqOneStep,
  eq_two_step: eqTwoStep,
  frac_div: fracDiv,
  dec_mult_div: decMultDiv,
  inequalities,
  expr_equiv: exprEquiv,
  proportion,
  area_volume: areaVolume,
  circles,
  coord_plane: coordPlane,
  probability,
};

export function makeTask(skill, level, theme, rng) {
  const gen = GENERATORS[skill];
  if (!gen) throw new Error('unknown skill ' + skill);
  const lvl = Math.min(3, Math.max(1, level));
  const th = THEMES.includes(theme) ? theme : 'fabric';
  const t = gen(lvl, th, rng);
  // drop "mistakes" that happen to equal the right answer
  // and keep only the first explanation when two mistakes land on the same number
  const mistakes = [];
  for (const m of t.mistakes || []) {
    if (!Number.isFinite(m.value) || Math.abs(m.value - t.answer) < 1e-9) continue;
    if (mistakes.some((x) => Math.abs(x.value - m.value) < 1e-9)) continue;
    mistakes.push(m);
  }
  return { skill, level: lvl, theme: th, form: 'int', requireFraction: false, simplest: false, ...t, mistakes };
}

// A worked example: the same kind of problem, solved step by step, shown before she tries one herself.
export function makeExample(skill, level, theme, rng) {
  const t = makeTask(skill, level, theme, rng);
  return { prompt: t.prompt, steps: t.hints, answerText: t.answerText };
}

// Plain numbers only: "$1,200" -> 1200. Fractions are read by parseAnswer.
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== 'string') return NaN;
  const s = raw.replace(/[$,\s]/g, '').replace(/[−–]/g, '-');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

// Numbers or fractions: "-3", "12.50", "3/4", "-3/4". Returns null when it cannot be read.
export function parseAnswer(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw, isFraction: false } : null;
  if (typeof raw !== 'string' || raw.length > 20) return null;
  const s = raw.replace(/[$,\s%]/g, '').replace(/[−–]/g, '-');
  const f = /^(-?)(\d+)\/(\d+)$/.exec(s);
  if (f) {
    const n = Number(f[2]);
    const d = Number(f[3]);
    if (d === 0) return null;
    return { value: (f[1] ? -1 : 1) * (n / d), isFraction: true, n, d };
  }
  const v = parseNumber(s);
  return Number.isFinite(v) ? { value: v, isFraction: false } : null;
}

// { correct, parsed, note } where note explains a near miss (equal but not simplified, and so on).
export function gradeAnswer(task, raw) {
  const p = parseAnswer(raw);
  if (!p) return { correct: false, parsed: null, note: 'Type a number like 12, -3, 4.5 or 3/4.' };
  if (Math.abs(p.value - task.answer) > 1e-9) return { correct: false, parsed: p };
  if (task.requireFraction && !p.isFraction && !Number.isInteger(task.answer)) {
    return { correct: false, parsed: p, note: "That's the right amount. Write it as a fraction with the / key." };
  }
  if (task.simplest && p.isFraction && gcd(p.n, p.d) !== 1) {
    return { correct: false, parsed: p, note: 'That is equal, but it can be simplified more. Divide the top and bottom by the same number again.' };
  }
  return { correct: true, parsed: p };
}

export function checkAnswer(task, raw) {
  return gradeAnswer(task, raw).correct;
}

// Feedback for a wrong answer: a near miss, a known mistake for this problem, then general slips.
export function diagnose(task, raw) {
  const g = gradeAnswer(task, raw);
  if (g.correct) return null;
  if (g.note) return g.note;
  const v = g.parsed?.value;
  if (!Number.isFinite(v)) return null;
  const known = (task.mistakes || []).find((m) => Math.abs(m.value - v) < 1e-9);
  if (known) return known.text;
  if (task.answer !== 0 && Math.abs(v + task.answer) < 1e-9) return 'So close. Check the sign: should it be positive or negative?';
  if (task.answer !== 0 && [10, 100, 0.1, 0.01].some((f) => Math.abs(v - task.answer * f) < 1e-9)) return 'The digits are right. Check where the decimal point goes.';
  return null;
}
