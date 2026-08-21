"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import {
  FRONTIER_BEANS, frontierBeanDefinition,
  type FrontierBeanCard, type FrontierBeanClientPlayer, type FrontierBeanClientState,
  type FrontierBeanType, type FrontierTradeOffer,
} from "./api/_lib/frontier-beans";
export type { FrontierBeanClientState } from "./api/_lib/frontier-beans";

type Props = {
  code: string; meId?: string; state: FrontierBeanClientState; isHost: boolean; busy?: boolean;
  onAction: (payload: Record<string, unknown>) => Promise<unknown>;
  onLobby: () => void; onLeave: () => void; overlays?: ReactNode;
};
type DragSource = "hand" | "revealed" | "received" | "trade";
type DragState = { card: FrontierBeanCard; cardIds: string[]; source: DragSource; pointerId: number; x: number; y: number };
type PressState = DragState & { startX: number; startY: number; timer: number; target: HTMLElement };

const PHASE_LABEL: Record<FrontierBeanClientState["phase"], string> = {
  plant_hand: "심기 단계", trade: "거래 단계", plant_received: "받은 콩 심기", game_over: "최종 정산",
};
const farmerImage = (index: number) => `/frontier-beans/farmer-${(index % 5) + 1}.png`;
const cardImage = (type: FrontierBeanType) => `/frontier-beans/ui-v3/card-${type}.png`;
// 식물 표시용은 카드 이미지와 분리된, 검수된 투명 PNG 스프라이트를 사용한다.
const beanImage = (type: FrontierBeanType) => `/frontier-beans/bean-${type}.png`;
const fieldImage = (type: FrontierBeanType, count: number) => `/frontier-beans/fields/bean-${type}-${count <= 3 ? "low" : count <= 6 ? "mid" : "high"}.png`;

function useFrontierSound() {
  const contextRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const ensure = () => {
    if (!contextRef.current) contextRef.current = new AudioContext();
    if (contextRef.current.state === "suspended") void contextRef.current.resume();
    return contextRef.current;
  };
  const play = useCallback((kind: "tap" | "draw" | "plant" | "trade" | "harvest" | "turn" | "game_end" | "error") => {
    if (mutedRef.current) return;
    const context = ensure();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "error" ? "sawtooth" : ["harvest", "game_end"].includes(kind) ? "triangle" : "sine";
    const base = kind === "plant" ? 230 : kind === "trade" ? 540 : kind === "harvest" ? 740 : kind === "draw" ? 310 : kind === "turn" ? 620 : kind === "game_end" ? 680 : kind === "error" ? 120 : 380;
    oscillator.frequency.setValueAtTime(base, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "error" ? 80 : base * 1.35, context.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.22);
  }, []);
  return { play, setMuted: useCallback((muted: boolean) => { mutedRef.current = muted; }, []) };
}

function HandCard({ card, compact, selected, mandatory, locked, quantity, draggable, flippable, onClick, onPointerDown, onPointerMove, onPointerUp }: {
  card: FrontierBeanCard; compact?: boolean; selected?: boolean; mandatory?: boolean; locked?: boolean; quantity?: number; draggable?: boolean; flippable?: boolean;
  onClick?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const bean = frontierBeanDefinition(card.type);
  const [flipped, setFlipped] = useState(false);
  return <button type="button" className={`fb3-card ${compact ? "compact" : ""} ${flippable ? "flippable" : ""} ${flipped ? "flipped" : ""} ${selected ? "selected" : ""} ${mandatory ? "mandatory" : ""} ${locked ? "locked" : ""} ${draggable ? "draggable" : ""}`} onClick={() => { if (flippable) setFlipped((value) => !value); onClick?.(); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label={`${bean.name}${quantity && quantity > 1 ? ` ${quantity}개` : ""}`}>
    {!flipped ? <img src={cardImage(card.type)} alt="" draggable={false}/> : <span className="fb3-card-value"><strong>수확표</strong>{bean.harvest.map((count, index) => <span key={count}><b>{count}개</b><i>{index + 1}코인</i></span>)}</span>}<b>{bean.name}</b>{quantity && quantity > 1 && <small>×{quantity}개</small>}
    {mandatory && <i>첫 카드</i>}{selected && <em>✓</em>}
  </button>;
}

function CropTree({ type, count, miniature }: { type?: FrontierBeanType; count: number; miniature?: boolean }) {
  if (!type || count === 0) return <span className="fb3-empty-field">빈 밭</span>;
  if (miniature) return <span className="fb3-mini-crop"><img src={fieldImage(type, count)} alt="" draggable={false}/></span>;
  return <span className="fb3-tree"><img src={fieldImage(type, count)} alt="" draggable={false}/></span>;
}

function PlayerPanel({ player, index, active, tradeable, onTrade }: { player: FrontierBeanClientPlayer; index: number; active: boolean; tradeable: boolean; onTrade?: () => void }) {
  return <button type="button" className={`fb3-player ${active ? "active" : ""} ${tradeable ? "tradeable" : ""}`} disabled={!onTrade} onClick={onTrade}>
    <span className="fb3-player-head"><img src={farmerImage(index)} alt="" draggable={false}/><span><b>{player.name}</b><small><i>●</i>{player.coins}　▤ {player.handCount}</small></span><span className="fb3-player-status">{player.receivedCount > 0 && <em className="pending">심기 {player.receivedCount}</em>}{tradeable && <em>거래</em>}{active && <em>턴</em>}</span></span>
    <span className={`fb3-opponent-fields fields-${player.fields.length}`}>{player.fields.map((field, fieldIndex) => <span className="fb3-opponent-field" key={fieldIndex}><CropTree type={field.type} count={field.count} miniature/><b>{field.type ? `${frontierBeanDefinition(field.type).shortName} ×${field.count}` : `밭 ${fieldIndex + 1}`}</b></span>)}</span>
  </button>;
}

function groupedCards(cards: FrontierBeanCard[]) {
  const groups = new Map<FrontierBeanType, FrontierBeanCard[]>();
  cards.forEach((card) => groups.set(card.type, [...(groups.get(card.type) ?? []), card]));
  return [...groups.entries()].map(([type, entries]) => ({ type, cards: entries }));
}
function groupedTypes(types: FrontierBeanType[]) { return groupedCards(types.map((type, index) => ({ id: `summary-${type}-${index}`, type }))); }

function TradeGrid({ groups, emptyAction, onRemove, draggable, pointerHandlers }: {
  groups: ReturnType<typeof groupedCards>; emptyAction?: () => void; onRemove?: (ids: string[]) => void; draggable?: boolean;
  pointerHandlers?: (card: FrontierBeanCard, cardIds: string[]) => { onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void };
}) {
  return <div className="fb3-trade-grid">
    {groups.slice(0, 8).map((group) => <HandCard key={group.type} card={group.cards[0]} compact quantity={group.cards.length} draggable={draggable} onClick={onRemove ? () => onRemove(group.cards.map((card) => card.id)) : undefined} {...(pointerHandlers ? pointerHandlers(group.cards[0], group.cards.map((card) => card.id)) : {})}/>) }
    {Array.from({ length: Math.max(0, 8 - groups.length) }, (_, index) => <button type="button" key={index} className="fb3-trade-slot" onClick={index === 0 ? emptyAction : undefined} disabled={index !== 0 || !emptyAction}>{index === 0 && emptyAction ? "+" : ""}</button>)}
  </div>;
}

function TradeModal({ state, meId, selectedTarget, selectedGive, room, busy, onClose, onGiveRemove, onTrade, dragHandlers }: {
  state: FrontierBeanClientState; meId: string; selectedTarget?: string; selectedGive: string[]; room?: FrontierTradeOffer; busy?: boolean;
  onClose: () => void; onGiveRemove: (ids: string[]) => void; onTrade: () => void;
  dragHandlers: (card: FrontierBeanCard, source: DragSource, cardIds?: string[]) => { onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void };
}) {
  const otherId = room ? (room.fromId === meId ? room.toId : room.fromId) : selectedTarget;
  const target = state.players.find((player) => player.id === otherId);
  const selectable = [...(state.me?.hand ?? []), ...state.revealed];
  const selectedCards = selectedGive.map((id) => selectable.find((card) => card.id === id)).filter((card): card is FrontierBeanCard => Boolean(card));
  const otherTypes = room ? (room.fromId === meId ? room.returnTypes : room.giveTypes) : [];
  const upperGroups = groupedTypes(otherTypes ?? []);
  const lowerGroups = groupedCards(selectedCards);
  const myReady = room ? (room.fromId === meId ? room.fromReady : room.toReady) : false;
  const otherReady = room ? (room.fromId === meId ? room.toReady : room.fromReady) : false;
  const isEmpty = lowerGroups.length === 0 && upperGroups.length === 0;
  return <section className="fb3-trade-modal" aria-label="거래 화면">
    <header><button type="button" onClick={onClose}>‹</button><b>{target?.name ?? "플레이어"}</b><span>실시간 거래</span></header>
    <div className="fb3-trade-side target-side"><b className="fb3-side-name">{target?.name ?? "상대"}<small className={otherReady ? "fb3-ready" : "fb3-waiting"}>{otherReady ? "✓ 확인 완료" : "● 선택 중"}</small></b><TradeGrid groups={upperGroups}/></div>
    <div className="fb3-trade-divider"><span>↕</span></div>
    <div className="fb3-trade-side self-side" data-fb-trade-give="true"><b className="fb3-side-name">나<small className={myReady ? "fb3-ready" : "fb3-waiting"}>{myReady ? "✓ 확인 완료" : "● 선택 중"}</small></b><TradeGrid groups={lowerGroups} onRemove={onGiveRemove} draggable={!myReady} pointerHandlers={!myReady ? (card, cardIds) => dragHandlers(card, "trade", cardIds) : undefined}/>{isEmpty && <p className="fb3-trade-empty">아래 손패나 공개 카드를 눌러<br/>거래판에 올려 주세요.</p>}</div>
    <footer><button type="button" className="reject" disabled={busy} onClick={onClose}>거래 취소</button><button type="button" className="accept" disabled={busy || !room || myReady || (!selectedGive.length && !upperGroups.length)} onClick={onTrade}>{myReady ? "확인 완료" : "거래하기"}</button></footer>
  </section>;
}

export function FrontierBeansBriefing({ playerCount, debugPlayers, isHost, busy, onDebugPlayers, onStart, topBar, overlays }: { playerCount: number; debugPlayers?: number; isHost: boolean; busy?: boolean; onDebugPlayers: (count?: number) => void; onStart: () => void; topBar: ReactNode; overlays?: ReactNode }) {
  const shownCount = debugPlayers ?? playerCount; const valid = shownCount >= 3 && shownCount <= 5;
  return <main className="fb3-briefing" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}><img src="/frontier-beans/ui-v3/farm-day.png" alt="" draggable={false}/>{topBar}<section><small>3–5인 농장 거래 게임</small><h1>황혼의 콩시장</h1><p>앞에서 심고, 원하는 콩을 거래하고, 밭을 수확하세요.</p><div><span><b>1</b>첫 카드는 반드시 심기</span><span><b>2</b>공개콩 2장 거래</span><span><b>3</b>받은 콩 전부 심기</span><span><b>4</b>손패 순서 고정</span></div><strong>3인 밭 3개 · 4~5인 밭 2개</strong>{isHost && <aside className="fb3-debug-setup"><div><span><b>혼자 디버깅</b><small>나머지는 BOT이 진행해요</small></span><button type="button" className={`fb3-debug-toggle ${debugPlayers ? "active" : ""}`} aria-pressed={Boolean(debugPlayers)} onClick={() => onDebugPlayers(debugPlayers ? undefined : 4)}>{debugPlayers ? "켜짐" : "꺼짐"}</button></div>{debugPlayers && <nav aria-label="디버그 인원 선택">{[3, 4, 5].map((count) => <button type="button" key={count} className={debugPlayers === count ? "active" : ""} onClick={() => onDebugPlayers(count)}>{count}인</button>)}</nav>}</aside>}</section><footer>{isHost ? <button type="button" disabled={!valid || busy} onClick={onStart}>{debugPlayers ? `${debugPlayers}인 디버그 시작` : valid ? "게임 시작" : "3~5명이 필요해요"}</button> : <span>방장이 게임을 준비하고 있어요</span>}</footer>{overlays}</main>;
}

export function FrontierBeansGame({ code, meId, state, isHost, busy, onAction, onLobby, onLeave, overlays }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string>(); const [selectedTradeKey, setSelectedTradeKey] = useState<string>(); const [selectedGive, setSelectedGive] = useState<string[]>([]);
  const [draftOfferId, setDraftOfferId] = useState<string>(); const [selectedPending, setSelectedPending] = useState<string>(); const [selectedPlantCard, setSelectedPlantCard] = useState<string>(); const [selectedHarvestField, setSelectedHarvestField] = useState<number>(); const [selectedHarvestInfoField, setSelectedHarvestInfoField] = useState<number>();
  const [handMoreLeft, setHandMoreLeft] = useState(false); const [handMoreRight, setHandMoreRight] = useState(false);
  const [working, setWorking] = useState(false); const [notice, setNotice] = useState(""); const [muted, setMuted] = useState(false); const [help, setHelp] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [debugOpen, setDebugOpen] = useState(false);
  const [drag, setDrag] = useState<DragState>(); const [dragOverField, setDragOverField] = useState<number>(); const [plantFlash, setPlantFlash] = useState<number>();
  const pressRef = useRef<PressState>(); const dragRef = useRef<DragState>(); const dragCleanupRef = useRef<() => void>(); const handScrollRef = useRef<HTMLDivElement>(null); const suppressClick = useRef(false); const tradeSyncRef = useRef<Promise<unknown>>(Promise.resolve()); const lastLiveTradeRef = useRef<string>(); const noticeSwipeRef = useRef<{ pointerId: number; startY: number }>();
  const debugQuery = useSyncExternalStore(() => () => undefined, () => new URLSearchParams(window.location.search).get("debug") === "1", () => false);
  const debugUi = state.debug || debugQuery;
  const { play: playSound, setMuted: setSoundMuted } = useFrontierSound();
  const me = state.me; const myPublic = state.players.find((player) => player.id === meId); const opponents = state.players.filter((player) => player.id !== meId); const active = state.players.find((player) => player.isActive);
  const currentTradeKey = state.phase === "trade" ? `${state.round}:${active?.id ?? ""}` : ""; const effectiveSelectedTarget = selectedTradeKey === currentTradeKey ? selectedTarget : undefined;
  const pendingCard = me?.received.find((card) => card.id === selectedPending) ?? me?.received[0];
  const liveTrade = meId ? [...state.offers].reverse().find((offer) => { if (offer.status !== "pending" || (offer.fromId !== meId && offer.toId !== meId)) return false; const otherId = offer.fromId === meId ? offer.toId : offer.fromId; return !effectiveSelectedTarget || otherId === effectiveSelectedTarget; }) : undefined;
  const serverTradeIds = liveTrade ? (liveTrade.fromId === meId ? liveTrade.giveCardIds : liveTrade.returnCardIds) : [];
  const selectedTradeIds = liveTrade && draftOfferId !== liveTrade.id ? serverTradeIds : selectedGive;
  const myTradeReady = liveTrade ? (liveTrade.fromId === meId ? liveTrade.fromReady : liveTrade.toReady) : false;
  const tradeOpen = state.phase === "trade" && (Boolean(effectiveSelectedTarget) || Boolean(liveTrade));

  useEffect(() => { setSoundMuted(muted); }, [muted, setSoundMuted]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fb3-no-pull");
    let startX = 0;
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const target = event.target instanceof Element ? event.target : null;
      const verticalScroller = target?.closest<HTMLElement>("[data-fb-allow-y-scroll]");
      if (verticalScroller && verticalScroller.scrollHeight > verticalScroller.clientHeight) return;
      if (dy > 0 && Math.abs(dy) > Math.abs(dx)) event.preventDefault();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      root.classList.remove("fb3-no-pull");
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
  useEffect(() => { if (!state.lastEvent?.id) return; const kind = state.lastEvent.kind; const text = state.lastEvent.text ?? ""; if (kind === "plant") playSound("plant"); if (kind === "trade") playSound("trade"); if (kind === "harvest") playSound("harvest"); if (kind === "reveal" || kind === "draw") playSound("draw"); if (kind === "turn") playSound("turn"); if (kind === "game_over") playSound("game_end"); const showTimer = window.setTimeout(() => { if (kind === "trade" && (/성사됐어요|거래를 취소했어요/.test(text))) { lastLiveTradeRef.current = undefined; setSelectedTradeKey(undefined); setSelectedTarget(undefined); setSelectedGive([]); setDraftOfferId(undefined); } setNotice(text); }, 0); const hideTimer = window.setTimeout(() => setNotice(""), 3200); return () => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer); }; }, [state.lastEvent?.id, state.lastEvent?.kind, state.lastEvent?.text, playSound]);
  useEffect(() => () => { if (pressRef.current) window.clearTimeout(pressRef.current.timer); dragCleanupRef.current?.(); }, []);
  const updateHandOverflow = useCallback(() => { const hand = handScrollRef.current; if (!hand) return; setHandMoreLeft(hand.scrollLeft > 3); setHandMoreRight(hand.scrollLeft + hand.clientWidth < hand.scrollWidth - 3); }, []);
  useEffect(() => { const frame = window.requestAnimationFrame(updateHandOverflow); window.addEventListener("resize", updateHandOverflow); return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", updateHandOverflow); }; }, [me?.hand.length, state.phase, updateHandOverflow]);

  const act = async (payload: Record<string, unknown>) => { if (working || busy) return false; setWorking(true); try { await onAction(payload); return true; } catch (error) { setNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); playSound("error"); return false; } finally { setWorking(false); } };
  const clearTradeUi = () => { setSelectedTradeKey(undefined); setSelectedTarget(undefined); setSelectedGive([]); setDraftOfferId(undefined); };
  useEffect(() => {
    if (liveTrade) { lastLiveTradeRef.current = liveTrade.id; return; }
    if (!lastLiveTradeRef.current) return;
    lastLiveTradeRef.current = undefined;
    setSelectedTradeKey(undefined);
    setSelectedTarget(undefined);
    setSelectedGive([]);
    setDraftOfferId(undefined);
  }, [liveTrade]);
  const closeTrade = async () => { if (liveTrade) await act({ action: "frontier-beans-cancel", offerId: liveTrade.id }); clearTradeUi(); };
  const openTrade = async (targetId: string) => {
    setSelectedTradeKey(currentTradeKey); setSelectedTarget(targetId); setSelectedGive([]); setDraftOfferId(undefined); playSound("tap");
    const opened = await act({ action: "frontier-beans-offer", targetId, giveCardIds: [], wants: [] });
    if (!opened) clearTradeUi();
  };
  const updateTradeSelection = (next: string[]) => {
    setSelectedGive(next);
    if (!liveTrade) return;
    setDraftOfferId(liveTrade.id);
    tradeSyncRef.current = tradeSyncRef.current.then(() => onAction({ action: "frontier-beans-update-trade", offerId: liveTrade.id, cardIds: next })).catch((error) => { setNotice(error instanceof Error ? error.message : "거래 카드를 다시 선택해 주세요."); playSound("error"); });
  };
  const toggleGive = (cardId: string) => { const next = selectedTradeIds.includes(cardId) ? selectedTradeIds.filter((id) => id !== cardId) : [...selectedTradeIds, cardId]; updateTradeSelection(next); };
  const canPlantIndex = (fieldIndex: number, type: FrontierBeanType) => { const field = me?.fields[fieldIndex]; return Boolean(field && (field.cards.length === 0 || field.cards[0].type === type)); };
  const plantCard = async (fieldIndex: number, card: FrontierBeanCard, source: DragSource) => { if (!meId) return false; if (!canPlantIndex(fieldIndex, card.type)) { setSelectedHarvestField(fieldIndex); setNotice("다른 종류의 콩이 자라고 있어요. 밭을 먼저 수확한 뒤 심어 주세요."); playSound("error"); return false; } let success = false; if (source === "hand" && state.phase === "plant_hand" && active?.id === meId && me?.hand[0]?.id === card.id) success = await act({ action: "frontier-beans-plant-hand", fieldIndex }); if (source === "received" && state.phase === "plant_received") success = await act({ action: "frontier-beans-plant-received", cardId: card.id, fieldIndex }); if (success) { navigator.vibrate?.(20); setPlantFlash(fieldIndex); window.setTimeout(() => setPlantFlash(undefined), 420); setSelectedPlantCard(undefined); setSelectedHarvestField(undefined); if (source === "received") setSelectedPending(undefined); } return success; };
  const tapField = (fieldIndex: number) => { const front = me?.hand[0]; if (state.phase === "plant_hand" && myPublic?.isActive && front && selectedPlantCard === front.id) void plantCard(fieldIndex, front, "hand"); else if (state.phase === "plant_received" && pendingCard) void plantCard(fieldIndex, pendingCard, "received"); else { setSelectedHarvestField((current) => { const next = current === fieldIndex ? undefined : fieldIndex; if (next !== fieldIndex) setSelectedHarvestInfoField(undefined); return next; }); } };
  const canDrag = (card: FrontierBeanCard, source: DragSource) => { if (working || busy) return false; if (source === "hand" && state.phase === "plant_hand") return active?.id === meId && me?.hand[0]?.id === card.id; if (source === "hand") return state.phase === "trade" && tradeOpen && !myTradeReady; if (source === "revealed") return state.phase === "trade" && tradeOpen && active?.id === meId && !myTradeReady; if (source === "received") return state.phase === "plant_received"; if (source === "trade") return state.phase === "trade" && tradeOpen && !myTradeReady; return false; };
  const finishDrag = async (current: DragState, x: number, y: number) => { const elements = document.elementsFromPoint(x, y); const field = elements.map((element) => element.closest<HTMLElement>("[data-fb-field]")).find(Boolean); const tradeDrop = elements.some((element) => Boolean(element.closest("[data-fb-trade-give]"))); const handDrop = elements.some((element) => Boolean(element.closest("[data-fb-hand]"))); let success = false; if (field && ["hand", "received"].includes(current.source)) success = await plantCard(Number(field.dataset.fbField), current.card, current.source); else if (tradeDrop && ["hand", "revealed"].includes(current.source)) { if (!selectedTradeIds.includes(current.card.id)) toggleGive(current.card.id); success = true; } else if (handDrop && current.source === "trade") { updateTradeSelection(selectedTradeIds.filter((id) => !current.cardIds.includes(id))); success = true; } if (success) navigator.vibrate?.(16); else { navigator.vibrate?.([10, 24, 10]); playSound("error"); } setDragOverField(undefined); };
  const beginDrag = (press: PressState) => {
    if (dragRef.current) return;
    window.clearTimeout(press.timer);
    try { press.target.setPointerCapture(press.pointerId); } catch { /* iOS가 캡처를 거절해도 현재 요소의 포인터 이벤트를 계속 사용한다. */ }
    const next: DragState = { card: press.card, cardIds: press.cardIds, source: press.source, pointerId: press.pointerId, x: press.x, y: press.y };
    dragRef.current = next;
    setDrag(next);
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 500);
    navigator.vibrate?.(8);
  };
  const dragHandlers = (card: FrontierBeanCard, source: DragSource, cardIds = [card.id]) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canDrag(card, source) || (event.pointerType === "mouse" && event.button !== 0)) return;
      dragCleanupRef.current?.();
      const pointerId = event.pointerId;
      const target = event.currentTarget;
      const press: PressState = { card, cardIds, source, pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, target, timer: 0 };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", cancel);
        dragCleanupRef.current = undefined;
      };
      const move = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== pointerId || pressRef.current !== press) return;
        press.x = pointerEvent.clientX;
        press.y = pointerEvent.clientY;
        if (!dragRef.current) {
          const dx = press.x - press.startX;
          const dy = press.y - press.startY;
          const horizontalScroll = source === "hand" && Math.abs(dx) > 18 && Math.abs(dy) < 8;
          if (horizontalScroll) { window.clearTimeout(press.timer); pressRef.current = undefined; cleanup(); return; }
          if (Math.abs(dy) > 8 || Math.abs(dx) > 14) beginDrag(press); else return;
        }
        pointerEvent.preventDefault();
        const next = { ...dragRef.current!, x: pointerEvent.clientX, y: pointerEvent.clientY };
        dragRef.current = next;
        setDrag(next);
        const over = document.elementsFromPoint(pointerEvent.clientX, pointerEvent.clientY).map((element) => element.closest<HTMLElement>("[data-fb-field]")).find(Boolean);
        setDragOverField(over ? Number(over.dataset.fbField) : undefined);
        const hand = handScrollRef.current;
        if (hand && pointerEvent.clientX < 34) hand.scrollLeft -= 9;
        if (hand && pointerEvent.clientX > window.innerWidth - 34) hand.scrollLeft += 9;
      };
      const finish = (pointerEvent: PointerEvent, cancelled: boolean) => {
        if (pointerEvent.pointerId !== pointerId) return;
        window.clearTimeout(press.timer);
        pressRef.current = undefined;
        const current = dragRef.current;
        dragRef.current = undefined;
        setDrag(undefined);
        setDragOverField(undefined);
        cleanup();
        if (current && !cancelled) void finishDrag(current, pointerEvent.clientX, pointerEvent.clientY);
      };
      const end = (pointerEvent: PointerEvent) => finish(pointerEvent, false);
      const cancel = (pointerEvent: PointerEvent) => finish(pointerEvent, true);
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", cancel);
      dragCleanupRef.current = cleanup;
      press.timer = window.setTimeout(() => beginDrag(press), 150);
      pressRef.current = press;
    },
  });
  if (!meId || !me || !myPublic) return <main className="fb3-game"><div className="fb3-loading">농장에 입장하는 중…</div>{overlays}</main>;
  const plantType = drag?.card.type ?? (state.phase === "plant_hand" ? me.hand[0]?.type : pendingCard?.type);
  return <main className={`fb3-game players-${state.players.length} phase-${state.phase} ${tradeOpen ? "trade-open" : ""} ${drag ? "dragging" : ""}`} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
    <img className="fb3-world" src="/frontier-beans/ui-v3/farm-day.png" alt="밝은 농장 마을" draggable={false}/>
    <header className="fb3-hud"><button type="button" className="fb3-room" onClick={() => navigator.clipboard?.writeText(code)}>방 {code}</button><div className="fb3-phase"><b>{PHASE_LABEL[state.phase]}</b><small>{active?.name} 차례</small></div><div><button type="button" onClick={() => setHelp(true)} aria-label="게임 설명">?</button><button type="button" onClick={() => setSettingsOpen((value) => !value)} aria-label="옵션">⚙</button></div></header>
    <section className="fb3-opponents">{opponents.map((player, index) => { const tradeable = state.phase === "trade" && !liveTrade && meId === active?.id; return <PlayerPanel key={player.id} player={player} index={index + 1} active={player.isActive} tradeable={tradeable} onTrade={tradeable ? () => void openTrade(player.id) : undefined}/>; })}</section>
    <section className="fb3-market" aria-label="중앙 카드" data-label="장터"><div className="fb3-pile"><img src="/frontier-beans/card-back.png" alt="뽑기 더미" draggable={false}/><b>{state.drawCount}</b><small>뽑기</small></div><div className="fb3-pile discard">{state.discardTop ? <img src={cardImage(state.discardTop.type)} alt="버린 카드" draggable={false}/> : <span/>}<b>{state.discardCount}</b><small>버림</small></div><div className="fb3-public-cards">{state.revealed.length ? state.revealed.map((card) => <HandCard key={card.id} card={card} compact selected={selectedTradeIds.includes(card.id)} draggable={canDrag(card, "revealed")} onClick={() => { if (suppressClick.current) return; if (state.phase === "trade" && tradeOpen && active?.id === meId && !myTradeReady) toggleGive(card.id); }} {...dragHandlers(card, "revealed")}/>) : <><span>공개 카드</span><span>공개 카드</span></>}</div></section>
    <section className="fb3-self-zone"><div className={`fb3-self-card ${myPublic.isActive ? "active" : ""}`}><img src={farmerImage(0)} alt="내 농부"/><b>{myPublic.name}{isHost ? " ♛" : ""}</b><small><i>●</i>{myPublic.coins}　▤ {myPublic.handCount}</small></div><div className={`fb3-own-fields fields-${me.fields.length}`}>{me.fields.map((field, index) => { const publicField = myPublic.fields[index]; const available = Boolean(plantType && canPlantIndex(index, plantType)); const planting = Boolean(drag || selectedPlantCard || state.phase === "plant_received"); const protectedField = publicField.count === 1 && !me.legalHarvests.includes(index); const fieldOpen = selectedHarvestField === index && publicField.count > 0; const bean = publicField.type ? frontierBeanDefinition(publicField.type) : undefined; const infoOpen = fieldOpen && selectedHarvestInfoField === index; return <div key={index} className={`fb3-own-field ${planting ? (available ? "available" : "blocked") : ""} ${fieldOpen ? "harvest-open" : ""} ${infoOpen ? "info-open" : ""} ${protectedField ? "protected" : ""} ${dragOverField === index ? "near" : ""} ${plantFlash === index ? "planted" : ""}`} data-fb-field={index}><button type="button" disabled={working} onClick={() => tapField(index)}><CropTree type={publicField.type} count={publicField.count}/><b>{publicField.type ? `${frontierBeanDefinition(publicField.type).name} ×${publicField.count}개` : `밭 ${index + 1}`}</b></button>{protectedField && !fieldOpen && <span className="fb3-protected">1장 밭 보호</span>}{fieldOpen && bean && <div className="fb3-field-actions"><button type="button" className="fb3-harvest" disabled={working || protectedField} onClick={async () => { if (protectedField) return; const harvested = await act({ action: "frontier-beans-harvest", fieldIndex: index }); if (harvested) { setSelectedHarvestField(undefined); setSelectedHarvestInfoField(undefined); } }}>{protectedField ? "1장 밭 보호" : "수확하기"}</button><button type="button" className="fb3-harvest-info-toggle" aria-expanded={infoOpen} onClick={() => setSelectedHarvestInfoField((current) => current === index ? undefined : index)}>정보</button>{infoOpen && <div className="fb3-field-harvest-table"><b>{bean.name} 수확표</b>{bean.harvest.map((count, payoutIndex) => <span key={count}><strong>{count}개</strong><i>{payoutIndex + 1}코인</i></span>)}</div>}</div>}</div>; })}</div></section>
    {state.phase === "plant_received" && me.received.length > 0 && <section className="fb3-received"><b>받은 콩 · 모두 심기</b>{me.received.map((card) => <HandCard key={card.id} card={card} compact selected={pendingCard?.id === card.id} draggable onClick={() => setSelectedPending(card.id)} {...dragHandlers(card, "received")}/>)}</section>}
    {tradeOpen && <TradeModal state={state} meId={meId} selectedTarget={effectiveSelectedTarget} selectedGive={selectedTradeIds} room={liveTrade} busy={working || busy} onClose={() => void closeTrade()} onGiveRemove={(ids) => updateTradeSelection(selectedTradeIds.filter((id) => !ids.includes(id)))} onTrade={async () => { if (!liveTrade) return; await tradeSyncRef.current; const otherReady = liveTrade.fromId === meId ? liveTrade.toReady : liveTrade.fromReady; const confirmed = await act({ action: "frontier-beans-confirm-trade", offerId: liveTrade.id }); if (confirmed && otherReady) clearTradeUi(); }} dragHandlers={dragHandlers}/>}
    <section className={`fb3-hand ${state.phase === "plant_received" ? "locked" : ""}`} data-fb-hand="true"><header><b>내 카드</b><span>순서 고정</span>{state.phase === "plant_hand" && myPublic.isActive && state.handPlantsThisTurn > 0 && <button type="button" onClick={() => void act({ action: "frontier-beans-finish-plant" })}>두 번째 안 심기</button>}{state.phase === "trade" && myPublic.isActive && <button type="button" onClick={() => void act({ action: "frontier-beans-end-trade" })}>거래 마치기</button>}</header>{handMoreLeft && <button type="button" className="fb3-hand-arrow left" aria-label="왼쪽 카드 더 보기" onClick={() => handScrollRef.current?.scrollBy({ left: -180, behavior: "smooth" })}>&lt;&lt;</button>}<div className="fb3-hand-scroll" ref={handScrollRef} onScroll={updateHandOverflow}>{me.hand.map((card, index) => <HandCard key={card.id} card={card} flippable mandatory={state.phase === "plant_hand" && myPublic.isActive && index === 0} selected={selectedTradeIds.includes(card.id) || selectedPlantCard === card.id} draggable={canDrag(card, "hand")} onClick={() => { if (suppressClick.current || state.phase === "plant_received") return; if (state.phase === "plant_hand" && myPublic.isActive && index === 0) setSelectedPlantCard((id) => id === card.id ? undefined : card.id); if (state.phase === "trade" && tradeOpen && !myTradeReady) toggleGive(card.id); }} {...dragHandlers(card, "hand")}/>)}</div>{handMoreRight && <button type="button" className="fb3-hand-arrow right" aria-label="오른쪽 카드 더 보기" onClick={() => handScrollRef.current?.scrollBy({ left: 180, behavior: "smooth" })}>&gt;&gt;</button>}</section>
    {drag && <div className="fb3-drag-ghost" style={{ transform: `translate3d(${drag.x - 34}px, ${drag.y - 116}px, 0)` }}><HandCard card={drag.card}/></div>}
    {notice && <div className="fb3-toast" role="status" aria-live="polite" onPointerDown={(event) => { noticeSwipeRef.current = { pointerId: event.pointerId, startY: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerMove={(event) => { const swipe = noticeSwipeRef.current; if (swipe?.pointerId === event.pointerId && event.clientY - swipe.startY < -18) { noticeSwipeRef.current = undefined; setNotice(""); } }} onPointerUp={() => { noticeSwipeRef.current = undefined; }} onPointerCancel={() => { noticeSwipeRef.current = undefined; }}><span>{notice}</span><small>위로 밀어 닫기</small></div>}
    {settingsOpen && <div className="fb3-settings"><button type="button" onClick={() => setMuted((value) => !value)}>{muted ? "소리 켜기" : "소리 끄기"}</button><button type="button" onClick={onLeave}>게임 나가기</button></div>}
    {state.debug && debugUi && <button type="button" className="fb3-debug" onClick={() => setDebugOpen((value) => !value)}>DEBUG</button>}
    {state.debug && debugUi && debugOpen && <div className="fb3-debug-menu">{[["plant","첫 카드"],["trade","거래"],["received","받은 콩"],["protection","보호"],["harvest","수확"],["near-end","종료 직전"],["autoplay","봇 완주"],["reset","초기화"],["players-3","3인"],["players-4","4인"],["players-5","5인"]].map(([scenario, label]) => <button type="button" key={scenario} onClick={() => { setDebugOpen(false); setSelectedHarvestField(undefined); setSelectedHarvestInfoField(undefined); void act({ action: "frontier-beans-debug", scenario }); }}>{label}</button>)}</div>}
    {state.phase === "game_over" && <div className="fb3-result"><section><h2>최종 정산</h2>{state.rankings?.map((rank) => <div key={rank.playerId} className={rank.rank === 1 ? "winner" : ""}><b>{rank.rank}위</b><span>{state.players.find((player) => player.id === rank.playerId)?.name}</span><strong>{rank.coins}코인</strong></div>)}<footer>{isHost && <button type="button" onClick={onLobby}>다른 게임</button>}<button type="button" onClick={onLeave}>나가기</button></footer></section></div>}
    {help && <div className="fb3-help"><section data-fb-allow-y-scroll="true"><button type="button" onClick={() => setHelp(false)}>×</button><h2>게임 설명</h2><p><b>심기</b> 첫 카드는 반드시, 두 번째는 선택해서 심습니다.</p><p><b>거래</b> 현재 턴 농부만 거래를 시작할 수 있습니다.</p><p><b>받은 콩</b> 손패에 넣지 않고 전부 밭에 심습니다.</p><p><b>수확</b> 밭 전체를 수확하며 한 칸 밭 보호 규칙이 적용됩니다.</p><div className="fb3-harvest-guide">{FRONTIER_BEANS.map((bean) => <span key={bean.id}><img src={beanImage(bean.id)} alt=""/><b>{bean.name}</b><small>{bean.harvest.map((amount, index) => `${amount}→${index + 1}`).join(" · ")}</small></span>)}</div></section></div>}
    {overlays}
  </main>;
}
