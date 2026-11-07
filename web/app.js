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

// ---------- avatar (placeholder art: layered SVG that shows earned items) ----------
function avatar() {
  const L = [];
  L.push(s('ellipse', { cx: 100, cy: 92, rx: 56, ry: 62, fill: '#7a4dff' })); // back hair
  if (has('couture-cape')) L.push(s('path', { d: 'M52 130 Q100 118 148 130 L168 250 L32 250 Z', fill: '#4b2fb8' }));
  L.push(s('rect', { x: 88, y: 128, width: 24, height: 22, rx: 8, fill: '#ffd9c2' })); // neck
  // legs
  L.push(s('rect', { x: 82, y: 215, width: 14, height: 50, rx: 6, fill: '#ffd9c2' }));
  L.push(s('rect', { x: 104, y: 215, width: 14, height: 50, rx: 6, fill: '#ffd9c2' }));
  L.push(s('ellipse', { cx: 89, cy: 268, rx: 13, ry: 7, fill: '#ff7ac6' }));
  L.push(s('ellipse', { cx: 111, cy: 268, rx: 13, ry: 7, fill: '#ff7ac6' }));
  if (has('gala-gown')) {
    L.push(s('path', { d: 'M76 148 L124 148 L156 262 L44 262 Z', fill: '#ff7ac6' }));
    L.push(s('path', { d: 'M76 148 L124 148 L128 170 L72 170 Z', fill: '#ff9fd8' }));
  } else {
    L.push(s('rect', { x: 72, y: 146, width: 56, height: 74, rx: 14, fill: has('basic-tee') ? '#ffffff' : '#ffd9c2' })); // tee
    L.push(s('rect', { x: 78, y: 210, width: 44, height: 14, rx: 6, fill: '#5a77ff' })); // shorts
  }
  if (has('fraction-jacket')) {
    L.push(s('path', { d: 'M66 146 L90 146 L90 214 L70 214 Z', fill: '#2fc9a2' }));
    L.push(s('path', { d: 'M110 146 L134 146 L130 214 L110 214 Z', fill: '#2fc9a2' }));
  }
  if (has('sale-scarf')) L.push(s('path', { d: 'M82 144 Q100 160 118 144 L122 156 Q100 174 78 156 Z', fill: '#ffb830' }));
  if (has('ratio-pearls')) for (let i = 0; i < 7; i++) L.push(s('circle', { cx: 80 + i * 6.7, cy: 154 + Math.sin((i / 6) * Math.PI) * 10, r: 3.4, fill: '#fff', stroke: '#d8d0f5' }));
  L.push(s('circle', { cx: 100, cy: 92, r: 50, fill: '#ffe6d6' })); // head
  // front hair
  L.push(s('path', { d: 'M50 88 Q60 34 100 36 Q142 34 150 88 Q128 62 100 64 Q72 62 50 88 Z', fill: '#7a4dff' }));
  // anime eyes
  for (const x of [80, 120]) {
    L.push(s('ellipse', { cx: x, cy: 98, rx: 10, ry: 13, fill: '#2b2250' }));
    L.push(s('circle', { cx: x + 3, cy: 93, r: 4, fill: '#fff' }));
    L.push(s('circle', { cx: x - 3, cy: 103, r: 2, fill: '#fff' }));
  }
  L.push(s('ellipse', { cx: 68, cy: 116, rx: 8, ry: 5, fill: '#ff9fc4', opacity: 0.7 }));
  L.push(s('ellipse', { cx: 132, cy: 116, rx: 8, ry: 5, fill: '#ff9fc4', opacity: 0.7 }));
  L.push(s('path', { d: 'M92 122 Q100 129 108 122', fill: 'none', stroke: '#c0446f', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  if (has('crystal-crown')) L.push(s('path', { d: 'M70 52 L80 30 L92 48 L100 24 L108 48 L120 30 L130 52 Z', fill: '#9ae7ff', stroke: '#4aa8ff', 'stroke-width': 2 }));
  return s('svg', { class: 'avatar', viewBox: '0 0 200 280', role: 'img', 'aria-label': 'Your designer wearing the items you have earned' }, L);
}

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
    h('div', { class: 'center stack' }, h('h1', { text: 'Runway Rally' }), h('p', { class: 'muted', text: 'Design fashion. Earn it with math.' })),
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
  const tile = (emoji, label, onclick, extra = '') => h('button', { class: `tile ${extra}`, onclick }, h('span', { class: 'emoji', 'aria-hidden': 'true', text: emoji }), h('span', { text: label }));

  show(
    h('div', { class: 'topbar' }, h('div', { class: 'pill', text: st.nickname }), h('div', { class: 'pill thread', text: `🧵 ${st.thread} Thread` })),
    h('div', { class: 'card avatar-wrap pop' }, avatar()),
    st.commission ? h('button', { class: 'primary', onclick: () => start(null), text: `Continue commission (${st.commission.done}/${st.commission.total})` }) : null,
    h('h2', { text: 'Start a commission' }),
    h(
      'div',
      { class: 'hub' },
      tile('💎', 'Jewelry Bench', () => start('jewelry')),
      tile('✂️', 'Pattern Table', () => start('fabric')),
      tile('✨', 'Runway', () => start('runway')),
      tile('🎲', 'Surprise me', () => start(null)),
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

function taskScreen() {
  const t = state.task;
  const display = h('div', { class: 'display', role: 'status', 'aria-label': 'Your answer', text: state.input || '0' });
  const hintBox = h('div', { class: 'hint-box', hidden: !state.hint }, state.hint ? `Hint: ${state.hint}` : '');
  const msg = h('div');
  const setInput = (v) => {
    state.input = v.slice(0, 7);
    display.textContent = state.input || '0';
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

  const nodes = [
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Pause', onclick: () => homeScreen() }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })),
    dots,
    state.story ? h('p', { class: 'story center', text: state.story }) : null,
    h('div', { class: 'card stack pop' }, h('p', { class: 'prompt', text: t.prompt }), speak),
    display,
    hintBox,
    msg,
    pad,
    h('div', { class: 'row' }, hintBtn, check),
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
  const cls = r.correct ? 'good' : 'reveal';
  const kids = [
    h('div', { class: `feedback ${cls} pop` }, h('p', { text: r.feedback }), r.correct ? null : h('p', { class: 'muted', text: `${r.explanation} (Answer: ${r.revealedAnswer})` }), h('p', { class: 'reward', text: `+${r.thread} Thread` })),
  ];
  for (const u of r.unlocked) kids.push(h('div', { class: 'unlock pop', text: `New item unlocked: ${u.name}` }));
  const nodes = [h('div', { class: 'topbar' }, h('div', { class: 'pill', text: state.student.nickname }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })), ...kids];
  if (r.unlocked.length) nodes.push(h('div', { class: 'card avatar-wrap' }, avatar()));
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
}

function packScreen(r) {
  const c = r.pack.card;
  show(
    h('div', { class: 'center stack' }, h('h2', { text: 'Commission complete!' }), r.bonusThread ? h('p', { class: 'reward', text: `Bonus: +${r.bonusThread} Thread for great work` }) : h('p', { class: 'muted', text: 'Every commission earns a pack.' })),
    h('div', { class: `tcard ${c.rarity} pop` }, h('span', { class: 'rarity', text: `${c.rarity} · ${c.type}` }), h('strong', { text: c.name }), r.pack.duplicate ? h('span', { class: 'muted', text: `Duplicate: +${r.pack.threadFromDuplicate} Thread instead` }) : h('span', { text: 'New card!' })),
    r.repaired ? h('p', { class: 'muted center', text: 'You strengthened a building-block skill. Nice.' }) : null,
    h('button', { class: 'primary', text: 'Back to studio', onclick: homeScreen }),
  );
}

function wardrobeScreen() {
  const items = state.catalog.items;
  const names = state.catalog.skills;
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Wardrobe' }), h('span')),
    h('div', { class: 'card avatar-wrap' }, avatar()),
    h('div', { class: 'items' }, items.map((i) => {
      const owned = has(i.id);
      return h('div', { class: `item ${owned ? '' : 'locked'}` }, h('strong', { text: i.name }), h('span', { class: 'muted', text: owned ? 'Owned' : `Reach ${Math.round(i.threshold * 100)}% in ${names[i.skill]}` }));
    })),
  );
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
