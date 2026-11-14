// Read-only family view. The private key lives only in the link's #fragment, so it is never sent
// in a URL or logged; it goes to the server in a header.
const app = document.getElementById('app');

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const shown = (...nodes) => app.replaceChildren(...nodes.flat().filter(Boolean));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function niceDay(iso) {
  if (!iso) return 'not yet';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function render(p) {
  const w = p.thisWeek;
  const acc = w.answered ? Math.round((100 * w.correct) / w.answered) : null;
  const section = (title, body) => h('div', { class: 'card stack' }, h('h3', { text: title }), body);
  shown(
    h('div', { class: 'center stack' }, h('h1', { text: p.nickname }), h('p', { class: 'muted', text: `Runway Rally math practice · last played ${niceDay(p.lastActive)}` })),
    h(
      'div',
      { class: 'card stats' },
      h('div', { class: 'stat' }, h('strong', { text: String(w.minutes) }), h('span', { text: 'minutes this week' })),
      h('div', { class: 'stat' }, h('strong', { text: String(w.daysActive) }), h('span', { text: 'days this week' })),
      h('div', { class: 'stat' }, h('strong', { text: acc === null ? '–' : `${acc}%` }), h('span', { text: `of ${plural(w.answered, 'problem', 'problems')} right` })),
    ),
    p.streak > 1 ? h('p', { class: 'center reward', text: `🔥 ${p.streak} days in a row` }) : null,
    p.improved.length
      ? section('Got better this week', h('div', { class: 'stack' }, p.improved.map((g) => h('div', { class: 'skill-row' }, h('span', { text: g.name }), h('span', { class: 'muted', text: `${g.from}% → ${g.to}%` })))))
      : null,
    p.workingOn.length
      ? section('Working on now', h('div', { class: 'stack' }, p.workingOn.map((g) => h('div', { class: 'skill-row' }, h('span', { text: g.name }), h('span', { class: 'muted', text: `${g.percent}%` })))))
      : null,
    p.needsHelp.length
      ? section(
          'Could use a hand',
          h(
            'div',
            { class: 'stack' },
            h('p', { class: 'muted small', text: 'Sitting together for one commission on these, and asking for the thinking out loud, helps more than giving the answer.' }),
            p.needsHelp.map((g) => h('div', { class: 'skill-row' }, h('span', { text: g.name }), h('span', { class: 'muted', text: `${g.percent}%` }))),
          ),
        )
      : null,
    p.strong.length ? section('Strong skills', h('p', { text: p.strong.join(', ') })) : null,
    p.placement === 'not started' || p.placement === 'skipped'
      ? h('p', { class: 'muted center small', text: 'Tip: the skills check on the home screen (under "For grown-ups") helps practice start at the right level.' })
      : null,
    w.answered === 0 ? h('p', { class: 'center', text: 'No practice yet this week. Ten to fifteen minutes most days works best.' }) : null,
    h('p', { class: 'muted center small', text: 'Percentages show how steady each skill is, not a grade. This page only reads progress and cannot change anything.' }),
  );
}

async function load() {
  const m = /^#k=([A-Za-z0-9_-]{32,64})$/.exec(location.hash);
  if (!m) return shown(h('div', { class: 'card center stack' }, h('h2', { text: 'This link is not complete' }), h('p', { text: 'Open the full family link again, or make a new one in the game under "For grown-ups".' })));
  try {
    const res = await fetch('/api/progress', { headers: { 'x-progress-key': m[1], 'x-tz-offset': String(new Date().getTimezoneOffset()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not load progress right now.');
    render(data);
  } catch (e) {
    shown(h('div', { class: 'card center stack' }, h('h2', { text: 'Could not show progress' }), h('p', { text: e.message })));
  }
}

window.addEventListener('hashchange', load);
load();
