export function matchResult(game,seat){
 const p=game.players[seat],win=game.winner===p.team,draw=game.winner===null;
 if(game.reason==='timeout'&&!game.players.some(r=>r.team===p.team&&!r.eliminated))return{win:false,draw:false,title:'경기 종료 · 내 군단 탈락',description:'남은 군단은 시간 종료로 무승부가 됐습니다. 내 군단은 그 전에 탈락했습니다.'};
 if(game.reason==='timeout')return{win:false,draw:true,title:'시간 종료 · 무승부',description:'6분 안에 전멸 승부가 나지 않아 경기를 종료했습니다.'};
 if(game.reason==='abandoned')return{win:false,draw:true,title:'전원 이탈 · 경기 중단',description:'활동 중인 참가자가 2분 동안 없어 승패 없이 종료했습니다.'};
 if(game.reason==='inactive')return{win:false,draw:true,title:'진행 없음 · 경기 종료',description:'모든 생존 참가자가 방치 경고에 응답하지 않아 무승부로 종료했습니다.'};
 if(game.reason==='forfeit')return{win,draw,title:win?'기권승':'기권패',description:win?'상대 군단의 생존 참가자가 모두 기권 처리됐습니다.':'우리 군단의 생존 참가자가 모두 기권 처리됐습니다.'};
 return{win,draw,title:draw?'팽팽한 승부였어요.':win?'이 땅은 우리 군단의 것!':'다시, 전선을 향해.',description:draw?'양측의 성큰 콜로니와 히드라가 모두 소멸했습니다.':win?'적의 성큰 콜로니와 히드라를 모두 없앴습니다.':'우리의 성큰 콜로니와 히드라를 모두 잃었습니다.'};
}
