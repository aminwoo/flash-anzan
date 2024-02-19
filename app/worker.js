
import { env, pipeline, Tensor } from '@xenova/transformers';

// Disable local model checks
env.allowLocalModels = false;


// Use the Singleton pattern to enable lazy construction of the pipeline.
class TextToSpeechPipeline {

    static BASE_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/';

    static synthesizer = null; 

    static async getInstance(progress_callback = null) {
        if (this.synthesizer === null) {
            this.synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', { quantized: false });
        }

        return new Promise(async (resolve, reject) => {
            const result = await Promise.all([
                this.synthesizer,
            ]);
            self.postMessage({
                status: 'ready',
            });
            resolve(result);
        });
    }

    static async getSpeakerEmbeddings(speaker_id) {
        // e.g., `cmu_us_awb_arctic-wav-arctic_a0001`
        const speaker_embeddings_url = `${this.BASE_URL}${speaker_id}.bin`;
        const speaker_embeddings = new Tensor(
            'float32',
            new Float32Array(await (await fetch(speaker_embeddings_url)).arrayBuffer()),
            [1, 512]
        )
        return speaker_embeddings;
    }

}

const speaker_embeddings_cache = new Map();

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    // Load the pipeline
    const [synthesizer] = await TextToSpeechPipeline.getInstance(x => {
        self.postMessage(x);
    });

    const url = "cmu_us_slt_arctic-wav-arctic_a0001";
    let speaker_embeddings = speaker_embeddings_cache.get(url);
    if (speaker_embeddings === undefined) {
        speaker_embeddings = await TextToSpeechPipeline.getSpeakerEmbeddings(url);
        speaker_embeddings_cache.set(url, speaker_embeddings);
    }

    const output = await synthesizer(event.data.text, { speaker_embeddings });

    // Send the output back to the main thread
    self.postMessage({
        status: 'complete',
        output: output,
    });
});
