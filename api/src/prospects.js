// Sales targeting for the server owner: every district and school in a state, their grade 6 to 8 math
// results, and a pitch written for that state's math standards. Owner only (see server.js); teachers and
// students never see it. The data files come from api/tools/build-school-data.mjs.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, STATE_BY_CODE } from './states.js';
import { SKILLS } from './skills.js';

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/schools', import.meta.url));

// Common Core State Standards for Mathematics codes each skill practices, at cluster or standard level.
// Used only when a state's standards are Common Core (basis 'common-core'); other states get topics by domain.
export const CCSS = {
  frac_div: ['6.NS.A.1'],
  dec_mult_div: ['6.NS.B.3'],
  ratio: ['6.RP.A.1'],
  unit_rate: ['6.RP.A.2', '6.RP.A.3b'],
  fdp_convert: ['6.RP.A.3c'],
  percent_of: ['6.RP.A.3c'],
  expr_eval: ['6.EE.A.2c'],
  eq_one_step: ['6.EE.B.7'],
  inequalities: ['6.EE.B.8', '7.EE.B.4b'],
  coord_plane: ['6.NS.C.8'],
  area_volume: ['6.G.A.1', '6.G.A.2', '6.G.A.4'],
  int_add: ['7.NS.A.1'],
  percent: ['7.RP.A.3'],
  int_mult: ['7.NS.A.2'],
  expr_equiv: ['7.EE.A.1'],
  eq_two_step: ['7.EE.B.4a'],
  proportion: ['7.RP.A.2', '7.G.A.1'],
  circles: ['7.G.B.4'],
  probability: ['7.SP.C.5', '7.SP.C.7'],
  exponents: ['8.EE.A.1'],
  sq_roots: ['8.EE.A.2'],
  sci_notation: ['8.EE.A.3', '8.EE.A.4'],
  eq_multi_step: ['8.EE.C.7'],
  slope: ['8.EE.B.6', '8.F.B.4'],
  linear_models: ['8.F.B.4', '8.SP.A.3'],
  systems: ['8.EE.C.8'],
  pythagorean: ['8.G.B.7', '8.G.B.8'],
  volume_curved: ['8.G.C.9'],
};

const DOMAIN_NAMES = {
  RP: 'Ratios and Proportional Relationships',
  NS: 'The Number System',
  EE: 'Expressions and Equations',
  G: 'Geometry',
  SP: 'Statistics and Probability',
  F: 'Functions',
};

// Built-in skills by the grade where they are first taught (grades 6 to 8), plus the foundations count.
export function coverage() {
  const byGrade = { 6: [], 7: [], 8: [] };
  let foundations = 0;
  for (const [id, s] of Object.entries(SKILLS)) {
    if (s.grade >= 6 && s.grade <= 8) byGrade[s.grade].push({ id, name: s.name, ccss: CCSS[id] || [], georgia: s.codes || [] });
    else if (s.grade < 6) foundations++;
  }
  const domains = new Set();
  for (const list of Object.values(byGrade)) for (const s of list) for (const c of s.ccss) domains.add(c.split('.')[1]);
  return { byGrade, foundations, domains: [...domains].map((d) => DOMAIN_NAMES[d]).filter(Boolean) };
}

// Urban's year is the fall of the school year: 2021 means 2021-22.
export const schoolYear = (y) => (y ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : null);

const AGENCY_TYPES = {
  1: 'School district',
  2: 'District in a supervisory union',
  3: 'Supervisory union',
  4: 'Regional service agency',
  5: 'State agency',
  6: 'Federal agency',
  7: 'Charter agency',
  8: 'Other agency',
  9: 'Specialized agency',
};

const gradeLabel = (g) => (g === null || g === undefined ? '?' : g === -1 ? 'PK' : g === 0 ? 'K' : g >= 13 ? 'UG' : String(g));
export const gradeSpan = (lo, hi) => (lo === null && hi === null ? '' : `${gradeLabel(lo)}-${gradeLabel(hi)}`);
export const servesMiddleGrades = (lo, hi) => lo !== null && hi !== null && lo <= 8 && Math.min(hi, 12) >= 6;

// Some states send names in capitals ("A P SOLIS MIDDLE"); show them as "A P Solis Middle", keeping
// school abbreviations like ISD or STEM in capitals.
const KEEP_UPPER = new Set(['ISD', 'CISD', 'MSD', 'USD', 'CUSD', 'CSD', 'ESD', 'UFSD', 'SD', 'RSD', 'SAU', 'ES', 'MS', 'HS', 'JHS', 'MHS', 'EL', 'STEM', 'STEAM', 'PK', 'II', 'III', 'IV', 'KIPP', 'IDEA', 'YES', 'NYC', 'PS', 'IS', 'JHS', 'DC', 'K-8', 'K-12', 'ROTC', 'AP', 'IB']);
export function tidyName(name) {
  if (!name || /[a-z]/.test(name)) return name;
  return name.replace(/[A-Z0-9][A-Z0-9'.&-]*/g, (w) => (KEEP_UPPER.has(w) || w.length === 1 || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()));
}

const rows = (cols, list) => list.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])));

// 1 = lowest math result in the state; null when there is no result.
function rankLowest(list) {
  const scored = list.filter((x) => x.math !== null).sort((a, b) => a.math - b.math);
  scored.forEach((x, i) => {
    x.mathRank = i + 1;
    x.mathPercentile = Math.round(((i + 1) / scored.length) * 100);
  });
  return scored.length;
}

export function createProspects({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const cache = new Map(); // state code -> expanded data, newest last

  async function readIndex() {
    try {
      return JSON.parse(await readFile(join(dataDir, 'index.json'), 'utf8')).states || {};
    } catch {
      return {};
    }
  }

  async function states() {
    const index = await readIndex();
    return STATES.map((s) => ({ ...s, data: index[s.code] || null }));
  }

  async function state(code) {
    const meta = STATE_BY_CODE[code];
    if (!meta) return null;
    if (cache.has(code)) {
      const hit = cache.get(code);
      cache.delete(code);
      cache.set(code, hit);
      return hit;
    }
    let raw;
    try {
      raw = JSON.parse(await readFile(join(dataDir, `${code}.json`), 'utf8'));
    } catch {
      return { ...meta, available: false, districts: [], schools: [] };
    }
    const districts = rows(raw.districtColumns, raw.districts).map((d) => ({ ...d, name: tidyName(d.name), city: tidyName(d.city), agency: AGENCY_TYPES[d.agencyType] || null, mathRank: null, mathPercentile: null }));
    const schools = rows(raw.schoolColumns, raw.schools).map((s) => ({
      ...s,
      name: tidyName(s.name),
      city: tidyName(s.city),
      grades: gradeSpan(s.lowGrade, s.highGrade),
      middle: servesMiddleGrades(s.lowGrade, s.highGrade),
      charter: s.charter === 1,
      titleI: s.titleI === 1,
      mathRank: null,
      mathPercentile: null,
    }));
    const districtsScored = rankLowest(districts);
    const schoolsScored = rankLowest(schools);
    const out = {
      ...meta,
      available: true,
      builtAt: raw.builtAt,
      source: raw.source,
      directoryYear: raw.directoryYear,
      directorySchoolYear: schoolYear(raw.directoryYear),
      assessmentYear: raw.assessmentYear,
      assessmentSchoolYear: schoolYear(raw.assessmentYear),
      stateMath: raw.stateMath,
      previousAssessmentYear: raw.previousAssessmentYear ?? null,
      previousAssessmentSchoolYear: schoolYear(raw.previousAssessmentYear),
      previousStateMath: raw.previousStateMath ?? null,
      districtsScored,
      schoolsScored,
      districts,
      schools,
    };
    cache.set(code, out);
    while (cache.size > 3) cache.delete(cache.keys().next().value);
    return out;
  }

  return { states, state };
}

// ---------------- improvement steps ----------------

// "5, 10, 15" -> [5, 10, 15]. Whole or half points from 0.5 to 50, at most 6, sorted; the default when empty or bad.
export const DEFAULT_STEPS = [5, 10, 15];
export function parseSteps(raw) {
  const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
  const nums = [...new Set(text.split(/[\s,;+]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 50).map((n) => Math.round(n * 2) / 2))].sort((a, b) => a - b);
  return nums.length ? nums.slice(0, 6) : [...DEFAULT_STEPS];
}

// The current share proficient next to what it would be at each step up, and about how many more
// students that is (of those tested). Illustrative arithmetic, not a forecast.
export function projections({ math, tested = null, statePct = null, steps = DEFAULT_STEPS }) {
  if (math === null || math === undefined) return null;
  const more = (pts) => (tested ? Math.round((tested * pts) / 100) : null);
  const rows = steps.map((step) => {
    const pct = Math.min(100, Math.round((math + step) * 10) / 10);
    return { label: `+${step} points`, step, pct, moreStudents: more(pct - math) };
  });
  const toState = statePct !== null && statePct !== undefined && statePct > math ? Math.round((statePct - math) * 10) / 10 : null;
  return { current: math, tested, rows, toState: toState ? { step: toState, pct: statePct, moreStudents: more(toState) } : null };
}

// ---------------- the pitch ----------------

const clean = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

function comparePhrase(pct, statePct) {
  if (pct === null || statePct === null || statePct === undefined) return null;
  const diff = pct - statePct;
  if (Math.abs(diff) < 2) return `about the same as the state's ${statePct}%`;
  return diff < 0 ? `below the state's ${statePct}%` : `above the state's ${statePct}%`;
}

// "the Ohio Learning Standards" but "Georgia's K-12 Mathematics Standards"
export const theStandards = (st) => (/^[A-Z][A-Za-z. ]*'s /.test(st.standards) ? st.standards : `the ${st.standards}`);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Builds a short email and a longer proposal for one district, or one school in it.
// input: { st (from state()), district, school?, price?, sender: { name, org, email }, recipient? }
export function buildPitch({ st, district, school = null, price = '', sender = {}, recipient = '', steps = DEFAULT_STEPS }) {
  const cov = coverage();
  const target = school || district;
  const targetName = target.name;
  const districtName = district.name;
  const where = school ? `${school.name} in ${districtName}` : districtName;
  const year = schoolYear(st.assessmentYear);
  const statePct = st.stateMath?.pct ?? null;
  const math = target.math ?? (school ? district.math : null);
  const mathOf = target.math !== null && target.math !== undefined ? targetName : districtName;
  const cmp = comparePhrase(math, statePct);
  const senderName = clean(sender.name, 80) || 'Barry';
  const org = clean(sender.org, 120);
  const email = clean(sender.email, 120);
  const priceText = clean(price, 200);
  const hello = clean(recipient, 80) ? `Hi ${clean(recipient, 80)},` : 'Hello,';
  const ccssState = st.basis === 'common-core';
  const georgia = st.code === 'GA'; // the app's skills carry Georgia's own codes

  const dataSentence =
    math !== null && year
      ? `In ${year}, about ${math}% of grade 6 to 8 students in ${mathOf} scored proficient in math on ${st.name}'s state tests${cmp ? `, ${cmp}` : ''}.`
      : null;
  // the year before, usually the last one before the pandemic
  const prevYear = schoolYear(st.previousAssessmentYear);
  const prev = target.math !== null && target.math !== undefined ? target.mathPrevious : school ? district.mathPrevious : null;
  const prevSentence =
    prev !== null && prev !== undefined && prevYear
      ? `In ${prevYear}, it was ${prev}%${st.previousStateMath?.pct !== undefined && st.previousStateMath?.pct !== null ? ` against the state's ${st.previousStateMath.pct}%` : ''}.`
      : null;

  const topicsShort = ['ratios and percents', 'negative numbers', 'expressions and equations', 'slope and linear functions', 'geometry', 'probability'];
  const standardsSentence =
    georgia
      ? `It practices the grade 6 to 8 topics in ${theStandards(st)}, and every skill is tagged with the Georgia standard it practices.`
      : st.basis === 'common-core'
      ? `It practices the grade 6 to 8 topics in ${theStandards(st)}, and I can show you the Common Core standard behind each skill.`
      : st.basis === 'adapted'
        ? `It practices the grade 6 to 8 topics in ${theStandards(st)}: ${list(topicsShort)}.`
        : `It practices the core grade 6 to 8 topics that ${theStandards(st)} cover: ${list(topicsShort)}.`;

  const privacySentence = st.privacyLaw
    ? `Students sign in with a class code and a nickname, so we never ask for their names or email addresses. There are no ads and no data sales, and we'll work through the agreement ${st.privacyLaw} calls for.`
    : 'Students sign in with a class code and a nickname, so we never ask for their names or email addresses. There are no ads and no data sales, and we will sign your student data privacy agreement.';

  const signature = [senderName, org, email].filter(Boolean).join('\n');
  const subject = `Grade 6 to 8 math practice for ${targetName}`;

  const emailText = [
    hello,
    '',
    [`I'm ${senderName}, and I built Runway Rally, a math practice app for grades 6 to 8 where students earn fashion-design pieces for their designer by solving problems.`, dataSentence].filter(Boolean).join(' '),
    '',
    `${standardsSentence} A short skills check places each student, and teachers can turn their own homework into practice from a photo.`,
    '',
    privacySentence,
    '',
    [`Would you be open to a 15-minute demo for ${where}?`, priceText ? `Pricing: ${priceText}.` : null].filter(Boolean).join(' '),
    '',
    'Thank you,',
    signature,
  ].join('\n');

  // ----- proposal -----
  const p = [];
  p.push(`Runway Rally for ${where}`);
  p.push(`A proposal for grade 6 to 8 math practice in ${st.name}`);
  p.push('');
  p.push(`Why ${targetName}`);
  if (dataSentence) {
    p.push(dataSentence);
    if (prevSentence) p.push(prevSentence);
    if (school && school.math === null && district.math !== null) p.push(`School-level results were not reported for ${school.name}, so this is the district figure.`);
    if (target.mathRank && (school ? st.schoolsScored : st.districtsScored)) {
      const of = school ? st.schoolsScored : st.districtsScored;
      p.push(`That ranks ${target.mathRank} of ${of} ${school ? 'schools' : 'districts'} with reported results in ${st.name}, counting from the lowest.`);
    }
  } else {
    p.push(`${st.name}'s published grade 6 to 8 math results do not include a figure for ${targetName}.`);
  }
  if (school) {
    const facts = [school.grades ? `grades ${school.grades}` : null, school.enrollment ? `${school.enrollment.toLocaleString('en-US')} students` : null, school.titleI ? 'Title I eligible' : null, school.lowIncomePct !== null ? `${school.lowIncomePct}% qualify for free or reduced-price lunch` : null].filter(Boolean);
    if (facts.length) p.push(`${school.name}: ${facts.join(', ')}.`);
    if (school.titleI) p.push('As a Title I school, supplemental math practice like this is often an allowable use of Title I funds; please check with your federal programs office.');
  } else {
    const facts = [district.enrollment ? `${district.enrollment.toLocaleString('en-US')} students` : null, district.middleSchools ? `${district.middleSchools} schools serving grades 6 to 8` : null].filter(Boolean);
    if (facts.length) p.push(`${districtName}: ${facts.join(', ')}.`);
  }
  const tested = target.math !== null && target.math !== undefined ? target.mathTested : school ? district.mathTested : null;
  const proj = projections({ math, tested, statePct, steps: parseSteps(steps) });
  if (proj) {
    p.push('');
    p.push('What improvement could look like (illustrative)');
    p.push(`These figures are simple arithmetic from today's score, not promised or predicted results. Today: ${proj.current}% of grade 6 to 8 students in ${mathOf} proficient in math (${st.name} state tests, ${year}, EDFacts)${proj.tested ? `, ${proj.tested.toLocaleString('en-US')} students tested` : ''}.`);
    const lines = [['', 'Proficient', proj.tested ? 'About this many more students' : null]];
    lines.push(['Today', `${proj.current}%`, proj.tested ? '' : null]);
    for (const r of proj.rows) lines.push([r.label, `${r.pct}%`, r.moreStudents !== null ? r.moreStudents.toLocaleString('en-US') : null]);
    if (proj.toState) lines.push([`State average (+${proj.toState.step})`, `${proj.toState.pct}%`, proj.toState.moreStudents !== null ? proj.toState.moreStudents.toLocaleString('en-US') : null]);
    const w0 = Math.max(...lines.map((l) => l[0].length));
    const w1 = Math.max(...lines.map((l) => l[1].length));
    for (const l of lines) p.push([l[0].padEnd(w0), l[1].padEnd(w1), l[2] ?? ''].join('   ').trimEnd());
  }
  p.push('');
  p.push(`How it fits ${theStandards(st)}`);
  if (georgia) p.push('Every built-in skill is tagged with the Georgia standard it practices:');
  else if (ccssState) p.push('Each built-in skill, with the Common Core standards it practices:');
  else if (st.basis === 'adapted') p.push(`${st.name}'s standards grew out of the Common Core, and Runway Rally's skills line up with these domains: ${list(cov.domains)}. The built-in skills are:`);
  else p.push(`${st.name} wrote its own math standards. Runway Rally's built-in skills cover these grade 6 to 8 topics, and we can provide a skill-by-skill crosswalk to ${theStandards(st)} on request:`);
  for (const g of [6, 7, 8]) {
    const names = cov.byGrade[g].map((s) => (georgia && s.georgia.length ? `${s.name} (${s.georgia.join(', ')})` : ccssState && s.ccss.length ? `${s.name} (${s.ccss.join(', ')})` : s.name));
    p.push(`- Grade ${g}: ${names.join('; ')}.`);
  }
  p.push(`- Catch-up: ${cov.foundations} grade 3 to 5 skills (multiplying, dividing, fractions and decimals) for students who are behind.`);
  p.push("- Teacher homework: a teacher's own assignment can become practice by uploading a photo of it.");
  if (st.note) p.push(`Note: ${st.note}`);
  p.push('');
  p.push('What students do');
  p.push('- Solve short math "commissions" with a number pad, layered hints and worked examples, and earn fashion pieces for a designer they style themselves.');
  p.push('- A short skills check places each student; the app then adjusts difficulty, gives feedback on the specific mistake, brings skills back for review, and repairs missing prerequisites.');
  p.push('- Rewards are earned only by solving problems. There are no ads and nothing to buy.');
  p.push('- Teachers can turn on Spanish for any student, from the first question.');
  p.push('');
  p.push('What teachers get');
  p.push('- A class mastery heat map by skill, suggested small groups, a list of who has not started, and CSV export.');
  p.push('- Class codes to share, or sign-in straight from Brightspace (LTI 1.3) with grades sent to the gradebook.');
  p.push('- It runs in any browser and installs on Chromebooks, tablets and phones.');
  p.push('');
  p.push('Student privacy');
  p.push('- Students join with a class code and a nickname. No student names, emails or photos are collected, and the camera is never used.');
  p.push('- No ads, no data sales, a public privacy policy, a written retention schedule, deletion and per-student export, and encrypted backups.');
  p.push(st.privacyLaw ? `- We will work through the agreement ${st.privacyLaw} calls for, and sign your district's data privacy agreement.` : "- We will sign your district's student data privacy agreement.");
  p.push('');
  p.push('Getting started');
  p.push(`- A pilot with one or more grade 6 to 8 math classes at ${where}. A teacher creates a class, shares its code, and students can start the same day.`);
  p.push('- A 15-minute demo for teachers and the principal.');
  if (priceText) {
    p.push('');
    p.push('Cost');
    p.push(`- ${cap(priceText)}.`);
  }
  p.push('');
  p.push('Contact');
  p.push(signature);
  p.push('');
  p.push(`Math results: ${st.name} state tests, grades 6 to 8 combined${year ? `, ${year}` : ''}, as reported to the U.S. Department of Education (EDFacts). School and district details: NCES Common Core of Data${st.directorySchoolYear ? `, ${st.directorySchoolYear}` : ''}.`);

  return { subject, email: emailText, proposal: p.join('\n') };
}
