import { Stretch } from '@soundtouchjs/core';

/** Change speaking speed before playback while preserving the voice's pitch. */
export function stretchRecording(buffer, rate, context) {
 if (rate === 1) return buffer;
 if (!Number.isFinite(rate) || rate < 0.5 || rate > 3) throw new Error('Invalid speech rate.');
 const input = buffer.getChannelData(0), sampleRate = buffer.sampleRate;
 // Padding lets the algorithm finish the last syllable instead of truncating its tail.
 const lead = Math.ceil(sampleRate * 0.15), tail = Math.ceil(sampleRate * 0.5);
 const frames = lead + input.length + tail, stereo = new Float32Array(frames * 2);
 for (let i = 0; i < input.length; i++) stereo[(lead + i) * 2] = stereo[(lead + i) * 2 + 1] = input[i];
 const stretch = new Stretch({ createBuffers: true, sampleRate });
 stretch.tempo = rate;
 stretch.setStretchParameters({ sequenceMs: 50, seekWindowMs: 20, overlapMs: 10 });
 stretch.inputBuffer.putSamples(stereo, 0, frames); stretch.process();
 const output = new Float32Array(stretch.outputBuffer.frameCount * 2);
 stretch.outputBuffer.extract(output, 0, stretch.outputBuffer.frameCount);
 // Remove only padding. Keep quiet consonants and short margins at either end.
 let first = 0, last = output.length / 2 - 1;
 while (first <= last && Math.abs(output[first * 2]) < 0.00001) first++;
 while (last > first && Math.abs(output[last * 2]) < 0.00001) last--;
 const margin = Math.ceil(sampleRate * 0.015);
 first = Math.max(0, first - margin); last = Math.min(output.length / 2 - 1, last + margin);
 const result = context.createBuffer(1, Math.max(1, last - first + 1), sampleRate);
 const pcm = result.getChannelData(0);
 for (let i = 0; i < pcm.length; i++) pcm[i] = output[(first + i) * 2] ?? 0;
 return result;
}
