import type { Player } from "./rooms";

export type DealerItem = {
  uid: string;
  id: number;
  name: string;
  era: string;
  value: number;
  clauses: number[];
  acquiredRound?: number;
  acquiredAuction?: number;
};

export type DealerCard = { id: number; name: string; price: number; effect: string; passive?: boolean };
export type DealerState = {
  phase: "select" | "auction" | "resolution" | "shop" | "finished";
  round: number;
  totalRounds: number;
  deadline: number;
  sellerOrder: string[];
  sellerIndex: number;
  balances: Record<string, number>;
  inventories: Record<string, DealerItem[]>;
  cards: Record<string, number[]>;
  candidates: Record<string, DealerItem[]>;
  selected: Record<string, number>;
  shopOffers: Record<string, number[]>;
  previousOffers: Record<string, number[]>;
  rerolls: Record<string, number>;
  currentItem?: DealerItem;
  sellerId?: string;
  highestBidderId?: string | null;
  /** The minimum amount shown before the first accepted bid. */
  startingBid: number;
  /** Null means that nobody has accepted the starting bid yet. */
  currentBid: number | null;
  /** Server-ordered bid history. It lets us recover cleanly if a bidder leaves. */
  bidHistory: Array<{ playerId: string; amount: number }>;
  bidCounts: Record<string, number>;
  blockedBidders: string[];
  protectedPlayers: string[];
  overbidTraps: Record<string, string>;
  auctionCount: number;
  pendingLoans: Array<{ playerId: string; dueAuction: number; amount: number }>;
  pendingInvestments: Array<{ playerId: string; dueAuction: number; amount: number; chance: number; gain: number }>;
  delayedItems: Array<{ playerId: string; dueAuction: number; item: DealerItem }>;
  speechLocked: string[];
  nextSpeechLocked: string[];
  intel: Record<string, { price?: boolean; clauses?: boolean }>;
  /** Last request nonce per player. Prevents a retried tap from applying twice. */
  lastActionIds: Record<string, string>;
  lastResult?: { sold: boolean; sellerId: string; buyerId?: string; bid?: number; item: DealerItem; message: string };
  log: string[];
};

export const DEALER_ITEMS = [
  ["Golden Cross", "중세"], ["Golden Egg", "중세"], ["A Mug of Coffee", "현대"], ["Gold Medal of Honor", "1940년대"],
  ["Silver Medal of Honor", "1940년대"], ["M1 Helmet", "1940년대"], ["Antique Vase", "고대 로마"], ["Retro Monitor", "냉전"],
  ["Guitar", "현대"], ["Rocket Launcher", "냉전"], ["Model Ship", "빅토리아"], ["Old Chest", "중세"], ["Flower Pot", "현대"],
  ["Charcoal Iron", "빅토리아"], ["Cithara", "고대 로마"], ["Crown", "중세"], ["Ea-Nasir's Copper", "청동기"],
  ["Golden Key", "빅토리아"], ["Folding Fan", "빅토리아"], ["Geiger Counter", "냉전"], ["Hour Glass", "중세"], ["Katana", "중세"],
  ["Sword", "중세"], ["Sealed Scroll", "중세"], ["Pistol", "1940년대"], ["Chariot Wheel", "고대 로마"],
  ["Roman Sandals", "고대 로마"], ["Viking Helmet", "중세"], ["Vintage Typewriter", "냉전"],
] as const;

export const DEALER_CLAUSES = [
  "체크아웃 총액이 $500 초과면 $100 추가", "상점 판매가 +10%", "상점 판매가 +30%", "리롤 횟수마다 가치 +10%",
  "보유 카드 1장마다 가치 +10%", "빈 카드 슬롯마다 가치 +10%", "33% 확률로 3배, 실패 시 1/3", "보유 중 전체 가격 보너스 +15%",
  "시대 세트 계산에서 와일드카드", "구매 후 1라운드 판매 금지", "구매자는 1라운드 카드 사용 금지", "판매자는 1라운드 카드 사용 금지",
  "구매자의 무작위 카드 1장 제거", "판매자의 무작위 카드 1장 제거", "구매 즉시 사라졌다 7번 경매 후 복사되어 귀환",
  "-$250에서 시작, 보유자의 타 경매 입찰마다 +$50", "매 경매마다 시대 변경", "구매자는 카드 전부를 잃고 장당 $150 획득",
  "매 라운드 50% 확률로 $150 획득 또는 손실", "보유 라운드마다 가치 -$100", "판매 수익을 판매자와 무작위 참가자가 절반씩 나눔",
  "시장 판매 시 인벤토리 아이템 수마다 +12%", "구매자는 다음 경매 동안 말 금지", "판매자는 다음 경매 동안 말 금지",
  "구매자와 판매자가 미니 승부 후 승자가 돈과 아이템 획득",
] as const;

export const DEALER_CARDS: DealerCard[] = [
  { id: 0, name: "Price Insider", price: 300, effect: "현재 아이템 실제 가치 공개" },
  { id: 1, name: "Clause Insider", price: 300, effect: "현재 아이템 조항 2개 공개" },
  { id: 2, name: "Reroll Saver I", price: 100, effect: "리롤 비용 영구 10% 할인", passive: true },
  { id: 3, name: "Reroll Saver II", price: 200, effect: "리롤 비용 영구 20% 할인", passive: true },
  { id: 4, name: "Black Marketeer I", price: 100, effect: "시장 판매 수익 영구 +10%", passive: true },
  { id: 5, name: "Black Marketeer II", price: 200, effect: "시장 판매 수익 영구 +20%", passive: true },
  { id: 6, name: "Hammer Lock", price: 400, effect: "대상 입찰을 현재 경매 동안 금지" },
  { id: 7, name: "Loan Shark", price: 200, effect: "즉시 $1,000 획득, 이후 $1,200 상환" },
  { id: 8, name: "Roll the Dice I", price: 150, effect: "75% 확률로 $300 획득" },
  { id: 9, name: "Roll the Dice II", price: 250, effect: "50% 확률로 $500 획득" },
  { id: 10, name: "Roll the Dice III", price: 300, effect: "30% 확률로 $700 획득" },
  { id: 11, name: "Roll the Dice IV", price: 300, effect: "15% 확률로 $1,000 획득" },
  { id: 12, name: "Roll the Dice V", price: 350, effect: "5% 확률로 $1,500 획득" },
  { id: 13, name: "Sharp Guess", price: 100, effect: "대상이 $1,000 초과면 대상 -$300" },
  { id: 14, name: "Pickpocket", price: 200, effect: "대상의 무작위 카드 1장 강탈" },
  { id: 15, name: "All In I", price: 400, effect: "80% 확률로 보유 현금 +20%, 실패 시 전액 손실" },
  { id: 16, name: "All In II", price: 400, effect: "50% 확률로 보유 현금 +35%, 실패 시 전액 손실" },
  { id: 17, name: "All In III", price: 300, effect: "20% 확률로 보유 현금 +50%, 실패 시 전액 손실" },
  { id: 18, name: "Robin Hood", price: 150, effect: "가장 부유한 참가자에게서 최대 $250 강탈" },
  { id: 19, name: "Shut Down", price: 150, effect: "현재 경매 동안 카드 효과 면역" },
  { id: 20, name: "Bank Heist", price: 100, effect: "다른 모두에게서 각각 $100 강탈" },
  { id: 21, name: "Overbid Trap", price: 100, effect: "대상이 5회 이상 입찰하면 -$300, 아니면 사용자 -$300" },
];

const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - .5);
const money = (value: number) => Math.round(value / 10) * 10;
const playerName = (players: Player[], id?: string) => players.find((p) => p.id === id)?.name ?? "참가자";

function makeItem(round = 1): DealerItem {
  const id = Math.floor(Math.random() * DEALER_ITEMS.length);
  const [name, era] = DEALER_ITEMS[id];
  const clauses = shuffle([...DEALER_CLAUSES.keys()]).slice(0, 2);
  const value = clauses.includes(15) ? -250 : money(Math.max(0, 500 + Math.floor(Math.random() * 1001) - 500));
  return { uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, id, name, era, value, clauses, acquiredRound: round };
}

function offersFor(state: DealerState, playerId: string) {
  const held = new Set(state.cards[playerId] ?? []);
  const permanent = new Set([2, 3, 4, 5]);
  const previous = new Set(state.previousOffers[playerId] ?? []);
  let pool = DEALER_CARDS.map((card) => card.id).filter((id) => !permanent.has(id) || !held.has(id)).filter((id) => !previous.has(id));
  if (pool.length < 3) pool = DEALER_CARDS.map((card) => card.id).filter((id) => !permanent.has(id) || !held.has(id));
  return shuffle(pool).slice(0, 3);
}

function beginSelection(state: DealerState, players: Player[]) {
  state.phase = "select";
  state.deadline = Date.now() + 20_000;
  state.sellerOrder = shuffle(players.map((p) => p.id));
  state.sellerIndex = 0;
  state.candidates = {};
  state.selected = {};
  state.currentItem = undefined;
  state.sellerId = undefined;
  state.startingBid = 100;
  state.currentBid = null;
  state.highestBidderId = null;
  state.bidHistory = [];
  state.lastResult = undefined;
  for (const player of players) state.candidates[player.id] = [makeItem(state.round), makeItem(state.round), makeItem(state.round)];
  state.log.unshift(`${state.round}라운드 판매품 선택 시작`);
}

function beginAuction(state: DealerState, players: Player[]) {
  state.auctionCount += 1;
  for (const loan of state.pendingLoans.filter((entry) => entry.dueAuction <= state.auctionCount)) {
    state.balances[loan.playerId] = Math.max(0, (state.balances[loan.playerId] ?? 0) - loan.amount);
    state.log.unshift(`${playerName(players, loan.playerId)} 대출 상환 -$${loan.amount}`);
  }
  state.pendingLoans = state.pendingLoans.filter((entry) => entry.dueAuction > state.auctionCount);
  for (const investment of state.pendingInvestments.filter((entry) => entry.dueAuction <= state.auctionCount)) {
    const won = Math.random() < investment.chance;
    state.balances[investment.playerId] += won ? money(investment.amount * (1 + investment.gain)) : 0;
    state.log.unshift(`${playerName(players, investment.playerId)} All In ${won ? "성공" : "실패"}`);
  }
  state.pendingInvestments = state.pendingInvestments.filter((entry) => entry.dueAuction > state.auctionCount);
  for (const delayed of state.delayedItems.filter((entry) => entry.dueAuction <= state.auctionCount)) {
    if ((state.inventories[delayed.playerId]?.length ?? 0) < 4) state.inventories[delayed.playerId].push({ ...delayed.item, uid: `${delayed.item.uid}-copy` });
    else delayed.dueAuction += 1;
  }
  state.delayedItems = state.delayedItems.filter((entry) => entry.dueAuction > state.auctionCount);
  const eras = [...new Set(DEALER_ITEMS.map((item) => item[1]))];
  for (const player of players) {
    state.inventories[player.id] = (state.inventories[player.id] ?? []).filter((item) => {
      if (item.clauses.includes(16)) item.era = eras[Math.floor(Math.random() * eras.length)];
      if (item.clauses.includes(15) && state.auctionCount - (item.acquiredAuction ?? state.auctionCount) >= 10) {
        state.balances[player.id] += Math.max(0, item.value);
        return false;
      }
      return true;
    });
  }
  const sellerId = state.sellerOrder[state.sellerIndex];
  const chosen = state.selected[sellerId] ?? 0;
  state.phase = "auction";
  state.deadline = Date.now() + 50_000;
  state.sellerId = sellerId;
  state.currentItem = state.candidates[sellerId]?.[chosen] ?? makeItem(state.round);
  state.startingBid = 100;
  state.currentBid = null;
  state.bidHistory = [];
  state.highestBidderId = null;
  state.bidCounts = {};
  state.blockedBidders = [];
  state.protectedPlayers = [];
  state.overbidTraps = {};
  state.speechLocked = [...state.nextSpeechLocked];
  state.nextSpeechLocked = [];
  state.intel = {};
  state.log.unshift(`${playerName(players, sellerId)}의 ${state.currentItem.name} 경매`);
}

function removeRandomCard(state: DealerState, playerId: string) {
  const list = state.cards[playerId] ?? [];
  if (!list.length) return;
  list.splice(Math.floor(Math.random() * list.length), 1);
}

function resolveAuction(state: DealerState, players: Player[]) {
  const item = state.currentItem!;
  const seller = state.sellerId!;
  const buyer = state.highestBidderId;
  const bid = state.currentBid;
  const sold = Boolean(buyer && bid !== null && (state.balances[buyer] ?? 0) >= bid && (state.inventories[buyer]?.length ?? 0) < 4);
  if (sold && buyer && bid !== null) {
    state.balances[buyer] -= bid;
    state.balances[seller] += bid;
    if (item.clauses.includes(12)) removeRandomCard(state, buyer);
    if (item.clauses.includes(13)) removeRandomCard(state, seller);
    if (item.clauses.includes(17)) {
      state.balances[buyer] += (state.cards[buyer]?.length ?? 0) * 150;
      state.cards[buyer] = [];
    }
    if (item.clauses.includes(14)) state.delayedItems.push({ playerId: buyer, dueAuction: state.auctionCount + 7, item: { ...item, acquiredRound: state.round, acquiredAuction: state.auctionCount } });
    else state.inventories[buyer].push({ ...item, acquiredRound: state.round, acquiredAuction: state.auctionCount });
    if (item.clauses.includes(22)) state.nextSpeechLocked.push(buyer);
    if (item.clauses.includes(23)) state.nextSpeechLocked.push(seller);
  }
  for (const [targetId, ownerId] of Object.entries(state.overbidTraps)) {
    if ((state.bidCounts[targetId] ?? 0) >= 5) state.balances[targetId] = Math.max(0, state.balances[targetId] - 300);
    else state.balances[ownerId] = Math.max(0, state.balances[ownerId] - 300);
  }
  const message = sold && buyer ? `${playerName(players, buyer)} 낙찰 · $${bid}` : "유찰";
  state.lastResult = { sold, sellerId: seller, buyerId: sold && buyer ? buyer : undefined, bid: sold && bid !== null ? bid : undefined, item, message };
  state.phase = "resolution";
  state.deadline = Date.now() + 10_000;
  state.log.unshift(`${item.name} ${message}`);
}

function beginShop(state: DealerState, players: Player[]) {
  state.phase = "shop";
  state.deadline = Date.now() + 60_000;
  state.shopOffers = {};
  state.rerolls = {};
  for (const player of players) {
    const next = offersFor(state, player.id);
    state.shopOffers[player.id] = next;
    state.previousOffers[player.id] = next;
    state.rerolls[player.id] = 0;
  }
  state.log.unshift(`${state.round}라운드 카드 상점 오픈`);
}

function finishShop(state: DealerState, players: Player[]) {
  for (const player of players) {
    for (const item of state.inventories[player.id] ?? []) if (item.clauses.includes(18)) state.balances[player.id] = Math.max(0, state.balances[player.id] + (Math.random() < .5 ? 150 : -150));
  }
  if (state.round >= state.totalRounds) {
    state.phase = "finished";
    state.deadline = Date.now();
    state.log.unshift("최종 정산 완료");
    return;
  }
  state.round += 1;
  beginSelection(state, players);
}

export function createDealerState(players: Player[]): DealerState {
  const state: DealerState = {
    phase: "select", round: 1, totalRounds: 5, deadline: 0, sellerOrder: [], sellerIndex: 0,
    balances: {}, inventories: {}, cards: {}, candidates: {}, selected: {}, shopOffers: {}, previousOffers: {}, rerolls: {},
    startingBid: 100, currentBid: null, bidHistory: [], bidCounts: {}, blockedBidders: [], protectedPlayers: [], overbidTraps: {}, auctionCount: 0,
    pendingLoans: [], pendingInvestments: [], delayedItems: [], speechLocked: [], nextSpeechLocked: [], intel: {}, log: [],
    lastActionIds: {},
  };
  for (const p of players) { state.balances[p.id] = 2000; state.inventories[p.id] = []; state.cards[p.id] = []; state.previousOffers[p.id] = []; }
  beginSelection(state, players);
  return state;
}

function normalizeAuctionState(state: DealerState) {
  // Rooms created before the startingBid/currentBid split may still be in D1.
  if (!Number.isFinite(state.startingBid)) state.startingBid = 100;
  if (!Array.isArray(state.bidHistory)) state.bidHistory = [];
  if (!state.lastActionIds || typeof state.lastActionIds !== "object") state.lastActionIds = {};
  if (!state.highestBidderId) {
    state.currentBid = null;
    state.bidHistory = [];
  } else if (!Number.isFinite(state.currentBid)) {
    state.currentBid = state.startingBid;
  }
}

export function tickDealer(state: DealerState, players: Player[]) {
  normalizeAuctionState(state);
  let changed = false;
  for (let guard = 0; guard < 8 && state.phase !== "finished" && Date.now() >= state.deadline; guard += 1) {
    changed = true;
    if (state.phase === "select") {
      for (const p of players) if (state.selected[p.id] === undefined) state.selected[p.id] = Math.floor(Math.random() * 3);
      beginAuction(state, players);
    } else if (state.phase === "auction") resolveAuction(state, players);
    else if (state.phase === "resolution") {
      state.sellerIndex += 1;
      if (state.sellerIndex < state.sellerOrder.length) beginAuction(state, players); else beginShop(state, players);
    } else if (state.phase === "shop") finishShop(state, players);
  }
  return changed;
}

function cardDiscount(state: DealerState, id: string) { return state.cards[id]?.includes(3) ? .8 : state.cards[id]?.includes(2) ? .9 : 1; }

function checkoutValue(state: DealerState, playerId: string) {
  const items = state.inventories[playerId] ?? [];
  const eraCounts: Record<string, number> = {};
  for (const item of items) if (!item.clauses.includes(8)) eraCounts[item.era] = (eraCounts[item.era] ?? 0) + 1;
  const wild = items.filter((item) => item.clauses.includes(8)).length;
  const largest = Math.max(wild, ...Object.values(eraCounts).map((v) => v + wild), 0);
  const setMultiplier = largest >= 4 ? 2.5 : largest === 3 ? 2 : largest === 2 ? 1.5 : 1;
  let total = 0;
  for (const item of items) {
    let value = item.value;
    if (item.clauses.includes(1)) value *= 1.1;
    if (item.clauses.includes(2)) value *= 1.3;
    if (item.clauses.includes(3)) value *= 1 + (state.rerolls[playerId] ?? 0) * .1;
    if (item.clauses.includes(4)) value *= 1 + (state.cards[playerId]?.length ?? 0) * .1;
    if (item.clauses.includes(5)) value *= 1 + Math.max(0, 3 - (state.cards[playerId]?.length ?? 0)) * .1;
    if (item.clauses.includes(6)) value *= Math.random() < .33 ? 3 : 1 / 3;
    if (item.clauses.includes(19)) value -= Math.max(0, state.round - (item.acquiredRound ?? state.round)) * 100;
    if (item.clauses.includes(21)) value *= 1 + items.length * .12;
    total += value;
  }
  total *= setMultiplier;
  if (items.some((item) => item.clauses.includes(7))) total *= 1.15;
  total *= state.cards[playerId]?.includes(5) ? 1.2 : state.cards[playerId]?.includes(4) ? 1.1 : 1;
  if (total > 500 && items.some((item) => item.clauses.includes(0))) total += 100;
  return Math.max(0, money(total));
}

export function dealerAction(state: DealerState, players: Player[], actorId: string, action: string, payload: Record<string, unknown>) {
  normalizeAuctionState(state);
  tickDealer(state, players);
  const requestId = String(payload.requestId ?? "").trim().slice(0, 80);
  if (requestId && state.lastActionIds[actorId] === requestId) return;
  const rememberRequest = () => { if (requestId) state.lastActionIds[actorId] = requestId; };
  if (action === "dealer-select") {
    if (state.phase !== "select") throw new Error("지금은 판매품을 고를 수 없어요.");
    const index = Math.max(0, Math.min(2, Number(payload.itemIndex) || 0));
    state.selected[actorId] = index;
    rememberRequest();
    if (players.every((p) => state.selected[p.id] !== undefined)) beginAuction(state, players);
    return;
  }
  if (action === "dealer-bid") {
    if (state.phase !== "auction" || actorId === state.sellerId) throw new Error("지금은 입찰할 수 없어요.");
    if (state.blockedBidders.includes(actorId)) throw new Error("Hammer Lock으로 입찰이 막혔어요.");
    if ((state.inventories[actorId]?.length ?? 0) >= 4) throw new Error("아이템 인벤토리가 가득 찼어요.");
    const next = state.currentBid === null ? state.startingBid : state.currentBid + 50;
    if ((state.balances[actorId] ?? 0) < next) throw new Error("현금이 부족해요.");
    state.currentBid = next;
    state.highestBidderId = actorId;
    state.bidHistory.push({ playerId: actorId, amount: next });
    state.bidCounts[actorId] = (state.bidCounts[actorId] ?? 0) + 1;
    if (state.deadline - Date.now() <= 3000) state.deadline += 5000;
    for (const item of state.inventories[actorId] ?? []) if (item.clauses.includes(15)) item.value += 50;
    rememberRequest();
    return;
  }
  if (action === "dealer-reroll") {
    if (state.phase !== "shop") throw new Error("상점에서만 리롤할 수 있어요.");
    const base = 100 + (state.rerolls[actorId] ?? 0) * 100;
    const cost = money(base * cardDiscount(state, actorId));
    if ((state.balances[actorId] ?? 0) < cost) throw new Error("리롤 비용이 부족해요.");
    state.balances[actorId] -= cost;
    state.rerolls[actorId] = (state.rerolls[actorId] ?? 0) + 1;
    const next = offersFor(state, actorId);
    state.shopOffers[actorId] = next;
    state.previousOffers[actorId] = next;
    rememberRequest();
    return;
  }
  if (action === "dealer-buy-card") {
    if (state.phase !== "shop") throw new Error("상점에서만 카드를 살 수 있어요.");
    const cardId = Number(payload.cardId);
    if (!state.shopOffers[actorId]?.includes(cardId)) throw new Error("상점에 없는 카드예요.");
    const card = DEALER_CARDS[cardId];
    if (!card || (state.cards[actorId]?.length ?? 0) >= 3) throw new Error("카드 인벤토리가 가득 찼어요.");
    if (state.balances[actorId] < card.price) throw new Error("현금이 부족해요.");
    state.balances[actorId] -= card.price;
    state.cards[actorId].push(cardId);
    state.shopOffers[actorId] = state.shopOffers[actorId].filter((id) => id !== cardId);
    rememberRequest();
    return;
  }
  if (action === "dealer-checkout") {
    if (state.phase !== "shop" && state.phase !== "finished") throw new Error("지금은 시장에 판매할 수 없어요.");
    const total = checkoutValue(state, actorId);
    if (state.inventories[actorId].some((item) => item.clauses.includes(20)) && players.length > 1) {
      const partner = shuffle(players.filter((player) => player.id !== actorId))[0];
      const half = money(total / 2);
      state.balances[actorId] += total - half;
      state.balances[partner.id] += half;
    } else state.balances[actorId] += total;
    state.inventories[actorId] = [];
    state.log.unshift(`${playerName(players, actorId)} 시장 정산 +$${total}`);
    rememberRequest();
    return;
  }
  if (action === "dealer-use-card") {
    if (state.phase !== "auction") throw new Error("경매 중에만 카드를 쓸 수 있어요.");
    const cardId = Number(payload.cardId);
    const index = state.cards[actorId]?.indexOf(cardId) ?? -1;
    const card = DEALER_CARDS[cardId];
    if (index < 0 || !card || card.passive) throw new Error("사용할 수 없는 카드예요.");
    const targetId = String(payload.targetId ?? "");
    const needsTarget = [6, 13, 14, 21].includes(cardId);
    if (needsTarget && (!targetId || targetId === actorId || !players.some((player) => player.id === targetId))) {
      throw new Error("카드를 사용할 대상을 선택해 주세요.");
    }
    if (cardId === 6 && targetId === state.sellerId) throw new Error("판매자는 입찰 대상이 아니에요.");
    if (targetId && state.protectedPlayers.includes(targetId)) throw new Error("대상이 Shut Down으로 보호 중이에요.");
    if (cardId === 0) state.intel[actorId] = { ...(state.intel[actorId] ?? {}), price: true };
    else if (cardId === 1) state.intel[actorId] = { ...(state.intel[actorId] ?? {}), clauses: true };
    else if (cardId === 6 && targetId && targetId !== state.sellerId) state.blockedBidders.push(targetId);
    else if (cardId === 7) { state.balances[actorId] += 1000; state.pendingLoans.push({ playerId: actorId, dueAuction: state.auctionCount + 3, amount: 1200 }); }
    else if (cardId >= 8 && cardId <= 12) { const chances=[.75,.5,.3,.15,.05], rewards=[300,500,700,1000,1500]; if (Math.random()<chances[cardId-8]) state.balances[actorId]+=rewards[cardId-8]; }
    else if (cardId === 13 && targetId && state.balances[targetId] > 1000) state.balances[targetId] -= 300;
    else if (cardId === 14 && targetId) { const target=state.cards[targetId]??[]; if(target.length && state.cards[actorId].length<3) state.cards[actorId].push(target.splice(Math.floor(Math.random()*target.length),1)[0]); }
    else if (cardId >= 15 && cardId <= 17) { const chances=[.8,.5,.2], gains=[.2,.35,.5], amount=state.balances[actorId]; state.balances[actorId]=0; state.pendingInvestments.push({playerId:actorId,dueAuction:state.auctionCount+2,amount,chance:chances[cardId-15],gain:gains[cardId-15]}); }
    else if (cardId === 18) { const rich=players.filter(p=>p.id!==actorId).sort((a,b)=>state.balances[b.id]-state.balances[a.id])[0]; if(rich){const take=Math.min(250,state.balances[rich.id]);state.balances[rich.id]-=take;state.balances[actorId]+=take;} }
    else if (cardId === 19) state.protectedPlayers.push(actorId);
    else if (cardId === 20) {
      for (const p of players) if (p.id !== actorId) {
        const take = Math.min(100, state.balances[p.id]);
        state.balances[p.id] -= take;
        state.balances[actorId] += take;
      }
    }
    else if (cardId === 21 && targetId) state.overbidTraps[targetId]=actorId;
    state.cards[actorId].splice(index, 1);
    rememberRequest();
    return;
  }
  throw new Error("지원하지 않는 딜러 게임 요청이에요.");
}

/** Remove a departed participant from every dealer-owned collection. */
export function removeDealerPlayer(state: DealerState, playerId: string, remainingPlayers: Player[]) {
  normalizeAuctionState(state);
  const removedIndex = state.sellerOrder.indexOf(playerId);
  // Removing a player before the active seller shifts the index. Removing
  // the active seller itself must keep the index so the next tick advances
  // to the following seller rather than skipping one (or becoming -1).
  if (removedIndex >= 0 && removedIndex < state.sellerIndex) state.sellerIndex -= 1;
  state.sellerIndex = Math.max(0, state.sellerIndex);
  state.sellerOrder = state.sellerOrder.filter((id) => id !== playerId);
  for (const record of [state.balances, state.inventories, state.cards, state.candidates, state.selected, state.shopOffers, state.previousOffers, state.rerolls, state.bidCounts, state.intel, state.lastActionIds]) delete record[playerId];
  state.pendingLoans = state.pendingLoans.filter((entry) => entry.playerId !== playerId);
  state.pendingInvestments = state.pendingInvestments.filter((entry) => entry.playerId !== playerId);
  state.delayedItems = state.delayedItems.filter((entry) => entry.playerId !== playerId);
  state.blockedBidders = state.blockedBidders.filter((id) => id !== playerId);
  state.protectedPlayers = state.protectedPlayers.filter((id) => id !== playerId);
  state.speechLocked = state.speechLocked.filter((id) => id !== playerId);
  state.nextSpeechLocked = state.nextSpeechLocked.filter((id) => id !== playerId);
  for (const [targetId, ownerId] of Object.entries(state.overbidTraps)) {
    if (targetId === playerId || ownerId === playerId) delete state.overbidTraps[targetId];
  }
  state.bidHistory = state.bidHistory.filter((bid) => bid.playerId !== playerId);
  const latestBid = state.bidHistory[state.bidHistory.length - 1];
  if (state.phase === "auction" && state.sellerId === playerId) {
    const item = state.currentItem;
    state.sellerId = undefined;
    state.highestBidderId = latestBid?.playerId ?? null;
    state.currentBid = latestBid?.amount ?? null;
    state.lastResult = item ? { sold: false, sellerId: playerId, item, message: "판매자가 나가 경매가 유찰되었습니다." } : undefined;
    state.phase = "resolution";
    state.deadline = Date.now();
  } else if (state.highestBidderId === playerId) {
    state.highestBidderId = latestBid?.playerId ?? null;
    state.currentBid = latestBid?.amount ?? null;
  }
  if (state.phase === "select" && remainingPlayers.length && remainingPlayers.every((player) => state.selected[player.id] !== undefined)) {
    beginAuction(state, remainingPlayers);
  }
}

export function dealerClientState(state: DealerState, viewerId?: string) {
  const copy = JSON.parse(JSON.stringify(state)) as DealerState & Record<string, unknown>;
  // The room route rejects unauthenticated game reads. Keep this guard as a
  // second line of defence so a future caller cannot accidentally expose the
  // private dealer state.
  if (!viewerId) return {
    ...copy,
    balances: {},
    candidates: {},
    shopOffers: {},
    previousOffers: {},
    cards: {},
    inventories: {},
    pendingLoans: [],
    pendingInvestments: [],
    delayedItems: [],
    intel: {},
    overbidTraps: {},
    lastActionIds: {},
    currentItem: copy.currentItem ? { ...copy.currentItem, value: null, clauses: [] } : undefined,
    knowsPrice: false,
    knowsClauses: false,
  };
  for (const id of Object.keys(copy.candidates)) if (id !== viewerId) delete copy.candidates[id];
  for (const id of Object.keys(copy.shopOffers)) if (id !== viewerId) delete copy.shopOffers[id];
  for (const id of Object.keys(copy.previousOffers)) if (id !== viewerId) delete copy.previousOffers[id];
  for (const id of Object.keys(copy.cards)) if (id !== viewerId) copy.cards[id] = copy.cards[id].map(() => -1);
  for (const id of Object.keys(copy.intel)) if (id !== viewerId) delete copy.intel[id];
  copy.pendingLoans = copy.pendingLoans.filter((entry) => entry.playerId === viewerId);
  copy.pendingInvestments = copy.pendingInvestments.filter((entry) => entry.playerId === viewerId);
  copy.delayedItems = copy.delayedItems.filter((entry) => entry.playerId === viewerId);
  for (const [id, items] of Object.entries(copy.inventories)) if (id !== viewerId) copy.inventories[id] = items.map((item) => ({ ...item, value: null as unknown as number, clauses: [] }));
  const mayKnow = viewerId === state.sellerId || state.intel[viewerId]?.price || state.phase === "resolution";
  const mayKnowClauses = viewerId === state.sellerId || state.intel[viewerId]?.clauses || state.phase === "resolution";
  copy.knowsPrice = Boolean(mayKnow);
  copy.knowsClauses = Boolean(mayKnowClauses);
  if (copy.currentItem) {
    if (!mayKnow) (copy.currentItem as unknown as { value: number | null }).value = null;
    if (!mayKnowClauses) copy.currentItem.clauses = [];
  }
  return copy;
}
