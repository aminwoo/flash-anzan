import assert from 'node:assert/strict';
import test from 'node:test';
import { speakNumber } from '../app/speech.mjs';

function speechEngine(voices = []) {
 const queue = [], events = [];
 return { queue, events, getVoices: () => voices,
  cancel() { queue.length = 0; events.push('cancel'); },
  speak(utterance) { queue.push(utterance); events.push('speak'); },
 };
}
class Utterance { constructor(text) { this.text = text; } }

test('speech completion follows the utterance end event, including a delayed voice', () => {
 const engine = speechEngine();
 let finished = false;
 const utterance = speakNumber(-123, { speechVoice: '', speechRate: 3 }, engine, Utterance, () => {}, () => { finished = true; });
 assert.equal(utterance.text, 'minus 123');
 assert.equal(finished, false);
 // Starting/queueing the voice does not count as finishing the number.
 assert.equal(engine.queue[0], utterance);
 utterance.onend();
 assert.equal(finished, true);
});

test('signed numbers, repeated numbers and zero are read without accumulating a queue', () => {
 const engine = speechEngine();
 for (const [value, text] of [[-24, 'minus 24'], [24, '24'], [24, '24'], [0, '0'], [999999, '999999']]) {
  speakNumber(value, { speechVoice: '', speechRate: 1.5 }, engine, Utterance, () => {});
  assert.equal(engine.queue.length, 1);
  assert.equal(engine.queue[0].text, text);
  assert.equal(engine.queue[0].rate, 1.5);
  assert.equal(engine.queue[0].lang, 'en-US');
 }
 assert.deepEqual(engine.events, Array.from({ length: 5 }, () => ['cancel', 'speak']).flat());
});

test('selected voices and unavailable saved voices fall back to English', () => {
 const french = { voiceURI: 'fr', lang: 'fr-FR', default: true };
 const english = { voiceURI: 'en', lang: 'en-AU', default: false };
 const selected = { voiceURI: 'selected', lang: 'en-GB', default: false };
 const engine = speechEngine([french, english, selected]);
 const error = () => {};
 let utterance = speakNumber(12, { speechVoice: 'selected', speechRate: 1 }, engine, Utterance, error);
 assert.equal(utterance.voice, selected);
 assert.equal(utterance.lang, 'en-GB');
 assert.equal(utterance.onerror, error);
 utterance = speakNumber(12, { speechVoice: 'removed', speechRate: 1 }, engine, Utterance, error);
 assert.equal(utterance.voice, english);
 assert.equal(utterance.lang, 'en-AU');
 engine.cancel();
 assert.equal(engine.queue.length, 0);
});
