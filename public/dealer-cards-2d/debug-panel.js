function optionList(items, value) {
  return items.map((item) => `<option value="${item.id}" ${item.id === value ? "selected" : ""}>${item.label}</option>`).join("");
}

export function mountDebugPanel({ scenarios, phases, initialScenario, initialPlayerCount, onScenarioChange, onPlayerCountChange, onPhaseChange, onAction, getSummary }) {
  document.body.dataset.debug = "true";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "debug-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "debug-panel");
  toggle.textContent = "DEBUG";

  const panel = document.createElement("aside");
  panel.id = "debug-panel";
  panel.className = "debug-panel";
  panel.setAttribute("aria-label", "로컬 디버그 도구");
  panel.innerHTML = `
    <header class="debug-panel-header">
      <div><strong>로컬 디버그</strong><small>서버에 저장되지 않는 가상 상태</small></div>
      <button type="button" class="debug-close" aria-label="디버그 패널 닫기">×</button>
    </header>
    <div class="debug-summary" id="debug-summary">상태 준비 중…</div>
    <label class="debug-field"><span>시나리오</span><select id="debug-scenario">${optionList(scenarios, initialScenario)}</select></label>
    <label class="debug-field"><span>플레이어 수</span><select id="debug-players">${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}" ${index + 1 === initialPlayerCount ? "selected" : ""}>${index + 1}명</option>`).join("")}</select></label>
    <div class="debug-section"><span>단계 강제 이동</span><div class="debug-button-grid">${optionList(phases, "").replace(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g, '<button type="button" data-debug-phase="$1">$2</button>')}</div></div>
    <div class="debug-section"><span>상호작용</span><div class="debug-button-grid"><button type="button" data-debug-action="dealer-bid">+50 입찰</button><button type="button" data-debug-action="dealer-reroll">상점 리롤</button><button type="button" data-debug-action="open-sheet">팝업 열기</button><button type="button" data-debug-action="close-sheet">팝업 닫기</button></div></div>
    <footer class="debug-panel-footer"><button type="button" data-debug-action="reset">현재 시나리오 초기화</button><code>?debug=1</code></footer>`;

  document.body.append(toggle, panel);
  const setOpen = (open) => {
    document.body.dataset.debugPanel = open ? "open" : "closed";
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(document.body.dataset.debugPanel !== "open"));
  panel.querySelector(".debug-close")?.addEventListener("click", () => setOpen(false));
  panel.querySelector("#debug-scenario")?.addEventListener("change", (event) => onScenarioChange(event.currentTarget.value));
  panel.querySelector("#debug-players")?.addEventListener("change", (event) => onPlayerCountChange(Number(event.currentTarget.value)));
  panel.querySelectorAll("[data-debug-phase]").forEach((button) => button.addEventListener("click", () => onPhaseChange(button.dataset.debugPhase)));
  panel.querySelectorAll("[data-debug-action]").forEach((button) => button.addEventListener("click", () => onAction(button.dataset.debugAction)));
  setOpen(false);

  return {
    update(summary) {
      const summaryNode = panel.querySelector("#debug-summary");
      if (summaryNode) summaryNode.textContent = summary || getSummary?.() || "상태 준비 중…";
    },
    setScenario(value) {
      const node = panel.querySelector("#debug-scenario");
      if (node) node.value = value;
    },
    setPlayerCount(value) {
      const node = panel.querySelector("#debug-players");
      if (node) node.value = String(value);
    },
    close() { setOpen(false); },
  };
}

