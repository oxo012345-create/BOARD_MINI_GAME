import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import WebSocket from "ws";

function waitForSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket open timeout")), 5_000);
    socket.once("open", () => { clearTimeout(timeout); resolve(); });
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
  });
}

function waitForRoomState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket room-state timeout")), 5_000);
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== "room-state" || !predicate(message.room)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message.room);
    };
    socket.on("message", onMessage);
  });
}

async function withDevServer(run) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const cli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
  const port = 4300 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, [cli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 30_000;
    let readyResponse;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`vinext dev exited early:\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) { readyResponse = response; break; }
      } catch { /* server is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!readyResponse) throw new Error(`vinext dev did not become ready:\n${output}`);
    return await run(baseUrl, readyResponse);
  } finally {
    child.kill("SIGTERM");
  }
}

test("server-renders the Hanpan mobile app shell", async () => {
  await withDevServer(async (baseUrl, response) => {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /<title>한판 — 같이 노는 술게임<\/title>/);
    assert.match(html, /한판/);
    assert.match(html, /새 방 만들기/);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);

    const roomResponse = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: { id: "test-host", name: "테스터", avatar: "😎" } }),
    });
    assert.equal(roomResponse.status, 201);
    const body = await roomResponse.json();
    const hostCookie = roomResponse.headers.get("set-cookie").split(";")[0];
    assert.match(body.room.code, /^\d{4}$/);
    assert.equal(body.room.players[0].name, "테스터");
    assert.equal(body.room.authenticated, true);
    assert.ok(body.room.meId);
    assert.equal(JSON.stringify(body.room).includes("sessionHash"), false);

    const lobbyRefresh = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    assert.equal(lobbyRefresh.room.view, "lobby");
    assert.equal(lobbyRefresh.room.surprise.phase, "waiting");
    assert.ok(lobbyRefresh.room.surprise.endsAt - Date.now() > 290_000);

    const realtimeObserver = new WebSocket(`${baseUrl.replace("http", "ws")}/api/rooms/${body.room.code}/socket`, {
      headers: { Cookie: hostCookie },
    });
    await waitForSocketOpen(realtimeObserver);
    const realtimeHubState = waitForRoomState(realtimeObserver, (room) => room?.view === "hub");

    const soloStartResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "set-view", view: "hub" }),
    });
    assert.equal(soloStartResponse.status, 200);
    const soloStartBody = await soloStartResponse.json();
    assert.equal(soloStartBody.room.players.length, 1);
    assert.equal(soloStartBody.room.view, "hub");
    const pushedHubState = await realtimeHubState;
    assert.equal(pushedHubState.meId, body.room.meId);
    assert.equal(pushedHubState.authenticated, true);
    realtimeObserver.terminate();

    const briefingResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "trivia" }),
    });
    assert.equal(briefingResponse.status, 200);
    const briefingBody = await briefingResponse.json();
    assert.equal(briefingBody.room.view, "briefing");
    assert.match(briefingBody.room.game.briefing, /술래의 오른쪽/);

    const soloGameResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "trivia" }),
    });
    assert.equal(soloGameResponse.status, 200);
    const soloGameBody = await soloGameResponse.json();
    assert.equal(soloGameBody.room.view, "game");
    assert.equal(soloGameBody.room.roundNumber, 1);
    assert.equal(soloGameBody.room.game.answer, undefined);
    assert.equal(soloGameBody.room.game.deadline, undefined);
    assert.ok(soloGameBody.room.game.dealerId);

    const publicRoomResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`);
    assert.equal(publicRoomResponse.status, 200);
    const publicRoomBody = await publicRoomResponse.json();
    assert.equal(publicRoomBody.room.authenticated, false);
    assert.equal(publicRoomBody.room.game.answer, undefined);
    assert.equal(JSON.stringify(publicRoomBody.room).includes("sessionHash"), false);

    const revealResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "reveal-answer" }),
    });
    const revealBody = await revealResponse.json();
    assert.equal(revealBody.room.game.answerRevealed, true);
    assert.ok(revealBody.room.game.answer);

    const nextQuestionResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const nextQuestionBody = await nextQuestionResponse.json();
    assert.equal(nextQuestionBody.room.game.history.length, 2);
    assert.equal(nextQuestionBody.room.game.history[0].answer, undefined);

    const unauthorized = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-view", view: "result" }),
    });
    assert.equal(unauthorized.status, 401);

    const guestResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", player: { name: "중간참가자", avatar: "🐥" } }),
    });
    assert.equal(guestResponse.status, 200);
    const guestCookie = guestResponse.headers.get("set-cookie").split(";")[0];
    const guestBody = await guestResponse.json();
    assert.equal(guestBody.room.players.find((player) => player.id === guestBody.room.meId).status, "waiting");
    assert.equal(guestBody.room.game.answer, undefined);

    const soloResultResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "set-view", view: "result" }),
    });
    assert.equal(soloResultResponse.status, 200);
    const soloResultBody = await soloResultResponse.json();
    assert.equal(soloResultBody.room.view, "result");
    assert.ok(soloResultBody.room.game.answer);
    assert.equal(soloResultBody.room.game.history.length, 2);
    assert.ok(soloResultBody.room.game.history.every((item) => item.answer));

    const nextGameResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "initial" }),
    });
    assert.equal(nextGameResponse.status, 200);
    const nextGameBody = await nextGameResponse.json();
    assert.equal(nextGameBody.room.players.find((player) => player.name === "중간참가자").status, "active");
    assert.equal(nextGameBody.room.game.deadline, undefined);
    assert.ok(nextGameBody.room.game.dealerId);
    assert.notEqual(nextGameBody.room.game.playerOrder[0], nextGameBody.room.game.dealerId);
    const firstInitialCategory = nextGameBody.room.game.category;

    const initialRevealResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "reveal-answer" }),
    });
    const initialRevealBody = await initialRevealResponse.json();
    assert.ok(initialRevealBody.room.game.answer);

    const initialNextResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const initialNextBody = await initialNextResponse.json();
    assert.equal(initialNextBody.room.game.history.length, 2);
    assert.notEqual(initialNextBody.room.game.category, firstInitialCategory);

    const timerGameResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "ten-seconds" }),
    });
    assert.equal(timerGameResponse.status, 200);
    const timerSubmitResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "submit-timer", seconds: 10.12 }),
    });
    assert.equal(timerSubmitResponse.status, 200);
    const duplicateTimerResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "submit-timer", seconds: 9.99 }),
    });
    assert.equal(duplicateTimerResponse.status, 409);

    const chainGameResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "chain" }),
    });
    const chainGameBody = await chainGameResponse.json();
    const chainPrompt = chainGameBody.room.game.prompt;
    assert.ok(chainGameBody.room.game.deadline - Date.now() <= 5_000);
    const chainNextResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const chainNextBody = await chainNextResponse.json();
    assert.equal(chainNextBody.room.game.prompt, chainPrompt);
    assert.equal(chainNextBody.room.game.successfulPlayerIds.length, 1);
    const chainPassResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const chainPassBody = await chainPassResponse.json();
    assert.equal(chainPassBody.room.view, "result");
    assert.equal(chainPassBody.room.game.teamOutcome, "passed");

    const telestrationStartResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "telestration" }),
    });
    const telestrationHostStart = await telestrationStartResponse.json();
    const telestrationGuestStart = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: guestCookie } })).json();
    const hostPrompt = telestrationHostStart.room.game.telestrationTask.prompt;
    const guestPrompt = telestrationGuestStart.room.game.telestrationTask.prompt;
    for (let round = 1; round <= 3; round += 1) {
      const hostDraw = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: hostCookie },
        body: JSON.stringify({ action: "submit-telestration", strokes: [] }),
      });
      assert.equal(hostDraw.status, 200);
      const guestDraw = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: guestCookie },
        body: JSON.stringify({ action: "submit-telestration", strokes: [] }),
      });
      assert.equal(guestDraw.status, 200);
    }
    const hostGuessState = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    const guestGuessState = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: guestCookie } })).json();
    assert.equal(hostGuessState.room.game.telestrationTask.action, "guess");
    assert.equal(hostGuessState.room.game.telestrationTask.deadline, undefined);
    assert.equal(guestGuessState.room.game.telestrationTask.deadline, undefined);
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "submit-telestration", guess: guestPrompt }),
    });
    const telestrationFinishResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: guestCookie },
      body: JSON.stringify({ action: "submit-telestration", guess: "수동 인정 대상" }),
    });
    const telestrationFinishBody = await telestrationFinishResponse.json();
    assert.equal(telestrationFinishBody.room.view, "result");
    assert.equal(telestrationFinishBody.room.game.telestrationCorrectCount, 1);
    assert.equal(telestrationFinishBody.room.game.telestrationAutoCorrectChainIds.length, 1);
    const manualChain = telestrationFinishBody.room.game.telestrationResults.find((chain) => chain.prompt === hostPrompt);
    const manualAcceptResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "accept-telestration-answer", chainId: manualChain.id }),
    });
    const manualAcceptBody = await manualAcceptResponse.json();
    assert.equal(manualAcceptResponse.status, 200);
    assert.equal(manualAcceptBody.room.game.telestrationCorrectCount, 2);
    assert.deepEqual(manualAcceptBody.room.game.telestrationAcceptedChainIds, [manualChain.id]);

    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "color" }),
    });
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "color" }),
    });
    const photoForm = new FormData();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5xkAAAAASUVORK5CYII=", "base64");
    photoForm.append("photo", new Blob([png], { type: "image/png" }), "test.png");
    const photoResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}/photos`, { method: "POST", headers: { Cookie: hostCookie }, body: photoForm });
    assert.equal(photoResponse.status, 200);
    const photoBody = await photoResponse.json();
    assert.equal(photoBody.room.game.photoSubmissions.length, 1);
    const photoKey = photoBody.room.game.photoSubmissions[0].key;
    const storedPhoto = await fetch(`${baseUrl}/api/rooms/${body.room.code}/photos/${photoKey}`, { headers: { Cookie: hostCookie } });
    assert.equal(storedPhoto.status, 200);
    assert.equal(storedPhoto.headers.get("content-type"), "image/png");

    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "liar" }),
    });
    const dumbLiarResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "liar", mode: "dumb" }),
    });
    const dumbLiarHost = await dumbLiarResponse.json();
    const dumbLiarGuest = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: guestCookie } })).json();
    assert.equal(dumbLiarHost.room.game.privateRole.danger, false);
    assert.equal(dumbLiarGuest.room.game.privateRole.danger, false);
    assert.notEqual(dumbLiarHost.room.game.privateRole.value, dumbLiarGuest.room.game.privateRole.value);
    assert.ok([dumbLiarHost, dumbLiarGuest].some((item) => item.room.game.privateRole.label.includes("라이어")));
    assert.equal(dumbLiarHost.room.game.liarId, undefined);

    const hostLeaveResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "leave" }),
    });
    assert.equal(hostLeaveResponse.status, 200);
    const promotedGuest = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: guestCookie } })).json();
    assert.equal(promotedGuest.room.hostId, promotedGuest.room.meId);
    assert.equal(promotedGuest.room.view, "game");

    const lobbyResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: guestCookie },
      body: JSON.stringify({ action: "set-view", view: "lobby" }),
    });
    const lobbyBody = await lobbyResponse.json();
    assert.equal(lobbyBody.room.view, "lobby");
    assert.equal(lobbyBody.room.players.length, 1);

    const leaveResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: guestCookie },
      body: JSON.stringify({ action: "leave" }),
    });
    assert.equal(leaveResponse.status, 200);
    assert.equal((await leaveResponse.json()).room, null);
    assert.equal((await fetch(`${baseUrl}/api/rooms/${body.room.code}`)).status, 404);
  });
});

test("keeps the requested game set and removes excluded modes", async () => {
  const [page, layout, hosting, surprise, realtime, socketRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/surprise.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/realtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/socket/route.ts", import.meta.url), "utf8"),
  ]);
  for (const required of ["오리지널 라이어", "라이어-질문", "가짜 추억 찾기", "무한 훈민정음", "텔레그레이션", "모두 협동", "같은 게임 다시하기", "게임 시작", "사진 찍기", "재연결 중", "참가자 진행 상태", "다음 그림 공개", "정답으로 인정"]) {
    assert.match(page, new RegExp(required));
  }
  for (const removed of ["소리지르기 대결", "조용히 말해요", "흔들림 탐지", "고요 속의 외침", "음악퀴즈", "만장일치 방해꾼", "확대 사진 퀴즈", "범인은 질문을 모른다", "누가 걸렸는지는 우리끼리 판정", "마이크 판정 없음", "점수표 없음", "팀전 없음", "우리끼리 판정하고 있어요", "vote-correct"]) {
    assert.doesNotMatch(page, new RegExp(removed));
  }
  assert.match(page, /혼자 시작하기/);
  assert.doesNotMatch(page, /한 명만 더 기다려요|room\.players\.length < 2/);
  const rounds = await readFile(new URL("../app/api/_lib/rounds.ts", import.meta.url), "utf8");
  assert.match(rounds, /players\.length > 1 \? selectedPlayer : undefined/);
  assert.doesNotMatch(page, /wikipedia\.org\/api|commons\.wikimedia\.org\/w\/api/);
  assert.match(layout, /lang="ko"/);
  assert.match(surprise, /TWO TOUCH/);
  assert.match(surprise, /10 \* 60 \* 1000/);
  assert.match(surprise, /5 \* 60 \* 1000/);
  assert.match(page, /RANDOM_GAMES = ALL_GAMES\.filter\(\(game\) => game\.id !== "syllable"\)/);
  assert.match(rounds, /telestrationDeadline = nextRound === 4 \? undefined/);
  assert.match(page, /누르는 동안만 보여요/);
  assert.match(page, /FAST_SYNC_INTERVAL_MS = 500/);
  assert.match(page, /IDLE_SYNC_INTERVAL_MS = 1400/);
  assert.match(page, /HOST_ACTION_LOCK_MS = 350/);
  assert.match(page, /new WebSocket\(`\$\{protocol\}/);
  assert.match(page, /roomSocketRef\.current\?\.readyState === WebSocket\.OPEN/);
  assert.match(page, /roomRefreshRef\.current\(\)/);
  assert.match(realtime, /REALTIME_ROOM_CHECK_MS = 300/);
  assert.match(realtime, /loadLatest/);
  assert.match(realtime, /WebSocketPair/);
  assert.match(socketRoute, /authenticatePlayer/);
  assert.match(socketRoute, /readRoomRevision/);
  assert.match(page, /if \(!active \|\| inFlight \|\| roomMutationCountRef\.current > 0 \|\| document\.visibilityState === "hidden"\) return/);
  assert.match(page, /sequence < lastAppliedRoomSequenceRef\.current/);
  assert.match(page, /roomMutationCountRef\.current = Math\.max\(0, roomMutationCountRef\.current - 1\)/);
  assert.match(page, /setPointerCapture/);
  assert.match(page, /draggable=\{false\}/);
  assert.doesNotMatch(page, /onPointerLeave=\{\(\) => setRoleVisible\(false\)\}/);
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.game-shell \* \{ user-select: none; -webkit-user-select: none; \}/);
  assert.match(styles, /\.game-shell input, \.game-shell textarea/);
  assert.match(styles, /\.role-card \{[^}]*touch-action: none;[^}]*-webkit-touch-callout: none;/);
  const hostingConfig = JSON.parse(hosting);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, "UPLOADS");
});
