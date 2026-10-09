'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { advancePlayback } from './playback.mjs';
import type { Settings, SpeechSettings } from '../training';

export function FlashSequence({ values, settings, speechSettings, speak, cancelSpeech, onStart, onComplete }: {
 values: number[]; settings: Settings; speechSettings: SpeechSettings; speak: (value: number, settings: SpeechSettings) => Promise<void>; cancelSpeech: () => void; onStart: () => void; onComplete: () => void;
}) {
 // Capture the round once. Lobby polling must neither erase its numbers nor restart its timer.
 const [round] = useState(() => ({ values: [...values], numberMs: settings.speed * 1000, gapMs: settings.gap * 1000, speechSettings: { ...speechSettings } }));
 const [frame, setFrame] = useState({ index: 0, visible: true });
 const callbacks = useRef({ onStart, onComplete });
 useLayoutEffect(() => { callbacks.current = { onStart, onComplete }; }, [onStart, onComplete]);
 useLayoutEffect(() => {
  callbacks.current.onStart();
  let state = { index: 0, visible: true, finished: false, deadline: performance.now() + round.numberMs };
  let animation = 0, started = false;
  let speechFinished = true, stopped = false;
  const read = (value: number) => {
   speechFinished = false;
   void speak(value, round.speechSettings).then(() => { if (!stopped) speechFinished = true; });
  };
  const tick = (now: number) => {
   if (!started) { started = true; state.deadline = now + round.numberMs; read(round.values[0]); }
   const next = advancePlayback(state, now, round.values.length, round.numberMs, round.gapMs, speechFinished);
   if (next !== state) {
    state = next;
    if (state.finished) { cancelSpeech(); callbacks.current.onComplete(); return; }
    if (state.visible) read(round.values[state.index]);
    setFrame({ index: state.index, visible: state.visible });
   }
   animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(animation); cancelSpeech(); };
 }, [round, speak, cancelSpeech]);
 const value = round.values[frame.index];
 return <div className="duel-flash"><span className="hint">{frame.index + 1} / {round.values.length}</span><span className="number" style={{ visibility: frame.visible ? 'visible' : 'hidden' }}>{value < 0 ? '−' + Math.abs(value) : value}</span></div>;
}
