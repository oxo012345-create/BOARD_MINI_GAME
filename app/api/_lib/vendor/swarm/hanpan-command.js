import {roomAuthority} from './hanpan-poll.js';
import {sanitizeCommand} from './d1-rooms.js';

// Validate and enqueue under the same authority transaction that reads the
// parent and claims a tick. A busy owner leaves the queued command untouched.
export async function authorizedCommand(db,{roomCode,key,matchId,sessionHash,token,revision,command,now=Date.now()}){
 const sanitized=sanitizeCommand(command,key);if(!sanitized)return null;
 const lease=crypto.randomUUID(),auth=[roomCode,matchId,sessionHash,token],q=(sql,...args)=>db.prepare(sql).bind(...args);
 const exists=`EXISTS(SELECT 1 FROM swarm_commands c JOIN json_each(swarm_rooms.seats) seat WHERE c.code=swarm_rooms.code AND c.seat=json_extract(seat.value,'$.id') AND json_extract(seat.value,'$.token')=? AND c.sequence=?)`;
 const results=await db.batch([
  q(`INSERT OR IGNORE INTO swarm_commands(code,seat,sequence,body) SELECT r.code,json_extract(se.value,'$.id'),?,? FROM swarm_rooms r JOIN json_each(r.seats) se WHERE r.code=? AND r.expires>? AND r.started=1 AND json_extract(se.value,'$.token')=? AND ${roomAuthority('r')} AND (SELECT count(*) FROM swarm_commands WHERE code=r.code AND done=0)<64`,sanitized.sequence,JSON.stringify(sanitized),key,now,token,...auth),
  q(`UPDATE swarm_rooms SET lease=?,lease_until=? WHERE code=? AND expires>? AND started=1 AND (lease IS NULL OR lease_until<?) AND ${roomAuthority('swarm_rooms')} AND ${exists}`,lease,now+12000,key,now,now,...auth,token,sanitized.sequence),
  q(`SELECT (SELECT state FROM rooms WHERE code=?) AS parent_state,r.*,CASE WHEN s.revision>? THEN s.snapshot END AS snapshot,s.acks,s.revision AS state_revision,CASE WHEN r.lease=? THEN 1 ELSE 0 END AS claimed,CASE WHEN r.lease=? THEN s.checkpoint END AS checkpoint,CASE WHEN r.lease=? THEN (SELECT json_group_array(json_object('id',id,'seat',seat,'sequence',sequence,'body',body)) FROM (SELECT id,seat,sequence,body FROM swarm_commands WHERE code=r.code AND done=0 ORDER BY id LIMIT 64)) ELSE '[]' END AS queued,EXISTS(SELECT 1 FROM swarm_commands c JOIN json_each(r.seats) se WHERE c.code=r.code AND c.seat=json_extract(se.value,'$.id') AND json_extract(se.value,'$.token')=? AND c.sequence=?) AS queueAccepted FROM swarm_rooms r JOIN swarm_states s ON r.code=s.code WHERE r.code=? AND r.expires>? AND r.started=1 AND ${roomAuthority('r')}`,roomCode,revision,lease,lease,lease,token,sanitized.sequence,key,now,...auth),
 ]);
 const row=results[2].results[0];return row?{...row,fastCommand:true}:null;
}
