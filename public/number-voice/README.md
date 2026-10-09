The current bundled American English recordings (v2) use Kokoro-82M's
af_heart voice, with US English pronunciation. Generated locally with
kokoro-onnx; neither the model nor a speech-generation service runs on the site.

Model: https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0)
Tool: https://github.com/thewh1teagle/kokoro-onnx (MIT)
Generation script: scripts/generate-american-recordings.py

Previous v1 recordings used Piper's en_US-ljspeech-high voice, trained on
the public-domain LJ Speech Dataset. They are not used by the current voice.

Voice model: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/high
Dataset: https://keithito.com/LJ-Speech-Dataset/
Generation tool: https://github.com/OHF-Voice/piper1-gpl (GPL-3.0)

Only generated audio is served by the site. To regenerate it, see
scripts/generate-american-recordings.py. Do not bundle the voice model or tool.
