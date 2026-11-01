import type { ClubState } from './club';

export type BaseballState = { version: 2; phase: 'setup' | 'play'; secrets: Record<string, string>; turn: number };
export type BaseballView = { phase: 'setup' | 'play'; turn: number; ready: string[]; activeKey?: string; ownSecret?: string; revealed?: Record<string, string>; attempts: Record<string, number>; lastChance: boolean };
export function scoreNumbers(secret: string, value: string) {
  let strikes=0,balls=0;
  const remaining:Record<string,number>={};
  for(let i=0;i<secret.length;i++){if(value[i]===secret[i])strikes++;else remaining[secret[i]]=(remaining[secret[i]]??0)+1;}
  for(let i=0;i<value.length;i++){if(value[i]!==secret[i]&&remaining[value[i]]>0){balls++;remaining[value[i]]--;}}
  return {strikes,balls};
}
export const baseballKey=(s:ClubState,id:string)=>s.setup.mode==='team'?`team-${s.teams.findIndex(t=>t.includes(id))}`:id;
export const baseballKeys=(s:ClubState)=>s.setup.mode==='team'?['team-0','team-1']:s.baseball&&s.setup.mode==='duel'?s.teams.map(t=>t[0]):s.players;
export function baseballInputter(s:ClubState,key:string){return s.setup.mode==='team'?s.teams[Number(key.slice(-1))][s.baseball?.phase==='setup'?0:(s.round-1)%2]:key;}
export function activeBaseballKey(s:ClubState){return s.baseball&&s.setup.mode!=='individual'?baseballKeys(s)[(s.baseball.turn+s.first)%2]:undefined;}
export function baseballView(s:ClubState,viewer?:string):BaseballView|undefined{
  const b=s.baseball;if(!b)return;
  const key=viewer&&s.players.includes(viewer)?baseballKey(s,viewer):undefined;
  return {phase:b.phase,turn:b.turn,ready:Object.keys(b.secrets),activeKey:b.phase==='play'?activeBaseballKey(s):undefined,
    ownSecret:key?b.secrets[key]:undefined,
    revealed:s.finished?(s.setup.mode==='individual'?{common:s.secret}:{...b.secrets}):undefined,
    attempts:Object.fromEntries(baseballKeys(s).map(k=>[k,s.histories[k]?.length??0])),
    lastChance:b.turn%2===1&&Object.keys(s.pending).some(k=>s.histories[k]?.at(-1)?.strikes===s.setup.digits)};
}
function validate(s:ClubState,value:unknown){const n=String(value??'');if(!/^[1-9]+$/.test(n)||n.length!==s.setup.digits||(!s.setup.allowDuplicates&&new Set(n).size!==n.length))throw new Error(`${s.setup.allowDuplicates?'':'중복 없이 '}1~9 숫자 ${s.setup.digits}자리를 입력해 주세요.`);return n;}
function finish(s:ClubState,winners:string[]){s.finished=true;s.winners=winners;s.ranking=winners.map(k=>s.setup.mode==='team'?s.teams[Number(k.slice(-1))]:[k]);}

/** v2 duel/team: private number setup, alternating attacks, equal attempts.
 * Individual and legacy games keep their simultaneous common-secret protocol. */
export function baseballAction(s:ClubState,player:string,p:Record<string,unknown>){
  const key=baseballKey(s,player),b=s.baseball,opposed=!!b&&s.setup.mode!=='individual';
  if(opposed&&b.phase==='setup'){
    if(p.action!=='club-secret')throw new Error('먼저 비밀 숫자를 정해 주세요.');
    if(baseballInputter(s,key)!==player)throw new Error('비밀 숫자는 팀의 첫 번째 참가자가 정해 주세요.');
    if(b.secrets[key])throw new Error('이미 비밀 숫자를 확정했어요.');
    b.secrets[key]=validate(s,p.value);
    if(baseballKeys(s).every(k=>b.secrets[k]))b.phase='play';
    return;
  }
  if(p.action!=='club-guess'||p.round!==s.round)throw new Error('현재 라운드를 확인해 주세요.');
  if(baseballInputter(s,key)!==player)throw new Error('이번 라운드 입력 담당이 아니에요.');
  if(s.pending[key])throw new Error('이미 제출했어요.');
  if(opposed&&(key!==activeBaseballKey(s)||p.turn!==b.turn))throw new Error('현재 차례가 아니에요.');
  const value=validate(s,p.value);
  if((s.histories[key]??[]).some(h=>h.value===value))throw new Error('이미 추리한 숫자예요. 기록을 확인해 주세요.');
  s.pending[key]=value;
  if(opposed){
    const opponent=baseballKeys(s).find(k=>k!==key)!;
    (s.histories[key]??=[]).push({round:s.round,value,...scoreNumbers(b.secrets[opponent],value)});
    b.turn++;
    // Complete both turns before deciding a winner, even if the first attack solved it.
    if(b.turn%2===0){const winners=baseballKeys(s).filter(k=>s.histories[k]?.at(-1)?.strikes===s.setup.digits);s.pending={};if(winners.length)finish(s,winners);else s.round++;}
  }else if(baseballKeys(s).every(k=>s.pending[k])){
    const winners:string[]=[];
    for(const k of baseballKeys(s)){const guess=s.pending[k],result=scoreNumbers(s.secret,guess);(s.histories[k]??=[]).push({round:s.round,value:guess,...result});if(result.strikes===s.setup.digits)winners.push(k);}
    s.pending={};s.pendingResults={};if(winners.length)finish(s,winners);else s.round++;
  }
}
