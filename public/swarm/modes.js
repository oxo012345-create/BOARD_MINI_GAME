export const MODES=Object.freeze({duel:{label:'1대1',count:2},team:{label:'2대2 팀전',count:4},ffa:{label:'4인 개인전',count:4}});
export const SOLO_COLORS=Object.freeze([
 {main:'#65cdb2',dark:'#287661',light:'#d3f5e8',name:'민트'},
 {main:'#ef8da3',dark:'#ab3e5b',light:'#ffe0e8',name:'코랄'},
 {main:'#ad94e8',dark:'#6a4ba7',light:'#eee4ff',name:'보라'},
 {main:'#efc45c',dark:'#8b681b',light:'#fff2c9',name:'노랑'}
]);
export const TEAM_COLORS=Object.freeze([
 {main:'#70d3b2',dark:'#27735c',light:'#d3f5e8',name:'민트'},
 {main:'#f197a6',dark:'#ae425d',light:'#ffe0e8',name:'코랄'},
 {main:'#3aa5ad',dark:'#205d71',light:'#c9edf2',name:'청록'},
 {main:'#bf6088',dark:'#7f3454',light:'#f4d5e3',name:'장미'}
]);
export function createRoster(mode='duel',{humans=[0],participants=[]}={}){
 const spec=Object.hasOwn(MODES,mode)?MODES[mode]:null;if(!spec)throw new Error('Unknown mode');
 return Array.from({length:spec.count},(_,id)=>({id,team:mode==='team'?id%2:id,human:humans.includes(id),externalId:participants[id]?.id??(id===0?'local':'ai-'+id),name:participants[id]?.name??(id===0?'나':mode==='team'&&id===2?'아군 AI':'AI '+id)}));
}
export function inferMode(players){return players.length===2?'duel':new Set(players.map(p=>p.team)).size===2?'team':'ffa';}
export function colorsForMode(mode){return mode==='team'?TEAM_COLORS:SOLO_COLORS;}
