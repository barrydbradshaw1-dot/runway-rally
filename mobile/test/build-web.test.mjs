import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appIndexHtml, buildWeb, checkApiBase, checkPrivacyUrl } from '../scripts/build-web.mjs';

test('the server address must be a plain https address', () => {
  assert.equal(checkApiBase('https://rally.example.com'), 'https://rally.example.com');
  assert.equal(checkApiBase('https://rally.example.com/'), 'https://rally.example.com');
  assert.throws(() => checkApiBase('http://rally.example.com'), /https/);
  assert.throws(() => checkApiBase(''), /RR_API_BASE/);
  assert.throws(() => checkApiBase('https://rally.example.com/app'), /just the address/);
  assert.equal(checkApiBase('http://127.0.0.1:3000', { allowHttp: true }), 'http://127.0.0.1:3000');
});

test('the app copy of index.html names the server and drops the web manifest', () => {
  const out = appIndexHtml('<meta charset="utf-8" />\n<link rel="manifest" href="/manifest.webmanifest" />', 'https://rally.example.com');
  assert.match(out, /<meta name="rr-api" content="https:\/\/rally.example.com" \/>/);
  assert.doesNotMatch(out, /manifest/);
});

test('the app gets the student game only, not the teacher console or family page', async () => {
  const to = join(await mkdtemp(join(tmpdir(), 'rr-www-')), 'www');
  await buildWeb({ apiBase: 'https://rally.example.com', to });
  const files = await readdir(to);
  for (const f of ['index.html', 'app.js', 'styles.css', 'icons']) assert.ok(files.includes(f), f);
  for (const f of ['admin', 'progress', 'sw.js', 'manifest.webmanifest']) assert.ok(!files.includes(f), f);
  assert.match(await readFile(join(to, 'index.html'), 'utf8'), /rr-api/);
});

test('the privacy policy link is optional and must be https', () => {
  assert.equal(checkPrivacyUrl(''), '');
  assert.equal(checkPrivacyUrl('https://rally.example.com/privacy'), 'https://rally.example.com/privacy');
  assert.throws(() => checkPrivacyUrl('http://rally.example.com/privacy'), /https/);
  assert.throws(() => checkPrivacyUrl('javascript:alert(1)'), /https/);
  const out = appIndexHtml('<meta charset="utf-8" />', 'https://rally.example.com', 'https://rally.example.com/privacy');
  assert.match(out, /<meta name="rr-privacy" content="https:\/\/rally.example.com\/privacy" \/>/);
});
