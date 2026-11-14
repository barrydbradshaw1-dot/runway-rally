// Zero-framework HTTP server: JSON API plus static files for the web client.
import http from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStore } from './store.js';
import { mulberry32, THEMES, SKILLS, SKILL_IDS } from './skills.js';
import { recordInterest } from './adaptive.js';
import { loadLtiConfig } from './lti/config.js';
import { createLtiService } from './lti/lti.js';
import { LtiError } from './lti/jwt.js';
import {
  ITEMS,
  CARDS,
  newStudent,
  publicStudent,
  startCommission,
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
} from './logic.js';

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
  items: ITEMS,
  cards: CARDS,
  skills: Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].name])),
  skillInfo: Object.fromEntries(SKILL_IDS.map((id) => [id, { name: SKILLS[id].name, prereq: SKILLS[id].prereq, standard: SKILLS[id].standard }])),
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

// Placeholder nickname filter. Replace with a real moderation list before any pilot with students.
const BLOCKLIST = [];
export function cleanNickname(raw) {
  if (typeof raw !== 'string') return null;
  const n = raw.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  if (n.length < 2) return null;
  if (BLOCKLIST.some((w) => n.toLowerCase().includes(w))) return null;
  return n;
}

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

export function createApp({ store = makeStore(), env = process.env, seed, fetchImpl, now } = {}) {
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

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 10_000) throw new HttpError(413, 'request too large');
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

  // Returns { all: true } for the shared admin token, or { classCode, title } for a Brightspace instructor session.
  function requireTeacher(req) {
    const sess = req.headers['x-lti-session'];
    if (sess) {
      const p = ltiConfig.verifySession(String(sess));
      if (!p || p.kind !== 'teacher' || !p.classCode) throw new HttpError(401, 'your session expired, open Runway Rally from your course again');
      return { all: false, classCode: p.classCode, title: p.title };
    }
    if (!adminToken) throw new HttpError(503, 'admin access is not configured');
    const given = Buffer.from(String(req.headers['x-admin-token'] || ''));
    const want = Buffer.from(adminToken);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'forbidden');
    return { all: true };
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
      const nickname = cleanNickname(body.nickname);
      if (!classCode) throw new HttpError(400, 'enter the class code from your teacher');
      if (!nickname) throw new HttpError(400, 'pick a nickname (2 to 20 letters or numbers)');
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

    if (method === 'GET' && path.startsWith('/api/admin/class/')) {
      // tighter limit than the general one so the admin token cannot be guessed quickly
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = requireTeacher(req);
      const code = cleanClassCode(decodeURIComponent(path.slice('/api/admin/class/'.length)));
      if (!code) throw new HttpError(400, 'bad class code');
      if (!who.all && who.classCode !== code) throw new HttpError(403, 'forbidden');
      const list = await store.listClass(code);
      const cls = await store.getClass(code);
      const out = { classCode: code, title: cls?.contextTitle || null, skills: CATALOG.skills, students: classSummary(list) };
      if (cls?.nrpsUrl) out.roster = await lti.rosterSummary(code, list);
      return send(res, 200, out);
    }

    if (method === 'GET' && path === '/api/admin/me') {
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      const who = requireTeacher(req);
      return send(res, 200, who.all ? { kind: 'admin' } : { kind: 'teacher', classCode: who.classCode, title: who.title });
    }

    // everything below needs a signed-in student
    const me = await auth(req);
    return withLock(me.id, async () => {
      const student = normalizeStudent(await store.getStudentByTokenHash(sha256(/Bearer (\S+)/.exec(req.headers.authorization)[1])));
      const tz = tzOf(req);

      if (method === 'GET' && path === '/api/state') {
        return send(res, 200, { student: pub(student), catalog: CATALOG });
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
        if (body.theme !== undefined && !THEMES.includes(body.theme)) throw new HttpError(400, 'unknown theme');
        const { story, repair } = startCommission(student, { theme: body.theme, rng, now: clock() });
        const task = nextTask(student, rng, { now: clock() });
        await store.saveTask(task);
        await store.saveStudent(student);
        await store.addEvent(student.id, 'commission_start', { skill: student.commission.skill, theme: student.commission.theme, repair });
        return send(res, 200, { story, repair, task: publicTask(task, student.commission), student: pub(student) });
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
          const t = nextTask(student, rng, { now: clock() });
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
        const task = placementTask(student, rng);
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
        const next = placementTask(student, rng);
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
  return { server, store, lti };
}

// Run directly: node src/server.js
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { server, store } = createApp();
  await store.init({ migrate: process.env.AUTO_MIGRATE !== '0' });
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
