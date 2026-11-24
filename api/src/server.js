// Zero-framework HTTP server: JSON API plus static files for the web client.
import http from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStore } from './store.js';
import { checkNickname, extraBlocklist } from './nickname.js';
import { mulberry32, THEMES, SKILLS, SKILL_IDS } from './skills.js';
import { recordInterest } from './adaptive.js';
import { loadLtiConfig } from './lti/config.js';
import { createLtiService } from './lti/lti.js';
import { LtiError } from './lti/jwt.js';
import { homeworkConfig, makePhotoReader, ReadError, cleanImage, draftFromReading, cleanAssignment, assignmentOut, assignmentBrief, MAX_ASSIGNMENTS } from './homework.js';
import {
  ITEMS,
  newStudent,
  publicStudent,
  startCommission,
  startAssignment,
  nextTask,
  publicTask,
  giveHint,
  applyAnswer,
  classSummary,
  normalizeStudent,
  startPlacement,
  placementTask,
  applyPlacementAnswer,
  finishPlacement,
  progressSummary,
  setLook,
} from './logic.js';
import { createProspects, buildPitch } from './prospects.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const AREAS = new Set(['jewelry_bench', 'pattern_table', 'runway', 'cards', 'story', 'wardrobe']);

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const CATALOG = {
  items: ITEMS, // skill pieces; reward pieces are listed in web/items.js, which the client loads
  skills: Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].name])),
  skillInfo: Object.fromEntries(SKILL_IDS.map((id) => [id, { name: SKILLS[id].name, prereq: SKILLS[id].prereq, standard: SKILLS[id].standard, codes: SKILLS[id].codes, grade: SKILLS[id].grade }])),
};

// Recovery codes: 8 characters from an alphabet without look-alikes (0/O, 1/I/L), shown as RR-XXXX-XXXX.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newRecoveryCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `RR-${c.slice(0, 4)}-${c.slice(4)}`;
}
export function normalizeRecoveryCode(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  let c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length === 10 && c.startsWith('RR')) c = c.slice(2);
  c = c.replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[2-9A-HJKMNP-Z]{8}$/.test(c) ? c : null;
}

// Class codes made by the server: 8 characters from the same alphabet, shown as ABCD-2345
// (about 850 billion possibilities, and joining is rate limited), so a code cannot be guessed.
export function newClassCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
export function newTeacherKey() {
  return 'rt_' + randomBytes(24).toString('base64url');
}
const DAY_MS = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const cleanDay = (raw) => (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : null);
const cleanName = (raw, max = 60) => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// How long data is kept. Defaults match the written schedule in the README ("Data retention").
export function retentionConfig(env = process.env) {
  const days = (name, def) => {
    const v = env[name];
    if (v === undefined || v === '') return def;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : def;
  };
  return {
    answerDays: days('RETENTION_ANSWER_DAYS', 365),
    inactiveDays: days('RETENTION_INACTIVE_DAYS', 730),
    classEndDays: days('RETENTION_CLASS_END_DAYS', 30),
    auditDays: days('RETENTION_AUDIT_DAYS', 1095),
  };
}

// Nickname filter and real-name check: see nickname.js.
export function cleanNickname(raw, env = process.env) {
  return checkNickname(raw, { extra: extraBlocklist(env) }).nickname ?? null;
}

// The privacy policy a teacher agrees to when making a class. Change it when the policy changes,
// so the console can ask teachers to look again.
export const POLICY_VERSION = '2026-11-24';

export function cleanClassCode(raw) {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{3,20}$/.test(c) ? c : null;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApp({ store = makeStore(), env = process.env, seed, fetchImpl, now, readPhoto } = {}) {
  const rng = seed === undefined ? () => Math.random() : mulberry32(seed);
  const webDir = resolve(env.WEB_DIR || fileURLToPath(new URL('../../web', import.meta.url)));
  const production = env.NODE_ENV === 'production';
  const adminToken = env.ADMIN_TOKEN || (production ? null : 'dev-admin');
  const trustProxy = env.TRUST_PROXY === '1';
  const ltiConfig = loadLtiConfig(env);
  const lti = createLtiService({ store, config: ltiConfig, fetchImpl, now });
  const pub = (s) => ({ ...publicStudent(s), viaLti: Boolean(s.lti) });
  const clock = () => (now ? now() : Date.now());
  // The browser sends its time zone offset (minutes behind UTC) so days and streaks follow her clock.
  const tzOf = (req) => {
    const n = Number(req.headers['x-tz-offset']);
    return Number.isInteger(n) && Math.abs(n) <= 840 ? n : 0;
  };
  const retention = retentionConfig(env);
  // Sales targeting data for the owner (see prospects.js and api/tools/build-school-data.mjs).
  const prospects = createProspects(env.PROSPECTS_DATA_DIR ? { dataDir: resolve(env.PROSPECTS_DATA_DIR) } : {});
  // Homework practice: reading a photo of an assignment needs ANTHROPIC_API_KEY (see homework.js).
  const homework = homeworkConfig(env);
  const photoReader = readPhoto || (homework.photos ? makePhotoReader({ apiKey: env.ANTHROPIC_API_KEY, model: homework.model }) : null);
  const photoDay = { day: '', n: 0 };
  const nicknameExtra = extraBlocklist(env);
  const nicknameOf = (raw) => {
    const r = checkNickname(raw, { extra: nicknameExtra });
    if (r.error) throw new HttpError(400, r.error);
    return r.nickname;
  };
  // A teacher (or the owner) confirms, for each class, that their school has approved Runway Rally
  // and that they have read the privacy policy. This is the school's consent for students under 13.
  const authorization = (who) => ({ at: new Date(clock()).toISOString(), by: actorOf(who), policy: POLICY_VERSION });
  // The phone apps load the game from inside the app (origin capacitor://localhost on iPhone,
  // https://localhost on Android) and call this API across origins. Only these origins get CORS
  // headers, and only on /api/. No cookies are involved: students send a bearer token.
  const appOrigins = new Set(
    (env.APP_ORIGINS ?? 'capacitor://localhost,https://localhost')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  // Deletes what the schedule says is too old. 0 days turns a rule off.
  async function runRetention(at = clock()) {
    const before = (d) => (d > 0 ? new Date(at - d * DAY_MS) : null);
    const result = await store.applyRetention({
      answersBefore: before(retention.answerDays),
      inactiveBefore: before(retention.inactiveDays),
      classesEndedBefore: retention.classEndDays >= 0 ? isoDay(at - retention.classEndDays * DAY_MS) : null,
      auditBefore: before(retention.auditDays),
    });
    if (Object.values(result).some((n) => n > 0)) await store.addAudit('retention', 'retention', result);
    return result;
  }

  async function issueRecoveryCode(student) {
    const code = newRecoveryCode();
    await store.setKey(student.id, 'recovery', sha256('recovery:' + normalizeRecoveryCode(code)));
    return code;
  }

  // --- tiny in-memory rate limiter (per client IP) ---
  const hits = new Map();
  function limited(ip, max, windowMs = 60_000) {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now > h.reset) {
      hits.set(ip, { n: 1, reset: now + windowMs });
      return false;
    }
    h.n += 1;
    return h.n > max;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  }, 60_000);
  sweep.unref();

  // --- per-student lock so two quick taps cannot race a read-modify-write ---
  const locks = new Map();
  async function withLock(id, fn) {
    const prev = locks.get(id) || Promise.resolve();
    let release;
    const next = new Promise((r) => (release = r));
    locks.set(id, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(id) === next) locks.delete(id);
    }
  }

  const clientIp = (req) =>
    (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

  async function readJson(req, limit = 10_000) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'request too large');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid JSON');
    }
  }

  function send(res, status, body, headers = {}) {
    const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
    const payload = isObj ? JSON.stringify(body) : body;
    res.writeHead(status, {
      'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(payload);
  }

  async function auth(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, 'sign in first');
    const student = await store.getStudentByTokenHash(sha256(m[1]));
    if (!student) throw new HttpError(401, 'session not found');
    return student;
  }

  // Who is using the teacher console:
  //   { role: 'owner' }                       ADMIN_TOKEN: the server owner, sees every class
  //   { role: 'teacher', teacherId, name }    a teacher's own key: only the classes they created
  //   { role: 'lti', classCode, title }       a Brightspace instructor: only that course
  async function requireTeacher(req) {
    const sess = req.headers['x-lti-session'];
    if (sess) {
      const p = ltiConfig.verifySession(String(sess));
      if (!p || p.kind !== 'teacher' || !p.classCode) throw new HttpError(401, 'your session expired, open Runway Rally from your course again');
      return { role: 'lti', classCode: p.classCode, title: p.title };
    }
    const raw = String(req.headers['x-admin-token'] || '');
    if (/^rt_[A-Za-z0-9_-]{32}$/.test(raw)) {
      const t = await store.getTeacherByKeyHash(sha256('teacher:' + raw));
      if (!t) throw new HttpError(403, 'forbidden');
      return { role: 'teacher', teacherId: t.id, name: t.name };
    }
    if (!adminToken) throw new HttpError(503, 'admin access is not configured');
    const given = Buffer.from(raw);
    const want = Buffer.from(adminToken);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'forbidden');
    return { role: 'owner' };
  }
  function requireOwner(who) {
    if (who.role !== 'owner') throw new HttpError(403, 'only the server owner can do that');
  }
  async function canManage(who, code) {
    if (who.role === 'owner') return true;
    if (who.role === 'lti') return who.classCode === code;
    const c = await store.getClass(code);
    return Boolean(c && c.teacherId === who.teacherId);
  }
  const actorOf = (who) => (who.role === 'teacher' ? `teacher:${who.teacherId}` : who.role === 'lti' ? `lti:${who.classCode}` : 'owner');
  const classOut = (c) => ({
    code: c.code,
    name: c.name || c.contextTitle || null,
    kind: c.kind || (c.code.startsWith('LTI-') ? 'lti' : 'manual'),
    teacherId: c.teacherId || null,
    endsOn: c.endsOn || null,
    joinOpen: c.joinOpen !== false,
    spanish: c.spanish === true,
    authorizedAt: c.authorization?.at || null,
    authorizedPolicy: c.authorization?.policy || null,
    createdAt: c.createdAt || null,
    students: c.students ?? null,
  });

  // The class has the Spanish help ("Ver en español") turned on. Off unless a teacher turns it on.
  async function spanishOn(student) {
    if (!student.classCode) return false;
    const c = await store.getClass(student.classCode);
    return c?.spanish === true;
  }

  // The teacher's assignments that students can play right now (titles only, no problems).
  async function liveAssignments(student) {
    if (!student.classCode) return [];
    const c = await store.getClass(student.classCode);
    return (c?.assignments || []).filter((a) => a.live === true).map(assignmentBrief);
  }

  async function taskFor(student) {
    if (!student.commission || !student.currentTaskId) return null;
    const task = await store.getTask(student.currentTaskId);
    return task && !task.answered ? task : null;
  }

  // ---------------- API routes ----------------
  async function api(req, res, url) {
    const { method } = req;
    const path = url.pathname;

    if (method === 'POST' && path === '/api/session') {
      const body = await readJson(req);
      const classCode = cleanClassCode(body.classCode);
      if (!classCode) throw new HttpError(400, 'enter the class code from your teacher');
      const nickname = nicknameOf(body.nickname);
      // only classes a teacher created can be joined, and wrong guesses are limited
      if (limited('join:' + clientIp(req), 20)) throw new HttpError(429, 'too many tries, wait a minute');
      const cls = await store.getClass(classCode);
      if (!cls || cls.kind !== 'manual') throw new HttpError(404, 'that class code did not match a class. Check it with your teacher');
      if (cls.endsOn && cls.endsOn < isoDay(clock())) throw new HttpError(403, 'that class has ended');
      if (cls.joinOpen === false) throw new HttpError(403, 'that class is not taking new students. Ask your teacher');
      // the same nickname twice would quietly start that student over and give the teacher two rows with one name
      const sameName = (a) => String(a || '').trim().toLowerCase() === nickname.trim().toLowerCase();
      if ((await store.listClass(classCode)).some((s) => sameName(s.nickname))) {
        throw new HttpError(
          409,
          `Someone in this class already uses the nickname ${nickname}. If that is you, tap "Played before? Use your sign-in code" below. Lost your code? Your teacher can give you a new one. Otherwise, pick a different nickname`,
        );
      }
      const token = randomBytes(24).toString('base64url');
      const student = newStudent({ id: randomUUID(), classCode, nickname });
      await store.createStudent(student, sha256(token));
      const recoveryCode = await issueRecoveryCode(student);
      await store.addEvent(student.id, 'session_start');
      return send(res, 201, { token, recoveryCode, student: pub(student) });
    }

    // Sign back in on a new device (or after clearing the browser) with the recovery code.
    if (method === 'POST' && path === '/api/session/recover') {
      if (limited('recover:' + clientIp(req), 10)) throw new HttpError(429, 'too many tries, wait a minute');
      const body = await readJson(req);
      const code = normalizeRecoveryCode(body.code);
      if (!code) throw new HttpError(400, 'that code does not look right. It looks like RR-ABCD-2345');
      const found = await store.getStudentByKey('recovery', sha256('recovery:' + code));
      if (!found) throw new HttpError(404, 'that code did not match anyone. Check it and try again');
      const student = normalizeStudent(found);
      const token = randomBytes(24).toString('base64url');
      await store.addToken(student.id, sha256(token));
      await store.addEvent(student.id, 'session_recover');
      return send(res, 200, { token, student: pub(student) });
    }

    // Family progress page: read-only, opened with a private link the student's family keeps.
    if (method === 'GET' && path === '/api/progress') {
      if (limited('progress:' + clientIp(req), 60)) throw new HttpError(429, 'too many tries, wait a minute');
      const key = String(req.headers['x-progress-key'] || '');
      if (!/^[A-Za-z0-9_-]{32,64}$/.test(key)) throw new HttpError(401, 'this progress link is not valid');
      const found = await store.getStudentByKey('progress', sha256('progress:' + key));
      if (!found) throw new HttpError(404, 'this progress link was replaced or is not valid. Ask for a new one');
      return send(res, 200, progressSummary(found, { now: clock(), tz: tzOf(req) }));
    }

    // ----- homework practice: the teacher's own assignments (see homework.js) -----
    //   POST   /api/admin/class/CODE/homework/read         read a photo of a blank assignment (nothing is kept)
    //   POST   /api/admin/class/CODE/assignments           save a new assignment
    //   PUT    /api/admin/class/CODE/assignments/ID        replace one
    //   PATCH  /api/admin/class/CODE/assignments/ID        { live } shows or hides it for students
    //   DELETE /api/admin/class/CODE/assignments/ID
    {
      const m = /^\/api\/admin\/class\/([^/]+)\/(homework\/read|assignments)(?:\/([0-9a-f-]{36}))?$/.exec(path);
      if (m) {
        if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
        const who = await requireTeacher(req);
        const code = cleanClassCode(decodeURIComponent(m[1]));
        if (!code) throw new HttpError(400, 'bad class code');
        if (!(await canManage(who, code))) throw new HttpError(403, 'forbidden');
        if (!(await store.getClass(code))) throw new HttpError(404, 'class not found');

        if (m[2] === 'homework/read') {
          if (method !== 'POST' || m[3]) throw new HttpError(404, 'not found');
          if (!photoReader) throw new HttpError(503, 'Reading photos is turned off on this server. You can still type the problems in.');
          // The photo stays in memory for this one request. It is never saved or logged.
          const img = cleanImage(await readJson(req, 7_500_000));
          if (img.error) throw new HttpError(400, img.error);
          if (limited('photo:' + actorOf(who), 20, 10 * 60_000)) throw new HttpError(429, 'That is a lot of photos at once. Wait a few minutes and try again.');
          const today = isoDay(clock());
          if (photoDay.day !== today) Object.assign(photoDay, { day: today, n: 0 });
          if (photoDay.n >= homework.dailyLimit) throw new HttpError(429, 'Photo reading has reached its limit for today. You can still type the problems in.');
          photoDay.n += 1;
          let reading;
          try {
            reading = await photoReader(img);
          } catch (err) {
            if (err instanceof ReadError) throw new HttpError(422, err.message);
            console.error('photo reading failed', err?.status ?? '', err?.name ?? '');
            throw new HttpError(502, 'The photo could not be read right now. Try again in a minute, or type the problems in.');
          }
          const draft = draftFromReading(reading);
          await store.addAudit(actorOf(who), 'read_homework_photo', { classCode: code, problems: draft.problems.length });
          return send(res, 200, draft);
        }

        return withLock('class:' + code, async () => {
          const cls = await store.getClass(code);
          const list = Array.isArray(cls.assignments) ? cls.assignments : [];
          const at = new Date(clock()).toISOString();
          if (!m[3]) {
            if (method !== 'POST') throw new HttpError(405, 'method not allowed');
            if (list.length >= MAX_ASSIGNMENTS) throw new HttpError(409, `A class can have up to ${MAX_ASSIGNMENTS} assignments. Delete an old one first.`);
            const r = cleanAssignment(await readJson(req, 200_000));
            if (r.error) throw new HttpError(400, r.error);
            const a = { id: randomUUID(), ...r.assignment, createdAt: at, updatedAt: at };
            await store.upsertClass(code, { assignments: [a, ...list] });
            await store.addAudit(actorOf(who), 'add_assignment', { classCode: code, problems: a.problems.length });
            return send(res, 201, { assignment: assignmentOut(a) });
          }
          const k = list.findIndex((a) => a.id === m[3]);
          if (k < 0) throw new HttpError(404, 'that assignment was not found');
          if (method === 'DELETE') {
            await store.upsertClass(code, { assignments: list.filter((_, j) => j !== k) });
            await store.addAudit(actorOf(who), 'delete_assignment', { classCode: code });
            return send(res, 200, { deleted: true });
          }
          if (method === 'PATCH') {
            const body = await readJson(req);
            if (typeof body.live !== 'boolean') throw new HttpError(400, 'live should be true or false');
            const a = { ...list[k], live: body.live, updatedAt: at };
            await store.upsertClass(code, { assignments: list.map((x, j) => (j === k ? a : x)) });
            return send(res, 200, { assignment: assignmentOut(a) });
          }
          if (method === 'PUT') {
            const r = cleanAssignment(await readJson(req, 200_000));
            if (r.error) throw new HttpError(400, r.error);
            const a = { ...list[k], ...r.assignment, updatedAt: at };
            await store.upsertClass(code, { assignments: list.map((x, j) => (j === k ? a : x)) });
            await store.addAudit(actorOf(who), 'edit_assignment', { classCode: code, problems: a.problems.length });
            return send(res, 200, { assignment: assignmentOut(a) });
          }
          throw new HttpError(405, 'method not allowed');
        });
      }
    }

    if (method === 'GET' && path.startsWith('/api/admin/class/')) {
      // tighter limit than the general one so the admin token cannot be guessed quickly
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      const rest = path.slice('/api/admin/class/'.length).split('/');
      const code = cleanClassCode(decodeURIComponent(rest[0]));
      if (!code) throw new HttpError(400, 'bad class code');
      if (!(await canManage(who, code))) throw new HttpError(403, 'forbidden');
      // Everything kept about one student, for a school's or family's request to see it (FERPA).
      if (rest.length === 4 && rest[1] === 'student' && UUID.test(rest[2]) && rest[3] === 'export') {
        const s = await store.getStudent(rest[2]);
        if (!s || s.classCode !== code) throw new HttpError(404, 'that student is not in this class');
        const [tasks, events] = await Promise.all([store.listTasks(s.id), store.listEvents(s.id)]);
        await store.addAudit(actorOf(who), 'export_student', { classCode: code, students: 1 });
        const day = isoDay(clock());
        return send(
          res,
          200,
          {
            about: 'Everything Runway Rally keeps about this student. Sign-in tokens, the recovery code and the family link are stored only as one-way hashes, so they are not included.',
            exportedAt: new Date(clock()).toISOString(),
            classCode: code,
            student: s,
            problems: tasks,
            activity: events,
          },
          { 'content-disposition': `attachment; filename="runway-rally-${code}-${String(s.nickname || 'student').replace(/[^A-Za-z0-9_-]/g, '_')}-${day}.json"` },
        );
      }
      if (rest.length !== 1) throw new HttpError(404, 'not found');
      const list = await store.listClass(code);
      const cls = await store.getClass(code);
      const out = {
        classCode: code,
        title: cls?.contextTitle || cls?.name || null,
        endsOn: cls?.endsOn || null,
        joinOpen: cls ? cls.joinOpen !== false : false,
        spanish: cls?.spanish === true,
        authorizedAt: cls?.authorization?.at || null,
        authorizedPolicy: cls?.authorization?.policy || null,
        policyVersion: POLICY_VERSION,
        kind: cls ? classOut(cls).kind : 'unregistered',
        skills: CATALOG.skills,
        skillInfo: CATALOG.skillInfo,
        students: classSummary(list),
        assignments: (cls?.assignments || []).map(assignmentOut),
        homework: { photos: Boolean(photoReader) },
      };
      if (cls?.nrpsUrl) out.roster = await lti.rosterSummary(code, list);
      return send(res, 200, out);
    }

    // ----- a new sign-in code for a student who lost theirs (the old code stops working) -----
    if (method === 'POST' && /^\/api\/admin\/class\/[^/]+\/student\/[0-9a-f-]{36}\/sign-in-code$/.test(path)) {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      const rest = path.slice('/api/admin/class/'.length).split('/');
      const code = cleanClassCode(decodeURIComponent(rest[0]));
      if (!code) throw new HttpError(400, 'bad class code');
      if (!(await canManage(who, code))) throw new HttpError(403, 'forbidden');
      if (!UUID.test(rest[2])) throw new HttpError(404, 'not found');
      const s = await store.getStudent(rest[2]);
      if (!s || s.classCode !== code) throw new HttpError(404, 'that student is not in this class');
      if (s.lti) throw new HttpError(400, 'Brightspace students sign in through Brightspace and do not need a code');
      const recoveryCode = await issueRecoveryCode(s);
      await store.addEvent(s.id, 'recovery_code_new', { by: 'teacher' });
      await store.addAudit(actorOf(who), 'new_sign_in_code', { classCode: code, students: 1 });
      return send(res, 200, { nickname: s.nickname, recoveryCode });
    }

    // ----- deleting student data (a school's deletion request; Georgia asks for it within 45 days) -----
    if (method === 'DELETE' && path.startsWith('/api/admin/class/')) {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      const rest = path.slice('/api/admin/class/'.length).split('/');
      const code = cleanClassCode(decodeURIComponent(rest[0]));
      if (!code) throw new HttpError(400, 'bad class code');
      if (!(await canManage(who, code))) throw new HttpError(403, 'forbidden');
      if (rest.length === 3 && rest[1] === 'student' && UUID.test(rest[2])) {
        const n = await store.deleteStudent(code, rest[2]);
        if (!n) throw new HttpError(404, 'that student is not in this class');
        await store.addAudit(actorOf(who), 'delete_student', { classCode: code, students: 1 });
        return send(res, 200, { deleted: 1 });
      }
      if (rest.length !== 1) throw new HttpError(404, 'not found');
      const body = await readJson(req);
      if (cleanClassCode(body.confirm) !== code) throw new HttpError(400, 'type the class code to confirm');
      const n = await store.deleteClass(code);
      await store.addAudit(actorOf(who), 'delete_class', { classCode: code, students: n });
      return send(res, 200, { deleted: n });
    }

    if (method === 'PATCH' && path.startsWith('/api/admin/class/')) {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      const rest = path.slice('/api/admin/class/'.length).split('/');
      const code = cleanClassCode(decodeURIComponent(rest[0]));
      if (!code) throw new HttpError(400, 'bad class code');
      if (!(await canManage(who, code))) throw new HttpError(403, 'forbidden');
      // a teacher renames a student whose nickname is unkind or is a real name,
      // or sets Spanish to show first for an English learner (no tap needed on the student's side)
      if (rest.length === 3 && rest[1] === 'student' && UUID.test(rest[2])) {
        const body = await readJson(req);
        const rename = body.nickname !== undefined;
        const setEs = body.spanishFirst !== undefined;
        if (!rename && !setEs) throw new HttpError(400, 'nothing to change');
        if (setEs && typeof body.spanishFirst !== 'boolean') throw new HttpError(400, 'spanishFirst should be true or false');
        const nickname = rename ? nicknameOf(body.nickname) : null;
        const saved = await withLock(rest[2], async () => {
          const s = await store.getStudent(rest[2]);
          if (!s || s.classCode !== code) return null;
          if (rename) s.nickname = nickname;
          if (setEs) s.spanishFirst = body.spanishFirst;
          await store.saveStudent(s);
          return s;
        });
        if (!saved) throw new HttpError(404, 'that student is not in this class');
        if (rename) await store.addAudit(actorOf(who), 'rename_student', { classCode: code, students: 1 });
        if (setEs) await store.addAudit(actorOf(who), 'spanish_first', { classCode: code, students: 1, on: body.spanishFirst });
        return send(res, 200, { nickname: saved.nickname, spanishFirst: saved.spanishFirst === true });
      }
      if (rest.length !== 1) throw new HttpError(404, 'not found');
      const cls = await store.getClass(code);
      if (!cls) throw new HttpError(404, 'class not found');
      const body = await readJson(req);
      const patch = {};
      if (body.joinOpen !== undefined) {
        if (typeof body.joinOpen !== 'boolean') throw new HttpError(400, 'joinOpen should be true or false');
        patch.joinOpen = body.joinOpen;
      }
      if (body.spanish !== undefined) {
        if (typeof body.spanish !== 'boolean') throw new HttpError(400, 'spanish should be true or false');
        patch.spanish = body.spanish;
      }
      if (body.agree === true) patch.authorization = authorization(who);
      if (body.name !== undefined) patch.name = cleanName(body.name) || cls.name;
      if (body.endsOn !== undefined) {
        if (body.endsOn !== null && !cleanDay(body.endsOn)) throw new HttpError(400, 'the end date should look like 2027-06-01');
        patch.endsOn = body.endsOn;
      }
      if (who.role === 'owner' && body.teacherId !== undefined) patch.teacherId = body.teacherId && UUID.test(body.teacherId) ? body.teacherId : null;
      return send(res, 200, { class: classOut(await store.upsertClass(code, patch)) });
    }

    if (method === 'GET' && path === '/api/admin/me') {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      const common = { retention, policyVersion: POLICY_VERSION };
      if (who.role === 'owner') return send(res, 200, { kind: 'owner', ...common });
      if (who.role === 'teacher') return send(res, 200, { kind: 'teacher', name: who.name, ...common });
      return send(res, 200, { kind: 'lti', classCode: who.classCode, title: who.title, ...common });
    }

    // ----- classes: a teacher creates a class and gets a code that cannot be guessed -----
    if (path === '/api/admin/classes') {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      if (method === 'GET') {
        if (who.role === 'lti') {
          const c = await store.getClass(who.classCode);
          return send(res, 200, { classes: c ? [classOut({ ...c, students: (await store.listClass(c.code)).length })] : [] });
        }
        const list = await store.listClasses(who.role === 'owner' ? { includeUnregistered: true } : { teacherId: who.teacherId });
        return send(res, 200, { classes: list.map(classOut) });
      }
      if (method === 'POST') {
        if (who.role === 'lti') throw new HttpError(403, 'Brightspace courses get their class automatically');
        const body = await readJson(req);
        const name = cleanName(body.name);
        if (!name) throw new HttpError(400, 'give the class a name, like Period 3 Math');
        if (body.agree !== true) throw new HttpError(400, 'tick the box to confirm your school has approved Runway Rally and you have read the privacy policy');
        const endsOn = body.endsOn ? cleanDay(body.endsOn) : null;
        if (body.endsOn && !endsOn) throw new HttpError(400, 'the end date should look like 2027-06-01');
        let teacherId = who.role === 'teacher' ? who.teacherId : null;
        if (who.role === 'owner' && body.teacherId) {
          if (!UUID.test(body.teacherId)) throw new HttpError(400, 'unknown teacher');
          teacherId = body.teacherId;
        }
        const data = { kind: 'manual', name, endsOn, joinOpen: true, authorization: authorization(who), createdAt: new Date(clock()).toISOString(), ...(teacherId ? { teacherId } : {}) };
        // the owner may register a code students already use (classes made before teacher logins)
        if (who.role === 'owner' && body.code) {
          const code = cleanClassCode(body.code);
          if (!code || code.startsWith('LTI-')) throw new HttpError(400, 'bad class code');
          const made = await store.createClass(code, data);
          if (!made) throw new HttpError(409, 'that class code is already registered');
          return send(res, 201, { class: classOut(made) });
        }
        for (let i = 0; i < 5; i++) {
          const made = await store.createClass(newClassCode(), data);
          if (made) return send(res, 201, { class: classOut(made) });
        }
        throw new HttpError(500, 'could not make a class code, try again');
      }
      throw new HttpError(405, 'method not allowed');
    }

    // ----- teacher logins (owner only) -----
    if (path === '/api/admin/teachers' || path.startsWith('/api/admin/teachers/')) {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = await requireTeacher(req);
      requireOwner(who);
      if (path === '/api/admin/teachers') {
        if (method === 'GET') return send(res, 200, { teachers: await store.listTeachers() });
        if (method === 'POST') {
          const body = await readJson(req);
          const name = cleanName(body.name);
          if (!name) throw new HttpError(400, "enter the teacher's name");
          const key = newTeacherKey();
          const teacher = { id: randomUUID(), name, keyHash: sha256('teacher:' + key) };
          await store.createTeacher(teacher);
          await store.addAudit('owner', 'add_teacher', { teacherId: teacher.id });
          return send(res, 201, { teacher: { id: teacher.id, name }, key });
        }
        throw new HttpError(405, 'method not allowed');
      }
      const [id, sub] = path.slice('/api/admin/teachers/'.length).split('/');
      if (!UUID.test(id)) throw new HttpError(404, 'not found');
      if (method === 'POST' && sub === 'key') {
        const key = newTeacherKey();
        if (!(await store.setTeacherKey(id, sha256('teacher:' + key)))) throw new HttpError(404, 'teacher not found');
        await store.addAudit('owner', 'new_teacher_key', { teacherId: id });
        return send(res, 200, { key });
      }
      if (method === 'DELETE' && !sub) {
        if (!(await store.deleteTeacher(id))) throw new HttpError(404, 'teacher not found');
        await store.addAudit('owner', 'remove_teacher', { teacherId: id });
        return send(res, 200, { removed: true });
      }
      throw new HttpError(404, 'not found');
    }

    // ----- sales targeting (owner only): districts, schools and pitches for /admin/prospects/ -----
    //   GET  /api/admin/prospects/states      every state, with what data has been built
    //   GET  /api/admin/prospects/state/GA    one state's districts and schools
    //   POST /api/admin/prospects/pitch       { state, district, school?, price, sender, recipient } -> email and proposal
    if (path.startsWith('/api/admin/prospects/')) {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      requireOwner(await requireTeacher(req));
      if (method === 'GET' && path === '/api/admin/prospects/states') return send(res, 200, { states: await prospects.states() });
      const one = /^\/api\/admin\/prospects\/state\/([A-Z]{2})$/.exec(path);
      if (method === 'GET' && one) {
        const st = await prospects.state(one[1]);
        if (!st) throw new HttpError(404, 'unknown state');
        return send(res, 200, st);
      }
      if (method === 'POST' && path === '/api/admin/prospects/pitch') {
        const body = await readJson(req);
        const st = typeof body.state === 'string' ? await prospects.state(body.state.toUpperCase()) : null;
        if (!st) throw new HttpError(404, 'unknown state');
        const district = st.districts.find((d) => d.id === String(body.district || ''));
        if (!district) throw new HttpError(404, 'unknown district');
        let school = null;
        if (body.school) {
          school = st.schools.find((x) => x.id === String(body.school) && x.district === district.id);
          if (!school) throw new HttpError(404, 'unknown school');
        }
        const sender = body.sender && typeof body.sender === 'object' ? body.sender : {};
        return send(res, 200, buildPitch({ st, district, school, price: body.price, sender, recipient: body.recipient }));
      }
      throw new HttpError(404, 'not found');
    }

    if (method === 'GET' && path === '/api/admin/audit') {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      requireOwner(await requireTeacher(req));
      return send(res, 200, { entries: await store.listAudit(200) });
    }

    // everything below needs a signed-in student
    const me = await auth(req);
    return withLock(me.id, async () => {
      const student = normalizeStudent(await store.getStudentByTokenHash(sha256(/Bearer (\S+)/.exec(req.headers.authorization)[1])));
      const tz = tzOf(req);

      if (method === 'GET' && path === '/api/state') {
        return send(res, 200, { student: pub(student), catalog: CATALOG, assignments: await liveAssignments(student) });
      }

      if (method === 'POST' && path === '/api/event') {
        const body = await readJson(req);
        if (!AREAS.has(body.area)) throw new HttpError(400, 'unknown area');
        recordInterest(student.interest, body.area, 1);
        await store.saveStudent(student);
        await store.addEvent(student.id, 'area_open', { area: body.area });
        return send(res, 200, { ok: true });
      }

      if (method === 'POST' && path === '/api/commission/start') {
        const body = await readJson(req);
        const existing = await taskFor(student);
        if (existing) {
          return send(res, 200, { resumed: true, task: publicTask(existing, student.commission), student: pub(student) });
        }
        if (body.assignmentId !== undefined) {
          const cls = student.classCode ? await store.getClass(student.classCode) : null;
          const a = (cls?.assignments || []).find((x) => x.id === body.assignmentId && x.live === true);
          if (!a) throw new HttpError(404, 'that assignment is not available any more');
          const { story } = startAssignment(student, a, { now: clock() });
          const task = nextTask(student, rng, { now: clock() });
          await store.saveTask(task);
          await store.saveStudent(student);
          await store.addEvent(student.id, 'commission_start', { skill: task.skill, theme: 'runway', assignment: a.id });
          return send(res, 200, { story, repair: false, task: publicTask(task, student.commission), student: pub(student) });
        }
        if (body.theme !== undefined && !THEMES.includes(body.theme)) throw new HttpError(400, 'unknown theme');
        const es = await spanishOn(student);
        const { story, storyEs, repair } = startCommission(student, { theme: body.theme, rng, now: clock(), es });
        const task = nextTask(student, rng, { now: clock(), es });
        await store.saveTask(task);
        await store.saveStudent(student);
        await store.addEvent(student.id, 'commission_start', { skill: student.commission.skill, theme: student.commission.theme, repair });
        return send(res, 200, { story, ...(storyEs ? { storyEs } : {}), repair, task: publicTask(task, student.commission), student: pub(student) });
      }

      if (method === 'POST' && path === '/api/hint') {
        const body = await readJson(req);
        const task = await store.getTask(String(body.taskId));
        if (!task || task.studentId !== student.id) throw new HttpError(404, 'task not found');
        const h = giveHint(task);
        if (h.error) throw new HttpError(409, h.error);
        await store.saveTask(task);
        await store.addEvent(student.id, 'hint', { skill: task.skill, level: h.level });
        return send(res, 200, h);
      }

      if (method === 'POST' && path === '/api/answer') {
        const body = await readJson(req);
        const task = await store.getTask(String(body.taskId));
        if (!task || task.studentId !== student.id) throw new HttpError(404, 'task not found');
        if (task.placement) throw new HttpError(409, 'answer skills check questions with /api/placement/answer');
        const result = applyAnswer(student, task, body.answer, rng, { now: clock(), tz });
        if (result.error) throw new HttpError(409, result.error);
        await store.saveTask(task);
        let next = null;
        if (!result.retry && !result.commissionComplete) {
          const t = nextTask(student, rng, { now: clock(), es: await spanishOn(student) });
          await store.saveTask(t);
          next = publicTask(t, student.commission);
        }
        await store.saveStudent(student);
        if (result.commissionComplete) lti.schedulePostScore(student);
        await store.addEvent(student.id, 'answer', {
          skill: task.skill,
          level: task.level,
          correct: result.correct,
          retry: result.retry,
          hintLevel: task.hintLevel,
          review: task.review,
        });
        return send(res, 200, { ...result, next, student: pub(student) });
      }

      // ----- placement check -----
      if (method === 'POST' && path === '/api/placement/start') {
        const body = await readJson(req);
        const p = student.placement;
        if (p?.status === 'active' && p.taskId && !body.restart) {
          const t = await store.getTask(p.taskId);
          if (t && !t.answered) return send(res, 200, { resumed: true, task: publicTask(t), student: pub(student) });
        }
        startPlacement(student, { now: clock() });
        const task = placementTask(student, rng, { es: await spanishOn(student) });
        await store.saveTask(task);
        await store.saveStudent(student);
        await store.addEvent(student.id, 'placement_start');
        return send(res, 200, { task: publicTask(task), student: pub(student) });
      }

      if (method === 'POST' && path === '/api/placement/answer') {
        const body = await readJson(req);
        const task = await store.getTask(String(body.taskId));
        if (!task || task.studentId !== student.id || !task.placement) throw new HttpError(404, 'question not found');
        const r = applyPlacementAnswer(student, task, body.answer, { skip: body.skip === true });
        if (r.error) throw new HttpError(409, r.error);
        await store.saveTask(task);
        const next = placementTask(student, rng, { es: await spanishOn(student) });
        let summary = null;
        if (next) await store.saveTask(next);
        else summary = finishPlacement(student, { now: clock() });
        await store.saveStudent(student);
        await store.addEvent(student.id, summary ? 'placement_done' : 'placement_answer', { skill: task.skill, skipped: body.skip === true });
        return send(res, 200, { next: next ? publicTask(next) : null, summary, student: pub(student) });
      }

      if (method === 'POST' && path === '/api/placement/skip') {
        if (!student.placement || student.placement.status !== 'done') student.placement = { status: 'skipped', results: {}, misses: {}, asked: 0, taskId: null };
        await store.saveStudent(student);
        return send(res, 200, { student: pub(student) });
      }

      // ----- recovery code and family link (each new one replaces the old one) -----
      if (method === 'POST' && path === '/api/recovery-code') {
        if (student.lti) throw new HttpError(400, 'you sign in through your school, so you do not need a code');
        const code = await issueRecoveryCode(student);
        await store.addEvent(student.id, 'recovery_code_new');
        return send(res, 200, { recoveryCode: code });
      }

      // "My look": the features and styles the student picked for their designer.
      if (method === 'POST' && path === '/api/look') {
        const body = await readJson(req);
        if (!body.look || typeof body.look !== 'object' || Array.isArray(body.look)) throw new HttpError(400, 'send a look');
        setLook(student, body.look, { wardrobe: body.wardrobe === true });
        await store.saveStudent(student);
        return send(res, 200, { student: pub(student) });
      }

      // A student (or their grown-up) deletes their own data from the app. Apple requires this
      // for apps where people create an account. The nickname must be typed to confirm.
      if (method === 'DELETE' && path === '/api/me') {
        const body = await readJson(req);
        const typed = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
        if (!typed || typed !== String(student.nickname || '').trim().toLowerCase()) throw new HttpError(400, 'type your nickname to confirm');
        const n = await store.deleteStudent(student.classCode, student.id);
        await store.addAudit('student', 'delete_self', { classCode: student.classCode, students: n });
        return send(res, 200, { deleted: n });
      }

      if (method === 'POST' && path === '/api/progress-link') {
        const key = randomBytes(24).toString('base64url');
        await store.setKey(student.id, 'progress', sha256('progress:' + key));
        await store.addEvent(student.id, 'progress_link_new');
        return send(res, 200, { path: `/progress/#k=${key}` });
      }

      throw new HttpError(404, 'not found');
    });
  }

  // ---------------- LTI 1.3 ----------------
  async function readForm(req, max = 64_000) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > max) throw new LtiError(413, 'The request was too large.');
      chunks.push(c);
    }
    return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  }

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function ltiError(res, status, message) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Runway Rally</title><link rel="stylesheet" href="/styles.css"></head><body><main class="card"><h1>Runway Rally</h1><p>${esc(message)}</p></main></body></html>`;
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  }

  async function ltiRoute(req, res, url) {
    const path = url.pathname;
    if (path === '/lti/jwks.json' && req.method === 'GET') {
      return send(res, 200, lti.jwksDocument(), { 'cache-control': 'public, max-age=300' });
    }
    if (path === '/lti/info' && req.method === 'GET') return send(res, 200, lti.info());
    if (!ltiConfig.enabled) return ltiError(res, 404, 'Brightspace sign-in is not set up on this server.');
    if (limited('lti:' + clientIp(req), 120)) return ltiError(res, 429, 'Too many launches at once. Try again in a minute.');
    try {
      if (path === '/lti/login' && (req.method === 'GET' || req.method === 'POST')) {
        const params = req.method === 'POST' ? await readForm(req) : Object.fromEntries(url.searchParams);
        res.writeHead(302, { location: lti.login(params), 'cache-control': 'no-store' });
        return res.end();
      }
      if (path === '/lti/launch' && req.method === 'POST') {
        const out = await lti.launch(await readForm(req));
        res.writeHead(303, { location: out.location, 'cache-control': 'no-store' });
        return res.end();
      }
    } catch (err) {
      if (err instanceof LtiError) return ltiError(res, err.status, err.message);
      console.error('lti error', err);
      return ltiError(res, 500, 'Something went wrong opening Runway Rally. Please try again.');
    }
    return ltiError(res, 404, 'Not found.');
  }

  // ---------------- static files ----------------
  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(webDir, rel));
    if (file !== webDir && !file.startsWith(webDir + sep)) throw new HttpError(403, 'forbidden');
    let target = file;
    try {
      const st = await stat(target);
      if (st.isDirectory()) target = join(target, 'index.html');
    } catch {
      target = join(webDir, 'index.html'); // single-page app fallback
    }
    let data;
    try {
      data = await readFile(target);
    } catch {
      throw new HttpError(404, 'not found');
    }
    const ext = extname(target);
    const noCache = target.endsWith('index.html') || target.endsWith('sw.js');
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  const frameAncestors = ltiConfig.enabled && ltiConfig.frameAncestors.length ? ltiConfig.frameAncestors.join(' ') : "'none'";
  const server = http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors ${frameAncestors}; base-uri 'none'`,
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (url.pathname.startsWith('/lti/')) return await ltiRoute(req, res, url);
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && appOrigins.has(origin)) {
          res.setHeader('access-control-allow-origin', origin);
          res.setHeader('vary', 'origin');
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'access-control-allow-methods': 'GET, POST, DELETE',
              'access-control-allow-headers': 'content-type, authorization, x-tz-offset',
              'access-control-max-age': '600',
            });
            return res.end();
          }
        }
        const ip = clientIp(req);
        if (limited(ip, 600)) throw new HttpError(429, 'slow down a little');
        return await api(req, res, url);
      }
      return await serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error('unhandled error', err);
      return send(res, 500, { error: 'something went wrong' });
    }
  });
  server.on('close', () => clearInterval(sweep));
  return { server, store, lti, runRetention };
}

// Run directly: node src/server.js
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { server, store, runRetention } = createApp();
  await store.init({ migrate: process.env.AUTO_MIGRATE !== '0' });
  // the retention schedule runs once at start and then every day
  const prune = () => runRetention().then((r) => console.log('retention', JSON.stringify(r))).catch((err) => console.error('retention failed', err.message));
  prune();
  setInterval(prune, 86_400_000).unref();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`Runway Rally API on ${host}:${port} (${process.env.DATABASE_URL ? 'postgres' : 'memory store'})`));
  const stop = async () => {
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
