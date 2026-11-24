// Sales targets (owner only): pick a state, see every district and school with its grade 6 to 8 math
// results, and write a pitch for that state's standards. Signs in with the ADMIN_TOKEN, the same
// sign-in as the teacher console (kept in sessionStorage only). Nothing is sent to anyone from here.
const root = document.getElementById('admin');
const PAGE = 200; // rows drawn at a time

const state = {
  token: sessionStorage.getItem('rr_admin') || '',
  states: [],
  st: null, // the loaded state
  view: 'districts',
  query: '',
  middleOnly: true,
  belowOnly: false,
  sort: 'math',
  shown: PAGE,
  open: new Set(), // districts showing their schools
  target: null, // { district, school }
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { 'x-admin-token': state.token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let out = {};
  try {
    out = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw Object.assign(new Error(res.status === 403 ? 'This page is only for the admin token (the server owner).' : out.error || 'Something went wrong.'), { status: res.status });
  return out;
}

const saved = (k, d = '') => {
  try {
    return localStorage.getItem('rr_prospects_' + k) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem('rr_prospects_' + k, v);
  } catch {
    /* ignore */
  }
};

const fmt = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'));
const pct = (n) => (n === null || n === undefined ? '' : `${n}%`);
function mathClass(m) {
  const s = state.st?.stateMath?.pct;
  if (m === null || m === undefined || s === undefined || s === null) return 'math none';
  if (m <= s - 10) return 'math low';
  if (m < s) return 'math mid';
  return 'math high';
}

// ---------------- sign in ----------------
function loginScreen(msg = '') {
  const token = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Admin token' });
  const err = h('p', { class: 'error', role: 'alert', text: msg });
  root.replaceChildren(
    h('div', { class: 'login stack' },
      h('h1', { text: 'Sales targets' }),
      h('p', { class: 'muted', text: 'For the owner of this Runway Rally server. Sign in with the admin token.' }),
      h('div', { class: 'card' }, h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        state.token = token.value.trim();
        try {
          await start();
          sessionStorage.setItem('rr_admin', state.token);
        } catch (ex) {
          err.textContent = ex.message;
        }
      } }, h('label', {}, 'Admin token', token), err, h('button', { class: 'primary', type: 'submit', text: 'Sign in' })))),
  );
}

async function start() {
  const { states } = await api('/api/admin/prospects/states');
  state.states = states;
  const last = saved('state');
  if (last && states.some((s) => s.code === last && s.data)) await loadState(last);
  else render();
}

async function loadState(code) {
  state.st = null;
  state.open.clear();
  state.shown = PAGE;
  state.target = null;
  if (!code) return render();
  save('state', code);
  root.querySelector('#status')?.replaceChildren('Loading…');
  state.st = await api(`/api/admin/prospects/state/${code}`);
  render();
}

// ---------------- filtering ----------------
function districtsList() {
  const st = state.st;
  const q = state.query.toLowerCase();
  const sAvg = st.stateMath?.pct ?? null;
  let list = st.districts;
  if (state.middleOnly) list = list.filter((d) => d.middleSchools > 0);
  if (state.belowOnly && sAvg !== null) list = list.filter((d) => d.math !== null && d.math < sAvg);
  if (q) {
    const hitDistricts = new Set(st.schools.filter((s) => s.name.toLowerCase().includes(q)).map((s) => s.district));
    list = list.filter((d) => d.name.toLowerCase().includes(q) || (d.city || '').toLowerCase().includes(q) || hitDistricts.has(d.id));
  }
  return sortList(list);
}

function schoolsList(districtId = null) {
  const st = state.st;
  const q = state.query.toLowerCase();
  const sAvg = st.stateMath?.pct ?? null;
  let list = districtId ? st.schools.filter((s) => s.district === districtId) : st.schools;
  if (state.middleOnly) list = list.filter((s) => s.middle);
  if (!districtId && state.belowOnly && sAvg !== null) list = list.filter((s) => s.math !== null && s.math < sAvg);
  if (!districtId && q) list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q) || districtName(s.district).toLowerCase().includes(q));
  return sortList(list);
}

const districtById = () => (state._dmap?.st === state.st ? state._dmap.map : (state._dmap = { st: state.st, map: new Map(state.st.districts.map((d) => [d.id, d])) }).map);
const districtName = (id) => districtById().get(id)?.name || '';

function sortList(list) {
  const out = [...list];
  if (state.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === 'size') out.sort((a, b) => (b.enrollment ?? -1) - (a.enrollment ?? -1));
  else out.sort((a, b) => (a.math ?? 999) - (b.math ?? 999) || a.name.localeCompare(b.name));
  return out;
}

// ---------------- CSV ----------------
function downloadCsv() {
  const st = state.st;
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  let lines;
  if (state.view === 'districts') {
    lines = [['District', 'NCES ID', 'City', 'Type', 'Phone', 'Students', 'Schools', 'Schools with grades 6-8', 'Math % proficient (6-8)', 'Rank from lowest']];
    for (const d of districtsList()) lines.push([d.name, d.id, d.city, d.agency, d.phone, d.enrollment, d.schools, d.middleSchools, d.math, d.mathRank]);
  } else {
    lines = [['School', 'NCES ID', 'District', 'City', 'Grades', 'Students', 'Title I', 'Charter', 'Free or reduced lunch %', 'Phone', 'Math % proficient (6-8)', 'Rank from lowest']];
    for (const s of schoolsList()) lines.push([s.name, s.id, districtName(s.district), s.city, s.grades, s.enrollment, s.titleI ? 'yes' : 'no', s.charter ? 'yes' : 'no', s.lowIncomePct, s.phone, s.math, s.mathRank]);
  }
  const blob = new Blob([lines.map((l) => l.map(esc).join(',')).join('\n') + '\n'], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `runway-rally-${st.code}-${state.view}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- pitch ----------------
function pitchPanel() {
  const t = state.target;
  if (!t) return null;
  const field = (key, label, def, placeholder) => {
    const input = h('input', { type: key === 'email' ? 'email' : 'text', value: saved(key, def), placeholder, maxlength: 200 });
    input.addEventListener('change', () => save(key, input.value));
    return { input, el: h('label', {}, label, input) };
  };
  const recipient = h('input', { type: 'text', placeholder: 'Example: Dr. Lee (optional)', maxlength: 80 });
  const name = field('name', 'Your name', 'Barry');
  const org = field('org', 'Organization', '', 'Example: your business name');
  const email = field('email', 'Your email', '', 'Where they can reach you');
  const price = field('price', 'Price line (leave empty to leave pricing out)', 'free for teachers and students, with a school license of about $1,500 a year');
  const out = h('div', { class: 'pitchout' });
  const err = h('p', { class: 'error', role: 'alert' });
  const copy = (ta, label) => h('button', { class: 'small', type: 'button', text: `Copy ${label}`, onclick: async (e) => {
    try {
      await navigator.clipboard.writeText(ta.value);
      e.target.textContent = 'Copied';
    } catch {
      ta.select();
    }
  } });
  const write = async () => {
    err.textContent = '';
    try {
      const r = await api('/api/admin/prospects/pitch', { method: 'POST', body: { state: state.st.code, district: t.district.id, school: t.school?.id, recipient: recipient.value, price: price.input.value, sender: { name: name.input.value, org: org.input.value, email: email.input.value } } });
      const subj = h('input', { type: 'text', readonly: true, value: r.subject });
      const em = h('textarea', { class: 'email', readonly: true, value: r.email });
      const pr = h('textarea', { class: 'proposal', readonly: true, value: r.proposal });
      out.replaceChildren(
        h('label', {}, 'Subject', subj),
        h('label', {}, 'Email', em), h('div', { class: 'copyrow' }, copy(subj, 'subject'), copy(em, 'email')),
        h('label', {}, 'Proposal', pr), h('div', { class: 'copyrow' }, copy(pr, 'proposal')),
      );
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
  const who = t.school ? `${t.school.name}, ${t.district.name}` : t.district.name;
  const panel = h('section', { class: 'panel', id: 'pitch', 'aria-labelledby': 'p-h' },
    h('div', { class: 'head' }, h('h2', { id: 'p-h', text: `Pitch for ${who}` }), h('button', { class: 'ghost small', text: 'Close', onclick: () => { state.target = null; render(); } })),
    h('div', { class: 'pitchform' }, h('label', {}, 'Who it is for', recipient), name.el, org.el, email.el, price.el),
    h('div', { class: 'copyrow' }, h('button', { class: 'primary', text: 'Write the pitch', onclick: write })),
    h('p', { class: 'warnbox', text: `Before you send it: check the standards name and any privacy law on ${state.st.name}'s education department site, read it through, and confirm the price. Nothing is sent from this page.` }),
    err,
    out,
  );
  return panel;
}

function choose(district, school = null) {
  state.target = { district, school };
  render();
  document.getElementById('pitch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- tables ----------------
function districtsTable() {
  const list = districtsList();
  const rows = [];
  for (const d of list.slice(0, state.shown)) {
    const isOpen = state.open.has(d.id);
    rows.push(h('tr', {},
      h('td', { text: d.name }),
      h('td', { text: d.city || '' }),
      h('td', { text: d.agency || '' }),
      h('td', { class: 'num', text: fmt(d.middleSchools) }),
      h('td', { class: 'num', text: fmt(d.enrollment) }),
      h('td', { class: mathClass(d.math), text: pct(d.math) }),
      h('td', { class: 'num', text: d.mathRank ? `${d.mathRank} of ${state.st.districtsScored}` : '' }),
      h('td', { class: 'rowactions' },
        h('button', { class: 'small', text: isOpen ? 'Hide schools' : 'Schools', 'aria-expanded': String(isOpen), onclick: () => { isOpen ? state.open.delete(d.id) : state.open.add(d.id); render(); } }),
        h('button', { class: 'small primary', text: 'Pitch', onclick: () => choose(d) })),
    ));
    if (isOpen) {
      const schools = schoolsList(d.id);
      if (!schools.length) rows.push(h('tr', { class: 'school' }, h('td', { colspan: 8, text: state.middleOnly ? 'No schools with grades 6 to 8.' : 'No schools listed.' })));
      for (const s of schools) rows.push(schoolRow(s, d, false));
    }
  }
  return { list, table: h('table', { class: 'plain' },
    h('thead', {}, h('tr', {}, ['District', 'City', 'Type', 'Schools 6-8', 'Students', 'Math 6-8', 'Rank from lowest', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, rows)) };
}

function schoolRow(s, d, showDistrict) {
  return h('tr', { class: showDistrict ? '' : 'school' },
    h('td', { text: s.name }),
    showDistrict ? h('td', { text: d?.name || '' }) : h('td', { text: s.city || '' }),
    h('td', { text: [s.grades, s.charter ? 'charter' : null].filter(Boolean).join(', ') }),
    h('td', { class: 'num', text: s.titleI ? 'Title I' : '' }),
    h('td', { class: 'num', text: fmt(s.enrollment) }),
    h('td', { class: mathClass(s.math), text: pct(s.math) }),
    h('td', { class: 'num', text: s.lowIncomePct !== null ? `${s.lowIncomePct}% low income` : '' }),
    h('td', { class: 'rowactions' }, h('button', { class: 'small primary', text: 'Pitch', onclick: () => choose(d, s) })),
  );
}

function schoolsTable() {
  const list = schoolsList();
  const map = districtById();
  return { list, table: h('table', { class: 'plain' },
    h('thead', {}, h('tr', {}, ['School', 'District', 'Grades', 'Title I', 'Students', 'Math 6-8', 'Low income', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, list.slice(0, state.shown).map((s) => schoolRow(s, map.get(s.district) || { id: s.district, name: '' }, true)))) };
}

// ---------------- page ----------------
function render() {
  const st = state.st;
  const picker = h('select', { 'aria-label': 'State', onchange: (e) => loadState(e.target.value).catch((ex) => alert(ex.message)) },
    h('option', { value: '', text: 'Pick a state' }),
    state.states.map((s) => h('option', { value: s.code, text: s.data ? s.name : `${s.name} (no data yet)`, selected: st?.code === s.code, disabled: !s.data })));
  const noData = state.states.every((s) => !s.data);

  const head = h('div', { class: 'head' },
    h('div', {}, h('h1', { text: 'Sales targets' }), h('p', { class: 'stamp', text: 'Only you see this page. Teachers and students cannot.' })),
    h('div', { class: 'actions' }, h('a', { class: 'button ghost', href: '/admin/', text: 'Teacher console' })));

  const parts = [head, h('section', { class: 'panel' }, h('div', { class: 'pickrow' }, h('label', {}, 'State', picker), h('span', { id: 'status', class: 'muted' })),
    noData ? h('p', { class: 'warnbox', text: 'No school data on this server yet. Run the "School data" workflow on GitHub (Actions tab), or run node api/tools/build-school-data.mjs, then deploy.' }) : null)];

  if (st && st.available) {
    const sMath = st.stateMath?.pct;
    parts.push(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'n', text: fmt(st.districts.length) }), h('div', { class: 'l', text: 'districts' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: fmt(st.schools.filter((s) => s.middle).length) }), h('div', { class: 'l', text: 'schools with grades 6 to 8' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: fmt(st.schools.length) }), h('div', { class: 'l', text: 'schools in all' })),
      h('div', { class: 'stat' }, h('div', { class: 'n', text: sMath !== undefined && sMath !== null ? `${sMath}%` : 'n/a' }), h('div', { class: 'l', text: `proficient in math, grades 6 to 8${st.assessmentSchoolYear ? `, ${st.assessmentSchoolYear}` : ''}` }))));
    parts.push(h('section', { class: 'panel facts' },
      h('h2', { text: `${st.name}'s math standards` }),
      h('p', {}, h('strong', { text: st.standards })),
      h('p', { class: 'muted', text: st.basis === 'common-core' ? 'Common Core, so pitches list the Common Core code for each skill.' : st.basis === 'adapted' ? 'Built from Common Core with state changes, so pitches list topics by domain.' : 'The state wrote its own standards, so pitches list topics and offer a crosswalk.' }),
      st.privacyLaw ? h('p', { class: 'muted', text: `Student privacy law named in pitches: ${st.privacyLaw}.` }) : null,
      st.note ? h('p', { class: 'muted', text: st.note }) : null,
      h('p', { class: 'muted', text: `Data: ${st.source}. Schools and districts ${st.directorySchoolYear || ''}; math results ${st.assessmentSchoolYear || 'not available'}. Built ${st.builtAt}.` })));

    const pitch = pitchPanel();
    if (pitch) parts.push(pitch);

    const search = h('input', { type: 'search', placeholder: 'Find a district, school or city', value: state.query });
    search.addEventListener('input', () => {
      state.query = search.value;
      state.shown = PAGE;
      clearTimeout(state._t);
      state._t = setTimeout(() => {
        render();
        const again = root.querySelector('input[type="search"]');
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      }, 250);
    });
    const sort = h('select', { 'aria-label': 'Sort', onchange: (e) => { state.sort = e.target.value; render(); } },
      [['math', 'Lowest math first'], ['size', 'Most students first'], ['name', 'A to Z']].map(([v, t]) => h('option', { value: v, text: t, selected: state.sort === v })));
    const middle = h('input', { type: 'checkbox', checked: state.middleOnly, onchange: (e) => { state.middleOnly = e.target.checked; render(); } });
    const below = h('input', { type: 'checkbox', checked: state.belowOnly, onchange: (e) => { state.belowOnly = e.target.checked; render(); } });
    const tab = (v, t) => h('button', { 'aria-pressed': String(state.view === v), onclick: () => { state.view = v; state.shown = PAGE; render(); }, text: t });
    const { list, table } = state.view === 'districts' ? districtsTable() : schoolsTable();
    parts.push(h('section', { class: 'panel' },
      h('div', { class: 'toolbar' }, h('div', { class: 'tabs' }, tab('districts', 'Districts'), tab('schools', 'Schools')), search, sort,
        h('label', { class: 'toggle' }, middle, 'Grades 6 to 8 only'),
        h('label', { class: 'toggle' }, below, 'Below state average'),
        h('button', { class: 'small', text: 'Download CSV', onclick: downloadCsv })),
      h('div', { class: 'legend' }, h('span', { class: 'l1', text: '10+ points below the state' }), h('span', { class: 'l2', text: 'below the state' }), h('span', { class: 'l3', text: 'at or above the state' })),
      h('p', { class: 'muted', text: `${fmt(list.length)} ${state.view} shown${list.length > state.shown ? `, first ${fmt(state.shown)} drawn` : ''}. Math is the share of grade 6 to 8 students proficient on the state test. Blank means the state did not report it, often because the group was small.` }),
      list.length ? h('div', { class: 'tablewrap' }, table) : h('p', { class: 'empty', text: 'Nothing matches.' }),
      list.length > state.shown ? h('button', { text: `Show ${fmt(Math.min(PAGE * 5, list.length - state.shown))} more`, onclick: () => { state.shown += PAGE * 5; render(); } }) : null));
  } else if (st && !st.available) {
    parts.push(h('p', { class: 'warnbox', text: `No data for ${st.name} on this server yet.` }));
  }
  root.replaceChildren(...parts.filter(Boolean));
}

if (state.token) start().catch((ex) => loginScreen(ex.status === 403 ? 'This page is only for the admin token.' : ex.message));
else loginScreen();
