const DEBUG_PHASES = [
  { id: "select", label: "물건 선택" },
  { id: "auction", label: "실시간 경매" },
  { id: "resolution", label: "낙찰 정산" },
  { id: "shop", label: "상점" },
  { id: "finished", label: "최종 결과" },
];

const DEBUG_SCENARIOS = [
  { id: "waiting", label: "대기 · 시작 전" },
  { id: "select", label: "물건 선택 팝업" },
  { id: "auction-seller", label: "경매 · 판매자" },
  { id: "auction-mystery", label: "경매 · 입찰자(감정가 ?)" },
  { id: "auction-known", label: "경매 · 입찰자(정보 공개)" },
  { id: "resolution", label: "낙찰 정산" },
  { id: "shop", label: "상점·리롤" },
  { id: "finished", label: "최종 결과" },
];

const ITEM_FIXTURES = [
  { id: 1, name: "황금 보석 알", era: "중세", value: 420, clauses: [1, 3] },
  { id: 17, name: "빅토리아 황금 열쇠", era: "빅토리아", value: 160, clauses: [7, 15] },
  { id: 24, name: "1940년대 권총", era: "1940년대", value: 250, clauses: [0, 5] },
  { id: 20, name: "황동 모래시계", era: "19세기", value: 310, clauses: [2, 16] },
  { id: 6, name: "고대 로마 항아리", era: "로마", value: 180, clauses: [4, 10] },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const clampPlayers = (value) => Math.min(8, Math.max(1, Math.round(Number(value) || 4)));
const phaseDuration = { select: 20_000, auction: 50_000, resolution: 8_000, shop: 60_000, finished: 60_000 };
const validScenario = (value) => DEBUG_SCENARIOS.some((scenario) => scenario.id === value) ? value : "select";
const validPhase = (value) => DEBUG_PHASES.some((phase) => phase.id === value) ? value : "select";

function makePlayers(count) {
  return Array.from({ length: clampPlayers(count) }, (_, index) => ({
    id: `debug-player-${index + 1}`,
    name: `플레이어${index + 1}`,
    profile: ["😎", "🤠", "🥳", "🐻", "🦊", "🐥", "👻", "🐰"][index],
  }));
}

function makeState(scenario, playerCount) {
  const players = makePlayers(playerCount);
  const meId = players[0].id;
  const bidderId = players[Math.min(1, players.length - 1)].id;
  const otherBidderId = players[Math.min(2, players.length - 1)].id;
  const balances = Object.fromEntries(players.map((player, index) => [player.id, 2000 - index * 150]));
  const inventories = Object.fromEntries(players.map((player) => [player.id, []]));
  const cards = Object.fromEntries(players.map((player) => [player.id, []]));
  const candidates = Object.fromEntries(players.map((player) => [player.id, clone(ITEM_FIXTURES.slice(0, 3))]));
  const shopOffers = Object.fromEntries(players.map((player) => [player.id, [0, 4, 7]]));
  const phase = scenario === "waiting" ? null : scenario === "auction-seller" || scenario === "auction-mystery" || scenario === "auction-known" ? "auction" : validPhase(scenario);
  const currentItem = phase && phase !== "select" && phase !== "shop" && phase !== "finished" ? clone(ITEM_FIXTURES[1]) : null;
  const sellerId = scenario === "auction-seller" ? meId : bidderId;
  const knowsPrice = scenario === "auction-seller" || scenario === "auction-known";
  const knowsClauses = scenario === "auction-seller" || scenario === "auction-known";
  const phaseNow = Date.now();

  if (scenario === "shop" || scenario === "finished") {
    inventories[meId] = [clone(ITEM_FIXTURES[0])];
    cards[meId] = [2, 7];
  }
  if (scenario === "finished") {
    balances[meId] = 2750;
    balances[bidderId] = 2200;
  }

  const dealer = phase ? {
    phase,
    round: phase === "finished" ? 5 : 2,
    totalRounds: 5,
    deadline: phaseNow + phaseDuration[phase],
    sellerOrder: players.map((player) => player.id),
    sellerIndex: 0,
    sellerId,
    currentItem,
    candidates,
    selected: {},
    balances,
    inventories,
    cards,
    shopOffers,
    rerolls: Object.fromEntries(players.map((player) => [player.id, 0])),
    auctionCount: 1,
    currentBid: scenario === "auction-known" ? 350 : 100,
    highestBidderId: scenario === "auction-known" ? otherBidderId : null,
    blockedBidders: [],
    protectedPlayers: [],
    speechLocked: [],
    overbidTraps: {},
    knowsPrice,
    knowsClauses,
    lastResult: phase === "resolution" ? {
      sold: true,
      buyerId: otherBidderId,
      finalBid: 250,
      item: clone(ITEM_FIXTURES[1]),
      message: "플레이어3이 낙찰받았습니다.",
    } : null,
    log: ["DEBUG 모드: 서버에 저장되지 않는 가상 상태입니다.", "시작 자금 $2,000 · 컬렉션 4칸 · 전략 카드 3칸"],
  } : null;

  return {
    room: {
      code: "DEBUG",
      meId,
      players,
      view: "game",
      revision: 1,
      serverNow: phaseNow,
    },
    dealer,
  };
}

function transition(state, nextPhase) {
  if (!state?.dealer) return state;
  const next = clone(state);
  const phase = validPhase(nextPhase);
  next.dealer.phase = phase;
  next.dealer.deadline = Date.now() + phaseDuration[phase];
  next.room.revision += 1;
  next.room.serverNow = Date.now();
  if (phase === "select") {
    next.dealer.currentItem = null;
    next.dealer.selected = {};
  } else if (phase === "auction") {
    next.dealer.currentItem = clone(ITEM_FIXTURES[1]);
    next.dealer.sellerId = next.room.players[1]?.id || next.room.meId;
    next.dealer.currentBid = 100;
    next.dealer.highestBidderId = null;
    next.dealer.knowsPrice = next.dealer.sellerId === next.room.meId;
    next.dealer.knowsClauses = next.dealer.sellerId === next.room.meId;
  } else if (phase === "resolution") {
    next.dealer.currentItem = clone(ITEM_FIXTURES[1]);
    next.dealer.lastResult = {
      sold: true,
      buyerId: next.room.players[2]?.id || next.room.meId,
      finalBid: Math.max(150, next.dealer.currentBid),
      item: clone(ITEM_FIXTURES[1]),
      message: "디버그 낙찰 결과입니다.",
    };
  } else if (phase === "shop") {
    next.dealer.currentItem = null;
  } else if (phase === "finished") {
    next.dealer.currentItem = null;
  }
  return next;
}

export { DEBUG_PHASES, DEBUG_SCENARIOS };

export function createDebugState(scenario = "select", playerCount = 4) {
  return makeState(validScenario(scenario), clampPlayers(playerCount));
}

export function transitionDebugPhase(state, phase) {
  return transition(state, phase);
}

export function applyDebugAction(state, action, payload = {}) {
  if (!state?.dealer || !state.room) return state;
  const next = clone(state);
  const mine = next.room.meId;
  next.room.revision += 1;
  next.room.serverNow = Date.now();
  if (action === "dealer-select") {
    next.dealer.selected[mine] = Number(payload.itemIndex) || 0;
    next.dealer.phase = "auction";
    next.dealer.currentItem = clone(ITEM_FIXTURES[1]);
    next.dealer.sellerId = mine;
    next.dealer.knowsPrice = true;
    next.dealer.knowsClauses = true;
    next.dealer.deadline = Date.now() + phaseDuration.auction;
  } else if (action === "dealer-bid") {
    const bid = next.dealer.currentBid + 50;
    if ((next.dealer.balances[mine] || 0) >= bid) {
      next.dealer.balances[mine] -= 50;
      next.dealer.currentBid = bid;
      next.dealer.highestBidderId = mine;
    }
  } else if (action === "dealer-reroll") {
    next.dealer.rerolls[mine] = (next.dealer.rerolls[mine] || 0) + 1;
    next.dealer.shopOffers[mine] = [1, 5, 14];
    next.dealer.balances[mine] = Math.max(0, next.dealer.balances[mine] - 100);
  } else if (action === "dealer-buy-card") {
    const cardId = Number(payload.cardId);
    if (!next.dealer.cards[mine].includes(cardId)) {
      next.dealer.cards[mine].push(cardId);
      next.dealer.balances[mine] = Math.max(0, next.dealer.balances[mine] - 100);
    }
  } else if (action === "dealer-checkout") {
    next.dealer.phase = "finished";
    next.dealer.deadline = Date.now() + phaseDuration.finished;
  } else if (action === "dealer-use-card") {
    const cardId = Number(payload.cardId);
    next.dealer.cards[mine] = next.dealer.cards[mine].filter((id) => id !== cardId);
  }
  return next;
}

