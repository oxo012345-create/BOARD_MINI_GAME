import assert from "node:assert/strict";
import { advanceTelestration, assignedTelestrationChain, getTelestrationCorrectCount, makeRound, type GameRound } from "../app/api/_lib/rounds";
import { type Player } from "../app/api/_lib/rooms";

const test = (name: string, run: () => void) => {
  run();
  console.log(`✓ ${name}`);
};

const players = (count: number): Player[] => Array.from({ length: count }, (_, index) => ({
  id: `p${index + 1}`,
  name: `P${index + 1}`,
  avatar: "🖍",
  joinedAt: Date.now(),
  lastSeen: Date.now(),
  sessionHash: `hash-${index}`,
  status: "active",
}));

const startGame = (count = 4) => {
  const round = makeRound("telestration", players(count), "normal", undefined, false, "normal");
  assert.ok(round, "telestration round should be created");
  return round as GameRound;
};

/**
 * The round timer used to force-submit an empty drawing for anyone who had not
 * finished, and it ran on the polling path. With several clients polling every
 * 500ms, somebody's poll almost always beat the player's own auto-submit, so the
 * blank landed first and the real drawing was discarded as a duplicate. There is
 * deliberately no deadline any more — these guard against one creeping back.
 */
test("a new game starts with no round deadline", () => {
  const game = startGame();
  assert.equal(game.telestrationRound, 1);
  assert.equal(game.telestrationDeadline, undefined, "a deadline would re-enable the drawing-eating timeout");
});

test("advancing a round never sets a deadline", () => {
  const game = startGame();
  const roster = players(4);
  for (let round = 1; round <= 3; round += 1) {
    assert.equal(game.telestrationRound, round);
    assert.equal(game.telestrationDeadline, undefined, `round ${round} must have no deadline`);
    assert.equal(advanceTelestration(game, roster), true);
    assert.deepEqual(game.telestrationSubmitted, [], "each round starts with nobody submitted");
  }
  assert.equal(game.telestrationRound, 4);
  assert.equal(game.telestrationDeadline, undefined);
  assert.equal(advanceTelestration(game, roster), false, "round 4 is the last");
});

test("every player draws a different chain each round, and never their own twice", () => {
  const game = startGame(4);
  const roster = players(4);
  const seen = new Map<string, Set<string>>();
  for (let round = 1; round <= 4; round += 1) {
    const assigned = roster.map((player) => assignedTelestrationChain(game, player.id)?.id);
    assert.ok(assigned.every(Boolean), `round ${round}: every player needs a chain`);
    assert.equal(new Set(assigned).size, roster.length, `round ${round}: two players share a chain`);
    for (const [index, player] of roster.entries()) {
      const history = seen.get(player.id) ?? new Set<string>();
      assert.equal(history.has(assigned[index]!), false, `round ${round}: ${player.id} drew the same chain twice`);
      history.add(assigned[index]!);
      seen.set(player.id, history);
    }
    if (round < 4) advanceTelestration(game, roster);
  }
});

test("scoring counts a chain once, whether guessed correctly or accepted by the host", () => {
  const game = startGame(3);
  const chains = game.telestrationChains!;
  chains[0].steps.push({ playerId: "p1", guess: chains[0].prompt });
  // Spacing and case must not decide a correct answer.
  chains[1].steps.push({ playerId: "p2", guess: ` ${chains[1].prompt.toUpperCase()} ` });
  chains[2].steps.push({ playerId: "p3", guess: "전혀 다른 답" });
  assert.equal(getTelestrationCorrectCount(game), 2);

  game.telestrationAcceptedChainIds = [chains[2].id];
  assert.equal(getTelestrationCorrectCount(game), 3, "a host-accepted chain counts");
  game.telestrationAcceptedChainIds = [chains[0].id, chains[2].id];
  assert.equal(getTelestrationCorrectCount(game), 3, "accepting an already-correct chain must not double count");
});

test("a player who leaves stops blocking the round", () => {
  const game = startGame(4);
  game.telestrationSubmitted = ["p1", "p2"];
  const remaining = players(4).filter((player) => player.id !== "p4");
  advanceTelestration(game, remaining);
  assert.equal(game.telestrationOrder?.includes("p4"), false, "the leaver must drop out of the order");
  assert.equal(game.telestrationOrder?.length, 3);
});

console.log("\n텔레그레이션 규칙 검증 완료");
