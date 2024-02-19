'use client'

import { useState, useEffect, useRef } from 'react'
import NumberDisplay from './ui/numberDisplay';

export default function Home() {

  const audioContext = new AudioContext();

  const numWorkers = 5; 
  // Create a reference to the worker object.
  const worker = useRef(null);

  // We use the `useEffect` hook to set up the worker as soon as the `App` component is mounted.
  useEffect(() => {
    worker.current = []; 
    for (let i = 0; i < numWorkers; i++) {
      worker.current.push(new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}));
    }
    
  }, []);

  function createAudioBuffer(float32Array) {
    const buffer = audioContext.createBuffer(1, float32Array.length, 16000);
    buffer.copyToChannel(float32Array, 0);
    return buffer;
  }

  function playAudioBuffer(buffer) {
    return new Promise((resolve) => {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1.2;
      source.connect(audioContext.destination);
      source.onended = resolve; 
      source.start();
    });
  }

  const handleGenerateSpeech = async () => {
    const nums = ['four hundred eighty three thousand six hundred and forty seven', 'one hundred twenty three million four hundred', 'one thousand three hundred and sixteen',
    'four hundred eighty three thousand six hundred and forty seven', 'one hundred twenty three million four hundred', 'one thousand three hundred and sixteen',]; 

    let promises = []; 
    for (let i = 0; i < numWorkers; i++) {
      promises.push(generate(worker.current[i], nums[i])); 
    }

    console.time('inference');
    Promise.all(promises).then(async (values) => {
      console.timeEnd('inference');
      for (let value of values) {
        const buffer = createAudioBuffer(value.audio);
        await playAudioBuffer(buffer); 
      }
    });
  };

  const generate = (worker, text) => new Promise((resolve) => {
    worker.onmessage = function(e) {
      switch (e.data.status) {
        case 'complete':
          resolve(e.data.output);
          break;
      }
    };
    
    worker.postMessage({
      text,
    });
  });

  return (
    <div>
        <button onClick={handleGenerateSpeech}>
          Generate
        </button>

        <NumberDisplay/>
    </div>
  )
}