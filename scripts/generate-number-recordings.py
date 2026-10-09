"""Build the bundled voice: uv run --with piper-tts --with num2words python
scripts/generate-number-recordings.py /path/to/en_US-ljspeech-high.onnx

The model and Python dependencies are build tools, not website dependencies.
"""
import io
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import onnxruntime
from num2words import num2words
from piper import PiperVoice
from piper.config import PiperConfig

model = Path(sys.argv[1])
output = Path(__file__).resolve().parents[1] / "public/number-voice/v1"
output.mkdir(parents=True, exist_ok=True)
options = onnxruntime.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
voice = PiperVoice(
    config=PiperConfig.from_dict(json.loads(Path(str(model) + ".json").read_text())),
    session=onnxruntime.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"]),
)
numbers = [*range(100), *range(100, 1000, 100)]
words = {str(n): num2words(n, lang="en").replace(" and ", " ") for n in numbers}
words.update({word: word for word in ["minus", "thousand", "million", "billion", "trillion", "quadrillion"]})
for index, (key, text) in enumerate(words.items()):
    destination = output / f"{key}.mp3"
    if destination.exists():
        continue
    raw = io.BytesIO()
    with wave.open(raw, "wb") as wav:
        voice.synthesize_wav(text, wav)
    # Remove synthesis padding but preserve quiet consonants and small margins.
    with wave.open(io.BytesIO(raw.getvalue()), "rb") as wav:
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
    voiced = np.flatnonzero(np.abs(samples.astype(np.int32)) > 180)
    if not voiced.size:
        raise RuntimeError(f"Silent recording: {text}")
    margin = int(rate * 0.025)
    samples = samples[max(0, voiced[0] - margin):min(len(samples), voiced[-1] + margin + 1)]
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", "-y", str(destination)], input=samples.tobytes(), check=True)
    if index % 50 == 0:
        print(f"Recorded {index + 1}/{len(words)}", flush=True)
print(f"Voice ready: {len(words)} recordings", flush=True)
