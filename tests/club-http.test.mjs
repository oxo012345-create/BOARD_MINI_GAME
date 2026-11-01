import assert from 'node:assert/strict';
import test from 'node:test';

// Run against an isolated local vinext dev server. No production endpoint or
// database access: the clients use only the same HTTP API as real phones.
const base = process.env.HANPAN_TEST_URL;
if (base && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local test server required');

test('duels enforce live room count at selection and start, then play with two sessions', { skip: !base, timeout: 60_000 }, async()=>{
 let code;const clients=[];
 async function call(p,body,path=`/api/rooms/${code}`){
  for(let retry=0;retry<8;retry++){
   const r=await fetch(base+path,{method:body?(path==='/api/rooms'?'POST':'PATCH'):'GET',headers:{'Content-Type':'application/json',...(p?{Cookie:p.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const j=await r.json();if(j.code==='ROOM_CONFLICT')continue;
   return {...j,status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }throw Error('conflicts');
 }
 const made=await call(null,{player:{name:'1대1 하나',avatar:'😎'}},'/api/rooms');assert.equal(made.status,201);code=made.room.code;
 const host={id:made.room.meId,cookie:made.cookie};clients.push(host);
 const joined=await call(null,{action:'join',player:{name:'1대1 둘',avatar:'🐻'}});const other={id:joined.room.meId,cookie:joined.cookie};clients.push(other);
 for(const gameId of ['gomoku','alkkagi','number-baseball']){
  let r=await call(host,{action:'prepare-game',gameId});assert.equal(r.room.game.clubSetup.mode,'duel');
  const third=await call(null,{action:'join',player:{name:'인원변경 검수',avatar:'🐥'}});
  assert.equal(third.status,200);
  assert.equal((await call(host,{action:'club-settings',clubSetup:{mode:'duel'}})).status,422);
  assert.equal((await call(host,{action:'start-game',gameId})).status,422,'stale two-player setup cannot start with three');
  await call({cookie:third.cookie},{action:'leave'});
  assert.equal((await call(other,{action:'club-settings',clubSetup:{mode:'duel'}})).status,403);
  r=await call(host,{action:'start-game',gameId});assert.equal(r.status,200);let s=r.room.game.club;
  assert.equal(s.setup.mode,'duel');assert.equal(s.players.length,2);assert.equal(r.room.game.deadline,undefined);
  if(gameId==='number-baseball'){
   for(const p of clients){r=await call(p,{action:'club-secret',clubId:s.id,requestId:crypto.randomUUID(),value:'123'});assert.equal(r.status,200);s=r.room.game.club;}
   for(let t=0;t<2;t++){const p=clients.find(c=>c.id===s.baseball.activeKey);r=await call(p,{action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round:1,turn:t,value:'456'});assert.equal(r.status,200);s=r.room.game.club;}
   assert.equal(r.room.game.club.history.length,1);
  }else{
   assert.equal(s.matches.length,1);
   for(let t=0;t<2;t++){
    const m=s.matches[0],side=(m.turn+m.first)%2,p=clients.find(c=>c.id===m.sides[side][0]);
    r=await call(p,{action:gameId==='gomoku'?'club-place':'club-shot',clubId:s.id,requestId:crypto.randomUUID(),matchId:m.id,attempt:1,turn:t,cell:112+t,discId:side*5,dx:0,dy:side?-25:25});assert.equal(r.status,200);s=r.room.game.club;
   }
   assert.equal(s.matches[0].turn,2);
  }
 }
 await call(host,{action:'prepare-game',gameId:'gomoku'});
 for(const p of clients)await call(p,{action:'leave'});
});

test('four HTTP clients complete tournaments, alternate teams, restore seats, and solve simultaneous baseball', { skip: !base, timeout: 120_000 }, async () => {
  let code;
  const clients = [];
  async function request(player, body, path = `/api/rooms/${code}`) {
    for (let retry = 0; retry < 12; retry++) {
      const response = await fetch(base + path, {
        method: body ? path === '/api/rooms' ? 'POST' : 'PATCH' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(player?.cookie ? { Cookie: player.cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await response.json();
      if (json.code === 'ROOM_CONFLICT') { await new Promise(r => setTimeout(r, 30 * (retry + 1))); continue; }
      return { status: response.status, ...json, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    throw new Error('Room conflict did not settle');
  }
  const created = await request(null, { player: { name: 'HTTP 하나', avatar: '😎' } }, '/api/rooms');
  assert.equal(created.status, 201);
  code = created.room.code;
  clients.push({ id: created.room.meId, cookie: created.cookie });
  for (const name of ['HTTP 둘', 'HTTP 셋', 'HTTP 넷']) {
    const joined = await request(null, { action: 'join', player: { name, avatar: '🐻' } });
    assert.equal(joined.status, 200);
    clients.push({ id: joined.room.meId, cookie: joined.cookie });
  }
  let host = clients[0];
  const client = id => clients.find(p => p.id === id);
  const read = async p => (await request(p)).room;
  async function send(p, body) {
    const result = await request(p, body);
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.room;
  }
  async function start(kind, setup = {}) {
    await send(host, { action: 'prepare-game', gameId: kind });
    await send(host, { action: 'club-settings', clubSetup: setup });
    const room = await send(host, { action: 'start-game', gameId: kind });
    assert.equal(room.game.deadline, undefined);
    return room.game.club;
  }
  const payload = (s, m, action, more = {}) => ({ action, clubId: s.id, requestId: crypto.randomUUID(), matchId: m.id, attempt: m.attempt, turn: m.turn, ...more });
  const actor = m => client(m.sides[(m.turn + m.first) % 2][Math.floor(m.turn / 2) % m.sides[0].length]);

  const tournament = await start('gomoku');
  async function win(matchId) {
    for (let turn = 0; turn < 9; turn++) {
      const s = (await read(host)).game.club, m = s.matches.find(m => m.id === matchId);
      await send(actor(m), payload(s, m, 'club-place', { cell: turn % 2 ? 127 + Math.floor(turn / 2) : 112 + Math.floor(turn / 2) }));
    }
  }
  await Promise.all(tournament.matches.map(m => win(m.id)));
  assert.equal((await read(host)).game.club.stage, 1);
  await Promise.all(['final', 'bronze'].map(win));
  const result = await read(host);
  assert.equal(result.view, 'result');
  assert.equal(new Set(result.game.club.ranking.flat()).size, 4);

  let s = await start('gomoku', { mode: 'team', redIds: [clients[0].id, clients[2].id] });
  const ordered = [];
  for (let turn = 0; turn < 4; turn++) {
    const m = s.matches[0], p = actor(m); ordered.push(p.id);
    const wrong = clients.find(c => c.id !== p.id);
    assert.equal((await request(wrong, payload(s, m, 'club-place', { cell: 112+turn }))).status, 422);
    s = (await send(p, payload(s, m, 'club-place', { cell: 112+turn }))).game.club;
  }
  assert.equal(new Set(ordered).size, 4);
  assert.equal((await read(clients[2])).game.club.matches[0].turn, 4);

  s = await start('alkkagi', { mode: 'team', obstacles: true, redIds: [clients[0].id, clients[2].id] });
  for (let turn = 0; turn < 4; turn++) {
    const m = s.matches[0], side = (m.turn + m.first) % 2;
    const disc = m.discs.find(d => d.id === side * 5 + 2 && d.alive) ?? m.discs.find(d => d.side === side && d.alive);
    const shot = payload(s, m, 'club-shot', { discId: disc.id, dx: 0, dy: side ? -130 : 130 });
    s = (await send(actor(m), shot)).game.club;
    const views = await Promise.all(clients.map(read));
    for (const view of views) assert.deepEqual(view.game.club.matches[0].discs, s.matches[0].discs);
  }
  const leaver = host;
  assert.equal((await request(leaver, { action: 'leave' })).room, null);
  let paused = await read(clients[1]);
  host = client(paused.hostId);
  assert.notEqual(host.id, leaver.id);
  assert.deepEqual(paused.game.club.paused, [leaver.id]);
  const resumed = await send(leaver, { action: 'join' });
  assert.deepEqual(resumed.game.club.paused, []);
  assert.equal(resumed.game.club.matches[0].turn, 4);

  const score = (secret, guess) => ({ strikes: [...guess].filter((v, i) => v === secret[i]).length, balls: [...guess].filter((v, i) => v !== secret[i] && secret.includes(v)).length });
  const candidates = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) if (new Set([a, b, c]).size === 3) candidates.push(`${a}${b}${c}`);
  for (const mode of ['individual', 'team']) {
    s = await start('number-baseball', { mode, digits: 3, redIds: [clients[0].id, clients[2].id] });
    if(mode==='team'){
      for(const key of ['team-0','team-1'])s=(await send(client(s.teams[Number(key.slice(-1))][0]),{action:'club-secret',clubId:s.id,requestId:crypto.randomUUID(),value:'123'})).game.club;
      const order=[];
      for(let t=0;t<4;t++){
        const p=client(s.teams[Number(s.baseball.activeKey.slice(-1))][Math.floor(t/2)]);order.push(p.id);
        s=(await send(p,{action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round:s.round,turn:t,value:t<2?'456':'123'})).game.club;
        assert.equal('secrets' in s.baseball,false);
        if(t<3)assert.equal(s.baseball.revealed,undefined);
      }
      assert.equal(new Set(order).size,4);assert.equal(s.finished,true);assert.equal(s.winners.length,2);continue;
    }
    let pool = [...candidates];
    for (let attempt = 0; attempt < 20 && !s.finished; attempt++) {
      const guess = pool[0]; assert.ok(guess);
      const views = await Promise.all(clients.map(read));
      const inputters = [...new Set(views.map(v => v.game.club.inputter))].map(client);
      const submissions = inputters.map(p => ({ p, body: { action: 'club-guess', clubId: s.id, requestId: crypto.randomUUID(), round: s.round, value: guess } }));
      await send(submissions[0].p, submissions[0].body);
      for (const p of clients) {
        const visible = (await read(p)).game.club;
        assert.equal('secret' in visible, false);
        assert.equal('pending' in visible, false);
        assert.equal('histories' in visible, false);
        assert.equal(visible.history.length, attempt);
      }
      await Promise.all(submissions.slice(1).map(({ p, body }) => send(p, body)));
      s = (await read(host)).game.club;
      const hint = s.history.at(-1);
      pool = pool.filter(candidate => { const result = score(candidate, guess); return result.strikes === hint.strikes && result.balls === hint.balls; });
      // Retries remain successful even if this request finished the entire game.
      await send(submissions[0].p, submissions[0].body);
    }
    assert.equal(s.finished, true);
    assert.equal(s.winners.length, mode === 'team' ? 2 : 4);
  }
  for (const p of clients) await request(p, { action: 'leave' });
});
