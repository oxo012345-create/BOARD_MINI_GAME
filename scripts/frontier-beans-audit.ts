import assert from "node:assert/strict";
import {
  advanceFrontierBeanBots,
  createFrontierBeanState,
  frontierBeanClientState,
  frontierAcceptOffer,
  frontierCreateOffer,
  frontierDebugScenario,
  frontierEndTrade,
  frontierFinishHandPlant,
  frontierHarvest,
  frontierHarvestValue,
  frontierLegalHarvests,
  frontierPlantHand,
  frontierPlantReceived,
  playFrontierBeanBotGame,
  replaceFrontierBeanPlayerWithBot,
  type FrontierBeanCard,
  type FrontierBeanClientState,
  type FrontierBeanType,
} from "../app/api/_lib/frontier-beans";

let sequence = 0;
const card = (type: FrontierBeanType): FrontierBeanCard => ({ id: `test-${type}-${++sequence}`, type });
const participants = (count = 3) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}`, bot: false }));

function stateWithFields(fields: Array<[FrontierBeanType, number] | undefined>, pending: FrontierBeanType[] = []) {
  const state = createFrontierBeanState(participants(fields.length === 3 ? 3 : 4), { random: () => 0.42 });
  const player = state.players[0];
  player.fields = fields.map((entry) => ({ cards: entry ? Array.from({ length: entry[1] }, () => card(entry[0])) : [] }));
  player.received = pending.map(card);
  state.players[1].received = [card("ivory")];
  state.phase = "plant_received";
  state.discardPile = [];
  return { state, player };
}

const test = (name: string, run: () => void) => {
  run();
  console.log(`✓ ${name}`);
};

test("CASE A/B/C/P — one-card protection and zero-coin harvest table", () => {
  const table: Array<{ fields: Array<[FrontierBeanType, number]>; legal: number[] }> = [
    { fields: [["ruby", 1], ["forest", 1]], legal: [0, 1] },
    { fields: [["ruby", 1], ["forest", 6]], legal: [1] },
    { fields: [["ruby", 1], ["forest", 1], ["azure", 4]], legal: [2] },
    { fields: [["ruby", 1], ["forest", 1], ["azure", 1]], legal: [0, 1, 2] },
  ];
  table.forEach(({ fields, legal }) => {
    const player = { fields: fields.map(([type, count]) => ({ cards: Array.from({ length: count }, () => card(type)) })) };
    assert.deepEqual(frontierLegalHarvests(player), legal);
  });
  const { state, player } = stateWithFields([["ruby", 1], ["forest", 1]], ["midnight"]);
  const before = state.discardPile.length;
  frontierPlantReceived(state, player.id, player.received[0].id, 0);
  assert.equal(player.fields[0].cards[0].type, "midnight");
  assert.equal(player.coins, 0);
  assert.equal(state.discardPile.length, before + 1);
});

test("DEBUG — in-game 3/4/5 player scene switching keeps field rules", () => {
  const state = createFrontierBeanState(participants(5), { debug: true, random: () => 0.42 });
  for (const count of [3, 4, 5] as const) {
    frontierDebugScenario(state, "p1", `players-${count}`);
    assert.equal(state.players.length, count);
    assert.equal(state.players[0].fields.length, count === 3 ? 3 : 2);
    assert.equal(state.players[0].bot, false);
    assert.equal(state.players.slice(1).every((player) => player.bot), true);
  }
});

test("CASE B — protected single field cannot be sacrificed", () => {
  const { state, player } = stateWithFields([["ruby", 1], ["forest", 6]], ["midnight"]);
  assert.throws(() => frontierPlantReceived(state, player.id, player.received[0].id, 0), /보호/);
  frontierPlantReceived(state, player.id, player.received[0].id, 1);
  assert.equal(player.fields[1].cards[0].type, "midnight");
});

test("CASE D/E/R/T — mandatory queue order, repeats, and matching fields", () => {
  const { state, player } = stateWithFields([["ruby", 1], ["forest", 1]], ["midnight", "honey"]);
  const honey = player.received.find((entry) => entry.type === "honey")!;
  frontierPlantReceived(state, player.id, honey.id, 0);
  assert.equal(player.received.length, 1);
  frontierPlantReceived(state, player.id, player.received[0].id, 1);
  assert.deepEqual(player.fields.map((field) => field.cards[0]?.type), ["honey", "midnight"]);

  const repeated = stateWithFields([["midnight", 3], ["forest", 2]], ["midnight", "midnight"]);
  frontierPlantReceived(repeated.state, repeated.player.id, repeated.player.received[0].id, 0);
  frontierPlantReceived(repeated.state, repeated.player.id, repeated.player.received[0].id, 0);
  assert.equal(repeated.player.fields[0].cards.length, 5);
});

test("CASE F/S — same type may occupy two fields and empty fields accept all", () => {
  const { state, player } = stateWithFields([["midnight", 4], undefined], ["midnight"]);
  frontierPlantReceived(state, player.id, player.received[0].id, 1);
  assert.equal(player.fields[0].cards.length, 4);
  assert.equal(player.fields[1].cards[0].type, "midnight");
});

test("CASE G/H/L — accepted gifts stay outside hand and cannot be re-traded", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.31 });
  state.phase = "trade";
  state.revealed = [card("ruby")];
  const recipient = state.players[1];
  const handBefore = recipient.hand.map((entry) => entry.id);
  const gift = frontierCreateOffer(state, state.players[0].id, recipient.id, [state.revealed[0].id], []);
  assert.deepEqual(gift.giveTypes, ["ruby"]);
  assert.equal(state.revealed.length, 1, "pending offers must not move cards");
  frontierAcceptOffer(state, recipient.id, gift.id, []);
  assert.deepEqual(recipient.hand.map((entry) => entry.id), handBefore);
  assert.equal(recipient.received.length, 1);
  assert.throws(() => frontierCreateOffer(state, recipient.id, state.players[0].id, [recipient.received[0].id], []), /손패/);
});

test("TRADE UI — a counter offer is a newly validated offer and replaces the old pair", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.42 });
  state.phase = "trade";
  const active = state.players[0];
  const target = state.players[1];
  const first = frontierCreateOffer(state, active.id, target.id, [active.hand[0].id], [{ type: target.hand[0].type, quantity: 1 }]);
  const counter = frontierCreateOffer(state, target.id, active.id, [target.hand[0].id], [{ type: active.hand[0].type, quantity: 1 }]);
  assert.equal(first.status, "cancelled");
  assert.equal(counter.status, "pending");
  assert.deepEqual(counter.giveTypes, [target.hand[0].type]);
});

test("CASE I/W — revealed cards remain mandatory and an empty market does not auto-end trading", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.23 });
  state.phase = "trade";
  state.revealed = [card("ruby"), card("honey")];
  frontierEndTrade(state, state.players[0].id);
  assert.equal(state.phase, "plant_received");
  assert.equal(state.players[0].received.length, 2);

  const second = createFrontierBeanState(participants(3), { random: () => 0.19 });
  second.phase = "trade";
  second.revealed = [card("forest")];
  const offer = frontierCreateOffer(second, second.players[0].id, second.players[1].id, [second.revealed[0].id], []);
  frontierAcceptOffer(second, second.players[1].id, offer.id, []);
  assert.equal(second.revealed.length, 0);
  assert.equal(second.phase, "trade");
});

test("CASE J/K/X — exact card ownership, stable hand order, stale offer cancellation", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.17 });
  state.phase = "trade";
  const from = state.players[0];
  const to = state.players[1];
  const before = from.hand.map((entry) => entry.id);
  const middle = from.hand[2];
  const offer = frontierCreateOffer(state, from.id, to.id, [middle.id], []);
  const stale = frontierCreateOffer(state, from.id, state.players[2].id, [middle.id], []);
  assert.deepEqual(from.hand.map((entry) => entry.id), before);
  frontierAcceptOffer(state, to.id, offer.id, []);
  assert.deepEqual(from.hand.map((entry) => entry.id), before.filter((id) => id !== middle.id));
  assert.equal(stale.status, "cancelled");
  assert.throws(() => frontierAcceptOffer(state, state.players[2].id, stale.id, []));
});

test("CASE M — inactive players cannot trade with each other", () => {
  const state = createFrontierBeanState(participants(3));
  state.phase = "trade";
  assert.throws(() => frontierCreateOffer(state, state.players[1].id, state.players[2].id, [state.players[1].hand[0].id], []), /현재 턴/);
});

test("CASE N/O/Q — off-turn harvest, pending remains, and harvest is never partial", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.11 });
  state.phase = "trade";
  const inactive = state.players[1];
  inactive.fields[0].cards = Array.from({ length: 4 }, () => card("ruby"));
  const payout = frontierHarvest(state, inactive.id, 0);
  assert.equal(payout, frontierHarvestValue("ruby", 4));
  assert.equal(inactive.fields[0].cards.length, 0);
  const giftCard = state.players[0].hand.at(-1)!;
  const gift = frontierCreateOffer(state, state.players[0].id, inactive.id, [giftCard.id], []);
  frontierAcceptOffer(state, inactive.id, gift.id, []);
  assert.equal(inactive.received.length, 1);
});

test("CASE U/V — phase 1 only plants the front card, max two, empty hand skips", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.09 });
  const active = state.players[0];
  const frontId = active.hand[0].id;
  frontierPlantHand(state, active.id, 0);
  assert.ok(!active.hand.some((entry) => entry.id === frontId));
  assert.equal(state.handPlantsThisTurn, 1);
  frontierPlantHand(state, active.id, active.fields[0].cards[0].type === active.hand[0]?.type ? 0 : 1);
  assert.equal(state.phase, "trade");

  const empty = createFrontierBeanState(participants(3));
  empty.players[0].hand = [];
  frontierFinishHandPlant(empty, empty.players[0].id);
  assert.equal(empty.phase, "trade");
});

test("CASE Y/Z — third exhaustion finishes phase 2/3, then dedicated final scoring", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.07 });
  state.players[0].hand = [];
  state.drawPile = [card("ruby")];
  state.discardPile = [];
  state.exhaustionCount = 2;
  frontierFinishHandPlant(state, state.players[0].id);
  assert.equal(state.phase, "trade");
  assert.equal(state.revealed.length, 1);
  assert.equal(state.endAfterMandatory, true);
  frontierEndTrade(state, state.players[0].id);
  const pending = state.players[0].received[0];
  frontierPlantReceived(state, state.players[0].id, pending.id, 0);
  assert.equal(state.phase, "game_over");
  assert.ok(state.rankings?.length === 3);
});

test("3/4/5 player full bot games finish without deadlock", () => {
  for (const count of [3, 4, 5] as const) {
    const game = playFrontierBeanBotGame(count);
    assert.equal(game.phase, "game_over");
    assert.equal(game.rankings?.length, count);
    assert.equal(game.players[0].fields.length, count === 3 ? 3 : 2);
  }
});

test("debug bot driver yields to a human without mutating hand order", () => {
  const state = createFrontierBeanState([{ id: "human", name: "Human" }, { id: "bot1", name: "Bot 1", bot: true }, { id: "bot2", name: "Bot 2", bot: true }]);
  const order = state.players[0].hand.map((entry) => entry.id);
  assert.equal(advanceFrontierBeanBots(state), 1);
  assert.deepEqual(state.players[0].hand.map((entry) => entry.id), order);
});

test("a player who leaves is replaced by a bot without blocking the table", () => {
  const state = createFrontierBeanState(participants(3), { random: () => 0.18 });
  replaceFrontierBeanPlayerWithBot(state, "p1");
  assert.equal(state.players[0].bot, true);
  assert.match(state.players[0].name, /BOT$/);
  assert.equal(state.playerOrder[state.activePlayerIndex], "p2");
});

test("client serialization hides deck and opponent hand contents", () => {
  const state = createFrontierBeanState(participants(3));
  const client = frontierBeanClientState(state, "p1") as FrontierBeanClientState & Record<string, unknown>;
  assert.equal("drawPile" in client, false);
  assert.equal("discardPile" in client, false);
  assert.deepEqual(client.me?.hand.map((entry) => entry.id), state.players[0].hand.map((entry) => entry.id));
  assert.equal("hand" in client.players[1], false);
});

console.log("\n황혼의 콩시장 CASE A–Z 핵심 규칙 및 3/4/5인 자동 경기 검증 완료");
