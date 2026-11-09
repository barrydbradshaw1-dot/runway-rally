import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNickname } from '../src/server.js';
import { MemoryStore } from '../src/store.js';
import { newStudent } from '../src/logic.js';

test('nickname filter blocks rude names, including letter swaps, and keeps normal ones', () => {
  for (const bad of ['fuck', 'Sh1t', 'b!tch', 'p0rn', 's e x', 'n-i-g-g', 'KYS']) assert.equal(cleanNickname(bad), null, bad);
  for (const ok of ['Mira', 'Star_Girl7', 'Hana-chan', 'Luna']) assert.equal(cleanNickname(ok), ok);
});

test('purge removes a student, a class, or inactive students with all their data', async () => {
  const store = new MemoryStore();
  const mk = async (id, classCode, created) => {
    const s = newStudent({ id, classCode, nickname: id });
    s.createdAt = created;
    await store.createStudent(s, `hash-${id}`);
    await store.saveTask({ id: `t-${id}`, studentId: id });
    await store.addEvent(id, 'hint', {});
    return s;
  };
  await mk('a', 'C1', new Date().toISOString());
  await mk('b', 'C1', new Date().toISOString());
  await mk('c', 'C2', new Date(Date.now() - 400 * 86400000).toISOString());
  assert.equal(await store.purge({ studentId: 'a' }, { dryRun: true }), 1);
  assert.equal(store.students.size, 3); // dry run changes nothing
  assert.equal(await store.purge({ studentId: 'a' }), 1);
  assert.equal(await store.getTask('t-a'), null);
  assert.equal(await store.getStudentByTokenHash('hash-a'), null);
  assert.ok(!store.events.some((e) => e.studentId === 'a'));
  assert.equal(await store.purge({ inactiveDays: 365 }), 1); // only c
  assert.equal(store.students.has('c'), false);
  assert.equal(await store.purge({ classCode: 'C1' }), 1); // b
  assert.equal(store.students.size, 0);
});
