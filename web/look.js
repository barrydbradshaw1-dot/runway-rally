// "My look": the choices a student makes for their designer. Pure data and checks, no DOM, so the
// server (api/src) and the browser share one list.
//
// Students pick features directly: skin tone, face, eyes, hair and so on. Nothing here records or
// asks for race or ethnicity, and no choice is tied to any other (any hair, style or head covering
// goes with any skin tone). No photo or camera is used.

import { FABRIC_COLORS, cleanWear } from './items.js';

// ---------- colour helpers ----------
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
// WCAG relative luminance, used by tests to check that tones really span light to deep.
export const luminance = (hex) => {
  const c = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

// ---------- skin ----------
// 20 tones from lightest to deepest, with pink, neutral, olive and golden undertones at each depth.
const SKIN_HEX = [
  '#fbe6dc', '#f8e0c8', '#f4d6c4', '#efd1ad',
  '#ebc4a6', '#e3bb92', '#dcb48a', '#d4a47c',
  '#c99670', '#c08a5c', '#b47d58', '#a87048',
  '#9a6344', '#8d5838', '#7f4d34', '#70432c',
  '#623a28', '#543121', '#47291c', '#3a2117',
];
export const SKIN = SKIN_HEX.map((base, i) => ({
  id: `tone${String(i + 1).padStart(2, '0')}`,
  name: `Tone ${i + 1} of ${SKIN_HEX.length}`,
  base,
  shade: mix(base, '#5a2a1e', 0.2),
  line: mix(base, '#3a1a14', i < 10 ? 0.45 : 0.6),
  blush: mix(base, '#ff4f7a', i < 10 ? 0.35 : 0.3),
  lip: mix(base, '#b0304f', i < 10 ? 0.4 : 0.3),
  light: mix(base, '#ffffff', 0.55), // for vitiligo patches
}));

// ---------- face ----------
export const FACE_SHAPES = [
  { id: 'oval', name: 'Oval' },
  { id: 'round', name: 'Round' },
  { id: 'heart', name: 'Heart' },
  { id: 'square', name: 'Square' },
  { id: 'long', name: 'Long' },
  { id: 'diamond', name: 'Diamond' },
];

export const EYE_SHAPES = [
  { id: 'round', name: 'Round' },
  { id: 'almond', name: 'Almond' },
  { id: 'hooded', name: 'Hooded' },
  { id: 'monolid', name: 'Monolid' },
  { id: 'upturned', name: 'Upturned' },
  { id: 'downturned', name: 'Downturned' },
];

export const EYE_COLORS = [
  { id: 'dark-brown', name: 'Dark brown', hex: '#3b2418' },
  { id: 'brown', name: 'Brown', hex: '#6a3f22' },
  { id: 'amber', name: 'Amber', hex: '#a8691e' },
  { id: 'hazel', name: 'Hazel', hex: '#7c6a2e' },
  { id: 'green', name: 'Green', hex: '#3f7a4a' },
  { id: 'gray', name: 'Gray', hex: '#6f7c86' },
  { id: 'blue', name: 'Blue', hex: '#3d6fa8' },
  { id: 'violet', name: 'Violet (fantasy)', hex: '#7a3cff' },
  { id: 'pink', name: 'Pink (fantasy)', hex: '#e0429a' },
  { id: 'gold', name: 'Gold (fantasy)', hex: '#d9a400' },
];

export const BROWS = [
  { id: 'soft-arch', name: 'Soft arch' },
  { id: 'straight', name: 'Straight' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'angled', name: 'Angled' },
  { id: 'full', name: 'Full' },
  { id: 'thin', name: 'Thin' },
];

export const NOSES = [
  { id: 'small', name: 'Small' },
  { id: 'button', name: 'Button' },
  { id: 'wide', name: 'Wide' },
  { id: 'rounded', name: 'Rounded tip' },
  { id: 'straight', name: 'Straight' },
  { id: 'high-bridge', name: 'High bridge' },
];

export const LIPS = [
  { id: 'medium', name: 'Medium' },
  { id: 'full', name: 'Full' },
  { id: 'thin', name: 'Thin' },
  { id: 'wide', name: 'Wide' },
  { id: 'heart', name: 'Heart' },
  { id: 'small', name: 'Small' },
];

// "natural" follows the skin tone.
export const LIP_COLORS = [
  { id: 'natural', name: 'Natural', hex: null },
  { id: 'rose', name: 'Rose', hex: '#c8506e' },
  { id: 'berry', name: 'Berry', hex: '#8e2252' },
  { id: 'coral', name: 'Coral', hex: '#e8664f' },
  { id: 'nude', name: 'Nude', hex: '#b97a62' },
  { id: 'plum', name: 'Plum', hex: '#6b2a4a' },
  { id: 'gloss', name: 'Clear gloss', hex: 'gloss' },
];

// ---------- hair ----------
// Textures run from straight to coily. Each style is drawn as original placeholder art.
export const HAIR_STYLES = [
  { id: 'long-straight', name: 'Long and straight', texture: 'Straight' },
  { id: 'bob', name: 'Bob', texture: 'Straight' },
  { id: 'pixie', name: 'Pixie cut', texture: 'Straight' },
  { id: 'ponytail', name: 'High ponytail', texture: 'Straight' },
  { id: 'waves', name: 'Shoulder waves', texture: 'Wavy' },
  { id: 'space-buns', name: 'Space buns', texture: 'Wavy' },
  { id: 'two-braids', name: 'Two braids', texture: 'Wavy' },
  { id: 'curls', name: 'Curls', texture: 'Curly' },
  { id: 'top-bun', name: 'Curly top bun', texture: 'Curly' },
  { id: 'afro', name: 'Afro', texture: 'Coily' },
  { id: 'puffs', name: 'Afro puffs', texture: 'Coily' },
  { id: 'short-coils', name: 'Short coils', texture: 'Coily' },
  { id: 'twists', name: 'Two-strand twists', texture: 'Coily' },
  { id: 'bantu-knots', name: 'Bantu knots', texture: 'Coily' },
  { id: 'box-braids', name: 'Box braids', texture: 'Braids and locs' },
  { id: 'cornrows', name: 'Cornrows', texture: 'Braids and locs' },
  { id: 'locs', name: 'Locs', texture: 'Braids and locs' },
  { id: 'close-crop', name: 'Close crop', texture: 'Short' },
];

export const HAIR_COLORS = [
  { id: 'black', name: 'Black', hex: '#1f191c' },
  { id: 'soft-black', name: 'Soft black', hex: '#332629' },
  { id: 'dark-brown', name: 'Dark brown', hex: '#47301f' },
  { id: 'brown', name: 'Brown', hex: '#6b4530' },
  { id: 'light-brown', name: 'Light brown', hex: '#94683f' },
  { id: 'auburn', name: 'Auburn', hex: '#8a3a20' },
  { id: 'red', name: 'Red', hex: '#b5482a' },
  { id: 'strawberry', name: 'Strawberry blonde', hex: '#cc8455' },
  { id: 'dark-blonde', name: 'Dark blonde', hex: '#a7844b' },
  { id: 'blonde', name: 'Blonde', hex: '#dcbc78' },
  { id: 'platinum', name: 'Platinum', hex: '#eee3c6' },
  { id: 'gray', name: 'Gray', hex: '#9b9a9e' },
  { id: 'violet', name: 'Violet (dyed)', hex: '#7a4dff' },
  { id: 'pink', name: 'Pink (dyed)', hex: '#ff5fb8' },
  { id: 'blue', name: 'Blue (dyed)', hex: '#2f8be0' },
  { id: 'teal', name: 'Teal (dyed)', hex: '#14a89a' },
];

// ---------- head coverings and hair accessories ----------
// covers: 'all' hides the hair, 'top' hides only the top, 'none' shows it.
export const HEADWEAR = [
  { id: 'none', name: 'None', covers: 'none' },
  { id: 'hijab', name: 'Hijab', covers: 'all' },
  { id: 'turban', name: 'Turban', covers: 'all' },
  { id: 'head-wrap', name: 'Head wrap', covers: 'all' },
  { id: 'gele', name: 'Gele', covers: 'all' },
  { id: 'headband', name: 'Headband', covers: 'none' },
  { id: 'bandana', name: 'Bandana', covers: 'top' },
  { id: 'beret', name: 'Beret', covers: 'top' },
];

// ---------- fabric colours (styles and head coverings) ----------
// Fabric colours live with the wearable pieces (items.js), which use them for colour versions.
export { FABRIC_COLORS };

// ---------- styles ----------
// Classic garments from around the world, each in a traditional form and a modern take, plus
// everyday basics. Named for what they are; open to every student.
// cut: the silhouette; trim: details drawn on top; pattern: fabric pattern.
export const STYLES = [
  { id: 'studio', name: 'Studio tee and shorts', family: 'Everyday', origin: 'Everyday', era: 'modern', cut: 'tee-shorts' },
  { id: 'hoodie', name: 'Hoodie and joggers', family: 'Everyday', origin: 'Everyday', era: 'modern', cut: 'top-pants', trim: ['hood', 'pocket'], sleeves: 'long' },
  { id: 'overalls', name: 'Denim overalls', family: 'Everyday', origin: 'Everyday', era: 'modern', cut: 'overalls', sleeves: 'short' },

  { id: 'kimono', name: 'Kimono', family: 'Kimono', origin: 'Japan', era: 'traditional', cut: 'robe-long', trim: ['wrap-collar', 'obi'], sleeves: 'kimono', pattern: 'blossom' },
  { id: 'kimono-jacket', name: 'Kimono jacket and jeans', family: 'Kimono', origin: 'Japan', era: 'modern', cut: 'top-pants', trim: ['open-jacket'], sleeves: 'kimono-short', pattern: 'blossom', bottom: 'denim' },

  { id: 'hanbok', name: 'Hanbok', family: 'Hanbok', origin: 'Korea', era: 'traditional', cut: 'top-skirt-full', trim: ['jeogori', 'goreum'], sleeves: 'long' },
  { id: 'hanbok-modern', name: 'Modern hanbok dress', family: 'Hanbok', origin: 'Korea', era: 'modern', cut: 'dress-midi', trim: ['wrap-collar', 'goreum'], sleeves: 'short' },

  { id: 'qipao', name: 'Qipao (cheongsam)', family: 'Qipao', origin: 'China', era: 'traditional', cut: 'dress-long', trim: ['mandarin', 'frogs', 'slit'], sleeves: 'short', pattern: 'cloud' },
  { id: 'qipao-modern', name: 'Short qipao dress', family: 'Qipao', origin: 'China', era: 'modern', cut: 'dress-short', trim: ['mandarin', 'frogs'], sleeves: 'none', pattern: 'cloud' },

  { id: 'ao-dai', name: 'Áo dài', family: 'Áo dài', origin: 'Vietnam', era: 'traditional', cut: 'tunic-long', trim: ['mandarin', 'side-slits'], sleeves: 'long', bottom: 'ivory' },
  { id: 'ao-dai-modern', name: 'Áo dài top and wide pants', family: 'Áo dài', origin: 'Vietnam', era: 'modern', cut: 'tunic-short', trim: ['mandarin', 'side-slits'], sleeves: 'short', bottom: 'ink' },

  { id: 'sari', name: 'Sari', family: 'Sari', origin: 'South Asia', era: 'traditional', cut: 'skirt-long', trim: ['pallu', 'border'], sleeves: 'short' },
  { id: 'sari-modern', name: 'Sari-drape gown', family: 'Sari', origin: 'South Asia', era: 'modern', cut: 'dress-long', trim: ['pallu', 'border'], sleeves: 'none' },

  { id: 'salwar-kameez', name: 'Salwar kameez', family: 'Salwar kameez', origin: 'South Asia', era: 'traditional', cut: 'tunic-long', trim: ['dupatta', 'neck-embroidery'], sleeves: 'long', bottom: 'match' },
  { id: 'kurta-jeans', name: 'Kurta and jeans', family: 'Salwar kameez', origin: 'South Asia', era: 'modern', cut: 'tunic-short', trim: ['neck-embroidery'], sleeves: 'elbow', bottom: 'denim' },

  { id: 'kente', name: 'Kente wrap', family: 'Kente', origin: 'Ghana', era: 'traditional', cut: 'wrap-long', trim: ['shoulder-drape'], sleeves: 'none', pattern: 'kente' },
  { id: 'kente-modern', name: 'Kente-trim jacket and skirt', family: 'Kente', origin: 'Ghana', era: 'modern', cut: 'top-skirt-midi', trim: ['kente-jacket'], sleeves: 'long' },

  { id: 'ankara', name: 'Ankara wrapper and top', family: 'Ankara', origin: 'West and Central Africa', era: 'traditional', cut: 'top-skirt-long', trim: ['peplum'], sleeves: 'puff', pattern: 'wax' },
  { id: 'ankara-modern', name: 'Ankara print dress', family: 'Ankara', origin: 'West and Central Africa', era: 'modern', cut: 'dress-midi', trim: ['belt'], sleeves: 'puff', pattern: 'wax' },

  { id: 'dashiki', name: 'Dashiki', family: 'Dashiki', origin: 'West Africa', era: 'traditional', cut: 'tunic-long', trim: ['dashiki-yoke'], sleeves: 'wide', bottom: 'match' },
  { id: 'dashiki-modern', name: 'Dashiki crop top and joggers', family: 'Dashiki', origin: 'West Africa', era: 'modern', cut: 'top-pants', trim: ['dashiki-yoke'], sleeves: 'short', bottom: 'ink' },

  { id: 'huipil', name: 'Huipil', family: 'Huipil', origin: 'Mexico and Central America', era: 'traditional', cut: 'tunic-long', trim: ['huipil-yoke'], sleeves: 'none', bottom: 'ink', base: 'ivory' },
  { id: 'huipil-modern', name: 'Embroidered blouse and jeans', family: 'Huipil', origin: 'Mexico and Central America', era: 'modern', cut: 'top-pants', trim: ['huipil-yoke'], sleeves: 'puff', bottom: 'denim', base: 'ivory' },

  { id: 'kaftan', name: 'Kaftan', family: 'Kaftan', origin: 'Morocco', era: 'traditional', cut: 'robe-long', trim: ['center-trim', 'belt'], sleeves: 'wide' },
  { id: 'kaftan-modern', name: 'Short kaftan and pants', family: 'Kaftan', origin: 'Morocco', era: 'modern', cut: 'tunic-short', trim: ['center-trim'], sleeves: 'wide', bottom: 'ivory' },

  { id: 'terno', name: 'Terno', family: 'Terno', origin: 'Philippines', era: 'traditional', cut: 'dress-long', trim: ['butterfly'], sleeves: 'none' },
  { id: 'terno-modern', name: 'Butterfly-sleeve top and skirt', family: 'Terno', origin: 'Philippines', era: 'modern', cut: 'top-skirt-midi', trim: ['butterfly'], sleeves: 'none' },

  { id: 'flamenco', name: 'Flamenco dress', family: 'Flamenco', origin: 'Spain', era: 'traditional', cut: 'dress-long', trim: ['ruffles'], sleeves: 'elbow', pattern: 'dots' },
  { id: 'flamenco-modern', name: 'Ruffle skirt and top', family: 'Flamenco', origin: 'Spain', era: 'modern', cut: 'top-skirt-midi', trim: ['ruffles'], sleeves: 'none', pattern: 'dots' },

  { id: 'tartan', name: 'Tartan kilted skirt and sash', family: 'Tartan', origin: 'Scotland', era: 'traditional', cut: 'top-skirt-midi', trim: ['sash', 'pleats'], sleeves: 'long', pattern: 'tartan', base: 'ivory' },
  { id: 'tartan-modern', name: 'Plaid skirt and blazer', family: 'Tartan', origin: 'Scotland', era: 'modern', cut: 'top-skirt-short', trim: ['blazer', 'pleats'], sleeves: 'long', pattern: 'tartan' },
];

export const DETAILS = [
  { id: 'freckles', name: 'Freckles' },
  { id: 'beauty-mark', name: 'Beauty mark' },
  { id: 'blush', name: 'Blush' },
  { id: 'vitiligo', name: 'Vitiligo' },
];

export const GLASSES = [
  { id: 'none', name: 'None' },
  { id: 'round', name: 'Round' },
  { id: 'rectangle', name: 'Rectangle' },
  { id: 'cat-eye', name: 'Cat-eye' },
];

export const EARRINGS = [
  { id: 'none', name: 'None' },
  { id: 'studs', name: 'Studs' },
  { id: 'hoops', name: 'Hoops' },
  { id: 'drops', name: 'Drops' },
];

// What each choice is checked against. Keys are the fields of a saved look.
export const CHOICES = {
  skin: SKIN,
  face: FACE_SHAPES,
  eyes: EYE_SHAPES,
  eyeColor: EYE_COLORS,
  brows: BROWS,
  nose: NOSES,
  lips: LIPS,
  lipColor: LIP_COLORS,
  hair: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  headwear: HEADWEAR,
  headColor: FABRIC_COLORS,
  style: STYLES,
  styleColor: FABRIC_COLORS,
  glasses: GLASSES,
  earrings: EARRINGS,
};

export const DEFAULT_LOOK = {
  skin: 'tone09',
  face: 'oval',
  eyes: 'almond',
  eyeColor: 'brown',
  brows: 'soft-arch',
  nose: 'small',
  lips: 'medium',
  lipColor: 'natural',
  hair: 'long-straight',
  hairColor: 'violet',
  headwear: 'none',
  headColor: 'teal',
  style: 'studio',
  styleColor: 'violet',
  glasses: 'none',
  earrings: 'none',
  details: ['blush'],
  wear: ['basic-tee'], // earned pieces the student has on, at most one per spot
};

const byId = (list, id) => list.find((x) => x.id === id);
export const pick = (field, id) => byId(CHOICES[field], id) || byId(CHOICES[field], DEFAULT_LOOK[field]);

// Turns anything (a saved look, a request body, junk) into a valid look. Unknown values fall back
// to the default, so an old or tampered look can never break the avatar. owned, when the caller
// knows it (the server does), limits worn pieces to ones the student has earned. A look saved
// before pieces were picked per spot listed the pieces taken off ("off"); it is turned into the
// list of pieces worn.
export function cleanLook(raw, { owned = null } = {}) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const field of Object.keys(CHOICES)) {
    const v = o[field];
    out[field] = typeof v === 'string' && byId(CHOICES[field], v) ? v : DEFAULT_LOOK[field];
  }
  const detailIds = DETAILS.map((d) => d.id);
  out.details = Array.isArray(o.details) ? [...new Set(o.details.filter((d) => detailIds.includes(d)))] : [...DEFAULT_LOOK.details];
  let wear = o.wear;
  if (!Array.isArray(wear)) {
    const off = Array.isArray(o.off) ? o.off : [];
    wear = owned ? owned.filter((id) => !off.includes(id)) : DEFAULT_LOOK.wear;
  }
  out.wear = cleanWear(wear, owned);
  return out;
}

// Short words a screen reader can say about the avatar. Only what was picked, never a label.
export function describeLook(look) {
  const l = cleanLook(look);
  const st = pick('style', l.style);
  const head = pick('headwear', l.headwear);
  const parts = [];
  if (head.covers !== 'all') parts.push(`${pick('hair', l.hair).name.toLowerCase()} hair`);
  if (head.id !== 'none') parts.push(`${pick('headColor', l.headColor).name.toLowerCase()} ${head.name.toLowerCase()}`);
  parts.push(st.id === 'studio' ? 'studio tee and shorts' : `${pick('styleColor', l.styleColor).name.toLowerCase()} ${st.name.toLowerCase()}`);
  return `Your designer: ${parts.join(', ')}`;
}
