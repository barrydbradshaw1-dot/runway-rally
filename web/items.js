// Wearable pieces. Shared by the web client and the server, so both check the same list.
// Two kinds: skill pieces come when a skill score passes a level; reward pieces come one at a time,
// in a fixed order, each time a student finishes a commission well. Once a student has every reward
// piece, each one can be earned again in other colours. Nothing here is random.

export const FABRIC_COLORS = [
  { id: 'ruby', name: 'Ruby', hex: '#c8203f' },
  { id: 'coral', name: 'Coral', hex: '#f0644e' },
  { id: 'saffron', name: 'Saffron', hex: '#f0a20c' },
  { id: 'emerald', name: 'Emerald', hex: '#13895c' },
  { id: 'teal', name: 'Teal', hex: '#0f8a96' },
  { id: 'sapphire', name: 'Sapphire', hex: '#2448b8' },
  { id: 'violet', name: 'Violet', hex: '#6a3cd8' },
  { id: 'rose', name: 'Rose', hex: '#e2508f' },
  { id: 'ink', name: 'Ink', hex: '#232041' },
  { id: 'ivory', name: 'Ivory', hex: '#f3ead8' },
];

// Where a piece is worn. A student wears at most one piece in each spot.
export const SLOTS = [
  { id: 'head', name: 'Hats and crowns' },
  { id: 'neck', name: 'Necklaces' },
  { id: 'scarf', name: 'Scarves and stoles' },
  { id: 'top', name: 'Tees' },
  { id: 'dress', name: 'Gowns' },
  { id: 'outer', name: 'Jackets' },
  { id: 'cape', name: 'Capes' },
  { id: 'wrist', name: 'Bracelets and watches' },
  { id: 'bag', name: 'Bags' },
  { id: 'shoes', name: 'Shoes' },
];

// Skill pieces (kept from the first version of the game).
export const SKILL_ITEMS = [
  { id: 'basic-tee', name: 'Studio Tee', slot: 'top', skill: null, threshold: 0 },
  { id: 'fraction-jacket', name: 'Fraction Jacket', slot: 'outer', skill: 'frac_part', threshold: 0.5 },
  { id: 'gala-gown', name: 'Gala Gown', slot: 'dress', skill: 'frac_add', threshold: 0.5 },
  { id: 'ratio-pearls', name: 'Ratio Pearl Set', slot: 'neck', skill: 'ratio', threshold: 0.5 },
  { id: 'sale-scarf', name: 'Sale-Day Scarf', slot: 'scarf', skill: 'percent', threshold: 0.5 },
  { id: 'couture-cape', name: 'Couture Cape', slot: 'cape', skill: 'frac_part', threshold: 0.8 },
  { id: 'crystal-crown', name: 'Crystal Crown', slot: 'head', skill: 'ratio', threshold: 0.8 },
];

// Reward pieces, in the order they are earned. The order moves around the body, so each new
// piece changes the look in a new place. color is the first colour a piece comes in.
export const REWARD_ITEMS = [
  { id: 'sun-hat', name: 'Sun Hat', slot: 'head', color: 'saffron' },
  { id: 'crossbody-bag', name: 'Crossbody Bag', slot: 'bag', color: 'coral' },
  { id: 'high-tops', name: 'High-Top Sneakers', slot: 'shoes', color: 'teal' },
  { id: 'heart-locket', name: 'Heart Locket', slot: 'neck', color: 'rose' },
  { id: 'denim-jacket', name: 'Denim Jacket', slot: 'outer', color: 'sapphire' },
  { id: 'friendship-bracelets', name: 'Friendship Bracelets', slot: 'wrist', color: 'emerald' },
  { id: 'silk-neckerchief', name: 'Silk Neckerchief', slot: 'scarf', color: 'ruby' },
  { id: 'bucket-hat', name: 'Bucket Hat', slot: 'head', color: 'emerald' },
  { id: 'tote-bag', name: 'Canvas Tote', slot: 'bag', color: 'ivory' },
  { id: 'ankle-boots', name: 'Ankle Boots', slot: 'shoes', color: 'ink' },
  { id: 'bead-necklace', name: 'Bead Necklace', slot: 'neck', color: 'teal' },
  { id: 'cardigan', name: 'Long Cardigan', slot: 'outer', color: 'rose' },
  { id: 'smart-watch', name: 'Smart Watch', slot: 'wrist', color: 'ink' },
  { id: 'baseball-cap', name: 'Baseball Cap', slot: 'head', color: 'sapphire' },
  { id: 'backpack', name: 'Backpack', slot: 'bag', color: 'violet' },
  { id: 'ballet-flats', name: 'Ballet Flats', slot: 'shoes', color: 'rose' },
  { id: 'chain-necklace', name: 'Chain Necklace', slot: 'neck', color: 'saffron' },
  { id: 'varsity-jacket', name: 'Varsity Jacket', slot: 'outer', color: 'ruby' },
  { id: 'bangles', name: 'Stacked Bangles', slot: 'wrist', color: 'saffron' },
  { id: 'knit-scarf', name: 'Striped Knit Scarf', slot: 'scarf', color: 'coral' },
  { id: 'flower-crown', name: 'Flower Crown', slot: 'head', color: 'rose' },
  { id: 'mini-purse', name: 'Mini Purse', slot: 'bag', color: 'ruby' },
  { id: 'platform-sandals', name: 'Platform Sandals', slot: 'shoes', color: 'coral' },
  { id: 'choker', name: 'Velvet Choker', slot: 'neck', color: 'ink' },
  { id: 'blazer', name: 'Sharp Blazer', slot: 'outer', color: 'ink' },
  { id: 'bow-clip', name: 'Bow Hair Clip', slot: 'head', color: 'violet' },
  { id: 'rain-boots', name: 'Rain Boots', slot: 'shoes', color: 'saffron' },
  { id: 'puffer-vest', name: 'Puffer Vest', slot: 'outer', color: 'teal' },
  { id: 'knit-beanie', name: 'Knit Beanie', slot: 'head', color: 'coral' },
  { id: 'street-sneakers', name: 'Street Sneakers', slot: 'shoes', color: 'violet' },
  { id: 'gala-clutch', name: 'Gala Clutch', slot: 'bag', color: 'saffron' },
  { id: 'opal-pendant', name: 'Aurora Opal Pendant', slot: 'neck', color: 'teal' },
  { id: 'neon-jacket', name: 'Neon Street Jacket', slot: 'outer', color: 'rose' },
  { id: 'charm-bracelet', name: 'Charm Bracelet', slot: 'wrist', color: 'violet' },
  { id: 'moonsilk-stole', name: 'Moonsilk Stole', slot: 'scarf', color: 'ivory' },
  { id: 'reading-satchel', name: 'Book Satchel', slot: 'bag', color: 'emerald' },
  { id: 'starlit-tiara', name: 'Starlit Tiara', slot: 'head', color: 'sapphire' },
];

// The collectible cards from the first version, each turned into the piece that matches it.
export const CARD_ITEMS = {
  'muse-mira': 'gala-clutch',
  'muse-juno': 'street-sneakers',
  'fabric-silk': 'moonsilk-stole',
  'gem-opal': 'opal-pendant',
  'skill-hint': 'charm-bracelet',
  'style-neon': 'neon-jacket',
  'muse-professor': 'reading-satchel',
  'spot-crown': 'starlit-tiara',
};

const SKILL_BY_ID = new Map(SKILL_ITEMS.map((i) => [i.id, i]));
const REWARD_BY_ID = new Map(REWARD_ITEMS.map((i) => [i.id, i]));
const COLOR_BY_ID = new Map(FABRIC_COLORS.map((c) => [c.id, c]));
export const colorHex = (id) => COLOR_BY_ID.get(id)?.hex;
export const colorName = (id) => COLOR_BY_ID.get(id)?.name;

// Looks up any piece, including a colour version written as "sun-hat~teal". Returns null for
// anything unknown, so a tampered id never reaches the avatar.
export function itemById(id) {
  if (typeof id !== 'string' || id.length > 60) return null;
  const skill = SKILL_BY_ID.get(id);
  if (skill) return { ...skill, base: id, kind: 'skill', color: null };
  const [baseId, colorId, extra] = id.split('~');
  const base = REWARD_BY_ID.get(baseId);
  if (!base || extra !== undefined) return null;
  if (colorId === undefined) return { ...base, base: baseId, kind: 'reward' };
  const color = COLOR_BY_ID.get(colorId);
  if (!color || colorId === base.color) return null;
  return { ...base, id, base: baseId, kind: 'reward', color: colorId, name: `${base.name}, ${color.name}` };
}

// The next reward piece for a student who owns these ids, or null once every piece and colour is theirs.
export function nextReward(ownedIds) {
  const owned = new Set(ownedIds);
  for (const it of REWARD_ITEMS) if (!owned.has(it.id)) return it.id;
  for (const c of FABRIC_COLORS) {
    for (const it of REWARD_ITEMS) {
      const id = `${it.id}~${c.id}`;
      if (c.id !== it.color && !owned.has(id)) return id;
    }
  }
  return null;
}

// Keeps known pieces only, at most one per spot (the later one wins). owned, when given, also
// drops pieces the student hasn't earned.
export function cleanWear(list, owned = null) {
  if (!Array.isArray(list)) return [];
  const bySlot = new Map();
  for (const id of list) {
    const it = itemById(id);
    if (!it || (owned && !owned.includes(it.id))) continue;
    bySlot.delete(it.slot);
    bySlot.set(it.slot, it.id);
  }
  return [...bySlot.values()];
}
