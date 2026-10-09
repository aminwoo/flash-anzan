export const RECORDED_VOICE = 'anzan-recorded-english-v1';
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
const LIMIT = 128;

/** Map a signed integer to our small, reusable vocabulary of recordings. */
export function recordingParts(value) {
 if (!Number.isSafeInteger(value)) throw new Error('Voice requires a whole number.');
 if (value === 0) return ['0'];
 const groups = [];
 let remaining = Math.abs(value), scale = 0;
 while (remaining) {
  const group = remaining % 1000, parts = [];
  if (group >= 100) parts.push(String(Math.floor(group / 100) * 100));
  if (group % 100) parts.push(String(group % 100));
  if (group && scale) parts.push(SCALES[scale]);
  if (group) groups.unshift(...parts);
  remaining = Math.floor(remaining / 1000); scale++;
 }
 return value < 0 ? ['minus', ...groups] : groups;
}

/** Encode mono PCM for persistent caching without a speech service. */
export function encodeRecording(buffer) {
 const samples = buffer.getChannelData(0);
 const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
 const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
 text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
 view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
 view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true);
 view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
 for (let i = 0; i < samples.length; i++) { const sample = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); }
 return bytes;
}

/** Reuse decoded recordings immediately, and persist them across page reloads. */
export class NumberRecordings {
 constructor(context, fetchAudio, cacheStorage, origin) {
  this.context = context; this.fetchAudio = fetchAudio; this.origin = origin;
  this.parts = new Map(); this.numbers = new Map(); this.sequence = 0; this.playing = null;
  this.writes = Promise.resolve();
  const open = name => Promise.resolve().then(() => cacheStorage?.open(name)).catch(() => null);
  this.sourceCache = open('anzan-voice-parts-v1'); this.numberCache = open('anzan-voice-numbers-v1');
 }
 unlock() { return this.context.resume(); }
 async readCache(cache, url) { try { return await cache?.match(url); } catch { return null; } }
 async loadPart(key) {
  if (this.parts.has(key)) return this.parts.get(key);
  const pending = (async () => {
   const url = new URL(`/number-voice/v1/${key}.mp3`, this.origin).href;
   const cache = await this.sourceCache;
   let response = await this.readCache(cache, url);
   if (!response) {
    response = await this.fetchAudio(url);
    if (!response.ok) throw new Error('Unable to load the recorded voice.');
    try { await cache?.put(url, response.clone()); } catch { /* Memory caching still works when storage is full. */ }
   }
   return this.context.decodeAudioData(await response.arrayBuffer());
  })();
  this.parts.set(key, pending);
  try { return await pending; } catch (error) { this.parts.delete(key); throw error; }
 }
 saveNumber(cache, url, buffer) {
  // Serialize writes and pruning so concurrent preloads cannot grow storage indefinitely.
  this.writes = this.writes.then(async () => {
   if (!cache) return;
   await cache.put(url, new Response(encodeRecording(buffer), { headers: { 'Content-Type': 'audio/wav' } }));
   const keys = await cache.keys();
   for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) await cache.delete(key);
  }).catch(() => { /* Optional persistent storage; keep using decoded memory audio. */ });
 }
 async getNumber(value) {
  if (this.numbers.has(value)) {
   const pending = this.numbers.get(value); this.numbers.delete(value); this.numbers.set(value, pending);
   return pending;
  }
  const pending = (async () => {
   const keys = recordingParts(value);
   const cache = await this.numberCache;
   const url = new URL(`/number-voice/v1/cached/${value}.wav`, this.origin).href;
   const saved = await this.readCache(cache, url);
   if (saved) {
    try { return await this.context.decodeAudioData(await saved.arrayBuffer()); }
    catch { try { await cache?.delete(url); } catch { /* Rebuild a damaged cache entry. */ } }
   }
   const parts = await Promise.all(keys.map(key => this.loadPart(key)));
   const pause = Math.round(this.context.sampleRate * 0.02);
   const length = parts.reduce((sum, part) => sum + part.length, 0) + pause * (parts.length - 1);
   const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
   let offset = 0;
   for (const part of parts) { buffer.getChannelData(0).set(part.getChannelData(0), offset); offset += part.length + pause; }
   this.saveNumber(cache, url, buffer);
   return buffer;
  })();
  this.numbers.set(value, pending);
  while (this.numbers.size > LIMIT) this.numbers.delete(this.numbers.keys().next().value);
  try { return await pending; } catch (error) { this.numbers.delete(value); throw error; }
 }
 async prepare(values) {
  const remaining = [...new Set(values)];
  await Promise.all(Array.from({ length: Math.min(6, remaining.length) }, async () => {
   while (remaining.length) await this.getNumber(remaining.pop());
  }));
 }
 async play(value, rate) {
  this.cancel();
  const sequence = this.sequence;
  const buffer = await this.getNumber(value);
  if (sequence !== this.sequence) return;
  await this.unlock();
  if (sequence !== this.sequence) return;
  await new Promise((resolve, reject) => {
   const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
   source.connect(this.context.destination);
   const done = () => { source.disconnect(); if (this.playing?.source === source) this.playing = null; resolve(); };
   this.playing = { source, done }; source.onended = done;
   try { source.start(); } catch (error) { done(); reject(error); }
  });
 }
 cancel() {
  this.sequence++;
  if (this.playing) { const { source, done } = this.playing; source.onended = null; try { source.stop(); } finally { done(); } }
 }
 dispose() { this.cancel(); void this.context.close(); }
}
