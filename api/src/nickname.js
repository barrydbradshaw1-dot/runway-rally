// Nickname checks: a short word filter, and a nudge away from full real names.
// Students are 8 to 14, so the filter leans strict. It is a first line only: teachers can rename
// any student from the console, and NICKNAME_BLOCKLIST (comma separated) adds words without a release.

// Blocked anywhere inside a nickname, after look-alike characters are undone (5h1t, f_u_c_k, fuuuck).
const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'phuck', 'shit', 'cunt', 'bitch', 'biatch', 'bastard', 'asshole', 'arsehole',
  'nigger', 'nigga', 'faggot', 'fagot', 'whore', 'slut', 'porn', 'penis', 'vagina', 'dildo', 'rapist',
  'retard', 'twat', 'wank', 'jizz', 'boner', 'blowjob', 'handjob', 'sexy', 'milf', 'pedophile',
  'molest', 'nazi', 'hitler', 'kkk', 'wetback', 'tranny', 'douche', 'motherf', 'stfu', 'pussy',
];
// Blocked only as a whole word, because they sit inside ordinary words ("class", "grape", "spicy").
const WHOLE = [
  'ass', 'arse', 'butt', 'damn', 'crap', 'piss', 'dick', 'cock', 'cum', 'tit', 'tits', 'titty', 'boob', 'boobs',
  'booby', 'sex', 'nude', 'nudes', 'naked', 'hoe', 'hoes', 'rape', 'fag', 'fags', 'spic', 'chink', 'kike',
  'dyke', 'coon', 'pedo', 'horny', 'kys', 'wtf', 'bj', 'anal', 'thot', 'simp', 'kill', 'killer', 'die', 'dead',
];

// Look-alike characters students use to slip a word past a filter.
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i' };
const unleet = (s) => s.replace(/[01345789@$!]/g, (c) => LEET[c] ?? c);
const letters = (s) => unleet(s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()).replace(/[^a-z]/g, '');
const squeeze = (s) => s.replace(/(.)\1+/g, '$1'); // fuuuck -> fuck

// Common first names of children in US schools today. A nickname that is one of these followed by
// another word ("Maya Lopez", "jayden_smith") looks like a full real name, so it is turned down.
const FIRST_NAMES = new Set(
  `aaliyah aaron abby abigail adam addison adrian aiden alex alexa alexander alexis alice alicia alyssa amanda amaya amber amelia amir andrea andrew angel angela anna annabelle anthony aria ariana ariel arianna asher ashley aubrey audrey austin ava avery bella benjamin bianca blake brandon brayden brianna brooke brooklyn caleb cameron camila carlos carmen carter charlie charlotte chloe christian christopher claire cole connor cooper daniel david delilah destiny diana diego dylan eli elijah elizabeth ella ellie emily emma eric ethan eva evan evelyn ezra faith gabriel gabriella gavin genesis gianna grace grayson hailey hannah harper hazel henry hudson hunter isaac isabel isabella isaiah ivy jace jack jackson jacob jada jade jaden jake james jasmine jason jayden jaylen jennifer jeremiah jesus jocelyn john jonathan jordan jose joseph joshua josiah julia julian juliana justin kaitlyn kayla kaylee kennedy kevin khloe kimberly kylie landon layla leah leo leilani liam lily lillian logan london lucas lucy luis luke luna lydia mackenzie madelyn madison makayla malia maria mariah mason mateo matthew maya melanie mia micah michael miguel mila naomi natalie nathan nevaeh nicholas noah nora olivia owen paisley parker penelope peyton quinn raelynn reagan riley robert ryan sadie samantha samuel sara sarah savannah scarlett sebastian serenity skylar sofia sophia sophie stella sydney taylor thomas tristan trinity tyler valentina valeria victoria violet william wyatt xavier yasmin zachary zane zoe zoey`.split(/\s+/),
);

// Words that make "Name Word" a nickname rather than a full name ("Maya Rocks", "Liam The Great").
const FUN = new Set(
  `the a of da xo xoxo rocks rules star stars styles style designs design designer fashion queen king princess prince girl boy cool cute fab fierce glam glitz sparkle sparkles art arts loves love bee cat kitty fox wolf bear moon sun sky rose blue pink red gold silver magic dream dreams swag vibes official great best one two three`.split(/\s+/),
);

function words(n) {
  // split on spaces, _ and -, and on camel case ("MayaLopez")
  return n
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function extraBlocklist(env = process.env) {
  return String(env.NICKNAME_BLOCKLIST || '')
    .split(',')
    .map((w) => letters(w))
    .filter((w) => w.length >= 2);
}

// Returns { nickname } or { error } with a message a student can act on.
export function checkNickname(raw, { extra = [] } = {}) {
  if (typeof raw !== 'string') return { error: 'pick a nickname (2 to 20 letters or numbers)' };
  const n = raw.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  if (n.length < 2) return { error: 'pick a nickname (2 to 20 letters or numbers)' };

  const flat = letters(n);
  const flatSq = squeeze(flat);
  const anywhere = [...ANYWHERE, ...extra];
  const toks = words(n).map(letters).filter(Boolean);
  const bad =
    anywhere.some((w) => flat.includes(w) || (squeeze(w).length >= 3 && flatSq.includes(squeeze(w)))) ||
    toks.some((t) => WHOLE.includes(t) || WHOLE.includes(squeeze(t))) ||
    WHOLE.includes(flat) ||
    WHOLE.includes(flatSq);
  if (bad) return { error: 'please pick a different nickname' };

  const ws = words(n);
  if (ws.length >= 2 && FIRST_NAMES.has(ws[0]) && /^\p{L}{2,}$/u.test(ws[ws.length - 1]) && !ws.slice(1).some((w) => FUN.has(w))) {
    return { error: 'that looks like a real name. Make up a nickname instead, like Star Stitcher' };
  }
  return { nickname: n };
}
