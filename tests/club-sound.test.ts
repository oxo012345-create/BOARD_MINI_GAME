import test from 'node:test';
import assert from 'node:assert/strict';
import {StoneSoundGate,playStone} from '../app/club-sound';
test('stone audio is once per live move, never snapshot/catchup/rematch/muted replay',()=>{
 const g=new StoneSoundGate();assert.equal(g.accept('g:m:1',0,true),false);assert.equal(g.accept('g:m:1',1,true),true);assert.equal(g.accept('g:m:1',1,true),false);assert.equal(g.accept('g:m:1',0,true),false);assert.equal(g.accept('g:m:1',4,true),false);assert.equal(g.accept('g:m:1',5,false),false);assert.equal(g.accept('g:m:1',5,true),false);assert.equal(g.accept('g:m:1',6,true),true);assert.equal(g.accept('g:m:2',0,true),false);assert.equal(g.accept('g:other:1',7,true),false);assert.equal(g.accept('next:m:1',2,true),false);
});
test('stone synthesis is finite, short and silent while audio is suspended',()=>{
 let data=new Float32Array(),started=0,stopped=0,disconnected=0;let ended:(()=>void)|undefined;
 const ctx={state:'running',currentTime:10,sampleRate:48000,destination:{},createBuffer:(_c:number,n:number)=>{data=new Float32Array(n);return{getChannelData:()=>data};},createGain:()=>({gain:{value:0},connect(){return this;},disconnect(){disconnected++;}}),createBufferSource:()=>({buffer:null,connect(g:unknown){return g;},set onended(fn:()=>void){ended=fn;},start(t:number){assert.equal(t,10);started++;},stop(t:number){assert.ok(t<=10.1);stopped++;},disconnect(){disconnected++;}})};
 playStone(ctx as unknown as AudioContext);assert.equal(started,1);assert.equal(stopped,1);assert.ok(data.every(Number.isFinite));assert.ok(data.some(v=>Math.abs(v)>.01));assert.ok(data.every(v=>Math.abs(v)<1));ended!();assert.equal(disconnected,2);ctx.state='suspended';playStone(ctx as unknown as AudioContext);assert.equal(started,1);
});
