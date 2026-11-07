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
  }
  async init() {}
  async createStudent(student, tokenHash) {
    this.students.set(student.id, structuredClone(student));
    this.byToken.set(tokenHash, student.id);
  }
  async getStudentByTokenHash(hash) {
    const id = this.byToken.get(hash);
    return id ? structuredClone(this.students.get(id)) : null;
  }
  async saveStudent(student) {
    this.students.set(student.id, structuredClone(student));
  }
  async saveTask(task) {
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
    const r = await this.pool.query('SELECT data FROM students WHERE token_hash = $1', [hash]);
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
  async close() {
    await this.pool?.end();
  }
}

export function makeStore(env = process.env) {
  return env.DATABASE_URL ? new PgStore(env.DATABASE_URL) : new MemoryStore();
}
