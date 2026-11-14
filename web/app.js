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
    headers: {
      'content-type': 'application/json',
      'x-tz-offset': String(new Date().getTimezoneOffset()), // so days and streaks follow her clock
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
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
          if (r.recoveryCode) recoveryCodeScreen(r.recoveryCode, { first: true });
          else await homeScreen();
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
    h('button', { class: 'ghost', text: 'Played before? Use your sign-in code', onclick: () => recoverScreen() }),
  );
}

// Sign back in on a new device, or after the browser was cleared.
function recoverScreen(msg = '') {
  const code = h('input', { type: 'text', id: 'rcode', autocomplete: 'off', autocapitalize: 'characters', maxlength: 14, placeholder: 'RR-ABCD-2345' });
  const err = h('p', { class: 'error', role: 'alert', text: msg });
  const go = h('button', { class: 'primary', type: 'submit', text: 'Sign in' });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        go.disabled = true;
        try {
          const r = await api('/api/session/recover', { method: 'POST', body: { code: code.value } });
          state.token = r.token;
          store.set('rr_token', r.token);
          await homeScreen();
        } catch (ex) {
          err.textContent = ex.message;
          go.disabled = false;
        }
      },
    },
    h('label', {}, 'Your sign-in code', code),
    err,
    go,
  );
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: () => loginScreen() }), h('span')),
    h('div', { class: 'center stack' }, h('h2', { text: 'Welcome back' }), h('p', { class: 'muted', text: 'Type the code you saved when you started. Your designs and skills come with you.' })),
    h('div', { class: 'card' }, form),
  );
  code.focus();
}

function recoveryCodeScreen(codeText, { first = false } = {}) {
  const copied = h('p', { class: 'muted center', role: 'status' });
  const copy = navigator.clipboard
    ? h('button', {
        text: 'Copy code',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(codeText);
            copied.textContent = 'Copied.';
          } catch {
            copied.textContent = 'Copy did not work here. Write it down instead.';
          }
        },
      })
    : null;
  show(
    h('div', { class: 'center stack' }, h('h2', { text: first ? 'Save your sign-in code' : 'Your new sign-in code' })),
    h(
      'div',
      { class: 'card stack center' },
      h('p', { text: 'Use this code to pick up where you left off on another phone, tablet or computer.' }),
      h('p', { class: 'code-big', text: codeText }),
      copy,
      copied,
      h('p', { class: 'muted', text: first ? 'Ask a grown-up to write it down or keep it somewhere safe.' : 'Your old code no longer works.' }),
    ),
    h('button', { class: 'primary', text: first ? 'I saved it' : 'Done', onclick: homeScreen }),
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
      if (r.task.example) exampleScreen();
      else taskScreen();
    } catch (e) {
      alert(e.message);
    }
  };
  const open = async (area, fn) => {
    api('/api/event', { method: 'POST', body: { area } }).catch(() => {});
    fn();
  };
  const tile = (emoji, label, onclick, extra = '') => h('button', { class: `tile ${extra}`, onclick }, h('span', { class: 'emoji', 'aria-hidden': 'true', text: emoji }), h('span', { text: label }));

  // New players start with a short skills check, so practice begins at the right spot.
  const p = st.placement;
  const offerCheck = (!p && st.stats.answered < 10) || p?.status === 'active';
  const checkCard = offerCheck
    ? h(
        'div',
        { class: 'card stack callout' },
        h('h3', { text: p?.status === 'active' ? 'Finish your skills check' : 'Start with a quick skills check' }),
        h('p', { text: 'A few questions so the game knows where to start. No hints and no score. "Not sure yet" is a fine answer.' }),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary grow', text: p?.status === 'active' ? 'Keep going' : 'Start the check', onclick: () => startPlacement(false) }),
          p?.status === 'active'
            ? null
            : h('button', {
                class: 'ghost',
                text: 'Later',
                onclick: async () => {
                  await api('/api/placement/skip', { method: 'POST' }).catch(() => {});
                  homeScreen();
                },
              }),
        ),
      )
    : null;

  show(
    h(
      'div',
      { class: 'topbar' },
      h('div', { class: 'pill', text: st.nickname }),
      h('div', { class: 'row' }, st.streak > 0 ? h('div', { class: 'pill streak', title: 'Days in a row', text: `🔥 ${st.streak}` }) : null, h('div', { class: 'pill thread', text: `🧵 ${st.thread}` })),
    ),
    checkCard,
    h('div', { class: 'card avatar-wrap pop' }, avatar()),
    st.commission ? h('button', { class: 'primary', onclick: () => start(null), text: `Continue commission (${st.commission.done}/${st.commission.total})` }) : null,
    h('h2', { text: 'Start a commission' }),
    st.reviewsDue > 0 ? h('p', { class: 'muted', text: `${st.reviewsDue === 1 ? 'One skill is' : `${st.reviewsDue} skills are`} ready for a quick review. They will show up in your next commission.` }) : null,
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
    grownUps(st),
  );
}

// Things for a parent or grandparent: the sign-in code, the progress link, and a fresh skills check.
function grownUps(st) {
  const out = h('div', { class: 'stack' });
  const linkBox = h('div', { class: 'stack' });
  const getLink = h('button', {
    text: 'Family progress link',
    onclick: async () => {
      try {
        const r = await api('/api/progress-link', { method: 'POST' });
        const url = location.origin + r.path;
        const field = h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Progress link' });
        const copy = navigator.clipboard
          ? h('button', {
              text: 'Copy link',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  copy.textContent = 'Copied';
                } catch {
                  field.select();
                }
              },
            })
          : null;
        linkBox.replaceChildren(
          h('p', { class: 'muted', text: 'Send this link to family. It shows how practice is going and cannot change anything. Making a new link turns the old one off.' }),
          field,
          copy,
        );
        field.addEventListener('focus', () => field.select());
      } catch (e) {
        linkBox.replaceChildren(h('p', { class: 'error', text: e.message }));
      }
    },
  });
  const details = h(
    'details',
    { class: 'card grownups' },
    h('summary', { text: 'For grown-ups' }),
    h(
      'div',
      { class: 'stack' },
      getLink,
      linkBox,
      st.viaLti
        ? null
        : h('button', {
            text: 'Get a new sign-in code',
            onclick: async () => {
              try {
                const r = await api('/api/recovery-code', { method: 'POST' });
                recoveryCodeScreen(r.recoveryCode);
              } catch (e) {
                linkBox.replaceChildren(h('p', { class: 'error', text: e.message }));
              }
            },
          }),
      h('button', { text: 'Redo the skills check', onclick: () => startPlacement(true) }),
      st.viaLti ? null : h('button', { class: 'ghost', onclick: signOut, text: 'Switch student' }),
    ),
  );
  out.append(details);
  return out;
}

function skillBars(st) {
  const names = state.catalog.skills;
  // only skills she can practice now, so the list grows as she does
  const ids = Object.keys(names).filter((id) => (st.unlockedSkills || Object.keys(names)).includes(id));
  return h(
    'div',
    { class: 'bars' },
    ids.map((id) => {
      const pct = Math.round(st.mastery[id] * 100);
      const fill = h('div', { class: 'fill' });
      fill.style.width = `${pct}%`;
      return h('div', { class: 'bar' }, h('div', { class: 'row between' }, h('span', { text: names[id] }), h('span', { class: 'muted', text: `${pct}%` })), h('div', { class: 'track', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': names[id] }, fill));
    }),
    h('p', { class: 'muted small', text: 'New skills open up as you get stronger at the ones they build on.' }),
  );
}

// ---------- worked example ----------
function exampleScreen() {
  const ex = state.task.example;
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Pause', onclick: () => homeScreen() }), h('div', { class: 'pill', text: 'Watch one first' })),
    state.story ? h('p', { class: 'story center', text: state.story }) : null,
    h(
      'div',
      { class: 'card stack pop' },
      h('p', { class: 'muted', text: 'Here is one solved step by step. Then you try one like it.' }),
      h('p', { class: 'prompt', text: ex.prompt }),
      h('ol', { class: 'steps' }, ex.steps.map((step) => h('li', { text: step }))),
    ),
    h('button', {
      class: 'primary',
      text: 'Now I try',
      onclick: () => {
        state.story = '';
        taskScreen();
      },
    }),
  );
}

// ---------- number pad shared by practice and the skills check ----------
function numberPad(onChange) {
  const display = h('div', { class: 'display', role: 'status', 'aria-label': 'Your answer', text: state.input || '0' });
  const setInput = (v) => {
    state.input = v.slice(0, 10);
    display.textContent = state.input || '0';
    onChange?.();
  };
  const press = (k) => {
    if (state.busy) return;
    const cur = state.input;
    if (k === 'back') return setInput(cur.slice(0, -1));
    if (k === '-') return setInput(cur.startsWith('-') ? cur.slice(1) : '-' + cur); // flips the sign
    if (k === '.' && (cur.includes('.') || cur.includes('/'))) return;
    if (k === '/' && (cur.includes('/') || cur.includes('.') || !/[0-9]$/.test(cur))) return;
    setInput(cur + k);
  };
  const key = (label, k, aria) => h('button', { 'aria-label': aria || label, onclick: (e) => { press(k); if (e.detail) e.currentTarget.blur(); }, text: label });
  const pad = h(
    'div',
    { class: 'pad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => key(n, n)),
    key('.', '.', 'Decimal point'),
    key('0', '0'),
    key('⌫', 'back', 'Delete'),
    key('−', '-', 'Negative'),
    key('/', '/', 'Fraction bar'),
    h('button', {
      text: 'Clear',
      onclick: (e) => {
        if (!state.busy) setInput('');
        if (e.detail) e.currentTarget.blur();
      },
    }),
  );
  const onKey = (e) => {
    if (/^[0-9.]$/.test(e.key)) press(e.key);
    else if (e.key === '-' || e.key === '−') press('-');
    else if (e.key === '/') press('/');
    else if (e.key === 'Backspace') press('back');
    else return false;
    return true;
  };
  return { display, pad, setInput, onKey };
}

function taskScreen() {
  const t = state.task;
  const { display, pad, setInput, onKey } = numberPad();
  const hintBox = h('div', { class: 'hint-box', hidden: !state.hint }, state.hint ? `Hint: ${state.hint}` : '');
  const msg = h('div', { role: 'alert' });
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
          state.busy = false;
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

  const speak = 'speechSynthesis' in window ? h('button', { class: 'ghost', 'aria-label': 'Read the question aloud', text: '🔊 Read aloud', onclick: () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t.prompt)); } }) : null;

  const dots = h('div', { class: 'progress', role: 'img', 'aria-label': `Task ${t.number} of ${t.of}` }, Array.from({ length: t.of }, (_, i) => h('span', { class: `dot ${i < t.number - 1 ? 'done' : i === t.number - 1 ? 'now' : ''}` })));
  const formTip = t.requireFraction ? 'Answer as a fraction, like 3/4.' : t.form === 'fraction' ? 'A fraction like 3/4 or a decimal both work.' : null;

  const nodes = [
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Pause', onclick: () => homeScreen() }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })),
    dots,
    state.story ? h('p', { class: 'story center', text: state.story }) : null,
    h('div', { class: 'card stack pop' }, t.review ? h('span', { class: 'badge', text: 'Quick review' }) : null, h('p', { class: 'prompt', text: t.prompt }), formTip ? h('p', { class: 'muted small', text: formTip }) : null, speak),
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
    if (onKey(e)) e.preventDefault();
    else if (e.key === 'Enter') check.click();
  };
  document.addEventListener('keydown', state.keyHandler);
}

// ---------- skills check (placement) ----------
async function startPlacement(restart) {
  try {
    const r = await api('/api/placement/start', { method: 'POST', body: restart ? { restart: true } : {} });
    state.student = r.student;
    state.task = r.task;
    state.input = '';
    state.busy = false;
    placementScreen();
  } catch (e) {
    alert(e.message);
  }
}

function placementScreen() {
  const t = state.task;
  const { display, pad, onKey } = numberPad();
  const msg = h('div', { role: 'alert' });
  const send = async (skip) => {
    if (state.busy || (!skip && !state.input)) return;
    state.busy = true;
    try {
      const r = await api('/api/placement/answer', { method: 'POST', body: { taskId: t.id, answer: state.input, skip } });
      state.student = r.student;
      state.input = '';
      state.busy = false;
      if (r.next) {
        state.task = r.next;
        placementScreen();
      } else placementDoneScreen(r.summary);
    } catch (e) {
      state.busy = false;
      msg.replaceChildren(h('div', { class: 'feedback try', text: e.message }));
    }
  };
  const done = h('button', { class: 'primary', text: 'Next', onclick: () => send(false) });
  const notSure = h('button', { text: 'Not sure yet', onclick: () => send(true) });
  done.style.flex = '1';
  notSure.style.flex = '1';
  const formTip = t.requireFraction ? 'Answer as a fraction, like 3/4.' : null;
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Later', onclick: () => homeScreen() }), h('div', { class: 'pill', text: `Skills check · ${t.number}` })),
    t.number === 1 ? h('p', { class: 'story center', text: 'No hints, no score, nothing to lose. Skip anything you have not learned yet.' }) : null,
    h('div', { class: 'card stack pop' }, h('p', { class: 'prompt', text: t.prompt }), formTip ? h('p', { class: 'muted small', text: formTip }) : null),
    display,
    msg,
    pad,
    h('div', { class: 'row' }, notSure, done),
  );
  state.keyHandler = (e) => {
    if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
    if (onKey(e)) e.preventDefault();
    else if (e.key === 'Enter') done.click();
  };
  document.addEventListener('keydown', state.keyHandler);
}

function placementDoneScreen(summary) {
  const list = (items) => h('ul', { class: 'plain' }, items.map((x) => h('li', { text: x })));
  show(
    h('div', { class: 'center stack pop' }, h('h2', { text: 'Skills check done!' }), h('p', { class: 'muted', text: 'Practice now starts right where it helps most.' })),
    summary.strong.length ? h('div', { class: 'card stack' }, h('h3', { text: 'Already strong' }), list(summary.strong)) : null,
    summary.startingWith.length ? h('div', { class: 'card stack' }, h('h3', { text: 'Starting with' }), list(summary.startingWith)) : null,
    h('button', { class: 'primary', text: 'Go to the studio', onclick: homeScreen }),
  );
}

function resultScreen(r) {
  const cls = r.correct ? 'good' : 'reveal';
  const names = state.catalog.skills;
  const kids = [
    h(
      'div',
      { class: `feedback ${cls} pop stack` },
      h('p', { text: r.feedback }),
      r.correct ? null : h('p', { text: `The answer is ${r.revealedAnswer}. Here is how:` }),
      r.correct || !r.steps ? null : h('ol', { class: 'steps' }, r.steps.map((step) => h('li', { text: step }))),
      h('p', { class: 'reward', text: `+${r.thread} Thread` }),
    ),
  ];
  for (const u of r.unlocked) kids.push(h('div', { class: 'unlock pop', text: `New item unlocked: ${u.name}` }));
  for (const k of r.newlyUnlockedSkills || []) kids.push(h('div', { class: 'unlock pop', text: `New skill opened: ${names[k]}` }));
  const nodes = [h('div', { class: 'topbar' }, h('div', { class: 'pill', text: state.student.nickname }), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` })), ...kids];
  if (r.unlocked.length) nodes.push(h('div', { class: 'card avatar-wrap' }, avatar()));
  const next = h('button', {
    class: 'primary',
    text: r.commissionComplete ? (r.pack ? 'Open your pack' : 'See how you did') : 'Next',
    onclick: () => {
      state.busy = false;
      state.hint = null;
      state.input = '';
      state.story = '';
      if (r.commissionComplete) packScreen(r);
      else {
        state.task = r.next;
        if (r.next.example) exampleScreen();
        else taskScreen();
      }
    },
  });
  nodes.push(next);
  show(...nodes);
  next.focus();
}

function packScreen(r) {
  const after = () => (r.sessionDone ? wrapScreen(r.sessionDone) : homeScreen());
  const score = r.score ? h('p', { class: 'muted', text: `${r.score.correct} of ${r.score.total} right` }) : null;
  if (!r.pack) {
    show(
      h('div', { class: 'center stack' }, h('h2', { text: 'Commission complete' }), score),
      h('div', { class: 'card stack center pop' }, h('p', { class: 'reward', text: `+${r.effortThread} Thread for sticking with it` }), h('p', { text: r.packHint })),
      r.repaired ? h('p', { class: 'muted center', text: 'You worked on a building-block skill. That makes the next one easier.' }) : null,
      h('button', { class: 'primary', text: r.sessionDone ? 'Next' : 'Back to studio', onclick: after }),
    );
    return;
  }
  const c = r.pack.card;
  show(
    h('div', { class: 'center stack' }, h('h2', { text: 'Commission complete!' }), score, r.bonusThread ? h('p', { class: 'reward', text: `Bonus: +${r.bonusThread} Thread for great work` }) : null),
    h('div', { class: `tcard ${c.rarity} pop` }, h('span', { class: 'rarity', text: `${c.rarity} · ${c.type}` }), h('strong', { text: c.name }), r.pack.duplicate ? h('span', { class: 'muted', text: `Duplicate: +${r.pack.threadFromDuplicate} Thread instead` }) : h('span', { text: 'New card!' })),
    r.repaired ? h('p', { class: 'muted center', text: 'You strengthened a building-block skill. Nice.' }) : null,
    h('button', { class: 'primary', text: r.sessionDone ? 'Next' : 'Back to studio', onclick: after }),
  );
}

// Shown once a day after a solid session: a natural place to stop.
function wrapScreen(d) {
  show(
    h('div', { class: 'center stack pop' }, h('h2', { text: 'Great session!' }), d.streak > 1 ? h('p', { class: 'reward', text: `🔥 ${d.streak} days in a row` }) : null),
    h(
      'div',
      { class: 'card stack center' },
      h('p', { text: `Today: ${d.answered} problems, ${d.correct} right, about ${Math.max(1, d.minutes)} minutes.` }),
      h('p', { class: 'muted', text: 'Your brain keeps building these skills after you stop. A little every day beats a lot at once. See you tomorrow!' }),
    ),
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
