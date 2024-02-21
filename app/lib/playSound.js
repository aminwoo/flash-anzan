"use client";

import Crunker from 'crunker';

export class SoundPlayer {
    constructor() {
        this.crunker = new Crunker(); 
    }

    async createBuffer(paths, interval, count) {
        let audio = [];
        for (var path of paths) {
            let audioBuffer = (await this.crunker.fetchAudio(path))[0]; 
            audio.push(this.trimAudio(audioBuffer));
        }
        audio = this.crunker.concatAudio(audio); 

        const audios = []
        for (let i = 0; i < count; i++) {
            audios.push(this.crunker.padAudio(audio, 0, (interval * i) / 1000))
        }
        this.buffer = this.crunker.mergeAudio(audios);

        return this.buffer; 
    }

    trimAudio(audioBuffer, threshold=0.02) {
        const sampleRate = audioBuffer.sampleRate; 
        const channels = audioBuffer.numberOfChannels;
        const channelData = audioBuffer.getChannelData(0); 
    
        let l = 0; 
        let r = 0; 
        for (let i = 0; i < channelData.length; i++) {
            if (channelData[i] > threshold) {
                if (l == 0) {
                    l = i;
                }
                r = i; 
            }
        }
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(
            channels,
            r - l,
            sampleRate
        );

        const originalData = audioBuffer.getChannelData(0);
        const newData = newBuffer.getChannelData(0);
        for (let i = 0; i < r - l; i++) {
            newData[i] = originalData[i + l];
        }
        return newBuffer; 
    }

    play() {
        this.crunker.play(this.buffer);
    }

}
