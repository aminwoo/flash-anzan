import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { NumberRecordings, recordingParts, encodeRecording } from '../app/recorded-speech.mjs';

const origin = 'https://anzan.test';
function buffer(samples, sampleRate = 1000) {
 const pcm = Float32Array.from(samples);
 return { length: pcm.length, sampleRate, getChannelData: () => pcm };
}
function engine() {
 const events = [], sources = [];
 return { events, sources, sampleRate: 1000, destination: {},
  resume: async () => {}, close: async () => {},
  createBuffer: (_, length, rate) => buffer(new Float32Array(length), rate),
  decodeAudioData: async bytes => {
   const view = new DataView(bytes);
   if (bytes.byteLength < 44) return buffer([0.25, -0.25]);
   const pcm = Array.from({ length: (bytes.byteLength - 44) / 2 }, (_, i) => view.getInt16(44 + i * 2, true) / 32768);
   return buffer(pcm, view.getUint32(24, true));
  },
  createBufferSource() {
   const source = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { events.push('start'); }, stop() { events.push('stop'); }, onended: null };
   sources.push(source); return source;
  },
 };
}
function storage() {
 const caches = new Map();
 return { async open(name) {
  if (!caches.has(name)) {
   const entries = new Map();
   caches.set(name, { match: async key => entries.get(key)?.clone(), put: async (key, value) => { entries.set(key, value.clone()); }, keys: async () => [...entries.keys()], delete: async key => entries.delete(key) });
  }
  return caches.get(name);
 } };
}
const fetcher = calls => async url => { calls.push(url); return new Response(new Uint8Array([1, 2])); };

test('signed numbers, zeros, large numbers and totals map to existing recordings', async () => {
 assert.deepEqual(recordingParts(0), ['0']);
 assert.deepEqual(recordingParts(-24), ['minus', '24']);
 assert.deepEqual(recordingParts(100), ['100']);
 assert.deepEqual(recordingParts(123456), ['100', '23', 'thousand', '400', '56']);
 assert.deepEqual(recordingParts(-1000001), ['minus', '1', 'million', '1']);
 assert.deepEqual(recordingParts(99999900), ['99', 'million', '900', '99', 'thousand', '900']);
 assert.throws(() => recordingParts(1.5));
 assert.throws(() => recordingParts(Infinity));
 const vocabulary = [...Array.from({ length: 100 }, (_, n) => String(n)), ...Array.from({ length: 9 }, (_, n) => String((n + 1) * 100)), 'minus', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
 await Promise.all(vocabulary.map(key => access(new URL(`../public/number-voice/v2/${key}.mp3`, import.meta.url))));
});

test('concurrent and repeated numbers reuse one decoded recording and survive a reload offline', async () => {
 const calls = [], cache = storage();
 const player = new NumberRecordings(engine(), fetcher(calls), cache, origin);
 const [first, second] = await Promise.all([player.getNumber(-123), player.getNumber(-123)]);
 assert.strictEqual(first, second);
 assert.equal(calls.length, 3);
 assert.strictEqual(await player.getNumber(-123), first);
 await player.writes;
 const restored = new NumberRecordings(engine(), async () => { throw new Error('Offline'); }, cache, origin);
 const next = await restored.getNumber(-123);
 assert.equal(next.length, first.length);
 assert.equal(next.sampleRate, first.sampleRate);
});

test('preloaded replay needs no fetch and resolves only when the full recording ends', async () => {
 const calls = [], context = engine(), player = new NumberRecordings(context, fetcher(calls), storage(), origin);
 await player.prepare([24, -24, 24, 0], 1.5);
 const count = calls.length;
 let finished = false;
 const playing = player.play(24, 1.5).then(() => { finished = true; });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(calls.length, count);
 assert.equal(context.sources[0].playbackRate.value, 1);
 assert.equal(finished, false);
 context.sources[0].onended(); await playing;
 assert.equal(finished, true);
 const replay = player.play(24, 2);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(calls.length, count);
 player.cancel(); await replay;
 assert.deepEqual(context.events, ['start', 'start', 'stop']);
});

test('cancellation during a download cannot start stale audio afterwards', async () => {
 let deliver;
 const download = new Promise(resolve => { deliver = resolve; });
 const context = engine(), player = new NumberRecordings(context, () => download, null, origin);
 const pending = player.play(12, 1);
 player.cancel(); deliver(new Response(new Uint8Array([1, 2])));
 await pending; assert.equal(context.sources.length, 0);
});

test('blocked storage falls back to memory, and a failed download can be retried', async () => {
 let calls = 0;
 const player = new NumberRecordings(engine(), async () => { if (++calls === 1) throw new Error('Offline'); return new Response(new Uint8Array([1, 2])); }, { open() { throw new Error('Storage disabled'); } }, origin);
 await assert.rejects(player.getNumber(5), /Offline/);
 const audio = await player.getNumber(5);
 assert.strictEqual(await player.getNumber(5), audio); assert.equal(calls, 2);
});

test('cache size is bounded and cached WAV data retains signed PCM', async () => {
 const cache = storage(), player = new NumberRecordings(engine(), fetcher([]), cache, origin);
 for (let n = 0; n < 140; n++) await player.getNumber(n);
 await player.writes;
 assert.equal(player.numbers.size, 128);
 assert.equal((await (await cache.open('anzan-voice-numbers-v2')).keys()).length, 128);
 const bytes = encodeRecording(buffer([-1, 0, 1], 22050)), view = new DataView(bytes);
 assert.equal(view.getUint32(24, true), 22050);
 assert.equal(view.getInt16(44, true), -32768);
 assert.equal(view.getInt16(48, true), 32767);
});
