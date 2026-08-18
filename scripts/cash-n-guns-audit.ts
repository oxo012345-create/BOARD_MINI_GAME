import assert from "node:assert/strict";
import { auditAutoCashNGuns, cashNGunsClientState, createCashNGunsState, handleCashNGunsAction } from "../app/api/_lib/cash-n-guns";
import type { Player } from "../app/api/_lib/rooms";

const makePlayers = (count: number): Player[] => Array.from({ length: count }, (_, index) => ({
  id: `p${index + 1}`,
  name: `P${index + 1}`,
  avatar: "😎",
  joinedAt: index,
  lastSeen: Date.now(),
  sessionHash: `s${index}`,
  status: "active",
}));

for (let count = 4; count <= 8; count += 1) {
  const state = createCashNGunsState(makePlayers(1), { auditPlayerCount: count });
  assert.equal(state.participantIds.length, count, `${count}인 감사 인원`);
  assert.equal(state.currentLoot.length, 8, `${count}인 라운드 전리품 8개`);
  auditAutoCashNGuns(state);
  assert.equal(state.phase, "game_over", `${count}인 자동 플레이 종료`);
  assert.ok(state.round >= 1 && state.round <= 8, `${count}인 라운드 범위`);
  assert.ok((state.winnerIds ?? []).every((id) => state.players[id].alive), `${count}인 사망자 우승 금지`);
}

const state = createCashNGunsState(makePlayers(4));
state.phaseEndsAt = Date.now() - 1;
handleCashNGunsAction(state, "p1", "cash-n-guns-tick");
assert.equal(state.phase, "bullet_select");
for (const id of state.participantIds) handleCashNGunsAction(state, id, "cash-n-guns-bullet", { bullet: id === "p1" ? "bang" : "click" });
assert.equal(state.phase, "aim");
for (const [index, id] of state.participantIds.entries()) handleCashNGunsAction(state, id, "cash-n-guns-aim", { targetId: state.participantIds[(index + 1) % 4] });
assert.equal(state.phase, "godfather");
const publicAfterAim = cashNGunsClientState(state, "p1");
assert.ok(publicAfterAim.players.every((player) => player.aimTargetId), "조준 완료 후 동시 공개");
assert.equal((publicAfterAim.players[1] as Record<string, unknown>).chosenBullet, undefined, "다른 사람 탄환 비공개");
handleCashNGunsAction(state, "p1", "cash-n-guns-godfather-command", { targetId: "p2" });
assert.equal(state.phase, "reaim");
assert.throws(() => handleCashNGunsAction(state, "p2", "cash-n-guns-reaim", { targetId: "p3" }), /기존과 다른/);
handleCashNGunsAction(state, "p2", "cash-n-guns-reaim", { targetId: "p4" });
assert.equal(state.phase, "courage");
assert.equal(state.phaseEndsAt, undefined, "결단 단계 시간제한 없음");
assert.equal(cashNGunsClientState(state, "p1").players.find((player) => player.id === "p1")?.decisionReady, false, "결단 대기 상태 공개");
handleCashNGunsAction(state, "p1", "cash-n-guns-courage", { courage: "stand" });
handleCashNGunsAction(state, "p2", "cash-n-guns-courage", { courage: "crouch" });
handleCashNGunsAction(state, "p3", "cash-n-guns-courage", { courage: "stand" });
handleCashNGunsAction(state, "p4", "cash-n-guns-courage", { courage: "stand" });
assert.equal(state.phase, "resolve");
assert.equal(state.roundOutcome?.shots.find((shot) => shot.targetId === "p2")?.result, "hidden", "숙인 목표의 탄환 비공개 폐기");
assert.ok(!state.roundOutcome?.eligibleLootIds.includes("p2"), "숙인 플레이어 전리품 제외");

const draftCards = state.currentLoot.map((card) => card.id);
handleCashNGunsAction(state, "p1", "cash-n-guns-reserve-loot", { reservationIds: [draftCards[0], draftCards[1]] });
handleCashNGunsAction(state, "p3", "cash-n-guns-reserve-loot", { reservationIds: [draftCards[0], draftCards[2]] });
handleCashNGunsAction(state, "p4", "cash-n-guns-reserve-loot", { reservationIds: [draftCards[2], draftCards[3]] });
state.phaseEndsAt = Date.now() - 1;
handleCashNGunsAction(state, "p1", "cash-n-guns-tick");
assert.equal(state.phase, "loot", "발포 공개 후 예약 분배 진입");
assert.deepEqual(state.lootTakenIds.slice(0, 4), [draftCards[0], draftCards[2], draftCards[3], draftCards[1]], "대부 기준 순서와 차순위 자동 승격");
assert.equal(state.lootTurnOrder[state.lootTurnIndex], "p3", "예약이 없는 현재 플레이어에서 6초 대기");
assert.ok((state.phaseEndsAt ?? 0) > Date.now(), "미예약 플레이어 자동선택 제한시간");

const timeoutState = createCashNGunsState(makePlayers(4));
timeoutState.phaseEndsAt = Date.now() - 1;
handleCashNGunsAction(timeoutState, "p1", "cash-n-guns-tick");
for (const id of timeoutState.participantIds) handleCashNGunsAction(timeoutState, id, "cash-n-guns-bullet", { bullet: "click" });
handleCashNGunsAction(timeoutState, "p1", "cash-n-guns-aim-select", { targetId: "p3" });
assert.equal(cashNGunsClientState(timeoutState, "p1").my.pendingAimTargetId, "p3", "마지막 터치 목표 서버 보존");
timeoutState.phaseEndsAt = Date.now() - 1;
handleCashNGunsAction(timeoutState, "p1", "cash-n-guns-tick");
assert.equal(timeoutState.phase, "godfather", "조준 시간초과 후 대부 단계");
assert.equal(timeoutState.players.p1.aimTargetId, "p3", "시간초과 시 마지막 선택 확정");

console.log("CASH AND GUNS audit passed: 4~8 players, aim timeout, no-limit courage, reservation draft, bots");
