# Runway Rally (starter)

A mobile-first math game for girls 13 to 16: solve math commissions, earn fashion items and collectible cards.
This is the pilot starter for the design in the Runway Rally Game Design Document.

**What works now**
- Browser client (installable PWA): sign in with class code + nickname, pick a themed commission, number pad, layered hints, retries, Thread rewards, item unlocks that appear on the avatar, card packs with a pity rule.
- Server-side grading and rewards. Answers never reach the client.
- Adaptive engine v1: per-skill mastery, difficulty levels, prerequisite repair after repeated misses, interest model that follows which areas she picks (with 20% exploration).
- **Teacher console** at `/admin/`: sign in with the class code and `ADMIN_TOKEN`, then see a mastery heat map by skill, accuracy, favorite game areas, suggested small groups, who has not started, sorting, auto-refresh, and CSV export. A skill is flagged only after 2+ answers with mastery under 40%, or 3 misses in a row. Skills not yet tried are never flagged.
- Postgres storage (or an in-memory store for development), Docker Compose with automatic HTTPS, backup and restore scripts.

**Not built yet (see the GDD roadmap)**: per-teacher accounts (the console uses one shared admin token for now), LTI 1.3 / OneRoster / SSO, offline play queue, moderation list for nicknames, real art and audio (the avatar is placeholder SVG), content authoring tools, native store builds.

## Run it locally (no database needed)

```bash
cd api
npm install
npm test            # unit tests + API tests
npm start           # http://localhost:3000  (memory store, admin token "dev-admin")
```

Run the API tests against a real Postgres: `TEST_DATABASE_URL=postgres://user:pass@host/db node --test test/api.test.js`

Teacher console: open `http://localhost:3000/admin/` and use class code of your choice with token `dev-admin`. Students join at `http://localhost:3000/`.

The same data as JSON:
```bash
curl -H "x-admin-token: dev-admin" http://localhost:3000/api/admin/class/MATH-7A
```

## Deploy to a DigitalOcean droplet

1. **Point DNS**: an A record for your hostname (for example `rally.example.com`) to the droplet IP.
2. **Harden once, as root**: `bash scripts/setup-droplet.sh` installs Docker, enables the firewall (22, 80, 443), fail2ban, and creates a non-root `rally` user. Open a second terminal and confirm `ssh rally@<ip>` works before closing the root session.
3. **As `rally`**: clone the repo, `cp .env.example .env`, and fill it in (`DOMAIN`, `ADMIN_TOKEN`, database option A or B).
4. **Start**: `bash scripts/deploy.sh`. Caddy gets the HTTPS certificate automatically.
5. **Before any real student signs in**: `bash scripts/backup.sh` then `bash scripts/restore-test.sh`, and schedule the backup with cron. Managed Postgres users rely on the provider's backups and should test a restore there.

Update later with `git pull && bash scripts/deploy.sh`.

Database choice: bundled Postgres (`--profile localdb`, the default when `.env` points at host `db`) or DigitalOcean Managed Postgres (recommended for real classrooms because backups and patching are handled).

## Layout

```
api/src/skills.js     skill graph and problem generators (templates, fresh variants)
api/src/adaptive.js   mastery, difficulty, repair, interest model
api/src/logic.js      commissions, grading, rewards, unlocks, card packs, pity
api/src/server.js     HTTP API + static files, rate limiting, security headers
api/src/store.js      memory and Postgres storage
api/db/schema.sql     tables (student state as JSONB for the pilot)
web/                  student PWA (no build step)
web/admin/            teacher console
scripts/              droplet setup, deploy, backup, restore test
```

## Adding content

- New math skill: add a generator in `skills.js`, register it in `SKILLS` with its prerequisites, add tests.
- New fashion item or card: add to `ITEMS` / `CARDS` in `logic.js` and draw it in `avatar()` in `web/app.js`.
- A generator must return integer answers and a final hint that states the answer. The test suite checks this across hundreds of seeds.

## Safety notes for the pilot

- Only a class code and nickname are collected. No names, emails, locations or free chat.
- `cleanNickname` has an empty blocklist. **Add a real moderation list before students use it.**
- The admin token is a single shared secret kept in `sessionStorage` (cleared when the tab closes), and the admin endpoint is rate limited. Move to per-teacher accounts before more than one school uses it.
- Student tokens are stored hashed. Student data is isolated by class code in queries, but there is no per-school tenant table yet.
- Have counsel review the privacy posture (COPPA, FERPA, district agreements) before a school pilot.
- Known limit: one request at a time per student is enforced in-process, so run a single API container until you move that lock to the database.
