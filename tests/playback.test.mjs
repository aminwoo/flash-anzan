import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePlayback } from '../app/duel/playback.mjs';

test('delayed speech holds the number past its timer and finishes before gaps or the answer', () => {
 let state={index:0,visible:true,finished:false,deadline:100};
 assert.strictEqual(advancePlayback(state,5000,2,100,150,false),state);
 state=advancePlayback(state,5100,2,100,150,true);
 assert.equal(state.visible,false);assert.equal(state.deadline,5250);
 state=advancePlayback(state,5250,2,100,150,true);
 assert.equal(state.index,1);assert.equal(state.visible,true);
 assert.strictEqual(advancePlayback(state,9000,2,100,150,false),state);
 assert.equal(advancePlayback(state,9000,2,100,150,true).finished,true);
});

test('completed speech still waits for the minimum display time with no gap', () => {
 const state={index:0,visible:true,finished:false,deadline:1000};
 assert.strictEqual(advancePlayback(state,500,2,1000,0,true),state);
 assert.strictEqual(advancePlayback(state,2000,2,1000,0,false),state);
 const next=advancePlayback(state,2000,2,1000,0,true);
 assert.equal(next.index,1);assert.equal(next.deadline,3000);
});

test('the first numbers get their full duration, including after a delayed frame', () => {
 let state={index:0,visible:true,finished:false,deadline:1000};
 assert.strictEqual(advancePlayback(state,999,3,1000,0),state);
 // A delayed render must not fast-forward or shorten the second number to catch up.
 state=advancePlayback(state,1350,3,1000,0);
 assert.equal(state.index,1);assert.equal(state.deadline,2350);
 assert.strictEqual(advancePlayback(state,2349,3,1000,0),state);
 state=advancePlayback(state,5000,3,1000,0);
 assert.equal(state.index,2);assert.equal(state.deadline,6000);
 assert.strictEqual(advancePlayback(state,5999,3,1000,0),state);
 assert.equal(advancePlayback(state,6000,3,1000,0).finished,true);
});

test('fast numbers and gaps each retain their full duration', () => {
 let state={index:0,visible:true,finished:false,deadline:100};
 state=advancePlayback(state,105,2,100,150);
 assert.equal(state.index,0);assert.equal(state.visible,false);assert.equal(state.deadline,255);
 assert.strictEqual(advancePlayback(state,254,2,100,150),state);
 state=advancePlayback(state,270,2,100,150);
 assert.equal(state.index,1);assert.equal(state.visible,true);assert.equal(state.deadline,370);
 assert.strictEqual(advancePlayback(state,369,2,100,150),state);
 state=advancePlayback(state,370,2,100,150);
 assert.equal(state.finished,true);assert.strictEqual(advancePlayback(state,10000,2,100,150),state);
});
