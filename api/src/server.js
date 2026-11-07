// Zero-framework HTTP server: JSON API plus static files for the web client.
import http from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStore } from './store.js';
import { mulberry32, THEMES, SKILLS, SKILL_IDS } from './skills.js';
import { recordInterest } from './adaptive.js';
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
};

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

export function createApp({ store = makeStore(), env = process.env, seed } = {}) {
  const rng = seed === undefined ? () => Math.random() : mulberry32(seed);
  const webDir = resolve(env.WEB_DIR || fileURLToPath(new URL('../../web', import.meta.url)));
  const production = env.NODE_ENV === 'production';
  const adminToken = env.ADMIN_TOKEN || (production ? null : 'dev-admin');
  const trustProxy = env.TRUST_PROXY === '1';

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

  function requireAdmin(req) {
    if (!adminToken) throw new HttpError(503, 'admin access is not configured');
    const given = Buffer.from(String(req.headers['x-admin-token'] || ''));
    const want = Buffer.from(adminToken);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'forbidden');
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
      await store.addEvent(student.id, 'session_start');
      return send(res, 201, { token, student: publicStudent(student) });
    }

    if (method === 'GET' && path.startsWith('/api/admin/class/')) {
      // tighter limit than the general one so the admin token cannot be guessed quickly
      if (limited('admin:' + clientIp(req), 30)) throw new HttpError(429, 'too many attempts, wait a minute');
      requireAdmin(req);
      const code = cleanClassCode(decodeURIComponent(path.slice('/api/admin/class/'.length)));
      if (!code) throw new HttpError(400, 'bad class code');
      return send(res, 200, { classCode: code, skills: CATALOG.skills, students: classSummary(await store.listClass(code)) });
    }

    // everything below needs a signed-in student
    const me = await auth(req);
    return withLock(me.id, async () => {
      const student = await store.getStudentByTokenHash(sha256(/Bearer (\S+)/.exec(req.headers.authorization)[1]));

      if (method === 'GET' && path === '/api/state') {
        return send(res, 200, { student: publicStudent(student), catalog: CATALOG });
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
          return send(res, 200, { resumed: true, task: publicTask(existing, student.commission), student: publicStudent(student) });
        }
        if (body.theme !== undefined && !THEMES.includes(body.theme)) throw new HttpError(400, 'unknown theme');
        const { story, repair } = startCommission(student, { theme: body.theme, rng });
        const task = nextTask(student, rng);
        await store.saveTask(task);
        await store.saveStudent(student);
        await store.addEvent(student.id, 'commission_start', { skill: student.commission.skill, theme: student.commission.theme, repair });
        return send(res, 200, { story, repair, task: publicTask(task, student.commission), student: publicStudent(student) });
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
        const result = applyAnswer(student, task, body.answer, rng);
        if (result.error) throw new HttpError(409, result.error);
        await store.saveTask(task);
        let next = null;
        if (!result.retry && !result.commissionComplete) {
          const t = nextTask(student, rng);
          await store.saveTask(t);
          next = publicTask(t, student.commission);
        }
        await store.saveStudent(student);
        await store.addEvent(student.id, 'answer', {
          skill: task.skill,
          level: task.level,
          correct: result.correct,
          retry: result.retry,
          hintLevel: task.hintLevel,
        });
        return send(res, 200, { ...result, next, student: publicStudent(student) });
      }

      throw new HttpError(404, 'not found');
    });
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

  const server = http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return send(res, 200, { ok: true });
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
  return { server, store };
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
