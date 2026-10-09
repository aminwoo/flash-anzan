import assert from 'node:assert/strict';
import test from 'node:test';
import { stretchRecording } from '../app/voice-tempo.mjs';

const sampleRate = 24000;
const buffer = pcm => ({ length: pcm.length, sampleRate, getChannelData: () => pcm });
const context = { createBuffer: (_, length) => buffer(new Float32Array(length)) };
const tone = (frequency, seconds) => Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => 0.5 * Math.sin(2 * Math.PI * frequency * i / sampleRate));
function frequency(pcm, start, end) {
 let crossings = 0;
 for (let i = start + 1; i < end; i++) if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings++;
 return crossings * sampleRate / (end - start);
}

test('fast and slow recorded speech preserve pitch while changing duration', () => {
 const original = buffer(tone(220, 1));
 assert.strictEqual(stretchRecording(original, 1, context), original);
 for (const rate of [0.5, 1.5, 2, 3]) {
  const result = stretchRecording(original, rate, context), pcm = result.getChannelData(0);
  assert.ok(Math.abs(result.length / sampleRate - 1 / rate) < 0.08, `wrong duration at ${rate}x`);
  assert.ok(Math.abs(frequency(pcm, Math.floor(pcm.length * 0.2), Math.floor(pcm.length * 0.8)) - 220) < 8, `pitch changed at ${rate}x`);
  assert.ok(pcm.every(Number.isFinite));
 }
});

test('speed processing retains the final syllable instead of cutting off its tail', () => {
 const pcm = new Float32Array(sampleRate);
 pcm.set(tone(220, 0.8)); pcm.set(tone(900, 0.2), Math.round(sampleRate * 0.8));
 for (const rate of [0.5, 1.5, 2, 3]) {
  const output = stretchRecording(buffer(pcm), rate, context).getChannelData(0);
  let end = output.length - 1;
  while (end > 0 && Math.abs(output[end]) < 0.001) end--;
  const start = end - Math.round(sampleRate * 0.04);
  assert.ok(Math.abs(frequency(output, start, end) - 900) < 60, `final syllable missing at ${rate}x`);
 }
});
