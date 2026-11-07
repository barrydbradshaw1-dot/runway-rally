// Teacher console. Reads /api/admin/class/:code with the admin token (kept in sessionStorage only).
const root = document.getElementById('admin');

// A Brightspace launch hands over a signed teacher session in the URL fragment; it is scoped to that one course.
const fromLti = /^#lti=([A-Za-z0-9_.-]{20,2000})$/.exec(location.hash);
if (fromLti) {
  try {
    sessionStorage.setItem('rr_lti', fromLti[1]);
  } catch {
    /* memory only */
  }
  history.replaceState(null, '', location.pathname);
}
let ltiSession = fromLti ? fromLti[1] : (() => {
  try {
    return sessionStorage.getItem('rr_lti') || '';
  } catch {
    return '';
  }
})();
const authHeaders = () => (ltiSession ? { 'x-lti-session': ltiSession } : { 'x-admin-token': state.token });

const state = {
  code: sessionStorage.getItem('rr_code') || '',
  token: sessionStorage.getItem('rr_admin') || '',
  data: null,
  fetchedAt: null,
  sort: 'attention',
  timer: null,
};

const AREA_LABELS = { jewelry_bench: 'Jewelry Bench', pattern_table: 'Pattern Table', runway: 'Runway', cards: 'Cards', story: 'Story', wardrobe: 'Wardrobe' };

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

function show(...nodes) {
  root.replaceChildren(...nodes.flat().filter(Boolean));
}

async function fetchClass() {
  const res = await fetch(`/api/admin/class/${encodeURIComponent(state.code)}`, { headers: authHeaders() });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = ltiSession && res.status === 401 ? 'Your session expired. Open Runway Rally again from your course in Brightspace.' : res.status === 403 ? 'That admin token is not right.' : res.status === 503 ? 'Admin access is not set up on the server yet (ADMIN_TOKEN).' : body.error || 'Could not load the class.';
    throw new Error(msg);
  }
  return body;
}

function loginScreen(msg = '') {
  clearInterval(state.timer);
  const code = h('input', { type: 'text', id: 'code', autocomplete: 'off', autocapitalize: 'characters', maxlength: 20, value: state.code, placeholder: 'Example: MATH-7A' });
  const token = h('input', { type: 'password', id: 'token', autocomplete: 'off', placeholder: 'Admin token' });
  const err = h('p', { class: 'error', role: 'alert', text: msg });
  const go = h('button', { class: 'primary', type: 'submit', text: 'Open my class' });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        go.disabled = true;
        state.code = code.value.trim().toUpperCase();
        state.token = token.value;
        try {
          state.data = await fetchClass();
          state.fetchedAt = new Date();
          sessionStorage.setItem('rr_code', state.code);
          sessionStorage.setItem('rr_admin', state.token);
          dashboard();
        } catch (ex) {
          err.textContent = ex.message;
          go.disabled = false;
        }
      },
    },
    h('label', {}, 'Class code', code),
    h('label', {}, 'Admin token', token),
    err,
    go,
  );
  show(h('div', { class: 'login stack' }, h('h1', { text: 'Teacher console' }), h('p', { class: 'muted', text: 'See who is learning, who is stuck, and where to pull a small group.' }), h('div', { class: 'card' }, form)));
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (m) => `${Math.round(m * 100)}%`;
const cls = (m, started) => (!started ? 'none' : m < 0.35 ? 'low' : m < 0.6 ? 'mid' : 'high');

function sortedStudents(list, skillIds) {
  const arr = list.slice();
  if (state.sort === 'name') arr.sort((a, b) => a.nickname.localeCompare(b.nickname));
  else if (state.sort === 'lowest') arr.sort((a, b) => avg(skillIds.map((k) => a.mastery[k])) - avg(skillIds.map((k) => b.mastery[k])));
  else arr.sort((a, b) => b.needsHelpWith.length - a.needsHelpWith.length || a.nickname.localeCompare(b.nickname));
  return arr;
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from running a nickname as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const { students, skills } = state.data;
  const ids = Object.keys(skills);
  const rows = [['Nickname', 'Answered', 'Accuracy %', 'Commissions', ...ids.map((k) => `${skills[k]} mastery %`), ...ids.map((k) => `${skills[k]} answered`), 'Favorite areas', 'Needs help with']];
  for (const s of sortedStudents(students, ids)) {
    rows.push([s.nickname, s.answered, s.accuracy ?? '', s.commissions, ...ids.map((k) => ((s.attempts?.[k] ?? 0) > 0 ? Math.round(s.mastery[k] * 100) : '')), ...ids.map((k) => s.attempts?.[k] ?? 0), s.topAreas.map((a) => AREA_LABELS[a] || a).join('; '), s.needsHelpWith.map((k) => skills[k]).join('; ')]);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `runway-rally-${state.data.classCode}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function dashboard() {
  const { students, skills, classCode, title, roster } = state.data;
  const rosterLine = roster && !roster.error ? `${roster.launched} of ${roster.enrolled} enrolled students have opened Runway Rally${roster.notLaunched ? ` · ${roster.notLaunched} have not yet` : ''}` : roster?.error ? 'Course roster is unavailable right now' : '';
  const ids = Object.keys(skills);
  const started = students.filter((s) => s.answered > 0);
  const accs = started.map((s) => s.accuracy).filter((a) => a !== null);
  const needHelp = students.filter((s) => s.needsHelpWith.length);

  const refresh = h('button', { text: 'Refresh', onclick: reload });
  const csv = h('button', { text: 'Export CSV', onclick: exportCsv, disabled: !students.length });
  const out = h('button', { class: 'ghost', text: 'Sign out', onclick: signOut });
  const sort = h(
    'select',
    { id: 'sort', 'aria-label': 'Sort students', onchange: (e) => { state.sort = e.target.value; dashboard(); } },
    h('option', { value: 'attention', text: 'Needs help first', selected: state.sort === 'attention' }),
    h('option', { value: 'lowest', text: 'Lowest average mastery', selected: state.sort === 'lowest' }),
    h('option', { value: 'name', text: 'Name A to Z', selected: state.sort === 'name' }),
  );

  const groups = ids
    .map((k) => ({ k, who: students.filter((s) => s.needsHelpWith.includes(k)).map((s) => s.nickname) }))
    .filter((g) => g.who.length);

  const notStarted = students.filter((s) => s.answered === 0).map((s) => s.nickname);

  const table = h(
    'table',
    {},
    h('thead', {}, h('tr', {}, h('th', { text: 'Student' }), ids.map((k) => h('th', { text: skills[k] })), h('th', { text: 'Accuracy' }), h('th', { text: 'Commissions' }), h('th', { text: 'Favorite areas' }))),
    h(
      'tbody',
      {},
      sortedStudents(students, ids).map((s) =>
        h(
          'tr',
          {},
          h('td', { text: s.nickname }),
          ids.map((k) => {
            const m = s.mastery[k];
            const tried = (s.attempts?.[k] ?? 0) > 0;
            const flagged = s.needsHelpWith.includes(k);
            return h('td', { class: `cell ${cls(m, tried)}` }, tried ? pct(m) : '—', h('span', { class: 'sub', text: !tried ? 'not tried' : flagged ? 'needs support' : `${s.attempts[k]} answered` }));
          }),
          h('td', { text: s.accuracy === null ? '—' : `${s.accuracy}%` }),
          h('td', { text: String(s.commissions) }),
          h('td', { text: s.topAreas.length ? s.topAreas.map((a) => AREA_LABELS[a] || a).join(', ') : '—' }),
        ),
      ),
    ),
  );

  show(
    h('div', { class: 'head' }, h('div', {}, h('h1', { text: title ? title : `Class ${classCode}` }), rosterLine ? h('p', { class: 'stamp', text: rosterLine }) : null, h('p', { class: 'stamp', text: `Updated ${state.fetchedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · refreshes every 30 seconds` })), h('div', { class: 'actions' }, refresh, csv, out)),
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(students.length) }), h('div', { class: 'l', text: 'Students joined' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(started.length) }), h('div', { class: 'l', text: 'Have played' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: accs.length ? `${Math.round(avg(accs))}%` : '—' }), h('div', { class: 'l', text: 'Average accuracy' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(students.reduce((a, s) => a + s.commissions, 0)) }), h('div', { class: 'l', text: 'Commissions finished' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(needHelp.length) }), h('div', { class: 'l', text: 'Need support' })),
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'g-h' },
      h('h2', { id: 'g-h', text: 'Suggested small groups' }),
      groups.length
        ? h('div', { class: 'groups' }, groups.map((g) => h('div', { class: 'group' }, h('div', { class: 'skill', text: skills[g.k] }), h('div', { class: 'muted', text: g.who.length > 1 ? `Group of ${g.who.length}` : '1:1 check-in' }), h('div', { class: 'names' }, g.who.map((n) => h('span', { class: 'chip warn', text: n }))))))
        : h('p', { class: 'empty', text: started.length ? 'No one needs extra support right now.' : 'Groups appear once students start playing.' }),
      h('p', { class: 'muted', text: 'A student is flagged on a skill after 2 or more answers with mastery still under 40%, or 3 misses in a row. Skills not yet tried are never flagged.' }),
      notStarted.length ? h('div', {}, h('p', { class: 'muted', text: 'Not started yet' }), h('div', { class: 'names' }, notStarted.map((n) => h('span', { class: 'chip idle', text: n })))) : null,
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'm-h' },
      h('div', { class: 'toolbar' }, h('h2', { id: 'm-h', text: 'Mastery by skill' }), sort),
      students.length ? h('div', { class: 'tablewrap' }, table) : h('p', { class: 'empty', text: title ? 'No students have opened Runway Rally yet. They launch it from your Brightspace course.' : `No students have joined ${classCode} yet. Share the class code with your class.` }),
      h('div', { class: 'legend' }, h('span', { class: 'l1', text: 'Below 35%' }), h('span', { class: 'l2', text: '35% to 59%' }), h('span', { class: 'l3', text: '60% and up' }), h('span', { text: 'Percentages are shown in every cell, not just color' })),
    ),
  );

  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (!document.hidden) reload(true);
  }, 30000);
}

async function reload(quiet = false) {
  try {
    state.data = await fetchClass();
    state.fetchedAt = new Date();
    dashboard();
  } catch (e) {
    if (!quiet) alert(e.message);
  }
}

function signOut() {
  if (ltiSession) {
    try {
      sessionStorage.removeItem('rr_lti');
    } catch {
      /* ignore */
    }
    ltiSession = '';
    state.data = null;
    return show(h('div', { class: 'card' }, h('p', { text: 'Signed out. Open Runway Rally again from your course in Brightspace.' })));
  }
  sessionStorage.removeItem('rr_admin');
  state.token = '';
  state.data = null;
  loginScreen();
}

if (ltiSession) {
  fetch('/api/admin/me', { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Your session expired. Open Runway Rally again from your course in Brightspace.'))))
    .then((me) => {
      state.code = me.classCode;
      return fetchClass();
    })
    .then((d) => {
      state.data = d;
      state.fetchedAt = new Date();
      dashboard();
    })
    .catch((e) => show(h('div', { class: 'card' }, h('p', { text: e.message }))));
} else if (state.code && state.token) {
  fetchClass()
    .then((d) => {
      state.data = d;
      state.fetchedAt = new Date();
      dashboard();
    })
    .catch((e) => loginScreen(e.message));
} else loginScreen();
