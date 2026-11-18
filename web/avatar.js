// Draws the student's designer as layered SVG: their chosen look, then the items they have earned
// on top. Placeholder art drawn in code, so it stays small and needs no image files.
import { pick, cleanLook, mix, describeLook } from './look.js';
import { itemById, colorHex } from './items.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0; // keeps clip and pattern ids unique when many avatars are on one screen

function el(tag, attrs = {}, kids = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  for (const k of kids) if (k) e.append(k);
  return e;
}

const INK = '#2b2250';
const GOLD = '#e8b830';
const IVORY = '#f3ead8';
const DENIM = '#3a5f9e';

// Smooth closed curve through points (Catmull-Rom as cubic Beziers).
function smooth(pts) {
  const n = pts.length;
  const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + ' Z';
}

// ---------- face geometry ----------
// Right half of each face, from forehead to chin; the left half is mirrored.
const FACES = {
  oval: { top: 40, bottom: 148, side: [[136, 50], [149, 78], [148, 108], [134, 132], [114, 145]] },
  round: { top: 42, bottom: 146, side: [[138, 50], [151, 80], [151, 110], [138, 133], [116, 144]] },
  heart: { top: 40, bottom: 150, side: [[140, 50], [152, 76], [146, 106], [128, 130], [110, 145]] },
  square: { top: 40, bottom: 147, side: [[138, 48], [149, 74], [149, 110], [145, 133], [123, 145]] },
  long: { top: 34, bottom: 155, side: [[134, 44], [146, 74], [146, 112], [134, 138], [114, 152]] },
  diamond: { top: 40, bottom: 151, side: [[130, 50], [148, 84], [150, 104], [132, 132], [110, 147]] },
};
export function facePath(shape) {
  const f = FACES[shape] || FACES.oval;
  const left = [...f.side].reverse().map(([x, y]) => [200 - x, y]);
  return smooth([[100, f.top], ...f.side, [100, f.bottom], ...left]);
}
const cheekOf = (shape) => Math.max(...(FACES[shape] || FACES.oval).side.map((p) => p[0])) - 100;

// Irregular soft patch for vitiligo, deterministic so it never jumps around.
function blob(cx, cy, r, seed) {
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const k = 0.7 + 0.3 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233));
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.8]);
  }
  return smooth(pts);
}

// ---------- hair ----------
// Each style has a back layer (behind the head), an optional front layer (over the forehead) and
// "top", the highest point of the hair, which hats and crowns sit on.
const cap = (c) => el('path', { d: 'M50 94 Q46 34 100 31 Q154 34 150 94 Q148 60 100 52 Q52 60 50 94 Z', fill: c.main });
const capBack = (c, bottom = 120) => el('path', { d: `M46 94 Q42 30 100 27 Q158 30 154 94 Q156 ${bottom - 10} 146 ${bottom} L54 ${bottom} Q44 ${bottom - 10} 46 94 Z`, fill: c.shade });
const shine = (d, c, w = 4) => el('path', { d, fill: 'none', stroke: c.shine, 'stroke-width': w, 'stroke-linecap': 'round', opacity: 0.55 });
const sidePart = (c) => [
  el('path', { d: 'M50 98 Q44 32 106 31 Q156 36 150 94 Q142 62 116 56 Q84 58 64 80 Q56 88 50 98 Z', fill: c.main }),
  shine('M70 50 Q88 40 110 40', c),
];
const bangs = (c) => [
  el('path', { d: 'M50 96 Q46 32 100 31 Q154 32 150 96 L145 72 L134 78 L126 64 L112 76 L100 62 L88 76 L74 64 L66 78 L55 72 Z', fill: c.main }),
  shine('M72 46 Q90 38 112 40', c),
];
const pulledBack = (c) => [el('path', { d: 'M52 90 Q50 34 100 32 Q150 34 148 90 Q138 56 100 52 Q62 56 52 90 Z', fill: c.main }), shine('M72 44 Q92 36 116 40', c)];
const centerPart = (c) => [el('path', { d: 'M50 94 Q48 34 100 32 Q152 34 150 94 Q142 58 103 50 L100 58 L97 50 Q58 58 50 94 Z', fill: c.main })];

// A soft, bumpy edge for coily textures: a filled shape ringed with small circles.
function coilyMass(cx, cy, rx, ry, c, bump = 9) {
  const out = [el('ellipse', { cx, cy, rx, ry, fill: c.shade })];
  const n = Math.round((Math.PI * (rx + ry)) / (bump * 1.3));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(el('circle', { cx: cx + Math.cos(a) * rx, cy: cy + Math.sin(a) * ry, r: bump, fill: c.shade }));
  }
  out.push(el('ellipse', { cx, cy: cy - 2, rx: rx - 4, ry: ry - 4, fill: c.main }));
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    out.push(el('circle', { cx: cx + Math.cos(a) * (rx - 5), cy: cy - 2 + Math.sin(a) * (ry - 5), r: bump - 2, fill: c.main }));
  }
  return out;
}
function coilyHairline(c) {
  const out = [el('path', { d: 'M52 92 Q48 36 100 33 Q152 36 148 92 Q140 62 100 56 Q60 62 52 92 Z', fill: c.main })];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = 56 + t * 88;
    const y = 86 - Math.sin(t * Math.PI) * 30;
    out.push(el('circle', { cx: x, cy: y, r: 5, fill: c.main }));
  }
  return out;
}
const strand = (d, c, w = 7, dash = '3 4') => [
  el('path', { d, fill: 'none', stroke: c.main, 'stroke-width': w, 'stroke-linecap': 'round' }),
  el('path', { d, fill: 'none', stroke: c.shade, 'stroke-width': w, 'stroke-linecap': 'butt', 'stroke-dasharray': dash, opacity: 0.6 }),
];
const tie = (x, y, color = '#ff4fb0') => el('circle', { cx: x, cy: y, r: 4.5, fill: color, stroke: INK, 'stroke-width': 1.2 });

const HAIR = {
  'long-straight': { top: 27, back: (c) => [el('path', { d: 'M46 90 Q38 190 56 238 L144 238 Q162 190 154 90 Q150 28 100 26 Q50 28 46 90 Z', fill: c.shade }), shine('M54 120 Q48 170 60 220', c)], front: sidePart },
  bob: { top: 27, back: (c) => [el('path', { d: 'M46 92 Q40 150 52 168 Q76 174 100 170 Q124 174 148 168 Q160 150 154 92 Q150 28 100 26 Q50 28 46 92 Z', fill: c.shade }), shine('M52 118 Q50 150 60 162', c)], front: bangs },
  pixie: { top: 29, back: (c) => [el('path', { d: 'M50 96 Q46 38 100 30 Q154 38 150 96 Q152 112 146 122 L54 122 Q48 112 50 96 Z', fill: c.shade })], front: (c) => [el('path', { d: 'M50 92 Q50 30 106 31 Q152 38 150 82 Q134 56 104 62 Q86 68 72 84 Q60 88 50 92 Z', fill: c.main }), shine('M76 46 Q96 38 118 42', c)] },
  ponytail: {
    top: 28,
    back: (c) => [capBack(c), el('path', { d: 'M132 42 Q188 30 184 100 Q180 162 156 192 Q166 124 142 80 Z', fill: c.main }), shine('M160 64 Q178 96 172 150', c), tie(138, 46)],
    front: pulledBack,
  },
  waves: {
    top: 27,
    back: (c) => [el('path', { d: 'M46 90 Q34 120 44 140 Q54 160 42 180 Q60 198 80 182 L120 182 Q140 198 158 180 Q146 160 156 140 Q166 120 154 90 Q150 28 100 26 Q50 28 46 90 Z', fill: c.shade }), shine('M50 118 Q40 136 52 152', c)],
    front: sidePart,
  },
  'space-buns': {
    top: 12,
    back: (c) => {
      const out = [capBack(c)];
      for (const x of [58, 142]) {
        out.push(el('circle', { cx: x, cy: 34, r: 21, fill: c.main }));
        out.push(el('path', { d: `M${x - 9} 34 Q${x} 22 ${x + 9} 32 Q${x + 4} 44 ${x - 4} 38`, fill: 'none', stroke: c.shade, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      }
      return out;
    },
    front: pulledBack,
  },
  'two-braids': {
    top: 29,
    back: (c) => {
      const out = [capBack(c, 130)];
      for (const x of [52, 148]) {
        for (let i = 0; i < 8; i++) out.push(el('ellipse', { cx: x + (i % 2 ? 3 : -3), cy: 126 + i * 13, rx: 8.5, ry: 9.5, fill: i % 2 ? c.main : c.shade }));
        out.push(tie(x, 232));
      }
      return out;
    },
    front: centerPart,
  },
  curls: {
    top: 18,
    back: (c) => {
      const out = [el('ellipse', { cx: 100, cy: 104, rx: 64, ry: 74, fill: c.shade })];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        out.push(el('circle', { cx: 100 + 62 * Math.cos(a), cy: 104 + 72 * Math.sin(a), r: 15, fill: i % 2 ? c.main : c.shade }));
      }
      return out;
    },
    front: (c) => {
      const out = [el('path', { d: 'M50 96 Q46 32 100 31 Q154 32 150 96 Q140 60 100 56 Q60 60 50 96 Z', fill: c.main })];
      for (const [x, y] of [[60, 70], [74, 56], [90, 50], [108, 50], [126, 56], [140, 70]]) {
        out.push(el('circle', { cx: x, cy: y, r: 9, fill: c.main }));
        out.push(el('path', { d: `M${x - 4} ${y - 2} q4 -5 8 0`, fill: 'none', stroke: c.shine, 'stroke-width': 2, opacity: 0.6 }));
      }
      return out;
    },
  },
  'top-bun': {
    top: 0,
    back: (c) => [capBack(c), ...coilyMass(100, 24, 22, 18, c, 6)],
    front: coilyHairline,
  },
  afro: { top: 4, back: (c) => coilyMass(100, 80, 68, 70, c, 11), front: coilyHairline },
  puffs: {
    top: 14,
    back: (c) => [capBack(c), ...coilyMass(46, 48, 26, 26, c, 7), ...coilyMass(154, 48, 26, 26, c, 7), tie(70, 66, '#ffc21a'), tie(130, 66, '#ffc21a')],
    front: coilyHairline,
  },
  'short-coils': { top: 20, back: (c) => coilyMass(100, 82, 56, 56, c, 7), front: coilyHairline },
  twists: {
    top: 18,
    back: (c) => {
      const out = coilyMass(100, 76, 56, 52, c, 7);
      for (const x of [42, 50, 58, 142, 150, 158]) out.push(...strand(`M${x} 96 Q${x + (x < 100 ? -4 : 4)} 140 ${x} 178`, c, 7, '2 3'));
      return out;
    },
    front: (c) => {
      const out = coilyHairline(c);
      for (const x of [60, 74, 126, 140]) out.push(...strand(`M${x} 64 Q${x + (x < 100 ? -6 : 6)} 78 ${x + (x < 100 ? -8 : 8)} 92`, c, 6, '2 3'));
      return out;
    },
  },
  'bantu-knots': {
    top: 18,
    back: (c) => [capBack(c)],
    front: (c) => {
      const out = [cap(c)];
      for (const [x, y] of [[64, 56], [100, 38], [136, 56], [82, 44], [118, 44]]) {
        out.push(el('circle', { cx: x, cy: y - 6, r: 11, fill: c.shade }));
        out.push(el('path', { d: `M${x - 6} ${y - 6} q6 -9 12 0 q-6 7 -9 2`, fill: 'none', stroke: c.main, 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
      }
      for (const [x1, y1, x2, y2] of [[100, 52, 100, 92], [82, 56, 62, 86], [118, 56, 138, 86]]) out.push(el('path', { d: `M${x1} ${y1} L${x2} ${y2}`, stroke: c.shade, 'stroke-width': 1.5, opacity: 0.7 }));
      return out;
    },
  },
  'box-braids': {
    top: 27,
    back: (c) => {
      const out = [capBack(c, 130)];
      for (let i = 0; i < 9; i++) {
        const x = 44 + i * 4.5;
        out.push(...strand(`M${x + 6} 96 Q${x - 2} 170 ${x + 2} 242`, c, 6));
        out.push(...strand(`M${194 - x} 96 Q${202 - x} 170 ${198 - x} 242`, c, 6));
      }
      return out;
    },
    front: (c) => {
      const out = centerPart(c);
      for (const x of [62, 74, 86, 114, 126, 138]) out.push(el('path', { d: `M${x < 100 ? 99 : 101} 52 Q${x} 58 ${x + (x < 100 ? -6 : 6)} 84`, fill: 'none', stroke: c.shade, 'stroke-width': 1.4, opacity: 0.7 }));
      return out;
    },
  },
  cornrows: {
    top: 32,
    back: (c) => [el('path', { d: 'M50 94 Q46 36 100 32 Q154 36 150 94 Q150 118 140 126 L60 126 Q50 118 50 94 Z', fill: c.shade }), ...strand('M100 120 Q104 150 98 176', c, 7)],
    front: (c) => {
      const out = [el('path', { d: 'M52 92 Q48 36 100 34 Q152 36 148 92 Q138 66 100 62 Q62 66 52 92 Z', fill: c.main })];
      for (const x of [58, 72, 86, 100, 114, 128, 142]) out.push(el('path', { d: `M${x} ${x === 100 ? 62 : 66 + Math.abs(100 - x) * 0.25} Q${100 + (x - 100) * 0.7} 48 ${100 + (x - 100) * 0.4} 40`, fill: 'none', stroke: c.shade, 'stroke-width': 3, 'stroke-dasharray': '3 2.5', opacity: 0.8 }));
      return out;
    },
  },
  locs: {
    top: 27,
    back: (c) => {
      const out = [capBack(c, 130)];
      for (let i = 0; i < 7; i++) {
        const x = 42 + i * 6;
        out.push(...strand(`M${x + 6} 92 Q${x - 6} 160 ${x + 2} 226`, c, 8, '6 5'));
        out.push(...strand(`M${194 - x} 92 Q${206 - x} 160 ${198 - x} 226`, c, 8, '6 5'));
      }
      return out;
    },
    front: (c) => [...sidePart(c), ...strand('M58 74 Q48 120 54 168', c, 8, '6 5'), ...strand('M144 72 Q154 118 148 166', c, 8, '6 5')],
  },
  'close-crop': {
    top: 33,
    back: () => [],
    front: (c) => {
      const out = [el('path', { d: 'M52 88 Q50 36 100 35 Q150 36 148 88 Q140 62 100 58 Q60 62 52 88 Z', fill: c.main, opacity: 0.92 })];
      for (let i = 0; i < 26; i++) out.push(el('circle', { cx: 64 + ((i * 37) % 72), cy: 46 + ((i * 13) % 18), r: 1.1, fill: c.shade, opacity: 0.6 }));
      return out;
    },
  },
};

// ---------- fabric patterns ----------
function patternDef(kind, main, id) {
  const P = (w, h, kids) => el('pattern', { id, width: w, height: h, patternUnits: 'userSpaceOnUse' }, [el('rect', { width: w, height: h, fill: main }), ...kids]);
  const light = mix(main, '#ffffff', 0.55);
  const dark = mix(main, '#000000', 0.35);
  switch (kind) {
    case 'blossom':
      return P(18, 18, [0, 1, 2, 3, 4].map((i) => el('circle', { cx: 9 + 3 * Math.cos((i / 5) * 6.283), cy: 9 + 3 * Math.sin((i / 5) * 6.283), r: 2, fill: light })).concat([el('circle', { cx: 9, cy: 9, r: 1.2, fill: GOLD })]));
    case 'cloud':
      return P(16, 12, [el('path', { d: 'M2 8 q3 -5 6 0 q3 -5 6 0', fill: 'none', stroke: light, 'stroke-width': 1.2, opacity: 0.8 })]);
    case 'kente':
      return P(16, 16, [
        el('rect', { x: 0, y: 0, width: 8, height: 8, fill: GOLD }),
        el('rect', { x: 8, y: 8, width: 8, height: 8, fill: '#13895c' }),
        el('path', { d: 'M0 2 h8 M0 5 h8 M10 8 v8 M13 8 v8', stroke: INK, 'stroke-width': 1.2 }),
        el('path', { d: 'M8 3 h8 M3 8 v8', stroke: '#c8203f', 'stroke-width': 1.6 }),
      ]);
    case 'wax':
      return P(20, 20, [
        el('circle', { cx: 10, cy: 10, r: 7, fill: GOLD }),
        el('circle', { cx: 10, cy: 10, r: 4.5, fill: dark }),
        el('circle', { cx: 10, cy: 10, r: 2, fill: light }),
        el('circle', { cx: 0, cy: 0, r: 3, fill: light }),
        el('circle', { cx: 20, cy: 20, r: 3, fill: light }),
      ]);
    case 'dots':
      return P(12, 12, [el('circle', { cx: 6, cy: 6, r: 2.4, fill: '#ffffff' })]);
    case 'tartan':
      return P(18, 18, [
        el('rect', { x: 0, y: 6, width: 18, height: 5, fill: dark, opacity: 0.8 }),
        el('rect', { x: 6, y: 0, width: 5, height: 18, fill: dark, opacity: 0.6 }),
        el('path', { d: 'M0 15 h18 M15 0 v18', stroke: GOLD, 'stroke-width': 1 }),
        el('path', { d: 'M0 2 h18 M2 0 v18', stroke: light, 'stroke-width': 0.8, opacity: 0.7 }),
      ]);
    default:
      return null;
  }
}

// ---------- body ----------
const ARM = { L: [[74, 154], [61, 206]], R: [[126, 154], [139, 206]] };
const along = ([a, b], t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const line = (p, q, stroke, w, extra = {}) => el('path', { d: `M${p[0]} ${p[1]} L${q[0]} ${q[1]}`, stroke, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none', ...extra });

function sleeves(kind, color, out) {
  for (const side of ['L', 'R']) {
    const arm = ARM[side];
    const m = side === 'L' ? -1 : 1;
    const len = { short: 0.3, elbow: 0.6, long: 0.98 }[kind];
    if (len) out.push(line(arm[0], along(arm, len), color, 16));
    if (kind === 'puff') out.push(el('ellipse', { cx: 100 + m * 29, cy: 160, rx: 12, ry: 11, fill: color }));
    if (kind === 'wide') out.push(el('path', { d: `M${100 + m * 24} 148 L${100 + m * 34} 150 L${100 + m * 48} 210 L${100 + m * 30} 212 Z`, fill: color }));
    if (kind === 'kimono' || kind === 'kimono-short') {
      const bottom = kind === 'kimono' ? 214 : 190;
      out.push(el('path', { d: `M${100 + m * 24} 148 L${100 + m * 36} 150 L${100 + m * 52} ${bottom - 30} Q${100 + m * 52} ${bottom} ${100 + m * 40} ${bottom} L${100 + m * 30} ${bottom} Z`, fill: color }));
    }
  }
}

function outfit(look, ctx, defs) {
  const out = [];
  const st = pick('style', look.style);
  const colorHex = pick('styleColor', look.styleColor).hex;
  const accent = look.styleColor === 'saffron' ? '#c8203f' : GOLD;
  const contrast = look.styleColor === 'ivory' ? '#e2508f' : IVORY;
  let main = colorHex;
  let top = colorHex;
  if (st.base === 'ivory') top = IVORY;
  if (st.pattern) {
    const id = `rrp${ctx.uid}`;
    defs.append(patternDef(st.pattern, colorHex, id));
    main = `url(#${id})`;
    if (st.base !== 'ivory') top = main;
  }
  const solid = st.base === 'ivory' ? IVORY : colorHex; // sleeves and edges use a plain colour
  const bottom = { denim: DENIM, ink: '#232041', ivory: '#efe6d2', match: mix(colorHex, '#000000', 0.15) }[st.bottom] || mix(colorHex, '#232041', 0.55);
  const trim = new Set(st.trim || []);
  const pants = (y0 = 200) => {
    out.push(el('rect', { x: 76, y: y0, width: 48, height: 20, rx: 6, fill: bottom }));
    out.push(el('rect', { x: 79, y: y0 + 10, width: 18, height: 254 - y0, rx: 6, fill: bottom }));
    out.push(el('rect', { x: 103, y: y0 + 10, width: 18, height: 254 - y0, rx: 6, fill: bottom }));
  };
  const bodice = (y1, fill = top) => out.push(el('rect', { x: 72, y: 146, width: 56, height: y1 - 146, rx: 14, fill }));
  const skirt = (y0, y1, spread, fill = main) => out.push(el('path', { d: `M74 ${y0} L126 ${y0} L${126 + spread} ${y1} Q100 ${y1 + 4} ${74 - spread} ${y1} Z`, fill }));

  // sleeves go under the body piece so armholes look tucked in
  const sleeveColor = trim.has('blazer') ? '#232041' : trim.has('jeogori') ? contrast : solid;
  if (st.sleeves && st.sleeves !== 'none' && st.cut !== 'tee-shorts') sleeves(st.sleeves, st.sleeves.startsWith('kimono') ? main : sleeveColor, out);

  switch (st.cut) {
    case 'tee-shorts':
      sleeves('short', ctx.teeColor, out);
      out.push(el('rect', { x: 72, y: 146, width: 56, height: 74, rx: 14, fill: ctx.teeColor }));
      out.push(el('rect', { x: 77, y: 208, width: 46, height: 16, rx: 6, fill: colorHex }));
      break;
    case 'top-pants':
      pants();
      bodice(trim.has('dashiki-yoke') ? 196 : 210);
      break;
    case 'overalls':
      sleeves('short', '#ffffff', out);
      pants();
      bodice(204, '#ffffff');
      out.push(el('rect', { x: 82, y: 166, width: 36, height: 44, rx: 6, fill: DENIM }));
      out.push(line([84, 168], [78, 148], DENIM, 5));
      out.push(line([116, 168], [122, 148], DENIM, 5));
      out.push(el('rect', { x: 92, y: 176, width: 16, height: 12, rx: 3, fill: colorHex }));
      break;
    case 'top-skirt-long':
    case 'top-skirt-midi':
    case 'top-skirt-short': {
      const y1 = { 'top-skirt-long': 262, 'top-skirt-midi': 238, 'top-skirt-short': 222 }[st.cut];
      bodice(198, st.base === 'ivory' ? IVORY : trim.has('kente-jacket') ? contrast : top);
      skirt(196, y1, st.cut === 'top-skirt-long' ? 20 : 12);
      break;
    }
    case 'top-skirt-full':
      out.push(el('path', { d: 'M70 166 L130 166 Q158 220 160 262 Q100 270 40 262 Q42 220 70 166 Z', fill: main }));
      bodice(176);
      break;
    case 'dress-long':
    case 'dress-midi':
    case 'dress-short': {
      const y1 = { 'dress-long': 262, 'dress-midi': 236, 'dress-short': 220 }[st.cut];
      out.push(el('path', { d: `M76 146 L124 146 Q130 170 126 196 L${138 + (y1 - 220) / 4} ${y1} Q100 ${y1 + 4} ${62 - (y1 - 220) / 4} ${y1} L74 196 Q70 170 76 146 Z`, fill: main }));
      break;
    }
    case 'robe-long':
      out.push(el('path', { d: 'M72 146 L128 146 Q132 200 134 262 Q100 266 66 262 Q68 200 72 146 Z', fill: main }));
      break;
    case 'tunic-long':
    case 'tunic-short': {
      pants(206);
      const y1 = st.cut === 'tunic-long' ? 242 : 222;
      out.push(el('path', { d: `M74 146 L126 146 Q130 180 130 ${y1} L70 ${y1} Q70 180 74 146 Z`, fill: top }));
      break;
    }
    case 'skirt-long':
      skirt(194, 262, 20);
      bodice(184, solid);
      break;
    case 'wrap-long':
      out.push(el('path', { d: 'M74 156 Q100 150 126 156 Q132 200 140 262 Q100 268 60 262 Q68 200 74 156 Z', fill: main }));
      break;
    default:
  }

  // trims and details
  const T = (name, fn) => trim.has(name) && fn();
  T('pocket', () => out.push(el('rect', { x: 82, y: 186, width: 36, height: 16, rx: 6, fill: mix(colorHex, '#000000', 0.15) })));
  T('hood', () => {
    out.push(el('path', { d: 'M78 142 Q100 166 122 142 L126 152 Q100 176 74 152 Z', fill: mix(colorHex, '#000000', 0.15) }));
    out.push(line([94, 156], [93, 176], '#ffffff', 2));
    out.push(line([106, 156], [107, 176], '#ffffff', 2));
  });
  T('open-jacket', () => {
    out.push(el('rect', { x: 84, y: 146, width: 32, height: 64, rx: 6, fill: '#ffffff' }));
    out.push(el('path', { d: 'M72 146 L90 146 L88 226 L68 226 Q68 180 72 146 Z', fill: main }));
    out.push(el('path', { d: 'M128 146 L110 146 L112 226 L132 226 Q132 180 128 146 Z', fill: main }));
  });
  T('wrap-collar', () => {
    out.push(line([90, 146], [106, 186], contrast, 5));
    out.push(line([110, 146], [96, 180], mix(contrast, '#000000', 0.08), 5));
  });
  T('obi', () => {
    out.push(el('rect', { x: 70, y: 180, width: 60, height: 22, rx: 3, fill: accent }));
    out.push(line([72, 191], [128, 191], '#c8203f', 2.5));
  });
  T('jeogori', () => {
    out.push(el('rect', { x: 70, y: 146, width: 60, height: 30, rx: 10, fill: contrast }));
    out.push(line([90, 146], [104, 170], '#ffffff', 4));
    out.push(line([110, 146], [98, 166], '#ffffff', 4));
  });
  T('goreum', () => {
    const y = trim.has('jeogori') ? 166 : 168;
    out.push(el('path', { d: `M102 ${y} L96 ${y + 46} L101 ${y + 46} L105 ${y + 4} Z`, fill: '#c8203f' }));
    out.push(el('path', { d: `M104 ${y} L114 ${y + 40} L118 ${y + 38} L107 ${y} Z`, fill: '#c8203f' }));
    out.push(el('circle', { cx: 104, cy: y, r: 4, fill: '#c8203f' }));
  });
  T('mandarin', () => out.push(el('rect', { x: 88, y: 140, width: 24, height: 10, rx: 4, fill: solid, stroke: accent, 'stroke-width': 1.5 })));
  T('frogs', () => {
    out.push(el('path', { d: 'M100 150 Q114 154 120 166', fill: 'none', stroke: accent, 'stroke-width': 1.6 }));
    for (const [x, y] of [[106, 152], [113, 157], [118, 163]]) out.push(line([x - 3, y + 2], [x + 3, y - 2], accent, 2.2));
  });
  T('slit', () => out.push(line([128, 226], [133, 260], mix(colorHex, '#000000', 0.35), 1.8)));
  T('side-slits', () => {
    const y1 = st.cut === 'tunic-long' ? 242 : 222;
    out.push(el('path', { d: `M70 ${y1} L74 200 L78 ${y1} Z`, fill: bottom }));
    out.push(el('path', { d: `M130 ${y1} L126 200 L122 ${y1} Z`, fill: bottom }));
  });
  T('border', () => {
    const y = st.cut === 'skirt-long' || st.cut === 'dress-long' ? 258 : 234;
    out.push(el('path', { d: `M56 ${y} Q100 ${y + 6} 144 ${y}`, fill: 'none', stroke: accent, 'stroke-width': 5 }));
  });
  T('pallu', () => {
    out.push(el('path', { d: 'M124 204 L134 194 L88 144 L72 148 Q60 196 66 236 L78 234 Q74 196 82 160 Z', fill: main }));
    out.push(el('path', { d: 'M134 194 L88 144', fill: 'none', stroke: accent, 'stroke-width': 4 }));
    out.push(el('path', { d: 'M66 236 L78 234', fill: 'none', stroke: accent, 'stroke-width': 4 }));
  });
  T('dupatta', () => {
    out.push(el('path', { d: 'M80 144 Q100 162 120 144 L126 150 Q132 190 124 214 L116 212 Q122 186 116 158 Q100 170 84 158 Q78 186 84 212 L76 214 Q68 190 74 150 Z', fill: contrast }));
    out.push(line([78, 213], [84, 212], accent, 3));
    out.push(line([116, 212], [124, 213], accent, 3));
  });
  T('neck-embroidery', () => {
    out.push(el('path', { d: 'M88 146 Q100 160 112 146', fill: 'none', stroke: accent, 'stroke-width': 3, 'stroke-dasharray': '2 3' }));
    out.push(line([100, 156], [100, 186], accent, 2.5, { 'stroke-dasharray': '2 3' }));
  });
  T('shoulder-drape', () => out.push(el('path', { d: 'M72 148 L94 146 L122 200 L102 208 Z', fill: main, stroke: INK, 'stroke-width': 1, opacity: 0.95 })));
  T('kente-jacket', () => {
    const id = `rrk${ctx.uid}`;
    defs.append(patternDef('kente', colorHex, id));
    out.push(el('path', { d: 'M70 146 L92 146 L94 210 L70 210 Z', fill: colorHex }));
    out.push(el('path', { d: 'M130 146 L108 146 L106 210 L130 210 Z', fill: colorHex }));
    out.push(line([90, 148], [93, 208], `url(#${id})`, 7));
    out.push(line([110, 148], [107, 208], `url(#${id})`, 7));
  });
  T('peplum', () => out.push(el('path', { d: 'M74 192 L126 192 Q140 206 134 214 Q100 206 66 214 Q60 206 74 192 Z', fill: main })));
  T('belt', () => out.push(el('rect', { x: 74, y: 190, width: 52, height: 8, rx: 3, fill: accent })));
  T('dashiki-yoke', () => {
    out.push(el('path', { d: 'M84 146 L116 146 L114 176 L100 190 L86 176 Z', fill: IVORY }));
    out.push(el('path', { d: 'M88 152 L112 152 L110 174 L100 184 L90 174 Z', fill: 'none', stroke: accent, 'stroke-width': 2.5 }));
    out.push(el('path', { d: 'M92 162 l4 -5 l4 5 l4 -5 l4 5', fill: 'none', stroke: colorHex, 'stroke-width': 2 }));
  });
  T('huipil-yoke', () => {
    out.push(el('rect', { x: 80, y: 146, width: 40, height: 32, rx: 4, fill: colorHex }));
    out.push(el('rect', { x: 88, y: 146, width: 24, height: 12, rx: 3, fill: IVORY }));
    const flowers = ['#c8203f', GOLD, '#13895c', '#e2508f', '#2448b8'];
    for (let i = 0; i < 5; i++) out.push(el('circle', { cx: 84 + i * 8, cy: 170, r: 3, fill: flowers[i], stroke: '#ffffff', 'stroke-width': 0.8 }));
  });
  T('center-trim', () => {
    const y1 = st.cut === 'robe-long' ? 260 : 220;
    out.push(line([100, 148], [100, y1], accent, 5));
    for (let y = 154; y < y1; y += 9) out.push(el('circle', { cx: 100, cy: y, r: 1.6, fill: '#ffffff' }));
  });
  T('butterfly', () => {
    for (const m of [-1, 1]) out.push(el('path', { d: `M${100 + m * 18} 150 Q${100 + m * 26} 126 ${100 + m * 42} 132 Q${100 + m * 38} 150 ${100 + m * 34} 168 Z`, fill: st.cut === 'dress-long' ? solid : IVORY, stroke: mix(colorHex, '#000000', 0.2), 'stroke-width': 1.2 }));
  });
  T('ruffles', () => {
    // three wavy tiers that follow the skirt's flare
    const long = st.cut === 'dress-long';
    const y0 = long ? 236 : 216;
    const flare = long ? 0.34 : 12 / 42;
    for (let i = 0; i < 3; i++) {
      const y = y0 + i * 8;
      const left = 74 - (y - 196) * flare;
      const seg = (2 * (100 - left)) / 5;
      let d = `M${left.toFixed(1)} ${y}`;
      for (let k = 0; k < 5; k++) d += ` q${(seg / 2).toFixed(1)} 8 ${seg.toFixed(1)} 0`;
      out.push(el('path', { d, fill: 'none', stroke: i % 2 ? '#ffffff' : mix(colorHex, '#000000', 0.25), 'stroke-width': 4, 'stroke-linecap': 'round' }));
    }
  });
  T('sash', () => {
    out.push(el('path', { d: 'M118 146 L130 152 L84 214 L72 206 Z', fill: main }));
    out.push(el('circle', { cx: 122, cy: 152, r: 5, fill: GOLD, stroke: INK, 'stroke-width': 1 }));
  });
  T('pleats', () => {
    const y1 = st.cut === 'top-skirt-short' ? 220 : 236;
    for (const x of [84, 94, 106, 116]) out.push(line([x, 200], [x + (x - 100) * 0.3, y1 - 2], mix(colorHex, '#000000', 0.4), 1.2, { opacity: 0.6 }));
  });
  T('blazer', () => {
    out.push(el('path', { d: 'M70 146 L92 146 L96 214 L70 214 Z', fill: '#232041' }));
    out.push(el('path', { d: 'M130 146 L108 146 L104 214 L130 214 Z', fill: '#232041' }));
    out.push(line([90, 148], [98, 176], '#ffffff', 1.5));
    out.push(line([110, 148], [102, 176], '#ffffff', 1.5));
  });
  return out;
}

// ---------- head coverings ----------
function headwearBack(hw, color, out) {
  if (hw === 'hijab') out.push(el('path', { d: 'M100 26 C152 26 166 64 164 104 C162 140 168 168 176 196 L24 196 C32 168 38 140 36 104 C34 64 48 26 100 26 Z', fill: color }));
}
function headwearDrape(hw, color, out) {
  if (hw === 'hijab') {
    out.push(el('path', { d: 'M48 136 Q100 182 152 136 L160 178 Q100 206 40 178 Z', fill: color }));
    out.push(el('path', { d: 'M56 168 Q100 190 144 168', fill: 'none', stroke: mix(color, '#000000', 0.18), 'stroke-width': 2 }));
  }
}
function headwearFront(hw, color, top, out) {
  const dark = mix(color, '#000000', 0.22);
  const fold = (d) => out.push(el('path', { d, fill: 'none', stroke: dark, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  const lift = (kids) => out.push(el('g', { transform: `translate(0 ${Math.min(0, top - 32)})` }, kids));
  switch (hw) {
    case 'hijab':
      out.push(el('path', { d: 'M100 28 C150 28 160 66 158 104 C156 140 136 164 100 166 C64 164 44 140 42 104 C40 66 50 28 100 28 Z M100 52 C126 52 140 70 140 100 C140 128 124 150 100 150 C76 150 60 128 60 100 C60 70 74 52 100 52 Z', fill: color, 'fill-rule': 'evenodd' }));
      fold('M62 74 Q100 44 138 74');
      break;
    case 'turban':
      out.push(el('path', { d: 'M46 86 Q38 30 100 16 Q162 30 154 86 Q130 64 100 68 Q70 64 46 86 Z', fill: color }));
      fold('M52 76 Q90 40 140 32');
      fold('M60 82 Q100 54 150 60');
      fold('M100 68 Q96 42 112 22');
      break;
    case 'head-wrap':
      out.push(el('path', { d: 'M44 88 Q32 20 96 8 Q170 4 158 88 Q130 64 100 68 Q70 64 44 88 Z', fill: color }));
      out.push(el('ellipse', { cx: 108, cy: 30, rx: 18, ry: 12, fill: dark }));
      out.push(el('ellipse', { cx: 96, cy: 34, rx: 12, ry: 9, fill: color }));
      fold('M52 74 Q86 46 140 46');
      fold('M58 82 Q100 60 150 72');
      break;
    case 'gele':
      out.push(el('path', { d: 'M38 66 Q42 18 72 8 L100 30 L130 6 Q164 16 166 64 Q140 54 100 58 Q60 54 38 66 Z', fill: color }));
      for (const x of [56, 72, 88, 112, 128, 146]) fold(`M100 52 L${x} ${x < 100 ? 16 + (x - 56) / 3 : 14 + (146 - x) / 3}`);
      out.push(el('path', { d: 'M46 90 Q40 56 100 52 Q160 56 154 90 Q130 70 100 72 Q70 70 46 90 Z', fill: dark }));
      break;
    case 'headband':
      lift([el('path', { d: 'M52 78 Q100 26 148 78', fill: 'none', stroke: color, 'stroke-width': 9, 'stroke-linecap': 'round' })]);
      break;
    case 'bandana':
      lift([
        el('path', { d: 'M50 80 Q48 30 100 28 Q152 30 150 80 Q100 64 50 80 Z', fill: color }),
        el('circle', { cx: 152, cy: 80, r: 6, fill: dark }),
        el('path', { d: 'M154 82 L168 100 L160 104 Z', fill: color }),
        ...[0, 1, 2, 3, 4].map((i) => el('circle', { cx: 68 + i * 16, cy: 54 - Math.sin((i / 4) * Math.PI) * 10, r: 2.4, fill: '#ffffff' })),
      ]);
      break;
    case 'beret':
      lift([
        el('ellipse', { cx: 106, cy: 40, rx: 54, ry: 17, fill: color, transform: 'rotate(-8 106 40)' }),
        el('path', { d: 'M56 52 Q100 60 150 40', fill: 'none', stroke: dark, 'stroke-width': 3 }),
        el('circle', { cx: 112, cy: 22, r: 3.5, fill: dark }),
      ]);
      break;
    default:
  }
}

// ---------- the face ----------
function eye(cx, cy, o, shape, iris, sk, ctx, out, defs) {
  const w = 12;
  const inner = cx - o * w;
  const outer = cx + o * w;
  const spec = {
    round: [cy, cy, 13, 12],
    almond: [cy + 1, cy, 10, 7],
    hooded: [cy + 1, cy + 0.5, 10, 7],
    monolid: [cy, cy - 1, 7, 6],
    upturned: [cy + 2, cy - 3, 9.5, 7],
    downturned: [cy - 1, cy + 3, 10, 6],
  }[shape] || [cy + 1, cy, 10, 7];
  const [yi, yo, up, dn] = spec;
  const dx = outer - inner;
  const top = `M${inner} ${yi} C${inner + dx * 0.2} ${cy - up} ${inner + dx * 0.8} ${cy - up} ${outer} ${yo}`;
  const d = `${top} C${inner + dx * 0.75} ${cy + dn} ${inner + dx * 0.25} ${cy + dn} ${inner} ${yi} Z`;
  const id = `rre${ctx.uid}${o > 0 ? 'r' : 'l'}`;
  defs.append(el('clipPath', { id }, [el('path', { d })]));
  out.push(el('path', { d, fill: '#fffaf5' }));
  out.push(el('g', { 'clip-path': `url(#${id})` }, [
    el('circle', { cx, cy: cy + 0.5, r: shape === 'round' ? 7.5 : 6.8, fill: iris }),
    el('circle', { cx, cy: cy + 0.5, r: 3.3, fill: '#140f1c' }),
    el('circle', { cx: cx + 2.4, cy: cy - 2.4, r: 2.2, fill: '#ffffff' }),
    el('circle', { cx: cx - 2.2, cy: cy + 3, r: 1, fill: '#ffffff', opacity: 0.8 }),
  ]));
  if (shape === 'hooded') {
    out.push(el('path', { d: `M${inner - o} ${yi - 1} C${inner + dx * 0.2} ${cy - up - 4} ${inner + dx * 0.8} ${cy - up - 4} ${outer + o * 2} ${yo} C${inner + dx * 0.8} ${cy - up * 0.35} ${inner + dx * 0.2} ${cy - up * 0.35} ${inner - o} ${yi - 1} Z`, fill: sk.base }));
    out.push(el('path', { d: `M${inner} ${yi} C${inner + dx * 0.2} ${cy - up * 0.35} ${inner + dx * 0.8} ${cy - up * 0.35} ${outer} ${yo}`, fill: 'none', stroke: '#1e1626', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
    out.push(el('path', { d: `M${inner} ${yi - 2} C${inner + dx * 0.2} ${cy - up - 4} ${inner + dx * 0.8} ${cy - up - 4} ${outer + o * 2} ${yo - 1}`, fill: 'none', stroke: sk.line, 'stroke-width': 1.2, opacity: 0.6 }));
  } else {
    out.push(el('path', { d: top, fill: 'none', stroke: '#1e1626', 'stroke-width': shape === 'monolid' ? 3.2 : 2.6, 'stroke-linecap': 'round' }));
    if (shape !== 'monolid') out.push(el('path', { d: `M${inner + o * 2} ${yi - 4} C${inner + dx * 0.25} ${cy - up - 4} ${inner + dx * 0.75} ${cy - up - 4} ${outer - o} ${yo - 4}`, fill: 'none', stroke: sk.line, 'stroke-width': 1.1, opacity: 0.55 }));
  }
  out.push(line([outer, yo], [outer + o * 3.5, yo - 2.5], '#1e1626', 2.2));
}

function brow(cx, o, kind, color, out) {
  const p = (x, y) => `${cx + o * x} ${y}`;
  const w = { full: 5.2, thin: 1.8 }[kind] || 3.4;
  const d = {
    straight: `M${p(-11, 82)} L${p(12, 81)}`,
    rounded: `M${p(-10, 84)} Q${p(1, 73)} ${p(13, 84)}`,
    angled: `M${p(-10, 84)} L${p(6, 77)} L${p(13, 82)}`,
  }[kind] || `M${p(-10, 84)} Q${p(4, 76)} ${p(13, 83)}`;
  out.push(el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

function nose(kind, sk, out) {
  const st = { fill: 'none', stroke: sk.line, 'stroke-width': 2, 'stroke-linecap': 'round' };
  switch (kind) {
    case 'button':
      out.push(el('circle', { cx: 100, cy: 114, r: 3.6, fill: sk.shade, opacity: 0.8 }));
      out.push(el('path', { d: 'M96 116 Q100 119 104 116', ...st }));
      break;
    case 'wide':
      out.push(el('path', { d: 'M92 112 Q94 119 100 118 Q106 119 108 112', ...st }));
      out.push(el('ellipse', { cx: 96, cy: 116, rx: 1.6, ry: 1.1, fill: sk.line }));
      out.push(el('ellipse', { cx: 104, cy: 116, rx: 1.6, ry: 1.1, fill: sk.line }));
      break;
    case 'rounded':
      out.push(el('ellipse', { cx: 100, cy: 114, rx: 5, ry: 4, fill: sk.shade, opacity: 0.7 }));
      out.push(el('path', { d: 'M95 117 Q100 120 105 117', ...st }));
      break;
    case 'straight':
      out.push(el('path', { d: 'M102 106 L103 113', ...st, 'stroke-width': 1.4, opacity: 0.45 }));
      out.push(el('path', { d: 'M96 116 Q100 118.5 104 115.5', ...st }));
      break;
    case 'high-bridge':
      out.push(el('path', { d: 'M102 98 Q105 106 104 113', fill: 'none', stroke: sk.shade, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.6 }));
      out.push(el('path', { d: 'M95 115 Q98 119 101 117 Q104 118 105 114', ...st }));
      break;
    default:
      out.push(el('path', { d: 'M97 115 Q100 118 103 115', ...st }));
  }
}

function lips(kind, colorId, sk, out) {
  const [w, hu, hl, bow] = { full: [10, 4.5, 6.5, 1.2], thin: [9, 1.8, 2.6, 0.6], wide: [12.5, 3, 4.5, 1], heart: [8.5, 4.2, 5, 2.4], small: [6.5, 2.6, 3.6, 0.8] }[kind] || [9, 3, 4.5, 1];
  const lc = pick('lipColor', colorId);
  const color = lc.hex && lc.hex !== 'gloss' ? lc.hex : sk.lip;
  const y = 127;
  out.push(el('path', { d: `M${100 - w} ${y} Q${100 - w * 0.5} ${y - hu - 1} ${100 - w * 0.18} ${y - hu} Q100 ${y - hu + bow} ${100 + w * 0.18} ${y - hu} Q${100 + w * 0.5} ${y - hu - 1} ${100 + w} ${y} Q100 ${y + 1} ${100 - w} ${y} Z`, fill: color }));
  out.push(el('path', { d: `M${100 - w} ${y} Q100 ${y + hl * 2} ${100 + w} ${y} Q100 ${y + 1.2} ${100 - w} ${y} Z`, fill: mix(color, '#ffffff', 0.12) }));
  out.push(el('path', { d: `M${100 - w} ${y} Q100 ${y + 1.5} ${100 + w} ${y}`, fill: 'none', stroke: mix(color, '#000000', 0.45), 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
  out.push(el('ellipse', { cx: 102, cy: y + hl * 0.55, rx: w * 0.3, ry: 1, fill: '#ffffff', opacity: lc.hex === 'gloss' ? 0.75 : 0.3 }));
}

function glasses(kind, out) {
  if (kind === 'none') return;
  const st = { fill: '#ffffff', 'fill-opacity': 0.15, stroke: INK, 'stroke-width': 2.4 };
  for (const cx of [80, 120]) {
    if (kind === 'round') out.push(el('circle', { cx, cy: 100, r: 13, ...st }));
    if (kind === 'rectangle') out.push(el('rect', { x: cx - 15, y: 90, width: 30, height: 20, rx: 4, ...st }));
    if (kind === 'cat-eye') {
      const o = cx < 100 ? -1 : 1;
      out.push(el('path', { d: `M${cx - o * 13} 94 Q${cx} 88 ${cx + o * 16} 86 Q${cx + o * 14} 110 ${cx} 111 Q${cx - o * 13} 110 ${cx - o * 13} 94 Z`, ...st }));
    }
  }
  out.push(el('path', { d: 'M93 98 Q100 93 107 98', fill: 'none', stroke: INK, 'stroke-width': 2.4 }));
}

function earrings(kind, cheek, out) {
  for (const m of [-1, 1]) {
    const x = 100 + m * (cheek + 1);
    if (kind === 'studs') out.push(el('circle', { cx: x, cy: 112, r: 2.6, fill: GOLD, stroke: '#a07a10', 'stroke-width': 0.8 }));
    if (kind === 'hoops') out.push(el('circle', { cx: x, cy: 119, r: 6.5, fill: 'none', stroke: GOLD, 'stroke-width': 2.2 }));
    if (kind === 'drops') {
      out.push(line([x, 112], [x, 118], GOLD, 1.5));
      out.push(el('path', { d: `M${x} 118 Q${x + 4} 124 ${x} 128 Q${x - 4} 124 ${x} 118 Z`, fill: '#2fc9a2', stroke: GOLD, 'stroke-width': 1 }));
    }
  }
}

// ---------- earned pieces ----------
// tone: the three shades a piece is drawn with. Skill pieces keep their own colours.
const tone = (hex) => ({ main: hex, dark: mix(hex, '#120a20', 0.32), light: mix(hex, '#ffffff', 0.5) });
const quad = (p0, p1, p2, t) => [0, 1].map((k) => (1 - t) ** 2 * p0[k] + 2 * t * (1 - t) * p1[k] + t * t * p2[k]);

function jacket(c, { hem = 214, sleeve = c.main, cuff = null, sleeves = true } = {}) {
  const out = [];
  if (sleeves) {
    for (const side of ['L', 'R']) {
      out.push(line(ARM[side][0], along(ARM[side], 0.95), sleeve, 16));
      if (cuff) out.push(line(along(ARM[side], 0.86), along(ARM[side], 0.95), cuff, 16));
    }
  }
  out.push(el('path', { d: `M66 146 L91 146 L91 ${hem} L70 ${hem} Z`, fill: c.main }));
  out.push(el('path', { d: `M109 146 L134 146 L130 ${hem} L109 ${hem} Z`, fill: c.main }));
  return out;
}

// Wrist pieces sit on the left wrist, turned to follow the arm.
const atWrist = (t, kids) => {
  const [x, y] = along(ARM.L, t);
  return el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(14)` }, kids);
};
const ring = (stroke, w = 2, extra = {}) => el('ellipse', { cx: 0, cy: 0, rx: 8, ry: 2.8, fill: 'none', stroke, 'stroke-width': w, ...extra });

const feet = (draw) => [89, 111].flatMap((cx) => draw(cx));
const sole = (cx, y = 270) => el('rect', { x: cx - 13, y, width: 26, height: 4, rx: 2, fill: '#ffffff' });

const ITEM_ART = {
  // skill pieces
  'couture-cape': () => [el('path', { d: 'M52 130 Q100 118 148 130 L168 250 L32 250 Z', fill: '#4b2fb8' })],
  'gala-gown': () => [el('path', { d: 'M76 148 L124 148 L156 262 L44 262 Z', fill: '#ff7ac6' }), el('path', { d: 'M76 148 L124 148 L128 170 L72 170 Z', fill: '#ff9fd8' })],
  'fraction-jacket': () => [el('path', { d: 'M66 146 L90 146 L90 214 L70 214 Z', fill: '#2fc9a2' }), el('path', { d: 'M110 146 L134 146 L130 214 L110 214 Z', fill: '#2fc9a2' })],
  'sale-scarf': () => [el('path', { d: 'M82 144 Q100 160 118 144 L122 156 Q100 174 78 156 Z', fill: '#ffb830' })],
  'ratio-pearls': () => Array.from({ length: 7 }, (_, i) => el('circle', { cx: 80 + i * 6.7, cy: 154 + Math.sin((i / 6) * Math.PI) * 10, r: 3.4, fill: '#fff', stroke: '#d8d0f5' })),
  'crystal-crown': (c, x) => [el('path', { d: 'M70 52 L80 30 L92 48 L100 24 L108 48 L120 30 L130 52 Z', fill: '#9ae7ff', stroke: '#4aa8ff', 'stroke-width': 2, transform: `translate(0 ${Math.min(0, x.top - 30)})` })],

  // hats and crowns (moved up or down to sit on the hair or head covering)
  'sun-hat': (c) => [
    el('ellipse', { cx: 100, cy: 47, rx: 62, ry: 10, fill: c.main }),
    el('path', { d: 'M66 46 Q66 14 100 14 Q134 14 134 46 Z', fill: c.main }),
    el('path', { d: 'M66 39 Q100 33 134 39 L134 46 Q100 40 66 46 Z', fill: c.dark }),
  ],
  'bucket-hat': (c) => [
    el('path', { d: 'M66 40 Q66 12 100 12 Q134 12 134 40 Z', fill: c.main }),
    el('path', { d: 'M56 54 L66 37 L134 37 L144 54 Q100 62 56 54 Z', fill: c.dark }),
    el('path', { d: 'M62 50 Q100 57 138 50', fill: 'none', stroke: c.light, 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }),
  ],
  'baseball-cap': (c) => [
    el('path', { d: 'M58 48 Q58 10 100 10 Q142 10 142 48 Q100 40 58 48 Z', fill: c.main }),
    el('path', { d: 'M100 11 L100 42 M80 15 Q74 30 76 44 M120 15 Q126 30 124 44', fill: 'none', stroke: c.dark, 'stroke-width': 1.2 }),
    el('path', { d: 'M64 47 Q100 37 136 47 Q138 58 100 58 Q62 58 64 47 Z', fill: c.dark }),
    el('circle', { cx: 100, cy: 11, r: 3, fill: c.dark }),
  ],
  'flower-crown': (c) => {
    const out = [];
    const a = [60, 56];
    const m = [100, 22];
    const b = [140, 56];
    for (let i = 0; i < 6; i++) {
      const [x, y] = quad(a, m, b, (i + 0.5) / 6);
      out.push(el('ellipse', { cx: x, cy: y + 2, rx: 6, ry: 2.6, fill: '#3a9b5c', transform: `rotate(${i % 2 ? 30 : -30} ${x} ${y + 2})` }));
    }
    for (let i = 0; i < 7; i++) {
      const [x, y] = quad(a, m, b, i / 6);
      const petal = i % 2 ? c.light : c.main;
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2;
        out.push(el('circle', { cx: x + Math.cos(ang) * 3.6, cy: y + Math.sin(ang) * 3.6, r: 3.2, fill: petal }));
      }
      out.push(el('circle', { cx: x, cy: y, r: 2.4, fill: GOLD }));
    }
    return out;
  },
  'bow-clip': (c) => [
    el('path', { d: 'M134 50 L120 40 L121 60 Z M134 50 L148 40 L147 60 Z', fill: c.main, stroke: c.dark, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
    el('circle', { cx: 134, cy: 50, r: 3.6, fill: c.dark }),
  ],
  'knit-beanie': (c) => [
    el('path', { d: 'M58 52 Q56 6 100 6 Q144 6 142 52 Z', fill: c.main }),
    el('path', { d: 'M56 42 Q100 34 144 42 L144 56 Q100 48 56 56 Z', fill: c.dark }),
    ...[66, 76, 86, 96, 106, 116, 126, 136].map((x) => el('path', { d: `M${x} 41 L${x} 52`, stroke: c.light, 'stroke-width': 1.2, opacity: 0.6 })),
    el('circle', { cx: 100, cy: 5, r: 9, fill: c.light }),
  ],
  'starlit-tiara': (c) => [
    el('path', { d: 'M74 49 Q100 39 126 49', fill: 'none', stroke: GOLD, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    el('path', { d: 'M79 46 L85 34 L91 43 L100 20 L109 43 L115 34 L121 46 Q100 40 79 46 Z', fill: c.light, stroke: c.main, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
    el('path', { d: 'M100 24 L102 29 L107 29 L103 32 L104.5 37 L100 34 L95.5 37 L97 32 L93 29 L98 29 Z', fill: GOLD }),
  ],

  // necklaces
  'heart-locket': (c) => [
    el('path', { d: 'M86 142 Q100 166 114 142', fill: 'none', stroke: GOLD, 'stroke-width': 1.5 }),
    el('path', { d: 'M100 174 L93 166 Q90 161 95 159 Q99 158 100 162 Q101 158 105 159 Q110 161 107 166 Z', fill: c.main, stroke: GOLD, 'stroke-width': 1 }),
  ],
  'bead-necklace': (c) => Array.from({ length: 11 }, (_, i) => {
    const [x, y] = quad([84, 142], [100, 172], [116, 142], i / 10);
    return el('circle', { cx: x, cy: y, r: 3, fill: i % 2 ? c.light : c.main });
  }),
  'chain-necklace': (c) => [
    el('path', { d: 'M86 142 Q100 164 114 142', fill: 'none', stroke: c.main, 'stroke-width': 3, 'stroke-dasharray': '3 1.6' }),
    el('rect', { x: 96, y: 152, width: 8, height: 10, rx: 2, fill: c.main }),
  ],
  choker: (c) => [
    el('path', { d: 'M88 134 Q100 140 112 134 L112 139 Q100 145 88 139 Z', fill: c.main }),
    el('circle', { cx: 100, cy: 143, r: 2.6, fill: c.light, stroke: GOLD, 'stroke-width': 0.8 }),
  ],
  'opal-pendant': (c) => [
    el('path', { d: 'M86 142 Q100 162 114 142', fill: 'none', stroke: GOLD, 'stroke-width': 1.5 }),
    el('ellipse', { cx: 100, cy: 166, rx: 5, ry: 7, fill: c.main, stroke: GOLD, 'stroke-width': 1.2 }),
    el('ellipse', { cx: 98.5, cy: 163.5, rx: 1.8, ry: 2.6, fill: c.light }),
  ],

  // scarves and stoles
  'silk-neckerchief': (c) => [
    el('path', { d: 'M84 140 Q100 152 116 140 L118 148 Q100 160 82 148 Z', fill: c.main }),
    el('path', { d: 'M93 152 L107 152 L100 174 Z', fill: c.main }),
    el('circle', { cx: 100, cy: 152, r: 4, fill: c.dark }),
  ],
  'knit-scarf': (c) => [
    el('path', { d: 'M82 136 Q100 150 118 136 L122 150 Q100 166 78 150 Z', fill: c.main }),
    el('rect', { x: 104, y: 150, width: 14, height: 52, rx: 3, fill: c.main }),
    el('rect', { x: 104, y: 166, width: 14, height: 5, fill: c.light }),
    el('rect', { x: 104, y: 182, width: 14, height: 5, fill: c.light }),
    el('path', { d: 'M106 202 L106 208 M110 202 L110 208 M114 202 L114 208', stroke: c.main, 'stroke-width': 2, 'stroke-linecap': 'round' }),
  ],
  'moonsilk-stole': (c) => [
    el('path', { d: 'M70 148 Q100 136 130 148 L136 228 L124 228 L120 164 Q100 152 80 164 L76 228 L64 228 Z', fill: c.main, opacity: 0.92 }),
    el('path', { d: 'M72 158 Q70 190 70 222 M128 158 Q130 190 130 222', fill: 'none', stroke: c.light, 'stroke-width': 2, opacity: 0.8 }),
  ],

  // jackets
  'denim-jacket': (c) => [
    ...jacket(c, { hem: 206, cuff: c.dark }),
    el('path', { d: 'M88 146 L80 162 L91 156 Z M112 146 L120 162 L109 156 Z', fill: c.dark }),
    el('rect', { x: 74, y: 168, width: 12, height: 10, rx: 2, fill: 'none', stroke: c.light, 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }),
    el('rect', { x: 114, y: 168, width: 12, height: 10, rx: 2, fill: 'none', stroke: c.light, 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }),
    el('path', { d: 'M70 198 L91 198 M109 198 L130 198', stroke: c.light, 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }),
  ],
  cardigan: (c) => [
    ...jacket(c, { hem: 236 }),
    ...[162, 180, 198, 216].map((y) => el('circle', { cx: 88, cy: y, r: 2, fill: c.light })),
    el('path', { d: 'M70 232 L91 232 M109 232 L130 232', stroke: c.dark, 'stroke-width': 3 }),
  ],
  'varsity-jacket': (c) => [
    ...jacket(c, { hem: 210, sleeve: IVORY, cuff: c.dark }),
    el('path', { d: 'M70 202 L91 202 L91 210 L70 210 Z M109 202 L130 202 L130 210 L109 210 Z', fill: c.dark }),
    el('path', { d: 'M70 205 L91 205 M109 205 L130 205', stroke: IVORY, 'stroke-width': 1.5 }),
    el('path', { d: 'M86 146 Q100 154 114 146', fill: 'none', stroke: c.dark, 'stroke-width': 4 }),
  ],
  blazer: (c) => [
    ...jacket(c, { hem: 224 }),
    el('path', { d: 'M91 146 L84 180 L91 172 Z M109 146 L116 180 L109 172 Z', fill: c.dark }),
    el('path', { d: 'M114 196 L126 196', stroke: c.light, 'stroke-width': 1.5 }),
    el('circle', { cx: 88, cy: 196, r: 2, fill: GOLD }),
  ],
  'puffer-vest': (c) => [
    ...jacket(c, { hem: 208, sleeves: false }),
    ...[162, 178, 194].map((y) => el('path', { d: `M68 ${y} L91 ${y} M109 ${y} L132 ${y}`, stroke: c.dark, 'stroke-width': 1.5 })),
    el('path', { d: 'M86 144 L92 146 L92 152 L86 150 Z M114 144 L108 146 L108 152 L114 150 Z', fill: c.dark }),
  ],
  'neon-jacket': (c) => [
    ...jacket(c, { hem: 194 }),
    ...['L', 'R'].map((side) => line(along(ARM[side], 0.05), along(ARM[side], 0.9), c.light, 3)),
    el('path', { d: 'M91 150 L91 194 M109 150 L109 194', stroke: c.light, 'stroke-width': 2 }),
  ],

  // bracelets and watches (left wrist)
  'friendship-bracelets': (c) => [atWrist(0.86, [ring(c.main, 2.4)]), atWrist(0.91, [ring(c.light, 2.4, { 'stroke-dasharray': '2 1.5' })])],
  'smart-watch': (c) => [
    atWrist(0.88, [
      el('rect', { x: -8, y: -2.5, width: 16, height: 5, rx: 2, fill: c.dark }),
      el('rect', { x: -5, y: -5, width: 10, height: 10, rx: 2.5, fill: c.main, stroke: INK, 'stroke-width': 1 }),
      el('rect', { x: -3, y: -3, width: 6, height: 6, rx: 1.5, fill: c.light }),
    ]),
  ],
  bangles: (c) => [atWrist(0.83, [ring(c.main)]), atWrist(0.88, [ring(GOLD)]), atWrist(0.93, [ring(c.light)])],
  'charm-bracelet': (c) => [
    atWrist(0.88, [
      ring(GOLD, 1.5),
      el('circle', { cx: -4, cy: 5, r: 2, fill: c.main }),
      el('circle', { cx: 1, cy: 5.5, r: 2, fill: c.light }),
      el('path', { d: 'M6 3.5 L7.5 6.5 L4.5 6.5 Z', fill: c.main }),
    ]),
  ],

  // bags
  'crossbody-bag': (c) => [
    el('path', { d: 'M84 148 L132 206', stroke: c.dark, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    el('rect', { x: 122, y: 204, width: 26, height: 20, rx: 5, fill: c.main }),
    el('path', { d: 'M122 209 Q122 204 127 204 L143 204 Q148 204 148 209 Q135 218 122 209 Z', fill: c.dark }),
    el('circle', { cx: 135, cy: 212, r: 2, fill: GOLD }),
  ],
  'tote-bag': (c) => [
    el('path', { d: 'M131 214 Q140 194 149 214', fill: 'none', stroke: c.dark, 'stroke-width': 2.5 }),
    el('path', { d: 'M125 212 L155 212 L159 248 L121 248 Z', fill: c.main, stroke: c.dark, 'stroke-width': 1 }),
    el('rect', { x: 124, y: 226, width: 32, height: 6, fill: c.dark, opacity: 0.6 }),
  ],
  backpack: (c) => [
    el('path', { d: 'M82 148 L80 206 M118 148 L120 206', stroke: c.main, 'stroke-width': 6, 'stroke-linecap': 'round' }),
    el('rect', { x: 77, y: 180, width: 7, height: 5, rx: 1, fill: c.light }),
    el('rect', { x: 116, y: 180, width: 7, height: 5, rx: 1, fill: c.light }),
  ],
  'mini-purse': (c) => [
    el('path', { d: 'M120 148 L136 206', stroke: GOLD, 'stroke-width': 1.5, 'stroke-dasharray': '2 1.5' }),
    el('rect', { x: 128, y: 204, width: 20, height: 15, rx: 6, fill: c.main }),
    el('path', { d: 'M128 210 Q138 214 148 210', fill: 'none', stroke: c.dark, 'stroke-width': 1.2 }),
    el('circle', { cx: 138, cy: 212, r: 1.6, fill: GOLD }),
  ],
  'gala-clutch': (c) => [
    el('rect', { x: 127, y: 203, width: 30, height: 15, rx: 4, fill: c.main, stroke: GOLD, 'stroke-width': 1.5 }),
    el('path', { d: 'M127 209 L157 209', stroke: GOLD, 'stroke-width': 1.2 }),
    el('circle', { cx: 142, cy: 209, r: 2.2, fill: c.light, stroke: GOLD }),
  ],
  'reading-satchel': (c) => [
    el('path', { d: 'M118 148 L66 206', stroke: c.dark, 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
    el('rect', { x: 40, y: 202, width: 32, height: 26, rx: 4, fill: c.main }),
    el('path', { d: 'M40 206 Q40 202 44 202 L68 202 Q72 202 72 206 L72 214 Q56 220 40 214 Z', fill: c.dark }),
    el('rect', { x: 53, y: 213, width: 6, height: 6, rx: 1, fill: GOLD }),
  ],

  // shoes (drawn in place of the plain ones)
  'high-tops': (c) => feet((cx) => [
    el('rect', { x: cx - 9, y: 250, width: 18, height: 18, rx: 4, fill: c.main }),
    el('ellipse', { cx, cy: 268, rx: 13, ry: 7, fill: c.main }),
    sole(cx),
    el('path', { d: `M${cx - 4} 255 L${cx + 4} 255 M${cx - 4} 260 L${cx + 4} 260`, stroke: '#ffffff', 'stroke-width': 1.4 }),
  ]),
  'ankle-boots': (c) => feet((cx) => [
    el('rect', { x: cx - 8.5, y: 244, width: 17, height: 24, rx: 3, fill: c.main }),
    el('ellipse', { cx, cy: 268, rx: 12, ry: 6.5, fill: c.main }),
    el('path', { d: `M${cx - 8.5} 249 L${cx + 8.5} 249`, stroke: c.dark, 'stroke-width': 2 }),
    el('rect', { x: cx - 12, y: 271, width: 24, height: 3, rx: 1.5, fill: c.dark }),
  ]),
  'ballet-flats': (c, x) => feet((cx) => [
    el('ellipse', { cx, cy: 268, rx: 12, ry: 6, fill: c.main }),
    el('ellipse', { cx, cy: 265.5, rx: 7, ry: 2.6, fill: x.sk.base }),
    el('path', { d: `M${cx - 3} 263 L${cx + 3} 266 M${cx + 3} 263 L${cx - 3} 266`, stroke: c.light, 'stroke-width': 1.6 }),
  ]),
  'platform-sandals': (c, x) => feet((cx) => [
    el('ellipse', { cx, cy: 266, rx: 10, ry: 5, fill: x.sk.base }),
    el('rect', { x: cx - 13, y: 268, width: 26, height: 7, rx: 3, fill: c.dark }),
    el('rect', { x: cx - 11, y: 261, width: 22, height: 3, rx: 1.5, fill: c.main }),
    el('rect', { x: cx - 11, y: 265, width: 22, height: 3, rx: 1.5, fill: c.main }),
  ]),
  'rain-boots': (c) => feet((cx) => [
    el('rect', { x: cx - 9, y: 232, width: 18, height: 36, rx: 4, fill: c.main }),
    el('ellipse', { cx, cy: 268, rx: 13, ry: 7, fill: c.main }),
    el('rect', { x: cx - 9, y: 232, width: 18, height: 4, rx: 2, fill: c.dark }),
    el('path', { d: `M${cx - 5} 240 L${cx - 5} 262`, stroke: c.light, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 }),
  ]),
  'street-sneakers': (c) => feet((cx) => [
    el('ellipse', { cx, cy: 268, rx: 13, ry: 7, fill: c.main }),
    sole(cx),
    el('path', { d: `M${cx - 8} 267 Q${cx} 261 ${cx + 8} 267`, fill: 'none', stroke: c.light, 'stroke-width': 2 }),
  ]),
};

// The pack part of a backpack sits behind the body.
const BACK_ART = {
  backpack: (c) => [el('rect', { x: 63, y: 140, width: 74, height: 76, rx: 16, fill: c.dark })],
};

// Crops for small previews in the look picker.
const VIEWS = { full: '0 0 200 280', head: '14 -4 172 176', face: '40 58 120 88', eyes: '58 78 84 40', nose: '74 96 52 38', mouth: '80 112 40 28', body: '14 120 172 156', feet: '58 226 84 52' };

// look: a saved look (cleaned here). owned: ids of earned items. Options: view (crop),
// hideHair (face-shape previews), label (accessible name; empty string hides the svg from readers).
export function drawAvatar(rawLook, owned = [], { view = 'full', hideHair = false, label } = {}) {
  const look = cleanLook(rawLook);
  const ctx = { uid: ++uid };
  // One worn piece per spot. A colour version ("sun-hat~teal") is drawn with the base piece's art.
  const on = new Map();
  for (const id of look.wear) {
    const it = itemById(id);
    if (it && owned.includes(id)) on.set(it.slot, it);
  }
  const art = (slot, table = ITEM_ART) => {
    const it = on.get(slot);
    const fn = it && table[it.base];
    return fn ? [fn(tone(colorHex(it.color) || '#888888'), { top, sk })].flat() : [];
  };
  ctx.teeColor = on.get('top') ? '#ffffff' : pick('styleColor', look.styleColor).hex;
  const sk = pick('skin', look.skin);
  const hairHex = pick('hairColor', look.hairColor).hex;
  const hc = { main: hairHex, shade: mix(hairHex, '#120a20', 0.28), shine: mix(hairHex, '#ffffff', 0.45) };
  const hair = HAIR[look.hair] || HAIR['long-straight'];
  const head = pick('headwear', look.headwear);
  const hwColor = pick('headColor', look.headColor).hex;
  const showBack = !hideHair && head.covers !== 'all';
  const showFront = !hideHair && head.covers === 'none';
  const cheek = cheekOf(look.face);
  const top = head.covers === 'all' ? ({ gele: 6, 'head-wrap': 8, turban: 16, hijab: 28 }[head.id] ?? 28) : hair.top;
  const defs = el('defs');
  const L = [defs];

  L.push(...art('cape'), ...art('bag', BACK_ART));
  headwearBack(head.id, hwColor, L);
  if (showBack) L.push(...hair.back(hc));
  // legs, shoes, arms, neck
  L.push(el('rect', { x: 82, y: 214, width: 14, height: 50, rx: 6, fill: sk.base }));
  L.push(el('rect', { x: 104, y: 214, width: 14, height: 50, rx: 6, fill: sk.base }));
  if (on.get('shoes')) L.push(...art('shoes'));
  else for (const cx of [89, 111]) L.push(el('ellipse', { cx, cy: 268, rx: 13, ry: 7, fill: '#ff7ac6' }));
  for (const side of ['L', 'R']) {
    L.push(line(...ARM[side], sk.base, 12));
    const [hx, hy] = along(ARM[side], 1.08);
    L.push(el('circle', { cx: hx, cy: hy, r: 6.5, fill: sk.base }));
  }
  L.push(el('rect', { x: 88, y: 124, width: 24, height: 28, rx: 8, fill: sk.base }));
  L.push(el('path', { d: 'M88 140 Q100 148 112 140 L112 146 Q100 152 88 146 Z', fill: sk.shade, opacity: 0.5 }));
  if (look.details.includes('vitiligo')) {
    L.push(el('path', { d: blob(64, 196, 6, 3), fill: sk.light, opacity: 0.85 }));
    L.push(el('path', { d: blob(96, 134, 6, 4), fill: sk.light, opacity: 0.85 }));
  }
  L.push(...outfit(look, ctx, defs));
  L.push(...art('dress'), ...art('outer'), ...art('wrist'));
  headwearDrape(head.id, hwColor, L);
  if (head.id !== 'hijab') L.push(...art('scarf'), ...art('neck'));
  L.push(...art('bag'));

  // ears, head, face
  if (head.id !== 'hijab') {
    for (const m of [-1, 1]) {
      const x = 100 + m * (cheek - 1);
      L.push(el('ellipse', { cx: x, cy: 104, rx: 7, ry: 10, fill: sk.base }));
      L.push(el('path', { d: `M${x + m * 2} 98 Q${x + m * 4} 104 ${x + m * 1} 110`, fill: 'none', stroke: sk.shade, 'stroke-width': 2 }));
    }
  }
  L.push(el('path', { d: facePath(look.face), fill: sk.base }));
  if (look.details.includes('vitiligo')) {
    L.push(el('path', { d: blob(84, 62, 9, 1), fill: sk.light, opacity: 0.85 }));
    L.push(el('path', { d: blob(130, 120, 7, 2), fill: sk.light, opacity: 0.85 }));
  }
  if (look.details.includes('blush')) for (const x of [70, 130]) L.push(el('ellipse', { cx: x, cy: 118, rx: 8, ry: 5, fill: sk.blush, opacity: 0.55 }));
  if (look.details.includes('freckles')) {
    for (const [x, y] of [[70, 112], [76, 116], [82, 112], [72, 120], [118, 112], [124, 116], [130, 112], [128, 120], [96, 108], [104, 108]]) L.push(el('circle', { cx: x, cy: y, r: 1.2, fill: sk.line, opacity: 0.55 }));
  }
  const eyeHex = pick('eyeColor', look.eyeColor).hex;
  eye(80, 100, -1, look.eyes, eyeHex, sk, ctx, L, defs);
  eye(120, 100, 1, look.eyes, eyeHex, sk, ctx, L, defs);
  const browHex = mix(hairHex, '#2a1a14', 0.45);
  brow(80, -1, look.brows, browHex, L);
  brow(120, 1, look.brows, browHex, L);
  nose(look.nose, sk, L);
  lips(look.lips, look.lipColor, sk, L);
  if (look.details.includes('beauty-mark')) L.push(el('circle', { cx: 117, cy: 126, r: 1.6, fill: '#2a1a14' }));
  if (showFront && hair.front) L.push(...[hair.front(hc)].flat());
  headwearFront(head.id, hwColor, top, L);
  if (head.id !== 'hijab') earrings(look.earrings, cheek, L);
  glasses(look.glasses, L);
  const lift = Math.max(-24, Math.min(8, top - 27)); // hats sit on the hair or head covering
  const hat = art('head');
  if (hat.length) L.push(on.get('head').base === 'crystal-crown' ? hat[0] : el('g', { transform: `translate(0 ${lift})` }, hat));

  const svg = el('svg', { class: 'avatar', viewBox: VIEWS[view] || VIEWS.full }, L);
  if (label === '') svg.setAttribute('aria-hidden', 'true');
  else {
    svg.setAttribute('role', 'img');
    const pieces = [...on.values()].filter((it) => it.id !== 'basic-tee').map((it) => it.name);
    svg.setAttribute('aria-label', label || `${describeLook(look)}${pieces.length ? `, wearing ${pieces.join(', ')}` : ''}`);
  }
  return svg;
}
