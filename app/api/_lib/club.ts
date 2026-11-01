import { initialDiscs, simulateShot, type Disc } from './club-physics';
import { baseballAction, baseballInputter, baseballView, scoreNumbers, type BaseballState, type BaseballView } from './club-baseball';
import { renjuMove } from './renju';
export const CLUB_IDS = ['gomoku', 'alkkagi', 'number-baseball'] as const;
export type ClubId = typeof CLUB_IDS[number];
export const isClub = (id: unknown): id is ClubId => CLUB_IDS.includes(id as ClubId);
export type ClubSetup = { mode: 'duel' | 'tournament' | 'team' | 'individual'; digits: 3 | 4; obstacles: boolean; redIds?: string[] };
export const defaultClubSetup = (id: ClubId, playerCount = 4): ClubSetup => ({ mode: playerCount === 2 ? 'duel' : id === 'number-baseball' ? 'individual' : 'tournament', digits: 3, obstacles: false });
export type Match = { id: string; label: string; sides: [string[], string[]]; turn: number; first: number; attempt: number; board: number[]; discs: Disc[]; winner?: number; draw?: boolean; replayReady: string[]; frames?: Disc[][]; shot?: number; lastMove?: number };
export type Guess = { round: number; value: string; strikes: number; balls: number };
export type ClubState = { id: string; kind: ClubId; setup: ClubSetup; players: string[]; teams: [string[], string[]]; first: number; matches: Match[]; stage: number; finished: boolean; ranking: string[][]; secret: string; round: number; pending: Record<string, string>; histories: Record<string, Guess[]>; winners: string[]; processed: string[]; paused?: string[]; baseball?: BaseballState };
export type ClubView = Omit<ClubState, 'secret' | 'pending' | 'histories' | 'processed' | 'baseball'> & { baseball?: BaseballView; submitted: string[]; history: Guess[]; myKey?: string; inputter?: string; mySubmitted: boolean };
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function cleanClubSetup(kind: ClubId, value: Partial<ClubSetup> = {}): ClubSetup {
  const mode = value.mode === 'duel' ? 'duel' : value.mode === 'team' ? 'team' : kind === 'number-baseball' ? 'individual' : 'tournament';
  return { mode, digits: value.digits === 4 ? 4 : 3, obstacles: kind === 'alkkagi' && value.obstacles === true, redIds: Array.isArray(value.redIds) ? value.redIds.map(String).slice(0, 2) : undefined };
}
function newMatch(id: string, label: string, sides: [string[], string[]], first: number, attempt = 1): Match { return { id, label, sides, first, attempt, turn: 0, board: Array(225).fill(0), discs: initialDiscs(), replayReady: [] }; }
function blackStarts(m: Match, kind: ClubId) { if (kind === 'gomoku' && m.first === 1) { m.sides = [m.sides[1], m.sides[0]]; m.first = 0; } return m; }
export function createClub(kind: ClubId, players: string[], input: Partial<ClubSetup> = {}, previous?: ClubState): ClubState {
  const setup = cleanClubSetup(kind, input);
  const required = setup.mode === 'duel' ? 2 : 4;
  if (players.length !== required || new Set(players).size !== required) throw new Error(setup.mode === 'duel' ? '1대1은 정확히 2명일 때만 시작할 수 있어요.' : '4명이 모이면 시작할 수 있어요.');
  const red = setup.redIds;
  if (setup.mode === 'team' && red && (red.length !== 2 || new Set(red).size !== 2 || red.some(id => !players.includes(id)))) throw new Error('빨강 팀 두 명을 선택해 주세요.');
  const sameRoster = previous && [...players].sort().join() === [...previous.players].sort().join();
  const ordered = shuffle(players);
  const teams: [string[], string[]] = setup.mode === 'duel' ? (sameRoster && previous.setup.mode === 'duel' ? previous.teams : [[ordered[0]], [ordered[1]]]) : setup.mode === 'team' && red ? [red, players.filter(id => !red.includes(id))] : sameRoster && previous.setup.mode === 'team' && setup.mode === 'team' ? previous.teams : [ordered.slice(0, 2), ordered.slice(2)];
  const first = sameRoster ? 1 - previous.first : 0;
  const state: ClubState = { id: crypto.randomUUID(), kind, setup, players, teams, first, matches: [], stage: 0, finished: false, ranking: [], secret: kind === 'number-baseball' ? shuffle('123456789'.split('')).slice(0, setup.digits).join('') : '', round: 1, pending: {}, histories: {}, winners: [], processed: [] };
  if (kind !== 'number-baseball') state.matches = setup.mode === 'duel' ? [newMatch('duel', '1대1', teams, first)] : setup.mode === 'team' ? [newMatch('team', '2대2 팀전', teams, first)] : [newMatch('semi-1', '준결승 1', [[ordered[0]], [ordered[1]]], first), newMatch('semi-2', '준결승 2', [[ordered[2]], [ordered[3]]], first)];
  if(kind==='number-baseball')state.baseball={version:2,phase:setup.mode==='individual'?'play':'setup',secrets:{},turn:0};
  state.matches.forEach(m => blackStarts(m, kind));
  return state;
}
export function matchSide(m: Match) { return (m.turn + m.first) % 2; }
export function matchActor(m: Match) { const side = matchSide(m); return m.sides[side][Math.floor(m.turn / 2) % m.sides[side].length]; }
export function hasFive(board: number[], cell: number, color: number) {
  const x = cell % 15, y = Math.floor(cell / 15);
  return [[1,0],[0,1],[1,1],[1,-1]].some(([dx,dy]) => {
    let n = 1;
    for (const sign of [-1,1]) for (let k = 1; k < 15; k++) { const nx=x+dx*k*sign, ny=y+dy*k*sign; if(nx<0||nx>=15||ny<0||ny>=15||board[ny*15+nx]!==color) break; n++; }
    return n >= 5;
  });
}
export const judge = scoreNumbers;
export function clubKey(s: ClubState, viewer?: string) { if (!viewer || !s.players.includes(viewer)) return undefined; return s.setup.mode==='team' ? `team-${s.teams.findIndex(t=>t.includes(viewer))}` : viewer; }
export const baseballActor = baseballInputter;
export function clubClientState(s: ClubState, viewer?: string): ClubView {
  // Explicit allowlist: never serialize the secret, guesses in flight, or opponents' histories.
  const key = clubKey(s,viewer);
  return { id:s.id,kind:s.kind,setup:s.setup,players:s.players,teams:s.teams,first:s.first,matches:s.matches,stage:s.stage,finished:s.finished,ranking:s.ranking,round:s.round,winners:s.winners,paused:s.paused,baseball:baseballView(s,viewer),submitted:Object.keys(s.pending),history:key?s.histories[key]??[]:[],myKey:key,inputter:key?baseballActor(s,key):undefined,mySubmitted:Boolean(key && s.pending[key]) };
}
function progress(s: ClubState) {
  if (!s.matches.every(m=>m.winner!==undefined)) return;
  const winner = (m: Match) => m.sides[m.winner!], loser = (m: Match) => m.sides[1-m.winner!];
  if (s.setup.mode!=='tournament') { s.finished=true; s.ranking=[winner(s.matches[0]),loser(s.matches[0])]; }
  else if (s.stage===0) { const [a,b]=s.matches; s.stage=1; s.matches.push(blackStarts(newMatch('final','결승',[winner(a),winner(b)],1-s.first),s.kind),blackStarts(newMatch('bronze','3·4위전',[loser(a),loser(b)],1-s.first),s.kind)); }
  else { const f=s.matches.find(m=>m.id==='final')!, b=s.matches.find(m=>m.id==='bronze')!; s.finished=true;s.ranking=[winner(f),loser(f),winner(b),loser(b)]; }
}
export function clubAction(s: ClubState, player: string, p: Record<string, unknown>) {
  if(!s.players.includes(player)) throw new Error('이번 경기 참가자가 아니에요.');
  if(p.clubId!==s.id) throw new Error('이전 경기 입력이에요.');
  const requestId=String(p.requestId??''); if(!requestId || requestId.length>100) throw new Error('요청 번호가 필요해요.');
  if(s.processed.includes(requestId)) return;
  if(s.finished || s.paused?.length) throw new Error(s.paused?.length?'참가자의 복귀를 기다리고 있어요.':'경기가 끝났어요.');
  if(s.kind==='number-baseball') {
    baseballAction(s,player,p);
  } else {
    const m=s.matches.find(m=>m.id===p.matchId); if(!m)throw new Error('경기를 다시 선택해 주세요.');
    if(p.attempt!==m.attempt || p.turn!==m.turn)throw new Error('차례가 바뀌었어요.');
    if(p.action==='club-replay-draw') {
      if(!m.draw || !m.sides.flat().includes(player))throw new Error('재경기 대상이 아니에요.');
      if(!m.replayReady.includes(player))m.replayReady.push(player);
      if(m.sides.flat().every(id=>m.replayReady.includes(id))) {
        Object.assign(m,blackStarts(newMatch(m.id,m.label,m.sides,1-m.first,m.attempt+1),s.kind));
        // Optional terminal/animation fields are absent from a fresh match;
        // Object.assign alone would leave the previous draw permanently active.
        delete m.draw; delete m.winner; delete m.frames; delete m.shot; delete m.lastMove;
      }
    }else{
      if(m.winner!==undefined||m.draw||matchActor(m)!==player)throw new Error('현재 차례가 아니에요.');
      const side=matchSide(m);
      if(s.kind==='gomoku' && p.action==='club-place') {
        const cell=Number(p.cell);if(!Number.isInteger(cell)||cell<0||cell>=225||m.board[cell])throw new Error('빈 교차점을 선택해 주세요.');
        const verdict=renjuMove(m.board,cell,side+1);if(!verdict.legal)throw new Error(verdict.reason);
        m.board[cell]=side+1;m.lastMove=cell;if(verdict.win)m.winner=side;else if(m.board.every(Boolean))m.draw=true;
      }else if(s.kind==='alkkagi' && p.action==='club-shot'){
        const disc=m.discs.find(d=>d.id===p.discId&&d.alive&&d.side===side);if(!disc)throw new Error('우리 팀 돌을 선택해 주세요.');
        const result=simulateShot(m.discs,disc.id,Number(p.dx),Number(p.dy),s.setup.obstacles);m.discs=result.discs;m.frames=result.frames;m.shot=(m.shot??0)+1;
        const alive=[0,1].map(side=>m.discs.some(d=>d.alive&&d.side===side));if(!alive[0]&&!alive[1])m.draw=true;else if(!alive[0])m.winner=1;else if(!alive[1])m.winner=0;
      }else throw new Error('지원하지 않는 행동이에요.');
      m.turn++;progress(s);
    }
  }
  s.processed.push(requestId); // Kept for the lifetime of this untimed match: delayed retries stay idempotent.
}
