/**
 * Replace the previous number rather than queueing speech behind the display.
 * @param {number} value
 * @param {{speechVoice: string, speechRate: number}} settings
 * @param {SpeechSynthesis} synthesis
 * @param {typeof SpeechSynthesisUtterance} Utterance
 * @param {(event: SpeechSynthesisErrorEvent) => void} onError
 */
export function speakNumber(value, settings, synthesis, Utterance, onError) {
 synthesis.cancel();
 const utterance = new Utterance(value < 0 ? `minus ${Math.abs(value)}` : String(value));
 const voices = synthesis.getVoices();
 const voice = voices.find(v => v.voiceURI === settings.speechVoice)
  ?? voices.find(v => v.lang.toLowerCase().startsWith('en') && v.default)
  ?? voices.find(v => v.lang.toLowerCase().startsWith('en'));
 utterance.lang = voice?.lang ?? 'en-US';
 if (voice) utterance.voice = voice;
 utterance.rate = settings.speechRate;
 utterance.onerror = onError;
 synthesis.speak(utterance);
 return utterance;
}
