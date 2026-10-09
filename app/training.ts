import { RECORDED_VOICE } from './recorded-speech.mjs';
export type SpeechSettings = { speech:boolean; speechVoice:string; speechRate:number };
export type Settings = SpeechSettings & { digits:number; count:number; speed:number; gap:number; countdown:number; mode:'positive'|'mixed'|'negative'; negativePercent:number; nonNegative:boolean; mixedDigits:boolean; sound:boolean; fontSize:number; continuous:boolean };
export const defaults:Settings={digits:2,count:10,speed:1,gap:.15,countdown:0,mode:'positive',negativePercent:50,nonNegative:false,mixedDigits:false,sound:false,speech:false,speechVoice:RECORDED_VOICE,speechRate:1,fontSize:126,continuous:true};
export function normalize(s:Partial<Settings>):Settings{
 const bounded=(v:unknown,f:number,min:number,max:number,integer=false)=>{const n=typeof v==='number'&&Number.isFinite(v)?v:f;return integer?Math.round(Math.max(min,Math.min(max,n))):Math.max(min,Math.min(max,n));};
 return {continuous:s.continuous!==false,digits:bounded(s.digits,2,1,6,true),count:bounded(s.count,10,2,100,true),speed:bounded(s.speed,1,.1,10),gap:bounded(s.gap,.15,0,3),countdown:0,mode:['positive','mixed','negative'].includes(s.mode||'')?s.mode!: 'positive',negativePercent:bounded(s.negativePercent,50,0,100,true),nonNegative:s.nonNegative===true,mixedDigits:s.mixedDigits===true,sound:s.sound===true,speech:s.speech===true,speechVoice:typeof s.speechVoice==='string'&&s.speechVoice!=='anzan-recorded-english-v1'?s.speechVoice:RECORDED_VOICE,speechRate:bounded(s.speechRate,1,.5,3),fontSize:bounded(s.fontSize,126,60,220,true)};
}
export function generate(s:Settings,rng= Math.random):number[]{
 const numbers:number[]=[]; let total=0;
 for(let i=0;i<s.count;i++){
 const d=s.mixedDigits?1+Math.floor(rng()*s.digits):s.digits;
 const min=10**(d-1),max=10**d-1;
 let value=min+Math.floor(rng()*(max-min+1));
 if(s.mode==='negative'||(s.mode==='mixed'&&rng()*100<s.negativePercent)){
  if(s.mode==='mixed'&&s.nonNegative){if(total>=min)value=-(min+Math.floor(rng()*(Math.min(max,total)-min+1)));}
  else value=-value;
 }
 numbers.push(value); total+=value;
 }return numbers;
}
