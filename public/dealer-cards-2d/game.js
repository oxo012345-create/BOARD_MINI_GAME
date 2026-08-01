import { createGameBoard } from "./game-board.js?v=2";

const roomCode = new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || "";
const $ = (id) => document.getElementById(id);
const ui = {
  round: $("round"), phase: $("phase"), timer: $("timer"), cash: $("cash"), seats: $("seats"),
  lotStage: $("lot-stage"), lotCard: $("lot-card"), seller: $("seller"), itemImage: $("item-image"), itemName: $("item-name"),
  itemOriginal: $("item-original"), itemEra: $("item-era"), lotNumber: $("lot-number"), bid: $("bid"), highest: $("highest"), dossier: $("private-dossier"),
  value: $("true-value"), clauses: $("clauses"), notice: $("notice"), content: $("content"),
  itemCount: $("item-count"), cardCount: $("card-count"),
};
const gameBoard = createGameBoard($("game-board-canvas"));
window.addEventListener("pagehide", () => gameBoard.destroy(), { once: true });

let room = null;
let dealer = null;
let tab = "game";
let busy = false;
let lastRevision = -1;
let serverOffset = 0;

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

const me = () => room?.meId;
const myCards = () => dealer?.cards?.[me()] || [];
const playerName = (id) => room?.players.find((player) => player.id === id)?.name || "참가자";
const itemSrc = (id) => `/dealer-items-real/${itemFiles[id] || itemFiles[0]}`;
const lotItemSrc = (id) => `/dealer-items/${itemFiles[id] || itemFiles[0]}`;
const itemName = (item) => itemKoreanNames[item?.id] || item?.name || "미확인 물품";
const itemSubtitle = (item) => item?.name || "Private Collection";
const cardSymbol = (id) => ["$", "§", "↻", "↻", "+", "+", "×", "$", "♦", "♦", "♦", "♦", "♦", "?", "♠", "%", "%", "%", "♣", "◈", "$", "!"][id] || "♦";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function act(action, extra = {}) {
  if (busy) return;
  busy = true;
  document.body.dataset.busy = action;
  ui.notice.textContent = "처리 중…";
  try {
    const response = await fetch(`/api/rooms/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "요청 실패");
    room = body.room;
    serverOffset = room.serverNow - Date.now();
    dealer = room.game?.dealer;
    render();
  } catch (error) {
    ui.notice.textContent = error.message || "다시 시도해 주세요.";
  } finally {
    busy = false;
    delete document.body.dataset.busy;
  }
}

async function sync() {
  try {
    const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const body = await response.json();
    room = body.room;
    serverOffset = room.serverNow - Date.now();
    dealer = room?.game?.dealer;
    if (!dealer) throw new Error();
    if (room.revision !== lastRevision) {
      lastRevision = room.revision;
      render();
    }
  } catch {
    ui.notice.textContent = "연결을 다시 시도하는 중…";
  }
}

function render() {
  if (!room || !dealer) return;
  ui.notice.textContent = "";
  const mine = me();
  const inventory = dealer.inventories[mine] || [];
  document.body.dataset.phase = dealer.phase;
  gameBoard.setPhase(dealer.phase);
  ui.round.textContent = `ROUND ${dealer.round}/${dealer.totalRounds}`;
  ui.phase.textContent = phaseNames[dealer.phase];
  ui.cash.textContent = money(dealer.balances[mine]);
  ui.itemCount.textContent = `${inventory.length}/4`;
  ui.cardCount.textContent = `${myCards().length}/3`;
  ui.seats.innerHTML = room.players.map((player, index) => `
    <div class="seat ${player.id === mine ? "me" : ""} ${player.id === dealer.sellerId ? "seller" : ""}" style="--seat:${playerColors[index % playerColors.length]}">
      <i data-initial="${escapeHtml(player.name.slice(0, 1).toUpperCase())}"></i><b>${escapeHtml(player.name)}</b><span>${money(dealer.balances[player.id])}</span>
    </div>`).join("");

  const showLot = dealer.currentItem && !["select", "shop", "finished"].includes(dealer.phase);
  ui.lotStage.hidden = !showLot;
  if (dealer.currentItem) {
    ui.seller.textContent = playerName(dealer.sellerId);
    ui.itemImage.src = lotItemSrc(dealer.currentItem.id);
    ui.itemImage.alt = dealer.currentItem.name;
    ui.itemName.textContent = itemName(dealer.currentItem);
    ui.itemOriginal.textContent = itemSubtitle(dealer.currentItem);
    ui.itemEra.textContent = dealer.currentItem.era;
    ui.lotNumber.textContent = `출품 ${String(dealer.auctionCount + 1).padStart(2, "0")}`;
    ui.lotCard.dataset.item = dealer.currentItem.id;
    ui.bid.textContent = money(dealer.highestBidderId ? dealer.currentBid : 100);
    ui.highest.textContent = dealer.highestBidderId ? `${playerName(dealer.highestBidderId)} 최고 입찰` : "첫 입찰을 기다리는 중";
  }
  const knows = dealer.currentItem && (dealer.knowsPrice || dealer.knowsClauses);
  ui.dossier.hidden = !knows;
  if (knows) {
    ui.value.textContent = dealer.knowsPrice ? money(dealer.currentItem.value) : "가격 미확인";
    ui.clauses.innerHTML = dealer.knowsClauses
      ? dealer.currentItem.clauses.map((id) => `<div>§${id} ${escapeHtml(clauseText[id])}</div>`).join("")
      : "<div>조항 미확인</div>";
  }
  renderTab();
}

function renderTab() {
  document.body.dataset.tab = tab;
  if (tab === "items") return renderItems();
  if (tab === "cards") return renderCards();
  if (tab === "rules") return renderRules();
  renderGame();
}

function renderGame() {
  const mine = me();
  if (dealer.phase === "select") {
    const selected = dealer.selected[mine] !== undefined;
    const items = dealer.candidates[mine] || [];
    ui.content.innerHTML = `
      <div class="section-title"><h2>비공개 자산 심사</h2><span>감정가와 조항을 검토한 뒤 출품 자산을 선택하세요</span></div>
      <div class="candidate-grid">${items.map((item, index) => `
        <button class="item-card ${selected && dealer.selected[mine] === index ? "selected" : ""}" data-select="${index}" ${selected ? "disabled" : ""}>
          <img src="${itemSrc(item.id)}" alt="${escapeHtml(itemName(item))}" />
          <span class="item-card-copy"><span class="eyebrow">${escapeHtml(item.era)} · PRIVATE LOT</span><strong>${escapeHtml(itemName(item))}</strong><small>${escapeHtml(itemSubtitle(item))}</small><b>${money(item.value)}</b>
          ${item.clauses.map((clause) => `<small class="clause-mini">§${clause} ${escapeHtml(clauseText[clause])}</small>`).join("")}</span>
        </button>`).join("")}</div>
      ${selected ? `<p class="notice">출품 등록 완료 · 다른 딜러의 감정이 끝나기를 기다립니다.</p>` : ""}`;
    ui.content.querySelectorAll("[data-select]").forEach((button) => { button.onclick = () => act("dealer-select", { itemIndex: Number(button.dataset.select) }); });
    return;
  }
  if (dealer.phase === "auction") {
    const seller = dealer.sellerId === mine;
    const blocked = dealer.blockedBidders.includes(mine);
    const speechLocked = dealer.speechLocked.includes(mine);
    const full = (dealer.inventories[mine]?.length || 0) >= 4;
    const next = dealer.currentBid + 50;
    const afford = dealer.balances[mine] >= next;
    ui.content.innerHTML = `
      <div class="section-title"><h2>${seller ? "가치를 설득하고 거래를 주도하세요" : "정보를 판단하고 입찰하세요"}</h2><span>마지막 3초의 입찰은 5초 연장됩니다</span></div>
      ${speechLocked ? `<div class="notice">침묵 조항 발동 · 이번 경매가 끝날 때까지 말할 수 없습니다.</div>` : ""}
      ${seller ? `<div class="notice">감정가와 계약 조항은 판매자에게만 공개됩니다. 무엇을 공개할지는 당신의 선택입니다.</div>` : `
        <button class="primary-action" id="bid-button" ${blocked || full || !afford ? "disabled" : ""}>
          ${blocked ? "해머 잠금 · 입찰 제한" : full ? "소장품 보관함이 가득 찼습니다" : !afford ? "호가할 자금이 부족합니다" : `호가표 들기 · ${money(next)}`}
        </button>`}
      <button class="secondary-action" data-goto-cards>보유 전략 카드 보기</button>`;
    const bidButton = $("bid-button");
    if (bidButton) bidButton.onclick = () => {
      bidButton.disabled = true;
      bidButton.classList.add("is-loading");
      bidButton.textContent = "입찰 확인 중…";
      act("dealer-bid");
    };
    ui.content.querySelector("[data-goto-cards]").onclick = () => setTab("cards");
    return;
  }
  if (dealer.phase === "resolution") {
    const result = dealer.lastResult;
    ui.content.innerHTML = `
      <div class="section-title"><h2>${result?.sold ? "SOLD · 낙찰 완료" : "PASS · 유찰"}</h2><span>다음 물품 준비 중</span></div>
      ${result ? `<div class="inventory-row"><img src="${itemSrc(result.item.id)}" alt="${escapeHtml(itemName(result.item))}" /><div><strong>${escapeHtml(itemName(result.item))}</strong><small>${escapeHtml(result.message)}</small>${result.item.clauses.map((clause) => `<div class="clause">§${clause} ${escapeHtml(clauseText[clause])}</div>`).join("")}</div><b>${money(result.item.value)}</b></div>` : ""}`;
    return;
  }
  if (dealer.phase === "shop") {
    const offers = dealer.shopOffers[mine] || [];
    const reroll = dealer.rerolls[mine] || 0;
    const discount = myCards().includes(3) ? .8 : myCards().includes(2) ? .9 : 1;
    const cost = Math.round((100 + reroll * 100) * discount / 10) * 10;
    ui.content.innerHTML = `
      <div class="section-title"><h2>정책 거래소</h2><span>교체 ${reroll}회 · 다음 목록 갱신 ${money(cost)}</span></div>
      <div class="shop-grid">${offers.map((id) => { const card = cards[id]; return `<button class="card-card" data-symbol="${cardSymbol(id)}" data-buy="${id}" ${myCards().length >= 3 || dealer.balances[mine] < card[1] ? "disabled" : ""}><span class="eyebrow">${card[0]}</span><strong>${cardKoreanNames[id]}</strong><small>${card[2]}</small><b>${money(card[1])}</b></button>`; }).join("")}</div>
      <div class="action-row"><button class="secondary-action" id="reroll" ${dealer.balances[mine] < cost ? "disabled" : ""}>상품 교체 · ${money(cost)}</button><button class="secondary-action" id="checkout" ${!(dealer.inventories[mine]?.length) ? "disabled" : ""}>컬렉션 정산</button></div>`;
    ui.content.querySelectorAll("[data-buy]").forEach((button) => { button.onclick = () => act("dealer-buy-card", { cardId: Number(button.dataset.buy) }); });
    $("reroll").onclick = () => act("dealer-reroll");
    $("checkout").onclick = () => act("dealer-checkout");
    return;
  }
  const ranks = [...room.players].sort((a, b) => dealer.balances[b.id] - dealer.balances[a.id]);
  ui.content.innerHTML = `
    <div class="section-title"><h2>최종 딜러 랭킹</h2><span>현금 기준 · 남은 컬렉션 정산 가능</span></div>
    ${ranks.map((player, index) => `<div class="rank"><span>${index + 1}</span><strong>${escapeHtml(player.name)}${player.id === mine ? " · 나" : ""}</strong><b>${money(dealer.balances[player.id])}</b></div>`).join("")}
    <button class="secondary-action" id="checkout" ${!(dealer.inventories[mine]?.length) ? "disabled" : ""}>남은 컬렉션 시장 정산</button>`;
  const checkout = $("checkout");
  if (checkout) checkout.onclick = () => act("dealer-checkout");
}

function renderItems() {
  const list = dealer.inventories[me()] || [];
  ui.content.innerHTML = `
    <div class="section-title"><h2>정부 승인 소장품</h2><span>${list.length}/4 · 같은 시대를 모으면 세트 보너스</span></div>
    <div class="inventory-list">${list.length ? list.map((item) => `
      <div class="inventory-row"><img src="${itemSrc(item.id)}" alt="${escapeHtml(itemName(item))}" /><div><strong>${escapeHtml(itemName(item))}</strong><small>${escapeHtml(itemSubtitle(item))} · ${escapeHtml(item.era)}</small>${item.clauses.map((clause) => `<div class="clause">§${clause} ${escapeHtml(clauseText[clause])}</div>`).join("")}</div><b>${money(item.value)}</b></div>`).join("") : "<div class='notice'>아직 낙찰받은 컬렉션이 없습니다.</div>"}</div>`;
}

function renderCards() {
  const mine = me();
  const list = myCards();
  const targetOptions = room.players.filter((player) => player.id !== mine).map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
  ui.content.innerHTML = `
    <div class="section-title"><h2>승부의 전략패</h2><span>${list.length}/3 · 경매 후 결정적인 순간에 사용하세요</span></div>
    <select class="target-select" id="target" aria-label="카드 사용 대상"><option value="">대상 자동 선택 또는 대상 없음</option>${targetOptions}</select>
    <div class="inventory-list">${list.length ? list.map((id) => { const card = cards[id]; const passive = id >= 2 && id <= 5; return `<div class="inventory-row"><div class="strategy-icon">${cardSymbol(id)}</div><div><strong>${cardKoreanNames[id]}</strong><small>${card[0]} · ${card[2]}</small></div><div class="card-actions">${passive ? "<b>PASSIVE</b>" : `<button data-use="${id}" ${dealer.phase !== "auction" ? "disabled" : ""}>사용</button>`}</div></div>`; }).join("") : `<div class="empty-state"><div class="empty-state-icon">+</div><strong>아직 보유한 전략패가 없습니다</strong><small>정책 거래소에서 전략패를 구입하면 이곳에 보관됩니다.</small></div>`}</div>`;
  ui.content.querySelectorAll("[data-use]").forEach((button) => { button.onclick = () => act("dealer-use-card", { cardId: Number(button.dataset.use), targetId: $("target").value }); });
}

function renderRules() {
  ui.content.innerHTML = `
    <div class="section-title"><h2>정부 경매 위원회</h2><span>현장에서 직접 토론하고 설득하는 전략 경매</span></div>
    <div class="log"><div>시작 자금 $2,000 · 컬렉션 4칸 · 전략 카드 3칸</div><div>비밀 소장품 3개 중 하나를 20초 안에 출품</div><div>경매 50초 · $100 시작 · $50 호가 · 막판 입찰 시 5초 연장</div><div>판매자는 실제 감정가와 계약 조항을 보고 직접 설득</div><div>라운드 상점 60초 · 리롤 비용 $100부터 단계적으로 증가</div><div>5라운드 종료 후 가장 많은 현금을 가진 딜러가 승리</div>${dealer.log.slice(0, 8).map((entry) => `<div>${escapeHtml(entry)}</div>`).join("")}</div>`;
}

function setTab(next) {
  tab = next;
  document.querySelectorAll(".dock button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  renderTab();
}

document.querySelectorAll(".dock button").forEach((button) => { button.onclick = () => setTab(button.dataset.tab); });
setInterval(() => {
  if (!dealer) return;
  const left = Math.max(0, dealer.deadline - (Date.now() + serverOffset));
  const seconds = Math.ceil(left / 1000);
  ui.timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const critical = seconds <= 5 && dealer.phase !== "finished";
  ui.timer.classList.toggle("danger", critical);
  ui.timer.closest(".timer")?.classList.toggle("critical", critical);
  document.body.dataset.timeCritical = critical ? "true" : "false";
}, 200);
setInterval(sync, 650);
sync();
