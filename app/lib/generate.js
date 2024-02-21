const ones = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const tens = ["ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const teens = ["eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const units = ["hundred", "thousand", "million", "billion"];
const other = ["and"];

let all = [];
all = all.concat(ones, tens, teens, units, other);


(async () => {
    const wavefile = require('wavefile');
    const fs = require('fs');
    const { env, pipeline, Tensor } = await import('@xenova/transformers');
    const synthesizer = await pipeline('text-to-speech', 'Xenova/mms-tts-eng', { quantized: false });

    const speaker_embeddings_url = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0003.bin';
    const speaker_embeddings = new Tensor(
        'float32',
        new Float32Array(await (await fetch(speaker_embeddings_url)).arrayBuffer()),
        [1, 512]
    )

    for (var text of all) {
        const result = await synthesizer(text);

        const wav = new wavefile.WaveFile();
        wav.fromScratch(1, result.sampling_rate, '32f', result.audio);
        fs.writeFileSync(`${text}.wav`, wav.toBuffer());
    }
})(); 