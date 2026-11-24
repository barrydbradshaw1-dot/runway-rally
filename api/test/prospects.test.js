import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';
import { MemoryStore } from '../src/store.js';
import { STATES } from '../src/states.js';
import { SKILLS } from '../src/skills.js';
import { CCSS, coverage, buildPitch, createProspects, gradeSpan, servesMiddleGrades, schoolYear } from '../src/prospects.js';

const DATA = fileURLToPath(new URL('./fixtures/schools', import.meta.url));
const OWNER = { 'x-admin-token': 'dev-admin' };

async function boot() {
  const store = new MemoryStore();
  await store.init();
  const { server } = createApp({ store, env: { NODE_ENV: 'test', PROSPECTS_DATA_DIR: DATA }, seed: 3 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { server, call };
}

test('the state list has the 50 states and DC, each with standards', () => {
  assert.equal(STATES.length, 51);
  assert.equal(new Set(STATES.map((s) => s.code)).size, 51);
  assert.equal(new Set(STATES.map((s) => s.fips)).size, 51);
  for (const s of STATES) {
    assert.ok(s.standards.length > 5, s.code);
    assert.ok(['common-core', 'adapted', 'own'].includes(s.basis), s.code);
  }
});

test('every grade 6 to 8 skill has Common Core codes', () => {
  for (const [id, s] of Object.entries(SKILLS)) {
    if (s.grade >= 6) assert.ok(CCSS[id]?.length, `${id} needs Common Core codes`);
  }
  for (const codes of Object.values(CCSS)) for (const c of codes) assert.match(c, /^[678]\.(RP|NS|EE|G|SP|F)\.[A-C]\.\d[a-c]?$/);
  const cov = coverage();
  assert.equal(cov.byGrade[6].length + cov.byGrade[7].length + cov.byGrade[8].length + cov.foundations, Object.keys(SKILLS).length);
});

test('grades and school years read plainly', () => {
  assert.equal(gradeSpan(-1, 5), 'PK-5');
  assert.equal(gradeSpan(0, 8), 'K-8');
  assert.equal(servesMiddleGrades(6, 8), true);
  assert.equal(servesMiddleGrades(-1, 5), false);
  assert.equal(servesMiddleGrades(9, 12), false);
  assert.equal(servesMiddleGrades(7, 12), true);
  assert.equal(schoolYear(2020), '2020-21');
  assert.equal(schoolYear(2009), '2009-10');
});

test('only the owner can use the sales pages', async () => {
  const { server, call } = await boot();
  try {
    assert.equal((await call('/api/admin/prospects/states')).status, 403);
    const t = await call('/api/admin/teachers', { method: 'POST', headers: OWNER, body: { name: 'Ms Lee' } });
    const teacher = { 'x-admin-token': t.json.key };
    assert.equal((await call('/api/admin/prospects/states', { headers: teacher })).status, 403);
    assert.equal((await call('/api/admin/prospects/state/DE', { headers: teacher })).status, 403);
    assert.equal((await call('/api/admin/prospects/pitch', { method: 'POST', headers: teacher, body: { state: 'DE', district: '1000001' } })).status, 403);
    const list = await call('/api/admin/prospects/states', { headers: OWNER });
    assert.equal(list.status, 200);
    assert.equal(list.json.states.length, 51);
    assert.equal(list.json.states.find((s) => s.code === 'DE').data.schools, 3);
    assert.equal(list.json.states.find((s) => s.code === 'GA').data, null);
  } finally {
    server.close();
  }
});

test('a state lists its districts and schools, lowest math ranked first', async () => {
  const { server, call } = await boot();
  try {
    const r = await call('/api/admin/prospects/state/DE', { headers: OWNER });
    assert.equal(r.status, 200);
    assert.equal(r.json.available, true);
    assert.equal(r.json.standards, 'Common Core State Standards for Mathematics');
    assert.equal(r.json.districts.length, 2);
    const cap = r.json.districts.find((d) => d.id === '1000001');
    assert.equal(cap.mathRank, 1);
    assert.equal(cap.agency, 'School district');
    const alpha = r.json.schools.find((s) => s.id === '100000100001');
    assert.equal(alpha.middle, true);
    assert.equal(alpha.grades, '6-8');
    assert.equal(alpha.titleI, true);
    assert.equal(r.json.schools.find((s) => s.id === '100000100002').middle, false);
    // a state with no data file yet
    const ga = await call('/api/admin/prospects/state/GA', { headers: OWNER });
    assert.equal(ga.status, 200);
    assert.equal(ga.json.available, false);
    assert.equal((await call('/api/admin/prospects/state/ZZ', { headers: OWNER })).status, 404);
  } finally {
    server.close();
  }
});

test('the pitch names the state standards, the scores and the sender', async () => {
  const { server, call } = await boot();
  try {
    const body = { state: 'DE', district: '1000001', price: 'free for teachers, $1,500 a year per school', sender: { name: 'Barry', org: 'Nexus Data Engineering', email: 'hello@example.com' }, recipient: 'Dr. Lee' };
    const r = await call('/api/admin/prospects/pitch', { method: 'POST', headers: OWNER, body });
    assert.equal(r.status, 200);
    assert.match(r.json.subject, /Capital School District/);
    assert.match(r.json.email, /^Hi Dr\. Lee,/);
    assert.match(r.json.email, /about 21% of Capital School District's grade 6 to 8 students/);
    assert.match(r.json.email, /below the state's 33%/);
    assert.match(r.json.email, /Common Core State Standards for Mathematics/);
    assert.match(r.json.email, /free for teachers, \$1,500 a year per school/);
    assert.match(r.json.email, /Nexus Data Engineering\nhello@example\.com$/);
    assert.match(r.json.proposal, /In 2018-19, it was 30% against the state's 40%/);
    assert.match(r.json.proposal, /Ratios \(6\.RP\.A\.1\)/);
    assert.match(r.json.proposal, /ranks 1 of 2 districts/);
    // a school in that district; it has no school-level score, so the district figure is used and said so
    const s = await call('/api/admin/prospects/pitch', { method: 'POST', headers: OWNER, body: { ...body, school: '100000100001' } });
    assert.equal(s.status, 200);
    assert.match(s.json.subject, /Alpha Middle/);
    assert.match(s.json.proposal, /School-level results were not reported for Alpha Middle/);
    assert.match(s.json.proposal, /Title I/);
    // a school from another district is refused
    assert.equal((await call('/api/admin/prospects/pitch', { method: 'POST', headers: OWNER, body: { ...body, school: '100000200001' } })).status, 404);
    assert.equal((await call('/api/admin/prospects/pitch', { method: 'POST', headers: OWNER, body: { ...body, district: 'nope' } })).status, 404);
  } finally {
    server.close();
  }
});

test('pitches change with how a state wrote its standards', async () => {
  const p = createProspects({ dataDir: DATA });
  const de = await p.state('DE');
  const district = de.districts[0];
  const as = (code) => ({ ...de, ...STATES.find((s) => s.code === code) });
  const tx = buildPitch({ st: as('TX'), district });
  assert.match(tx.proposal, /Texas wrote its own math standards/);
  assert.match(tx.proposal, /crosswalk to the Texas Essential Knowledge and Skills/);
  assert.doesNotMatch(tx.proposal, /6\.RP\.A\.1/);
  assert.match(tx.email, /Texas Education Code chapter 32/);
  const ga = buildPitch({ st: as('GA'), district });
  assert.match(ga.proposal, /tagged with the Georgia standard/);
  assert.match(ga.proposal, /6\.NR\.4/);
  const oh = buildPitch({ st: as('OH'), district });
  assert.match(oh.proposal, /grew out of the Common Core/);
  // no price given: no pricing line
  assert.doesNotMatch(oh.email, /Pricing/);
  assert.doesNotMatch(oh.proposal, /\nCost\n/);
  // control characters from the form are cleaned
  const odd = buildPitch({ st: as('OH'), district, sender: { name: 'Bar\u0000ry\nX' } });
  assert.doesNotMatch(odd.email, /\u0000/);
});
