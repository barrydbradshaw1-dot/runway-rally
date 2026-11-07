// Apply db/schema.sql to DATABASE_URL (safe to re-run). Usage: npm run migrate
import { PgStore } from './store.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const store = new PgStore(process.env.DATABASE_URL);
await store.init({ migrate: true });
await store.close();
console.log('schema is up to date');
