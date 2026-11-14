# Runway Rally (starter)

A mobile-first math game for girls 13 to 16: solve math commissions, earn fashion items and collectible cards.
This is the pilot starter for the design in the Runway Rally Game Design Document.

**What works now**
- Browser client (installable PWA): sign in with class code + nickname, pick a themed commission, number pad, layered hints, retries, Thread rewards, item unlocks that appear on the avatar, card packs with a pity rule.
- Server-side grading and rewards. Answers never reach the client.
- Adaptive engine v2 (see "How it teaches" below): 37 skills tied to Georgia's grade 3 to 8 math standards, a short skills check that places each student, worked examples, steadier difficulty, mistake-specific feedback, spaced review, and prerequisite repair after repeated misses. The interest model still follows which areas the student picks (with 20% exploration).
- Sign-in code (`RR-XXXX-XXXX`) so progress follows the student to a new device, and a private read-only family progress page at `/progress/`.
- **Teacher console** at `/admin/`: sign in with the class code and `ADMIN_TOKEN`, then see a mastery heat map by skill, accuracy, favorite game areas, suggested small groups, who has not started, sorting, auto-refresh, and CSV export. A skill is flagged only after 2+ answers with mastery under 40%, or 3 misses in a row. Skills not yet tried are never flagged.
- Postgres storage (or an in-memory store for development), Docker Compose with automatic HTTPS, backup and restore scripts.

**Not built yet (see the GDD roadmap)**: per-teacher accounts (the console uses one shared admin token for now), OneRoster / SSO, offline play queue, data deletion and retention controls, moderation list for nicknames, real art and audio (the avatar is placeholder SVG), content authoring tools, native store builds.

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

## How it teaches

The learning design follows well-established findings: start where the student is, show a worked example before practice, keep success around 70 to 85 percent, give feedback on the actual mistake, space review out over days, and keep sessions short.

- **Skill map.** 37 skills in a prerequisite graph, from times tables through grade 8: exponents, square roots, scientific notation, equations with x on both sides, slope, linear functions and trend lines, systems of equations, the Pythagorean theorem, and volumes of cylinders, cones and spheres. A skill opens when every prerequisite reaches 40 percent. Answers can be whole numbers, negatives, decimals or fractions; fraction-only problems explain kindly when a fraction is not in lowest terms.
- **Georgia standards.** Every skill lists the Georgia K-12 Mathematics Standards it practices (`codes` in `api/src/skills.js`) and the grade where Georgia first teaches it. Students never see codes; the family page and teacher console do. Codes were checked in November 2026 against GaDOE's grade 5 and grade 7 curriculum maps, the K-8 standards document (2021) including its grade 8 section, and the CASE registry at case.georgiastandards.org. Grade 8 matters most: Georgia requires at least Developing Learner on the grade 8 Milestones math test for promotion to grade 9.

  | Grade | Standards covered |
  | --- | --- |
  | 3 to 5 foundations | 3.PAR.3, 3.NR.4, 4.NR.4, 5.NR.3, 5.NR.4 |
  | 6 | 6.NR.1, 6.NR.3, 6.NR.4, 6.PAR.6, 6.PAR.7, 6.PAR.8, 6.GSR.5 |
  | 7 | 7.NR.1, 7.PAR.2, 7.PAR.3, 7.PAR.4, 7.GSR.5, 7.PR.6 |
  | 8 | 8.NR.1, 8.NR.2, 8.PAR.3, 8.PAR.4, 8.FGR.5, 8.FGR.6, 8.FGR.7, 8.GSR.8 |

  Every grade 8 standard has at least one skill. Not covered yet: grade 7 sampling (part of 7.PAR.4), graphing proportional relationships, angle relationships and cross sections (7.GSR.5), and the parts of grade 8 that need drawing rather than a typed answer (sketching graphs, scatter plots, proofs of the Pythagorean theorem).
- **Skills check.** Up to 18 questions, foundations first, no hints and no score, with a "Not sure yet" button. A right answer marks that skill and everything under it as known; a miss (confirmed by a second question on skills many others depend on) marks it and everything built on it as a gap, so a struggling student answers only a few questions. Known skills start at 65 percent, gaps at 20 percent.
- **Worked example.** The first time a student meets a skill at a new level, they see one solved step by step before trying one.
- **Difficulty.** Two misses in a row step down a level, two clean wins step up, and mostly-wrong recent work drops to confidence builders. Easy problems can show at most 60 percent mastery and medium 85 percent, so a skill only reads as mastered after hard problems.
- **Feedback.** Each generator lists likely wrong answers with a short explanation (for example, adding denominators). Sign slips and decimal-place slips are caught for every skill. After two misses they see every step.
- **Spaced review.** A missed skill comes back the next day; clean reviews space out to 3, 7 and 21 days. The 3rd and 5th problems of a commission can be review from another skill. A skill left alone for two weeks fades by 10 points (never below 45 percent) and is queued for review.
- **Rewards tied to learning.** A card pack needs 3 of 5 right or a real mastery gain; otherwise the student still earns Thread for effort and a tip on how to earn the pack.
- **Session length.** After 3 commissions or about 20 active minutes in a day they get one wrap-up screen with the day's totals and streak. They can keep playing.
- **Family page.** "For grown-ups" on the home screen makes a private link (`/progress/#k=...`). It shows minutes and days this week, accuracy, what improved, what they are working on and what could use a hand. The key stays in the link fragment and is sent only in a header; making a new link turns the old one off.

### New endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /api/session` | now also returns `recoveryCode` |
| `POST /api/session/recover` `{code}` | sign in with a recovery code (10 tries a minute per IP) |
| `POST /api/recovery-code` | issue a new code; the old one stops working (not for Brightspace students) |
| `POST /api/placement/start` `{restart?}` | start or resume the skills check |
| `POST /api/placement/answer` `{taskId, answer, skip?}` | answer or skip; returns the next question or a summary |
| `POST /api/placement/skip` | do the check later |
| `POST /api/progress-link` | make a family link; the old one stops working |
| `GET /api/progress` with header `x-progress-key` | read-only family summary (60 a minute per IP) |

The client sends `x-tz-offset` (minutes behind UTC) so days and streaks follow the student's clock. Recovery and progress keys are stored as SHA-256 hashes in the new `student_keys` table (`api/db/schema.sql`), which the server creates on start. Students saved before this version are upgraded in place the next time they load.

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
web/progress/         read-only family progress page
scripts/              droplet setup, deploy, backup, restore test
```

## Adding content

- New math skill: add a generator in `skills.js`, register it in `SKILLS` with its prerequisites, add tests.
- New fashion item or card: add to `ITEMS` / `CARDS` in `logic.js` and draw it in `avatar()` in `web/app.js`.
- A generator returns `answer` (a number), `answerText` (how it is written, such as `3/4` or `-2`), three hints whose last one states `answerText`, and `mistakes` (likely wrong answers with a short explanation). Set `requireFraction` when the answer must be a fraction. The test suite checks every skill, level and theme across hundreds of seeds.

## Safety notes for the pilot

- Only a class code and nickname are collected (or, via Brightspace, an opaque user hash and an auto nickname). No names, emails, locations or free chat unless you opt in with `LTI_STORE_NAMES=1`.
- `cleanNickname` has an empty blocklist. **Add a real moderation list before students use it.**
- Brightspace instructors get course-scoped signed sessions. The shared `ADMIN_TOKEN` (kept in `sessionStorage`, rate limited) is for the developer and for non-Brightspace classes only.
- Student tokens are stored hashed. Student data is isolated by class code in queries, but there is no per-school tenant table yet.
- Have counsel review the privacy posture (COPPA, FERPA, district agreements) before a school pilot.
- Known limit: one request at a time per student is enforced in-process, so run a single API container until you move that lock to the database.
