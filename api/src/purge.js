// Delete student data for a privacy request or retention. Usage (from api/):
//   node src/purge.js --student <uuid>            count only; add --yes to delete
//   node src/purge.js --class <CODE> --yes        delete a whole class and its students
//   node src/purge.js --inactive-days 365 --yes   delete students with no activity for a year
import { PgStore } from './store.js';

const args = process.argv.slice(2);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const where = val('--student') ? { studentId: val('--student') } : val('--class') ? { classCode: val('--class').toUpperCase() } : val('--inactive-days') ? { inactiveDays: Number(val('--inactive-days')) } : null;
if (!where || !process.env.DATABASE_URL || (where.inactiveDays !== undefined && !(where.inactiveDays >= 30))) {
  console.error('Usage: DATABASE_URL=... node src/purge.js (--student ID | --class CODE | --inactive-days N>=30) [--yes]');
  process.exit(1);
}
const store = new PgStore(process.env.DATABASE_URL);
await store.init({ migrate: false });
const yes = args.includes('--yes');
const n = await store.purge(where, { dryRun: !yes });
console.log(yes ? `deleted ${n} student(s) and their tasks, events and tokens` : `would delete ${n} student(s). Add --yes to do it.`);
await store.close();
