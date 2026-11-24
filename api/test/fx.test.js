import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const web = (f) => readFile(new URL(`../../web/${f}`, import.meta.url), 'utf8');

test('a real right answer gets a sparkle burst; a new piece gets a different shower and glow', async () => {
  const app = await web('app.js');
  const result = app.slice(app.indexOf('function resultScreen'), app.indexOf('function rewardScreen'));
  assert.match(result, /if \(r\.correct && !r\.revealed\) celebrate\('right', card\)/, 'no burst for an answer copied from the last hint');
  assert.match(result, /if \(r\.unlocked\.length\) celebrate\('piece'\)/);
  const reward = app.slice(app.indexOf('function rewardScreen'), app.indexOf('function wrapScreen'));
  assert.match(reward, /celebrate\('piece'\)/);
  const placement = app.slice(app.indexOf('function placementScreen'), app.indexOf('function placementDoneScreen'));
  assert.ok(!placement.includes('celebrate('), 'the skills check stays neutral');
  const fx = app.slice(app.indexOf('function celebrate'), app.indexOf('function resultScreen'));
  assert.match(fx, /prefers-reduced-motion: reduce/);
  assert.ok(!/setAttribute\('style'|style: /.test(fx), 'styles are set through the style object, which the page policy allows');
  const css = await web('styles.css');
  for (const k of ['@keyframes burst', '@keyframes shower', '@keyframes glow', '.fx { display: none; }']) assert.ok(css.includes(k), k);
  assert.match(await web('sw.js'), /runway-rally-v16/);
});
