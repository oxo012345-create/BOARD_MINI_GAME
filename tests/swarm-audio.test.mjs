import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BattleAudio,bindAudioActivation} from '../public/swarm/audio.js';

const param=()=>({value:0,cancelScheduledValues(){},setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}});
class Context{
 state='suspended';currentTime=0;sampleRate=64;calls=0;destination={};
 createGain(){return{gain:param(),connect(){}};}
 createDynamicsCompressor(){return{...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()])),connect(){}};}
 createAnalyser(){return{fftSize:256,connect(){},getFloatTimeDomainData(a){a.fill(0);}};}
 createBuffer(){return{getChannelData:()=>new Float32Array(64)};}
 resume(){this.calls++;this.state='running';this.onstatechange?.();return Promise.resolve();}
}
test('a first in-game tap resumes even when a non-gesture resume remains pending; later touches recover interruptions',async()=>{
 const context=new Context(),audio=new BattleAudio({context,music:0}),listeners=new Map();
 const target={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const unbind=bindAudioActivation(target,audio);let allow=false;
 context.resume=function(){this.calls++;if(!allow)return new Promise(()=>{});this.state='running';this.onstatechange?.();return Promise.resolve();};
 void audio.unlock();assert.equal(context.calls,1);
 listeners.get('click')({isTrusted:false});assert.equal(context.calls,1);
 allow=true;listeners.get('touchend')({isTrusted:true});
 assert.equal(context.calls,2,'trusted gesture must synchronously issue another resume');
 assert.equal(context.state,'running');
 listeners.get('pointerdown')({isTrusted:true});assert.equal(context.calls,2,'running audio is left alone');
 context.state='interrupted';context.onstatechange();
 listeners.get('keydown')({isTrusted:true});assert.equal(context.calls,3);assert.equal(context.state,'running');
 audio.configure({enabled:false});context.state='suspended';
 listeners.get('click')({isTrusted:true});assert.equal(context.calls,3,'preserve explicit mute');
 assert.equal(await audio.unlock(),false);unbind();assert.equal(listeners.size,0);
});
test('interruption stops BGM scheduling and an OS resume restarts one scheduler; suspended effects never queue',async()=>{
 const context=new Context(),audio=new BattleAudio({context,music:0});
 try{
  audio.setPlaying(true);await audio.unlock();assert.ok(audio.timer);const timer=audio.timer;
  await audio.unlock();assert.equal(audio.timer,timer);
  context.state='interrupted';context.onstatechange();assert.equal(audio.timer,null);
  audio.effect('shot');assert.equal(audio.stats.shot,0);assert.equal(audio.sources.size,0);
  context.state='running';context.onstatechange();assert.ok(audio.timer);
 }finally{audio.setPlaying(false);assert.equal(audio.timer,null);}
});
test('closed contexts rebuild the graph; rejected resume is recoverable and unavailable APIs fail quietly',async()=>{
 const original=globalThis.AudioContext;globalThis.AudioContext=Context;
 try{
  const context=new Context(),audio=new BattleAudio({context});context.state='closed';
  assert.equal(await audio.unlock(),true);assert.notEqual(audio.context,context);assert.ok(audio.ready);
  audio.context.state='suspended';audio.context.resume=()=>Promise.reject(Error('policy'));
  assert.equal(await audio.unlock(),false);
  audio.context.resume=Context.prototype.resume;assert.equal(await audio.unlock(),true);
  globalThis.AudioContext=undefined;assert.equal(await new BattleAudio().unlock(),false);
 }finally{globalThis.AudioContext=original;}
});
test('a replacement already-running context schedules immediately instead of waiting for the old context clock',async()=>{
 const original=globalThis.AudioContext;globalThis.AudioContext=class extends Context{state='running';};
 const audio=new BattleAudio({context:new Context(),music:0});
 try{
  audio.context.currentTime=120;audio.setPlaying(true);await audio.unlock();
  audio.context.state='closed';audio.context.onstatechange();const beat=audio.beat;
  await audio.unlock();assert.ok(audio.beat>beat,'BGM resumes on the replacement clock immediately');
 }finally{audio.setPlaying(false);globalThis.AudioContext=original;}
});
