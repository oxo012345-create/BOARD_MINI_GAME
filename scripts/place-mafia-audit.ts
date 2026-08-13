import assert from "node:assert/strict";
import {
  acknowledgePlaceMafiaRole,
  advancePlaceMafiaIfDue,
  createPlaceMafiaState,
  placeMafiaClientState,
  submitPlaceMafiaAttack,
  submitPlaceMafiaMove,
  submitPlaceMafiaVote,
  type PlaceMafiaState,
} from "../app/api/_lib/place-mafia";
import { PLACE_MAFIA_GRAPH, type PlaceMafiaLocationId } from "../app/place-mafia-shared";
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

for (let count = 4; count <= 8; count += 1) {
  const state = createPlaceMafiaState(players(count));
  assert.equal(state.mafiaIds.length, count >= 7 ? 2 : 1, `${count}인 역할 수`);
  assert.equal(Object.keys(state.players).length, count);
}

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
  const { state, now } = start();
  setRoles(state, ["p1"]);
  state.phase = "vote";
  state.phaseEndsAt = now + 20_000;
  submitPlaceMafiaVote(state, "p1", "p2", now + 1_000);
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

console.log("장소 마피아 규칙 감사 통과: 4~8인, 20초 밤, 공개 문구, 병원, 동률, 비밀정보");
