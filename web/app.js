// Runway Rally web client. No build step, no framework, and no innerHTML (text is always set safely).
const app = document.getElementById('app');
const SVG_NS = 'http://www.w3.org/2000/svg';

// Inside a Brightspace iframe some browsers block storage, so fall back to memory for that visit.
const mem = {};
const store = {
  get(k) {
    try {
      return localStorage.getItem(k) ?? mem[k] ?? null;
    } catch {
      return mem[k] ?? null;
    }
  },
  set(k, v) {
    mem[k] = v;
    try {
      localStorage.setItem(k, v);
    } catch {
      /* memory only */
    }
  },
  del(k) {
    delete mem[k];
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

// Brightspace launches hand the session over in the URL fragment (never sent to a server or logged).
const launched = /^#lti=([A-Za-z0-9_-]{20,64})$/.exec(location.hash);
if (launched) {
  store.set('rr_token', launched[1]);
  history.replaceState(null, '', location.pathname);
}

const state = {
  token: store.get('rr_token'),
  student: null,
  catalog: null,
  task: null,
  story: '',
  input: '',
  hint: null,
  busy: false,
  keyHandler: null,
};

// ---------- tiny helpers ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function s(tag, props = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}

function show(...nodes) {
  if (state.keyHandler) {
    document.removeEventListener('keydown', state.keyHandler);
    state.keyHandler = null;
  }
  app.replaceChildren(...nodes.flat().filter(Boolean));
  window.scrollTo(0, 0);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (res.status === 401 && state.token) {
    signOut();
    throw new Error('Please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

function signOut() {
  store.del('rr_token');
  const viaLti = state.student?.viaLti;
  Object.assign(state, { token: null, student: null, task: null, hint: null, input: '' });
  if (viaLti) return show(h('div', { class: 'card stack' }, h('h2', { text: 'Session ended' }), h('p', { text: 'Open Runway Rally again from your course in Brightspace.' })));
  loginScreen();
}

const has = (id) => state.student.unlocks.some((i) => i.id === id);

// ---------- avatar (original anime-style art: layered SVG that shows earned items) ----------
const HAIR = [
  { name: 'Violet', main: '#8a4dff', shade: '#5a2ed6', shine: '#c9a8ff' },
  { name: 'Pink', main: '#ff5fb8', shade: '#d6338f', shine: '#ffb3e0' },
  { name: 'Sky', main: '#34b7ff', shade: '#1a85d6', shine: '#a8e2ff' },
  { name: 'Mint', main: '#1fd9a5', shade: '#0fa67b', shine: '#a6f5dc' },
  { name: 'Sunny', main: '#ffc21a', shade: '#e09400', shine: '#fff0a6' },
  { name: 'Coral', main: '#ff7a59', shade: '#d9502d', shine: '#ffc2b0' },
];
const EYES = ['#ff4fb0', '#27b8ff', '#16d9a0', '#7a3cff', '#ff8a3d', '#ffc21a'];
const style = { hair: Number(store.get('rr_hair')) || 0, eyes: Number(store.get('rr_eyes')) || 1, off: new Set(JSON.parse(store.get('rr_off') || '[]')) };
const worn = (id) => has(id) && !style.off.has(id);

function avatar(mood = 'normal') {
  const hr = HAIR[style.hair % HAIR.length];
  const eye = EYES[style.eyes % EYES.length];
  const defs = s(
    'defs',
    {},
    s('linearGradient', { id: 'gGown', x1: 0, y1: 0, x2: 1, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#ff4fb0' }), s('stop', { offset: 0.55, 'stop-color': '#b45cff' }), s('stop', { offset: 1, 'stop-color': '#27b8ff' })),
    s('linearGradient', { id: 'gCape', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#7a3cff' }), s('stop', { offset: 1, 'stop-color': '#ff4fb0' })),
    s('linearGradient', { id: 'gJacket', x1: 0, y1: 0, x2: 1, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#16d9a0' }), s('stop', { offset: 1, 'stop-color': '#27b8ff' })),
    s('radialGradient', { id: 'gEye', cx: 0.5, cy: 0.3, r: 0.8 }, s('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.9 }), s('stop', { offset: 0.35, 'stop-color': eye }), s('stop', { offset: 1, 'stop-color': '#2a1a5e' })),
  );
  const L = [defs];
  const back = [];
  const body = [];
  const face = [];

  // long back hair + twin ribbons
  // twin tails + ahoge (anime hair antenna)
  for (const m of [1, -1]) {
    const X = (x) => (m === 1 ? x : 200 - x);
    back.push(s('path', { d: `M${X(46)} 70 Q${X(8)} 116 ${X(22)} 190 Q${X(34)} 214 ${X(50)} 192 Q${X(42)} 140 ${X(58)} 98 Z`, fill: hr.main }));
    back.push(s('path', { d: `M${X(40)} 100 Q${X(20)} 140 ${X(28)} 184`, fill: 'none', stroke: hr.shine, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.7 }));
  }
  back.push(s('path', { d: 'M100 34 Q94 10 110 8 Q124 8 114 24', fill: 'none', stroke: hr.main, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  back.push(s('path', { d: 'M44 90 Q36 190 60 232 Q76 216 74 150 L126 150 Q124 216 140 232 Q164 190 156 90 Q150 30 100 28 Q50 30 44 90 Z', fill: hr.shade }));
  if (worn('couture-cape')) back.push(s('path', { d: 'M50 132 Q100 118 150 132 L176 262 Q100 280 24 262 Z', fill: 'url(#gCape)' }));

  // legs, socks, shoes
  body.push(s('rect', { x: 82, y: 214, width: 14, height: 46, rx: 6, fill: '#ffe0cc' }));
  body.push(s('rect', { x: 104, y: 214, width: 14, height: 46, rx: 6, fill: '#ffe0cc' }));
  body.push(s('rect', { x: 82, y: 238, width: 14, height: 18, rx: 4, fill: '#fff' }));
  body.push(s('rect', { x: 104, y: 238, width: 14, height: 18, rx: 4, fill: '#fff' }));
  body.push(s('path', { d: 'M74 258 Q89 250 98 258 L98 268 L72 268 Z', fill: '#ff4fb0' }));
  body.push(s('path', { d: 'M126 258 Q111 250 102 258 L102 268 L128 268 Z', fill: '#27b8ff' }));
  body.push(s('rect', { x: 88, y: 128, width: 24, height: 22, rx: 8, fill: '#ffe0cc' }));

  if (worn('gala-gown')) {
    body.push(s('path', { d: 'M72 146 L128 146 L162 250 Q100 272 38 250 Z', fill: 'url(#gGown)' }));
    body.push(s('path', { d: 'M72 146 L128 146 L132 172 L68 172 Z', fill: '#ffb3e0' }));
    for (const [x, y, c] of [[70, 214, '#fff'], [100, 232, '#ffe36e'], [132, 212, '#fff'], [86, 196, '#9ae7ff'], [118, 190, '#fff']]) body.push(s('path', { d: `M${x} ${y - 5} L${x + 2} ${y - 1} L${x + 6} ${y} L${x + 2} ${y + 1} L${x} ${y + 5} L${x - 2} ${y + 1} L${x - 6} ${y} L${x - 2} ${y - 1} Z`, fill: c }));
  } else {
    body.push(s('rect', { x: 72, y: 146, width: 56, height: 70, rx: 16, fill: worn('basic-tee') ? '#fff' : '#ffe0cc' }));
    if (worn('basic-tee')) {
      body.push(s('path', { d: 'M100 164 l5 10 11 1 -8 8 2 11 -10 -6 -10 6 2 -11 -8 -8 11 -1 z', fill: '#ff4fb0' }));
    }
    body.push(s('path', { d: 'M72 206 H128 L134 226 H66 Z', fill: '#3b6bff' }));
    body.push(s('path', { d: 'M72 206 H128 L130 212 H70 Z', fill: '#6f95ff' }));
  }
  if (worn('fraction-jacket')) {
    body.push(s('path', { d: 'M64 146 L90 146 L88 218 L62 218 Q56 180 64 146 Z', fill: 'url(#gJacket)' }));
    body.push(s('path', { d: 'M110 146 L136 146 Q144 180 138 218 L112 218 Z', fill: 'url(#gJacket)' }));
    body.push(s('path', { d: 'M62 162 H90 M110 162 H138', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '2 6' }));
  }
  if (worn('sale-scarf')) {
    body.push(s('path', { d: 'M80 142 Q100 160 120 142 L124 156 Q100 176 76 156 Z', fill: '#ffc21a' }));
    body.push(s('path', { d: 'M116 154 L130 190 L118 186 L112 160 Z', fill: '#ff8a3d' }));
  }
  if (worn('ratio-pearls')) for (let i = 0; i < 7; i++) body.push(s('circle', { cx: 80 + i * 6.7, cy: 154 + Math.sin((i / 6) * Math.PI) * 10, r: 3.6, fill: '#fff', stroke: '#ffb3e0', 'stroke-width': 1.2 }));

  // head
  face.push(s('circle', { cx: 100, cy: 92, r: 52, fill: '#ffe9dc' }));
  // bangs with shine
  face.push(s('path', { d: 'M46 92 Q48 30 100 30 Q152 30 154 92 Q138 58 120 70 Q108 52 94 70 Q76 52 46 92 Z', fill: hr.main }));
  face.push(s('path', { d: 'M62 54 Q80 40 100 40', fill: 'none', stroke: hr.shine, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.8 }));
  // hair ribbons
  for (const x of [44, 156]) {
    face.push(s('path', { d: `M${x} 70 l${x < 100 ? -18 : 18} -10 v22 z`, fill: '#ff4fb0' }));
    face.push(s('path', { d: `M${x} 70 l${x < 100 ? -2 : 2} 18 l${x < 100 ? -16 : 16} 0 z`, fill: '#ff8a3d' }));
    face.push(s('circle', { cx: x, cy: 70, r: 5, fill: '#ffc21a' }));
  }
  // big sparkly anime eyes (blink as a group); mood swaps them for happy arcs
  const eyes = [];
  const sparkle4 = (x, y, r, fill = '#fff') => s('path', { d: `M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r} Z`, fill });
  for (const [x, dir] of [[78, -1], [122, 1]]) {
    if (mood === 'happy') {
      eyes.push(s('path', { d: `M${x - 13} 104 Q${x} 86 ${x + 13} 104`, fill: 'none', stroke: '#2a1a5e', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      continue;
    }
    eyes.push(s('ellipse', { cx: x, cy: 100, rx: 15, ry: 19, fill: '#fff' }));
    eyes.push(s('ellipse', { cx: x, cy: 103, rx: 12, ry: 17, fill: 'url(#gEye)' }));
    eyes.push(s('ellipse', { cx: x, cy: 105, rx: 5.5, ry: 9, fill: '#1a0f45' }));
    eyes.push(s('ellipse', { cx: x + 4, cy: 94, rx: 5, ry: 5.5, fill: '#fff' }));
    eyes.push(sparkle4(x - 5, 111, 4.2));
    eyes.push(s('circle', { cx: x + 6, cy: 112, r: 1.8, fill: '#fff', opacity: 0.9 }));
    eyes.push(s('path', { d: `M${x - 16} 90 Q${x} 78 ${x + 16} 90`, fill: 'none', stroke: '#1a0f45', 'stroke-width': 4.5, 'stroke-linecap': 'round' }));
    eyes.push(s('path', { d: `M${x + dir * 15} 89 l${dir * 7} -5`, stroke: '#1a0f45', 'stroke-width': 3.2, 'stroke-linecap': 'round' }));
  }
  face.push(s('g', { class: 'av-eyes' }, eyes));
  face.push(s('ellipse', { cx: 62, cy: 121, rx: 10, ry: 6, fill: '#ff8fc4', opacity: 0.8 }));
  face.push(s('ellipse', { cx: 138, cy: 121, rx: 10, ry: 6, fill: '#ff8fc4', opacity: 0.8 }));
  for (const bx of [57, 133]) face.push(s('path', { d: `M${bx} 124 l4 -6 M${bx + 5} 125 l4 -6 M${bx + 10} 126 l4 -6`, stroke: '#ff5f9e', 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' }));
  face.push(s('path', { d: 'M99 112 q1 3 2 0', stroke: '#e07a8f', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }));
  if (mood === 'happy') {
    face.push(s('path', { d: 'M88 122 Q100 144 112 122 Z', fill: '#c2204f', stroke: '#c2204f', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    face.push(s('path', { d: 'M94 133 Q100 139 106 133 Q100 129 94 133 Z', fill: '#ff8fa8' }));
    face.push(sparkle4(42, 92, 7, '#ffc21a'), sparkle4(160, 88, 6, '#27b8ff'));
  } else {
    face.push(s('path', { d: 'M92 126 Q96 132 100 127 Q104 132 108 126', fill: 'none', stroke: '#c2204f', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  if (worn('crystal-crown')) {
    face.push(s('path', { d: 'M68 46 L78 20 L91 40 L100 14 L109 40 L122 20 L132 46 Z', fill: '#bdf0ff', stroke: '#27b8ff', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    face.push(s('circle', { cx: 100, cy: 36, r: 4, fill: '#ff4fb0' }));
  }

  L.push(s('g', { class: 'av-hair' }, back), s('g', { class: 'av-body' }, body, s('g', { class: 'av-head' }, face)));
  return s('svg', { class: 'avatar', viewBox: '0 0 200 280', role: 'img', 'aria-label': 'Your designer wearing the items you have earned' }, L);
}

// Tap the designer: she poses, sparkles burst, and she says something cheerful.
const CHEERS = ['Ganbatte!', 'Kawaii!', 'Sugoi!', 'Let us design!', 'Ooh, so sparkly!', 'Yatta! You are on a roll!', 'Fashion + fractions = fabulous'];
const POSES = ['pose-spin', 'pose-jump', 'pose-wave'];
function avatarStage({ interactive = true, mood = 'normal' } = {}) {
  const svg = avatar(mood);
  const bubble = h('div', { class: 'bubble', hidden: true, 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'card avatar-wrap pop' }, h('span', { class: 'sparkle', 'aria-hidden': 'true', text: '✦' }), h('span', { class: 'sparkle', 'aria-hidden': 'true', text: '✧' }), h('span', { class: 'sparkle', 'aria-hidden': 'true', text: '★' }), h('span', { class: 'sparkle', 'aria-hidden': 'true', text: '✦' }), bubble);
  if (!interactive) {
    wrap.append(svg);
    return wrap;
  }
  const btn = h('button', { class: 'avatar-btn', 'aria-label': 'Tap your designer to make her pose' }, svg);
  let t;
  btn.addEventListener('click', () => {
    const live = avatar('happy');
    btn.replaceChildren(live);
    live.classList.add(POSES[Math.floor(Math.random() * POSES.length)]);
    clearTimeout(btn._mood);
    btn._mood = setTimeout(() => btn.replaceChildren(avatar()), 1500);
    burst(wrap, 14);
    bubble.textContent = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    bubble.hidden = false;
    clearTimeout(t);
    t = setTimeout(() => (bubble.hidden = true), 1800);
  });
  const restyle = (key, list, label) =>
    h('button', {
      class: 'chip-btn',
      text: label,
      onclick: () => {
        style[key] = (style[key] + 1) % list.length;
        store.set(`rr_${key}`, String(style[key]));
        const fresh = avatar();
        btn.replaceChildren(fresh);
        burst(wrap, 8);
      },
    });
  wrap.append(btn, h('div', { class: 'row chips' }, restyle('hair', HAIR, '💇 Hair'), restyle('eyes', EYES, '👁️ Eyes')));
  return wrap;
}

function comboToast(n) {
  const t = h('div', { class: 'combo', role: 'status', text: `🔥 ${n} in a row! Style streak!` });
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// Confetti / sparkle burst. Positions use the CSSOM (allowed under the page's strict CSP).
const BURST = ['✦', '✧', '★', '♥', '✿', '◆'];
const COLORS = ['#ff4fb0', '#ff8a3d', '#ffc21a', '#16d9a0', '#27b8ff', '#7a3cff'];
function burst(host, n = 24) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  host.classList.add('burst-host');
  for (let i = 0; i < n; i++) {
    const p = h('span', { class: 'confetti', 'aria-hidden': 'true', text: BURST[i % BURST.length] });
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 110;
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
    p.style.setProperty('--rot', `${Math.floor(Math.random() * 540 - 270)}deg`);
    p.style.color = COLORS[i % COLORS.length];
    host.append(p);
    setTimeout(() => p.remove(), 1200);
  }
}
function rain(n = 40) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = h('div', { class: 'rain', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const p = h('span', { class: 'drop', text: BURST[i % BURST.length] });
    p.style.left = `${Math.random() * 100}%`;
    p.style.color = COLORS[i % COLORS.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3400);
}


// ---------- anime extras (all original art) ----------
const TIPS = ['You can do it!', 'Show the math, then pick!', 'Stuck? Hints are free!', 'Fractions are just slices!', 'Take your time, designer!'];
function mascot() {
  const L = [
    s('ellipse', { cx: 40, cy: 66, rx: 22, ry: 6, fill: '#7a3cff', opacity: 0.15 }),
    s('path', { d: 'M62 50 Q86 46 80 24 Q72 38 60 40', fill: 'none', stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', class: 'mo-tail' }),
    s('ellipse', { cx: 40, cy: 44, rx: 26, ry: 22, fill: '#fff', stroke: '#2a1a5e', 'stroke-width': 3 }),
    s('path', { d: 'M18 30 L16 6 L34 20 Z', fill: '#fff', stroke: '#2a1a5e', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M62 30 L64 6 L46 20 Z', fill: '#fff', stroke: '#2a1a5e', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M20 24 L19 13 L28 20 Z', fill: '#ff8fc4' }),
    s('path', { d: 'M60 24 L61 13 L52 20 Z', fill: '#ff8fc4' }),
    s('g', { class: 'av-eyes' }, s('ellipse', { cx: 29, cy: 42, rx: 6, ry: 8, fill: '#1a0f45' }), s('ellipse', { cx: 51, cy: 42, rx: 6, ry: 8, fill: '#1a0f45' }), s('circle', { cx: 31, cy: 39, r: 2.6, fill: '#fff' }), s('circle', { cx: 53, cy: 39, r: 2.6, fill: '#fff' }), s('circle', { cx: 27.5, cy: 45, r: 1.2, fill: '#fff' }), s('circle', { cx: 49.5, cy: 45, r: 1.2, fill: '#fff' })),
    s('ellipse', { cx: 20, cy: 52, rx: 5, ry: 3, fill: '#ff8fc4', opacity: 0.8 }),
    s('ellipse', { cx: 60, cy: 52, rx: 5, ry: 3, fill: '#ff8fc4', opacity: 0.8 }),
    s('path', { d: 'M36 52 Q40 57 40 52 Q40 57 44 52', fill: 'none', stroke: '#2a1a5e', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    s('path', { d: 'M34 18 l3 -5 l3 5 l3 -5 l3 5', fill: 'none', stroke: '#ffc21a', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ];
  return s('svg', { class: 'mascot', viewBox: '0 0 92 72', role: 'img', 'aria-label': 'Mochi, your cheering cat' }, L);
}

const WIN = [['KIRA☆N!', 'キラッ'], ['SUGOI!', 'すごい!'], ['YATTA!', 'やった!'], ['PERFECT!', 'かんぺき!'], ['SUGOKU!', 'すごく!']];
function impact(correct) {
  const [word, jp] = correct ? WIN[Math.floor(Math.random() * WIN.length)] : ['GANBATTE!', 'がんばって!'];
  return h('div', { class: `impact ${correct ? 'win' : 'try'}`, 'aria-hidden': 'true' }, h('span', { class: 'rays' }), h('span', { class: 'sfx', text: word }), h('span', { class: 'jp', text: jp }));
}

function henshin(names) {
  const o = h('div', { class: 'henshin', role: 'status', 'aria-label': `New style unlocked: ${names.join(', ')}` }, h('div', { class: 'speed' }), h('div', { class: 'ring' }), h('div', { class: 'hen-title', text: 'NEW STYLE!' }), h('div', { class: 'hen-sub', text: names.join(' + ') }), h('div', { class: 'hen-jp', 'aria-hidden': 'true', text: 'へんしん☆ スタイルゲット!' }));
  o.addEventListener('click', () => o.remove());
  document.body.append(o);
  setTimeout(() => o.remove(), 2600);
}

const THEME_NAME = { jewelry: ['Jewelry Bench', 'ジュエリー'], fabric: ['Pattern Table', 'パターン'], runway: ['Runway', 'ランウェイ'] };

// ---------- screens ----------
function loginScreen(msg = '') {
  const code = h('input', { type: 'text', id: 'code', autocomplete: 'off', autocapitalize: 'characters', maxlength: 20, placeholder: 'Example: MATH-7A' });
  const nick = h('input', { type: 'text', id: 'nick', autocomplete: 'off', maxlength: 20, placeholder: 'Pick a fun nickname' });
  const err = h('p', { class: 'error', role: 'alert', text: msg });
  const go = h('button', { class: 'primary', type: 'submit', text: 'Start designing' });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        go.disabled = true;
        try {
          const r = await api('/api/session', { method: 'POST', body: { classCode: code.value, nickname: nick.value } });
          state.token = r.token;
          store.set('rr_token', r.token);
          await homeScreen();
        } catch (ex) {
          err.textContent = ex.message;
          go.disabled = false;
        }
      },
    },
    h('label', {}, 'Class code', code),
    h('label', {}, 'Nickname (no real names, please)', nick),
    err,
    go,
  );
  show(
    h('div', { class: 'center stack' }, h('h1', { text: 'Runway Rally' }), h('p', { class: 'jp-sub', 'aria-hidden': 'true', text: 'ランウェイ・ラリー ☆ ファッション × さんすう' }), h('p', { class: 'muted', text: 'Design fashion. Earn it with math.' }), h('div', { class: 'login-mascot' }, mascot())),
    h('div', { class: 'card' }, form),
  );
}

async function loadState() {
  const r = await api('/api/state');
  state.student = r.student;
  state.catalog = r.catalog;
}

async function homeScreen() {
  try {
    await loadState();
  } catch (e) {
    return loginScreen(e.message);
  }
  const st = state.student;
  const start = async (theme) => {
    try {
      const r = await api('/api/commission/start', { method: 'POST', body: theme ? { theme } : {} });
      state.student = r.student;
      state.task = r.task;
      state.story = r.resumed ? '' : r.repair ? 'Let us warm up with a building-block skill first. It will make the next one easier.' : r.story;
      state.hint = null;
      state.input = '';
      taskScreen();
    } catch (e) {
      alert(e.message);
    }
  };
  const open = async (area, fn) => {
    api('/api/event', { method: 'POST', body: { area } }).catch(() => {});
    fn();
  };
  const JP = { 'Jewelry Bench': 'ジュエリー', 'Pattern Table': 'パターン', Runway: 'ランウェイ', 'Surprise me': 'サプライズ', Wardrobe: 'ワードローブ', Cards: 'カード' };
  const tile = (emoji, label, onclick, extra = '') => h('button', { class: `tile ${extra}`, onclick }, h('span', { class: 'emoji', 'aria-hidden': 'true', text: emoji }), h('span', { text: label }), h('span', { class: 'jp', 'aria-hidden': 'true', text: JP[label] || '' }));

  show(
    h('div', { class: 'topbar' }, h('div', { class: 'pill', text: st.nickname }), h('div', { class: 'pill thread', text: `🧵 ${st.thread} Thread` })),
    avatarStage(),
    st.commission ? h('button', { class: 'primary', onclick: () => start(null), text: `Continue commission (${st.commission.done}/${st.commission.total})` }) : null,
    h('h2', { text: 'Start a commission' }),
    h(
      'div',
      { class: 'hub' },
      tile('💎', 'Jewelry Bench', () => start('jewelry')),
      tile('✂️', 'Pattern Table', () => start('fabric')),
      tile('✨', 'Runway', () => start('runway')),
      tile('🎀', 'Surprise me', () => start(null)),
      tile('👗', 'Wardrobe', () => open('wardrobe', wardrobeScreen)),
      tile('🃏', 'Cards', () => open('cards', cardsScreen)),
    ),
    h('div', { class: 'card stack' }, h('h3', { text: 'Your skills' }), skillBars(st)),
    st.viaLti ? null : h('button', { class: 'ghost', onclick: signOut, text: 'Switch student' }),
  );
}

function skillBars(st) {
  const names = state.catalog.skills;
  return h(
    'div',
    { class: 'bars' },
    Object.keys(names).map((id) => {
      const pct = Math.round(st.mastery[id] * 100);
      const fill = h('div', { class: 'fill' });
      fill.style.width = `${pct}%`;
      return h('div', { class: 'bar' }, h('div', { class: 'row between' }, h('span', { text: names[id] }), h('span', { class: 'muted', text: `${pct}%` })), h('div', { class: 'track', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': names[id] }, fill));
    }),
  );
}


// Scratch calculator (no eval: a tiny four-function state machine). It never touches the answer unless "Use answer" is tapped.
function calculator(onUse) {
  const c = { acc: null, op: null, cur: '', shown: '0', fresh: false };
  const out = h('div', { class: 'calc-out', role: 'status', 'aria-label': 'Calculator display', text: '0' });
  const fmt = (n) => String(Math.round(n * 1e9) / 1e9).slice(0, 12);
  const apply = (a, op, b) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b);
  const paint = () => (out.textContent = c.shown);
  const press = (k) => {
    if (/^[0-9.]$/.test(k)) {
      if (c.fresh) Object.assign(c, { cur: '', fresh: false });
      if (k === '.' && c.cur.includes('.')) return;
      c.cur = (c.cur + k).slice(0, 10);
      c.shown = c.cur === '.' ? '0.' : c.cur;
    } else if (k === 'C') Object.assign(c, { acc: null, op: null, cur: '', shown: '0', fresh: false });
    else if (k === '⌫') {
      if (c.fresh) return;
      c.cur = c.cur.slice(0, -1);
      c.shown = c.cur || '0';
    } else if (['+', '−', '×', '÷'].includes(k)) {
      if (c.cur !== '' || c.acc === null) {
        const v = c.cur === '' ? 0 : Number(c.cur);
        c.acc = c.op && c.cur !== '' ? apply(c.acc, c.op, v) : v;
      }
      c.op = k;
      c.cur = '';
      c.fresh = false;
      c.shown = Number.isNaN(c.acc) ? 'Error' : fmt(c.acc);
    } else if (k === '=') {
      if (c.op && c.cur !== '') {
        c.acc = apply(c.acc, c.op, Number(c.cur));
        c.op = null;
        c.cur = '';
        c.fresh = true;
        c.shown = Number.isNaN(c.acc) ? 'Error' : fmt(c.acc);
      }
    }
    paint();
  };
  const keys = ['C', '⌫', '÷', '×', '7', '8', '9', '−', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
  const grid = h(
    'div',
    { class: 'calc-grid' },
    keys.map((k) =>
      h('button', { class: `calc-key ${/^[0-9.]$/.test(k) ? '' : k === '=' ? 'eq' : 'op'}`, 'aria-label': { '÷': 'divide', '×': 'times', '−': 'minus', '+': 'plus', '=': 'equals', '⌫': 'delete', C: 'clear' }[k] || k, text: k, onclick: (e) => { press(k); if (e.detail) e.currentTarget.blur(); } }),
    ),
    h('button', {
      class: 'calc-key use',
      text: 'Use',
      'aria-label': 'Use this number as my answer',
      onclick: (e) => {
        const n = Number(c.fresh || c.op === null ? (c.cur || c.shown) : c.shown);
        if (Number.isFinite(n)) onUse(fmt(n));
        if (e.detail) e.currentTarget.blur();
      },
    }),
  );
  return h('div', { class: 'calc card pop', role: 'group', 'aria-label': 'Calculator' }, h('div', { class: 'calc-title', text: '🧮 Scratch calculator' }), out, grid);
}


// ---------- friendlier math: stacked fractions + a "Show me how" panel (picture and steps) ----------
function mathNodes(str) {
  const out = [];
  let last = 0;
  for (const m of str.matchAll(/(\d+)\/(\d+)/g)) {
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push(h('span', { class: 'frac', 'aria-hidden': 'true' }, h('span', { class: 'num', text: m[1] }), h('span', { class: 'den', text: m[2] })));
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}

const blank = (txt = '?') => h('span', { class: 'blank', text: txt });

function pictureBar(m) {
  const W = 300, X = 10, cell = W / m.parts;
  const kids = [];
  const shades = m.kind === 'add' ? [...Array(m.take[0]).fill('#ff8fc4'), ...Array(m.take[1]).fill('#7fd0ff')] : Array(m.take).fill('#ff8fc4');
  for (let i = 0; i < m.parts; i++) {
    kids.push(s('rect', { x: X + i * cell, y: 26, width: cell, height: 38, fill: shades[i] || '#fff', stroke: '#1a0f45', 'stroke-width': 2.5 }));
    if (m.parts <= 12) kids.push(s('text', { x: X + i * cell + cell / 2, y: 50, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#1a0f45' }, document.createTextNode('?')));
  }
  kids.push(s('path', { d: `M${X} 76 v6 h${W} v-6`, fill: 'none', stroke: '#1a0f45', 'stroke-width': 2.5 }));
  kids.push(s('text', { x: X + W / 2, y: 98, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#1a0f45' }, document.createTextNode(`whole = ${m.total} ${m.unit}`)));
  kids.push(s('text', { x: X, y: 16, 'font-size': 12, 'font-weight': 700, fill: '#6a5aa8' }, document.createTextNode(`${m.parts} equal parts · each part = ? ${m.unit}`)));
  return s('svg', { viewBox: '0 0 320 106', class: 'pic', role: 'img', 'aria-label': `A bar for ${m.total} ${m.unit} cut into ${m.parts} equal parts with the pieces you take shaded` }, kids);
}

function picturePercent(m) {
  const W = 300, X = 10, dw = (W * m.pct) / 100;
  const t = (x, y, txt, anchor = 'middle', fill = '#1a0f45') => s('text', { x, y, 'text-anchor': anchor, 'font-size': 13, 'font-weight': 800, fill }, document.createTextNode(txt));
  return s('svg', { viewBox: '0 0 320 104', class: 'pic', role: 'img', 'aria-label': `A bar for the $${m.price} price. ${m.pct} percent of it is the discount.` },
    s('rect', { x: X, y: 28, width: dw, height: 38, fill: '#ff8fc4', stroke: '#1a0f45', 'stroke-width': 2.5 }),
    s('rect', { x: X + dw, y: 28, width: W - dw, height: 38, fill: '#9af0cd', stroke: '#1a0f45', 'stroke-width': 2.5 }),
    t(X + dw / 2, 52, `${m.pct}%`), t(X + dw + (W - dw) / 2, 52, `${100 - m.pct}%`),
    t(X + dw / 2, 20, 'discount', 'middle', '#b0125f'), t(X + dw + (W - dw) / 2, 20, 'you pay', 'middle', '#07503a'),
    s('path', { d: `M${X} 76 v6 h${W} v-6`, fill: 'none', stroke: '#1a0f45', 'stroke-width': 2.5 }), t(X + W / 2, 98, `price = $${m.price} (100%)`));
}

function ratioTable(m) {
  const cell = (c, cls = '') => h('div', { class: `rt-cell ${cls}` }, c);
  return h('div', { class: 'ratio-table pic', role: 'table', 'aria-label': 'Ratio table' },
    cell(m.left, 'rt-head a'), cell(m.right, 'rt-head b'), cell('', 'rt-gap'),
    cell(String(m.a), 'a'), cell(String(m.b), 'b'), cell('1 pattern', 'rt-note'),
    cell(String(m.given), 'a'), cell(blank(), 'b'), cell(h('span', {}, '× ', blank(), ' patterns'), 'rt-note'));
}

function stepsFor(m) {
  const li = (...kids) => h('li', {}, ...kids);
  if (m.kind === 'part') return [li(`Split ${m.total} ${m.unit} into ${m.parts} equal parts: ${m.total} ÷ ${m.parts} = `, blank(), ` ${m.unit} for each part.`), li(`You take ${m.take} parts: ${m.take} × `, blank(), ' = ', blank(), ` ${m.unit}.`)];
  if (m.kind === 'add') return [li(`Add the slices: ${m.take[0]} + ${m.take[1]} = ${m.take[0] + m.take[1]} parts out of ${m.parts}.`), li(`One part is ${m.total} ÷ ${m.parts} = `, blank(), ` ${m.unit}.`), li(`${m.take[0] + m.take[1]} × `, blank(), ' = ', blank(), ` ${m.unit}.`)];
  if (m.kind === 'ratio') return [li(`How many patterns fit? ${m.given} ÷ ${m.a} = `, blank(), ' patterns.'), li(`Each pattern needs ${m.b} ${m.right}: `, blank(), ` × ${m.b} = `, blank(), '.')];
  return [li(`Discount: ${m.price} ÷ 100 × ${m.pct} = $`, blank(), '.'), li(`Sale price: $${m.price} − $`, blank(), ' = $', blank(), '.')];
}

function explainPanel(t) {
  const m = t.model;
  const body = h('div', { class: 'ex-body' });
  const modes = { Picture: () => body.replaceChildren(m.kind === 'ratio' ? ratioTable(m) : m.kind === 'percent' ? picturePercent(m) : pictureBar(m)), Steps: () => body.replaceChildren(h('ol', { class: 'ex-steps' }, stepsFor(m))) };
  const tabs = Object.keys(modes).map((name, i) => h('button', { class: `chip-btn ex-tab ${i === 0 ? 'on' : ''}`, type: 'button', 'aria-pressed': String(i === 0), text: name === 'Picture' ? '🖼️ Picture' : '🪜 Steps', onclick: (e) => {
    modes[name]();
    for (const b of tabs) { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    if (e.detail) e.currentTarget.blur();
  } }));
  modes.Picture();
  return h('div', { class: 'card explain pop' }, h('div', { class: 'row between' }, h('strong', { text: 'Show me how' }), h('div', { class: 'row' }, tabs)), h('p', { class: 'plain', text: t.plain }), body, h('p', { class: 'muted', text: 'The ? boxes are for you to work out.' }));
}

function taskScreen() {
  const t = state.task;
  const display = h('div', { class: 'display', role: 'status', 'aria-label': 'Your answer', text: state.input || '0' });
  const hintBox = h('div', { class: 'hint-box', hidden: !state.hint }, state.hint ? `Hint: ${state.hint}` : '');
  const msg = h('div');
  const money = t.skill === 'percent' ? '$' : '';
  const choiceBtns = (t.choices || []).map((v, i) =>
    h(
      'button',
      {
        class: `choice c${i + 1}`,
        type: 'button',
        'aria-pressed': 'false',
        'aria-label': `Choice ${'ABC'[i]}: ${money}${v}`,
        'data-v': String(v),
        onclick: (e) => {
          if (state.busy) return;
          setInput(String(v));
          if (e.detail) e.currentTarget.blur();
        },
      },
      h('span', { class: 'letter', 'aria-hidden': 'true', text: 'ABC'[i] }),
      h('span', { class: 'val', text: `${money}${v}` }),
    ),
  );
  const syncChoices = () => {
    for (const b of choiceBtns) {
      const on = b.dataset.v === state.input;
      b.classList.toggle('picked', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  const setInput = (v) => {
    state.input = v.slice(0, 7);
    display.textContent = state.input || '0';
    syncChoices();
  };
  const press = (k) => {
    if (state.busy) return;
    if (k === 'back') return setInput(state.input.slice(0, -1));
    if (k === '.' && state.input.includes('.')) return;
    setInput(state.input + k);
  };
  const hintBtn = h('button', {
    text: '💡 Hint',
    onclick: async (e) => {
      if (e.detail) e.currentTarget.blur();
      try {
        const r = await api('/api/hint', { method: 'POST', body: { taskId: t.id } });
        state.hint = r.text;
        hintBox.hidden = false;
        hintBox.textContent = `Hint ${r.level}: ${r.text}`;
        if (r.level >= 3) hintBtn.disabled = true;
      } catch (e) {
        msg.replaceChildren(h('div', { class: 'feedback try', text: e.message }));
      }
    },
  });
  if (state.hint) hintBtn.textContent = '💡 More help';
  const check = h('button', {
    class: 'primary',
    text: 'Check',
    onclick: async () => {
      if (!state.input || state.busy) return;
      state.busy = true;
      check.disabled = true;
      try {
        const r = await api('/api/answer', { method: 'POST', body: { taskId: t.id, answer: state.input } });
        state.student = r.student;
        if (r.retry) {
          display.classList.add('shake');
          setTimeout(() => display.classList.remove('shake'), 400);
          msg.replaceChildren(h('div', { class: 'feedback try', text: r.feedback }));
          for (const b of choiceBtns) if (b.dataset.v === state.input) { b.disabled = true; b.classList.add('out'); }
          setInput('');
        } else {
          resultScreen(r);
          return;
        }
      } catch (e) {
        msg.replaceChildren(h('div', { class: 'feedback try', text: e.message }));
      }
      state.busy = false;
      check.disabled = false;
    },
  });
  // pointer clicks release focus so Enter submits the answer; keyboard activation (detail 0) keeps focus
  const key = (label, k, extra = '') => h('button', { class: extra, 'aria-label': k === 'back' ? 'Delete' : label, onclick: (e) => { press(k); if (e.detail) e.currentTarget.blur(); }, text: label });
  const pad = h('div', { class: 'pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => key(n, n)), key('.', '.'), key('0', '0'), key('⌫', 'back'));

  const speak = 'speechSynthesis' in window ? h('button', { class: 'ghost', 'aria-label': 'Read the question aloud', text: '🔊 Read aloud', onclick: () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t.prompt)); } }) : null;

  const dots = h('div', { class: 'progress', role: 'img', 'aria-label': `Task ${t.number} of ${t.of}` }, Array.from({ length: t.of }, (_, i) => h('span', { class: `dot ${i < t.number - 1 ? 'done' : i === t.number - 1 ? 'now' : ''}` })));

  pad.hidden = true;
  const typeBtn = h('button', {
    class: 'ghost',
    'aria-expanded': 'false',
    text: '⌨️ Type it instead',
    onclick: (e) => {
      pad.hidden = !pad.hidden;
      typeBtn.setAttribute('aria-expanded', String(!pad.hidden));
      typeBtn.textContent = pad.hidden ? '⌨️ Type it instead' : '⌨️ Hide keypad';
      if (e.detail) e.currentTarget.blur();
    },
  });
  const exBox = h('div');
  const exBtn = t.model
    ? h('button', {
        class: 'ghost',
        'aria-expanded': 'false',
        text: '🔍 Show me how',
        onclick: (e) => {
          const open = exBox.childNodes.length === 0;
          exBox.replaceChildren(...(open ? [explainPanel(t)] : []));
          exBtn.setAttribute('aria-expanded', String(open));
          exBtn.textContent = open ? '🔍 Hide the explanation' : '🔍 Show me how';
          if (e.detail) e.currentTarget.blur();
        },
      })
    : null;
  const calcBox = h('div');
  const calcBtn = h('button', {
    'aria-expanded': 'false',
    text: '🧮',
    'aria-label': 'Open calculator',
    onclick: (e) => {
      const open = calcBox.childNodes.length === 0;
      calcBox.replaceChildren(...(open ? [calculator((v) => setInput(v))] : []));
      calcBtn.setAttribute('aria-expanded', String(open));
      calcBtn.classList.toggle('on', open);
      if (e.detail) e.currentTarget.blur();
    },
  });

  const nodes = [
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Pause', onclick: () => homeScreen() }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })),
    h('div', { class: 'chapter' }, h('span', { class: 'ch-num', text: `CHAPTER ${t.number}` }), h('span', { class: 'ch-name', text: (THEME_NAME[t.theme] || THEME_NAME.jewelry)[0] }), h('span', { class: 'ch-jp', 'aria-hidden': 'true', text: (THEME_NAME[t.theme] || THEME_NAME.jewelry)[1] })),
    dots,
    h('div', { class: 'mascot-row' }, mascot(), h('div', { class: 'mascot-bubble', text: state.story || TIPS[(t.number - 1) % TIPS.length] })),
    h('div', { class: 'card stack pop' }, h('p', { class: 'prompt', text: t.prompt }), t.math ? h('div', { class: 'mathline', role: 'img', 'aria-label': `The math: ${t.math}` }, mathNodes(t.math)) : null, t.plain ? h('p', { class: 'plain-line', text: `In words: ${t.plain}` }) : null, speak),
    choiceBtns.length ? h('div', { class: 'choices', role: 'group', 'aria-label': 'Pick an answer' }, choiceBtns) : null,
    display,
    hintBox,
    msg,
    exBtn,
    exBox,
    calcBox,
    choiceBtns.length ? typeBtn : null,
    pad,
    h('div', { class: 'row' }, hintBtn, calcBtn, check),
  ];
  show(...nodes);
  check.style.flex = '1';
  hintBtn.style.flex = '1';
  // attach after show(), which clears the previous screen's handler
  state.keyHandler = (e) => {
    if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return; // let a focused button handle its own Enter
    if (/^[0-9.]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') check.click();
  };
  document.addEventListener('keydown', state.keyHandler);
}

function resultScreen(r) {
  state.streak = r.correct ? (state.streak || 0) + 1 : 0;
  const cls = r.correct ? 'good' : 'reveal';
  const kids = [
    impact(r.correct),
    h('div', { class: `feedback ${cls} pop` }, h('p', { text: r.feedback }), r.correct ? null : h('p', { class: 'muted', text: `${r.explanation} (Answer: ${r.revealedAnswer})` }), h('p', { class: 'reward', text: `+${r.thread} Thread` })),
  ];
  for (const u of r.unlocked) kids.push(h('div', { class: 'unlock pop', text: `New item unlocked: ${u.name}` }));
  const nodes = [h('div', { class: 'topbar' }, h('div', { class: 'pill', text: state.student.nickname }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })), ...kids];
  if (r.unlocked.length) nodes.push(avatarStage({ interactive: false, mood: 'happy' }));
  const next = h('button', {
    class: 'primary',
    text: r.commissionComplete ? 'Open your pack' : 'Next',
    onclick: () => {
      state.busy = false;
      state.hint = null;
      state.input = '';
      state.story = '';
      if (r.commissionComplete) packScreen(r);
      else {
        state.task = r.next;
        taskScreen();
      }
    },
  });
  nodes.push(next);
  show(...nodes);
  next.focus();
  if (r.correct) burst(document.querySelector('.feedback'), r.unlocked.length ? 36 : 18);
  if (r.unlocked.length) {
    henshin(r.unlocked.map((u) => u.name));
    setTimeout(() => rain(46), 1800);
  }
  if (state.streak >= 2) comboToast(state.streak);
}

function packScreen(r) {
  const c = r.pack.card;
  show(
    h('div', { class: 'center stack' }, h('h2', { text: 'Commission complete!' }), r.bonusThread ? h('p', { class: 'reward', text: `Bonus: +${r.bonusThread} Thread for great work` }) : h('p', { class: 'muted', text: 'Every commission earns a pack.' })),
    h('div', { class: `tcard ${c.rarity} flip` }, h('span', { class: 'rarity', text: `${c.rarity} · ${c.type}` }), h('strong', { text: c.name }), r.pack.duplicate ? h('span', { class: 'muted', text: `Duplicate: +${r.pack.threadFromDuplicate} Thread instead` }) : h('span', { text: 'New card!' })),
    r.repaired ? h('p', { class: 'muted center', text: 'You strengthened a building-block skill. Nice.' }) : null,
    h('button', { class: 'primary', text: 'Back to studio', onclick: homeScreen }),
  );
  setTimeout(() => { burst(document.querySelector('.tcard'), 40); if (['epic', 'legendary'].includes(c.rarity)) rain(50); }, 450);
}

function wardrobeScreen() {
  const items = state.catalog.items;
  const names = state.catalog.skills;
  const stage = h('div');
  const list = h('div', { class: 'items' });
  const paint = (celebrate) => {
    stage.replaceChildren(avatarStage());
    if (celebrate) burst(stage.firstChild, 14);
    list.replaceChildren(
      ...items.map((i) => {
        const owned = has(i.id);
        const on = worn(i.id);
        return h(
          'div',
          { class: `item ${owned ? '' : 'locked'}` },
          h('strong', { text: i.name }),
          owned
            ? h('button', {
                class: `chip-btn ${on ? 'on' : ''}`,
                'aria-pressed': on ? 'true' : 'false',
                text: on ? 'Wearing ✓' : 'Try on',
                onclick: () => {
                  if (on) style.off.add(i.id);
                  else style.off.delete(i.id);
                  store.set('rr_off', JSON.stringify([...style.off]));
                  paint(!on);
                },
              })
            : h('span', { class: 'muted', text: `🔒 Reach ${Math.round(i.threshold * 100)}% in ${names[i.skill]}` }),
        );
      }),
    );
  };
  show(h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Wardrobe' }), h('span')), stage, h('p', { class: 'muted center', text: 'Tap Try on to dress up. Tap your designer to make her pose!' }), list);
  paint(false);
}

function cardsScreen() {
  const all = state.catalog.cards;
  const mine = new Set(state.student.cards);
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Cards' }), h('span', { class: 'muted', text: `${mine.size}/${all.length}` })),
    h('p', { class: 'muted', text: 'Finish commissions to earn packs. Duplicates turn into Thread.' }),
    h('div', { class: 'cards' }, all.map((c) => (mine.has(c.id) ? h('div', { class: `tcard ${c.rarity}` }, h('span', { class: 'rarity', text: `${c.rarity} · ${c.type}` }), h('strong', { text: c.name })) : h('div', { class: 'tcard locked' }, h('span', { class: 'rarity', text: c.rarity }), h('strong', { text: '???' }))))),
  );
}

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (state.token) homeScreen();
else loginScreen();
