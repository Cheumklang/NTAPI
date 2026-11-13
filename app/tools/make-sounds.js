'use strict';
/**
 * Generates the two UI sounds as small mono WAVs, so the repo carries no
 * binary blobs and the tones can be tuned by editing numbers here.
 *
 *   send.wav  short, quiet tick when a message leaves
 *   done.wav  two-note chime when a finished session needs attention
 *
 * Run with:  node tools/make-sounds.js
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/** A soft mallet-ish note: fast attack, exponential decay, light 2nd harmonic. */
function addNote(out, startSec, durSec, freq, amp) {
  const start = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.006);
    const decay = Math.exp(-t * 5.2);
    const env = attack * decay;
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.75 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.16 +
      Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.12;
    out[start + i] += s * env * amp;
  }
}

// send: a very short, quiet tick — present but never startling.
{
  const n = Math.floor(SR * 0.1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 42);
    out[i] =
      (Math.sin(2 * Math.PI * 1180 * t) * 0.62 + Math.sin(2 * Math.PI * 1770 * t) * 0.38) *
      env *
      0.16;
  }
  fs.writeFileSync(path.join(OUT, 'send.wav'), wav(out));
}

// done: G5 then C6, the classic "finished" lift, with a short tail.
{
  const n = Math.floor(SR * 0.62);
  const out = new Float32Array(n);
  addNote(out, 0, 0.3, 784.0, 0.19);
  addNote(out, 0.15, 0.45, 1046.5, 0.17);
  fs.writeFileSync(path.join(OUT, 'done.wav'), wav(out));
}

console.log('wrote', path.join(OUT, 'send.wav'), 'and done.wav');