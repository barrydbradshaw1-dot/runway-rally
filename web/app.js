// Runway Rally web client. No build step, no framework, and no innerHTML (text is always set safely).
import { drawAvatar } from './avatar.js';
import { CHOICES, DETAILS, DEFAULT_LOOK, STYLES, HAIR_STYLES, cleanLook, pick } from './look.js';
const app = document.getElementById('app');
const SVG_NS = 'http://www.w3.org/2000/svg';

// In the phone apps the game is loaded from inside the app, so API calls go to the server named
// in <meta name="rr-api"> (the app build adds it). On the website it is empty: same server.
const API_BASE = (document.querySelector('meta[name="rr-api"]')?.content || '').replace(/\/+$/, '');
const PRIVACY_URL = document.querySelector('meta[name="rr-privacy"]')?.content || '';
const native = Boolean(window.Capacitor?.isNativePlatform?.());
const plugin = (name) => (native ? window.Capacitor?.Plugins?.[name] : undefined);
// The phone can clear web storage when space runs low, so the app also keeps the sign-in in Preferences.
const prefs = plugin('Preferences');

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
    prefs?.set({ key: k, value: v }).catch(() => {});
    try {
      localStorage.setItem(k, v);
    } catch {
      /* memory only */
    }
  },
  del(k) {
    delete mem[k];
    prefs?.remove({ key: k }).catch(() => {});
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
  let res;
  try {
    res = await fetch(API_BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tz-offset': String(new Date().getTimezoneOffset()), // so days and streaks follow her clock
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach Runway Rally. Check your internet connection and try again.');
  }
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

// ---------- avatar: the student's chosen look, with earned items layered on top ----------
const ownedIds = () => state.student.unlocks.map((i) => i.id);
function avatar() {
  return drawAvatar(state.student.look, ownedIds());
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
    !checkCard && !st.lookSet
      ? h(
          'div',
          { class: 'card stack callout' },
          h('h3', { text: 'Make your designer yours' }),
          h('p', { text: 'Pick a skin tone, face, eyes, hair and style. Change it anytime.' }),
          h('button', { class: 'primary', text: 'Design my look', onclick: () => lookScreen() }),
        )
      : null,
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
      tile('🪞', 'My look', () => lookScreen(), 'wide'),
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
        const url = (API_BASE || location.origin) + r.path;
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
        const share = plugin('Share');
        linkBox.replaceChildren(
          h('p', { class: 'muted', text: 'Send this link to family. It shows how practice is going and cannot change anything. Making a new link turns the old one off.' }),
          field,
          share ? h('button', { text: 'Share link', onclick: () => share.share({ title: 'Runway Rally progress', url }).catch(() => {}) }) : copy,
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
      h('button', { class: 'ghost', text: 'Delete my data', onclick: deleteScreen }),
      /^https:\/\//.test(PRIVACY_URL) ? h('a', { class: 'muted center', href: PRIVACY_URL, target: '_blank', rel: 'noopener', text: 'Privacy policy' }) : null,
    ),
  );
  out.append(details);
  return out;
}

// Deleting a student's own data (asked for by Apple, and useful on the website too).
function deleteScreen() {
  const nick = h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Nickname', maxlength: 20 });
  const msg = h('p', { class: 'error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        if (state.busy) return;
        state.busy = true;
        try {
          await api('/api/me', { method: 'DELETE', body: { confirm: nick.value } });
          store.del('rr_token');
          Object.assign(state, { token: null, student: null, task: null, hint: null, input: '' });
          show(
            h('div', { class: 'card stack center' }, h('h2', { text: 'Your data is deleted' }), h('p', { text: 'Your designs, cards and practice history are gone from Runway Rally.' })),
            h('button', { class: 'primary', text: 'OK', onclick: loginScreen }),
          );
        } catch (err) {
          msg.textContent = err.message;
        } finally {
          state.busy = false;
        }
      },
    },
    h('label', { text: `Type your nickname (${state.student.nickname}) to delete everything` }),
    nick,
    msg,
    h('button', { class: 'danger', type: 'submit', text: 'Delete everything' }),
  );
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Delete my data' }), h('span')),
    h(
      'div',
      { class: 'card stack' },
      h('p', { text: 'This deletes your designs, cards, skills and practice history for good. Your teacher will no longer see your progress. It cannot be undone.' }),
      form,
    ),
  );
  nick.focus();
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

// ---------- My look ----------
// Students pick their designer's features and styles directly. Nothing asks for or stores race or
// ethnicity, and no camera or photo is used. Each choice is a native radio button or checkbox, so
// arrow keys, Tab and screen readers work without extra code.
const LOOK_TABS = [
  { id: 'skin', label: 'Skin' },
  { id: 'face', label: 'Face' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'hair', label: 'Hair' },
  { id: 'head', label: 'Head' },
  { id: 'style', label: 'Style' },
  { id: 'extras', label: 'Extras' },
];

function lookScreen({ tab = 'skin' } = {}) {
  const draft = cleanLook(state.student.look);
  const owned = ownedIds();
  let active = tab;
  let dirty = false;
  const preview = h('div', { class: 'card avatar-wrap look-preview' });
  const panel = h('div', { class: 'look-panel stack', role: 'tabpanel', id: 'look-panel', tabindex: '-1' });
  const msg = h('p', { class: 'error', role: 'alert' });
  const paint = () => preview.replaceChildren(drawAvatar(draft, owned));

  const swatchColor = (field, item) => {
    if (field === 'skin') return item.base;
    if (field === 'lipColor' && (!item.hex || item.hex === 'gloss')) return pick('skin', draft.skin).lip;
    return item.hex;
  };

  // One set of choices. Pictures show the student's own designer with that choice applied.
  const group = (field, legend, { swatch = false, view = 'head', items = CHOICES[field], over = {}, note, era = false } = {}) => {
    const opts = items.map((item) => {
      const input = h('input', { type: 'radio', name: `look-${field}`, value: item.id, class: 'sr-only' });
      input.checked = draft[field] === item.id;
      input.addEventListener('change', () => input.checked && choose(field, item.id));
      let pic;
      if (swatch) {
        pic = h('span', { class: `swatch${item.hex === 'gloss' ? ' gloss' : ''}`, 'aria-hidden': 'true' });
        pic.style.background = swatchColor(field, item);
      } else {
        pic = drawAvatar({ ...draft, ...over, [field]: item.id }, owned, { view, hideHair: over.hideHair, label: '' });
      }
      const name = era ? `${item.name} (${item.era === 'traditional' ? 'traditional' : 'modern take'})` : item.name;
      return h(
        'label',
        { class: `opt${swatch ? ' sw' : ''}${input.checked ? ' on' : ''}`, title: swatch ? item.name : null },
        input,
        pic,
        h('span', { class: swatch ? 'sr-only' : 'opt-name', text: name }),
        era ? h('span', { class: 'era', 'aria-hidden': 'true', text: item.era === 'traditional' ? 'Traditional' : 'Modern' }) : null,
      );
    });
    return h(
      'fieldset',
      { class: 'look-group' },
      h('legend', {}, legend, swatch ? h('span', { class: 'muted small picked', text: ` · ${pick(field, draft[field]).name}` }) : null),
      note ? h('p', { class: 'muted small', text: note }) : null,
      h('div', { class: swatch ? 'opts swatches' : 'opts thumbs' }, opts),
    );
  };

  const checks = (legend, items, field) =>
    h(
      'fieldset',
      { class: 'look-group' },
      h('legend', { text: legend }),
      h(
        'div',
        { class: 'checks' },
        items.map((item) => {
          const input = h('input', { type: 'checkbox', name: `look-${field}`, value: item.id });
          input.checked = draft[field].includes(item.id);
          input.addEventListener('change', () => {
            const set = new Set(draft[field]);
            if (input.checked) set.add(item.id);
            else set.delete(item.id);
            choose(field, [...set], item.id);
          });
          return h('label', { class: 'check' }, input, h('span', { text: item.name }));
        }),
      ),
    );

  const panels = {
    skin: () => [group('skin', 'Skin tone', { swatch: true, note: 'Pick any tone. You can change it anytime.' })],
    face: () => [
      group('face', 'Face shape', { view: 'head', over: { hideHair: true, headwear: 'none' } }),
      group('brows', 'Brows', { view: 'eyes' }),
      group('nose', 'Nose', { view: 'nose' }),
      group('lips', 'Lips', { view: 'mouth' }),
      group('lipColor', 'Lip color', { swatch: true }),
    ],
    eyes: () => [group('eyes', 'Eye shape', { view: 'eyes' }), group('eyeColor', 'Eye color', { swatch: true })],
    hair: () => {
      const hidden = pick('headwear', draft.headwear).covers === 'all';
      const textures = [...new Set(HAIR_STYLES.map((x) => x.texture))];
      return [
        hidden ? h('p', { class: 'callout card', text: 'Your head covering hides your hair. You can still pick a style here, or change the covering under Head.' }) : null,
        group('hairColor', 'Hair color', { swatch: true }),
        ...textures.map((t) => group('hair', t, { items: HAIR_STYLES.filter((x) => x.texture === t), over: { headwear: 'none' } })),
      ];
    },
    head: () => [group('headwear', 'Head covering', { view: 'head' }), group('headColor', 'Fabric color', { swatch: true })],
    style: () => {
      const families = [...new Set(STYLES.map((x) => x.family))];
      return [
        group('styleColor', 'Fabric color', { swatch: true }),
        h('p', { class: 'muted small', text: 'Classic clothes from around the world, each in a traditional form and a modern take. Wear anything you like.' }),
        ...families.map((f) => {
          const items = STYLES.filter((x) => x.family === f);
          const where = items[0].origin === 'Everyday' ? 'Everyday' : `${f} · ${items[0].origin}`;
          return group('style', where, { items, view: 'full', era: f !== 'Everyday' });
        }),
      ];
    },
    extras: () => [checks('Details', DETAILS, 'details'), group('glasses', 'Glasses', { view: 'face' }), group('earrings', 'Earrings', { view: 'head', over: { headwear: 'none' } })],
  };

  const tabButtons = LOOK_TABS.map((t) =>
    h('button', {
      role: 'tab',
      id: `look-tab-${t.id}`,
      'aria-controls': 'look-panel',
      class: 'look-tab',
      text: t.label,
      onclick: () => openTab(t.id),
    }),
  );
  const tabs = h('div', { class: 'look-tabs', role: 'tablist', 'aria-label': 'Parts of your look' }, tabButtons);
  tabs.addEventListener('keydown', (e) => {
    const i = LOOK_TABS.findIndex((t) => t.id === active);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: LOOK_TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const n = (next + LOOK_TABS.length) % LOOK_TABS.length;
    openTab(LOOK_TABS[n].id);
    tabButtons[n].focus();
  });

  function render(focus) {
    tabButtons.forEach((b, i) => {
      const on = LOOK_TABS[i].id === active;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `look-tab-${active}`);
    panel.replaceChildren(...panels[active]().filter(Boolean));
    if (focus) panel.querySelector(`input[name="look-${focus.field}"][value="${focus.value}"]`)?.focus();
  }
  function openTab(id) {
    active = id;
    render();
  }
  // Pictures show the student's own designer, so a new pick redraws them; focus stays put.
  function choose(field, value, focusValue = value) {
    draft[field] = value;
    dirty = true;
    msg.textContent = '';
    paint();
    render({ field, value: focusValue });
  }

  const save = h('button', {
    class: 'primary grow',
    text: 'Save my look',
    onclick: async () => {
      if (state.busy) return;
      state.busy = true;
      save.disabled = true;
      try {
        const r = await api('/api/look', { method: 'POST', body: { look: draft } });
        state.student = r.student;
        dirty = false;
        homeScreen();
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        state.busy = false;
        save.disabled = false;
      }
    },
  });
  const leave = () => {
    if (dirty && !confirm('Leave without saving your new look?')) return;
    homeScreen();
  };
  const reset = h('button', {
    class: 'ghost',
    text: 'Start over',
    onclick: () => {
      Object.assign(draft, cleanLook({ ...DEFAULT_LOOK, off: draft.off }));
      dirty = true;
      paint();
      render();
    },
  });

  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: leave }), h('h2', { text: 'My look' }), h('span')),
    h('p', { class: 'muted center', text: 'Design your designer. Pick any features and styles you like.' }),
    preview,
    tabs,
    panel,
    msg,
    h('div', { class: 'row look-actions' }, reset, save),
  );
  paint();
  render();
}

// Taking an earned item off (or putting it back on) saves right away.
async function setWorn(id, wear, box) {
  const look = cleanLook(state.student.look);
  const off = new Set(look.off);
  if (wear) off.delete(id);
  else off.add(id);
  try {
    const r = await api('/api/look', { method: 'POST', body: { look: { ...look, off: [...off] }, wardrobe: true } });
    state.student = r.student;
    wardrobeScreen();
  } catch (e) {
    box.checked = !wear;
    alert(e.message);
  }
}

function wardrobeScreen() {
  const items = state.catalog.items;
  const names = state.catalog.skills;
  const off = new Set(state.student.look?.off || []);
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Wardrobe' }), h('span')),
    h('div', { class: 'card avatar-wrap' }, avatar()),
    h('button', { class: 'primary', text: '🪞 Change my look', onclick: () => lookScreen() }),
    h('p', { class: 'muted small', text: 'Items you earn go on top of your look. Untick one to take it off.' }),
    h('div', { class: 'items' }, items.map((i) => {
      const owned = has(i.id);
      let wear = null;
      if (owned) {
        const box = h('input', { type: 'checkbox' });
        box.checked = !off.has(i.id);
        box.addEventListener('change', () => setWorn(i.id, box.checked, box));
        wear = h('label', { class: 'check' }, box, h('span', { text: 'Wearing' }));
      }
      return h('div', { class: `item ${owned ? '' : 'locked'}` }, h('strong', { text: i.name }), owned ? wear : h('span', { class: 'muted', text: `Reach ${Math.round(i.threshold * 100)}% in ${names[i.skill]}` }));
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
// The website caches itself with a service worker; the phone apps already carry their files.
if (!native && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
(async () => {
  if (!state.token && prefs) {
    try {
      const { value } = await prefs.get({ key: 'rr_token' });
      if (value) {
        state.token = value;
        mem.rr_token = value;
      }
    } catch {
      /* no saved sign-in */
    }
  }
  if (state.token) homeScreen();
  else loginScreen();
})();
