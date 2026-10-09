'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNumber } from './speech.mjs';
import { NumberRecordings, RECORDED_VOICE } from './recorded-speech.mjs';
import type { SpeechSettings } from './training';

export function useNumberSpeech() {
 const [supported, setSupported] = useState<boolean | null>(null);
 const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
 const [error, setError] = useState('');
 const [needsGesture, setNeedsGesture] = useState(false);
 const current = useRef<SpeechSynthesisUtterance | null>(null);
 const finish = useRef<(() => void) | null>(null);
 const recordings = useRef<NumberRecordings | null>(null);
 const getRecordings = useCallback(() => {
  if (!recordings.current) {
   const context = new AudioContext();
   let storage;
   try { storage = window.caches; } catch { /* Memory cache remains available. */ }
   context.addEventListener('statechange', () => setNeedsGesture(context.state === 'suspended'));
   setNeedsGesture(context.state === 'suspended');
   recordings.current = new NumberRecordings(context, window.fetch.bind(window), storage, window.location.origin);
  }
  return recordings.current;
 }, []);
 const cancel = useCallback(() => {
  const hadBrowserSpeech = current.current !== null;
  recordings.current?.cancel();
  finish.current?.();
  finish.current = null;
  current.current = null;
  if (hadBrowserSpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
 }, []);
 useEffect(() => {
  let stopped = false;
  const browserSpeech = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const available = 'AudioContext' in window || browserSpeech;
  const loadVoices = () => { if (browserSpeech) setVoices(window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'))); };
  queueMicrotask(() => { if (stopped) return; setSupported(available); if (available) loadVoices(); });
  if (!available) return () => { stopped = true; };
  if (browserSpeech) window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  const hide = () => { if (document.hidden) cancel(); };
  document.addEventListener('visibilitychange', hide);
  return () => { stopped = true; if (browserSpeech) window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); document.removeEventListener('visibilitychange', hide); cancel(); recordings.current?.dispose(); recordings.current = null; };
 }, [cancel]);
 const prepare = useCallback(async (values: number[], settings: SpeechSettings) => {
  if (!settings.speech || (settings.speechVoice && settings.speechVoice !== RECORDED_VOICE)) return;
  setError('');
  try { const player = getRecordings(); void player.unlock().catch(() => {}); await player.prepare(values, settings.speechRate); }
  catch (error) { setError('Unable to load the recorded voice. Check your connection and try again.'); throw error; }
 }, [getRecordings]);
 const speak = useCallback(async (value: number, settings: SpeechSettings) => {
  if (!settings.speech || document.hidden) { cancel(); return; }
  if (!settings.speechVoice || settings.speechVoice === RECORDED_VOICE) {
   cancel(); setError('');
   try { const player = getRecordings(); void player.unlock().catch(() => {}); await player.play(value, settings.speechRate); }
   catch { setError('Unable to play the recorded voice. Try Test voice before starting.'); }
   return;
  }
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { cancel(); return; }
  recordings.current?.cancel();
  finish.current?.();
  finish.current = null;
  current.current = null;
  setError('');
  await new Promise<void>(resolve => {
   const done = () => { if (finish.current === done) { finish.current = null; current.current = null; } resolve(); };
   finish.current = done;
   try {
    current.current = speakNumber(value, settings, window.speechSynthesis, window.SpeechSynthesisUtterance, event => {
     if (finish.current !== done) return;
     if (event.error !== 'canceled' && event.error !== 'interrupted') setError('Unable to read aloud. Try another voice or use Test voice before starting.');
     done();
    }, done);
   } catch { setError('Unable to read aloud. Try another voice.'); done(); }
  });
 }, [cancel, getRecordings]);
 return { supported, voices, error, speak, cancel, prepare, needsGesture };
}

export function SpeechControls({ settings, onChange, reader, disabled = false }: {
 settings: SpeechSettings; onChange: (patch: Partial<SpeechSettings>) => void;
 reader: ReturnType<typeof useNumberSpeech>; disabled?: boolean;
}) {
 return <div className="speech-settings">
  <label className="check"><input type="checkbox" disabled={disabled || reader.supported !== true} checked={settings.speech} onChange={e => { reader.cancel(); onChange({ speech: e.target.checked }); }}/>Read numbers aloud</label>
  {reader.supported === false ? <p className="hint" role="status">Text-to-speech is unavailable in this browser.</p> : settings.speech && <>
   <label>Voice<select disabled={disabled} value={!settings.speechVoice||settings.speechVoice===RECORDED_VOICE?RECORDED_VOICE:reader.voices.some(v => v.voiceURI === settings.speechVoice)?settings.speechVoice:'browser-auto'} onChange={e => { reader.cancel(); onChange({ speechVoice: e.target.value }); }}><option value={RECORDED_VOICE}>Recorded American English · cached</option><option value="browser-auto">Automatic browser voice</option>{reader.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang}) · browser voice</option>)}</select></label>
   <label>Speech rate: {settings.speechRate.toFixed(1)}×<input disabled={disabled} type="range" min="0.5" max="3" step="0.1" value={settings.speechRate} onChange={e => onChange({ speechRate: Number(e.target.value) })}/></label>
   <button className="secondary" disabled={disabled || reader.supported !== true} onClick={() => reader.speak(-24, settings)}>Test voice</button>
   {reader.needsGesture&&(!settings.speechVoice||settings.speechVoice===RECORDED_VOICE)&&<button className="primary" onClick={()=>void reader.prepare([],settings).catch(()=>{})}>Enable voice playback</button>}
   <p className="hint">Reads each number and the revealed answer, including “minus” for negatives. Each number stays on screen for at least the selected time and until the voice finishes.</p>
   <p className="hint">Recorded American English saves audio on this device and preloads each round for quick playback. Browser voices generate speech each time.</p>
  </>}
  {reader.error && <p className="error" role="status">{reader.error}</p>}
 </div>;
}
