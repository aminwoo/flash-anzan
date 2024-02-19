// Dynamic import of the module
import('@xenova/transformers').then(async ({ pipeline }) => {
    // You can use pipeline here

    const synthesizer = await pipeline('text-to-speech', 'Xenova/mms-tts-eng', {
        quantized: false, // Remove this line to use the quantized version (default)
    });

    const output = await synthesizer(['Hello, my dog is cute', 'hu']);
    console.log(output.audio);
  }).catch(error => {
    console.error('Failed to load the @xenova/transformers module', error);
  });