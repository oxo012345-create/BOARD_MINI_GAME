// One authenticated D1 transaction claims a due tick and returns its input, or
// returns the cached view. SQL guards prevent pre-authentication mutations.
export async function authorizedPoll(db,{roomCode,key,matchId,sessionHash,token,revision,now=Date.now()}){
 const lease=crypto.randomUUID();
 const authority=alias=>`EXISTS(SELECT 1 FROM rooms hp JOIN json_each(hp.state,'$.players') pp WHERE hp.code=? AND json_extract(hp.state,'$.view')='game' AND json_extract(hp.state,'$.game.id')='swarm-territory' AND json_extract(hp.state,'$.game.swarm.matchId')=? AND json_extract(pp.value,'$.sessionHash')=? AND json_extract(pp.value,'$.status')='active' AND EXISTS(SELECT 1 FROM json_each(${alias}.seats) se WHERE json_extract(se.value,'$.token')=? AND json_extract(hp.state,'$.game.swarm.playerIds['||json_extract(se.value,'$.id')||']')=json_extract(pp.value,'$.id')))`;
 const auth=[roomCode,matchId,sessionHash,token],q=(sql,...args)=>db.prepare(sql).bind(...args);
 const result=await db.batch([
  q(`UPDATE swarm_rooms SET seats=json_set(seats,(SELECT '$['||json_extract(value,'$.id')||'].seen' FROM json_each(seats) WHERE json_extract(value,'$.token')=?),?) WHERE code=? AND expires>? AND ${authority('swarm_rooms')} AND (SELECT json_extract(value,'$.seen') FROM json_each(seats) WHERE json_extract(value,'$.token')=?)<?`,token,now,key,now,...auth,token,now-1500),
  q(`UPDATE swarm_rooms SET lease=?,lease_until=? WHERE code=? AND expires>? AND started=1 AND next_tick<=? AND (lease IS NULL OR lease_until<?) AND ${authority('swarm_rooms')}`,lease,now+12000,key,now,now,now,...auth),
  q(`SELECT (SELECT state FROM rooms WHERE code=?) AS parent_state,r.*,CASE WHEN s.revision>? THEN s.snapshot END AS snapshot,s.acks,s.revision AS state_revision,CASE WHEN r.lease=? THEN 1 ELSE 0 END AS claimed,CASE WHEN r.lease=? THEN s.checkpoint END AS checkpoint,CASE WHEN r.lease=? THEN (SELECT json_group_array(json_object('id',id,'seat',seat,'sequence',sequence,'body',body)) FROM (SELECT id,seat,sequence,body FROM swarm_commands WHERE code=r.code AND done=0 ORDER BY id LIMIT 64)) ELSE '[]' END AS queued FROM swarm_rooms r JOIN swarm_states s ON r.code=s.code WHERE r.code=? AND r.expires>? AND ${authority('r')}`,roomCode,revision,lease,lease,lease,key,now,...auth),
 ]);
 const row=result[2].results[0];return row?{...row,fastPoll:true}:null;
}
