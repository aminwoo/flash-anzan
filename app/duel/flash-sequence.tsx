'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { advancePlayback } from './playback.mjs';
import type { Settings } from '../training';

export function FlashSequence({ values, settings, onStart, onComplete }: {
 values: number[]; settings: Settings; onStart: () => void; onComplete: () => void;
}) {
 // Capture the round once. Lobby polling must neither erase its numbers nor restart its timer.
 const [round] = useState(() => ({ values: [...values], numberMs: settings.speed * 1000, gapMs: settings.gap * 1000 }));
 const [frame, setFrame] = useState({ index: 0, visible: true });
 const callbacks = useRef({ onStart, onComplete });
 useLayoutEffect(() => { callbacks.current = { onStart, onComplete }; }, [onStart, onComplete]);
 useLayoutEffect(() => {
  callbacks.current.onStart();
  let state = { index: 0, visible: true, finished: false, deadline: performance.now() + round.numberMs };
  let animation = 0, started = false;
  const tick = (now: number) => {
   if (!started) { started = true; state.deadline = now + round.numberMs; }
   const next = advancePlayback(state, now, round.values.length, round.numberMs, round.gapMs);
   if (next !== state) {
    state = next;
    if (state.finished) { callbacks.current.onComplete(); return; }
    setFrame({ index: state.index, visible: state.visible });
   }
   animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(animation);
 }, [round]);
 const value = round.values[frame.index];
 return <div className="duel-flash"><span className="hint">{frame.index + 1} / {round.values.length}</span><span className="number" style={{ visibility: frame.visible ? 'visible' : 'hidden' }}>{value < 0 ? '−' + Math.abs(value) : value}</span></div>;
}
