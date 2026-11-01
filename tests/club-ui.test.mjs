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
test('obstacle collision rectangles have visible SVG dimensions',()=>{
 const state=createClub('alkkagi',ids,{mode:'team',redIds:['a','c'],obstacles:true});
 const html=renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));
 assert.equal((html.match(/width="60" height="35"/g)||[]).length,2);
});
test('new screens render only the three separate games and required controls',()=>{for(const kind of ['gomoku','alkkagi','number-baseball']){const state=createClub(kind,ids,{mode:kind==='number-baseball'?'individual':'team',redIds:['a','c']});const html=renderToStaticMarkup(createElement(ClubGame,{s:clubClientState(state,'a'),players,meId:'a',isHost:true,onAction:action,onReplay:noop,onLobby:noop}));assert.doesNotMatch(html,/무르기|새 게임|제한시간|시간 초과|가입 없이|YOUR LITTLE|만든 이야기|작은 클럽/);if(kind==='gomoku'){assert.equal((html.match(/role="gridcell"/g)||[]).length,225);assert.match(html,/>착수</);}if(kind==='number-baseball')assert.match(html,/추리 숫자/);if(kind==='alkkagi')assert.match(html,/알까기 게임판/);const briefing=renderToStaticMarkup(createElement(ClubBriefing,{kind,players,isHost:true,onAction:action,onStart:noop}));if(kind==='alkkagi')assert.match(briefing,/장애물 OFF/);if(kind==='number-baseball')assert.match(briefing,/4자리/);}});
