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

## Brightspace (D2L) setup, LTI 1.3

Runway Rally speaks LTI 1.3 Advantage. Students open it from a Brightspace course and are signed in with no password, no class code and no nickname screen. Instructors who open it land on the teacher console for that one course. Finishing a commission posts a grade to the Brightspace gradebook, and the console shows how many enrolled students have opened the game.

What the tool stores: an opaque hash of the Brightspace user, a nickname like `Designer 4821`, and game progress. **No names or emails are stored** unless you set `LTI_STORE_NAMES=1`, which keeps only `Given F.` (first name and last initial) as the nickname.

### 1. Prerequisites

- The API must be reachable over **https** (Caddy does this for you once `DOMAIN` points at the droplet).
- Generate a signing key once and keep it. Brightspace caches your public key, so changing it breaks launches until the tool is re-registered.

```bash
openssl genrsa 2048 | base64 -w0        # paste the single line into LTI_PRIVATE_KEY_B64
openssl rand -hex 32                    # paste into LTI_SESSION_SECRET
```

### 2. Register the tool in Brightspace (admin)

In Brightspace go to **Admin Tools > Manage Extensibility > LTI Advantage > Register Tool**, choose **Standard**, and fill in the values from `https://YOUR-DOMAIN/lti/info` (it lists them):

| Brightspace field | Value |
|---|---|
| Domain | `https://YOUR-DOMAIN` |
| Redirect URLs | `https://YOUR-DOMAIN/lti/launch` |
| OpenID Connect Login URL | `https://YOUR-DOMAIN/lti/login` |
| Keyset URL | `https://YOUR-DOMAIN/lti/jwks.json` |
| Extensions | **Assignment and Grade Services** and **Names and Role Provisioning Services** |
| Roles | Send the Learner, Instructor, and Teaching Assistant roles |

Save, then create a **Deployment** for the tool: pick the org units (courses or the whole district) that may use it and tick the same two extensions. Add a **Link** to the deployment (for example "Runway Rally") and give it the launch URL `https://YOUR-DOMAIN/lti/launch`. Instructors then add the link to a course module as an external learning tool.

Brightspace now shows the values the tool needs. Copy them down:

- **Client ID**, **Deployment ID**
- Issuer (your Brightspace URL, for example `https://yourdistrict.brightspace.com`)
- **OpenID Connect Authentication Endpoint**, **Keyset URL** (the platform's), **OAuth2 Access Token URL** and **OAuth2 Audience**

### 3. Configure the server

Add to `.env` on the droplet (see `.env.example`), then `./scripts/deploy.sh`:

```bash
LTI_TOOL_URL=https://YOUR-DOMAIN
LTI_PRIVATE_KEY_B64=...
LTI_SESSION_SECRET=...
LTI_PLATFORMS=[{"issuer":"https://yourdistrict.brightspace.com","clientId":"CLIENT_ID","deploymentIds":["DEPLOYMENT_ID"],"authUrl":"https://YOUR-BRIGHTSPACE/d2l/lti/authenticate","tokenUrl":"https://auth.brightspace.com/core/connect/token","audience":"https://api.brightspace.com/auth/token","jwksUrl":"https://YOUR-BRIGHTSPACE/d2l/.well-known/jwks"}]
```

Use the exact endpoint values Brightspace shows you for the three URLs and the audience, because they differ by region and hosting. The platform URLs must be https, and the tool refuses to call any roster or grade URL that is not on the same hosts as the issuer, auth and keyset URLs (add extra hosts with `"serviceOrigins": ["https://..."]` if D2L serves those from a different host). To run several districts, put more objects in the array. If you prefer a file, set `LTI_CONFIG_FILE` to a JSON path instead.

Check it: `curl https://YOUR-DOMAIN/lti/jwks.json` should return one public key, and `curl https://YOUR-DOMAIN/lti/info` lists the registration values.

### 4. Grades

`LTI_SCORE_MODE=completion` (default) sends `finished commissions x 20`, capped at 100. This grades effort, so a student who is still struggling can earn full marks by practicing. `LTI_SCORE_MODE=mastery` sends average mastery (0 to 100) across the skills the student has tried. The first grade creates one "Runway Rally practice" grade column per course and link (out of 100). Make sure the deployment has the grade extension ticked, otherwise nothing is sent. Grade failures are logged and never interrupt play.

### 5. How it fits together

| Step | What happens |
|---|---|
| Launch | Brightspace calls `/lti/login`, the tool redirects back with a one-time `state` and `nonce`, and Brightspace posts a signed token to `/lti/launch`. |
| Checks | RS256 signature against the platform keyset, issuer, audience, expiry, nonce, one-time state, registered deployment, message type, version and role. Anything else is refused with a plain message. |
| Class | One class per Brightspace course, with code `LTI-XXXXXXXX` derived from issuer, deployment and course. |
| Students | A fresh session token is handed to the browser in the URL fragment, which is never sent to a server or logged. Progress follows the Brightspace user across launches and devices. |
| Teachers | A signed 8-hour session scoped to that one course, so an instructor can never see another course. The shared `ADMIN_TOKEN` still works for you as the developer. |
| Roster | The console shows `X of Y enrolled students have opened Runway Rally` from the Brightspace roster (counts only, refreshed every 5 minutes). |

Not supported yet: Deep Linking (add the tool as a link rather than choosing content), and per-assignment grade columns beyond one per link.

### 6. Troubleshooting

- **"This platform is not registered"**: `issuer` or `clientId` in `LTI_PLATFORMS` does not match what Brightspace sends.
- **"This deployment is not registered"**: add the Deployment ID to `deploymentIds`.
- **"The launch could not be verified"**: the platform keyset URL is wrong or Brightspace rotated keys (keys are refetched automatically on an unknown key id).
- **Blank page in the course**: the page must be allowed to load inside the Brightspace frame. The server sets `frame-ancestors` to your platform origins automatically, so check that `issuer` and `authUrl` have the right hosts.
- **No grades**: check the deployment has Assignment and Grade Services ticked and `docker compose logs api` for `grade passback failed`.
- **Launches fail after restart**: you did not set `LTI_PRIVATE_KEY_B64`, so a temporary key was used. Set it and re-save the tool in Brightspace.

Tested against a simulated Brightspace (`api/test/lti.test.js`: fake keyset, token, roster and grade endpoints). **Run one real launch in a sandbox course before a pilot**, since D2L's exact endpoint values and role names are only visible in your own tenant.

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

- Only a class code and nickname are collected (or, via Brightspace, an opaque user hash and an auto nickname). No names, emails, locations or free chat unless you opt in with `LTI_STORE_NAMES=1`.
- `cleanNickname` has an empty blocklist. **Add a real moderation list before students use it.**
- Brightspace instructors get course-scoped signed sessions. The shared `ADMIN_TOKEN` (kept in `sessionStorage`, rate limited) is for the developer and for non-Brightspace classes only.
- Student tokens are stored hashed. Student data is isolated by class code in queries, but there is no per-school tenant table yet.
- Have counsel review the privacy posture (COPPA, FERPA, district agreements) before a school pilot.
- Known limit: one request at a time per student is enforced in-process, so run a single API container until you move that lock to the database.
