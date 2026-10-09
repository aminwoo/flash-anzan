'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNumber } from './speech.mjs';
import type { SpeechSettings } from './training';

export function useNumberSpeech() {
 const [supported, setSupported] = useState<boolean | null>(null);
 const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
 const [error, setError] = useState('');
 const current = useRef<SpeechSynthesisUtterance | null>(null);
 const finish = useRef<(() => void) | null>(null);
 const cancel = useCallback(() => {
  finish.current?.();
  finish.current = null;
  current.current = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
 }, []);
 useEffect(() => {
  let stopped = false;
  const available = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const loadVoices = () => setVoices(window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en')));
  queueMicrotask(() => { if (stopped) return; setSupported(available); if (available) loadVoices(); });
  if (!available) return () => { stopped = true; };
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  const hide = () => { if (document.hidden) cancel(); };
  document.addEventListener('visibilitychange', hide);
  return () => { stopped = true; window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); document.removeEventListener('visibilitychange', hide); cancel(); };
 }, [cancel]);
 const speak = useCallback(async (value: number, settings: SpeechSettings) => {
  if (!settings.speech || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window) || document.hidden) { cancel(); return; }
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
 }, [cancel]);
 return { supported, voices, error, speak, cancel };
}

export function SpeechControls({ settings, onChange, reader, disabled = false }: {
 settings: SpeechSettings; onChange: (patch: Partial<SpeechSettings>) => void;
 reader: ReturnType<typeof useNumberSpeech>; disabled?: boolean;
}) {
 return <div className="speech-settings">
  <label className="check"><input type="checkbox" disabled={disabled || reader.supported !== true} checked={settings.speech} onChange={e => { reader.cancel(); onChange({ speech: e.target.checked }); }}/>Read numbers aloud</label>
  {reader.supported === false ? <p className="hint" role="status">Text-to-speech is unavailable in this browser.</p> : settings.speech && <>
   <label>Voice<select disabled={disabled} value={reader.voices.some(v => v.voiceURI === settings.speechVoice) ? settings.speechVoice : ''} onChange={e => onChange({ speechVoice: e.target.value })}><option value="">Automatic English voice</option>{reader.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>
   <label>Speech rate: {settings.speechRate.toFixed(1)}×<input disabled={disabled} type="range" min="0.5" max="3" step="0.1" value={settings.speechRate} onChange={e => onChange({ speechRate: Number(e.target.value) })}/></label>
   <button className="secondary" disabled={disabled || reader.supported !== true} onClick={() => reader.speak(-24, settings)}>Test voice</button>
   <p className="hint">Reads each number and the revealed answer, including “minus” for negatives. Each number stays on screen for at least the selected time and until the voice finishes.</p>
  </>}
  {reader.error && <p className="error" role="status">{reader.error}</p>}
 </div>;
}
