// Storage adapters. MemoryStore needs nothing and is used for development and tests.
// PgStore is used when DATABASE_URL is set.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export class MemoryStore {
  constructor() {
    this.students = new Map();
    this.byToken = new Map();
    this.tasks = new Map();
    this.events = [];
    this.classes = new Map();
    this.keys = new Map(); // `${kind}:${hash}` -> studentId (recovery codes, family progress links)
    this.teachers = new Map(); // id -> { id, name, keyHash, createdAt }
    this.audit = [];
    this.updatedAt = new Map(); // studentId -> ms of the last save (for the inactivity rule)
    this.taskAt = new Map(); // taskId -> ms the task was created
  }
  async init() {}
  async setKey(studentId, kind, keyHash) {
    for (const [k, id] of this.keys) if (id === studentId && k.startsWith(kind + ':')) this.keys.delete(k);
    this.keys.set(`${kind}:${keyHash}`, studentId);
  }
  async getStudentByKey(kind, keyHash) {
    const id = this.keys.get(`${kind}:${keyHash}`);
    return id && this.students.has(id) ? structuredClone(this.students.get(id)) : null;
  }
  async addToken(studentId, tokenHash) {
    this.byToken.set(tokenHash, studentId);
  }
  async getStudentByLtiKey(key) {
    for (const s of this.students.values()) if (s.lti?.ltiKey === key) return structuredClone(s);
    return null;
  }
  async upsertClass(code, patch) {
    const merged = { code, ...(this.classes.get(code) || {}), ...patch };
    this.classes.set(code, merged);
    return structuredClone(merged);
  }
  async getClass(code) {
    const c = this.classes.get(code);
    return c ? structuredClone(c) : null;
  }
  async createStudent(student, tokenHash) {
    this.students.set(student.id, structuredClone(student));
    this.byToken.set(tokenHash, student.id);
    this.updatedAt.set(student.id, Date.now());
  }
  async getStudentByTokenHash(hash) {
    const id = this.byToken.get(hash);
    return id ? structuredClone(this.students.get(id)) : null;
  }
  async saveStudent(student) {
    if (!this.students.has(student.id)) return; // deleted meanwhile: do not bring it back
    this.students.set(student.id, structuredClone(student));
    this.updatedAt.set(student.id, Date.now());
  }
  async saveTask(task) {
    if (task.studentId && !this.students.has(task.studentId)) return;
    if (!this.taskAt.has(task.id)) this.taskAt.set(task.id, Date.now());
    this.tasks.set(task.id, structuredClone(task));
  }
  async getTask(id) {
    const t = this.tasks.get(id);
    return t ? structuredClone(t) : null;
  }
  async addEvent(studentId, type, payload = {}) {
    this.events.push({ studentId, type, payload, at: new Date().toISOString() });
    if (this.events.length > 5000) this.events.shift();
  }
  async listClass(classCode) {
    return [...this.students.values()].filter((s) => s.classCode === classCode).map((s) => structuredClone(s));
  }

  // ----- teachers and classes -----
  async createTeacher(t) {
    this.teachers.set(t.id, { ...t, createdAt: new Date().toISOString() });
  }
  async getTeacherByKeyHash(keyHash) {
    for (const t of this.teachers.values()) if (t.keyHash === keyHash) return { id: t.id, name: t.name };
    return null;
  }
  async listTeachers() {
    return [...this.teachers.values()].map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, classes: [...this.classes.values()].filter((c) => c.teacherId === t.id).length }));
  }
  async setTeacherKey(id, keyHash) {
    const t = this.teachers.get(id);
    if (!t) return false;
    t.keyHash = keyHash;
    return true;
  }
  async deleteTeacher(id) {
    if (!this.teachers.delete(id)) return false;
    for (const c of this.classes.values()) if (c.teacherId === id) delete c.teacherId;
    return true;
  }
  async createClass(code, data) {
    if (this.classes.has(code)) return null;
    const c = { code, ...data };
    this.classes.set(code, c);
    return structuredClone(c);
  }
  async listClasses({ teacherId = null, includeUnregistered = false } = {}) {
    const count = (code) => [...this.students.values()].filter((s) => s.classCode === code).length;
    const out = [...this.classes.values()].filter((c) => !teacherId || c.teacherId === teacherId).map((c) => ({ ...structuredClone(c), students: count(c.code) }));
    if (includeUnregistered) {
      const extra = new Set([...this.students.values()].map((s) => s.classCode).filter((code) => !this.classes.has(code)));
      for (const code of extra) out.push({ code, kind: 'unregistered', students: count(code) });
    }
    return out;
  }

  // ----- deletion -----
  #dropStudent(id) {
    this.students.delete(id);
    this.updatedAt.delete(id);
    for (const [h, sid] of this.byToken) if (sid === id) this.byToken.delete(h);
    for (const [k, sid] of this.keys) if (sid === id) this.keys.delete(k);
    for (const [tid, t] of this.tasks) if (t.studentId === id) this.tasks.delete(tid), this.taskAt.delete(tid);
    this.events = this.events.filter((e) => e.studentId !== id);
  }
  async deleteStudent(classCode, id) {
    const s = this.students.get(id);
    if (!s || s.classCode !== classCode) return 0;
    this.#dropStudent(id);
    return 1;
  }
  async deleteClass(code) {
    const ids = [...this.students.values()].filter((s) => s.classCode === code).map((s) => s.id);
    for (const id of ids) this.#dropStudent(id);
    this.classes.delete(code);
    return ids.length;
  }
  async addAudit(actor, action, detail = {}) {
    this.audit.push({ at: new Date().toISOString(), actor, action, detail });
  }
  async listAudit(limit = 100) {
    return this.audit.slice(-limit).reverse();
  }

  // ----- retention (see README "Data retention") -----
  async applyRetention({ answersBefore, inactiveBefore, classesEndedBefore, auditBefore }) {
    const out = { events: 0, tasks: 0, students: 0, classes: 0, classStudents: 0, audit: 0 };
    if (answersBefore) {
      const cut = answersBefore.getTime();
      const n = this.events.length;
      this.events = this.events.filter((e) => Date.parse(e.at) >= cut);
      out.events = n - this.events.length;
      const keep = new Set();
      for (const s of this.students.values()) {
        if (s.currentTaskId) keep.add(s.currentTaskId);
        if (s.placement?.taskId) keep.add(s.placement.taskId);
      }
      for (const [id] of this.tasks) {
        if ((this.taskAt.get(id) ?? 0) < cut && !keep.has(id)) this.tasks.delete(id), this.taskAt.delete(id), out.tasks++;
      }
    }
    if (inactiveBefore) {
      const cut = inactiveBefore.getTime();
      for (const [id, at] of [...this.updatedAt]) if (at < cut) this.#dropStudent(id), out.students++;
    }
    if (classesEndedBefore) {
      for (const c of [...this.classes.values()]) {
        if (c.endsOn && c.endsOn < classesEndedBefore) (out.classStudents += await this.deleteClass(c.code)), out.classes++;
      }
    }
    if (auditBefore) {
      const n = this.audit.length;
      this.audit = this.audit.filter((a) => Date.parse(a.at) >= auditBefore.getTime());
      out.audit = n - this.audit.length;
    }
    return out;
  }
  async close() {}
}

export class PgStore {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
  }
  async init({ migrate = true } = {}) {
    const { default: pg } = await import('pg');
    const ssl = process.env.PGSSLMODE === 'disable' ? false : process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined;
    this.pool = new pg.Pool({ connectionString: this.connectionString, max: 10, ssl });
    // the database container may still be starting: retry for about a minute
    for (let attempt = 1; ; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        break;
      } catch (err) {
        if (attempt >= 30) throw err;
        console.log(`waiting for the database (${attempt}/30): ${err.code || err.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (migrate) {
      const sql = await readFile(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
      await this.pool.query(sql);
    }
  }
  async createStudent(student, tokenHash) {
    await this.pool.query('INSERT INTO students (id, class_code, token_hash, data) VALUES ($1,$2,$3,$4)', [
      student.id,
      student.classCode,
      tokenHash,
      student,
    ]);
  }
  async getStudentByTokenHash(hash) {
    const r = await this.pool.query(
      `SELECT data FROM students WHERE token_hash = $1
       UNION ALL
       SELECT s.data FROM student_tokens t JOIN students s ON s.id = t.student_id WHERE t.token_hash = $1
       LIMIT 1`,
      [hash],
    );
    return r.rows[0]?.data ?? null;
  }
  async addToken(studentId, tokenHash) {
    await this.pool.query('INSERT INTO student_tokens (token_hash, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [tokenHash, studentId]);
  }
  async setKey(studentId, kind, keyHash) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM student_keys WHERE student_id = $1 AND kind = $2', [studentId, kind]);
      await c.query('INSERT INTO student_keys (key_hash, student_id, kind) VALUES ($1,$2,$3)', [keyHash, studentId, kind]);
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }
  async getStudentByKey(kind, keyHash) {
    const r = await this.pool.query('SELECT s.data FROM student_keys k JOIN students s ON s.id = k.student_id WHERE k.key_hash = $1 AND k.kind = $2', [keyHash, kind]);
    return r.rows[0]?.data ?? null;
  }
  async getStudentByLtiKey(key) {
    const r = await this.pool.query("SELECT data FROM students WHERE data->>'ltiKey' = $1 OR data->'lti'->>'ltiKey' = $1 LIMIT 1", [key]);
    return r.rows[0]?.data ?? null;
  }
  async upsertClass(code, patch) {
    const r = await this.pool.query(
      `INSERT INTO classes (code, data) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET data = classes.data || EXCLUDED.data, updated_at = now()
       RETURNING data`,
      [code, { code, ...patch }],
    );
    return r.rows[0].data;
  }
  async getClass(code) {
    const r = await this.pool.query('SELECT data FROM classes WHERE code = $1', [code]);
    return r.rows[0]?.data ?? null;
  }
  async saveStudent(student) {
    await this.pool.query('UPDATE students SET data = $2, updated_at = now() WHERE id = $1', [student.id, student]);
  }
  async saveTask(task) {
    await this.pool.query(
      'INSERT INTO tasks (id, student_id, data) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [task.id, task.studentId, task],
    );
  }
  async getTask(id) {
    const r = await this.pool.query('SELECT data FROM tasks WHERE id = $1', [id]);
    return r.rows[0]?.data ?? null;
  }
  async addEvent(studentId, type, payload = {}) {
    await this.pool.query('INSERT INTO events (student_id, type, payload) VALUES ($1,$2,$3)', [studentId, type, payload]);
  }
  async listClass(classCode) {
    const r = await this.pool.query('SELECT data FROM students WHERE class_code = $1 ORDER BY created_at', [classCode]);
    return r.rows.map((x) => x.data);
  }

  // ----- teachers and classes -----
  async createTeacher({ id, name, keyHash }) {
    await this.pool.query('INSERT INTO teachers (id, name, key_hash) VALUES ($1,$2,$3)', [id, name, keyHash]);
  }
  async getTeacherByKeyHash(keyHash) {
    const r = await this.pool.query('SELECT id, name FROM teachers WHERE key_hash = $1', [keyHash]);
    return r.rows[0] ?? null;
  }
  async listTeachers() {
    const r = await this.pool.query(
      `SELECT t.id, t.name, t.created_at AS "createdAt",
              (SELECT count(*)::int FROM classes c WHERE c.data->>'teacherId' = t.id::text) AS classes
       FROM teachers t ORDER BY t.created_at`,
    );
    return r.rows;
  }
  async setTeacherKey(id, keyHash) {
    const r = await this.pool.query('UPDATE teachers SET key_hash = $2 WHERE id = $1', [id, keyHash]);
    return r.rowCount > 0;
  }
  async deleteTeacher(id) {
    const r = await this.pool.query('DELETE FROM teachers WHERE id = $1', [id]);
    if (!r.rowCount) return false;
    await this.pool.query("UPDATE classes SET data = data - 'teacherId', updated_at = now() WHERE data->>'teacherId' = $1", [id]);
    return true;
  }
  async createClass(code, data) {
    const r = await this.pool.query('INSERT INTO classes (code, data) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING data', [code, { code, ...data }]);
    return r.rows[0]?.data ?? null;
  }
  async listClasses({ teacherId = null, includeUnregistered = false } = {}) {
    const r = await this.pool.query(
      `SELECT c.data, (SELECT count(*)::int FROM students s WHERE s.class_code = c.code) AS n
       FROM classes c WHERE $1::text IS NULL OR c.data->>'teacherId' = $1 ORDER BY c.updated_at DESC`,
      [teacherId],
    );
    const out = r.rows.map((x) => ({ ...x.data, students: x.n }));
    if (includeUnregistered) {
      const u = await this.pool.query(
        'SELECT class_code AS code, count(*)::int AS n FROM students WHERE class_code NOT IN (SELECT code FROM classes) GROUP BY class_code ORDER BY class_code',
      );
      for (const x of u.rows) out.push({ code: x.code, kind: 'unregistered', students: x.n });
    }
    return out;
  }

  // ----- deletion (tasks, events, tokens and keys go with the student: ON DELETE CASCADE) -----
  async deleteStudent(classCode, id) {
    const r = await this.pool.query('DELETE FROM students WHERE id = $1 AND class_code = $2', [id, classCode]);
    return r.rowCount;
  }
  async deleteClass(code) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query('DELETE FROM students WHERE class_code = $1', [code]);
      await c.query('DELETE FROM classes WHERE code = $1', [code]);
      await c.query('COMMIT');
      return r.rowCount;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }
  async addAudit(actor, action, detail = {}) {
    await this.pool.query('INSERT INTO audit_log (actor, action, detail) VALUES ($1,$2,$3)', [actor, action, detail]);
  }
  async listAudit(limit = 100) {
    const r = await this.pool.query('SELECT at, actor, action, detail FROM audit_log ORDER BY at DESC LIMIT $1', [limit]);
    return r.rows;
  }

  // ----- retention (see README "Data retention") -----
  async applyRetention({ answersBefore, inactiveBefore, classesEndedBefore, auditBefore }) {
    const out = { events: 0, tasks: 0, students: 0, classes: 0, classStudents: 0, audit: 0 };
    if (answersBefore) {
      out.events = (await this.pool.query('DELETE FROM events WHERE at < $1', [answersBefore])).rowCount;
      out.tasks = (
        await this.pool.query(
          `DELETE FROM tasks t WHERE t.created_at < $1 AND NOT EXISTS (
             SELECT 1 FROM students s WHERE s.id = t.student_id
               AND (s.data->>'currentTaskId' = t.id::text OR s.data->'placement'->>'taskId' = t.id::text))`,
          [answersBefore],
        )
      ).rowCount;
    }
    if (inactiveBefore) out.students = (await this.pool.query('DELETE FROM students WHERE updated_at < $1', [inactiveBefore])).rowCount;
    if (classesEndedBefore) {
      const r = await this.pool.query("SELECT code FROM classes WHERE data->>'endsOn' IS NOT NULL AND data->>'endsOn' < $1", [classesEndedBefore]);
      for (const { code } of r.rows) {
        out.classStudents += await this.deleteClass(code);
        out.classes++;
      }
    }
    if (auditBefore) out.audit = (await this.pool.query('DELETE FROM audit_log WHERE at < $1', [auditBefore])).rowCount;
    return out;
  }
  async close() {
    await this.pool?.end();
  }
}

export function makeStore(env = process.env) {
  return env.DATABASE_URL ? new PgStore(env.DATABASE_URL) : new MemoryStore();
}
