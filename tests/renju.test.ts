import test from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenBlackMoves, renjuMove } from '../app/api/_lib/renju';
import { clubAction, createClub, matchActor } from '../app/api/_lib/club';
const at=(x:number,y:number)=>y*15+x;
function position(black:number[][],white:number[][]=[]){const b=Array(225).fill(0);for(const [x,y] of black)b[at(x,y)]=1;for(const [x,y] of white)b[at(x,y)]=2;return b;}
const cross=[[6,7],[8,7],[7,6],[7,8]];
test('black starts in the centre, including rematches; white never opens',()=>{
 const empty=position([]);assert.equal(renjuMove(empty,0,1).legal,false);assert.equal(renjuMove(empty,112,1).legal,true);assert.equal(renjuMove(empty,112,2).legal,false);
 for(const mode of ['duel','team','tournament'] as const){const ids=mode==='duel'?['a','b']:['a','b','c','d'];const s=createClub('gomoku',ids,{mode});const again=createClub('gomoku',ids,{mode},s);assert.ok(again.matches.every(m=>m.first===0));if(mode==='duel')assert.equal(matchActor(again.matches[0]),s.matches[0].sides[1][0]);}
});
test('black overline forbidden; white overline wins; exact five takes priority even across overline',()=>{
 const b=position([[4,7],[5,7],[6,7],[8,7],[9,7]]);assert.match(renjuMove(b,112,1).reason! ,/장목/);
 const w=b.map(n=>n===1?2:n);assert.deepEqual(renjuMove(w,112,2),{legal:true,win:true});
 for(const y of [3,4,5,6])b[at(7,y)]=1;
 assert.deepEqual(renjuMove(b,112,1),{legal:true,win:true});assert.equal(forbiddenBlackMoves(b).has(112),false);
});
test('double fours include crossing and two fours in the same direction; one open four counts once',()=>{
 const b=position([[5,7],[6,7],[8,7],[7,5],[7,6],[7,8]]);assert.match(renjuMove(b,112,1).reason!,/사사/);
 const inline=position([[3,7],[5,7],[6,7],[9,7]]);assert.match(renjuMove(inline,112,1).reason!,/사사/);
 const single=position([[5,7],[6,7],[8,7]]);assert.equal(renjuMove(single,112,1).legal,true);
});
test('real straight and broken double threes forbidden, closed/edge threes are legal',()=>{
 assert.match(renjuMove(position(cross),112,1).reason!,/삼삼/);
 assert.match(renjuMove(position([[5,7],[8,7],[7,6],[7,8]]),112,1).reason!,/삼삼/);
 assert.equal(renjuMove(position(cross,[[5,7],[9,7]]),112,1).legal,true);
 assert.equal(renjuMove(position([[0,7],[2,7],[1,6],[1,8]]),at(1,7),1).legal,true);
});
test('a three whose sole straight-four extension makes overline or double-three is a false three',()=>{
 const overline=position([...cross,...[4,5,6,8,9].map(y=>[5,y])],[[10,7]]);
 assert.equal(renjuMove(overline,112,1).legal,true);
 // H8's horizontal three can only extend at F8. F8 creates a legal
 // horizontal four but two new genuine threes, so H8 itself stays legal.
 const recursive=position([...cross,[5,6],[5,8],[4,6],[6,8]],[[10,7]]);
 const after=[...recursive];after[112]=1;
 assert.match(renjuMove(after,at(5,7),1).reason!,/삼삼/);
 assert.equal(renjuMove(recursive,112,1).legal,true);
});
test('forbidden X map matches server verdict without mutating the board; white is unrestricted',()=>{
 const b=position(cross),original=[...b],map=forbiddenBlackMoves(b);assert.equal(map.get(112),'삼삼');assert.deepEqual(b,original);
 for(let i=0;i<225;i++)if(!b[i])assert.equal(map.has(i),!renjuMove(b,i,1).legal);
 assert.equal(renjuMove(b,112,2).legal,true);
 const s=createClub('gomoku',['a','b'],{mode:'duel'}),m=s.matches[0];m.board=b;m.turn=8;
 assert.throws(()=>clubAction(s,matchActor(m),{clubId:s.id,requestId:'forbidden',action:'club-place',matchId:m.id,attempt:1,turn:8,cell:112}),/삼삼/);
 assert.equal(m.turn,8);assert.equal(m.board[112],0);assert.equal(s.processed.length,0);
});
