import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REWARD_ITEMS, SKILL_ITEMS, SLOTS, CARD_ITEMS, FABRIC_COLORS, itemById, nextReward, cleanWear } from '../../web/items.js';
import { newStudent, normalizeStudent, awardReward, wearItem, publicStudent, grantUnlocks } from '../src/logic.js';

test('every piece has a known spot, a unique id and a starting colour', () => {
  const slots = new Set(SLOTS.map((s) => s.id));
  const ids = [...SKILL_ITEMS, ...REWARD_ITEMS].map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const it of [...SKILL_ITEMS, ...REWARD_ITEMS]) assert.ok(slots.has(it.slot), it.id);
  for (const it of REWARD_ITEMS) assert.ok(FABRIC_COLORS.some((c) => c.id === it.color), it.id);
  assert.ok(REWARD_ITEMS.length >= 30);
});

test('every piece is drawn on the avatar', async () => {
  const src = await readFile(new URL('../../web/avatar.js', import.meta.url), 'utf8');
  for (const it of [...SKILL_ITEMS.filter((i) => i.id !== 'basic-tee'), ...REWARD_ITEMS]) {
    assert.ok(src.includes(`'${it.id}':`) || src.includes(`  ${it.id}:`), `${it.id} has art`);
  }
});

test('colour versions are real pieces; anything else is unknown', () => {
  assert.equal(itemById('sun-hat~teal').name, 'Sun Hat, Teal');
  assert.equal(itemById('sun-hat~teal').slot, 'head');
  assert.equal(itemById('sun-hat~saffron'), null, 'the starting colour is the base piece');
  assert.equal(itemById('sun-hat~plaid'), null);
  assert.equal(itemById('sun-hat~teal~ruby'), null);
  assert.equal(itemById('gala-gown~ruby'), null, 'skill pieces have no colour versions');
  assert.equal(itemById({}), null);
});

test('rewards come in a fixed order with no repeats, then colour versions, then nothing', () => {
  const owned = [];
  const seen = new Set();
  let id;
  while ((id = nextReward(owned))) {
    assert.ok(!seen.has(id), `repeat ${id}`);
    seen.add(id);
    owned.push(id);
  }
  assert.deepEqual(owned.slice(0, REWARD_ITEMS.length), REWARD_ITEMS.map((i) => i.id), 'every base piece comes first');
  assert.equal(owned.length, REWARD_ITEMS.length * FABRIC_COLORS.length);
  assert.ok(owned.every((x) => itemById(x)), 'all real');
  assert.equal(nextReward([]), 'sun-hat');
  assert.equal(nextReward([]), nextReward([]), 'not random');
});

test('the first reward pieces land in different spots', () => {
  const first = REWARD_ITEMS.slice(0, 7).map((i) => i.slot);
  assert.equal(new Set(first).size, first.length);
});

test('a new piece goes on at once and swaps out the piece in the same spot', () => {
  const s = newStudent({ id: 'a', classCode: 'X', nickname: 'Ava' });
  assert.deepEqual(s.look.wear, ['basic-tee']);
  const first = awardReward(s);
  assert.deepEqual(first, { item: { id: 'sun-hat', name: 'Sun Hat', slot: 'head' }, replaced: null });
  assert.deepEqual(s.look.wear, ['basic-tee', 'sun-hat']);
  for (let i = 0; i < 6; i++) awardReward(s);
  const hat2 = awardReward(s);
  assert.equal(hat2.item.id, 'bucket-hat');
  assert.equal(hat2.replaced.id, 'sun-hat');
  assert.ok(s.unlocks.includes('sun-hat'), 'the old piece stays in the wardrobe');
  assert.equal(s.look.wear.filter((w) => itemById(w).slot === 'head').length, 1);
  assert.equal(wearItem(s, 'sun-hat').id, 'bucket-hat');
  assert.ok(publicStudent(s).unlocks.some((u) => u.id === 'bucket-hat' && u.name === 'Bucket Hat'));
});

test('a skill piece also goes on when it is earned', () => {
  const s = newStudent({ id: 'b', classCode: 'X', nickname: 'Bea' });
  s.mastery.frac_add = 0.6;
  assert.deepEqual(grantUnlocks(s).map((i) => i.id), ['gala-gown']);
  assert.ok(s.look.wear.includes('gala-gown'));
});

test('cleanWear keeps one known, owned piece per spot', () => {
  assert.deepEqual(cleanWear('x'), []);
  assert.deepEqual(cleanWear(['sun-hat', 'flower-crown', 'choker']), ['flower-crown', 'choker']);
  assert.deepEqual(cleanWear(['sun-hat', 'choker'], ['choker']), ['choker']);
});

test('a student saved with cards keeps them as matching pieces, and what she wore stays on', () => {
  const old = {
    id: 'old',
    classCode: 'HOME',
    nickname: 'Ava',
    unlocks: ['basic-tee', 'gala-gown', 'ratio-pearls'],
    cards: ['muse-juno', 'gem-opal', 'gem-opal', 'mystery'],
    packsSinceRare: 2,
    look: { skin: 'tone12', off: ['ratio-pearls'] },
  };
  const s = normalizeStudent(old);
  assert.ok(!('cards' in s) && !('packsSinceRare' in s));
  assert.deepEqual(s.unlocks, ['basic-tee', 'gala-gown', 'ratio-pearls', CARD_ITEMS['muse-juno'], CARD_ITEMS['gem-opal']]);
  assert.deepEqual(s.look.wear, ['basic-tee', 'gala-gown'], 'pieces from cards wait in the wardrobe');
  assert.equal(s.look.skin, 'tone12');
  const again = normalizeStudent(s);
  assert.deepEqual(again.unlocks, s.unlocks, 'safe to run twice');
  assert.ok(!publicStudent(s).cards);
  // the next reward skips pieces she already has from cards
  const order = [];
  for (let i = 0; i < REWARD_ITEMS.length - 2; i++) order.push(awardReward(s).item.id);
  assert.ok(!order.includes('street-sneakers') && !order.includes('opal-pendant'));
});
