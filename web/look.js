// Avatar "look": skin, hair, eyes and world-style pieces. Pure data and colour helpers, no DOM.
// A look is stored only in this browser. It is never sent to the server and carries no label for race or ethnicity.

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};

// Ten skin tones from very light to deep. Each has a soft shade for necks and ears, and a blush that suits it.
const SKIN_BASE = ['#fdebdd', '#f8d9c0', '#efc29a', '#e3ab80', '#cc8e62', '#b27549', '#8f5736', '#734330', '#5c3524', '#472a1d'];
export const SKIN = SKIN_BASE.map((base) => ({ base, shade: mix(base, '#7a3a2a', 0.18), blush: mix(base, '#ff4f8a', 0.55), lip: mix(base, '#c2204f', 0.6) }));

const hairOf = (name, main) => ({ name, main, shade: mix(main, '#1a0f45', 0.32), shine: mix(main, '#ffffff', 0.45) });
export const HAIR_COLORS = [
  hairOf('Black', '#2b2430'),
  hairOf('Dark brown', '#4a3228'),
  hairOf('Brown', '#7a4e32'),
  hairOf('Auburn', '#9a4a2a'),
  hairOf('Honey', '#c99a4a'),
  hairOf('Blonde', '#e8c878'),
  hairOf('Violet', '#8a4dff'),
  hairOf('Pink', '#ff5fb8'),
  hairOf('Sky', '#34b7ff'),
  hairOf('Mint', '#1fd9a5'),
  hairOf('Sunny', '#ffc21a'),
  hairOf('Coral', '#ff7a59'),
];
export const NATURAL_HAIR = 6; // the first six are natural shades; the rest are anime colours

export const EYE_COLORS = ['#5a3a28', '#7a4e32', '#3f6f9a', '#4a8a5a', '#ff4fb0', '#27b8ff', '#16d9a0', '#7a3cff', '#ff8a3d', '#ffc21a'];

export const HAIR_STYLES = ['Twin tails', 'Long', 'Bob', 'Ponytail', 'Buns', 'Braids', 'Puffs', 'Curls'];

// World style: optional pieces inspired by clothing traditions. Open to everyone, never tied to the skin tone someone picks.
export const WORLD = [
  { id: 'hijab', name: 'Hijab', color: '#7a3cff' },
  { id: 'headwrap', name: 'Head wrap', color: '#ff7a59' },
  { id: 'obi', name: 'Kimono jacket', color: '#ff4fb0' },
  { id: 'dupatta', name: 'Dupatta scarf', color: '#16d9a0' },
  { id: 'embroidery', name: 'Embroidered top', color: '#ffc21a' },
];

export const DEFAULT_LOOK = { skin: 1, hair: 0, hairStyle: 0, eyes: 5, head: null, extras: [] };

export function cleanLook(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const int = (v, max, d) => (Number.isInteger(v) && v >= 0 && v < max ? v : d);
  const ids = WORLD.map((w) => w.id);
  const head = ['hijab', 'headwrap'].includes(o.head) ? o.head : null;
  const extras = Array.isArray(o.extras) ? [...new Set(o.extras.filter((x) => ids.includes(x) && !['hijab', 'headwrap'].includes(x)))] : [];
  return {
    skin: int(o.skin, SKIN.length, DEFAULT_LOOK.skin),
    hair: int(o.hair, HAIR_COLORS.length, DEFAULT_LOOK.hair),
    hairStyle: int(o.hairStyle, HAIR_STYLES.length, DEFAULT_LOOK.hairStyle),
    eyes: int(o.eyes, EYE_COLORS.length, DEFAULT_LOOK.eyes),
    head,
    extras,
  };
}

const dist = (a, b) => a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0);
const median = (arr) => [...arr].sort((x, y) => x - y)[arr.length >> 1];

// Pick the closest skin tone and natural hair colour from sampled pixels. Pure, so it can be tested.
export function matchColors({ skinPx, hairPx }) {
  const med = (px) => [0, 1, 2].map((c) => median(px.map((p) => p[c])));
  const nearest = (rgb, list) => list.reduce((best, c, i) => (dist(rgb, toRgb(c)) < best.d ? { i, d: dist(rgb, toRgb(c)) } : best), { i: 0, d: Infinity }).i;
  return {
    skin: skinPx.length ? nearest(med(skinPx), SKIN.map((s) => s.base)) : null,
    hair: hairPx.length ? nearest(med(hairPx), HAIR_COLORS.slice(0, NATURAL_HAIR).map((c) => c.main)) : null,
  };
}

// Read colours from a selfie ON THIS DEVICE ONLY. The picture is shrunk in memory, sampled, and thrown away:
// it is never uploaded, stored or shown. Returns a suggestion the student can then adjust.
export async function suggestFromPhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pick a photo.');
  const bmp = await createImageBitmap(file, { resizeWidth: 120, resizeQuality: 'low' });
  const w = bmp.width;
  const h = bmp.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const grab = (x0, y0, x1, y1) => {
    const d = ctx.getImageData(Math.floor(w * x0), Math.floor(h * y0), Math.max(1, Math.floor(w * (x1 - x0))), Math.max(1, Math.floor(h * (y1 - y0)))).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    return px;
  };
  // Face centred in the frame: forehead and cheeks for skin, top of the head for hair.
  const skinPx = [...grab(0.42, 0.34, 0.58, 0.42), ...grab(0.34, 0.5, 0.44, 0.58), ...grab(0.56, 0.5, 0.66, 0.58)];
  const hairPx = grab(0.36, 0.08, 0.64, 0.16);
  cv.width = cv.height = 1; // drop the pixels
  return matchColors({ skinPx, hairPx });
}
