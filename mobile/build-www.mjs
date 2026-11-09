// Copy ../web into ./www for the app and point it at the live server.
// Usage: API_URL=https://your-domain node build-www.mjs
import { cp, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const api = (process.env.API_URL || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(api)) {
  console.error('Set API_URL to your HTTPS server, for example: API_URL=https://nexusdataengineering.com');
  process.exit(1);
}
const root = new URL('.', import.meta.url);
const www = fileURLToPath(new URL('www', root));
await rm(www, { recursive: true, force: true });
await cp(fileURLToPath(new URL('../web', root)), www, { recursive: true });
await rm(`${www}/admin`, { recursive: true, force: true }); // the teacher console stays on the web
await rm(`${www}/sw.js`, { force: true }); // the app is its own shell; no service worker
await writeFile(`${www}/config.js`, `window.RR = { api: ${JSON.stringify(api)}, app: true };\n`);

// The server sends a Content-Security-Policy header for the website. A bundled app needs the same rules as a tag.
let html = await readFile(`${www}/index.html`, 'utf8');
const csp = `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ${api}; base-uri 'none'`;
html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`).replace(/<link rel="manifest"[^>]*>\n?/, '');
await writeFile(`${www}/index.html`, html);
console.log(`www ready, API ${api}`);
