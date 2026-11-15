// Copies the student game from ../web into www/ for the phone apps and points it at your server.
//
//   RR_API_BASE=https://rally.example.com RR_PRIVACY_URL=https://rally.example.com/privacy npm run web
//
// RR_PRIVACY_URL is optional here but both stores want the privacy policy reachable inside the app,
// so set it for store builds. It shows as a "Privacy policy" link under "For grown-ups".
//
// Left out on purpose: the teacher console (admin/), the family progress page (progress/), and the
// service worker (the app already carries its files). Those stay on the website.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'web');
const out = join(here, '..', 'www');
const SKIP = new Set(['admin', 'progress', 'sw.js', 'manifest.webmanifest']);

export function checkApiBase(raw, { allowHttp = false } = {}) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    throw new Error('Set RR_API_BASE to your Runway Rally address, for example RR_API_BASE=https://rally.example.com');
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new Error('RR_API_BASE must start with https://');
  if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) throw new Error('RR_API_BASE must be just the address, like https://rally.example.com');
  return u.origin;
}

const escAttr = (v) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function checkPrivacyUrl(raw) {
  if (!raw) return '';
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('RR_PRIVACY_URL must be a full https:// address');
  }
  if (u.protocol !== 'https:') throw new Error('RR_PRIVACY_URL must start with https://');
  return u.href;
}

export function appIndexHtml(html, apiBase, privacyUrl = '') {
  const metas = [`<meta name="rr-api" content="${escAttr(apiBase)}" />`];
  if (privacyUrl) metas.push(`<meta name="rr-privacy" content="${escAttr(privacyUrl)}" />`);
  return html
    .replace(/\s*<link rel="manifest"[^>]*>/, '')
    .replace('<meta charset="utf-8" />', ['<meta charset="utf-8" />', ...metas].join('\n    '));
}

export async function buildWeb({ apiBase, privacyUrl = '', from = src, to = out } = {}) {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  await cp(from, to, {
    recursive: true,
    filter: (p) => {
      const rel = relative(from, p);
      return !rel || !SKIP.has(rel.split(sep)[0]);
    },
  });
  const index = join(to, 'index.html');
  await writeFile(index, appIndexHtml(await readFile(index, 'utf8'), apiBase, privacyUrl));
  return to;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (!existsSync(src)) throw new Error(`cannot find the web client at ${src}`);
    const apiBase = checkApiBase(process.env.RR_API_BASE, { allowHttp: process.env.RR_ALLOW_HTTP === '1' });
    const privacyUrl = checkPrivacyUrl(process.env.RR_PRIVACY_URL);
    await buildWeb({ apiBase, privacyUrl });
    console.log(`www/ is ready and talks to ${apiBase}`);
    if (!privacyUrl) console.log('Note: RR_PRIVACY_URL is not set. Set it before a store build.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
