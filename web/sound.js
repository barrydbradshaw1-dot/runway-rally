// Short sound feedback for answers. Every sound is made in code with Web Audio: no sound files,
// nothing loaded from another site, nothing to license. Sounds are short and quiet so a classroom
// stays calm, and a student can switch them off (remembered on this device).
//
//   right: a soft two-note rising chime
//   wrong: a low, gentle two-note dip (not a buzzer; it means "try again", not "you failed")
//   tap:   a tiny tick when a number pad key is pressed
//
// Browsers only let a page make sound after the student has tapped something, so the first tap
// wakes the audio (wake()). If audio is blocked or missing, play() quietly does nothing: answering
// never waits on a sound.

export const SOUND_KEY = 'rr_sound';

// Volume never goes above this (0 to 1 scale), so no sound is loud.
export const MAX_GAIN = 0.12;

// Each sound is a list of notes: start (seconds after play), frequency (Hz), length (seconds),
// peak volume, and the wave shape.
export const SOUNDS = {
  right: [
    { at: 0, freq: 659.25, dur: 0.14, gain: 0.09, wave: 'triangle' }, // E5
    { at: 0.09, freq: 987.77, dur: 0.26, gain: 0.08, wave: 'triangle' }, // B5
  ],
  wrong: [
    { at: 0, freq: 311.13, dur: 0.16, gain: 0.07, wave: 'sine' }, // E flat 4
    { at: 0.12, freq: 261.63, dur: 0.24, gain: 0.06, wave: 'sine' }, // C4
  ],
  tap: [{ at: 0, freq: 1400, dur: 0.03, gain: 0.025, wave: 'sine' }],
};

// How long a sound lasts, in seconds.
export const soundLength = (name) => Math.max(0, ...(SOUNDS[name] || []).map((n) => n.at + n.dur));

// On unless the student switched it off on this device.
export const soundOn = (get) => {
  try {
    return get(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
};

// createSounds({ isOn, AudioCtx }) -> { wake(), play(name) }
// AudioCtx defaults to the browser's AudioContext; tests pass a fake one.
export function createSounds({ isOn = () => true, AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null;

  // Call from inside a tap or click, before any waiting, so the browser allows sound.
  function wake() {
    if (!isOn() || !AudioCtx) return;
    try {
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  }

  function play(name) {
    const notes = SOUNDS[name];
    if (!notes || !isOn()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    wake();
    if (!ctx || ctx.state === 'closed') return;
    try {
      const t0 = ctx.currentTime + 0.01;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = n.wave;
        osc.frequency.setValueAtTime(n.freq, t0 + n.at);
        // quick fade in and a smooth fade out, so there is no click
        const peak = Math.min(n.gain, MAX_GAIN);
        amp.gain.setValueAtTime(0.0001, t0 + n.at);
        amp.gain.exponentialRampToValueAtTime(peak, t0 + n.at + Math.min(0.012, n.dur / 3));
        amp.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
        osc.connect(amp);
        amp.connect(ctx.destination);
        osc.start(t0 + n.at);
        osc.stop(t0 + n.at + n.dur + 0.02);
      }
    } catch {
      /* no sound this time */
    }
  }

  return { wake, play };
}
