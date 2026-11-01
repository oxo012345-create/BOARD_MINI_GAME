import { scoreNumbers } from './club-baseball';
import type { ClubState } from './club';

export function canMergeIndividual(s: ClubState) {
 return s.kind==='number-baseball' && s.setup.mode==='individual' && s.baseball?.version===2 &&
  Object.entries(s.pending).every(([id,value])=>s.pendingResults?.[id]?.round===s.round && s.pendingResults[id].value===value);
}

/** One atomic SQLite statement merges independent guesses. The fourth guess
 * publishes all histories and the verdict in that SAME write (no intermediate
 * all-submitted state that could become stuck after a failed response). */
export const INDIVIDUAL_SUBMISSION_SQL=`WITH incoming AS (
 SELECT state,
  json_set(COALESCE(json_extract(state,'$.game.club.pending'),'{}'),'$.'||?4,?7) AS pending,
  json_set(CASE WHEN (SELECT count(*) FROM json_each(state,'$.game.club.pending'))=0 THEN '{}' ELSE COALESCE(json_extract(state,'$.game.club.pendingResults'),'{}') END,'$.'||?4,json(?8)) AS results,
  (SELECT key FROM json_each(state,'$.players') WHERE json_extract(value,'$.id')=?4 AND json_extract(value,'$.sessionHash')=?5) AS player_index
 FROM rooms WHERE code=?1
  AND json_extract(state,'$.game.id')='number-baseball'
  AND json_extract(state,'$.game.club.id')=?2
  AND json_extract(state,'$.game.club.setup.mode')='individual'
  AND json_extract(state,'$.game.club.baseball.version')=2
  AND json_extract(state,'$.game.club.round')=?3
  AND json_extract(state,'$.view')='game'
  AND COALESCE(json_extract(state,'$.game.club.finished'),0)=0
  AND COALESCE(json_array_length(state,'$.game.club.paused'),0)=0
  AND EXISTS(SELECT 1 FROM json_each(state,'$.game.club.players') WHERE value=?4)
  AND EXISTS(SELECT 1 FROM json_each(state,'$.players') WHERE json_extract(value,'$.id')=?4 AND json_extract(value,'$.sessionHash')=?5)
  AND NOT EXISTS(SELECT 1 FROM json_each(state,'$.game.club.processed') WHERE value=?6)
  AND json_type(state,'$.game.club.pending.'||?4) IS NULL
  AND (SELECT count(*) FROM json_each(state,'$.game.club.pending'))=(
   SELECT count(*) FROM json_each(state,'$.game.club.pending') p WHERE
    json_extract(state,'$.game.club.pendingResults.'||p.key||'.round')=?3 AND
    json_extract(state,'$.game.club.pendingResults.'||p.key||'.value')=p.value)
), ready AS (
 SELECT *, (SELECT count(*) FROM json_each(pending))=json_array_length(state,'$.game.club.players') AS complete,
  (SELECT json_group_array(p.value) FROM json_each(state,'$.game.club.players') p WHERE json_extract(results,'$.'||p.value||'.strikes')=json_extract(state,'$.game.club.setup.digits')) AS winners,
  (SELECT json_group_array(json_array(p.value)) FROM json_each(state,'$.game.club.players') p WHERE json_extract(results,'$.'||p.value||'.strikes')=json_extract(state,'$.game.club.setup.digits')) AS ranking,
  (SELECT json_group_object(p.value,json(json_insert(COALESCE(json_extract(state,'$.game.club.histories.'||p.value),'[]'),'$[#]',json(json_extract(results,'$.'||p.value))))) FROM json_each(state,'$.game.club.players') p) AS histories
 FROM incoming
) UPDATE rooms SET state=(SELECT json_set(state,
 '$.revision',COALESCE(json_extract(state,'$.revision'),0)+1,
 '$.players['||player_index||'].lastSeen',?9,
 '$.view',CASE WHEN complete AND json_array_length(winners)>0 THEN 'result' ELSE 'game' END,
 '$.game.club.pending',json(CASE WHEN complete THEN '{}' ELSE pending END),
 '$.game.club.pendingResults',json(CASE WHEN complete THEN '{}' ELSE results END),
 '$.game.club.histories',json(CASE WHEN complete THEN histories ELSE json_extract(state,'$.game.club.histories') END),
 '$.game.club.processed',json_insert(json_extract(state,'$.game.club.processed'),'$[#]',?6),
 '$.game.club.finished',json(CASE WHEN complete AND json_array_length(winners)>0 THEN 'true' ELSE 'false' END),
 '$.game.club.winners',json(CASE WHEN complete THEN winners ELSE '[]' END),
 '$.game.club.ranking',json(CASE WHEN complete AND json_array_length(winners)>0 THEN ranking ELSE '[]' END),
 '$.game.club.round',?3+CASE WHEN complete AND json_array_length(winners)=0 THEN 1 ELSE 0 END
 ) FROM ready), updated_at=CURRENT_TIMESTAMP WHERE code=?1 AND EXISTS(SELECT 1 FROM incoming) RETURNING state`;

export function individualSubmissionArgs(code:string,s:ClubState,viewerId:string,sessionHash:string,p:Record<string,unknown>) {
 const value=String(p.value);
 return [code,s.id,s.round,viewerId,sessionHash,String(p.requestId),value,JSON.stringify({round:s.round,value,...scoreNumbers(s.secret,value)}),Date.now()];
}
