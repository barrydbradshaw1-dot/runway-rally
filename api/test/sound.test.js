import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SOUNDS, SOUND_KEY, MAX_GAIN, soundLength, soundOn, createSounds } from '../../web/sound.js';

// A stand-in for the browser's AudioContext that records what would be played.
function fakeAudio({ state = 'running', throwOnCreate = false } = {}) {
  const made = [];
  class Ctx {
    constructor() {
      if (throwOnCreate) throw new Error('no audio here');
      this.state = state;
      this.currentTime = 0;
      this.destination = {};
      made.push(this);
      this.started = [];
      this.peaks = [];
      this.resumed = 0;
    }
    resume() {
      this.resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      const ctx = this;
      return {
        type: '',
        frequency: { setValueAtTime(f) { ctx.started.push(f); } },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      const ctx = this;
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(v) { if (v > 0.001) ctx.peaks.push(v); } }, connect() {} };
    }
  }
  return { Ctx, made };
}

test('there is a right, a wrong and a tap sound, each short and quiet', () => {
  assert.deepEqual(Object.keys(SOUNDS).sort(), ['right', 'tap', 'wrong']);
  for (const [name, notes] of Object.entries(SOUNDS)) {
    assert.ok(notes.length > 0, name);
    assert.ok(soundLength(name) <= 0.5, `${name} lasts under half a second`);
    for (const n of notes) {
      assert.ok(n.gain > 0 && n.gain <= MAX_GAIN, `${name} stays quiet`);
      assert.ok(n.freq >= 200 && n.freq <= 2000, `${name} is a comfortable pitch`);
    }
  }
  assert.ok(soundLength('tap') <= 0.05, 'the key tick is tiny');
  // the wrong sound is lower and softer than the right one: a gentle "try again", not a buzzer
  const top = (name) => Math.max(...SOUNDS[name].map((n) => n.freq));
  const loud = (name) => Math.max(...SOUNDS[name].map((n) => n.gain));
  assert.ok(top('wrong') < top('right'));
  assert.ok(loud('wrong') < loud('right'));
  assert.ok(SOUNDS.wrong.every((n) => n.wave === 'sine'), 'no harsh wave for wrong answers');
});

test('sound is on until the student switches it off on this device', () => {
  assert.equal(soundOn(() => null), true);
  assert.equal(soundOn((k) => (k === SOUND_KEY ? '1' : null)), true);
  assert.equal(soundOn((k) => (k === SOUND_KEY ? '0' : null)), false);
  assert.equal(soundOn(() => { throw new Error('storage blocked'); }), true);
});

test('play makes the notes when sound is on, and nothing when it is off', () => {
  const { Ctx, made } = fakeAudio();
  let on = true;
  const s = createSounds({ isOn: () => on, AudioCtx: Ctx });
  s.play('right');
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].started, SOUNDS.right.map((n) => n.freq));
  assert.ok(made[0].peaks.every((p) => p <= MAX_GAIN));
  on = false;
  s.play('wrong');
  assert.deepEqual(made[0].started, SOUNDS.right.map((n) => n.freq), 'muted: nothing more played');
  s.play('nope'); // unknown names are ignored
});

test('audio blocked until a tap is woken by wake(), and missing audio never throws', () => {
  const { Ctx, made } = fakeAudio({ state: 'suspended' });
  const s = createSounds({ AudioCtx: Ctx });
  s.wake();
  assert.equal(made.length, 1);
  assert.equal(made[0].resumed, 1);
  assert.equal(made[0].state, 'running');
  s.wake();
  assert.equal(made.length, 1, 'one audio context is reused');

  assert.doesNotThrow(() => createSounds({ AudioCtx: undefined }).play('right'));
  const broken = fakeAudio({ throwOnCreate: true });
  assert.doesNotThrow(() => createSounds({ AudioCtx: broken.Ctx }).play('tap'));
  // muted: no audio context is even made
  const quiet = fakeAudio();
  createSounds({ isOn: () => false, AudioCtx: quiet.Ctx }).wake();
  assert.equal(quiet.made.length, 0);
});

test('the game wires sounds to answers, the pad and a sound switch with English and Spanish labels', async () => {
  const app = await readFile(new URL('../../web/app.js', import.meta.url), 'utf8');
  assert.match(app, /sounds\.play\(r\.correct \? 'right' : 'wrong'\)/);
  assert.match(app, /sounds\.wake\(\)/);
  for (const text of ['🔊 Sound on', '🔇 Sound off', '🔊 Con sonido', '🔇 Sin sonido', 'Efectos de sonido']) assert.ok(app.includes(text), text);
  // the skills check stays neutral: only the key tick, never right or wrong
  const placement = app.slice(app.indexOf('function placementScreen'), app.indexOf('function placementDoneScreen'));
  assert.ok(!/sounds\.play\('(right|wrong)'\)/.test(placement));
  const sw = await readFile(new URL('../../web/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'/sound.js'"), 'the offline shell includes sound.js');
  const sound = await readFile(new URL('../../web/sound.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(sound) && !/fetch\(|new Audio\(/.test(sound), 'nothing is loaded from anywhere');
});
