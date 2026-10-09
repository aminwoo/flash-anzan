/**
 * Advance only after the displayed number has had its full duration.
 * Deadlines use a monotonic browser clock, never the periodically synced server clock.
 * @param {{index: number, visible: boolean, finished: boolean, deadline: number}} state
 * @param {number} now
 * @param {number} count
 * @param {number} numberMs
 * @param {number} gapMs
 * @param {boolean} [speechFinished]
 */
export function advancePlayback(state, now, count, numberMs, gapMs, speechFinished = true) {
 if (state.finished || now < state.deadline || (state.visible && !speechFinished)) return state;
 if (state.visible && state.index === count - 1) return { ...state, visible: false, finished: true };
 if (state.visible && gapMs > 0) return { ...state, visible: false, deadline: now + gapMs };
 return { index: state.index + 1, visible: true, finished: false, deadline: now + numberMs };
}
