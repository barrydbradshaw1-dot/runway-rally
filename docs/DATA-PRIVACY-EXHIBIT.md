# Data elements, purposes and controls (DRAFT for lawyer review)

Use this as the data schedule ("Exhibit B") for a district Student Data Privacy Agreement. Georgia districts commonly use the
national agreement from the Student Data Privacy Consortium (Access 4 Learning) with a state addendum. This table is a
factual starting point, not legal advice. Verify against the current agreement text.

| Category | Element | Stored? | Where | Purpose |
|---|---|---|---|---|
| Application technology metadata | Nickname chosen by student | Yes | Server database | Show progress to teacher |
| Application technology metadata | Class code | Yes | Server database | Group students by class |
| Student work / progress | Skill mastery, answers correct/incorrect, hints used, cards, items, commissions | Yes | Server database | Adapt difficulty, teacher report |
| Application technology metadata | Activity events (hint, explain, answer) with timestamps | Yes | Server database | Teacher report, debugging |
| Online identifier (LTI only) | Opaque user id (`sub`), course id, deployment id, grade-service links | Yes (LTI classes) | Server database | Link student to course, send grades |
| Name (only if school enables) | First name + last initial | Optional, off by default | Server database | Teacher roster clarity |
| Avatar choices | Skin tone, hair, eyes, clothing options | **No** | Student's own browser only | Personalization |
| Photo (optional selfie) | Image | **No, never uploaded or saved** | Read in browser memory, discarded | Suggest avatar colors |
| Contact info | Email, phone, address | **Not collected** | n/a | n/a |
| Demographics | Race, ethnicity, gender, birth date | **Not collected** | n/a | n/a |
| Location | Any | **Not collected** | n/a | n/a |
| IP address | Client IP | Not stored; used transiently for rate limiting | Server memory | Abuse prevention |

## Subprocessors
- DigitalOcean (hosting, and managed database or backups if enabled). Add the provider's DPA reference: [__].
- Caddy / Let's Encrypt (TLS certificates; no student data).
- No analytics, advertising or AI providers receive student data.

## Controls
- Encryption in transit (HTTPS). Encryption at rest: provider disk encryption [verify and document].
- Sign-in tokens hashed (SHA-256). Teacher console requires a secret or LTI instructor launch.
- Deletion: `npm run purge` (student, class, or inactivity). See Operator Runbook below.
- Backups: `scripts/backup.sh`; retention [__] days. Deleted students remain in backups until they expire: state this in the agreement.
- Nickname filter blocks common profanity; teachers can see all nicknames.
- Breach notice: [__ hours/days per agreement]; contact support@nexusdataengineering.com.

## Operator runbook: deletion requests
From the server, in `api/` with `DATABASE_URL` set:
```
npm run purge -- --student <uuid>            # shows a count; add --yes to delete
npm run purge -- --class MATH-7A --yes       # delete a whole class
npm run purge -- --inactive-days 365 --yes   # retention sweep
```
Run the retention sweep on a schedule (monthly) and log the result.

## Open items before a pilot
1. Lawyer review of both documents and the district's agreement (Georgia addendum).
2. Fill the bracketed items (breach timeline, retention periods, provider DPA, encryption-at-rest statement).
3. Confirm with the district whether students under 13 are authorized by the school (COPPA school-authorization route).
4. Decide who may request deletion (school only, or parents directly) and document the verification step.
5. Add a short incident-response plan (who is called, how schools are told).
6. Add a plain-language student notice on the login screen (what is stored; "do not use your real name").
