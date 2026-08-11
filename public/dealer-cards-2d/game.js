import { createGameBoard } from "./game-board.js?v=2";
import { applyDebugAction, createDebugState, DEBUG_PHASES, DEBUG_SCENARIOS, transitionDebugPhase } from "./debug-fixtures.js?v=3";
import { mountDebugPanel } from "./debug-panel.js?v=1";

const query = new URLSearchParams(location.search);
const debugMode = query.get("debug") === "1";
const roomCode = query.get("room")?.replace(/\D/g, "").slice(0, 4) || "";
const $ = (id) => document.getElementById(id);
const ui = {
  round: $("round"), phase: $("phase"), timer: $("timer"), timerLabel: $("timer-label"), cash: $("cash"), seats: $("seats"), hudMenu: $("hud-menu"),
  lotStage: $("lot-stage"), lotCard: $("lot-card"), seller: $("seller"), itemImage: $("item-image"), itemModel: $("item-model"), itemName: $("item-name"),
  itemOriginal: $("item-original"), itemEra: $("item-era"), lotNumber: $("lot-number"), bid: $("bid"), highest: $("highest"), dossier: $("private-dossier"), lotActions: $("lot-actions"),
  value: $("true-value"), clauses: $("clauses"), notice: $("notice"), content: $("content"), sheetScroll: $("sheet-scroll"), sheetBackdrop: $("sheet-backdrop"), sheetClose: $("sheet-close"),
  itemCount: $("item-count"), cardCount: $("card-count"), loading: $("loading-state"), loadingTitle: $("loading-title"), loadingDetail: $("loading-detail"), loadingRetry: $("loading-retry"), actionBanner: $("action-banner"), stageAction: $("stage-action"), actionToast: $("action-toast"),
};
const gameBoard = createGameBoard($("game-board-canvas"));
window.addEventListener("pagehide", () => {
  gameBoard.destroy();
  if (syncTimer) window.clearTimeout(syncTimer);
}, { once: true });

let room = null;
let dealer = null;
let tab = "game";
let menuOpen = false;
// Keep the sheet closed during the initial room fetch. This prevents a
// connection retry state from flashing a full menu over the board.
document.body.dataset.menu = "closed";
let busy = false;
let lastRevision = -1;
let serverOffset = 0;
let lastRenderedPhase = null;
let syncTimer = null;
let syncInFlight = false;
let nextSyncDelay = 1800;
let syncGeneration = 0;
let debugState = null;
let debugScenario = DEBUG_SCENARIOS.some((item) => item.id === query.get("case")) ? query.get("case") : "select";
let debugPlayerCount = Math.min(8, Math.max(1, Number(query.get("players")) || 4));
let debugPanel = null;
let timerExpired = false;
let toastTimer = null;
let lastMenuButton = null;
let preloadedItemId = null;
let lotModelItemId = null;

function clearLotModel() {
  if (!ui.itemModel) return;
  const wrap = ui.itemModel.closest(".item-render-wrap");
  ui.itemModel.removeAttribute("src");
  ui.itemModel.removeAttribute("poster");
  ui.itemModel.alt = "경매 물건 3D 모델";
  if (wrap) wrap.dataset.modelState = "fallback";
  lotModelItemId = null;
}

function renderLotModel(item) {
  if (!ui.itemModel || !item) return;
  const wrap = ui.itemModel.closest(".item-render-wrap");
  const src = lotModelSrc(item.id);
  if (!wrap || !src) {
    clearLotModel();
    return;
  }
  const state = wrap.dataset.modelState || "fallback";
  if (lotModelItemId === item.id && ui.itemModel.getAttribute("src") === src && state !== "error") return;
  lotModelItemId = item.id;
  wrap.dataset.modelState = "loading";
  ui.itemModel.alt = `${itemName(item)} 3D 모델`;
  // Use attributes rather than only the JS properties. This keeps the URL
  // attached through model-viewer's upgrade/reveal lifecycle on mobile.
  ui.itemModel.setAttribute("poster", lotItemSrc(item.id));
  ui.itemModel.setAttribute("src", src);
}

ui.itemModel?.addEventListener("load", () => {
  const wrap = ui.itemModel.closest(".item-render-wrap");
  // model-viewer can emit an initial load event while no source is attached.
  // Never hide the fallback image for that empty state.
  if (wrap && ui.itemModel.getAttribute("src") && ui.itemModel.loaded !== false) {
    wrap.dataset.modelState = "ready";
  }
});
ui.itemModel?.addEventListener("error", () => {
  const wrap = ui.itemModel.closest(".item-render-wrap");
  if (wrap && ui.itemModel.getAttribute("src")) wrap.dataset.modelState = "error";
});

function clearStaleView() {
  if (menuOpen) closeSheet();
  ui.round.textContent = "ROUND —";
  ui.phase.textContent = "대기 중";
  if (ui.timerLabel) ui.timerLabel.textContent = "연결 중";
  ui.timer.textContent = "--:--";
  ui.cash.textContent = "—";
  ui.seats.innerHTML = "";
  ui.seats.removeAttribute("data-count");
  ui.lotStage.hidden = true;
  clearLotModel();
  ui.dossier.hidden = true;
  ui.lotActions.hidden = true;
  ui.lotActions.innerHTML = "";
  ui.content.innerHTML = "";
  ui.stageAction.hidden = true;
  document.body.dataset.timeCritical = "false";
  document.body.dataset.phase = "waiting";
  gameBoard.setPhase("waiting");
}

function showLoading(title = "게임 정보를 불러오는 중…", detail = "방장이 시작 버튼을 누르면 게임이 시작됩니다.", mode = "loading") {
  document.body.dataset.loaded = "false";
  document.body.dataset.appState = mode;
  if (ui.loadingTitle) ui.loadingTitle.textContent = title;
  if (ui.loadingDetail) ui.loadingDetail.textContent = detail;
  if (ui.loadingRetry) ui.loadingRetry.hidden = mode !== "error";
  if (mode === "waiting" || mode === "error") clearStaleView();
}

function hideLoading() {
  document.body.dataset.loaded = "true";
  document.body.dataset.appState = "ready";
  if (ui.loadingRetry) ui.loadingRetry.hidden = true;
}

const timerLabels = {
  select: "선택 마감",
  auction: "경매 마감",
  resolution: "결과 확인",
  shop: "상점 마감",
  finished: "최종 결과",
};
const phaseGuidance = {
  select: "출품할 물건을 고르고 다른 딜러의 선택을 기다리세요.",
  auction: "판매자의 설명을 듣고 원하는 순간에 호가하세요.",
  resolution: "낙찰 결과와 공개된 조항을 확인하세요.",
  shop: "전략패를 구입하거나 리롤한 뒤 다음 라운드를 준비하세요.",
  finished: "컬렉션을 정산하고 최종 보유금을 확인하세요.",
};

function updatePhaseMeta() {
  const phase = dealer?.phase;
  const label = timerLabels[phase] || "남은 시간";
  if (ui.timerLabel) ui.timerLabel.textContent = label;
  ui.timer?.setAttribute("aria-label", `${label} ${ui.timer?.textContent || ""}`);
  document.body.dataset.seller = dealer && dealer.sellerId === me() ? "true" : "false";
  document.body.dataset.guidance = phaseGuidance[phase] || "";
}

function preloadItem(item) {
  if (!item || item.id === preloadedItemId) return;
  preloadedItemId = item.id;
  const image = new Image();
  image.decoding = "async";
  image.src = lotItemSrc(item.id);
}

function showToast(message, tone = "info") {
  if (!ui.actionToast || !message) return;
  if (toastTimer) window.clearTimeout(toastTimer);
  ui.actionToast.textContent = message;
  ui.actionToast.dataset.tone = tone;
  ui.actionToast.hidden = false;
  requestAnimationFrame(() => ui.actionToast?.classList.add("visible"));
  toastTimer = window.setTimeout(() => {
    ui.actionToast?.classList.remove("visible");
    window.setTimeout(() => { if (ui.actionToast) ui.actionToast.hidden = true; }, 180);
  }, tone === "error" ? 4200 : 2600);
}

function actionSuccessMessage(action) {
  if (action === "dealer-select") return "출품 선택 완료 · 다른 딜러의 선택을 기다립니다.";
  if (action === "dealer-bid") return `입찰 완료 · 현재 ${knownMoney(dealer?.currentBid, money(startingBidAmount()))}${dealer?.highestBidderId === me() ? " · 최고 입찰" : ""}`;
  if (action === "dealer-use-card") return "전략패 사용 완료 · 효과가 적용되었습니다.";
  if (action === "dealer-reroll") return "상점 목록을 새로 고쳤습니다.";
  if (action === "dealer-buy-card") return "전략패를 소장품에 추가했습니다.";
  if (action === "dealer-checkout") return "컬렉션 정산을 완료했습니다.";
  return "처리가 완료되었습니다.";
}

function phaseTransitionMessage(phase) {
  if (phase === "select") return "새 라운드가 열렸습니다. 출품할 물건을 선택하세요.";
  if (phase === "auction") return "경매가 시작되었습니다. 아이템을 살펴보고 입찰하세요.";
  if (phase === "resolution") return "경매가 마감되었습니다. 낙찰 결과를 확인하세요.";
  if (phase === "shop") return "라운드 상점이 열렸습니다. 전략패를 준비하세요.";
  if (phase === "finished") return "모든 라운드가 끝났습니다. 최종 결과를 확인하세요.";
  return "게임 단계가 변경되었습니다.";
}

function phaseExpired(phase = dealer?.phase) {
  return Boolean(dealer && phase && dealer.phase === phase && dealer.deadline > 0 && Date.now() + serverOffset >= dealer.deadline);
}

function actionBlockedByDeadline(action) {
  if (action === "dealer-select") return phaseExpired("select");
  if (["dealer-bid", "dealer-use-card"].includes(action)) return phaseExpired("auction");
  if (["dealer-reroll", "dealer-buy-card", "dealer-checkout"].includes(action)) return phaseExpired("shop");
  return false;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function applyRoomSnapshot(nextRoom, { force = false } = {}) {
  if (!nextRoom) return false;
  const incomingRevision = Number(nextRoom.revision ?? -1);
  if (!force && incomingRevision < lastRevision) return false;
  room = nextRoom;
  serverOffset = Number(room.serverNow || Date.now()) - Date.now();
  dealer = room.game?.dealer;
  if (incomingRevision >= lastRevision) lastRevision = incomingRevision;
  return true;
}

function updateDebugUrl() {
  if (!debugMode) return;
  const url = new URL(location.href);
  url.searchParams.set("debug", "1");
  url.searchParams.set("case", debugScenario);
  url.searchParams.set("players", String(debugPlayerCount));
  history.replaceState(null, "", url);
}

function debugSummary() {
  if (!dealer) return `대기 · ${debugPlayerCount}명 · 방장 시작 전`;
  const phase = DEBUG_PHASES.find((item) => item.id === dealer.phase)?.label || dealer.phase;
  return `${phase} · ${room?.players.length || debugPlayerCount}명 · ${dealer.sellerId === room?.meId ? "판매자 시점" : "입찰자 시점"}`;
}

function syncDebugPanel() {
  debugPanel?.update(debugSummary());
}

function applyDebugSnapshot(nextState, { resetPhase = false } = {}) {
  const previousPhase = dealer?.phase || null;
  debugState = nextState;
  room = nextState?.room || null;
  dealer = nextState?.dealer || null;
  serverOffset = 0;
  lastRevision = room?.revision ?? -1;
  lastRenderedPhase = resetPhase || previousPhase !== dealer?.phase ? null : dealer?.phase || null;
  if (!dealer) {
    closeSheet();
    showLoading("게임 정보를 불러오는 중…", "방장이 로비에서 시작 버튼을 누르면 물건 선택 단계가 열립니다.", "waiting");
  } else {
    hideLoading();
    render();
  }
  syncDebugPanel();
}

function bootDebugMode() {
  if (!debugMode) return;
  document.body.dataset.debug = "true";
  applyDebugSnapshot(createDebugState(debugScenario, debugPlayerCount), { resetPhase: true });
}

function setDebugScenario(nextScenario) {
  if (!debugMode) return;
  debugScenario = DEBUG_SCENARIOS.some((item) => item.id === nextScenario) ? nextScenario : "select";
  updateDebugUrl();
  applyDebugSnapshot(createDebugState(debugScenario, debugPlayerCount), { resetPhase: true });
  debugPanel?.setScenario(debugScenario);
}

function setDebugPlayerCount(nextCount) {
  if (!debugMode) return;
  debugPlayerCount = Math.min(8, Math.max(1, Number(nextCount) || 4));
  updateDebugUrl();
  applyDebugSnapshot(createDebugState(debugScenario, debugPlayerCount), { resetPhase: true });
  debugPanel?.setPlayerCount(debugPlayerCount);
}

function setDebugPhase(nextPhase) {
  if (!debugMode) return;
  if (!debugState?.dealer) debugState = createDebugState("select", debugPlayerCount);
  updateDebugUrl();
  applyDebugSnapshot(transitionDebugPhase(debugState, nextPhase), { resetPhase: true });
}

function runDebugAction(action) {
  if (!debugMode) return;
  if (action === "open-sheet") {
    tab = "game";
    menuOpen = true;
    syncDockButtons();
    renderTab();
    syncDebugPanel();
    return;
  }
  if (action === "close-sheet") {
    closeSheet();
    syncDebugPanel();
    return;
  }
  if (action === "reset") {
    setDebugScenario(debugScenario);
    return;
  }
  if (!debugState?.dealer) return;
  applyDebugSnapshot(applyDebugAction(debugState, action));
}

showLoading();

function syncDockButtons() {
  document.querySelectorAll(".dock button").forEach((button) => {
    // The auction board is the underlying screen now, so only an open
    // utility panel receives the active treatment in the three-item dock.
    const active = menuOpen && button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-expanded", active && menuOpen ? "true" : "false");
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const hudMenuActive = menuOpen && tab === "rules";
  ui.hudMenu?.setAttribute("aria-expanded", hudMenuActive ? "true" : "false");
  ui.hudMenu?.setAttribute("aria-label", hudMenuActive ? "정부 메뉴 닫기" : "정부 메뉴 열기");
  renderStageAction();
}

function closeSheet() {
  menuOpen = false;
  document.body.dataset.menu = "closed";
  ui.sheetBackdrop?.setAttribute("aria-hidden", "true");
  syncDockButtons();
  const returnButton = lastMenuButton;
  if (returnButton && document.contains(returnButton)) {
    window.setTimeout(() => returnButton.focus({ preventScroll: true }), 0);
  }
}

function syncActionBanner() {
  if (!ui.actionBanner) return;
  const ready = document.body.dataset.appState === "ready" && !menuOpen;
  const lotVisible = Boolean(ui.lotActions && !ui.lotActions.hidden && ui.lotActions.innerHTML.trim());
  const stageVisible = Boolean(ui.stageAction && !ui.stageAction.hidden && ui.stageAction.textContent.trim());
  ui.actionBanner.dataset.visible = ready && (lotVisible || stageVisible) ? "true" : "false";
}

function renderStageAction() {
  if (!ui.stageAction) {
    syncActionBanner();
    return;
  }
  const phase = dealer?.phase;
  const labels = { resolution: "낙찰 결과 보기", shop: "상점 열기", finished: "최종 결과 보기" };
  const label = labels[phase];
  ui.stageAction.hidden = !label || menuOpen || document.body.dataset.appState !== "ready";
  if (!label) {
    syncActionBanner();
    return;
  }
  ui.stageAction.textContent = label;
  ui.stageAction.setAttribute("aria-label", `${label} 팝업 열기`);
  ui.stageAction.onclick = () => {
    tab = "game";
    menuOpen = true;
    syncDockButtons();
    renderTab();
  };
  syncActionBanner();
}

const money = (value) => `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
const phaseNames = { select: "자산 심사", auction: "정부 공개 경매", resolution: "낙찰 승인", shop: "정책 거래소", finished: "최종 정부" };
const playerColors = ["#2d665b", "#8c2834", "#b98232", "#385f79", "#6c4c75", "#9a5429", "#61733d", "#6b6256"];
const itemFiles = [
  "00-golden-cross.webp", "01-golden-egg.webp", "02-coffee-mug.webp", "03-gold-medal.webp", "04-silver-medal.webp",
  "05-m1-helmet.webp", "06-antique-vase.webp", "07-retro-monitor.webp", "08-guitar.webp", "09-rocket-launcher.webp",
  "10-model-ship.webp", "11-old-chest.webp", "12-flower-pot.webp", "13-charcoal-iron.webp", "14-cithara.webp",
  "15-crown.webp", "16-ea-nasir-copper.webp", "17-golden-key.webp", "18-folding-fan.webp", "19-geiger-counter.webp",
  "20-hour-glass.webp", "21-katana.webp", "22-sword.webp", "23-sealed-scroll.webp", "24-pistol.webp",
  "25-chariot-wheel.webp", "26-roman-sandals.webp", "27-viking-helmet.webp", "28-vintage-typewriter.webp",
];
const itemModelFiles = [
  "ornate_gold_cross", "imperial_jeweled_egg", "ceramic_mug", "gold_medal", "silver_medal",
  "m1_style_helmet", "antique_amphora", "retro_crt_monitor", "acoustic_guitar", "vintage_launcher_prop",
  "historical_model_ship", "antique_treasure_chest", "potted_plant", "antique_charcoal_iron", "lyre",
  "royal_crown", "ancient_copper_ingot", "ornate_golden_key", "open_folding_fan", "vintage_geiger_counter",
  "antique_hourglass", "sheathed_katana", "medieval_sword", "rolled_scroll", "vintage_pistol_prop",
  "wooden_wagon_wheel", "roman_sandals_pair", "viking_helmet", "vintage_typewriter",
];
const itemKoreanNames = [
  "황금 성십자가", "황금 보석 알", "한 잔의 커피", "금성 훈장", "은성 훈장", "M1 철모", "고대 로마 항아리",
  "레트로 모니터", "빈티지 기타", "대전차 로켓 발사기", "빅토리아 범선 모형", "중세 보물 상자", "테라코타 화분",
  "석탄 다리미", "고대 키타라", "왕실 보석 왕관", "에아나시르의 구리", "빅토리아 황금 열쇠", "실크 접이식 부채",
  "가이거 계수기", "황동 모래시계", "검은 칠 카타나", "중세 장검", "봉인된 두루마리", "1940년대 권총",
  "로마 전차 바퀴", "로마 가죽 샌들", "바이킹 투구", "빈티지 타자기",
];
const clauseText = [
  "총액 $500 초과 시 +$100", "시장 판매가 +10%", "시장 판매가 +30%", "리롤마다 가치 +10%", "카드마다 가치 +10%",
  "빈 카드칸마다 가치 +10%", "33% 3배 / 실패 1/3", "전체 가격 보너스 +15%", "모든 시대 와일드카드", "1라운드 판매 잠금",
  "구매자 카드 사용 잠금", "판매자 카드 사용 잠금", "구매자 무작위 카드 제거", "판매자 무작위 카드 제거", "7경매 후 복사 귀환",
  "-$250 시작·입찰마다 +$50", "경매마다 시대 변경", "카드 전부 환전", "매 라운드 ±$150", "라운드마다 -$100",
  "수익을 무작위 참가자와 분배", "아이템 수마다 +12%", "구매자 말하기 금지", "판매자 말하기 금지", "구매자·판매자 미니 승부",
];
const cards = [
  ["Price Insider",300,"실제 가치 공개"],["Clause Insider",300,"조항 2개 공개"],["Reroll Saver I",100,"리롤 10% 할인"],
  ["Reroll Saver II",200,"리롤 20% 할인"],["Black Marketeer I",100,"시장 수익 +10%"],["Black Marketeer II",200,"시장 수익 +20%"],
  ["Hammer Lock",400,"대상 입찰 금지"],["Loan Shark",200,"즉시 $1,000 대출"],["Roll the Dice I",150,"75%로 $300"],
  ["Roll the Dice II",250,"50%로 $500"],["Roll the Dice III",300,"30%로 $700"],["Roll the Dice IV",300,"15%로 $1,000"],
  ["Roll the Dice V",350,"5%로 $1,500"],["Sharp Guess",100,"부자 대상 -$300"],["Pickpocket",200,"카드 1장 강탈"],
  ["All In I",400,"80%로 현금 +20%"],["All In II",400,"50%로 현금 +35%"],["All In III",300,"20%로 현금 +50%"],
  ["Robin Hood",150,"최대 $250 강탈"],["Shut Down",150,"카드 효과 면역"],["Bank Heist",100,"모두에게 $100 강탈"],
  ["Overbid Trap",100,"5회 입찰 함정"],
];
const cardKoreanNames = [
  "가격 정보원", "계약 정보원", "리롤 할인 I", "리롤 할인 II", "암시장 거래 I", "암시장 거래 II",
  "해머 잠금", "고리대금", "승부수 I", "승부수 II", "승부수 III", "승부수 IV", "승부수 V",
  "날카로운 추측", "소매치기", "올인 I", "올인 II", "올인 III", "의적", "셧다운", "은행 강도", "과입찰 함정",
];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const knownMoney = (value, fallback = "확인 중") => isFiniteNumber(value) ? money(value) : fallback;
const startingBidAmount = () => isFiniteNumber(dealer?.startingBid) ? dealer.startingBid : 100;
const currentBidAmount = () => isFiniteNumber(dealer?.currentBid) && dealer?.highestBidderId ? dealer.currentBid : null;
const nextBidAmount = () => {
  const current = currentBidAmount();
  return current === null ? startingBidAmount() : current + 50;
};

const me = () => room?.meId;
const myCards = () => dealer?.cards?.[me()] || [];
const playerName = (id) => room?.players.find((player) => player.id === id)?.name || "참가자";
const dealerPlayers = () => {
  if (!room) return [];
  if (!dealer?.balances) return room.players;
  const participantIds = new Set(Object.keys(dealer.balances));
  return room.players.filter((player) => participantIds.has(player.id));
};
const itemSrc = (id) => `/dealer-items-real/${itemFiles[id] || itemFiles[0]}`;
const lotItemSrc = (id) => `/dealer-items-real/${itemFiles[id] || itemFiles[0]}`;
const lotModelSrc = (id) => itemModelFiles[id] ? `/dealer-items-3d/${itemModelFiles[id]}_LOD1.glb` : "";
const itemName = (item) => itemKoreanNames[item?.id] || item?.name || "미확인 물품";
const itemSubtitle = (item) => item?.name || "Private Collection";
const cardSymbol = (id) => ["$", "§", "↻", "↻", "+", "+", "×", "$", "♦", "♦", "♦", "♦", "♦", "?", "♠", "%", "%", "%", "♣", "◈", "$", "!"][id] || "♦";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function act(action, extra = {}) {
  if (busy) return;
  if (actionBlockedByDeadline(action)) {
    ui.notice.textContent = "시간이 끝났습니다. 다음 단계로 이동합니다.";
    showToast("시간이 끝났습니다. 다음 단계로 이동합니다.", "error");
    renderLotActions();
    if (menuOpen && tab === "game") renderTab();
    return;
  }
  busy = true;
  const requestId = makeRequestId();
  syncGeneration += 1;
  document.body.dataset.busy = action;
  ui.notice.textContent = "처리 중…";
  if (debugMode) {
    try {
      if (debugState?.dealer) {
        applyDebugSnapshot(applyDebugAction(debugState, action, extra));
        showToast(actionSuccessMessage(action));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "디버그 동작을 처리하지 못했어요.";
      ui.notice.textContent = message;
      showToast(message, "error");
    } finally {
      busy = false;
      delete document.body.dataset.busy;
    }
    return;
  }
  try {
    const response = await fetchWithTimeout(`/api/rooms/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra, requestId }),
    });
    const body = await response.json();
    const conflict = response.status === 409 && body?.code === "ROOM_CONFLICT";
    if (conflict) {
      const error = new Error("다른 플레이어의 행동을 먼저 반영했습니다.");
      error.name = "ROOM_CONFLICT";
      throw error;
    }
    if (!response.ok) throw new Error(body.error || "요청 실패");
    applyRoomSnapshot(body.room, { force: true });
    render();
    showToast(actionSuccessMessage(action));
  } catch (error) {
    if (error?.name === "ROOM_CONFLICT") {
      const message = "다른 플레이어가 먼저 변경했습니다. 최신 상태를 불러옵니다.";
      ui.notice.textContent = message;
      showToast(message, "error");
      await sync();
      return;
    }
    const message = error?.name === "AbortError"
      ? "서버 응답이 늦어요. 최신 상태를 다시 확인합니다."
      : error.message || "다시 시도해 주세요.";
    ui.notice.textContent = message;
    showToast(message, "error");
  } finally {
    busy = false;
    delete document.body.dataset.busy;
  }
}

async function sync() {
  if (debugMode) {
    if (!debugState) bootDebugMode();
    return;
  }
  if (syncInFlight) return;
  syncInFlight = true;
  const requestGeneration = syncGeneration;
  try {
    const response = await fetchWithTimeout(`/api/rooms/${roomCode}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 404) showLoading("방을 찾을 수 없습니다", "방 코드가 만료되었거나 잘못되었습니다.", "error");
      else if (response.status === 401) showLoading("참가 인증이 필요합니다", "방에 다시 참가한 뒤 게임을 열어 주세요.", "error");
      else if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        nextSyncDelay = Math.max(10_000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000);
        showLoading("연결을 조정하는 중…", "잠시 후 게임 정보를 다시 불러옵니다.");
      } else showLoading("게임 정보를 불러오는 중…", "연결이 안정되면 자동으로 다시 시도합니다.");
      return;
    }
    const body = await response.json();
    const applied = applyRoomSnapshot(body.room);
    if (!applied && requestGeneration < syncGeneration) return;
    nextSyncDelay = dealer?.phase === "auction" ? 1600 : 2200;
    if (!dealer || room?.view !== "game") {
      const waitingTitle = room?.view === "briefing" ? "게임 시작을 기다리는 중…" : "게임 정보를 불러오는 중…";
      const waitingDetail = room?.view === "briefing"
        ? "방장이 시작 버튼을 누르면 물건 선택 단계가 열립니다."
        : "방장이 로비에서 게임을 준비하면 이 화면에 자동으로 표시됩니다.";
      showLoading(waitingTitle, waitingDetail, "waiting");
      return;
    }
    hideLoading();
    if (room.revision !== lastRevision) {
      lastRevision = room.revision;
      render();
    }
  } catch (error) {
    if (!room || !dealer) showLoading("게임 정보를 불러오는 중…", "연결이 안정되면 자동으로 다시 시도합니다.");
    else if (error?.name === "AbortError") {
      ui.notice.textContent = "연결이 잠시 지연되고 있어요. 최신 경매 상태를 다시 확인 중입니다.";
    }
  } finally {
    syncInFlight = false;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => { syncTimer = null; void sync(); }, nextSyncDelay);
  }
}

function render() {
  if (!room || !dealer) return;
  ui.notice.textContent = "";
  const mine = me();
  const previousPhase = lastRenderedPhase;
  const phaseChanged = dealer.phase !== lastRenderedPhase;
  if (phaseChanged) {
    if (dealer.phase === "select") {
      // Open the private lot choices as soon as the host starts a round.
      tab = "game";
      menuOpen = true;
    } else if (["resolution", "shop", "finished"].includes(dealer.phase)) {
      // These phases have no dedicated bottom-nav item. Keep their content
      // reachable by opening the game sheet and leave a reopen CTA behind
      // if the player closes it.
      tab = "game";
      menuOpen = true;
    } else if (tab === "game" && menuOpen) {
      closeSheet();
    }
    if (previousPhase !== null) showToast(phaseTransitionMessage(dealer.phase));
    lastRenderedPhase = dealer.phase;
  }
  const inventory = dealer.inventories[mine] || [];
  document.body.dataset.phase = dealer.phase;
  gameBoard.setPhase(dealer.phase);
  updatePhaseMeta();
  ui.round.textContent = `ROUND ${dealer.round}/${dealer.totalRounds}`;
  ui.phase.textContent = phaseNames[dealer.phase];
  ui.cash.textContent = knownMoney(dealer.balances[mine], "확인 중");
  ui.itemCount.textContent = `${inventory.length}/4`;
  ui.cardCount.textContent = `${myCards().length}/3`;
  const players = dealerPlayers();
  ui.seats.dataset.count = String(players.length);
  ui.seats.innerHTML = players.map((player, index) => {
    const isMe = player.id === mine;
    const isSeller = player.id === dealer.sellerId;
    const isHighest = dealer.phase === "auction" && player.id === dealer.highestBidderId;
    const displayName = player.name || `플레이어${index + 1}`;
    const roleText = [isMe ? "본인" : "", isSeller ? "판매자" : "", isHighest ? "최고 입찰" : ""].filter(Boolean).join(" · ");
    const label = `${displayName} ${knownMoney(dealer.balances[player.id], "확인 중")}${roleText ? ` · ${roleText}` : ""}`;
    const badges = [
      isMe ? '<em class="seat-role seat-role-me" aria-hidden="true">ME</em>' : "",
      isSeller ? '<em class="seat-role seat-role-seller" aria-hidden="true">SELLER</em>' : "",
    ].join("");
    return `
    <div class="seat-shell" aria-label="${escapeHtml(label)}">
      ${badges}<div class="seat ${isMe ? "me" : ""} ${isSeller ? "seller" : ""} ${isHighest ? "highest" : ""}" style="--seat:${playerColors[index % playerColors.length]}"><b>${escapeHtml(displayName)}</b><span>${knownMoney(dealer.balances[player.id], "확인 중")}</span></div>
    </div>`;
  }).join("");

  const showLot = dealer.currentItem && !["select", "shop", "finished"].includes(dealer.phase);
  ui.lotStage.hidden = !showLot;
  if (dealer.currentItem) {
    preloadItem(dealer.currentItem);
    ui.seller.textContent = playerName(dealer.sellerId);
    ui.itemImage.src = lotItemSrc(dealer.currentItem.id);
    ui.itemImage.alt = dealer.currentItem.name;
    renderLotModel(dealer.currentItem);
    ui.itemName.textContent = itemName(dealer.currentItem);
    ui.itemOriginal.textContent = itemSubtitle(dealer.currentItem);
    ui.itemEra.textContent = dealer.currentItem.era;
    ui.lotNumber.textContent = `출품 ${String(dealer.auctionCount + 1).padStart(2, "0")}`;
    ui.lotCard.dataset.item = dealer.currentItem.id;
    const currentBid = currentBidAmount();
    ui.bid.textContent = currentBid === null ? `시작가 ${money(startingBidAmount())}` : money(currentBid);
    ui.highest.textContent = currentBid === null
      ? "아직 입찰 없음"
      : `${playerName(dealer.highestBidderId)} · 최고 입찰자`;
  } else {
    clearLotModel();
  }
  const isAuction = Boolean(dealer.currentItem && dealer.phase === "auction");
  const knowsPrice = Boolean(dealer.knowsPrice);
  const knowsClauses = Boolean(dealer.knowsClauses);
  const knows = knowsPrice || knowsClauses;
  ui.lotCard.dataset.ledger = knows ? "open" : "mystery";
  ui.dossier.hidden = !isAuction;
  ui.dossier.dataset.mystery = isAuction && !knows ? "true" : "false";
  if (isAuction) {
    ui.value.textContent = knowsPrice ? knownMoney(dealer.currentItem.value) : "$?";
    ui.clauses.innerHTML = knowsClauses && dealer.currentItem.clauses.length
      ? dealer.currentItem.clauses.map((id) => `<div>§${id} ${escapeHtml(clauseText[id])}</div>`).join("")
      : "<div>§? 조항 비공개</div><div>§? 감정 정보 비공개</div>";
  } else {
    ui.dossier.dataset.mystery = "false";
  }
  renderLotActions();
  renderTab();
  renderStageAction();
}

function renderLotActions() {
  const show = Boolean(dealer.currentItem && dealer.phase === "auction");
  ui.lotActions.hidden = !show;
  if (!show) {
    ui.lotActions.innerHTML = "";
    syncActionBanner();
    return;
  }
  const mine = me();
  const seller = dealer.sellerId === mine;
  const blocked = dealer.blockedBidders.includes(mine);
  const full = (dealer.inventories[mine]?.length || 0) >= 4;
  const next = nextBidAmount();
  const afford = dealer.balances[mine] >= next;
  const expired = phaseExpired("auction");
  const bidLabel = blocked
    ? "해머 잠금 · 입찰 제한"
    : full
      ? "소장품 보관함이 가득 찼습니다"
      : !afford
        ? "호가할 자금이 부족합니다"
        : expired
          ? "경매 마감"
        : `호가표 들기 · ${money(next)}`;
  ui.lotActions.innerHTML = `
    ${seller
      ? `<p class="lot-action-note ${expired ? "is-closed" : ""}">${expired ? "경매가 마감되었습니다. 결과를 기다려 주세요." : "판매 중인 물건입니다. 입찰은 다른 딜러가 진행합니다."}</p>`
      : `<button class="primary-action" id="lot-bid-button" ${blocked || full || !afford || expired ? "disabled" : ""} aria-disabled="${blocked || full || !afford || expired ? "true" : "false"}" aria-label="${escapeHtml(bidLabel)}">${bidLabel}</button>`}`;
  const bidButton = $("lot-bid-button");
  if (bidButton) bidButton.onclick = () => {
    bidButton.disabled = true;
    bidButton.classList.add("is-loading");
    bidButton.textContent = "입찰 확인 중…";
    act("dealer-bid");
  };
  syncActionBanner();
}

function renderTab() {
  document.body.dataset.tab = tab;
  document.body.dataset.menu = menuOpen ? "open" : "closed";
  ui.sheetBackdrop?.setAttribute("aria-hidden", menuOpen ? "false" : "true");
  if (!room || !dealer) {
    ui.content.innerHTML = "";
    showLoading("게임 정보를 불러오는 중…", "방장이 로비에서 시작 버튼을 누르면 물건 선택 단계가 열립니다.", "waiting");
    renderStageAction();
    return;
  }
  if (tab === "items") { renderItems(); return; }
  if (tab === "cards") { renderCards(); return; }
  if (tab === "rules") { renderRules(); return; }
  renderGame();
}

function renderGame() {
  const mine = me();
  if (dealer.phase === "select") {
    const selected = dealer.selected[mine] !== undefined;
    const items = dealer.candidates[mine] || [];
    const expired = phaseExpired("select");
    const selectedCount = Object.keys(dealer.selected || {}).length;
    const participantCount = dealerPlayers().length;
    items.forEach(preloadItem);
    ui.content.innerHTML = `
      <div class="section-title"><h2>비공개 자산 심사</h2><span>감정가와 조항을 검토한 뒤 출품 자산을 선택하세요</span></div>
      <div class="phase-banner" role="status"><strong>이번 라운드 출품품 선택</strong><span>${selected ? "선택 완료" : "내 선택 필요"} · ${selectedCount}/${participantCount}명 제출</span></div>
      <div class="candidate-grid">${items.map((item, index) => `
        <button class="item-card ${selected && dealer.selected[mine] === index ? "selected" : ""}" data-select="${index}" ${selected || expired ? "disabled" : ""} aria-label="${escapeHtml(itemName(item))} ${expired ? "선택 마감" : "출품 선택"}">
          <img src="${itemSrc(item.id)}" alt="${escapeHtml(itemName(item))}" />
          <span class="item-card-price"><small>감정가</small><b>${money(item.value)}</b></span>
          <span class="item-card-copy"><span class="eyebrow">${escapeHtml(item.era)} · PRIVATE LOT</span><strong>${escapeHtml(itemName(item))}</strong><small class="item-subtitle">${escapeHtml(itemSubtitle(item))}</small>
          <span class="item-card-description">${item.clauses.map((clause) => `<small class="clause-mini">§${clause} ${escapeHtml(clauseText[clause])}</small>`).join("")}</span></span>
        </button>`).join("")}</div>
      ${selected ? `<p class="notice">출품 등록 완료 · 다른 딜러의 감정이 끝나기를 기다립니다.</p>` : expired ? `<p class="notice is-closed">선택 시간이 종료되었습니다. 다음 경매를 준비합니다.</p>` : ""}`;
    ui.content.querySelectorAll("[data-select]").forEach((button) => { button.onclick = () => act("dealer-select", { itemIndex: Number(button.dataset.select) }); });
    return;
  }
  if (dealer.phase === "auction") {
    const seller = dealer.sellerId === mine;
    const speechLocked = dealer.speechLocked.includes(mine);
    ui.content.innerHTML = `
      <div class="section-title"><h2>${seller ? "가치를 설득하고 거래를 주도하세요" : "정보를 판단하고 입찰하세요"}</h2><span>입찰 버튼은 감정서 아래에 표시됩니다</span></div>
      ${speechLocked ? `<div class="notice">침묵 조항 발동 · 이번 경매가 끝날 때까지 말할 수 없습니다.</div>` : ""}
      <div class="notice">${seller ? "감정가와 계약 조항은 판매자에게만 공개됩니다." : "가격과 조항은 비공개입니다. 실제 대화로 판단한 뒤 아이템 아래에서 입찰하세요."}</div>`;
    return;
  }
  if (dealer.phase === "resolution") {
    const result = dealer.lastResult;
    ui.content.innerHTML = `
      <div class="section-title"><h2>${result?.sold ? "SOLD · 낙찰 완료" : "PASS · 유찰"}</h2><span>다음 물품 준비 중</span></div>
      ${result ? `<div class="inventory-row"><img src="${itemSrc(result.item.id)}" alt="${escapeHtml(itemName(result.item))}" /><div><strong>${escapeHtml(itemName(result.item))}</strong><small>${escapeHtml(result.message)}</small>${result.item.clauses.map((clause) => `<div class="clause">§${clause} ${escapeHtml(clauseText[clause])}</div>`).join("")}</div><b>${result.sold ? money(result.bid ?? result.finalBid ?? result.item.value) : "유찰"}</b></div>` : ""}`;
    return;
  }
  if (dealer.phase === "shop") {
    const offers = dealer.shopOffers[mine] || [];
    const reroll = dealer.rerolls[mine] || 0;
    const discount = myCards().includes(3) ? .8 : myCards().includes(2) ? .9 : 1;
    const cost = Math.round((100 + reroll * 100) * discount / 10) * 10;
    const expired = phaseExpired("shop");
    ui.content.innerHTML = `
      <div class="section-title"><h2>정책 거래소</h2><span>교체 ${reroll}회 · 다음 목록 갱신 ${money(cost)}</span></div>
      ${offers.length > 2 ? `<p class="scroll-cue">좌우로 밀어 더 많은 전략패 보기 <span aria-hidden="true">→</span></p>` : ""}
      <div class="shop-grid">${offers.map((id) => { const card = cards[id]; const disabled = expired || myCards().length >= 3 || dealer.balances[mine] < card[1]; return `<button class="card-card" data-symbol="${cardSymbol(id)}" data-buy="${id}" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(cardKoreanNames[id])} ${expired ? "구매 마감" : "구매"}"><span class="eyebrow">${card[0]}</span><strong>${cardKoreanNames[id]}</strong><small>${card[2]}</small><b>${money(card[1])}</b></button>`; }).join("")}</div>
      <div class="action-row"><button class="secondary-action ${expired ? "is-closed" : ""}" id="reroll" ${expired || dealer.balances[mine] < cost ? "disabled" : ""}>${expired ? "상점 마감" : `상품 교체 · ${money(cost)}`}</button><button class="secondary-action" id="checkout" ${expired || !(dealer.inventories[mine]?.length) ? "disabled" : ""}>컬렉션 정산</button></div>`;
    ui.content.querySelectorAll("[data-buy]").forEach((button) => { button.onclick = () => act("dealer-buy-card", { cardId: Number(button.dataset.buy) }); });
    $("reroll").onclick = () => act("dealer-reroll");
    $("checkout").onclick = () => act("dealer-checkout");
    return;
  }
  const ranks = [...dealerPlayers()].sort((a, b) => dealer.balances[b.id] - dealer.balances[a.id]);
  ui.content.innerHTML = `
    <div class="section-title"><h2>최종 딜러 랭킹</h2><span>현금 기준 · 남은 컬렉션 정산 가능</span></div>
    ${ranks.map((player, index) => `<div class="rank"><span>${index + 1}</span><strong>${escapeHtml(player.name)}${player.id === mine ? " · 나" : ""}</strong><b>${money(dealer.balances[player.id])}</b></div>`).join("")}
    <button class="secondary-action" id="checkout" ${!(dealer.inventories[mine]?.length) ? "disabled" : ""}>남은 컬렉션 시장 정산</button>`;
  const checkout = $("checkout");
  if (checkout) checkout.onclick = () => act("dealer-checkout");
}

function renderItems() {
  if (!dealer) return;
  const list = dealer.inventories[me()] || [];
  ui.content.innerHTML = `
    <div class="section-title"><h2>정부 승인 소장품</h2><span>${list.length}/4 · 같은 시대를 모으면 세트 보너스</span></div>
    <div class="inventory-list">${list.length ? list.map((item) => `
      <div class="inventory-row"><img src="${itemSrc(item.id)}" alt="${escapeHtml(itemName(item))}" /><div><strong>${escapeHtml(itemName(item))}</strong><small>${escapeHtml(itemSubtitle(item))} · ${escapeHtml(item.era)}</small>${item.clauses.map((clause) => `<div class="clause">§${clause} ${escapeHtml(clauseText[clause])}</div>`).join("")}</div><b>${money(item.value)}</b></div>`).join("") : "<div class='notice'>아직 낙찰받은 컬렉션이 없습니다.</div>"}</div>`;
}

function renderCards() {
  if (!room || !dealer) return;
  const mine = me();
  const list = myCards();
  const expired = phaseExpired("auction");
  const targetOptions = dealerPlayers().filter((player) => player.id !== mine).map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
  ui.content.innerHTML = `
    <div class="section-title"><h2>승부의 전략패</h2><span>${list.length}/3 · 경매 후 결정적인 순간에 사용하세요</span></div>
    <select class="target-select" id="target" aria-label="카드 사용 대상"><option value="">대상 자동 선택 또는 대상 없음</option>${targetOptions}</select>
    <div class="inventory-list">${list.length ? list.map((id) => { const card = cards[id]; const passive = id >= 2 && id <= 5; const disabled = dealer.phase !== "auction" || expired; return `<div class="inventory-row"><div class="strategy-icon">${cardSymbol(id)}</div><div><strong>${cardKoreanNames[id]}</strong><small>${card[0]} · ${card[2]}</small></div><div class="card-actions">${passive ? "<b>PASSIVE</b>" : `<button data-use="${id}" ${disabled ? "disabled" : ""}>${expired ? "마감" : "사용"}</button>`}</div></div>`; }).join("") : `<div class="empty-state"><div class="empty-state-icon">+</div><strong>아직 보유한 전략패가 없습니다</strong><small>정책 거래소에서 전략패를 구입하면 이곳에 보관됩니다.</small></div>`}</div>`;
    ui.content.querySelectorAll("[data-use]").forEach((button) => {
      const cardId = Number(button.dataset.use);
      button.setAttribute("aria-label", `${cardKoreanNames[cardId]} ${expired ? "사용 마감" : "사용"}`);
      button.onclick = () => act("dealer-use-card", { cardId, targetId: $("target").value });
    });
}

function renderRules() {
  if (!dealer) return;
  ui.content.innerHTML = `
    <div class="section-title"><h2>정부 경매 위원회</h2><span>현장에서 직접 토론하고 설득하는 전략 경매</span></div>
    <div class="log"><div>시작 자금 $2,000 · 컬렉션 4칸 · 전략 카드 3칸</div><div>비밀 소장품 3개 중 하나를 20초 안에 출품</div><div>경매 50초 · $100 시작 · $50 호가 · 막판 입찰 시 5초 연장</div><div>판매자는 실제 감정가와 계약 조항을 보고 직접 설득</div><div>라운드 상점 60초 · 리롤 비용 $100부터 단계적으로 증가</div><div>5라운드 종료 후 가장 많은 현금을 가진 딜러가 승리</div>${dealer.log.slice(0, 8).map((entry) => `<div>${escapeHtml(entry)}</div>`).join("")}</div>`;
}

function setTab(next) {
  lastMenuButton = document.querySelector(`.dock button[data-tab="${next}"]`);
  if (tab === next && menuOpen) {
    closeSheet();
    return;
  }
  tab = next;
  menuOpen = true;
  syncDockButtons();
  if (ui.sheetScroll) ui.sheetScroll.scrollTop = 0;
  renderTab();
}

document.querySelectorAll(".dock button").forEach((button) => { button.onclick = () => setTab(button.dataset.tab); });
ui.hudMenu?.addEventListener("click", () => setTab("rules"));
ui.sheetBackdrop?.addEventListener("click", closeSheet);
ui.sheetClose?.addEventListener("click", closeSheet);
ui.loadingRetry?.addEventListener("click", () => {
  if (debugMode) return;
  void sync();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && menuOpen) closeSheet(); });
if (debugMode) {
  debugPanel = mountDebugPanel({
    scenarios: DEBUG_SCENARIOS,
    phases: DEBUG_PHASES,
    initialScenario: debugScenario,
    initialPlayerCount: debugPlayerCount,
    onScenarioChange: setDebugScenario,
    onPlayerCountChange: setDebugPlayerCount,
    onPhaseChange: setDebugPhase,
    onAction: runDebugAction,
  });
  updateDebugUrl();
}
setInterval(() => {
  if (!dealer) {
    ui.timer.textContent = "--:--";
    if (ui.timerLabel) ui.timerLabel.textContent = "연결 중";
    return;
  }
  const left = Math.max(0, dealer.deadline - (Date.now() + serverOffset));
  const seconds = Math.ceil(left / 1000);
  ui.timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  updatePhaseMeta();
  const critical = seconds <= 5 && dealer.phase !== "finished";
  const expired = left <= 0 && dealer.phase !== "finished";
  ui.timer.classList.toggle("danger", critical);
  ui.timer.closest(".timer")?.classList.toggle("critical", critical);
  document.body.dataset.timeCritical = critical ? "true" : "false";
  if (expired !== timerExpired) {
    timerExpired = expired;
    if (expired) showToast(`${timerLabels[dealer.phase] || "단계"} 시간이 끝났습니다.`, "error");
    renderLotActions();
    if (menuOpen && tab === "game") renderTab();
    renderStageAction();
  }
}, 200);
if (debugMode) bootDebugMode();
else sync();
