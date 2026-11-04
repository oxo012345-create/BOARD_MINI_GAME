import {env} from 'cloudflare:workers';
import {OnlineRoom} from './room.js';
import {base64} from './d1-rooms.js';
import {MatchSession} from '../../../../../public/swarm/integration.js';
import {SnapshotEncoder} from '../../../../../public/swarm/net-protocol.js';
export function swarmDatabase(){return env.DB;}
export function swarmEnvironment(){return env;}
export function makeInitialBattle({key,mode,seed,seats}){
 const army=new OnlineRoom({code:key,mode,seed,cpuTiming:false});army.seats=seats;
 army.session=new MatchSession({mode,seed,matchId:key,humans:seats.map(s=>s.id),participants:seats.map(s=>({id:'seat-'+s.id,name:s.name}))});
 const packet=new SnapshotEncoder().encode(army.session.game,{full:true,stats:{transport:'https-d1',authority:'server',tickMs:null,encodeMs:null,lagMs:0,timingSource:'worker-cpu-time-unavailable'}});
 return {checkpoint:JSON.stringify({room:army.checkpoint(),accumulator:0}),snapshot:base64(packet)};
}
