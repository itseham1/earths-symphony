// sonify.js — turns light values into sound (Web Audio, no libraries)
// Rule (from our design document):
//   brighter light  -> higher pitch (A minor pentatonic, 220 Hz ... 660 Hz) and louder
//   longitude       -> stereo position (west = left, east = right), optional Mono
//   2012 -> 2023 rising = ascending glide, falling = descending glide, same = steady tone
//   Time Machine    -> one note per year (2012 ... 2023), a glide connects them
import { THRESH } from './earthdata.js';

const NOTES = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
export const noteFor = v => NOTES[Math.round(Math.max(0, Math.min(1, v)) * 8)];
const ampFor = v => 0.05 + 0.5 * Math.sqrt(Math.max(0, Math.min(1, v)));

let ctx = null, master, reverb, enabled = true, mono = false, volume = 0.7;
let timers = [];

export function start() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    // small room reverb made from decaying noise
    const len = ctx.sampleRate * 1.8, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    reverb = ctx.createConvolver(); reverb.buffer = buf;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    reverb.connect(wet); wet.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const isReady = () => !!ctx;
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function setMono(b) { mono = b; }
export function setEnabled(b) { enabled = b; }

// stop everything that is playing (used by the Stop button)
export function stop() {
  timers.forEach(clearTimeout); timers = [];
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  setTimeout(() => master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05), 350);
}
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

function out(lon) {
  const p = ctx.createStereoPanner();
  p.pan.value = mono ? 0 : Math.max(-1, Math.min(1, lon / 180)) * 0.85;
  p.connect(master); p.connect(reverb);
  return p;
}

// a soft bell: two sine partials with a fast attack and a long decay
function bell(f, a, lon, at = 0, dur = 1.5) {
  const t = ctx.currentTime + at, p = out(lon);
  for (const [mul, g] of [[1, 1], [2.01, 0.25]]) {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.frequency.value = f * mul;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(a * g, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(p); o.start(t); o.stop(t + dur + 0.05);
  }
}

// a sliding tone from f1 to f2 (the "change" sound)
function glide(f1, f2, a, lon, at, dur) {
  const t = ctx.currentTime + at, p = out(lon);
  const o = ctx.createOscillator(), e = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'triangle';
  lp.type = 'lowpass'; lp.frequency.value = 2200;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.9);
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(a, t + 0.05);
  e.gain.setValueAtTime(a, t + dur * 0.8);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(e); e.connect(p); o.start(t); o.stop(t + dur + 0.05);
}

// a held tone (used for the 2012 and 2023 steps, and for "unchanged")
function hold(f, a, lon, at, dur) {
  const t = ctx.currentTime + at, p = out(lon);
  const o = ctx.createOscillator(), e = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(a, t + 0.08);
  e.gain.setValueAtTime(a, t + dur - 0.25);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(e); e.connect(p); o.start(t); o.stop(t + dur + 0.05);
}

// SONOVA SHARED MAP SOUND
// Used by both the NASA globe and uploaded maps.
export function uploadedMapNote(value, lon = 0) {
  if (!ctx || !enabled) return;

  const v = Math.max(
    0, Math.min(1, Number(value) || 0)
  );

  bell(noteFor(v), ampFor(v) * 0.6, lon, 0, 1.1);
}


// Automatic upload scan — same SONOVA bell and musical scale.
export function uploadedMapScanNote(value, position = 0.5) {
  if (!ctx || !enabled) return;

  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const x = Math.max(0, Math.min(1, position));
  const lon = (x - 0.5) * 360;

  bell(noteFor(v), ampFor(v) * 0.36, lon, 0, 0.27);
}


// SONOVA — instrument choices for uploaded maps only.
export function uploadedMapInstrumentNote(
  value,
  position = 0.5,
  instrument = "bell"
) {
  if (!ctx || !enabled) return;

  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const x = Math.max(0, Math.min(1, Number(position) || 0));

  // Keep the original SONOVA sound as one option.
  if (instrument === "bell") {
    uploadedMapScanNote(v, x);
    return;
  }

  const freq = noteFor(v);
  const lon = (x - 0.5) * 360;
  const destination = out(lon);
  const now = ctx.currentTime;

  const isGuitar = instrument === "guitar";
  const duration = isGuitar ? 0.44 : 0.62;
  const attack = isGuitar ? 0.004 : 0.008;
  const amplitude = (0.04 + 0.10 * Math.sqrt(v));

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = isGuitar ? 1800 : 4200;
  filter.Q.value = 0.5;
  filter.connect(destination);

  // Piano: soft harmonic tone.
  // Guitar: sharper plucked tone with faster decay.
  const partials = isGuitar
    ? [
        [1, 0.70, "sawtooth"],
        [2, 0.22, "sine"]
      ]
    : [
        [1, 1.00, "sine"],
        [2, 0.28, "sine"],
        [3, 0.10, "sine"]
      ];

  for (const [multiple, level, waveform] of partials) {
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();

    osc.type = waveform;
    osc.frequency.setValueAtTime(freq * multiple, now);

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, amplitude * level),
      now + attack
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration
    );

    osc.connect(envelope);
    envelope.connect(filter);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}


// ---- 1) mouse hover / keyboard move: one short note ----
// view = { yi: year index 0..11, change: true when the change map is shown }
export function tick(s, view, lon) {
  if (!ctx || !enabled) return;
  if (view.change) {                                  // change map: short glide
    const f1 = noteFor(s.l12), f2 = noteFor(s.l23);
    if (s.delta > THRESH || s.delta < -THRESH) glide(f1, f2, 0.22, lon, 0, 0.35);
    else bell(f2, 0.12, lon, 0, 0.5);
  } else {
    const v = s.series[view.yi];
    bell(noteFor(v), ampFor(v) * 0.6, lon, 0, 1.1);
  }
}

// ---- 2) "Hear this place": arpeggio of the brightest spots around it ----
export function place(s, lon) {
  if (!ctx || !enabled) return;
  const notes = [...new Set(s.cells.map(noteFor))].sort((a, b) => a - b);
  notes.slice(-6).forEach((f, i) => bell(f, 0.28, lon, i * 0.16, 1.4));
}

// ---- 3) "Listen to the Difference": the 2012 tone, a short pause, then the 2023 tone ----
export function difference(s, lon, onStep) {
  if (!ctx || !enabled) return 0;
  const f12 = noteFor(s.l12), f23 = noteFor(s.l23);
  const TONE = 1.5, SEG = TONE + 0.3;                         // tone + short pause
  hold(f12, ampFor(s.l12) * 0.5, lon, 0, TONE);               // 2012
  hold(f23, ampFor(s.l23) * 0.5, lon, SEG, TONE);             // 2023
  const end = SEG + TONE + 0.2;
  later(() => onStep && onStep('2012'), 0);
  later(() => onStep && onStep('2023'), SEG * 1000);
  later(() => onStep && onStep('done'), end * 1000);
  return end * 1000;
}

// ---- 4) TIME MACHINE: the whole decade of one place, in about 5 seconds ----
// A smooth voice follows the light of every year (220 Hz = dark ... 660 Hz = bright),
// a bell marks each year, and a quiet drone keeps the 2012 pitch as a reference:
// you HEAR how far the place moved away from where it started.
export const STEP = 0.42;                              // seconds per year
export function timeMachine(series, lon, onYear) {
  if (!ctx || !enabled) return 0;

  const n = series.length;
  const dur = n * STEP;

  // One gentle data-driven note for each year.
  series.forEach((v, i) => {
    const value = Math.max(0, Math.min(1, Number(v) || 0));

    bell(
      noteFor(value),
      0.10 + 0.08 * Math.sqrt(value),
      lon,
      i * STEP,
      0.32
    );

    later(() => onYear && onYear(i), i * STEP * 1000);
  });

  later(() => onYear && onYear(-1), dur * 1000 + 250);

  return dur;
}
