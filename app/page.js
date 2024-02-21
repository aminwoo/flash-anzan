'use client';

import { useState, useEffect, useRef } from 'react'
import NumberDisplay from './ui/numberDisplay';
import { play } from './lib/playSound';
import { SoundPlayer } from './lib/playSound';

export default function Home() {

  const numWorkers = 5;  
  // Create a reference to the worker object.
  const worker = useRef(null);
  const audioContext = useRef(null);
  const soundPlayer = useRef(null); 

  // We use the `useEffect` hook to set up the worker as soon as the `App` component is mounted.
  useEffect(() => {
    soundPlayer.current = new SoundPlayer(); 
    audioContext.current = new AudioContext();
    worker.current = []; 
    for (let i = 0; i < numWorkers; i++) {
      worker.current.push(new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}));
    }
    
  }, []);

  function createAudioBuffer(float32Array) {
    const buffer = audioContext.current.createBuffer(1, float32Array.length, 16000);
    buffer.copyToChannel(float32Array, 0);
    return buffer;
  }

  function playAudioBuffer(buffer) {
    return new Promise((resolve) => {
      const source = audioContext.current.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1.2;
      source.connect(audioContext.current.destination);
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

  const generate = (worker, text) => new Promise(async (resolve) => {
    //await soundPlayer.createBuffer(["sounds/src_public_sounds_tick.wav"], 300, 10);
    const number = ['four hundred', 'eighty three', 'thousand', 'six hundred', 'forty seven'];
    
    let paths = []; 
    let convert = {
      'four hundred': "400",
      'eighty three': "83",
      "thousand": "thousand",
      'six hundred': "600",
      'forty seven': "47",
    };

    for (let x of number) {
        paths.push(`sounds/numbers/${convert[x]}.wav`);
    }
    await soundPlayer.current.createBuffer(paths, 300, 1);
    soundPlayer.current.play(); 
    /*worker.onmessage = function(e) {
      switch (e.data.status) {
        case 'complete':
          resolve(e.data.output);
          break;
      }
    };
    
    worker.postMessage({
      text,
    });*/
  });

  return (
    <div>
        <button onClick={generate}>
          Generate
        </button>

        <NumberDisplay/>
    </div>
  )
}