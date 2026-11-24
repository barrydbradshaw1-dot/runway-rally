// Runway Rally web client. No build step, no framework, and no innerHTML (text is always set safely).
import { drawAvatar } from './avatar.js';
import { CHOICES, DETAILS, DEFAULT_LOOK, STYLES, HAIR_STYLES, cleanLook, pick } from './look.js';
import { SLOTS, SKILL_ITEMS, REWARD_ITEMS, itemById, colorHex, colorName } from './items.js';
import { createSounds, soundOn, SOUND_KEY } from './sound.js';
const app = document.getElementById('app');
const SVG_NS = 'http://www.w3.org/2000/svg';

// In the phone apps the game is loaded from inside the app, so API calls go to the server named
// in <meta name="rr-api"> (the app build adds it). On the website it is empty: same server.
const API_BASE = (document.querySelector('meta[name="rr-api"]')?.content || '').replace(/\/+$/, '');
// The privacy policy: the phone build may name its own address; otherwise the page on the server.
const PRIVACY_URL = document.querySelector('meta[name="rr-privacy"]')?.content || `${API_BASE}/privacy/`;
const privacyLink = (text = 'Privacy policy', cls = 'muted center') => h('a', { class: cls, href: PRIVACY_URL, target: '_blank', rel: 'noopener', text });
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

// Answer sounds (see sound.js). On unless the student switched them off on this device.
const sounds = createSounds({ isOn: () => soundOn((k) => store.get(k)) });

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
  assignments: [],
  task: null,
  story: '',
  storyEs: '',
  input: '',
  hint: null,
  hintEs: null,
  hintLevel: 0,
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

// ---------- Spanish help ("Ver en español") ----------
// Only when the teacher turned it on for the class: the server then sends a Spanish copy of each problem
// (task.es). The student's choice is remembered on this device. The English stays on screen.
const esChosen = () => store.get('rr_es') === '1';
const useEs = () => Boolean(state.task?.es) && esChosen();
const L = (en, es) => (useEs() ? es : en);

function esToggle(redraw) {
  if (!state.task?.es) return null;
  const on = esChosen();
  return h('button', {
    class: 'ghost lang-toggle',
    lang: on ? 'en' : 'es',
    'aria-pressed': String(on),
    text: on ? 'Show in English' : 'Ver en español',
    onclick: () => {
      store.set('rr_es', on ? '0' : '1');
      redraw();
    },
  });
}

// Sound on/off switch for the answer screens. Remembered on this device.
function soundToggle() {
  const btn = h('button', { class: 'ghost sound-toggle' });
  const label = () => {
    const on = soundOn((k) => store.get(k));
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', L('Sound effects', 'Efectos de sonido'));
    btn.textContent = on ? L('🔊 Sound on', '🔊 Con sonido') : L('🔇 Sound off', '🔇 Sin sonido');
  };
  btn.addEventListener('click', (e) => {
    store.set(SOUND_KEY, soundOn((k) => store.get(k)) ? '0' : '1');
    label();
    sounds.play('tap'); // a tick so turning sound on is heard right away
    if (e.detail) btn.blur();
  });
  label();
  return btn;
}

// The problem in Spanish with the English under it, or just the English.
function promptNodes(en, es) {
  if (useEs() && es) return [h('p', { class: 'prompt', lang: 'es', text: es }), h('p', { class: 'muted small', lang: 'en', text: en })];
  return [h('p', { class: 'prompt', text: en })];
}

function speakButton(en, es) {
  if (!('speechSynthesis' in window)) return null;
  const spanish = Boolean(useEs() && es);
  return h('button', {
    class: 'ghost',
    'aria-label': spanish ? 'Leer la pregunta en voz alta' : 'Read the question aloud',
    text: spanish ? '🔊 Leer en voz alta' : '🔊 Read aloud',
    onclick: () => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spanish ? es : en);
      if (spanish) {
        u.lang = 'es-US';
        const voice = speechSynthesis.getVoices().find((v) => /^es([-_]|$)/i.test(v.lang));
        if (voice) u.voice = voice;
      }
      speechSynthesis.speak(u);
    },
  });
}

function storyNode() {
  const text = useEs() && state.storyEs ? state.storyEs : state.story;
  return text ? h('p', { class: 'story center', lang: useEs() && state.storyEs ? 'es' : 'en', text }) : null;
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
  // on a shared device the next student starts fresh: English view, sound on
  store.del('rr_es');
  store.del(SOUND_KEY);
  const viaLti = state.student?.viaLti;
  Object.assign(state, { token: null, student: null, task: null, hint: null, input: '' });
  if (viaLti) return show(h('div', { class: 'card stack' }, h('h2', { text: 'Session ended' }), h('p', { text: 'Open Runway Rally again from your course in Brightspace.' })));
  loginScreen();
}


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
    h('p', { class: 'muted join-note' }, 'Your teacher set up this class for school. Runway Rally keeps your nickname and what you do in the game, and nothing else about you. ', privacyLink('Privacy policy', '')),
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

function recoveryCodeScreen(codeText, { first = false, thenSignOut = false } = {}) {
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
    h('button', { class: 'primary', text: thenSignOut ? 'I saved it. Sign me out' : first ? 'I saved it' : 'Done', onclick: thenSignOut ? signOut : homeScreen }),
  );
}

async function loadState() {
  const r = await api('/api/state');
  state.student = r.student;
  state.catalog = r.catalog;
  state.assignments = r.assignments || []; // homework practice the teacher has turned on for the class
}

async function homeScreen() {
  try {
    await loadState();
  } catch (e) {
    return loginScreen(e.message);
  }
  const st = state.student;
  const start = async (theme, assignmentId) => {
    try {
      const r = await api('/api/commission/start', { method: 'POST', body: assignmentId ? { assignmentId } : theme ? { theme } : {} });
      state.student = r.student;
      state.task = r.task;
      state.story = r.resumed ? '' : r.repair ? 'Let us warm up with a building-block skill first. It will make the next one easier.' : r.story;
      state.storyEs = r.resumed ? '' : r.repair ? 'Primero calentemos con una habilidad básica. Así la siguiente será más fácil.' : r.storyEs || '';
      state.hint = null;
      state.hintEs = null;
      state.hintLevel = 0;
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
      h('div', { class: 'row' }, h('div', { class: 'pill', text: st.nickname }), st.viaLti ? null : h('button', { class: 'ghost small notyou', text: 'Not you?', onclick: signOut })),
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
    st.commission
      ? h('button', { class: 'primary', onclick: () => start(null), text: st.commission.fromTeacher ? `Continue ${st.commission.fromTeacher} (${st.commission.done}/${st.commission.total})` : `Continue commission (${st.commission.done}/${st.commission.total})` })
      : null,
    // the teacher's own assignments, turned into commissions (same scoring and rewards)
    state.assignments.length
      ? h(
          'div',
          { class: 'card stack callout' },
          h('h3', { text: 'From your teacher' }),
          h('p', { class: 'muted', text: 'Practice the problems your teacher picked. They count like any commission.' }),
          state.assignments.map((a) => h('button', { onclick: () => start(null, a.id), text: `📝 ${a.title} (${a.count} ${a.count === 1 ? 'problem' : 'problems'})` })),
        )
      : null,
    h('h2', { text: 'Start a commission' }),
    st.reviewsDue > 0 ? h('p', { class: 'muted', text: `${st.reviewsDue === 1 ? 'One skill is' : `${st.reviewsDue} skills are`} ready for a quick review. They will show up in your next commission.` }) : null,
    h(
      'div',
      { class: 'hub' },
      tile('💎', 'Jewelry Bench', () => start('jewelry')),
      tile('✂️', 'Pattern Table', () => start('fabric')),
      tile('✨', 'Runway', () => start('runway')),
      tile('🎲', 'Surprise me', () => start(null)),
      tile('👗', 'Wardrobe', () => open('wardrobe', () => wardrobeScreen())),
      tile('🪞', 'My look', () => lookScreen()),
    ),
    h('div', { class: 'card stack' }, h('h3', { text: 'Your skills' }), skillBars(st)),
    grownUps(st),
    st.viaLti ? null : h('button', { class: 'ghost', text: 'Sign out', onclick: signOutScreen }),
  );
}

// Signing out on a shared device. Coming back needs the sign-in code, so offer a fresh one first.
function signOutScreen() {
  const msg = h('p', { class: 'error', role: 'alert' });
  show(
    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: `Sign out, ${state.student.nickname}?` }),
      h('p', { text: 'Your designs and skills stay saved. To come back, you need your sign-in code (it starts with RR-). If you do not have it, get a new one first.' }),
      msg,
      h('button', { class: 'primary', text: 'Sign out', onclick: signOut }),
      h('button', {
        text: 'Get my sign-in code first',
        onclick: async () => {
          try {
            const r = await api('/api/recovery-code', { method: 'POST' });
            recoveryCodeScreen(r.recoveryCode, { thenSignOut: true });
          } catch (e) {
            msg.textContent = e.message;
          }
        },
      }),
      h('button', { class: 'ghost', text: 'Stay signed in', onclick: () => homeScreen() }),
    ),
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
      h('button', { class: 'ghost', text: 'Delete my data', onclick: deleteScreen }),
      privacyLink(),
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
            h('div', { class: 'card stack center' }, h('h2', { text: 'Your data is deleted' }), h('p', { text: 'Your designs, wardrobe and practice history are gone from Runway Rally.' })),
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
      h('p', { text: 'This deletes your designs, wardrobe, skills and practice history for good. Your teacher will no longer see your progress. It cannot be undone.' }),
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
  const exEs = state.task.es?.example;
  const spanish = Boolean(useEs() && exEs);
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: L('← Pause', '← Pausa'), onclick: () => homeScreen() }), h('div', { class: 'pill', text: L('Watch one first', 'Mira un ejemplo') })),
    storyNode(),
    h(
      'div',
      { class: 'card stack pop' },
      esToggle(exampleScreen),
      h('p', { class: 'muted', text: L('Here is one solved step by step. Then you try one like it.', 'Aquí hay uno resuelto paso a paso. Luego intentas uno parecido.') }),
      ...promptNodes(ex.prompt, exEs?.prompt),
      h('ol', { class: 'steps', lang: spanish ? 'es' : 'en' }, (spanish ? exEs.steps : ex.steps).map((step) => h('li', { text: step }))),
    ),
    h('button', {
      class: 'primary',
      text: L('Now I try', 'Ahora lo intento yo'),
      onclick: () => {
        state.story = '';
        state.storyEs = '';
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
  const tap = () => {
    if (!state.busy) sounds.play('tap');
  };
  const key = (label, k, aria) => h('button', { 'aria-label': aria || label, onclick: (e) => { tap(); press(k); if (e.detail) e.currentTarget.blur(); }, text: label });
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
      text: L('Clear', 'Borrar'),
      onclick: (e) => {
        tap();
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
  const hintLine = () => (useEs() && state.hintEs ? `Pista ${state.hintLevel}: ${state.hintEs}` : `Hint ${state.hintLevel}: ${state.hint}`);
  const hintBox = h('div', { class: 'hint-box', hidden: !state.hint, lang: useEs() && state.hintEs ? 'es' : 'en' }, state.hint ? hintLine() : '');
  const msg = h('div', { role: 'alert' });
  const hintBtn = h('button', {
    text: L('💡 Hint', '💡 Pista'),
    onclick: async (e) => {
      if (e.detail) e.currentTarget.blur();
      try {
        const r = await api('/api/hint', { method: 'POST', body: { taskId: t.id } });
        state.hint = r.text;
        state.hintEs = r.es?.text || null;
        state.hintLevel = r.level;
        hintBox.hidden = false;
        hintBox.lang = useEs() && state.hintEs ? 'es' : 'en';
        hintBox.textContent = hintLine();
        if (r.level >= 3) hintBtn.disabled = true;
      } catch (e) {
        msg.replaceChildren(h('div', { class: 'feedback try', text: e.message }));
      }
    },
  });
  if (state.hint) hintBtn.textContent = L('💡 More help', '💡 Más ayuda');
  if (state.hintLevel >= 3) hintBtn.disabled = true;
  const check = h('button', {
    class: 'primary',
    text: L('Check', 'Revisar'),
    onclick: async () => {
      if (!state.input || state.busy) return;
      sounds.wake(); // browsers allow sound only from a tap, so wake it now, before waiting on the server
      state.busy = true;
      check.disabled = true;
      try {
        const r = await api('/api/answer', { method: 'POST', body: { taskId: t.id, answer: state.input } });
        state.student = r.student;
        sounds.play(r.correct ? 'right' : 'wrong');
        if (r.retry) {
          display.classList.add('shake');
          setTimeout(() => display.classList.remove('shake'), 400);
          const es = useEs() && r.es?.feedback;
          msg.replaceChildren(h('div', { class: 'feedback try', lang: es ? 'es' : 'en', text: es || r.feedback }));
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

  const speak = speakButton(t.prompt, t.es?.prompt);

  const dots = h('div', { class: 'progress', role: 'img', 'aria-label': `Task ${t.number} of ${t.of}` }, Array.from({ length: t.of }, (_, i) => h('span', { class: `dot ${i < t.number - 1 ? 'done' : i === t.number - 1 ? 'now' : ''}` })));
  const formTip = t.requireFraction
    ? L('Answer as a fraction, like 3/4.', 'Responde con una fracción, como 3/4.')
    : t.form === 'fraction'
      ? L('A fraction like 3/4 or a decimal both work.', 'Sirve una fracción como 3/4 o un decimal.')
      : null;

  const nodes = [
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: L('← Pause', '← Pausa'), onclick: () => homeScreen() }), h('div', { class: 'row' }, soundToggle(), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` }))),
    dots,
    storyNode(),
    h(
      'div',
      { class: 'card stack pop' },
      esToggle(taskScreen),
      t.review ? h('span', { class: 'badge', text: L('Quick review', 'Repaso rápido') }) : null,
      t.fromTeacher ? h('span', { class: 'badge', text: L('From your teacher', 'De tu docente') }) : null,
      ...promptNodes(t.prompt, t.es?.prompt),
      formTip ? h('p', { class: 'muted small', text: formTip }) : null,
      speak,
    ),
    display,
    hintBox,
    msg,
    pad,
    h('div', { class: 'row answer-actions' }, hintBtn, check),
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
  const done = h('button', { class: 'primary', text: L('Next', 'Siguiente'), onclick: () => send(false) });
  const notSure = h('button', { text: L('Not sure yet', 'Todavía no sé'), onclick: () => send(true) });
  done.style.flex = '1';
  notSure.style.flex = '1';
  const formTip = t.requireFraction ? L('Answer as a fraction, like 3/4.', 'Responde con una fracción, como 3/4.') : null;
  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: L('← Later', '← Después'), onclick: () => homeScreen() }), h('div', { class: 'row' }, soundToggle(), h('div', { class: 'pill', text: L(`Skills check · ${t.number}`, `Prueba de habilidades · ${t.number}`) }))),
    t.number === 1
      ? h('p', { class: 'story center', text: L('No hints, no score, nothing to lose. Skip anything you have not learned yet.', 'Sin pistas, sin puntos, nada que perder. Salta lo que todavía no hayas aprendido.') })
      : null,
    h('div', { class: 'card stack pop' }, esToggle(placementScreen), ...promptNodes(t.prompt, t.es?.prompt), formTip ? h('p', { class: 'muted small', text: formTip }) : null, speakButton(t.prompt, t.es?.prompt)),
    display,
    msg,
    pad,
    h('div', { class: 'row answer-actions' }, notSure, done),
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

// Celebrations drawn over the screen, then removed. A right answer gets a quick burst of gold
// sparkles from the answer card. A new piece gets a slower shower of coloured stars and hearts
// from the top, and the piece's card glows. Skipped when the device asks for less motion.
const FX_COLORS = ['#ffb800', '#ff5fa8', '#9b5cff', '#24c6a0', '#4aa8ff'];
function celebrate(kind, anchor) {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = h('div', { class: `fx fx-${kind}`, 'aria-hidden': 'true' });
  const rnd = (a, b) => a + Math.random() * (b - a);
  if (kind === 'right') {
    const box = (anchor || document.body).getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + Math.min(box.height, 120) / 2;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + rnd(-0.2, 0.2);
      const dist = rnd(80, 170);
      const spark = h('span', { class: 'spark', text: i % 3 ? '✦' : '✧' });
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.color = i % 4 ? '#ffb800' : '#ff5fa8';
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      spark.style.setProperty('--size', `${rnd(18, 32)}px`);
      spark.style.animationDelay = `${rnd(0, 0.08)}s`;
      layer.append(spark);
    }
  } else {
    const shapes = ['★', '✦', '♥', '✿', '✧'];
    for (let i = 0; i < 36; i++) {
      const bit = h('span', { class: 'confetti', text: shapes[i % shapes.length] });
      bit.style.left = `${rnd(0, 100)}vw`;
      bit.style.color = FX_COLORS[i % FX_COLORS.length];
      bit.style.setProperty('--dx', `${rnd(-60, 60)}px`);
      bit.style.setProperty('--spin', `${rnd(-540, 540)}deg`);
      bit.style.setProperty('--size', `${rnd(16, 30)}px`);
      bit.style.animationDuration = `${rnd(1.6, 2.6)}s`;
      bit.style.animationDelay = `${rnd(0, 0.7)}s`;
      layer.append(bit);
    }
    for (const card of document.querySelectorAll('.new-piece, .unlock-item')) card.classList.add('glow');
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), kind === 'right' ? 1200 : 3600);
}

function resultScreen(r) {
  const cls = r.correct ? 'good' : 'reveal';
  const names = state.catalog.skills;
  const es = useEs() && r.es ? r.es : null;
  const steps = es?.steps || r.steps;
  const card = h(
      'div',
      { class: `feedback ${cls} pop stack`, lang: es ? 'es' : 'en' },
      h('p', { text: es?.feedback || r.feedback }),
      r.correct ? null : h('p', { text: es ? `La respuesta es ${r.revealedAnswer}. Así se resuelve:` : `The answer is ${r.revealedAnswer}. Here is how:` }),
      r.correct || !steps ? null : h('ol', { class: 'steps' }, steps.map((step) => h('li', { text: step }))),
      h('p', { class: 'reward', text: es ? `+${r.thread} de hilo` : `+${r.thread} Thread` }),
    );
  const kids = [esToggle(() => resultScreen(r)), card];
  for (const u of r.unlocked) kids.push(h('div', { class: 'unlock unlock-item pop', text: `New item unlocked: ${u.name}` }));
  for (const k of r.newlyUnlockedSkills || []) kids.push(h('div', { class: 'unlock pop', text: `New skill opened: ${names[k]}` }));
  const nodes = [h('div', { class: 'topbar' }, h('div', { class: 'pill', text: state.student.nickname }), h('div', { class: 'row' }, soundToggle(), h('div', { class: 'pill thread', text: `🧵 ${state.student.thread}` }))), ...kids];
  if (r.unlocked.length) nodes.push(h('div', { class: 'card avatar-wrap' }, avatar()));
  const next = h('button', {
    class: 'primary',
    text: r.commissionComplete ? (r.reward ? L('See your new piece', 'Ver tu pieza nueva') : L('See how you did', 'Ver cómo te fue')) : L('Next', 'Siguiente'),
    onclick: () => {
      state.busy = false;
      state.hint = null;
      state.hintEs = null;
      state.hintLevel = 0;
      state.input = '';
      state.story = '';
      state.storyEs = '';
      if (r.commissionComplete) rewardScreen(r);
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
  if (r.correct && !r.revealed) celebrate('right', card);
  if (r.unlocked.length) celebrate('piece');
}

// A good commission earns the next piece, already on the designer. One tap takes it off again
// (and puts back whatever was in that spot before).
function rewardScreen(r) {
  const after = () => (r.sessionDone ? wrapScreen(r.sessionDone) : homeScreen());
  const score = r.score ? h('p', { class: 'muted', text: `${r.score.correct} of ${r.score.total} right` }) : null;
  const done = h('button', { class: 'primary', text: r.sessionDone ? 'Next' : 'Back to studio', onclick: after });
  const header = h('div', { class: 'center stack' }, h('h2', { text: r.reward ? 'Commission complete!' : 'Commission complete' }), score, r.bonusThread ? h('p', { class: 'reward', text: `Bonus: +${r.bonusThread} Thread for great work` }) : null);
  if (!r.reward) {
    const body = r.allCollected
      ? [h('p', { class: 'reward', text: `+${r.allCollected} Thread` }), h('p', { text: 'You have every piece in every colour. Amazing work!' })]
      : [h('p', { class: 'reward', text: `+${r.effortThread} Thread for sticking with it` }), h('p', { text: r.rewardHint })];
    show(header, h('div', { class: 'card stack center pop' }, body), r.repaired ? h('p', { class: 'muted center', text: 'You worked on a building-block skill. That makes the next one easier.' }) : null, done);
    done.focus();
    return;
  }
  const { item, replaced } = r.reward;
  const where = SLOTS.find((x) => x.id === item.slot)?.name.toLowerCase() || 'wardrobe';
  let wearing = true;
  const pic = h('div', { class: 'card avatar-wrap' }, avatar());
  const note = h('p', { class: 'muted small center', 'aria-live': 'polite' });
  const toggle = h('button', { class: 'ghost' });
  const label = () => {
    toggle.textContent = wearing ? 'Take it off' : 'Put it on';
    note.textContent = wearing
      ? replaced
        ? `It took the place of your ${replaced.name}, which is still in your wardrobe.`
        : `It's on your designer now. Find it anytime in your wardrobe under ${where}.`
      : replaced
        ? `Your ${replaced.name} is back on. ${item.name} is in your wardrobe.`
        : `${item.name} is in your wardrobe.`;
  };
  toggle.addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    const look = cleanLook(state.student.look);
    const wear = look.wear.filter((w) => itemById(w)?.slot !== item.slot);
    if (!wearing) wear.push(item.id);
    else if (replaced) wear.push(replaced.id);
    try {
      await saveWear(wear);
      wearing = !wearing;
      pic.replaceChildren(avatar());
      label();
    } catch (e) {
      alert(e.message);
    } finally {
      state.busy = false;
    }
  });
  label();
  show(
    header,
    h('div', { class: 'card stack center pop new-piece' }, h('span', { class: 'badge', text: 'New piece' }), h('h3', { text: item.name })),
    pic,
    note,
    h('div', { class: 'row' }, toggle, done),
    r.repaired ? h('p', { class: 'muted center', text: 'You strengthened a building-block skill. Nice.' }) : null,
  );
  done.focus();
  celebrate('piece');
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
      Object.assign(draft, cleanLook({ ...DEFAULT_LOOK, wear: draft.wear })); // keeps the pieces she has on
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

// ---------- Wardrobe ----------
// Saves which pieces are on. Only pieces the student owns are kept (the server checks too).
async function saveWear(wear) {
  const look = { ...cleanLook(state.student.look), wear };
  const r = await api('/api/look', { method: 'POST', body: { look, wardrobe: true } });
  state.student = r.student;
}

const SLOT_VIEW = { head: 'head', neck: 'body', scarf: 'body', top: 'body', dress: 'full', outer: 'body', cape: 'full', wrist: 'body', bag: 'body', shoes: 'feet' };

// Every earned piece, one spot at a time. Picking one puts it on right away; each spot holds one.
// A piece earned in more than one colour gets a row of colour choices once it is on.
function wardrobeScreen(focus) {
  const owned = ownedIds();
  const look = cleanLook(state.student.look);
  const names = state.catalog.skills;
  const mine = owned.map(itemById).filter(Boolean);
  const msg = h('p', { class: 'error', role: 'alert' });
  const without = (slot) => look.wear.filter((w) => itemById(w)?.slot !== slot);

  const choose = async (slot, id, field, value) => {
    if (state.busy) return;
    state.busy = true;
    try {
      await saveWear(id ? [...without(slot), id] : without(slot));
      wardrobeScreen({ field, value });
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      state.busy = false;
    }
  };

  const groups = SLOTS.map((slot) => {
    const pieces = mine.filter((it) => it.slot === slot.id);
    if (!pieces.length) return null;
    const field = `wear-${slot.id}`;
    const current = look.wear.map(itemById).find((it) => it?.slot === slot.id) || null;
    const view = SLOT_VIEW[slot.id];
    const option = (value, name, wearId, checked, extra) => {
      const input = h('input', { type: 'radio', name: field, value, class: 'sr-only' });
      input.checked = checked;
      input.addEventListener('change', () => input.checked && choose(slot.id, wearId, field, value));
      const pic = drawAvatar({ ...look, wear: wearId ? [...without(slot.id), wearId] : without(slot.id) }, owned, { view, label: '' });
      return h('label', { class: `opt${checked ? ' on' : ''}` }, input, pic, h('span', { class: 'opt-name', text: name }), extra ? h('span', { class: 'era', text: extra }) : null);
    };
    const bases = [...new Set(pieces.map((it) => it.base))];
    const opts = [option('none', 'None', null, !current)];
    for (const base of bases) {
      const versions = pieces.filter((it) => it.base === base);
      const on = current?.base === base;
      const shown = on ? current.id : base;
      opts.push(option(base, itemById(base).name, shown, on, versions.length > 1 ? `${versions.length} colours` : null));
    }
    let colours = null;
    const versions = current ? pieces.filter((it) => it.base === current.base) : [];
    if (versions.length > 1) {
      const cfield = `wear-color-${slot.id}`;
      colours = h(
        'div',
        { class: 'opts swatches', role: 'radiogroup', 'aria-label': `${itemById(current.base).name} colour` },
        versions.map((v) => {
          const input = h('input', { type: 'radio', name: cfield, value: v.id, class: 'sr-only' });
          input.checked = v.id === current.id;
          input.addEventListener('change', () => input.checked && choose(slot.id, v.id, cfield, v.id));
          const sw = h('span', { class: 'swatch', 'aria-hidden': 'true' });
          sw.style.background = colorHex(v.color) || '#ffffff';
          const colourName = colorName(v.color) || 'Colour';
          return h('label', { class: `opt sw${input.checked ? ' on' : ''}`, title: colourName }, input, sw, h('span', { class: 'sr-only', text: colourName }));
        }),
      );
    }
    return h('fieldset', { class: 'look-group' }, h('legend', { text: slot.name }), h('div', { class: 'opts thumbs' }, opts), colours);
  });

  const rewardCount = REWARD_ITEMS.filter((it) => owned.includes(it.id)).length;
  const colourCount = mine.filter((it) => it.kind === 'reward' && it.id !== it.base).length;
  const progress =
    rewardCount < REWARD_ITEMS.length
      ? `You have ${rewardCount} of ${REWARD_ITEMS.length} pieces. Finish a commission with 3 or more right to earn the next one.`
      : `You have all ${REWARD_ITEMS.length} pieces and ${colourCount} colour versions. Each good commission adds a new colour.`;
  const locked = SKILL_ITEMS.filter((i) => i.skill && !owned.includes(i.id));

  show(
    h('div', { class: 'topbar' }, h('button', { class: 'ghost', text: '← Back', onclick: homeScreen }), h('h2', { text: 'Wardrobe' }), h('span')),
    h('div', { class: 'card avatar-wrap look-preview' }, avatar()),
    h('button', { class: 'primary', text: '🪞 Change my look', onclick: () => lookScreen() }),
    h('p', { class: 'muted small', text: progress }),
    msg,
    groups,
    locked.length
      ? h(
          'div',
          { class: 'card stack' },
          h('h3', { text: 'Skill pieces' }),
          h('div', { class: 'items' }, locked.map((i) => h('div', { class: 'item locked' }, h('strong', { text: i.name }), h('span', { class: 'muted', text: `Reach ${Math.round(i.threshold * 100)}% in ${names[i.skill]}` })))),
        )
      : null,
  );
  if (focus) app.querySelector(`input[name="${focus.field}"][value="${focus.value}"]`)?.focus();
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
