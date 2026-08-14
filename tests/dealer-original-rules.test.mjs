import assert from "node:assert/strict";
import test from "node:test";
import { createDealerState, DEALER_CARDS, dealerAction, dealerClientState, pauseDealer, removeDealerPlayer, resumeDealerIfReady, tickDealer } from "../app/api/_lib/dealer.ts";

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
  const partnerGained = players.some((player) => player.id !== seller && state.balances[player.id] === beforeOthers[player.id] + (player.id === bidder.id ? -50 : 50));
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

test("original strategy deck includes cards 22-24 and patched Robin Hood price", () => {
  assert.equal(DEALER_CARDS.length, 25);
  assert.deepEqual(DEALER_CARDS.slice(22).map((card) => card.name), ["Hot Potato", "Cut Deal", "Jackpot Chase"]);
  assert.equal(DEALER_CARDS[18].price, 100);
});

test("permanent cards activate and free their inventory slot", () => {
  const state = auctionState();
  const actor = players.find((player) => player.id !== state.sellerId);
  state.phase = "shop";
  state.deadline = Date.now() + 60_000;
  state.cards[actor.id] = [2];
  dealerAction(state, players, actor.id, "dealer-use-card", { cardId: 2 });
  assert.deepEqual(state.cards[actor.id], []);
  assert.deepEqual(state.permanentCards[actor.id], [2]);
});

test("checkout sells only selected collection items", () => {
  const state = auctionState();
  const actor = players[0];
  state.phase = "shop";
  state.deadline = Date.now() + 60_000;
  state.inventories[actor.id] = [
    { uid: "one", id: 0, name: "One", era: "A", value: 100, clauses: [] },
    { uid: "two", id: 1, name: "Two", era: "B", value: 200, clauses: [] },
  ];
  const before = state.balances[actor.id];
  dealerAction(state, players, actor.id, "dealer-checkout", { itemIds: ["one"] });
  assert.equal(state.balances[actor.id], before + 100);
  assert.deepEqual(state.inventories[actor.id].map((item) => item.uid), ["two"]);
});

test("Cut Deal transfers 30 percent of the target's next checkout", () => {
  const state = auctionState();
  const owner = players[0];
  const target = players[1];
  state.phase = "shop";
  state.deadline = Date.now() + 60_000;
  state.cutDeals[target.id] = owner.id;
  state.inventories[target.id] = [{ uid: "deal", id: 0, name: "Deal", era: "A", value: 1000, clauses: [] }];
  const ownerBefore = state.balances[owner.id];
  const targetBefore = state.balances[target.id];
  dealerAction(state, players, target.id, "dealer-checkout", { itemIds: ["deal"] });
  assert.equal(state.balances[owner.id], ownerBefore + 300);
  assert.equal(state.balances[target.id], targetBefore + 700);
  assert.equal(state.cutDeals[target.id], undefined);
});

test("final auto-checkout applies Cut Deal owner share exactly once", () => {
  const state = createDealerState(players);
  const owner = players[0];
  const target = players[1];
  state.round = state.totalRounds;
  state.phase = "shop";
  state.deadline = Date.now() + 60_000;
  state.cutDeals[target.id] = owner.id;
  state.inventories[target.id] = [{ uid: "final-deal", id: 0, name: "Final Deal", era: "A", value: 1000, clauses: [] }];
  const ownerBefore = state.balances[owner.id];
  const targetBefore = state.balances[target.id];
  for (const player of players) dealerAction(state, players, player.id, "dealer-shop-ready", { ready: true, requestId: `final-ready-${player.id}` });
  assert.equal(state.phase, "finished");
  assert.equal(state.balances[owner.id], ownerBefore + 300);
  assert.equal(state.balances[target.id], targetBefore + 700);
  assert.equal(state.cutDeals[target.id], undefined);
});

test("dealer pause freezes the deadline until every missing player reconnects", () => {
  const state = auctionState();
  state.deadline = Date.now() + 5_000;
  const before = state.deadline;
  assert.equal(pauseDealer(state, [players[2].id], "disconnect"), true);
  state.deadline = Date.now() - 1;
  assert.equal(tickDealer(state, players), false);
  assert.equal(state.phase, "auction");
  const waitingPlayers = players.map((player) => ({ ...player, status: player.id === players[2].id ? "waiting" : "active" }));
  assert.equal(resumeDealerIfReady(state, waitingPlayers), false);
  waitingPlayers[2].status = "active";
  assert.equal(resumeDealerIfReady(state, waitingPlayers), true);
  assert.ok(state.deadline >= Date.now() + 4_000, `${state.deadline} should restore the saved deadline ${before}`);
});

test("seller departure keeps the auction item in an orphan pool", () => {
  const state = auctionState();
  const seller = state.sellerId;
  const item = state.currentItem;
  removeDealerPlayer(state, seller, players.filter((player) => player.id !== seller));
  assert.equal(state.phase, "resolution");
  assert.equal(state.orphanedItems.some((candidate) => candidate.uid === item.uid), true);
});

test("four players stay in one authoritative auction state through shop ready", () => {
  const state = createDealerState(players);
  for (const player of players) dealerAction(state, players, player.id, "dealer-select", { itemIndex: 0, requestId: `select-${player.id}` });
  assert.equal(state.phase, "auction");

  const firstSeller = state.sellerId;
  const firstBuyer = players.find((player) => player.id !== firstSeller);
  const firstItemUid = state.currentItem.uid;
  const buyerBefore = state.balances[firstBuyer.id];
  dealerAction(state, players, firstBuyer.id, "dealer-bid", { requestId: "first-bid" });
  dealerAction(state, players, firstBuyer.id, "dealer-bid", { requestId: "first-bid" });
  assert.equal(state.bidHistory.length, 1, "duplicate request must not create a second bid");

  for (let auction = 0; auction < players.length; auction += 1) {
    state.deadline = Date.now() - 1;
    tickDealer(state, players);
    assert.equal(state.phase, "resolution");
    state.deadline = Date.now() - 1;
    tickDealer(state, players);
  }

  assert.equal(state.phase, "shop");
  assert.equal(state.balances[firstBuyer.id], buyerBefore - state.startingBid);
  assert.equal(state.inventories[firstBuyer.id].filter((item) => item.uid === firstItemUid).length, 1);
  for (const player of players) dealerAction(state, players, player.id, "dealer-shop-ready", { ready: true, requestId: `ready-${player.id}` });
  assert.equal(state.phase, "select");
  assert.equal(state.round, 2);
});

test("four client views share public auction facts but only seller sees appraisal", () => {
  const state = auctionState();
  const publicViews = players.map((player) => dealerClientState(state, player.id));
  assert.equal(new Set(publicViews.map((view) => view.phase)).size, 1);
  assert.equal(new Set(publicViews.map((view) => view.currentItem?.id)).size, 1);
  assert.equal(new Set(publicViews.map((view) => view.startingBid)).size, 1);
  for (const [index, view] of publicViews.entries()) {
    if (players[index].id === state.sellerId) assert.equal(typeof view.currentItem?.value, "number");
    else assert.equal(view.currentItem?.value, null);
  }
});
