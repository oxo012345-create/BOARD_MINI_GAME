export type FrontierBeanType = "ruby" | "midnight" | "honey" | "forest" | "roast" | "ivory" | "azure" | "copper";
export type FrontierBeanPhase = "plant_hand" | "trade" | "plant_received" | "game_over";

export type FrontierBeanDefinition = {
  id: FrontierBeanType;
  name: string;
  shortName: string;
  count: number;
  color: string;
  harvest: readonly [number, number, number, number];
};

export const FRONTIER_BEANS: readonly FrontierBeanDefinition[] = [
  { id: "azure", name: "푸르대콩", shortName: "푸르대", count: 20, color: "#2778d8", harvest: [4, 6, 8, 10] },
  { id: "copper", name: "칠리콩", shortName: "칠리", count: 18, color: "#ef6b26", harvest: [3, 6, 8, 9] },
  { id: "roast", name: "똥콩", shortName: "똥콩", count: 16, color: "#4b392f", harvest: [3, 5, 7, 8] },
  { id: "forest", name: "완두콩", shortName: "완두", count: 14, color: "#62ad32", harvest: [3, 5, 6, 7] },
  { id: "honey", name: "대두", shortName: "대두", count: 12, color: "#e7b83e", harvest: [2, 4, 6, 7] },
  { id: "midnight", name: "동부", shortName: "동부", count: 10, color: "#91bd4b", harvest: [2, 4, 5, 6] },
  { id: "ruby", name: "팥", shortName: "팥", count: 8, color: "#bd3b35", harvest: [2, 3, 4, 5] },
  { id: "ivory", name: "강낭콩", shortName: "강낭", count: 6, color: "#8ec431", harvest: [2, 3, 4, 5] },
] as const;

export type FrontierBeanCard = { id: string; type: FrontierBeanType };
export type FrontierBeanField = { cards: FrontierBeanCard[] };
export type FrontierBeanPlayer = {
  id: string;
  name: string;
  avatar: string;
  bot?: boolean;
  coins: number;
  coinCards: FrontierBeanCard[];
  hand: FrontierBeanCard[];
  fields: FrontierBeanField[];
  received: FrontierBeanCard[];
};

export type FrontierTradeRequest = { type: FrontierBeanType; quantity: number };
export type FrontierTradeOffer = {
  id: string;
  fromId: string;
  toId: string;
  giveCardIds: string[];
  giveTypes: FrontierBeanType[];
  returnCardIds: string[];
  returnTypes: FrontierBeanType[];
  wants: FrontierTradeRequest[];
  fromReady: boolean;
  toReady: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: number;
};

export type FrontierEvent = {
  id: string;
  kind: "plant" | "reveal" | "trade" | "harvest" | "draw" | "turn" | "error" | "game_over";
  actorId?: string;
  text: string;
  cardIds?: string[];
  at: number;
};

export type FrontierBeanState = {
  version: 1;
  phase: FrontierBeanPhase;
  players: FrontierBeanPlayer[];
  playerOrder: string[];
  activePlayerIndex: number;
  startingPlayerId: string;
  drawPile: FrontierBeanCard[];
  discardPile: FrontierBeanCard[];
  revealed: FrontierBeanCard[];
  offers: FrontierTradeOffer[];
  exhaustionCount: number;
  handPlantsThisTurn: number;
  endAfterMandatory: boolean;
  round: number;
  revision: number;
  lastEvent?: FrontierEvent;
  rankings?: Array<{ playerId: string; coins: number; rank: number }>;
  debug?: boolean;
};

export type FrontierBeanClientPlayer = {
  id: string;
  name: string;
  avatar: string;
  bot: boolean;
  coins: number;
  handCount: number;
  fields: Array<{ type?: FrontierBeanType; count: number }>;
  receivedCount: number;
  isActive: boolean;
};

export type FrontierBeanClientState = Omit<FrontierBeanState, "players" | "drawPile" | "discardPile"> & {
  players: FrontierBeanClientPlayer[];
  drawCount: number;
  discardCount: number;
  discardTop?: FrontierBeanCard;
  me?: {
    id: string;
    hand: FrontierBeanCard[];
    received: FrontierBeanCard[];
    fields: FrontierBeanField[];
    legalHarvests: number[];
    canTrade: boolean;
  };
};

type Participant = { id: string; name: string; avatar?: string; bot?: boolean };

const beanById = new Map(FRONTIER_BEANS.map((bean) => [bean.id, bean]));
const copyCard = (card: FrontierBeanCard) => ({ ...card });
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function shuffle<T>(items: T[], random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function event(state: FrontierBeanState, kind: FrontierEvent["kind"], text: string, actorId?: string, cardIds?: string[]) {
  state.lastEvent = { id: makeId("event"), kind, text, actorId, cardIds, at: Date.now() };
  state.revision += 1;
}

export function frontierBeanDefinition(type: FrontierBeanType) {
  const definition = beanById.get(type);
  if (!definition) throw new Error("알 수 없는 콩이에요.");
  return definition;
}

export function frontierHarvestValue(type: FrontierBeanType, count: number) {
  const thresholds = frontierBeanDefinition(type).harvest;
  let coins = 0;
  thresholds.forEach((threshold, index) => { if (count >= threshold) coins = index + 1; });
  return coins;
}

export function frontierLegalHarvests(player: Pick<FrontierBeanPlayer, "fields">) {
  const hasLargeField = player.fields.some((field) => field.cards.length > 1);
  return player.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.cards.length > 0 && !(field.cards.length === 1 && hasLargeField))
    .map(({ index }) => index);
}

export function createFrontierBeanDeck() {
  return FRONTIER_BEANS.flatMap((bean) => Array.from({ length: bean.count }, (_, index) => ({
    id: `${bean.id}-${String(index + 1).padStart(2, "0")}-${crypto.randomUUID()}`,
    type: bean.id,
  })));
}

export function createFrontierBeanState(participants: Participant[], options: { random?: () => number; debug?: boolean } = {}): FrontierBeanState {
  if (participants.length < 3 || participants.length > 5) throw new Error("황혼의 콩시장은 3~5명이 필요해요.");
  const random = options.random ?? Math.random;
  const fieldCount = participants.length === 3 ? 3 : 2;
  const deck = shuffle(createFrontierBeanDeck(), random);
  const players: FrontierBeanPlayer[] = participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
    avatar: participant.avatar ?? "🤠",
    bot: participant.bot,
    coins: 0,
    coinCards: [],
    hand: [],
    fields: Array.from({ length: fieldCount }, () => ({ cards: [] })),
    received: [],
  }));
  for (let card = 0; card < 5; card += 1) {
    for (const player of players) {
      const next = deck.pop();
      if (!next) throw new Error("시작 카드를 나눌 수 없어요.");
      player.hand.push(next);
    }
  }
  return {
    version: 1,
    phase: "plant_hand",
    players,
    playerOrder: players.map((player) => player.id),
    activePlayerIndex: 0,
    startingPlayerId: players[0].id,
    drawPile: deck,
    discardPile: [],
    revealed: [],
    offers: [],
    exhaustionCount: 0,
    handPlantsThisTurn: 0,
    endAfterMandatory: false,
    round: 1,
    revision: 1,
    debug: options.debug,
  };
}

export function frontierActivePlayer(state: FrontierBeanState) {
  const id = state.playerOrder[state.activePlayerIndex];
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("현재 플레이어를 찾을 수 없어요.");
  return player;
}

function requirePlayer(state: FrontierBeanState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("참가자를 찾을 수 없어요.");
  return player;
}

function requireField(player: FrontierBeanPlayer, fieldIndex: number) {
  const field = player.fields[fieldIndex];
  if (!field) throw new Error("밭을 다시 선택해 주세요.");
  return field;
}

export function frontierHarvest(state: FrontierBeanState, playerId: string, fieldIndex: number) {
  if (state.phase === "game_over") throw new Error("이미 끝난 게임이에요.");
  const player = requirePlayer(state, playerId);
  const field = requireField(player, fieldIndex);
  if (!field.cards.length) throw new Error("비어 있는 밭은 수확할 수 없어요.");
  if (!frontierLegalHarvests(player).includes(fieldIndex)) throw new Error("다른 밭에 콩이 두 개 이상 있어 이 한 칸 밭은 보호돼요.");
  const type = field.cards[0].type;
  const payout = frontierHarvestValue(type, field.cards.length);
  const harvested = field.cards.splice(0);
  player.coinCards.push(...harvested.slice(0, payout));
  player.coins += payout;
  state.discardPile.push(...harvested.slice(payout));
  event(state, "harvest", `${player.name}님이 ${frontierBeanDefinition(type).name} ${harvested.length}개를 수확해 ${payout}코인을 얻었어요.`, playerId, harvested.map((card) => card.id));
  return payout;
}

function plantIntoField(state: FrontierBeanState, player: FrontierBeanPlayer, card: FrontierBeanCard, fieldIndex: number) {
  const field = requireField(player, fieldIndex);
  if (field.cards.length && field.cards[0].type !== card.type) throw new Error("다른 종류의 콩이 자라고 있어요. 밭을 먼저 수확한 뒤 심어 주세요.");
  field.cards.push(card);
}

function drawOne(state: FrontierBeanState, context: "reveal" | "draw") {
  if (!state.drawPile.length) {
    state.exhaustionCount += 1;
    if (state.exhaustionCount >= 3) {
      if (context === "reveal") state.endAfterMandatory = true;
      return undefined;
    }
    state.drawPile = shuffle(state.discardPile.splice(0));
  }
  return state.drawPile.pop();
}

function revealForTrade(state: FrontierBeanState) {
  state.revealed = [];
  for (let index = 0; index < 2; index += 1) {
    const card = drawOne(state, "reveal");
    if (!card) break;
    state.revealed.push(card);
  }
  state.phase = "trade";
  state.offers = [];
  event(state, "reveal", `${frontierActivePlayer(state).name}님이 장터에 ${state.revealed.length}장을 공개했어요.`, frontierActivePlayer(state).id, state.revealed.map((card) => card.id));
}

export function frontierPlantHand(state: FrontierBeanState, playerId: string, fieldIndex: number) {
  const active = frontierActivePlayer(state);
  if (state.phase !== "plant_hand" || active.id !== playerId) throw new Error("지금은 내 손패를 심을 차례가 아니에요.");
  if (state.handPlantsThisTurn >= 2) throw new Error("손패에서는 한 턴에 두 장까지만 심을 수 있어요.");
  const card = active.hand[0];
  if (!card) {
    revealForTrade(state);
    return;
  }
  plantIntoField(state, active, card, fieldIndex);
  active.hand.shift();
  state.handPlantsThisTurn += 1;
  event(state, "plant", `${active.name}님이 맨 앞의 ${frontierBeanDefinition(card.type).name}을 심었어요.`, active.id, [card.id]);
  if (state.handPlantsThisTurn >= 2) revealForTrade(state);
}

export function frontierFinishHandPlant(state: FrontierBeanState, playerId: string) {
  const active = frontierActivePlayer(state);
  if (state.phase !== "plant_hand" || active.id !== playerId) throw new Error("지금 넘길 수 있는 단계가 아니에요.");
  if (active.hand.length > 0 && state.handPlantsThisTurn === 0) throw new Error("맨 앞 카드는 반드시 심어야 해요.");
  revealForTrade(state);
}

function locateOwnedTradeCard(state: FrontierBeanState, owner: FrontierBeanPlayer, cardId: string) {
  const handIndex = owner.hand.findIndex((card) => card.id === cardId);
  if (handIndex >= 0) return { source: "hand" as const, index: handIndex, card: owner.hand[handIndex] };
  if (owner.id === frontierActivePlayer(state).id) {
    const revealedIndex = state.revealed.findIndex((card) => card.id === cardId);
    if (revealedIndex >= 0) return { source: "revealed" as const, index: revealedIndex, card: state.revealed[revealedIndex] };
  }
  return undefined;
}

function requestedMatches(cards: FrontierBeanCard[], wants: FrontierTradeRequest[]) {
  const needed = new Map<FrontierBeanType, number>();
  wants.forEach((want) => needed.set(want.type, (needed.get(want.type) ?? 0) + want.quantity));
  const actual = new Map<FrontierBeanType, number>();
  cards.forEach((card) => actual.set(card.type, (actual.get(card.type) ?? 0) + 1));
  return [...needed.entries()].every(([type, quantity]) => actual.get(type) === quantity)
    && cards.length === [...needed.values()].reduce((sum, value) => sum + value, 0);
}

export function frontierCreateOffer(state: FrontierBeanState, actorId: string, targetId: string, giveCardIds: string[], wants: FrontierTradeRequest[]) {
  if (state.phase !== "trade") throw new Error("지금은 거래 단계가 아니에요.");
  const activeId = frontierActivePlayer(state).id;
  if (actorId !== activeId) throw new Error("현재 턴 플레이어만 거래를 시작할 수 있어요.");
  if (actorId === targetId) throw new Error("자기 자신과는 거래할 수 없어요.");
  const actor = requirePlayer(state, actorId);
  requirePlayer(state, targetId);
  const uniqueIds = [...new Set(giveCardIds)];
  const liveTrade = wants.length === 0;
  if (!uniqueIds.length && !liveTrade) throw new Error("최소 한 장은 주어야 해요.");
  const locatedCards = uniqueIds.map((cardId) => locateOwnedTradeCard(state, actor, cardId));
  if (locatedCards.some((located) => !located)) throw new Error("내 손패 또는 내 공개 카드만 거래할 수 있어요.");
  const normalizedWants = wants
    .filter((want) => beanById.has(want.type) && Number.isInteger(want.quantity) && want.quantity > 0)
    .map((want) => ({ type: want.type, quantity: Math.min(5, want.quantity) }));
  state.offers.forEach((pending) => {
    if (pending.status !== "pending") return;
    const samePair = (pending.fromId === actorId && pending.toId === targetId) || (pending.fromId === targetId && pending.toId === actorId);
    if (samePair) pending.status = "cancelled";
  });
  const offer: FrontierTradeOffer = {
    id: makeId("offer"),
    fromId: actorId,
    toId: targetId,
    giveCardIds: uniqueIds,
    giveTypes: locatedCards.map((located) => located!.card.type),
    returnCardIds: [],
    returnTypes: [],
    wants: normalizedWants,
    fromReady: false,
    toReady: false,
    status: "pending",
    createdAt: Date.now(),
  };
  state.offers.push(offer);
  event(state, "trade", `${actor.name}님이 ${requirePlayer(state, targetId).name}님과 거래를 시작했어요.`, actorId, uniqueIds);
  return offer;
}

export function frontierUpdateTradeCards(state: FrontierBeanState, playerId: string, offerId: string, cardIds: string[]) {
  if (state.phase !== "trade") throw new Error("거래 단계가 끝났어요.");
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === "pending");
  if (!offer || (offer.fromId !== playerId && offer.toId !== playerId)) throw new Error("참여 중인 거래가 없어요.");
  const owner = requirePlayer(state, playerId);
  const uniqueIds = [...new Set(cardIds)];
  const locatedCards = uniqueIds.map((cardId) => locateOwnedTradeCard(state, owner, cardId));
  if (locatedCards.some((located) => !located)) throw new Error("내 손패 또는 내 공개 카드만 거래할 수 있어요.");
  if (playerId === offer.fromId) {
    offer.giveCardIds = uniqueIds;
    offer.giveTypes = locatedCards.map((located) => located!.card.type);
  } else {
    offer.returnCardIds = uniqueIds;
    offer.returnTypes = locatedCards.map((located) => located!.card.type);
  }
  offer.fromReady = false;
  offer.toReady = false;
  state.revision += 1;
  return offer;
}

export function frontierConfirmTrade(state: FrontierBeanState, playerId: string, offerId: string) {
  if (state.phase !== "trade") throw new Error("거래 단계가 끝났어요.");
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === "pending");
  if (!offer || (offer.fromId !== playerId && offer.toId !== playerId)) throw new Error("참여 중인 거래가 없어요.");
  if (offer.giveCardIds.length + offer.returnCardIds.length === 0) throw new Error("거래할 콩을 한 장 이상 올려 주세요.");
  if (playerId === offer.fromId) offer.fromReady = true;
  else offer.toReady = true;
  if (offer.fromReady && offer.toReady) return frontierAcceptOffer(state, offer.toId, offer.id, offer.returnCardIds);
  event(state, "trade", `${requirePlayer(state, playerId).name}님이 거래하기를 눌렀어요.`, playerId);
  return offer;
}

export function frontierRejectOffer(state: FrontierBeanState, playerId: string, offerId: string) {
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === "pending");
  if (!offer || (offer.fromId !== playerId && offer.toId !== playerId)) throw new Error("취소할 거래가 없어요.");
  offer.status = "cancelled";
  event(state, "trade", `${requirePlayer(state, playerId).name}님이 거래를 취소했어요.`, playerId);
}

export function frontierCancelOffer(state: FrontierBeanState, playerId: string, offerId: string) {
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === "pending");
  if (!offer || (offer.fromId !== playerId && offer.toId !== playerId)) throw new Error("취소할 거래가 없어요.");
  offer.status = "cancelled";
  event(state, "trade", `${requirePlayer(state, playerId).name}님이 거래를 취소했어요.`, playerId);
}

function takeTradeCard(state: FrontierBeanState, owner: FrontierBeanPlayer, cardId: string) {
  const located = locateOwnedTradeCard(state, owner, cardId);
  if (!located) throw new Error("카드 소유권이 바뀌어 이 거래는 더 이상 유효하지 않아요.");
  return located.source === "hand" ? owner.hand.splice(located.index, 1)[0] : state.revealed.splice(located.index, 1)[0];
}

export function frontierAcceptOffer(state: FrontierBeanState, playerId: string, offerId: string, returnCardIds: string[]) {
  if (state.phase !== "trade") throw new Error("거래 단계가 끝났어요.");
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === "pending");
  if (!offer || offer.toId !== playerId) throw new Error("응답할 거래 제안이 없어요.");
  const from = requirePlayer(state, offer.fromId);
  const to = requirePlayer(state, offer.toId);
  const uniqueReturnIds = [...new Set(returnCardIds)];
  const returnCards = uniqueReturnIds.map((cardId) => locateOwnedTradeCard(state, to, cardId)?.card).filter((card): card is FrontierBeanCard => Boolean(card));
  const liveTrade = offer.wants.length === 0;
  if (returnCards.length !== uniqueReturnIds.length || (!liveTrade && !requestedMatches(returnCards, offer.wants))) throw new Error("거래판에 올린 카드를 다시 확인해 주세요.");
  if (offer.giveCardIds.some((cardId) => !locateOwnedTradeCard(state, from, cardId))) {
    offer.status = "cancelled";
    throw new Error("다른 거래에서 사용된 카드가 있어 제안이 만료됐어요.");
  }
  const given = offer.giveCardIds.map((cardId) => takeTradeCard(state, from, cardId));
  const returned = uniqueReturnIds.map((cardId) => takeTradeCard(state, to, cardId));
  to.received.push(...given);
  from.received.push(...returned);
  offer.status = "accepted";
  offer.returnCardIds = uniqueReturnIds;
  offer.returnTypes = returnCards.map((card) => card.type);
  offer.fromReady = true;
  offer.toReady = true;
  const consumed = new Set([...offer.giveCardIds, ...uniqueReturnIds]);
  state.offers.forEach((other) => {
    if (other.status === "pending" && other.id !== offer.id && [...other.giveCardIds, ...other.returnCardIds].some((cardId) => consumed.has(cardId))) other.status = "cancelled";
  });
  event(state, "trade", `${from.name}님과 ${to.name}님의 거래가 성사됐어요.`, playerId, [...given, ...returned].map((card) => card.id));
}

function allMandatoryPlanted(state: FrontierBeanState) {
  return state.players.every((player) => player.received.length === 0);
}

function finishGame(state: FrontierBeanState) {
  for (const player of state.players) {
    for (const field of player.fields) {
      if (!field.cards.length) continue;
      const payout = frontierHarvestValue(field.cards[0].type, field.cards.length);
      const cards = field.cards.splice(0);
      player.coinCards.push(...cards.slice(0, payout));
      player.coins += payout;
      state.discardPile.push(...cards.slice(payout));
    }
  }
  const clockwiseDistance = (playerId: string) => state.playerOrder.indexOf(playerId);
  const sorted = [...state.players].sort((a, b) => b.coins - a.coins || clockwiseDistance(b.id) - clockwiseDistance(a.id));
  state.rankings = sorted.map((player, index) => ({ playerId: player.id, coins: player.coins, rank: index + 1 }));
  state.phase = "game_over";
  state.offers = [];
  event(state, "game_over", `${sorted[0]?.name ?? "승자"}님이 황혼의 장터를 제패했어요!`, sorted[0]?.id);
}

function drawAndPass(state: FrontierBeanState) {
  const active = frontierActivePlayer(state);
  const drawn: FrontierBeanCard[] = [];
  for (let index = 0; index < 3; index += 1) {
    const card = drawOne(state, "draw");
    if (!card) {
      finishGame(state);
      return;
    }
    drawn.push(card);
  }
  active.hand.push(...drawn);
  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.playerOrder.length;
  state.round += state.activePlayerIndex === 0 ? 1 : 0;
  state.phase = "plant_hand";
  state.handPlantsThisTurn = 0;
  state.revealed = [];
  state.offers = [];
  event(state, "turn", `${frontierActivePlayer(state).name}님의 재배 차례예요.`, frontierActivePlayer(state).id, drawn.map((card) => card.id));
  if (!frontierActivePlayer(state).hand.length) revealForTrade(state);
}

function advanceAfterMandatory(state: FrontierBeanState) {
  if (!allMandatoryPlanted(state)) return;
  if (state.endAfterMandatory) finishGame(state);
  else drawAndPass(state);
}

export function frontierEndTrade(state: FrontierBeanState, playerId: string) {
  if (state.phase !== "trade" || frontierActivePlayer(state).id !== playerId) throw new Error("현재 턴 플레이어만 거래를 마칠 수 있어요.");
  state.offers.forEach((offer) => { if (offer.status === "pending") offer.status = "cancelled"; });
  const active = frontierActivePlayer(state);
  active.received.push(...state.revealed.splice(0));
  state.phase = "plant_received";
  event(state, "trade", "거래가 끝났어요. 받은 콩과 남은 공개콩을 모두 심으세요.", playerId);
  advanceAfterMandatory(state);
}

export function frontierPlantReceived(state: FrontierBeanState, playerId: string, cardId: string, fieldIndex: number) {
  if (state.phase !== "plant_received") throw new Error("지금은 받은 콩을 심는 단계가 아니에요.");
  const player = requirePlayer(state, playerId);
  const cardIndex = player.received.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new Error("받은 콩 중에서 선택해 주세요.");
  const [card] = player.received.splice(cardIndex, 1);
  try {
    plantIntoField(state, player, card, fieldIndex);
  } catch (error) {
    player.received.splice(cardIndex, 0, card);
    throw error;
  }
  event(state, "plant", `${player.name}님이 받은 ${frontierBeanDefinition(card.type).name}을 심었어요.`, playerId, [card.id]);
  advanceAfterMandatory(state);
}

function frontierDebugCard(type: FrontierBeanType) {
  return { id: `debug-${type}-${crypto.randomUUID()}`, type } satisfies FrontierBeanCard;
}

/**
 * Local QA scenes. This is deliberately guarded by state.debug and is never
 * available in normal rooms. The scenarios still use the normal action
 * handlers afterwards, so server-side validation remains under test.
 */
export function frontierDebugScenario(state: FrontierBeanState, playerId: string, scenario: string) {
  if (!state.debug) throw new Error("디버그 방에서만 사용할 수 있어요.");
  const viewer = requirePlayer(state, playerId);
  const setViewerTurn = () => {
    state.activePlayerIndex = state.playerOrder.indexOf(playerId);
    state.offers = [];
    state.revealed = [];
    state.endAfterMandatory = false;
    state.players.forEach((player) => { player.received = []; });
  };

  if (/^players-[345]$/.test(scenario)) {
    const playerCount = Number(scenario.slice(-1));
    const resized = createFrontierBeanState([
      { id: viewer.id, name: viewer.name, avatar: viewer.avatar, bot: false },
      ...Array.from({ length: playerCount - 1 }, (_, index) => ({
        id: `debug-bot-${index + 1}-${crypto.randomUUID()}`,
        name: `농부 BOT ${index + 1}`,
        bot: true,
      })),
    ], { debug: true });
    Object.assign(state, resized);
    event(state, "turn", `${playerCount}인 디버그 게임을 새로 시작했어요.`, playerId);
    return;
  }

  if (scenario === "reset") {
    const reset = createFrontierBeanState(state.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      bot: player.id !== playerId,
    })), { debug: true });
    Object.assign(state, reset);
    event(state, "turn", "디버그 게임을 처음부터 다시 시작했어요.", playerId);
    return;
  }
  if (scenario === "plant") {
    setViewerTurn();
    state.phase = "plant_hand";
    state.handPlantsThisTurn = 0;
    if (!viewer.hand.length) viewer.hand.push(frontierDebugCard("ruby"));
    event(state, "turn", "첫 카드 강제 심기 화면을 준비했어요.", playerId);
    return;
  }
  if (scenario === "trade") {
    setViewerTurn();
    state.phase = "trade";
    const displayCrops: FrontierBeanType[][] = [
      ["ruby", "honey"],
      ["midnight", "forest"],
      ["honey", "ruby"],
      ["forest", "roast"],
      ["ruby", "midnight"],
    ];
    state.players.forEach((player, playerIndex) => {
      player.fields.forEach((field, fieldIndex) => {
        const type = displayCrops[playerIndex % displayCrops.length][fieldIndex % 2];
        const count = player.id === playerId ? (fieldIndex === 0 ? 4 : 2) : 3;
        field.cards = Array.from({ length: count }, () => frontierDebugCard(type));
      });
    });
    state.revealed = [frontierDebugCard("ruby"), frontierDebugCard("midnight")];
    viewer.received = [frontierDebugCard("honey")];
    event(state, "reveal", "공개콩 두 장과 거래 화면을 준비했어요.", playerId, state.revealed.map((card) => card.id));
    return;
  }
  if (scenario === "received") {
    setViewerTurn();
    state.phase = "plant_received";
    viewer.fields.forEach((field) => { field.cards = []; });
    viewer.received = [frontierDebugCard("midnight"), frontierDebugCard("honey")];
    event(state, "trade", "받은 콩 두 장의 강제 심기 화면을 준비했어요.", playerId, viewer.received.map((card) => card.id));
    return;
  }
  if (scenario === "protection") {
    setViewerTurn();
    state.phase = "plant_received";
    viewer.fields.forEach((field) => { field.cards = []; });
    viewer.fields[0].cards = [frontierDebugCard("ruby")];
    viewer.fields[1].cards = Array.from({ length: 6 }, () => frontierDebugCard("forest"));
    viewer.received = [frontierDebugCard("midnight")];
    event(state, "turn", "1장 밭 보호와 강제 수확 화면을 준비했어요.", playerId);
    return;
  }
  if (scenario === "harvest") {
    setViewerTurn();
    state.phase = "plant_hand";
    state.handPlantsThisTurn = 0;
    viewer.fields.forEach((field) => { field.cards = []; });
    viewer.fields[0].cards = Array.from({ length: 5 }, () => frontierDebugCard("forest"));
    event(state, "turn", "수확 가능한 밭을 준비했어요.", playerId);
    return;
  }
  if (scenario === "near-end") {
    setViewerTurn();
    state.phase = "trade";
    state.exhaustionCount = 2;
    state.drawPile = [];
    state.discardPile = [];
    event(state, "turn", "거래를 마치면 세 번째 덱 소진으로 최종 정산됩니다.", playerId);
    return;
  }
  if (scenario === "autoplay") {
    const simulation = createFrontierBeanState(state.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      bot: true,
    })), { debug: true });
    let safety = 0;
    while (simulation.phase !== "game_over" && safety < 30_000) {
      safety += Math.max(1, advanceFrontierBeanBots(simulation, 1000));
    }
    if (simulation.phase !== "game_over") throw new Error("봇 자동 완주가 제한 단계 안에 끝나지 않았어요.");
    Object.assign(state, simulation);
    return;
  }
  throw new Error("알 수 없는 디버그 장면이에요.");
}

export function frontierBeanClientState(state: FrontierBeanState, viewerId?: string): FrontierBeanClientState {
  const activeId = state.playerOrder[state.activePlayerIndex];
  const viewer = state.players.find((player) => player.id === viewerId);
  const publicState = JSON.parse(JSON.stringify(state)) as Partial<FrontierBeanState> & Record<string, unknown>;
  delete publicState.players;
  delete publicState.drawPile;
  delete publicState.discardPile;
  return {
    ...publicState,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      bot: Boolean(player.bot),
      coins: player.coins,
      handCount: player.hand.length,
      fields: player.fields.map((field) => ({ type: field.cards[0]?.type, count: field.cards.length })),
      receivedCount: player.received.length,
      isActive: player.id === activeId,
    })),
    drawCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    discardTop: state.discardPile.at(-1) ? copyCard(state.discardPile.at(-1)!) : undefined,
    me: viewer ? {
      id: viewer.id,
      hand: viewer.hand.map(copyCard),
      received: viewer.received.map(copyCard),
      fields: viewer.fields.map((field) => ({ cards: field.cards.map(copyCard) })),
      legalHarvests: frontierLegalHarvests(viewer),
      canTrade: state.phase === "trade",
    } : undefined,
  } as FrontierBeanClientState;
}

function choosePlantField(player: FrontierBeanPlayer, type: FrontierBeanType) {
  const matching = player.fields.findIndex((field) => field.cards[0]?.type === type);
  if (matching >= 0) return matching;
  const empty = player.fields.findIndex((field) => field.cards.length === 0);
  if (empty >= 0) return empty;
  const legal = frontierLegalHarvests(player);
  return legal.sort((a, b) => player.fields[a].cards.length - player.fields[b].cards.length)[0] ?? 0;
}

function prepareBotPlantField(state: FrontierBeanState, player: FrontierBeanPlayer, type: FrontierBeanType) {
  const fieldIndex = choosePlantField(player, type);
  const field = player.fields[fieldIndex];
  if (field.cards.length && field.cards[0].type !== type) frontierHarvest(state, player.id, fieldIndex);
  return fieldIndex;
}

function botTrade(state: FrontierBeanState, active: FrontierBeanPlayer) {
  const target = state.players.find((player) => player.id !== active.id && player.bot && player.hand.length);
  const give = state.revealed[0] ?? active.hand.at(-1);
  if (!target || !give) return false;
  const wanted = target.hand[0];
  const offer = frontierCreateOffer(state, active.id, target.id, [give.id], [{ type: wanted.type, quantity: 1 }]);
  frontierAcceptOffer(state, target.id, offer.id, [wanted.id]);
  return true;
}

export function advanceFrontierBeanBots(state: FrontierBeanState, maxSteps = 500) {
  let steps = 0;
  while (state.phase !== "game_over" && steps < maxSteps) {
    steps += 1;
    const active = frontierActivePlayer(state);
    if (state.phase === "plant_hand") {
      if (!active.bot) break;
      if (active.hand.length && state.handPlantsThisTurn === 0) frontierPlantHand(state, active.id, prepareBotPlantField(state, active, active.hand[0].type));
      else if (active.hand.length && state.handPlantsThisTurn === 1 && Math.random() < 0.45) frontierPlantHand(state, active.id, prepareBotPlantField(state, active, active.hand[0].type));
      else frontierFinishHandPlant(state, active.id);
      continue;
    }
    if (state.phase === "trade") {
      const incomingForBot = state.offers.find((offer) => offer.status === "pending" && requirePlayer(state, offer.toId).bot);
      if (incomingForBot) {
        const bot = requirePlayer(state, incomingForBot.toId);
        const available = [...bot.hand, ...(bot.id === active.id ? state.revealed : [])];
        // 실시간 거래는 빈 거래판으로 먼저 열립니다. 봇이 생성 직후 빈 거래를
        // 수락해 팝업을 닫지 않도록, 사람 플레이어가 카드를 올리고 확인할 때까지
        // 그대로 기다립니다. 확인 후에는 봇도 카드 한 장을 올리고 동의합니다.
        if (incomingForBot.wants.length === 0) {
          if (!incomingForBot.fromReady || incomingForBot.giveCardIds.length === 0) break;
          const returnCard = available[0];
          if (returnCard) frontierUpdateTradeCards(state, bot.id, incomingForBot.id, [returnCard.id]);
          frontierConfirmTrade(state, bot.id, incomingForBot.id);
          // 카드를 올리면 양쪽 확인이 모두 풀린다. 제안자도 봇이면(자동 진행 게임,
          // 이탈자 대체 등) 대신 재확인해 이어가고, 사람이면 실제 재확인을 기다린다.
          if (requirePlayer(state, incomingForBot.fromId).bot) frontierConfirmTrade(state, incomingForBot.fromId, incomingForBot.id);
          continue;
        }
        const selected: string[] = [];
        for (const want of incomingForBot.wants) {
          selected.push(...available.filter((candidate) => candidate.type === want.type && !selected.includes(candidate.id)).slice(0, want.quantity).map((candidate) => candidate.id));
        }
        const needed = incomingForBot.wants.reduce((sum, want) => sum + want.quantity, 0);
        if (selected.length === needed) frontierAcceptOffer(state, bot.id, incomingForBot.id, selected);
        else frontierRejectOffer(state, bot.id, incomingForBot.id);
        continue;
      }
      if (!active.bot) break;
      botTrade(state, active);
      frontierEndTrade(state, active.id);
      continue;
    }
    if (state.phase === "plant_received") {
      const pendingBot = state.players.find((player) => player.bot && player.received.length);
      if (pendingBot) {
        const card = pendingBot.received[0];
        frontierPlantReceived(state, pendingBot.id, card.id, prepareBotPlantField(state, pendingBot, card.type));
        continue;
      }
      if (state.players.some((player) => !player.bot && player.received.length)) break;
      advanceAfterMandatory(state);
      continue;
    }
  }
  return steps;
}

export function replaceFrontierBeanPlayerWithBot(state: FrontierBeanState, playerId: string) {
  const player = requirePlayer(state, playerId);
  player.bot = true;
  if (!player.name.endsWith(" · BOT")) player.name = `${player.name} · BOT`;
  event(state, "turn", `${player.name}이 남은 게임을 이어갑니다.`, player.id);
  advanceFrontierBeanBots(state);
}

export function playFrontierBeanBotGame(playerCount: 3 | 4 | 5, maxSteps = 30_000) {
  const participants = Array.from({ length: playerCount }, (_, index) => ({ id: `bot-${index + 1}`, name: `BOT ${index + 1}`, bot: true }));
  const state = createFrontierBeanState(participants, { debug: true });
  let total = 0;
  while (state.phase !== "game_over" && total < maxSteps) total += Math.max(1, advanceFrontierBeanBots(state, 1000));
  if (state.phase !== "game_over") throw new Error(`${playerCount}인 봇 게임이 ${maxSteps}단계 안에 끝나지 않았어요.`);
  return state;
}

export function handleFrontierBeanAction(state: FrontierBeanState, playerId: string, action: string, payload: Record<string, unknown>) {
  if (action === "frontier-beans-plant-hand") frontierPlantHand(state, playerId, Number(payload.fieldIndex));
  else if (action === "frontier-beans-finish-plant") frontierFinishHandPlant(state, playerId);
  else if (action === "frontier-beans-harvest") frontierHarvest(state, playerId, Number(payload.fieldIndex));
  else if (action === "frontier-beans-offer") frontierCreateOffer(state, playerId, String(payload.targetId ?? ""), Array.isArray(payload.giveCardIds) ? payload.giveCardIds.map(String) : [], Array.isArray(payload.wants) ? payload.wants as FrontierTradeRequest[] : []);
  else if (action === "frontier-beans-update-trade") frontierUpdateTradeCards(state, playerId, String(payload.offerId ?? ""), Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : []);
  else if (action === "frontier-beans-confirm-trade") frontierConfirmTrade(state, playerId, String(payload.offerId ?? ""));
  else if (action === "frontier-beans-accept") frontierAcceptOffer(state, playerId, String(payload.offerId ?? ""), Array.isArray(payload.returnCardIds) ? payload.returnCardIds.map(String) : []);
  else if (action === "frontier-beans-reject") frontierRejectOffer(state, playerId, String(payload.offerId ?? ""));
  else if (action === "frontier-beans-cancel") frontierCancelOffer(state, playerId, String(payload.offerId ?? ""));
  else if (action === "frontier-beans-end-trade") frontierEndTrade(state, playerId);
  else if (action === "frontier-beans-plant-received") frontierPlantReceived(state, playerId, String(payload.cardId ?? ""), Number(payload.fieldIndex));
  else if (action === "frontier-beans-debug") frontierDebugScenario(state, playerId, String(payload.scenario ?? ""));
  else if (action !== "frontier-beans-tick") throw new Error("지원하지 않는 황혼의 콩시장 행동이에요.");
  advanceFrontierBeanBots(state);
}
