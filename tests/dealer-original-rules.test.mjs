import assert from "node:assert/strict";
import test from "node:test";
import { createDealerState, dealerAction, tickDealer } from "../app/api/_lib/dealer.ts";

const players = Array.from({ length: 4 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Player ${index + 1}`,
  joinedAt: index,
  lastSeen: Date.now(),
  status: "active",
}));

function auctionState() {
  const state = createDealerState(players);
  for (const player of players) dealerAction(state, players, player.id, "dealer-select", { itemIndex: 0 });
  return state;
}

test("clause 24 is excluded from generated items", () => {
  for (let sample = 0; sample < 200; sample += 1) {
    const state = createDealerState(players);
    for (const candidates of Object.values(state.candidates)) {
      for (const item of candidates) assert.equal(item.clauses.includes(24), false);
    }
  }
});

test("a bidder cannot immediately outbid themselves", () => {
  const state = auctionState();
  const bidder = players.find((player) => player.id !== state.sellerId);
  dealerAction(state, players, bidder.id, "dealer-bid", {});
  assert.throws(() => dealerAction(state, players, bidder.id, "dealer-bid", {}), /다른 플레이어/);
});

test("an unsold item returns to the seller", () => {
  const state = auctionState();
  const seller = state.sellerId;
  const item = state.currentItem;
  state.deadline = Date.now() - 1;
  tickDealer(state, players);
  assert.equal(state.phase, "resolution");
  assert.equal(state.lastResult.sold, false);
  assert.equal(state.inventories[seller].some((owned) => owned.uid === item.uid), true);
});

test("clause 20 splits auction revenue, not market checkout", () => {
  const state = auctionState();
  const seller = state.sellerId;
  const bidder = players.find((player) => player.id !== seller);
  state.currentItem.clauses = [20, 1];
  const beforeSeller = state.balances[seller];
  const beforeOthers = Object.fromEntries(players.map((player) => [player.id, state.balances[player.id]]));
  dealerAction(state, players, bidder.id, "dealer-bid", {});
  state.deadline = Date.now() - 1;
  tickDealer(state, players);
  assert.equal(state.balances[seller], beforeSeller + 50);
  const partnerGained = players.some((player) => player.id !== seller && player.id !== bidder.id && state.balances[player.id] === beforeOthers[player.id] + 50);
  assert.equal(partnerGained, true);
});

test("loan and all-in use the original two-hand delay and exact odds", () => {
  const state = auctionState();
  const actor = players.find((player) => player.id !== state.sellerId);
  state.cards[actor.id] = [7, 15, 16, 17];
  dealerAction(state, players, actor.id, "dealer-use-card", { cardId: 7 });
  assert.equal(state.pendingLoans[0].dueAuction, state.auctionCount + 2);
  dealerAction(state, players, actor.id, "dealer-use-card", { cardId: 16 });
  assert.deepEqual(
    { chance: state.pendingInvestments[0].chance, gain: state.pendingInvestments[0].gain, dueAuction: state.pendingInvestments[0].dueAuction },
    { chance: 0.5, gain: 0.35, dueAuction: state.auctionCount + 2 },
  );
});
