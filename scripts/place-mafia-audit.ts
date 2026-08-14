import assert from "node:assert/strict";
import {
  acknowledgePlaceMafiaRole,
  advancePlaceMafiaIfDue,
  createPlaceMafiaState,
  pausePlaceMafia,
  placeMafiaClientState,
  resumePlaceMafia,
  shortenPlaceMafiaVote,
  submitPlaceMafiaAttack,
  submitPlaceMafiaMove,
  submitPlaceMafiaVote,
  type PlaceMafiaState,
} from "../app/api/_lib/place-mafia";
import { PLACE_MAFIA_GRAPH, placeMafiaLegalMoveLocations, type PlaceMafiaLocationId } from "../app/place-mafia-shared";
import type { Player } from "../app/api/_lib/rooms";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `플레이어${index + 1}`,
    avatar: "●",
    joinedAt: 1,
    lastSeen: 1,
    sessionHash: `s${index + 1}`,
    status: "active" as const,
  }));
}

function start(count = 4, balance: "citizen" | "normal" | "mafia" = "normal", now = 10_000) {
  const roster = players(count);
  const state = createPlaceMafiaState(roster, { discussionSeconds: 90, balance });
  roster.forEach((player) => acknowledgePlaceMafiaRole(state, player.id, now));
  assert.equal(state.phase, "night");
  assert.equal(state.phaseEndsAt, now + 20_000, "밤은 정확히 20초여야 한다");
  return { roster, state, now };
}

function setRoles(state: PlaceMafiaState, mafiaIds: string[]) {
  state.mafiaIds = mafiaIds;
  state.killerOrder = mafiaIds;
  state.killerIndex = 0;
  state.activeKillerId = mafiaIds[0];
  for (const id of state.participantIds) state.players[id]!.role = mafiaIds.includes(id) ? "mafia" : "citizen";
}

function setLocations(state: PlaceMafiaState, values: Record<string, PlaceMafiaLocationId>) {
  for (const [id, location] of Object.entries(values)) state.players[id]!.location = location;
}

function confirmMove(state: PlaceMafiaState, id: string, location: PlaceMafiaLocationId, now: number) {
  submitPlaceMafiaMove(state, id, location, now + 1_000);
}

const expectedGraph = {
  residential: ["police", "square"],
  police: ["residential", "park"],
  square: ["residential", "park", "alley"],
  park: ["police", "square", "hospital"],
  alley: ["square", "hospital"],
  hospital: ["park", "alley"],
};
assert.deepEqual(PLACE_MAFIA_GRAPH, expectedGraph, "요청한 2×3 사다리형 연결이어야 한다");
assert.deepEqual(placeMafiaLegalMoveLocations("police"), ["residential", "park"], "경찰서는 연속 체류할 수 없어야 한다");
assert.deepEqual(placeMafiaLegalMoveLocations("square"), ["residential", "park", "alley"], "광장은 연속 체류할 수 없어야 한다");
assert.deepEqual(placeMafiaLegalMoveLocations("hospital"), ["park", "alley"], "병원은 연속 체류할 수 없어야 한다");
assert.ok(placeMafiaLegalMoveLocations("residential").includes("residential"), "주택가는 연속 체류할 수 있어야 한다");
assert.ok(placeMafiaLegalMoveLocations("park").includes("park"), "공원은 연속 체류할 수 있어야 한다");
assert.ok(placeMafiaLegalMoveLocations("alley").includes("alley"), "골목은 연속 체류할 수 있어야 한다");

{
  const { state, now } = start(4);
  setLocations(state, { p1: "police", p2: "square", p3: "hospital", p4: "residential" });
  advancePlaceMafiaIfDue(state, now + 20_001);
  assert.notEqual(state.players.p1?.location, "police", "미선택이어도 경찰서 연속 체류는 금지되어야 한다");
  assert.notEqual(state.players.p2?.location, "square", "미선택이어도 광장 연속 체류는 금지되어야 한다");
  assert.notEqual(state.players.p3?.location, "hospital", "미선택이어도 병원 연속 체류는 금지되어야 한다");
  assert.equal(state.players.p4?.location, "residential", "일반 장소 미선택은 현재 위치에 머물러야 한다");
}

for (let count = 4; count <= 8; count += 1) {
  for (const mafiaCount of [1, 2] as const) {
    const state = createPlaceMafiaState(players(count), { mafiaCount });
    assert.equal(state.mafiaIds.length, mafiaCount, `${count}인 마피아 ${mafiaCount}명 설정`);
    assert.equal(placeMafiaClientState(state, players(count)[0]!.id).settings.mafiaCount, mafiaCount);
    assert.equal(Object.keys(state.players).length, count);
  }
}
assert.throws(() => createPlaceMafiaState(players(1)), /4~8명/, "혼자 디버깅 없이 1명으로 시작할 수 없어야 한다");
assert.throws(() => createPlaceMafiaState(players(3)), /4~8명/, "최소 인원은 4명이어야 한다");
assert.throws(() => createPlaceMafiaState(players(9)), /4~8명/, "최대 인원은 8명이어야 한다");

{
  const { roster, state, now } = start();
  setRoles(state, ["p1"]);
  setLocations(state, { p1: "residential", p2: "alley", p3: "alley", p4: "hospital" });
  confirmMove(state, "p1", "residential", now);
  confirmMove(state, "p2", "alley", now);
  confirmMove(state, "p3", "alley", now);
  confirmMove(state, "p4", "park", now);
  submitPlaceMafiaAttack(state, "p1", ["police"], now + 2_000);
  assert.equal(state.phase, "night", "전원이 끝내도 밤은 조기 종료하면 안 된다");
  assert.equal(state.phaseEndsAt, now + 20_000);
  const citizenView = placeMafiaClientState(state, roster[1]!.id);
  assert.equal(citizenView.my?.activeKillerId, undefined);
  assert.deepEqual(citizenView.my?.witnessIds, [], "밤에는 목격자를 미리 보여주면 안 된다");
  assert.equal(JSON.stringify(citizenView).includes("attackChoices"), false, "공격 장소 원본이 시민 응답에 없어야 한다");
  advancePlaceMafiaIfDue(state, now + 20_000);
  assert.equal(state.night?.message, "어젯밤은 조용한 밤이었습니다. 아무도 죽지 않았습니다.");
  assert.equal(state.night?.quiet, true, "빈 장소 공격은 조용한 밤이어야 한다");
}

{
  const { state, now } = start();
  setRoles(state, ["p1"]);
  setLocations(state, { p1: "park", p2: "alley", p3: "residential", p4: "residential" });
  confirmMove(state, "p1", "park", now);
  confirmMove(state, "p2", "hospital", now);
  confirmMove(state, "p3", "residential", now);
  confirmMove(state, "p4", "police", now);
  submitPlaceMafiaAttack(state, "p1", ["hospital"], now + 2_000);
  advancePlaceMafiaIfDue(state, now + 20_000);
  assert.equal(state.players.p2?.alive, true, "병원 외부 공격은 방어되어야 한다");
  assert.equal(state.night?.message, "어젯밤은 조용한 밤이었습니다. 아무도 죽지 않았습니다.");
}

{
  const { state, now } = start();
  setRoles(state, ["p1"]);
  setLocations(state, { p1: "park", p2: "police", p3: "square", p4: "alley" });
  confirmMove(state, "p1", "park", now);
  confirmMove(state, "p2", "residential", now);
  confirmMove(state, "p3", "park", now);
  confirmMove(state, "p4", "alley", now);
  // 공격을 선택하지 않아도 밤은 종료되고 같은 공개 문구를 사용한다.
  advancePlaceMafiaIfDue(state, now + 20_000);
  assert.equal(state.night?.message, "어젯밤은 조용한 밤이었습니다. 아무도 죽지 않았습니다.");
}

{
  const { roster, state, now } = start();
  setRoles(state, ["p1"]);
  state.phase = "vote";
  state.phaseEndsAt = now + 50_000;
  shortenPlaceMafiaVote(state, "p1", now + 1_000);
  assert.equal(state.phaseEndsAt, now + 40_000, "투표는 50초에서 참가자별 10초씩 줄일 수 있어야 한다");
  assert.equal(placeMafiaClientState(state, "p1").my?.voteCutUsed, true);
  assert.throws(() => shortenPlaceMafiaVote(state, "p1", now + 2_000), /이미/, "한 사람은 투표 시간을 한 번만 줄여야 한다");
  submitPlaceMafiaVote(state, "p1", "p2", now + 1_000);
  const voterView = placeMafiaClientState(state, roster[0]!.id);
  const otherView = placeMafiaClientState(state, roster[1]!.id);
  assert.equal(voterView.my?.voteSubmitted, true, "투표자는 제출 완료 여부만 확인해야 한다");
  assert.equal(otherView.voteSubmittedCount, 1, "다른 참가자에게는 제출 인원수만 보여야 한다");
  assert.equal(otherView.my?.voteSubmitted, false);
  assert.equal(JSON.stringify(otherView).includes('"votes"'), false, "개별 투표 대상은 다른 참가자에게 전송하면 안 된다");
  submitPlaceMafiaVote(state, "p2", "p1", now + 1_000);
  submitPlaceMafiaVote(state, "p3", "p4", now + 1_000);
  submitPlaceMafiaVote(state, "p4", "p3", now + 1_000);
  assert.equal(state.phase, "execution");
  assert.equal(state.execution?.tied, true);
  assert.equal(state.participantIds.every((id) => state.players[id]?.alive), true, "동률이면 아무도 처형되지 않아야 한다");
  advancePlaceMafiaIfDue(state, (state.phaseEndsAt ?? now) + 1);
  assert.equal(state.phase, "night", "재투표 없이 바로 다음 밤이어야 한다");
  assert.equal(state.day, 2);
}

{
  const { state, now } = start();
  const deadline = state.phaseEndsAt!;
  pausePlaceMafia(state, "p2", now + 5_000);
  assert.equal(state.phaseEndsAt, undefined, "참가자 이탈 시 진행 시계가 멈춰야 한다");
  assert.deepEqual(placeMafiaClientState(state, "p1").pause?.playerIds, ["p2"]);
  assert.equal(advancePlaceMafiaIfDue(state, deadline + 60_000), false, "일시정지 중에는 단계가 진행되면 안 된다");
  resumePlaceMafia(state, "p2", now + 65_000);
  assert.equal(state.pause, undefined);
  assert.equal(state.phaseEndsAt, now + 80_000, "재입장하면 남아 있던 15초부터 재개해야 한다");
}

{
  const { state, now } = start(8, "mafia");
  setRoles(state, ["p1", "p2"]);
  setLocations(state, { p1: "park", p2: "park", p3: "residential", p4: "alley", p5: "alley", p6: "residential", p7: "police", p8: "hospital" });
  state.activeKillerId = "p1";
  confirmMove(state, "p1", "park", now);
  confirmMove(state, "p2", "park", now);
  confirmMove(state, "p3", "square", now);
  confirmMove(state, "p4", "square", now);
  confirmMove(state, "p5", "alley", now);
  confirmMove(state, "p6", "residential", now);
  confirmMove(state, "p7", "residential", now);
  confirmMove(state, "p8", "alley", now);
  submitPlaceMafiaAttack(state, "p1", ["square", "hospital"], now + 2_000);
  advancePlaceMafiaIfDue(state, now + 20_000);
  const deaths = state.participantIds.filter((id) => !state.players[id]?.alive);
  assert.equal(deaths.length, 1, "첫날 2곳 공격도 최대 사망자는 1명이어야 한다");
}

console.log("장소 마피아 규칙 감사 통과: 4~8인, 일시정지/복귀, 50초 익명투표, 시간 단축, 비밀정보");
