// Teacher console. A teacher signs in with their own key (kept in sessionStorage only); the server owner uses ADMIN_TOKEN.
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
// The time zone goes along so "this week" and "last played" follow the teacher's clock.
const authHeaders = () => ({ ...(ltiSession ? { 'x-lti-session': ltiSession } : { 'x-admin-token': state.token }), 'x-tz-offset': String(new Date().getTimezoneOffset()) });

const state = {
  me: null,
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

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { ...authHeaders(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let out = {};
  try {
    out = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = ltiSession && res.status === 401 ? 'Your session expired. Open Runway Rally again from your course in Brightspace.' : res.status === 503 ? 'Admin access is not set up on the server yet (ADMIN_TOKEN).' : out.error || 'Something went wrong.';
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return out;
}

const PRIVACY = '/privacy/';
const policyLink = (text = 'privacy policy') => h('a', { href: PRIVACY, target: '_blank', rel: 'noopener', text });
const AGREE_TEXT = 'My school has approved Runway Rally for this class, and I have read the privacy policy.';

// Download a file the server sends (one student's data) with the teacher's sign-in.
async function download(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    let msg = 'Could not download.';
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'runway-rally-student.json';
  const a = h('a', { href: URL.createObjectURL(await res.blob()), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fmtDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '');

async function fetchClass() {
  const res = await fetch(`/api/admin/class/${encodeURIComponent(state.code)}`, { headers: authHeaders() });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = ltiSession && res.status === 401 ? 'Your session expired. Open Runway Rally again from your course in Brightspace.' : res.status === 403 ? 'You do not have access to that class.' : res.status === 503 ? 'Admin access is not set up on the server yet (ADMIN_TOKEN).' : body.error || 'Could not load the class.';
    throw new Error(msg);
  }
  return body;
}

function loginScreen(msg = '') {
  clearInterval(state.timer);
  const token = h('input', { type: 'password', id: 'token', autocomplete: 'off', placeholder: 'Your teacher key' });
  const err = h('p', { class: 'error', role: 'alert', text: msg });
  const go = h('button', { class: 'primary', type: 'submit', text: 'Sign in' });
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        go.disabled = true;
        state.token = token.value.trim();
        try {
          state.me = await api('/api/admin/me');
          sessionStorage.setItem('rr_admin', state.token);
          await classesScreen();
        } catch (ex) {
          err.textContent = ex.status === 403 ? 'That key is not right. Ask whoever runs Runway Rally for a new one.' : ex.message;
          go.disabled = false;
        }
      },
    },
    h('label', {}, 'Teacher key', token),
    h('p', { class: 'muted', text: 'Each teacher has their own key. Whoever runs Runway Rally for your school can give you one.' }),
    err,
    go,
  );
  show(h('div', { class: 'login stack' }, h('h1', { text: 'Teacher console' }), h('p', { class: 'muted', text: 'See who is learning, who is stuck, and where to pull a small group.' }), h('div', { class: 'card' }, form), h('p', { class: 'muted' }, policyLink('Privacy policy'))));
}

function retentionNote() {
  const r = state.me?.retention;
  if (!r) return null;
  const parts = [];
  if (r.answerDays) parts.push(`answer history older than ${r.answerDays} days`);
  if (r.inactiveDays) parts.push(`students who have not played for ${r.inactiveDays} days`);
  if (r.classEndDays !== undefined) parts.push(`classes ${r.classEndDays} days after their end date, with all their students`);
  return parts.length ? h('p', { class: 'muted', text: `Deleted automatically: ${parts.join('; ')}.` }) : null;
}

async function classesScreen(notice = '') {
  clearInterval(state.timer);
  state.data = null;
  const owner = state.me?.kind === 'owner';
  const [{ classes }, teachers] = await Promise.all([api('/api/admin/classes'), owner ? api('/api/admin/teachers').then((r) => r.teachers) : Promise.resolve([])]);
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || '';

  const err = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Example: Period 3 Math', required: true });
  const ends = h('input', { type: 'date' });
  const agree = h('input', { type: 'checkbox', required: true });
  const legacy = owner ? h('input', { type: 'text', maxlength: 20, autocapitalize: 'characters', placeholder: 'Leave empty for a new code' }) : null;
  const who = owner ? h('select', {}, h('option', { value: '', text: 'No teacher yet' }), teachers.map((t) => h('option', { value: t.id, text: t.name }))) : null;
  const make = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const body = { name: name.value, endsOn: ends.value || null, agree: agree.checked };
          if (legacy?.value.trim()) body.code = legacy.value.trim().toUpperCase();
          if (who?.value) body.teacherId = who.value;
          const r = await api('/api/admin/classes', { method: 'POST', body });
          await classesScreen(`Class created. Share this code with your class: ${r.class.code}`);
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('label', {}, 'Class name', name),
    h('label', {}, 'Last day of class (optional)', ends),
    owner ? h('label', {}, 'Code students already use (owner only)', legacy) : null,
    owner ? h('label', {}, 'Teacher', who) : null,
    h('label', { class: 'check' }, agree, h('span', {}, 'My school has approved Runway Rally for this class, and I have read the ', policyLink(), '.')),
    err,
    h('button', { class: 'primary', type: 'submit', text: 'Create class' }),
  );

  const rows = classes.map((c) => {
    const assign = owner && c.kind === 'manual'
      ? h('select', { 'aria-label': `Teacher for ${c.code}`, onchange: async (e) => { await api(`/api/admin/class/${encodeURIComponent(c.code)}`, { method: 'PATCH', body: { teacherId: e.target.value || null } }); } }, h('option', { value: '', text: 'No teacher' }), teachers.map((t) => h('option', { value: t.id, text: t.name, selected: t.id === c.teacherId })))
      : null;
    const register = owner && c.kind === 'unregistered' ? h('button', { text: 'Let students join', onclick: async () => { if (!confirm(AGREE_TEXT)) return; await api('/api/admin/classes', { method: 'POST', body: { name: c.code, code: c.code, agree: true } }); classesScreen(`Students can join ${c.code} again.`); } }) : null;
    const approve = c.kind === 'manual' && !c.authorizedAt ? h('button', { text: 'Confirm approval', onclick: () => confirmApproval(c.code).then((ok) => ok && classesScreen(`Thanks. ${c.name || c.code} is confirmed.`)).catch((e) => alert(e.message)) }) : null;
    return h(
      'tr',
      {},
      h('td', { text: c.name || c.code }),
      h('td', { class: 'mono', text: c.code }),
      h('td', { text: c.students ?? '' }),
      h('td', { text: [c.kind === 'unregistered' ? 'Not registered, so no one new can join' : c.endsOn ? `Ends ${fmtDay(c.endsOn)}` : c.kind === 'lti' ? 'Brightspace course' : 'No end date', c.kind === 'manual' && !c.joinOpen ? 'closed to new students' : null, c.kind === 'manual' && !c.authorizedAt ? 'school approval not confirmed' : null].filter(Boolean).join(' · ') }),
      owner ? h('td', {}, assign || (c.teacherId ? teacherName(c.teacherId) : '')) : null,
      h('td', {}, h('button', { text: 'Open', onclick: () => openClass(c.code) }), register, approve),
    );
  });

  const teacherPanel = owner
    ? (() => {
        const tName = h('input', { type: 'text', maxlength: 60, placeholder: "Teacher's name", required: true });
        const tErr = h('p', { class: 'error', role: 'alert' });
        const keyBox = (label, key) => h('div', { class: 'notice' }, h('p', { text: label }), h('p', { class: 'mono key', text: key }), h('p', { class: 'muted', text: 'Copy it now and give it to the teacher privately. It will not be shown again.' }));
        const slot = h('div');
        return h(
          'section',
          { class: 'panel', 'aria-labelledby': 't-h' },
          h('h2', { id: 't-h', text: 'Teachers' }),
          h('p', { class: 'muted', text: 'Each teacher signs in with their own key and sees only their own classes. Keep the admin token to yourself.' }),
          slot,
          teachers.length
            ? h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, h('th', { text: 'Name' }), h('th', { text: 'Classes' }), h('th', { text: '' }))), h('tbody', {}, teachers.map((t) => h('tr', {}, h('td', { text: t.name }), h('td', { text: String(t.classes ?? 0) }), h('td', {},
                h('button', { text: 'New key', onclick: async () => { if (!confirm(`Give ${t.name} a new key? Their old key stops working.`)) return; const r = await api(`/api/admin/teachers/${t.id}/key`, { method: 'POST' }); slot.replaceChildren(keyBox(`New key for ${t.name}:`, r.key)); } }),
                h('button', { class: 'ghost', text: 'Remove', onclick: async () => { if (!confirm(`Remove ${t.name}? Their key stops working. Their classes and students stay, and you can give the classes to another teacher.`)) return; await api(`/api/admin/teachers/${t.id}`, { method: 'DELETE' }); classesScreen(`${t.name} was removed.`); } }),
              ))))))
            : h('p', { class: 'empty', text: 'No teachers yet.' }),
          h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { const r = await api('/api/admin/teachers', { method: 'POST', body: { name: tName.value } }); await classesScreen(); document.querySelector('#t-h')?.parentElement.querySelector('div')?.replaceChildren(keyBox(`Key for ${r.teacher.name}:`, r.key)); } catch (ex) { tErr.textContent = ex.message; } } }, tName, h('button', { class: 'primary', type: 'submit', text: 'Add teacher' })),
          tErr,
        );
      })()
    : null;

  show(
    h('div', { class: 'head' }, h('div', {}, h('h1', { text: owner ? 'All classes' : 'Your classes' }), state.me?.name ? h('p', { class: 'stamp', text: `Signed in as ${state.me.name}` }) : null), h('div', { class: 'actions' }, h('button', { class: 'ghost', text: 'Sign out', onclick: signOut }))),
    notice ? h('div', { class: 'notice', role: 'status' }, h('p', { text: notice })) : null,
    h('section', { class: 'panel', 'aria-labelledby': 'c-h' }, h('h2', { id: 'c-h', text: 'Classes' }), classes.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, h('th', { text: 'Name' }), h('th', { text: 'Code' }), h('th', { text: 'Students' }), h('th', { text: 'Status' }), owner ? h('th', { text: 'Teacher' }) : null, h('th', { text: '' }))), h('tbody', {}, rows))) : h('p', { class: 'empty', text: 'No classes yet. Create one below and share its code with your students.' })),
    h('section', { class: 'panel', 'aria-labelledby': 'n-h' }, h('h2', { id: 'n-h', text: 'Create a class' }), h('p', { class: 'muted', text: 'Runway Rally makes a code students type to join, like K7QM-4XPA. Only codes made here work.' }), make),
    teacherPanel,
    h('section', { class: 'panel' }, h('h2', { text: 'How long data is kept' }), retentionNote(), h('p', { class: 'muted' }, 'Read the full ', policyLink(), '.')),
  );
}

async function openClass(code) {
  state.code = code;
  try {
    sessionStorage.setItem('rr_code', code);
  } catch {
    /* ignore */
  }
  try {
    state.data = await fetchClass();
    state.fetchedAt = new Date();
    dashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function confirmApproval(code) {
  if (!confirm(AGREE_TEXT)) return false;
  await api(`/api/admin/class/${encodeURIComponent(code)}`, { method: 'PATCH', body: { agree: true } });
  return true;
}

async function renameStudent(s) {
  const nickname = prompt(`New nickname for ${s.nickname} (not a real name):`, '');
  if (!nickname) return;
  try {
    await api(`/api/admin/class/${encodeURIComponent(state.code)}/student/${s.id}`, { method: 'PATCH', body: { nickname } });
    await reload();
  } catch (e) {
    alert(e.message);
  }
}

async function setSpanishFirst(s) {
  try {
    await api(`/api/admin/class/${encodeURIComponent(state.code)}/student/${s.id}`, { method: 'PATCH', body: { spanishFirst: !s.spanishFirst } });
    await reload();
  } catch (e) {
    alert(e.message);
  }
}

async function newSignInCode(s) {
  if (!confirm(`Make a new sign-in code for ${s.nickname}? Their old code stops working. Use this when they lost theirs.`)) return;
  try {
    const r = await api(`/api/admin/class/${encodeURIComponent(state.code)}/student/${s.id}/sign-in-code`, { method: 'POST' });
    prompt(`New sign-in code for ${r.nickname}. Give it to them, and they tap "Played before? Use your sign-in code".`, r.recoveryCode);
  } catch (e) {
    alert(e.message);
  }
}

async function exportStudent(s) {
  try {
    await download(`/api/admin/class/${encodeURIComponent(state.code)}/student/${s.id}/export`);
  } catch (e) {
    alert(e.message);
  }
}

async function deleteStudent(s) {
  if (!confirm(`Delete ${s.nickname} and everything they have done in Runway Rally? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/class/${encodeURIComponent(state.code)}/student/${s.id}`, { method: 'DELETE' });
    await reload();
  } catch (e) {
    alert(e.message);
  }
}

function managePanel() {
  const { classCode, endsOn, kind, joinOpen, authorizedAt, spanish } = state.data;
  const toggle = h('button', {
    text: joinOpen ? 'Close to new students' : 'Open to new students',
    onclick: async () => {
      try {
        await api(`/api/admin/class/${encodeURIComponent(classCode)}`, { method: 'PATCH', body: { joinOpen: !joinOpen } });
        await reload();
      } catch (e) {
        alert(e.message);
      }
    },
  });
  const joining = kind === 'manual'
    ? h('div', { class: 'row' }, h('p', { text: joinOpen ? 'New students can join with the class code.' : 'Closed: no one new can join. Students already in the class keep playing.' }), toggle)
    : null;
  // Spanish help: a "Ver en español" button on each problem, Spanish read-aloud and Spanish hints.
  const spanishToggle = h('button', {
    text: spanish ? 'Turn off Spanish help' : 'Turn on Spanish help',
    onclick: async () => {
      try {
        await api(`/api/admin/class/${encodeURIComponent(classCode)}`, { method: 'PATCH', body: { spanish: !spanish } });
        await reload();
      } catch (e) {
        alert(e.message);
      }
    },
  });
  const spanishRow = kind !== 'unregistered'
    ? h(
        'div',
        { class: 'row' },
        h('p', {
          text: spanish
            ? 'Spanish help is on: students see a "Ver en español" button on each problem, with Spanish hints and read-aloud. The English stays on screen.'
            : 'Spanish help is off. Turn it on to give students a "Ver en español" button on each problem, for English learners.',
        }),
        spanishToggle,
      )
    : null;
  const approval = kind === 'manual'
    ? authorizedAt
      ? h('p', { class: 'muted', text: `School approval confirmed ${new Date(authorizedAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}.` })
      : h('div', { class: 'row' }, h('p', { text: 'Please confirm your school has approved Runway Rally for this class.' }), h('button', { text: 'Confirm approval', onclick: () => confirmApproval(classCode).then((ok) => ok && reload()).catch((e) => alert(e.message)) }))
    : null;
  const typed = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: classCode, 'aria-label': 'Type the class code to confirm' });
  const del = h('button', { class: 'danger', text: 'Delete this class', disabled: true });
  typed.addEventListener('input', () => { del.disabled = typed.value.trim().toUpperCase() !== classCode; });
  del.addEventListener('click', async () => {
    try {
      const r = await api(`/api/admin/class/${encodeURIComponent(classCode)}`, { method: 'DELETE', body: { confirm: classCode } });
      if (ltiSession) return show(h('div', { class: 'card' }, h('p', { text: `Deleted ${r.deleted === 1 ? '1 student' : r.deleted + ' students'} and their answers.` })));
      await classesScreen(`Class ${classCode} was deleted with ${r.deleted === 1 ? '1 student' : r.deleted + ' students'} and all their answers.`);
    } catch (e) {
      alert(e.message);
    }
  });
  const end = h('input', { type: 'date', value: endsOn || '' });
  const save = h('button', { text: 'Save end date', onclick: async () => { try { await api(`/api/admin/class/${encodeURIComponent(classCode)}`, { method: 'PATCH', body: { endsOn: end.value || null } }); await reload(); } catch (e) { alert(e.message); } } });
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'd-h' },
    h('h2', { id: 'd-h', text: 'Class data' }),
    joining,
    spanishRow,
    kind === 'manual' ? h('div', { class: 'row' }, h('label', {}, 'Last day of class', end), save) : null,
    approval,
    retentionNote(),
    h('p', { class: 'muted', text: "Download data on a student's row gives everything kept about that student, for a parent's request to see it. Rename fixes a nickname that is unkind or is a real name. New sign-in code helps a student who lost theirs. With Spanish help on, Spanish first shows that student every problem in Spanish (English under it) from the start, with no tap; they can still switch." }),
    h('p', { class: 'muted', text: `To delete everything for this class, type ${classCode} and press Delete. Every student in it and all their answers are removed for good.` }),
    h('div', { class: 'row' }, typed, del),
  );
}

// ---------- homework practice: the teacher's own assignments as commissions ----------
const classPath = () => `/api/admin/class/${encodeURIComponent(state.code)}`;

function homeworkPanel() {
  const { assignments = [], homework = {} } = state.data;
  const setLive = async (a, live) => {
    try {
      await api(`${classPath()}/assignments/${a.id}`, { method: 'PATCH', body: { live } });
      await reload();
    } catch (e) {
      alert(e.message);
    }
  };
  const remove = async (a) => {
    if (!confirm(`Delete "${a.title}"? Students who are partway through it can still finish.`)) return;
    try {
      await api(`${classPath()}/assignments/${a.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      alert(e.message);
    }
  };
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'hw-h' },
    h('div', { class: 'toolbar' }, h('h2', { id: 'hw-h', text: 'Homework practice' }), h('button', { class: 'primary', text: 'Add an assignment', onclick: () => assignmentScreen(null) })),
    h('p', {
      class: 'muted',
      text: homework.photos
        ? 'Turn your own assignment into a commission: take a photo of a blank copy, or type the problems in. You check every problem and answer before students see it.'
        : 'Turn your own assignment into a commission by typing the problems in. You check every problem and answer before students see it.',
    }),
    assignments.length
      ? h(
          'div',
          { class: 'tablewrap' },
          h(
            'table',
            { class: 'plain' },
            h('thead', {}, h('tr', {}, h('th', { text: 'Assignment' }), h('th', { text: 'Problems' }), h('th', { text: 'Students see it' }), h('th', { text: '' }))),
            h(
              'tbody',
              {},
              assignments.map((a) =>
                h(
                  'tr',
                  {},
                  h('td', { text: a.title }),
                  h('td', { text: String(a.problems.length) }),
                  h('td', {}, h('span', { class: a.live ? 'chip' : 'chip idle', text: a.live ? 'Yes' : 'Hidden' })),
                  h(
                    'td',
                    { class: 'rowactions' },
                    h('button', { class: 'ghost small', text: a.live ? 'Hide' : 'Show to students', onclick: () => setLive(a, !a.live) }),
                    h('button', { class: 'ghost small', text: 'Edit', onclick: () => assignmentScreen(a) }),
                    h('button', { class: 'ghost small', text: 'Delete', 'aria-label': `Delete ${a.title}`, onclick: () => remove(a) }),
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'empty', text: 'No assignments yet.' }),
  );
}

// Shrinks a photo in the browser before it is sent (about 1,600 pixels on the long side is plenty to read).
function shrinkPhoto(file, max = 1600) {
  return new Promise((resolveP, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolveP(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be opened as a picture.'));
    };
    img.src = url;
  });
}

function assignmentScreen(existing) {
  clearInterval(state.timer); // the class page refreshes itself; this screen must not be wiped mid-edit
  const { skills, skillInfo = {}, homework = {} } = state.data;
  const draft = existing
    ? { title: existing.title, live: existing.live, problems: existing.problems.map((p) => ({ ...p, hints: [...(p.hints || [])], flag: null })) }
    : { title: '', live: false, problems: [] };
  const skillIds = Object.keys(skills).sort((a, b) => (skillInfo[a]?.grade ?? 0) - (skillInfo[b]?.grade ?? 0));
  const blank = () => ({ prompt: '', answer: '', skill: '', hints: ['', '', ''], flag: null });
  if (!draft.problems.length) draft.problems.push(blank());

  const list = h('div', { class: 'stack' });
  const found = h('div', { class: 'stack' });
  const err = h('p', { class: 'error', role: 'alert' });

  function problemCard(p, k) {
    const prompt = h('textarea', { rows: '2', maxlength: '400', 'aria-label': `Problem ${k + 1} question` });
    prompt.value = p.prompt;
    prompt.addEventListener('input', () => (p.prompt = prompt.value));
    const answer = h('input', { type: 'text', maxlength: '20', inputmode: 'decimal', placeholder: '12, -3, 4.5 or 3/4', 'aria-label': `Problem ${k + 1} answer` });
    answer.value = p.answer;
    answer.addEventListener('input', () => (p.answer = answer.value));
    const skill = h(
      'select',
      { 'aria-label': `Problem ${k + 1} skill` },
      h('option', { value: '', text: 'Pick the skill…' }),
      skillIds.map((id) => h('option', { value: id, text: `${skills[id]}${skillInfo[id] ? ` (grade ${skillInfo[id].grade})` : ''}`, selected: p.skill === id })),
    );
    skill.addEventListener('change', () => (p.skill = skill.value));
    const hints = [0, 1, 2].map((j) => {
      const inp = h('input', { type: 'text', maxlength: '200', placeholder: j === 2 ? 'Last hint: gives the answer (filled in if blank)' : `Hint ${j + 1} (optional)`, 'aria-label': `Problem ${k + 1} hint ${j + 1}` });
      inp.value = p.hints[j] || '';
      inp.addEventListener('input', () => (p.hints[j] = inp.value));
      return inp;
    });
    return h(
      'div',
      { class: 'problem' },
      h(
        'div',
        { class: 'toolbar' },
        h('strong', { text: `Problem ${k + 1}` }),
        p.flag ? h('span', { class: 'chip warn', text: p.flag }) : null,
        h('button', {
          class: 'ghost small',
          text: 'Remove',
          onclick: () => {
            draft.problems.splice(k, 1);
            renderList();
          },
        }),
      ),
      h('label', {}, 'Question', prompt),
      h('div', { class: 'row' }, h('label', {}, 'Answer', answer), h('label', { class: 'grow' }, 'Skill it practices', skill)),
      h('details', {}, h('summary', { text: 'Hints (students see them one at a time)' }), h('div', { class: 'stack' }, hints)),
    );
  }
  function renderList() {
    list.replaceChildren(...draft.problems.map(problemCard));
  }

  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoBtn = h('button', { text: '📷 Read a photo of the assignment', onclick: () => photoInput.click() });
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    photoBtn.disabled = true;
    photoBtn.textContent = 'Reading the photo…';
    found.replaceChildren();
    try {
      const image = await shrinkPhoto(file);
      const r = await api(`${classPath()}/homework/read`, { method: 'POST', body: { image } });
      // drop the empty starter problem, then add what was read
      draft.problems = draft.problems.filter((p) => p.prompt.trim() || p.answer.trim());
      draft.problems.push(...r.problems);
      renderList();
      found.replaceChildren(
        ...[
          h('p', { class: 'notice', text: r.problems.length ? `Found ${r.problems.length} ${r.problems.length === 1 ? 'problem' : 'problems'}. Check each question, answer and skill below. Ones with a note need a closer look.` : 'No problems with a single-number answer were found on that photo.' }),
          r.note ? h('p', { class: 'muted', text: r.note }) : null,
          r.skipped.length
            ? h('details', {}, h('summary', { text: `${r.skipped.length} left out (they need words, a drawing or more than one answer)` }), h('ul', {}, r.skipped.map((s) => h('li', { text: `${s.text}: ${s.reason}` }))))
            : null,
        ].filter(Boolean),
      );
    } catch (e) {
      found.replaceChildren(h('p', { class: 'error', text: e.message }));
    }
    photoBtn.disabled = false;
    photoBtn.textContent = '📷 Read a photo of the assignment';
  });

  const title = h('input', { type: 'text', maxlength: '60', placeholder: 'Tuesday homework, page 42', 'aria-label': 'Assignment name' });
  title.value = draft.title;
  title.addEventListener('input', () => (draft.title = title.value));
  const live = h('input', { type: 'checkbox', id: 'hw-live', checked: draft.live });
  live.addEventListener('change', () => (draft.live = live.checked));

  const save = h('button', {
    class: 'primary',
    text: existing ? 'Save changes' : 'Save assignment',
    onclick: async () => {
      err.textContent = '';
      save.disabled = true;
      const body = { title: draft.title, live: draft.live, problems: draft.problems.map(({ prompt, answer, skill, hints }) => ({ prompt, answer, skill, hints })) };
      try {
        if (existing) await api(`${classPath()}/assignments/${existing.id}`, { method: 'PUT', body });
        else await api(`${classPath()}/assignments`, { method: 'POST', body });
        await reload();
      } catch (e) {
        err.textContent = e.message;
        save.disabled = false;
      }
    },
  });

  renderList();
  show(
    h('div', { class: 'head' }, h('h1', { text: existing ? 'Edit assignment' : 'Add an assignment' }), h('div', { class: 'actions' }, h('button', { class: 'ghost', text: 'Back to the class', onclick: () => reload() }))),
    h(
      'section',
      { class: 'panel hwform' },
      h('label', {}, 'Name students will see', title),
      homework.photos
        ? h(
            'div',
            { class: 'stack' },
            h('div', { class: 'row' }, photoBtn, photoInput),
            h('p', { class: 'muted', text: 'Use a photo of a blank copy, with no student names or work on it. The photo is sent once to our AI provider to find the problems, and is not kept. Only problems with a single-number answer can be practiced.' }),
            found,
          )
        : h('p', { class: 'muted', text: 'Type each problem and its answer. Only problems with a single-number answer (like 12, -3, 4.5 or 3/4) can be practiced.' }),
    ),
    list,
    h('div', { class: 'row' }, h('button', { text: '+ Add a problem', onclick: () => { draft.problems.push(blank()); renderList(); } })),
    h('section', { class: 'panel' }, h('label', { class: 'check', for: 'hw-live' }, live, h('span', { text: 'Students can see it now (you can hide it again anytime)' })), err, h('div', { class: 'row' }, save)),
  );
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (m) => `${Math.round(m * 100)}%`;
const cls = (m, started) => (!started ? 'none' : m < 0.35 ? 'low' : m < 0.6 ? 'mid' : 'high');

function niceDay(iso, lang = 'en') {
  if (!iso) return lang === 'es' ? 'todavía no' : 'not yet';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- weekly reports for families ----------
// Built on request from what is already kept, shown here, then printed or saved as a PDF by the
// teacher. Runway Rally never emails a report and keeps no parent contact details.
const REPORT_TEXT = {
  en: {
    title: 'Weekly math practice report',
    week: (a, b) => `Week of ${a} to ${b}`,
    minutes: 'minutes practiced',
    days: 'days practiced',
    problems: 'problems answered',
    right: 'answered right',
    goal: (n, g) => `Daily goal (${g} problems) met on ${n} of 7 days`,
    dayByDay: 'Day by day',
    problemsShort: 'problems',
    improved: 'Got better this week',
    working: 'Working on now',
    help: 'Could use a hand',
    helpTip: 'Sit together for one round of practice on these and ask for the thinking out loud. That helps more than giving the answer.',
    strong: 'Strong skills',
    none: 'No practice this week yet.',
    atHome: 'How to help at home',
    tips: [
      'Ten to fifteen minutes most days works better than one long session. The daily goal in the game is 10 problems.',
      'Ask your student to explain one problem to you. Explaining it builds understanding.',
      'When a problem is hard, the game shows hints one step at a time. Encourage trying each step before the last hint, which gives the answer.',
    ],
    lastPlayed: (d) => `Last played: ${d}`,
    footer: 'Percentages show how steady a skill is, not a grade. Codes like 7.PAR.3 are Georgia K-12 Mathematics Standards, so you can match them to what is taught in class.',
    from: 'Runway Rally math practice',
  },
  es: {
    title: 'Informe semanal de práctica de matemáticas',
    week: (a, b) => `Semana del ${a} al ${b}`,
    minutes: 'minutos de práctica',
    days: 'días de práctica',
    problems: 'problemas respondidos',
    right: 'respuestas correctas',
    goal: (n, g) => `Meta diaria (${g} problemas) cumplida ${n} de 7 días`,
    dayByDay: 'Día por día',
    problemsShort: 'problemas',
    improved: 'Mejoró esta semana',
    working: 'Practicando ahora',
    help: 'Le vendría bien ayuda',
    helpTip: 'Siéntense juntos para una ronda de práctica en estos temas y pídale que explique su razonamiento en voz alta. Eso ayuda más que darle la respuesta.',
    strong: 'Habilidades fuertes',
    none: 'Todavía no hay práctica esta semana.',
    atHome: 'Cómo ayudar en casa',
    tips: [
      'De diez a quince minutos casi todos los días funciona mejor que una sesión larga. La meta diaria del juego es de 10 problemas.',
      'Pídale a su estudiante que le explique un problema. Explicarlo ayuda a entenderlo.',
      'Cuando un problema es difícil, el juego da pistas paso a paso. Anímele a intentar cada paso antes de la última pista, que da la respuesta.',
    ],
    lastPlayed: (d) => `Última vez que practicó: ${d}`,
    footer: 'Los porcentajes muestran qué tan firme está cada habilidad; no son una calificación. Los códigos como 7.PAR.3 son los Estándares de Matemáticas K-12 de Georgia, para que pueda compararlos con lo que se enseña en clase.',
    from: 'Práctica de matemáticas Runway Rally',
  },
};

function reportCard(r, lang, classTitle) {
  const T = REPORT_TEXT[lang];
  const name = (g) => (lang === 'es' && g.nameEs ? g.nameEs : g.name);
  const tag = (g) => (g.standard ? `${g.grade ? `${lang === 'es' ? 'Grado' : 'Grade'} ${g.grade} · ` : ''}GA ${g.standard}` : '');
  const row = (g, right) => h('li', {}, h('span', {}, name(g), h('span', { class: 'sub', text: tag(g) })), h('span', { class: 'right', text: right }));
  const w = r.thisWeek;
  const acc = w.answered ? `${Math.round((100 * w.correct) / w.answered)}%` : '—';
  const section = (title, ...body) => h('section', { class: 'rsec' }, h('h3', { text: title }), ...body);
  const short = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { month: 'short', day: 'numeric' });
  const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'short' });
  return h(
    'article',
    { class: 'report', lang },
    h('header', {}, h('p', { class: 'sub', text: `${T.from}${classTitle ? ` · ${classTitle}` : ''}` }), h('h2', { text: `${T.title}: ${r.nickname}` }), h('p', { class: 'sub', text: `${T.week(short(r.from), short(r.to))} · ${T.lastPlayed(niceDay(r.lastActive, lang))}` })),
    h(
      'div',
      { class: 'rstats' },
      [[w.minutes, T.minutes], [w.daysActive, T.days], [w.answered, T.problems], [acc, T.right]].map(([n, l]) => h('div', {}, h('strong', { text: String(n) }), h('span', { text: l }))),
    ),
    h('p', { class: 'rgoal', text: `🎯 ${T.goal(r.goalDays, r.goal)}` }),
    h(
      'table',
      { class: 'rdays' },
      h('caption', { text: T.dayByDay }),
      h('tr', {}, r.days.map((d) => h('th', { scope: 'col', text: dayName(d.day) }))),
      h('tr', {}, r.days.map((d) => h('td', { text: d.answered ? `${d.answered}${d.goalMet ? ' ✓' : ''}` : '–', title: `${d.answered} ${T.problemsShort}` }))),
    ),
    w.answered === 0 ? h('p', { text: T.none }) : null,
    r.improved.length ? section(T.improved, h('ul', {}, r.improved.map((g) => row(g, `${g.from}% → ${g.to}%`)))) : null,
    r.workingOn.length ? section(T.working, h('ul', {}, r.workingOn.map((g) => row(g, `${g.percent}%`)))) : null,
    r.needsHelp.length ? section(T.help, h('p', { class: 'sub', text: T.helpTip }), h('ul', {}, r.needsHelp.map((g) => row(g, `${g.percent}%`)))) : null,
    r.strong.length ? section(T.strong, h('p', { text: (lang === 'es' ? r.strongEs : r.strong).join(', ') })) : null,
    section(T.atHome, h('ul', { class: 'tips' }, T.tips.map((t) => h('li', { text: t })))),
    h('p', { class: 'sub', text: T.footer }),
  );
}

async function reportScreen(student) {
  clearInterval(state.timer); // the class page refreshes itself; a report should stay put while it is read or printed
  const base = `/api/admin/class/${encodeURIComponent(state.code)}`;
  let data;
  try {
    data = await api(student ? `${base}/student/${student.id}/report` : `${base}/reports`);
  } catch (e) {
    alert(e.message);
    return reload();
  }
  let lang = student?.spanishFirst ? 'es' : 'en';
  const list = h('div', { class: 'reports' });
  const langBtn = (code, label) => h('button', { class: 'ghost', 'aria-pressed': String(lang === code), text: label, onclick: () => { lang = code; render(); } });
  const bar = h('div', { class: 'row' });
  function render() {
    bar.replaceChildren(langBtn('en', 'English'), langBtn('es', 'Español'));
    list.replaceChildren(...data.reports.map((r) => reportCard(r, lang, data.title)));
  }
  render();
  show(
    h(
      'div',
      { class: 'head noprint' },
      h('div', {}, h('h1', { text: student ? `Weekly report: ${student.nickname}` : `Weekly reports: ${data.reports.length} ${data.reports.length === 1 ? 'student' : 'students'}` }), h('p', { class: 'stamp', text: 'Print these, or choose "Save as PDF" in the print window, to send home. Runway Rally does not email anyone. Reports show the nickname only, so add the student\'s name by hand if you need to.' })),
      h('div', { class: 'actions' }, bar, h('button', { class: 'primary', text: 'Print or save as PDF', onclick: () => window.print() }), h('button', { class: 'ghost', text: 'Back to class', onclick: () => reload() })),
    ),
    h('p', { class: 'muted noprint', text: 'The Spanish version was drafted by machine. Please have a Spanish speaker read it once before relying on it.' }),
    list,
  );
}

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
  const rows = [['Nickname', 'Answered', 'Accuracy %', 'Commissions', ...ids.map((k) => `${skills[k]}${state.data.skillInfo?.[k] ? ` (${state.data.skillInfo[k].standard})` : ''} mastery %`), ...ids.map((k) => `${skills[k]} answered`), 'Daily goal met (last 7 days)', 'Last played', 'Favorite areas', 'Needs help with']];
  for (const s of sortedStudents(students, ids)) {
    rows.push([s.nickname, s.answered, s.accuracy ?? '', s.commissions, ...ids.map((k) => ((s.attempts?.[k] ?? 0) > 0 ? Math.round(s.mastery[k] * 100) : '')), ...ids.map((k) => s.attempts?.[k] ?? 0), s.goalDaysThisWeek ?? '', s.lastActive ?? '', s.topAreas.map((a) => AREA_LABELS[a] || a).join('; '), s.needsHelpWith.map((k) => skills[k]).join('; ')]);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `runway-rally-${state.data.classCode}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function dashboard() {
  const { students, skills, classCode, title, roster, kind } = state.data;
  const rosterLine = roster && !roster.error ? `${roster.launched} of ${roster.enrolled} enrolled students have opened Runway Rally${roster.notLaunched ? ` · ${roster.notLaunched} have not yet` : ''}` : roster?.error ? 'Course roster is unavailable right now' : '';
  // with 19 skills, show only the columns someone in the class has practiced (all of them if nobody has yet)
  const allIds = Object.keys(skills);
  const triedIds = allIds.filter((k) => students.some((s) => (s.attempts?.[k] ?? 0) > 0));
  const ids = triedIds.length ? triedIds : allIds;
  const started = students.filter((s) => s.answered > 0);
  const accs = started.map((s) => s.accuracy).filter((a) => a !== null);
  const needHelp = students.filter((s) => s.needsHelpWith.length);

  const refresh = h('button', { text: 'Refresh', onclick: reload });
  const csv = h('button', { text: 'Export CSV', onclick: exportCsv, disabled: !students.length });
  const reports = h('button', { text: 'Weekly reports', title: 'Progress reports for families, to print or save as PDF', onclick: () => reportScreen(null), disabled: !students.length });
  const out = h('button', { class: 'ghost', text: 'Sign out', onclick: signOut });
  const back = ltiSession ? null : h('button', { class: 'ghost', text: 'All classes', onclick: () => classesScreen().catch((e) => alert(e.message)) });
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
  // Alerts: someone stuck right now (3 misses in a row) or gone quiet (played before, nothing in a week).
  const stuck = students.filter((s) => s.stuckOn?.length);
  const quiet = students.filter((s) => s.quiet);
  const checkIn = stuck.length || quiet.length
    ? h(
        'section',
        { class: 'panel alert', 'aria-labelledby': 'c-h' },
        h('h2', { id: 'c-h', text: 'Check in with' }),
        stuck.length
          ? h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Stuck right now: 3 misses in a row on a skill. A quick word or a worked example usually gets them moving.' }), h('div', { class: 'names' }, stuck.map((s) => h('span', { class: 'chip warn', text: `${s.nickname}: ${s.stuckOn.map((k) => skills[k] || k).join(', ')}` }))))
          : null,
        quiet.length
          ? h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Gone quiet: played before, but not in the last 7 days.' }), h('div', { class: 'names' }, quiet.map((s) => h('span', { class: 'chip idle', text: `${s.nickname}: last played ${niceDay(s.lastActive)}` }))))
          : null,
      )
    : null;

  const table = h(
    'table',
    {},
    h('thead', {}, h('tr', {}, h('th', { text: 'Student' }), ids.map((k) => h('th', {}, skills[k], state.data.skillInfo?.[k] ? h('span', { class: 'sub', text: `GA ${state.data.skillInfo[k].standard}` }) : null)), h('th', { text: 'Accuracy' }), h('th', { text: 'Recent accuracy' }), h('th', { text: 'Skills check' }), h('th', { text: 'Commissions' }), h('th', { text: 'Daily goal met' }), h('th', { text: 'Last played' }), h('th', { text: 'Favorite areas' }), h('th', { text: '' }))),
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
          h('td', { text: s.recentAccuracy === null || s.recentAccuracy === undefined ? '—' : `${s.recentAccuracy}%` }),
          h('td', { text: s.placement || '—' }),
          h('td', { text: String(s.commissions) }),
          h('td', { text: s.goalDaysThisWeek === undefined ? '—' : `${s.goalDaysThisWeek} of last 7 days` }),
          h('td', { class: s.quiet ? 'quietcell' : '', text: niceDay(s.lastActive) }),
          h('td', { text: s.topAreas.length ? s.topAreas.map((a) => AREA_LABELS[a] || a).join(', ') : '—' }),
          h(
            'td',
            { class: 'rowactions' },
            s.id && state.data.spanish
              ? h('button', { class: 'ghost small', text: s.spanishFirst ? 'Spanish first: on' : 'Spanish first: off', 'aria-pressed': s.spanishFirst ? 'true' : 'false', 'aria-label': `Spanish first for ${s.nickname}`, onclick: () => setSpanishFirst(s) })
              : null,
            s.id ? h('button', { class: 'ghost small', text: 'Weekly report', 'aria-label': `Weekly report for ${s.nickname}`, onclick: () => reportScreen(s) }) : null,
            s.id ? h('button', { class: 'ghost small', text: 'Rename', 'aria-label': `Rename ${s.nickname}`, onclick: () => renameStudent(s) }) : null,
            s.id && state.data.kind !== 'lti' ? h('button', { class: 'ghost small', text: 'New sign-in code', 'aria-label': `New sign-in code for ${s.nickname}`, onclick: () => newSignInCode(s) }) : null,
            s.id ? h('button', { class: 'ghost small', text: 'Download data', 'aria-label': `Download data for ${s.nickname}`, onclick: () => exportStudent(s) }) : null,
            s.id ? h('button', { class: 'ghost small', text: 'Delete', 'aria-label': `Delete ${s.nickname}`, onclick: () => deleteStudent(s) }) : null,
          ),
        ),
      ),
    ),
  );

  show(
    h('div', { class: 'head' }, h('div', {}, h('h1', { text: title ? title : `Class ${classCode}` }), rosterLine ? h('p', { class: 'stamp', text: rosterLine }) : null, h('p', { class: 'stamp', text: `Updated ${state.fetchedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · refreshes every 30 seconds` })), h('div', { class: 'actions' }, back, refresh, reports, csv, out)),
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(students.length) }), h('div', { class: 'l', text: 'Students joined' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(started.length) }), h('div', { class: 'l', text: 'Have played' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: accs.length ? `${Math.round(avg(accs))}%` : '—' }), h('div', { class: 'l', text: 'Average accuracy' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(students.reduce((a, s) => a + s.commissions, 0)) }), h('div', { class: 'l', text: 'Commissions finished' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: String(needHelp.length) }), h('div', { class: 'l', text: 'Need support' })),
    ),
    checkIn,
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
      students.length ? h('div', { class: 'tablewrap' }, table) : h('p', { class: 'empty', text: kind === 'lti' ? 'No students have opened Runway Rally yet. They launch it from your Brightspace course.' : `No students have joined ${classCode} yet. Share the class code with your class.` }),
      h('div', { class: 'legend' }, h('span', { class: 'l1', text: 'Below 35%' }), h('span', { class: 'l2', text: '35% to 59%' }), h('span', { class: 'l3', text: '60% and up' }), h('span', { text: 'Percentages are shown in every cell, not just color' })),
    ),
    homeworkPanel(),
    managePanel(),
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
  sessionStorage.removeItem('rr_code');
  state.token = '';
  state.me = null;
  state.data = null;
  loginScreen();
}

if (ltiSession) {
  api('/api/admin/me')
    .then((me) => {
      state.me = me;
      state.code = me.classCode;
      return fetchClass();
    })
    .then((d) => {
      state.data = d;
      state.fetchedAt = new Date();
      dashboard();
    })
    .catch((e) => show(h('div', { class: 'card' }, h('p', { text: e.message }))));
} else if (state.token) {
  api('/api/admin/me')
    .then((me) => {
      state.me = me;
      return classesScreen();
    })
    .catch((e) => loginScreen(e.status === 403 ? 'Please sign in again.' : e.message));
} else loginScreen();
