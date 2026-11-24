import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../web/app.js', import.meta.url), 'utf8');

test('the home screen shows "Not you?" beside the nickname, except for Brightspace students', () => {
  assert.match(app, /st\.viaLti \? null : h\('button', \{ class: 'ghost small notyou', text: 'Not you\?', onclick: signOut \}\)/);
});

test('the home screen has a visible Sign out button that asks first, except for Brightspace students', () => {
  assert.match(app, /st\.viaLti \? null : h\('button', \{ class: 'ghost', text: 'Sign out', onclick: signOutScreen \}\)/);
  assert.match(app, /function signOutScreen\(\)/);
  assert.match(app, /Get my sign-in code first/);
});

test('getting a fresh code from the sign-out screen ends by signing out', () => {
  assert.match(app, /recoveryCodeScreen\(r\.recoveryCode, \{ thenSignOut: true \}\)/);
  assert.match(app, /onclick: thenSignOut \? signOut : homeScreen/);
});

test('signing out clears the saved session on this device', () => {
  const body = app.slice(app.indexOf('function signOut()'), app.indexOf('function signOut()') + 300);
  assert.match(body, /store\.del\('rr_token'\)/);
});
