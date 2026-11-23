// Homework practice: a teacher's own assignment becomes a commission for the class.
//
// A teacher types the problems in, or uploads a photo of a BLANK copy of the assignment. The photo is
// sent once to an AI model (Anthropic's Claude), which reads the problems and suggests an answer key.
// The photo is never written to disk, the database or the logs: only the typed-out problems the
// teacher reviews and saves are kept. Students never upload anything.
//
// Photo reading is off unless ANTHROPIC_API_KEY is set. Typed assignments work either way.
import Anthropic from '@anthropic-ai/sdk';
import { SKILLS, SKILL_IDS, parseAnswer, gcd } from './skills.js';

export const MAX_ASSIGNMENTS = 30; // per class
export const MAX_PROBLEMS = 25; // per assignment
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the API's limit for one image
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PROMPT_MAX = 400;
const HINT_MAX = 200;
const TITLE_MAX = 60;

export function homeworkConfig(env = process.env) {
  const n = Number(env.HOMEWORK_DAILY_LIMIT);
  return {
    photos: Boolean(env.ANTHROPIC_API_KEY),
    model: env.HOMEWORK_AI_MODEL || 'claude-sonnet-5-5',
    // the most photos the whole server reads in one day, so a mistake cannot run up a big bill
    dailyLimit: Number.isInteger(n) && n >= 0 && env.HOMEWORK_DAILY_LIMIT !== '' ? n : 200,
  };
}

const clean = (raw, max) => (typeof raw === 'string' ? raw.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ---------- a tiny arithmetic evaluator (no eval) for checking the answer key ----------
// Numbers, + - * / ^, parentheses and unary minus. Returns a number, or null if it cannot read it.
export function evalArithmetic(src) {
  if (typeof src !== 'string' || !src.trim() || src.length > 200) return null;
  const s = src.replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  if (!/^[0-9.+\-*/^()]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function number() {
    const m = /^\d*\.?\d+/.exec(s.slice(i));
    if (!m) throw new Error('number');
    i += m[0].length;
    return Number(m[0]);
  }
  function atom() {
    if (peek() === '-') {
      i++;
      return -atom();
    }
    if (peek() === '(') {
      i++;
      const v = sum();
      if (peek() !== ')') throw new Error(')');
      i++;
      return v;
    }
    return number();
  }
  function power() {
    const b = atom();
    if (peek() === '^') {
      i++;
      return b ** power();
    }
    return b;
  }
  function product() {
    let v = power();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = power();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = sum();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// One problem as the teacher saved it. Returns { problem } or { error }.
export function cleanProblem(raw, n = 1) {
  const where = `Problem ${n}`;
  if (!raw || typeof raw !== 'object') return { error: `${where} is empty.` };
  const prompt = clean(raw.prompt, PROMPT_MAX);
  if (!prompt) return { error: `${where} needs the question.` };
  const answerText = clean(raw.answer, 20);
  const p = parseAnswer(answerText);
  if (!p) return { error: `${where}: the answer should be one number, like 12, -3, 4.5 or 3/4.` };
  if (!SKILL_IDS.includes(raw.skill)) return { error: `${where}: pick the skill it practices.` };
  const shown = p.isFraction ? `${answerText.trim().startsWith('-') ? '-' : ''}${p.n}/${p.d}` : String(p.value);
  const hints = [0, 1, 2].map((k) => clean(Array.isArray(raw.hints) ? raw.hints[k] : '', HINT_MAX));
  if (!hints[0]) hints[0] = 'Read the problem slowly and find the numbers you need.';
  if (!hints[1]) hints[1] = 'Write down each step before you type the answer.';
  if (!hints[2].includes(shown)) hints[2] = clean(`${hints[2]} The answer is ${shown}.`, HINT_MAX + 30);
  const fraction = p.isFraction && !Number.isInteger(p.value);
  return {
    problem: {
      prompt,
      answer: p.value,
      answerText: shown,
      form: fraction ? 'fraction' : Number.isInteger(p.value) ? 'int' : 'decimal',
      requireFraction: fraction,
      simplest: fraction && gcd(p.n, p.d) === 1,
      skill: raw.skill,
      hints,
    },
  };
}

// A whole assignment from the console. Returns { assignment } or { error }.
export function cleanAssignment(body) {
  const title = clean(body?.title, TITLE_MAX);
  if (!title) return { error: 'Give the assignment a name, like "Tuesday homework, page 42".' };
  const list = Array.isArray(body.problems) ? body.problems : [];
  if (!list.length) return { error: 'Add at least one problem.' };
  if (list.length > MAX_PROBLEMS) return { error: `An assignment can have up to ${MAX_PROBLEMS} problems.` };
  const problems = [];
  for (let k = 0; k < list.length; k++) {
    const r = cleanProblem(list[k], k + 1);
    if (r.error) return { error: r.error };
    problems.push(r.problem);
  }
  return { assignment: { title, problems, live: body.live === true } };
}

// What the console shows and edits (the answer key is the teacher's, so it is included).
export const assignmentOut = (a) => ({
  id: a.id,
  title: a.title,
  live: a.live === true,
  createdAt: a.createdAt || null,
  updatedAt: a.updatedAt || null,
  problems: a.problems.map((p) => ({ prompt: p.prompt, answer: p.answerText, skill: p.skill, hints: p.hints })),
});

// What a student sees on the home screen: no problems, no answers.
export const assignmentBrief = (a) => ({ id: a.id, title: a.title, count: a.problems.length });

// ---------- reading a photo ----------
const SKILL_LIST = SKILL_IDS.map((id) => `${id}: ${SKILLS[id].name} (grade ${SKILLS[id].grade})`).join('\n');

export const READ_INSTRUCTIONS = `You read a photo of a blank math assignment for students in grades 3 to 8, so a teacher can turn it into practice in a math game. The teacher will check everything you return before students see it.

Return only problems whose answer is a single number: a whole number, a decimal, or a fraction. For each one:
- prompt: the problem as plain text a student can read on a phone. Keep every number exactly as printed. Write fractions with / and powers with ^. If the problem needs a picture or table to make sense, describe what it shows in words; if that is not possible, skip the problem.
- answer: the correct answer, written as 12, -3, 4.5 or 3/4. Fractions in simplest form. No units.
- check: an arithmetic expression that uses only numbers, + - * / ^ and parentheses and equals the answer (for example "(18-4)/2"). Use an empty string when the problem cannot be written that way.
- skill: the one skill id from the list below that the problem practices most.
- hints: three short steps for a student, in plain words. The third one states the answer.
- unsure: true when the photo is hard to read, the problem is unclear, or you are not certain of the answer.

List in skipped every problem you left out (one short line of its text) and why: it needs words, a drawing or a graph, has more than one answer, asks to show work, or could not be read.

Never copy a person's name, signature, student ID, school name or any other personal information. If the page has a student's handwritten work on it, ignore the handwriting and read only the printed problems. If the photo is not a math assignment, return no problems and say so in note.

Skill ids:
${SKILL_LIST}`;

const READ_SCHEMA = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          answer: { type: 'string' },
          check: { type: 'string' },
          skill: { type: 'string', enum: SKILL_IDS },
          hints: { type: 'array', items: { type: 'string' } },
          unsure: { type: 'boolean' },
        },
        required: ['prompt', 'answer', 'check', 'skill', 'hints', 'unsure'],
        additionalProperties: false,
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, reason: { type: 'string' } },
        required: ['text', 'reason'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['problems', 'skipped', 'note'],
  additionalProperties: false,
};

export class ReadError extends Error {}

// Sends one photo to Claude and returns its raw reading. The photo exists only in this request.
export function makePhotoReader({ apiKey, model, fetchImpl } = {}) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async function readPhoto({ mediaType, data }) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: READ_SCHEMA } },
      system: READ_INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Read the math problems on this assignment.' },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') throw new ReadError('The photo could not be read. Try typing the problems in instead.');
    if (response.stop_reason === 'max_tokens') throw new ReadError('That page has too many problems to read at once. Try a photo of half the page.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new ReadError('The photo could not be read. Try again, or type the problems in.');
    }
  };
}

// Turns the model's reading into a draft for the teacher to review. Nothing here is saved.
// Each problem gets a flag when the teacher should look twice: the model was unsure, or the
// arithmetic check does not match the answer it gave.
export function draftFromReading(reading) {
  const problems = [];
  const skipped = [];
  for (const raw of Array.isArray(reading?.problems) ? reading.problems.slice(0, MAX_PROBLEMS) : []) {
    // A skill the reader didn't recognise is the teacher's to pick, not a reason to drop the problem.
    const knownSkill = SKILL_IDS.includes(raw?.skill);
    const r = cleanProblem(knownSkill ? raw : { ...raw, skill: SKILL_IDS[0] }, problems.length + 1);
    if (r.error) {
      const text = clean(raw?.prompt, 120);
      if (text) skipped.push({ text, reason: 'the answer was not a single number' });
      continue;
    }
    const p = r.problem;
    let flag = null;
    const checked = evalArithmetic(raw.check);
    if (checked !== null && !near(checked, p.answer)) flag = 'The answer and the math check do not agree. Please work this one out.';
    else if (raw.unsure === true) flag = 'Hard to read or unclear. Please check the question and answer.';
    else if (checked === null) flag = 'Please check this answer.';
    else if (!knownSkill) flag = 'Pick the skill this one practices.';
    problems.push({ prompt: p.prompt, answer: p.answerText, skill: knownSkill ? p.skill : '', hints: p.hints, flag });
  }
  for (const s of Array.isArray(reading?.skipped) ? reading.skipped.slice(0, 40) : []) {
    const text = clean(s?.text, 120);
    if (text) skipped.push({ text, reason: clean(s?.reason, 120) || 'not a single-number answer' });
  }
  return { problems, skipped, note: clean(reading?.note, 300) };
}

// Checks an uploaded image. Accepts a data URL or bare base64. Returns { mediaType, data } or { error }.
export function cleanImage(body) {
  let mediaType = typeof body?.mediaType === 'string' ? body.mediaType : '';
  let data = typeof body?.image === 'string' ? body.image : '';
  const m = /^data:([a-z/+.-]+);base64,(.*)$/s.exec(data);
  if (m) [, mediaType, data] = m;
  if (!IMAGE_TYPES.has(mediaType)) return { error: 'Use a photo (JPEG, PNG, WebP or GIF).' };
  data = data.replace(/\s+/g, '');
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { error: 'That photo did not upload properly. Try again.' };
  if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) return { error: 'That photo is too large. Try a smaller one.' };
  return { mediaType, data };
}
