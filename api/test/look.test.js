import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/server.js';
import { MemoryStore } from '../src/store.js';
import { newStudent, setLook, publicStudent } from '../src/logic.js';
import { CHOICES, DEFAULT_LOOK, SKIN, STYLES, HAIR_STYLES, HEADWEAR, cleanLook, describeLook, luminance } from '../../web/look.js';

test('cleanLook keeps known choices and replaces everything else with the default', () => {
  assert.deepEqual(cleanLook(null), DEFAULT_LOOK);
  assert.deepEqual(cleanLook([1, 2]), DEFAULT_LOOK);
  const mixed = cleanLook({ skin: 'tone20', hair: 'locs', face: 'triangle', eyeColor: 42, details: ['freckles', 'freckles', 'tattoo'], off: ['gala-gown', 'nope', 7], race: 'x', ethnicity: 'y' });
  assert.equal(mixed.skin, 'tone20');
  assert.equal(mixed.hair, 'locs');
  assert.equal(mixed.face, DEFAULT_LOOK.face);
  assert.equal(mixed.eyeColor, DEFAULT_LOOK.eyeColor);
  assert.deepEqual(mixed.details, ['freckles']);
  // pieces worn: known ones only, one per spot, and only owned ones when the owner list is known
  assert.deepEqual(cleanLook({ wear: ['sun-hat', 'nope', 'bucket-hat', 'high-tops~ruby', 'high-tops~teal'] }).wear, ['bucket-hat', 'high-tops~ruby']);
  assert.deepEqual(cleanLook({ wear: ['sun-hat', 'gala-gown'] }, { owned: ['gala-gown'] }).wear, ['gala-gown']);
  // a look saved before pieces were picked per spot listed the pieces taken off
  assert.deepEqual(cleanLook({ off: ['gala-gown'] }, { owned: ['basic-tee', 'gala-gown', 'ratio-pearls'] }).wear, ['basic-tee', 'ratio-pearls']);
  assert.ok(!('race' in mixed) && !('ethnicity' in mixed), 'unknown fields are dropped');
});

test('every default is a real choice, and ids are unique in every list', () => {
  for (const [field, list] of Object.entries(CHOICES)) {
    assert.ok(list.some((x) => x.id === DEFAULT_LOOK[field]), `default ${field}`);
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, `unique ids in ${field}`);
  }
});

test('skin tones run steadily from very light to very deep', () => {
  assert.ok(SKIN.length >= 16);
  const lum = SKIN.map((s) => luminance(s.base));
  for (let i = 1; i < lum.length; i++) assert.ok(lum[i] < lum[i - 1], `tone ${i + 1} is deeper than tone ${i}`);
  assert.ok(lum[0] > 0.7 && lum.at(-1) < 0.03, 'spans the full range');
});

test('hair covers straight to coily textures, braids and locs', () => {
  const textures = new Set(HAIR_STYLES.map((h) => h.texture));
  for (const t of ['Straight', 'Wavy', 'Curly', 'Coily', 'Braids and locs']) assert.ok(textures.has(t), t);
  for (const id of ['afro', 'locs', 'box-braids', 'cornrows', 'twists', 'bantu-knots', 'puffs']) assert.ok(HAIR_STYLES.some((h) => h.id === id), id);
  assert.ok(HEADWEAR.some((h) => h.id === 'hijab') && HEADWEAR.some((h) => h.id === 'gele'));
});

test('each classic style comes in a traditional form and a modern take, named respectfully', () => {
  const families = new Map();
  for (const s of STYLES) {
    if (s.family === 'Everyday') continue;
    assert.ok(s.origin && s.origin !== 'Everyday', `${s.id} names where it comes from`);
    families.set(s.family, [...(families.get(s.family) || []), s.era]);
  }
  assert.ok(families.size >= 12);
  for (const [f, eras] of families) assert.deepEqual(eras.sort(), ['modern', 'traditional'], f);
  const words = JSON.stringify(STYLES).toLowerCase();
  for (const bad of ['costume', 'exotic', 'tribal', 'ethnic', 'native', 'dress up as']) assert.ok(!words.includes(bad), `no "${bad}"`);
});

test('the look never carries a race or ethnicity label', () => {
  const fields = Object.keys(DEFAULT_LOOK).join(' ');
  assert.ok(!/race|ethnic|national/i.test(fields));
  const names = Object.values(CHOICES).flat().map((x) => x.name).join(' ').toLowerCase();
  assert.ok(!/african|asian|european|latina|white skin|black skin/.test(names));
  assert.equal(describeLook(DEFAULT_LOOK), 'Your designer: long and straight hair, studio tee and shorts');
  assert.equal(describeLook({ headwear: 'hijab', headColor: 'teal', style: 'kimono', styleColor: 'ruby' }), 'Your designer: teal hijab, ruby kimono');
});

test('the client never uses the camera or photos', async () => {
  for (const f of ['app.js', 'avatar.js', 'look.js']) {
    const src = await readFile(new URL(`../../web/${f}`, import.meta.url), 'utf8');
    assert.ok(!/getUserMedia|createImageBitmap|type: 'file'|capture=/.test(src), f);
  }
});

test('setLook saves a cleaned look; a wardrobe change does not count as designing', () => {
  const s = newStudent({ id: 'a', classCode: 'X', nickname: 'Ava' });
  assert.equal(publicStudent(s).lookSet, false);
  setLook(s, { wear: [] }, { wardrobe: true });
  assert.deepEqual(s.look.wear, []);
  assert.equal(s.lookSet, false);
  setLook(s, { skin: 'tone15', style: 'kente-modern', wear: ['basic-tee', 'crystal-crown'] });
  assert.equal(s.lookSet, true);
  assert.equal(publicStudent(s).look.style, 'kente-modern');
  assert.deepEqual(s.look.wear, ['basic-tee'], 'a piece she has not earned cannot be worn');
});

test('POST /api/look saves the look with the student and returns it from /api/state', async () => {
  const store = new MemoryStore();
  await store.init();
  await store.createClass('ROOM1', { kind: 'manual', name: 'ROOM1' });
  const { server } = createApp({ store, env: { NODE_ENV: 'test' }, seed: 3 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() };
  };
  try {
    const { token } = (await call('/api/session', { method: 'POST', body: { classCode: 'ROOM1', nickname: 'Nia' } })).json;
    const before = await call('/api/state', { token });
    assert.deepEqual(before.json.student.look, DEFAULT_LOOK);
    assert.equal(before.json.student.lookSet, false);

    assert.equal((await call('/api/look', { method: 'POST', token, body: {} })).status, 400);
    assert.equal((await call('/api/look', { method: 'POST', token, body: { look: [] } })).status, 400);
    assert.equal((await call('/api/look', { method: 'POST' })).status, 401);

    const saved = await call('/api/look', { method: 'POST', token, body: { look: { skin: 'tone18', hair: 'box-braids', headwear: 'gele', style: 'ankara', styleColor: 'emerald', eyes: 'nope' } } });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.student.look.hair, 'box-braids');
    assert.equal(saved.json.student.look.eyes, DEFAULT_LOOK.eyes);
    assert.equal(saved.json.student.lookSet, true);

    const after = await call('/api/state', { token });
    assert.equal(after.json.student.look.skin, 'tone18');
    assert.equal(after.json.student.look.style, 'ankara');
  } finally {
    server.close();
  }
});
