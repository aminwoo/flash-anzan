"""uv run --with kokoro-onnx --with num2words python
scripts/generate-american-recordings.py /path/to/kokoro-v1.0.onnx /path/to/voices-v1.0.bin

Generates the American af_heart voice. Only audio, not the model, is deployed.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnxruntime
from kokoro_onnx import Kokoro
from num2words import num2words

output = Path(__file__).resolve().parents[1] / "public/number-voice/v2"
output.mkdir(parents=True, exist_ok=True)
options = onnxruntime.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = onnxruntime.InferenceSession(sys.argv[1], sess_options=options, providers=["CPUExecutionProvider"])
voice = Kokoro.from_session(session, sys.argv[2])
numbers = [*range(100), *range(100, 1000, 100)]
words = {str(n): num2words(n, lang="en").replace(" and ", " ") for n in numbers}
words.update({word: word for word in ["minus", "thousand", "million", "billion", "trillion", "quadrillion"]})
for index, (key, text) in enumerate(words.items()):
    destination = output / f"{key}.mp3"
    if destination.exists():
        continue
    samples, rate = voice.create(text, voice="af_heart", lang="en-us", speed=1.0)
    voiced = np.flatnonzero(np.abs(samples) > 0.003)
    if not voiced.size:
        raise RuntimeError(f"Silent recording: {text}")
    margin = int(rate * 0.025)
    samples = samples[max(0, voiced[0] - margin):min(len(samples), voiced[-1] + margin + 1)]
    samples = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", "-y", str(destination)], input=samples.tobytes(), check=True)
    if index % 25 == 0:
        print(f"American voice: {index + 1}/{len(words)}", flush=True)
print(f"American voice ready: {len(words)} recordings", flush=True)
