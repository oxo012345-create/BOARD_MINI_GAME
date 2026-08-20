"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FRONTIER_BEANS,
  frontierBeanDefinition,
  type FrontierBeanCard,
  type FrontierBeanClientPlayer,
  type FrontierBeanClientState,
  type FrontierBeanType,
  type FrontierTradeOffer,
} from "./api/_lib/frontier-beans";
export type { FrontierBeanClientState } from "./api/_lib/frontier-beans";

type Props = {
  code: string;
  meId?: string;
  state: FrontierBeanClientState;
  isHost: boolean;
  busy?: boolean;
  onAction: (payload: Record<string, unknown>) => Promise<unknown>;
  onLobby: () => void;
  onLeave: () => void;
  overlays?: ReactNode;
};

const PHASE_LABEL: Record<FrontierBeanClientState["phase"], string> = {
  plant_hand: "재배 단계",
  trade: "공개 · 거래",
  plant_received: "받은 콩 심기",
  game_over: "최종 정산",
};

const farmerImage = (index: number) => `/frontier-beans/farmer-${(index % 5) + 1}.png`;
const beanImage = (type: FrontierBeanType) => `/frontier-beans/bean-${type}.png`;

function useFrontierSound() {
  const contextRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const ensure = () => {
    if (!contextRef.current) contextRef.current = new AudioContext();
    if (contextRef.current.state === "suspended") void contextRef.current.resume();
    return contextRef.current;
  };
  const play = useCallback((kind: "tap" | "flip" | "draw" | "plant" | "trade" | "harvest" | "turn" | "game_end" | "error") => {
    if (mutedRef.current) return;
    const context = ensure();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "error" ? "sawtooth" : ["harvest", "game_end"].includes(kind) ? "triangle" : "sine";
    const base = kind === "plant" ? 210 : kind === "trade" ? 520 : kind === "harvest" ? 740 : kind === "flip" ? 430 : kind === "draw" ? 290 : kind === "turn" ? 610 : kind === "game_end" ? 660 : kind === "error" ? 110 : 360;
    oscillator.frequency.setValueAtTime(base, context.currentTime);
    if (["trade", "harvest", "turn", "game_end"].includes(kind)) oscillator.frequency.exponentialRampToValueAtTime(kind === "trade" ? 760 : kind === "harvest" ? 980 : kind === "turn" ? 820 : 1100, context.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  }, []);
  const setSoundMuted = useCallback((muted: boolean) => { mutedRef.current = muted; }, []);
  return { play, setMuted: setSoundMuted };
}

function BeanCard({ card, flipped, selected, mandatory, compact, onFlip, onSelect }: {
  card: FrontierBeanCard;
  flipped?: boolean;
  selected?: boolean;
  mandatory?: boolean;
  compact?: boolean;
  onFlip?: () => void;
  onSelect?: () => void;
}) {
  const bean = frontierBeanDefinition(card.type);
  return <div className={`fb-card-wrap ${compact ? "compact" : ""} ${mandatory ? "mandatory" : ""} ${selected ? "selected" : ""}`}>
    <button type="button" className={`fb-card ${flipped ? "flipped" : ""}`} onClick={onFlip} aria-label={`${bean.name} 카드 정보`}>
      <span className="fb-card-face fb-card-front" style={{ "--bean-color": bean.color } as React.CSSProperties}>
        <small>{bean.count}</small><img src={beanImage(card.type)} alt="" draggable={false} /><b>{bean.name}</b>
      </span>
      <span className="fb-card-face fb-card-back">
        <b>수확표</b>{bean.harvest.map((amount, index) => <span key={amount}><strong>{amount}</strong><i>{index + 1}</i></span>)}
      </span>
    </button>
    {onSelect && <button type="button" className="fb-card-marker" onClick={(event) => { event.stopPropagation(); onSelect(); }}>{selected ? "✓" : "+"}</button>}
  </div>;
}

function CropPatch({ type, count }: { type?: FrontierBeanType; count: number }) {
  if (!type || count === 0) return <div className="fb-empty-soil"><span>빈 밭</span></div>;
  const visible = Math.min(8, count);
  return <div className={`fb-crops tier-${Math.min(4, Math.ceil(count / 2))}`}>
    {Array.from({ length: visible }, (_, index) => <img key={index} src={beanImage(type)} alt="" draggable={false} />)}
    {count > 8 && <b>+{count - 8}</b>}
  </div>;
}

function PlayerFarm({ player, index, position, active, target, onTarget }: {
  player: FrontierBeanClientPlayer;
  index: number;
  position: string;
  active: boolean;
  target?: boolean;
  onTarget?: () => void;
}) {
  return <button type="button" className={`fb-player ${position} ${active ? "active" : ""} ${target ? "target" : ""}`} onClick={onTarget} disabled={!onTarget}>
    <img className="fb-farmer" src={farmerImage(index)} alt="" draggable={false} />
    {active && <span className="fb-turn-lamp">턴</span>}
    {target && <span className="fb-handshake">거래</span>}
    <span className="fb-nameplate"><b>{player.name}</b><small><i>●</i> {player.coins} · 패 {player.handCount}</small></span>
    <span className="fb-mini-fields">{player.fields.map((field, fieldIndex) => <i key={fieldIndex} style={{ "--field-color": field.type ? frontierBeanDefinition(field.type).color : "#463725" } as React.CSSProperties}>{field.count || "·"}</i>)}</span>
    {player.receivedCount > 0 && <span className="fb-pending-badge">심기 {player.receivedCount}</span>}
  </button>;
}

function opponentPositions(count: number) {
  if (count === 2) return ["north-west", "north-east"];
  if (count === 3) return ["north-west", "north", "north-east"];
  return ["north-west", "north-east", "mid-west", "mid-east"];
}

function TradeTray({ state, meId, selectedTarget, selectedGive, wantType, wantQuantity, busy, counteringOfferId, onTargetClear, onGiveToggle, onWantType, onWantQuantity, onSend, onRespond, onCounter }: {
  state: FrontierBeanClientState;
  meId: string;
  selectedTarget?: string;
  selectedGive: string[];
  wantType?: FrontierBeanType;
  wantQuantity: number;
  busy?: boolean;
  counteringOfferId?: string;
  onTargetClear: () => void;
  onGiveToggle: (id: string) => void;
  onWantType: (type?: FrontierBeanType) => void;
  onWantQuantity: (value: number) => void;
  onSend: () => void;
  onRespond: (offer: FrontierTradeOffer, accept: boolean) => void;
  onCounter: (offer: FrontierTradeOffer) => void;
}) {
  const incoming = state.offers.find((offer) => offer.status === "pending" && offer.toId === meId && offer.id !== counteringOfferId);
  const proposer = incoming ? state.players.find((player) => player.id === incoming.fromId) : undefined;
  if (incoming) return <section className="fb-trade-tray incoming">
    <header><span>거래 제안</span><b>{proposer?.name ?? "농부"}</b></header>
    <div className="fb-offer-summary"><span>받기 <b>{incoming.giveTypes?.length ? [...new Set(incoming.giveTypes)].map((type) => `${frontierBeanDefinition(type).shortName} ${incoming.giveTypes.filter((candidate) => candidate === type).length}`).join(" · ") : `${incoming.giveCardIds.length}장`}</b></span><i>↔</i><span>주기 <b>{incoming.wants.length ? incoming.wants.map((want) => `${frontierBeanDefinition(want.type).shortName} ${want.quantity}`).join(" · ") : "없음"}</b></span></div>
    <div className="fb-trade-actions"><button type="button" onClick={() => onRespond(incoming, false)}>거절</button><button type="button" className="counter" onClick={() => onCounter(incoming)}>역제안</button><button type="button" className="accept" disabled={busy} onClick={() => onRespond(incoming, true)}>수락</button></div>
  </section>;
  if (!selectedTarget) return <div className="fb-trade-hint">빛나는 농부를 눌러 거래하세요</div>;
  const target = state.players.find((player) => player.id === selectedTarget);
  return <section className="fb-trade-tray">
    <header><button type="button" onClick={onTargetClear}>‹</button><span>{target?.name}와 거래</span><b>{selectedGive.length}장 선택</b></header>
    <div className="fb-trade-give"><small>내가 줌</small><div>{state.me?.hand.map((card) => <button key={card.id} type="button" className={selectedGive.includes(card.id) ? "selected" : ""} onClick={() => onGiveToggle(card.id)}><img src={beanImage(card.type)} alt=""/><span>{frontierBeanDefinition(card.type).shortName}</span></button>)}{state.revealed.map((card) => <button key={card.id} type="button" className={selectedGive.includes(card.id) ? "selected" : ""} onClick={() => onGiveToggle(card.id)}><img src={beanImage(card.type)} alt=""/><span>공개 {frontierBeanDefinition(card.type).shortName}</span></button>)}</div></div>
    <div className="fb-trade-want"><small>내가 원함</small><div className="fb-bean-wheel"><button type="button" className={!wantType ? "selected" : ""} onClick={() => onWantType(undefined)}>선물</button>{FRONTIER_BEANS.map((bean) => <button key={bean.id} type="button" className={wantType === bean.id ? "selected" : ""} onClick={() => onWantType(bean.id)}><img src={beanImage(bean.id)} alt=""/></button>)}</div>{wantType && <div className="fb-quantity"><button type="button" onClick={() => onWantQuantity(Math.max(1, wantQuantity - 1))}>−</button><b>{wantQuantity}장</b><button type="button" onClick={() => onWantQuantity(Math.min(5, wantQuantity + 1))}>+</button></div>}</div>
    <button type="button" className="fb-send-offer" disabled={!selectedGive.length || busy} onClick={onSend}>제안 보내기</button>
  </section>;
}

export function FrontierBeansBriefing({ playerCount, debugPlayers, isHost, busy, onDebugPlayers, onStart, topBar, overlays }: {
  playerCount: number;
  debugPlayers?: number;
  isHost: boolean;
  busy?: boolean;
  onDebugPlayers: (count: number) => void;
  onStart: () => void;
  topBar: ReactNode;
  overlays?: ReactNode;
}) {
  const shownCount = debugPlayers ?? playerCount;
  const valid = shownCount >= 3 && shownCount <= 5;
  return <main className="fb-briefing">
    {topBar}
    <div className="fb-briefing-scene">
      <div className="fb-briefing-title"><small>WESTERN FARM TRADING</small><h1>황혼의 콩시장</h1><p>앞에서 심고 · 원하는 콩을 거래하고 · 밭을 수확하세요</p></div>
      <div className="fb-rule-plank"><span><b>1</b>맨 앞 카드 필수</span><span><b>2</b>공개콩 2장 거래</span><span><b>3</b>받은 콩 전부 심기</span><span><b>4</b>세 번째 덱 뒤 정산</span></div>
      <div className="fb-briefing-note"><strong>3인 밭 3개 · 4~5인 밭 2개</strong><small>손패 순서는 바꿀 수 없고, 한 칸 밭은 다른 밭에 2장 이상 있을 때 보호됩니다.</small></div>
      {debugPlayers && <div className="fb-debug-picker"><b>혼자 디버깅</b>{[3, 4, 5].map((count) => <button key={count} className={debugPlayers === count ? "active" : ""} onClick={() => onDebugPlayers(count)}>{count}인</button>)}</div>}
    </div>
    <div className="fb-briefing-action">{isHost ? <button type="button" disabled={!valid || busy} onClick={onStart}>{valid ? "장터 열기" : "3~5명이 필요해요"}</button> : <span>방장이 장터를 준비하고 있어요</span>}</div>
    {overlays}
  </main>;
}

export function FrontierBeansGame({ code, meId, state, isHost, busy, onAction, onLobby, onLeave, overlays }: Props) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [selectedTarget, setSelectedTarget] = useState<string>();
  const [selectedGive, setSelectedGive] = useState<string[]>([]);
  const [wantType, setWantType] = useState<FrontierBeanType>();
  const [wantQuantity, setWantQuantity] = useState(1);
  const [selectedPending, setSelectedPending] = useState<string>();
  const [counteringOfferId, setCounteringOfferId] = useState<string>();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(false);
  const [help, setHelp] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const { play: playSound, setMuted: setSoundMuted } = useFrontierSound();
  const me = state.me;
  const myPublic = state.players.find((player) => player.id === meId);
  const opponents = state.players.filter((player) => player.id !== meId);
  const positions = opponentPositions(opponents.length);
  const active = state.players.find((player) => player.isActive);
  const pendingCard = me?.received.find((card) => card.id === selectedPending) ?? me?.received[0];
  const canTarget = state.phase === "trade";

  useEffect(() => { setSoundMuted(muted); }, [muted, setSoundMuted]);
  useEffect(() => {
    if (!state.lastEvent) return;
    if (state.lastEvent.kind === "plant") playSound("plant");
    if (state.lastEvent.kind === "trade") playSound("trade");
    if (state.lastEvent.kind === "harvest") playSound("harvest");
    if (state.lastEvent.kind === "reveal" || state.lastEvent.kind === "draw") playSound("draw");
    if (state.lastEvent.kind === "turn") playSound("turn");
    if (state.lastEvent.kind === "game_over") playSound("game_end");
    const showTimer = window.setTimeout(() => setNotice(state.lastEvent?.text ?? ""), 0);
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(timer); };
  }, [playSound, state.lastEvent]);

  const act = async (payload: Record<string, unknown>) => {
    if (working || busy) return;
    setWorking(true);
    try { await onAction(payload); }
    catch (error) { setNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); playSound("error"); }
    finally { setWorking(false); }
  };
  const flip = (cardId: string) => { playSound("flip"); setFlipped((current) => { const next = new Set(current); if (next.has(cardId)) next.delete(cardId); else next.add(cardId); return next; }); };
  const toggleGive = (cardId: string) => setSelectedGive((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  const plantField = (fieldIndex: number) => {
    if (!meId) return;
    if (state.phase === "plant_hand" && active?.id === meId) void act({ action: "frontier-beans-plant-hand", fieldIndex });
    else if (state.phase === "plant_received" && pendingCard) void act({ action: "frontier-beans-plant-received", cardId: pendingCard.id, fieldIndex });
  };
  const respond = (offer: FrontierTradeOffer, accept: boolean) => {
    if (!accept) return void act({ action: "frontier-beans-reject", offerId: offer.id });
    const available = [...(me?.hand ?? []), ...(active?.id === meId ? state.revealed : [])];
    const chosen: string[] = [];
    for (const want of offer.wants) chosen.push(...available.filter((card) => card.type === want.type && !chosen.includes(card.id)).slice(0, want.quantity).map((card) => card.id));
    void act({ action: "frontier-beans-accept", offerId: offer.id, returnCardIds: chosen });
  };
  const counterOffer = (offer: FrontierTradeOffer) => {
    const available = me?.hand ?? [];
    const preselected: string[] = [];
    for (const want of offer.wants) preselected.push(...available.filter((card) => card.type === want.type && !preselected.includes(card.id)).slice(0, want.quantity).map((card) => card.id));
    const wantedType = offer.giveTypes?.[0];
    const wantedQuantity = wantedType ? offer.giveTypes.filter((type) => type === wantedType).length : 1;
    setSelectedTarget(offer.fromId);
    setSelectedGive(preselected);
    setWantType(wantedType);
    setWantQuantity(Math.max(1, wantedQuantity));
    setCounteringOfferId(offer.id);
    playSound("tap");
  };

  if (!meId || !me || !myPublic) return <main className="fb-game"><div className="fb-loading">장터에 입장하는 중…</div>{overlays}</main>;
  return <main className={`fb-game phase-${state.phase}`}>
    <img className="fb-world" src="/frontier-beans/market-dusk.png" alt="황혼의 서부 장터" draggable={false}/>
    <header className="fb-hud"><button type="button" className="fb-code" onClick={() => navigator.clipboard?.writeText(code)}><small>방 코드</small><b>{code}</b></button><div className="fb-phase"><small>ROUND {state.round}</small><b>{PHASE_LABEL[state.phase]}</b><span>{active?.name}</span></div><div className="fb-hud-actions"><button type="button" onClick={() => setHelp(true)}>?</button><button type="button" onClick={() => setMuted((value) => !value)}>{muted ? "×" : "♪"}</button><button type="button" onClick={onLeave}>↗</button></div></header>
    <div className="fb-deck-status"><span>덱 {state.drawCount}</span><i>{state.exhaustionCount}/3</i><span>버림 {state.discardCount}</span></div>
    {opponents.map((player, index) => <PlayerFarm key={player.id} player={player} index={index + 1} position={positions[index]} active={player.isActive} target={selectedTarget === player.id} onTarget={canTarget && (player.id === active?.id || meId === active?.id) ? () => { setSelectedTarget(player.id); playSound("tap"); } : undefined}/>) }
    <section className="fb-market" aria-label="중앙 장터">
      <div className="fb-pile draw"><img src="/frontier-beans/card-back.png" alt=""/><b>{state.drawCount}</b><small>뽑기</small></div>
      <div className="fb-pile discard">{state.discardTop ? <img src={beanImage(state.discardTop.type)} alt=""/> : <span/>}<b>{state.discardCount}</b><small>버림</small></div>
      <div className="fb-revealed">{state.revealed.length ? state.revealed.map((card) => <BeanCard key={card.id} card={card} compact flipped={flipped.has(card.id)} selected={selectedGive.includes(card.id)} onFlip={() => flip(card.id)} onSelect={state.phase === "trade" && active?.id === meId ? () => toggleGive(card.id) : undefined}/>) : <span className="fb-market-empty">공개 카드 대기</span>}</div>
    </section>
    <section className="fb-self">
      <img className="fb-self-farmer" src={farmerImage(0)} alt="내 농부" draggable={false}/>
      <div className={`fb-self-name ${myPublic.isActive ? "active" : ""}`}><b>{myPublic.name}</b><span>● {myPublic.coins} · 패 {myPublic.handCount}</span></div>
      <div className={`fb-own-fields fields-${me.fields.length}`}>{me.fields.map((field, index) => {
        const publicField = myPublic.fields[index];
        const canPlant = (state.phase === "plant_hand" && myPublic.isActive) || (state.phase === "plant_received" && Boolean(pendingCard));
        return <div className={`fb-field ${canPlant ? "plantable" : ""}`} key={index}>
          <button type="button" className="fb-field-ground" disabled={!canPlant || working} onClick={() => plantField(index)}><CropPatch type={publicField.type} count={publicField.count}/><span>{publicField.type ? `${frontierBeanDefinition(publicField.type).shortName} ×${publicField.count}` : `밭 ${index + 1}`}</span></button>
          {publicField.count > 0 && <button type="button" className="fb-harvest" disabled={!me.legalHarvests.includes(index) || working} onClick={() => void act({ action: "frontier-beans-harvest", fieldIndex: index })}>수확</button>}
        </div>;
      })}</div>
    </section>
    {state.phase === "plant_received" && me.received.length > 0 && <div className="fb-received-queue"><small>반드시 모두 심기</small>{me.received.map((card) => <button type="button" key={card.id} className={(pendingCard?.id === card.id) ? "selected" : ""} onClick={() => setSelectedPending(card.id)}><img src={beanImage(card.type)} alt=""/><b>{frontierBeanDefinition(card.type).shortName}</b></button>)}</div>}
    {state.phase === "trade" && <TradeTray
      state={state}
      meId={meId}
      selectedTarget={selectedTarget}
      selectedGive={selectedGive}
      wantType={wantType}
      wantQuantity={wantQuantity}
      busy={working || busy}
      counteringOfferId={counteringOfferId}
      onTargetClear={() => { setSelectedTarget(undefined); setCounteringOfferId(undefined); }}
      onGiveToggle={toggleGive}
      onWantType={setWantType}
      onWantQuantity={setWantQuantity}
      onSend={() => {
        if (!selectedTarget) return;
        void act({ action: "frontier-beans-offer", targetId: selectedTarget, giveCardIds: selectedGive, wants: wantType ? [{ type: wantType, quantity: wantQuantity }] : [] });
        setSelectedGive([]);
        setCounteringOfferId(undefined);
      }}
      onRespond={respond}
      onCounter={counterOffer}
    />}
    <section className={`fb-hand ${state.phase === "plant_received" ? "dimmed" : ""}`} aria-label="내 손패">
      <div className="fb-hand-label"><span>내 손패 · 순서 고정</span>{state.phase === "plant_hand" && myPublic.isActive && state.handPlantsThisTurn > 0 && <button type="button" onClick={() => void act({ action: "frontier-beans-finish-plant" })}>두 번째 카드 안 심기</button>}{state.phase === "trade" && myPublic.isActive && <button type="button" onClick={() => void act({ action: "frontier-beans-end-trade" })}>거래 마치기</button>}</div>
      <div className="fb-hand-cards">{me.hand.map((card, index) => <BeanCard key={card.id} card={card} flipped={flipped.has(card.id)} mandatory={state.phase === "plant_hand" && myPublic.isActive && index === 0} selected={selectedGive.includes(card.id)} onFlip={() => flip(card.id)} onSelect={state.phase === "trade" ? () => toggleGive(card.id) : undefined}/>)}</div>
    </section>
    {state.debug && <button type="button" className="fb-debug-toggle" onClick={() => setDebugOpen((value) => !value)}>DEBUG</button>}
    {state.debug && debugOpen && <div className="fb-debug-menu"><header><b>QA 장면</b><button type="button" onClick={() => setDebugOpen(false)}>×</button></header>{[
      ["plant", "첫 카드 심기"],
      ["trade", "공개·거래"],
      ["received", "받은 콩"],
      ["protection", "1/6 보호"],
      ["harvest", "수확"],
      ["near-end", "종료 직전"],
      ["autoplay", "봇 완주"],
      ["reset", "처음부터"],
      ["players-3", "3인 전환"],
      ["players-4", "4인 전환"],
      ["players-5", "5인 전환"],
    ].map(([scenario, label]) => <button type="button" key={scenario} disabled={working} onClick={() => { setDebugOpen(false); void act({ action: "frontier-beans-debug", scenario }); }}>{label}</button>)}</div>}
    {notice && <div className="fb-toast">{notice}</div>}
    {state.phase === "game_over" && <div className="fb-result"><div className="fb-result-board"><small>MARKET CLOSED</small><h2>황혼의 최종 정산</h2>{state.rankings?.map((rank) => { const player = state.players.find((candidate) => candidate.id === rank.playerId); return <div key={rank.playerId} className={rank.rank === 1 ? "winner" : ""}><b>{rank.rank}</b><span>{player?.name}</span><strong>{rank.coins} 코인</strong></div>; })}<div className="fb-result-actions">{isHost && <button type="button" onClick={onLobby}>다른 게임</button>}<button type="button" onClick={onLeave}>나가기</button></div></div></div>}
    {help && <div className="fb-help"><section><button type="button" onClick={() => setHelp(false)}>×</button><small>HOW TO PLAY</small><h2>황혼의 콩시장</h2><p><b>1.</b> 내 턴에는 손패 맨 앞을 반드시 심고, 다음 한 장은 선택합니다.</p><p><b>2.</b> 공개콩 2장과 손패 어디든 거래할 수 있지만 현재 턴 농부가 꼭 포함됩니다.</p><p><b>3.</b> 거래받은 콩과 남은 공개콩은 손패에 넣지 않고 모두 심습니다.</p><p><b>4.</b> 수확은 언제든 가능하며 밭 전체를 수확합니다. 다른 밭에 2장 이상 있으면 한 칸 밭은 보호됩니다.</p><p><b>5.</b> 덱이 세 번째로 끝나면 밭을 자동 수확하고 코인이 가장 많은 농부가 승리합니다.</p></section></div>}
    {overlays}
  </main>;
}
