import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
registerHooks({resolve(specifier,context,next){if(specifier.endsWith('.css'))return{url:'data:text/javascript,export default {};',shortCircuit:true};return next(specifier,context);}});
const {ClubGame,ClubBriefing}=await import('../app/club-games.tsx');
const {createClub,clubClientState}=await import('../app/api/_lib/club.ts');
const players=['a','b','c','d'].map((id,i)=>({id,name:`참가자${i+1}`}));
const ids=players.map(p=>p.id),noop=()=>{},action=async()=>{};
test('1대1 is selectable only with two players, with matching start count and result labels',()=>{
 for(const kind of ['gomoku','alkkagi','number-baseball'])for(const count of [1,2,3,4,5]){
  const roster=Array.from({length:count},(_,i)=>({id:String(i),name:`참가자${i}`}));
  const html=renderToStaticMarkup(createElement(ClubBriefing,{kind,setup:{mode:'duel',digits:3,obstacles:false},players:roster,isHost:true,onAction:action,onStart:noop}));
  const mode=html.match(/<button[^>]*>1대1<\/button>/)[0];
  const start=html.match(/<button[^>]*>게임 시작<\/button>/)[0];
  assert.equal(mode.includes('disabled'),count!==2);
  assert.equal(start.includes('disabled'),count!==2);
 }
 const state=createClub('number-baseball',['a','b'],{mode:'duel'});state.finished=true;state.ranking=[['a'],['b']];
 const html=renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));
 assert.match(html,/>1대1</);assert.match(html,/>무승부</);
});
test('five circular obstacle medallions match collision geometry',()=>{
 const state=createClub('alkkagi',ids,{mode:'team',redIds:['a','c'],obstacles:true});
 const html=renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));
 assert.equal((html.match(/data-bumper="[0-4]"/g)||[]).length,5);
});

test('black forbidden moves show X and disabled cells; white can select the same point',()=>{
 const state=createClub('gomoku',ids,{mode:'team',redIds:['a','c']}),m=state.matches[0];
 for(const i of [111,113,97,127])m.board[i]=1;m.turn=8;
 const render=()=>renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));
 const black=render();assert.match(black,/data-forbidden="112"/);assert.match(black,/<button[^>]*disabled=""[^>]*aria-label="H8 삼삼 금수"/);assert.match(black,/렌주룰/);
 m.turn=9;assert.doesNotMatch(render(),/data-forbidden=/);
});
test('new screens render only the three separate games and required controls',()=>{for(const kind of ['gomoku','alkkagi','number-baseball']){const state=createClub(kind,ids,{mode:kind==='number-baseball'?'individual':'team',redIds:['a','c']});const html=renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));assert.doesNotMatch(html,/무르기|새 게임|제한시간|시간 초과|가입 없이|YOUR LITTLE|만든 이야기|작은 클럽/);if(kind==='gomoku'){assert.equal((html.match(/role="gridcell"/g)||[]).length,225);assert.match(html,/>착수</);}if(kind==='number-baseball')assert.match(html,/추리 숫자/);if(kind==='alkkagi')assert.match(html,/알까기 게임판/);const briefing=renderToStaticMarkup(createElement(ClubBriefing,{kind,players,isHost:true,onAction:action,onStart:noop}));if(kind==='alkkagi')assert.match(briefing,/장애물 OFF/);if(kind==='number-baseball')assert.match(briefing,/4자리/);}});
