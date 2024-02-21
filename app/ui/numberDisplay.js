"use client";

import { useEffect, useState, useRef } from "react";
import "./numberDisplay.css"
import { SoundPlayer } from "../lib/playSound";

export default function NumberDisplay({ nums }) {

    const [ playing, setPlaying ] = useState(false); 
    const [hide, setHide] = useState(true);
    const [index, setIndex] = useState(-1);

    
    const soundPlayer = useRef(null); 

    useEffect(() => {
        soundPlayer.current = new SoundPlayer(); 
        soundPlayer.current.createBuffer(["sounds/src_public_sounds_tick.wav"], 1000, 10);
        const interval = setInterval(() => {
                setHide(true);
                setTimeout(() => {
                    if (!soundPlayer.current.isPlaying()) {
                        soundPlayer.current.play();
                    }
                    setIndex(index => index + 1); 
                    setHide(false); 
                }, 50);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="abacus-font number-area">
            {!hide && nums[index]}
        </div>
    );
}