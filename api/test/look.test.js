import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN, HAIR_COLORS, HAIR_STYLES, EYE_COLORS, WORLD, cleanLook, matchColors, NATURAL_HAIR, DEFAULT_LOOK } from '../../web/look.js';

test('look data has the expected range and no race/ethnicity labels', () => {
  assert.equal(SKIN.length, 10);
  assert.equal(HAIR_STYLES.length, 8);
  assert.ok(HAIR_COLORS.length > NATURAL_HAIR);
  assert.ok(EYE_COLORS.length >= 8);
  const text = JSON.stringify({ SKIN, HAIR_COLORS, HAIR_STYLES, WORLD }).toLowerCase();
  for (const w of ['race', 'ethnic', 'black people', 'asian', 'latina', 'white']) assert.ok(!text.includes(w), w);
});

test('cleanLook rejects bad input and keeps valid picks', () => {
  assert.deepEqual(cleanLook(null), DEFAULT_LOOK);
  assert.deepEqual(cleanLook({ skin: 99, hair: -1, hairStyle: 'x', head: '<script>', extras: ['obi', 'obi', 'nope', 'hijab'] }), { ...DEFAULT_LOOK, extras: ['obi'] });
  const ok = { skin: 7, hair: 2, hairStyle: 5, eyes: 3, head: 'hijab', extras: ['dupatta'] };
  assert.deepEqual(cleanLook(ok), ok);
});

test('matchColors maps sampled pixels to the nearest tone', () => {
  const near = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const i of [0, 4, 9]) {
    const px = Array.from({ length: 9 }, () => near(SKIN[i].base).map((v) => v + 3));
    assert.equal(matchColors({ skinPx: px, hairPx: [] }).skin, i);
  }
  const hair = matchColors({ skinPx: [], hairPx: [near('#2b2430'), near('#2e2733'), near('#282230')] });
  assert.equal(hair.hair, 0);
  assert.equal(matchColors({ skinPx: [], hairPx: [] }).skin, null);
});
