#!/usr/bin/env node
// Builds the district and school lists for the owner's sales targeting page (/admin/prospects/).
//
// Source: the Urban Institute's Education Data Portal API (free, no key), which republishes
//   - the NCES Common Core of Data (CCD) directory: every public school district and school, and
//   - EDFacts state assessment results: the share of students proficient in math, by district and school.
// Math scores are for grades 6, 7 and 8 combined, weighted by how many students tested.
//
// Writes one file per state to api/data/schools/<ST>.json plus api/data/schools/index.json.
// The server reads these files from disk, so the page works with no outside calls once they exist.
//
// Run:  node api/tools/build-school-data.mjs            (all 50 states and DC, about 20 to 40 minutes)
//       node api/tools/build-school-data.mjs GA FL      (only these states)
//       STATES="GA FL" node api/tools/build-school-data.mjs
// The "School data" GitHub Action runs this and commits the result.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES } from '../src/states.js';

const BASE = process.env.EDUDATA_BASE || 'https://educationdata.urban.org/api/v1';
const OUT = process.env.OUT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'schools');
// newest first; the first year with data for a state is used
const DIRECTORY_YEARS = (process.env.DIRECTORY_YEARS || '2025 2024 2023 2022').split(/\s+/).map(Number);
const ASSESSMENT_YEARS = (process.env.ASSESSMENT_YEARS || '2023 2022 2021 2020 2018').split(/\s+/).map(Number);
const MIDDLE_GRADES = [6, 7, 8];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET one URL as JSON. Returns null for 404 or 403: the API answers a year or grade it does not
// have with one of those.
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'runway-rally-school-data/1.0' } });
      if (res.status === 404 || res.status === 403) {
        if (process.env.VERBOSE) console.log(`  ${res.status} ${url}`);
        return null;
      }
      if (res.ok) return await res.json();
      if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt >= 3) throw err;
    }
    await sleep(2000 * attempt);
  }
}

// Follows the API's "next" links and returns every row.
async function getAll(path) {
  const rows = [];
  let url = `${BASE}/${path}`;
  while (url) {
    const page = await getJson(url);
    if (!page) break;
    rows.push(...(page.results || []));
    url = page.next || null;
    await sleep(150);
  }
  return rows;
}

// The API uses negative numbers for missing (-1), not applicable (-2) and suppressed (-3).
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const grade = (v) => (typeof v === 'number' && v >= -1 && v <= 15 ? v : null); // -1 is pre-K, 0 is K
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null);
const OPEN = new Set([1, 3, 4, 5, 8]); // open, new, added, changed agency, reopened
const round1 = (x) => Math.round(x * 10) / 10;

function servesMiddleGrades(lo, hi) {
  if (lo === null || hi === null) return null;
  return lo <= 8 && Math.min(hi, 12) >= 6;
}

// Weighted average of the math proficiency midpoint across grades 6 to 8, per id.
function mathByGrade(rowsByGrade, idField) {
  const acc = new Map();
  for (const rows of rowsByGrade) {
    for (const r of rows) {
      if (r.race !== undefined && r.race !== 99) continue;
      if (r.sex !== undefined && r.sex !== 99) continue;
      const id = r[idField];
      const n = num(r.math_test_num_valid);
      let pct = num(r.math_test_pct_prof_midpt);
      if (pct === null && num(r.math_test_pct_prof_low) !== null && num(r.math_test_pct_prof_high) !== null) {
        pct = (r.math_test_pct_prof_low + r.math_test_pct_prof_high) / 2;
      }
      if (!id || !n || pct === null || pct > 100) continue;
      const a = acc.get(id) || { n: 0, sum: 0 };
      a.n += n;
      a.sum += pct * n;
      acc.set(id, a);
    }
  }
  const out = new Map();
  for (const [id, a] of acc) out.set(String(id), { pct: round1(a.sum / a.n), n: a.n });
  return out;
}

async function firstYearWithRows(years, pathFor) {
  for (const y of years) {
    const rows = await getAll(pathFor(y));
    if (rows.length) return { year: y, rows };
  }
  return { year: null, rows: [] };
}

// Years the API does not have (it answers them with an error); learned on the first state, skipped after.
const missingYears = new Set();

// The newest year with results, plus the next older one (so a pandemic-era year can be read next to
// a pre-pandemic one).
async function middleGradeMath(level, idField, fips) {
  const found = [];
  for (const y of ASSESSMENT_YEARS) {
    if (found.length === 2) break;
    if (missingYears.has(`${level}:${y}`)) continue;
    const byGrade = [];
    try {
      for (const g of MIDDLE_GRADES) byGrade.push(await getAll(`${level}/edfacts/assessments/${y}/grade-${g}/?fips=${fips}`));
    } catch (err) {
      if (process.env.VERBOSE) console.log(`  ${level} assessments ${y}: ${err.message}`);
      missingYears.add(`${level}:${y}`);
      continue;
    }
    const math = mathByGrade(byGrade, idField);
    if (math.size) found.push({ year: y, math });
  }
  const none = { year: null, math: new Map() };
  return { latest: found[0] || none, previous: found[1] || none };
}

async function buildState(st) {
  const f = st.fips;
  const dir = await firstYearWithRows(DIRECTORY_YEARS, (y) => `schools/ccd/directory/${y}/?fips=${f}`);
  if (!dir.year) throw new Error(`no school directory data for ${st.code}`);
  const districtRows = await getAll(`school-districts/ccd/directory/${dir.year}/?fips=${f}`);
  const dAll = await middleGradeMath('school-districts', 'leaid', f);
  const sAll = await middleGradeMath('schools', 'ncessch', f);
  const dMath = dAll.latest;
  const sMath = sAll.latest;

  const schools = [];
  for (const r of dir.rows) {
    if (r.school_status !== undefined && r.school_status !== null && !OPEN.has(r.school_status)) continue;
    const id = r.ncessch ? String(r.ncessch) : null;
    const name = text(r.school_name);
    if (!id || !name) continue;
    const lo = grade(r.lowest_grade_offered);
    const hi = grade(r.highest_grade_offered);
    const enrollment = num(r.enrollment);
    const frl = num(r.free_or_reduced_price_lunch);
    const m = sMath.math.get(id);
    const mp = sAll.previous.math.get(id);
    schools.push([
      id,
      r.leaid ? String(r.leaid) : null,
      name,
      text(r.city_location),
      lo,
      hi,
      enrollment,
      r.charter === 1 ? 1 : 0,
      r.title_i_eligible === 1 ? 1 : 0,
      enrollment && frl !== null && frl <= enrollment ? Math.round((frl / enrollment) * 100) : null,
      m ? m.pct : null,
      m ? m.n : null,
      text(r.phone),
      mp ? mp.pct : null,
    ]);
  }

  const bySchoolDistrict = new Map();
  for (const s of schools) {
    const d = bySchoolDistrict.get(s[1]) || { all: 0, mid: 0 };
    d.all++;
    if (servesMiddleGrades(s[4], s[5])) d.mid++;
    bySchoolDistrict.set(s[1], d);
  }
  const districts = [];
  const seen = new Set();
  for (const r of districtRows) {
    const id = r.leaid ? String(r.leaid) : null;
    const name = text(r.lea_name);
    if (!id || !name || seen.has(id)) continue;
    const counts = bySchoolDistrict.get(id);
    if (!counts) continue; // only districts with at least one open school
    seen.add(id);
    const m = dMath.math.get(id);
    const mp = dAll.previous.math.get(id);
    districts.push([id, name, text(r.city_location), num(r.agency_type), text(r.phone), num(r.enrollment), counts.all, counts.mid, m ? m.pct : null, m ? m.n : null, mp ? mp.pct : null]);
  }
  // schools whose district is missing from the district directory still get a row
  for (const s of schools) {
    if (s[1] && !seen.has(s[1])) {
      seen.add(s[1]);
      const counts = bySchoolDistrict.get(s[1]);
      const m = dMath.math.get(s[1]);
      const mp = dAll.previous.math.get(s[1]);
      districts.push([s[1], `District ${s[1]}`, null, null, null, null, counts.all, counts.mid, m ? m.pct : null, m ? m.n : null, mp ? mp.pct : null]);
    }
  }

  // state average across districts, weighted by students tested
  const average = (math) => {
    let n = 0;
    let sum = 0;
    for (const m of math.values()) {
      n += m.n;
      sum += m.pct * m.n;
    }
    return n ? { pct: round1(sum / n), n } : null;
  };

  districts.sort((a, b) => a[1].localeCompare(b[1]));
  schools.sort((a, b) => a[2].localeCompare(b[2]));
  return {
    state: st.code,
    builtAt: new Date().toISOString().slice(0, 10),
    source: 'NCES Common Core of Data directory and EDFacts state assessments, via the Urban Institute Education Data Portal',
    directoryYear: dir.year,
    assessmentYear: dMath.year ?? sMath.year,
    stateMath: average(dMath.math),
    previousAssessmentYear: dAll.previous.year ?? sAll.previous.year,
    previousStateMath: average(dAll.previous.math),
    districtColumns: ['id', 'name', 'city', 'agencyType', 'phone', 'enrollment', 'schools', 'middleSchools', 'math', 'mathTested', 'mathPrevious'],
    districts,
    schoolColumns: ['id', 'district', 'name', 'city', 'lowGrade', 'highGrade', 'enrollment', 'charter', 'titleI', 'lowIncomePct', 'math', 'mathTested', 'phone', 'mathPrevious'],
    schools,
  };
}

const wanted = (process.argv.slice(2).join(' ') || process.env.STATES || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
const list = wanted.length ? STATES.filter((s) => wanted.includes(s.code)) : STATES;
if (wanted.length && list.length !== wanted.length) {
  console.error('unknown state code in:', wanted.join(' '));
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
let index = { states: {} };
try {
  index = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8'));
} catch {
  /* first run */
}
const failed = [];
for (const st of list) {
  const t0 = Date.now();
  try {
    const data = await buildState(st);
    await writeFile(join(OUT, `${st.code}.json`), JSON.stringify(data) + '\n');
    index.states[st.code] = {
      builtAt: data.builtAt,
      directoryYear: data.directoryYear,
      assessmentYear: data.assessmentYear,
      districts: data.districts.length,
      schools: data.schools.length,
      stateMath: data.stateMath?.pct ?? null,
      previousAssessmentYear: data.previousAssessmentYear,
      previousStateMath: data.previousStateMath?.pct ?? null,
    };
    await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
    console.log(`${st.code}: ${data.districts.length} districts, ${data.schools.length} schools, directory ${data.directoryYear}, math ${data.assessmentYear ?? 'none'} and ${data.previousAssessmentYear ?? 'none'} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (err) {
    failed.push(st.code);
    console.error(`${st.code}: failed: ${err.message}`);
  }
}
if (failed.length) {
  console.error(`failed: ${failed.join(' ')}`);
  process.exit(failed.length === list.length ? 1 : 0);
}
