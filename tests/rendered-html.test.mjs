import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
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

async function patchWithConflictRetry(url, cookie, payload) {
  let response;
  let body;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(payload),
    });
    body = await response.json();
    if (response.status !== 409 || body.code !== "ROOM_CONFLICT") return { response, body };
    await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
  }
  return { response, body };
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
    const dealerHtml = await (await fetch(`${baseUrl}/dealer-cards-2d/index.html`)).text();
    const dealerScript = await readFile(new URL("../public/dealer-cards-2d/game.js", import.meta.url), "utf8");
    assert.match(dealerHtml, /data-menu="closed"/);
    assert.match(dealerHtml, /id="loading-state"/);
    assert.match(dealerHtml, /id="lot-actions"/);
    assert.doesNotMatch(dealerHtml, /sheet-handle/);
    assert.doesNotMatch(dealerHtml, /data-tab="game"/);
    assert.doesNotMatch(dealerHtml, /data-initial/);
    assert.equal((dealerHtml.match(/class="dock-icon"/g) ?? []).length, 3);
    assert.match(dealerScript, /게임 정보를 불러오는 중/);
    assert.match(dealerScript, /menuOpen = true/);
    assert.doesNotMatch(dealerScript, /setInterval\(sync, 650\)/);

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
    assert.ok(body.room.revision >= 1);
    assert.ok(Math.abs(body.room.serverNow - Date.now()) < 2_000);
    assert.equal(JSON.stringify(body.room).includes("sessionHash"), false);

    const lobbyRefresh = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    assert.equal(lobbyRefresh.room.view, "lobby");
    assert.equal(lobbyRefresh.room.surprise.phase, "waiting");
    assert.ok(lobbyRefresh.room.surprise.endsAt - Date.now() > 290_000);

    const realtimeProbe = await fetch(`${baseUrl}/api/rooms/${body.room.code}/events?revision=${body.room.revision}`, {
      headers: { Cookie: hostCookie },
    });
    assert.equal(realtimeProbe.status, 200);
    const realtimeHubState = fetch(`${baseUrl}/api/rooms/${body.room.code}/events?wait=1&revision=${body.room.revision}`, {
      headers: { Cookie: hostCookie },
    }).then((eventResponse) => eventResponse.json());

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
    assert.equal(pushedHubState.room.meId, body.room.meId);
    assert.ok(pushedHubState.room.revision > body.room.revision);
    assert.equal(pushedHubState.room.authenticated, true);

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

    const tasteStartResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "taste" }),
    });
    const tasteStart = await tasteStartResponse.json();
    const [tasteA, tasteB] = tasteStart.room.game.choices;
    const [hostTaste, guestTaste] = await Promise.all([
      patchWithConflictRetry(`${baseUrl}/api/rooms/${body.room.code}`, hostCookie, { action: "taste-choice", choice: tasteA }),
      patchWithConflictRetry(`${baseUrl}/api/rooms/${body.room.code}`, guestCookie, { action: "taste-choice", choice: tasteB }),
    ]);
    assert.equal(hostTaste.response.status, 200);
    assert.equal(guestTaste.response.status, 200);
    const tasteState = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    assert.equal(tasteState.room.game.selectionStatus.length, 2);
    assert.equal(tasteState.room.game.myChoice, tasteA);

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

    const groupInitialResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "group-initial" }),
    });
    const groupInitialBody = await groupInitialResponse.json();
    assert.ok(groupInitialBody.room.game.deadline - groupInitialBody.room.serverNow <= 3_000);
    const groupInitialNextResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const groupInitialNextBody = await groupInitialNextResponse.json();
    assert.equal(groupInitialNextBody.room.view, "game");
    assert.equal(groupInitialNextBody.room.game.successfulPlayerIds.length, 1);
    assert.equal(groupInitialNextBody.room.game.history.length, 2);
    assert.ok(groupInitialNextBody.room.game.deadline - groupInitialNextBody.room.serverNow <= 3_000);
    const groupInitialPassResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "next-question" }),
    });
    const groupInitialPassBody = await groupInitialPassResponse.json();
    assert.equal(groupInitialPassBody.room.view, "result");
    assert.equal(groupInitialPassBody.room.game.teamOutcome, "passed");

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

    const thirdResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", player: { name: "세번째", avatar: "🐰" } }),
    });
    assert.equal(thirdResponse.status, 200);
    const thirdCookie = thirdResponse.headers.get("set-cookie").split(";")[0];
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "telestration" }),
    });
    const telestrationPlayers = [hostCookie, guestCookie, thirdCookie];
    for (let round = 1; round <= 3; round += 1) {
      for (let playerIndex = 0; playerIndex < telestrationPlayers.length; playerIndex += 1) {
        const drawResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: telestrationPlayers[playerIndex] },
          body: JSON.stringify({ action: "submit-telestration", strokes: [{ points: [{ x: playerIndex / 10, y: round / 10 }] }] }),
        });
        assert.equal(drawResponse.status, 200);
      }
    }
    let threePlayerResult;
    for (let playerIndex = 0; playerIndex < telestrationPlayers.length; playerIndex += 1) {
      const guessResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: telestrationPlayers[playerIndex] },
        body: JSON.stringify({ action: "submit-telestration", guess: `추측 ${playerIndex}` }),
      });
      assert.equal(guessResponse.status, 200);
      threePlayerResult = await guessResponse.json();
    }
    assert.equal(threePlayerResult.room.view, "result");
    assert.ok(threePlayerResult.room.game.telestrationResults.every((chain) => {
      const firstArtist = chain.steps.find((step) => Array.isArray(step.strokes))?.playerId;
      const guesser = [...chain.steps].reverse().find((step) => typeof step.guess === "string")?.playerId;
      return firstArtist && guesser && firstArtist !== guesser;
    }));
    const thirdLeaveResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: thirdCookie },
      body: JSON.stringify({ action: "leave" }),
    });
    assert.equal(thirdLeaveResponse.status, 200);

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
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5xkAAAAASUVORK5CYII=", "base64");
    const makePhotoForm = () => { const form = new FormData(); form.append("photo", new Blob([png], { type: "image/png" }), "test.png"); return form; };
    const [hostPhotoResponse, guestPhotoResponse] = await Promise.all([
      fetch(`${baseUrl}/api/rooms/${body.room.code}/photos`, { method: "POST", headers: { Cookie: hostCookie }, body: makePhotoForm() }),
      fetch(`${baseUrl}/api/rooms/${body.room.code}/photos`, { method: "POST", headers: { Cookie: guestCookie }, body: makePhotoForm() }),
    ]);
    assert.equal(hostPhotoResponse.status, 200);
    assert.equal(guestPhotoResponse.status, 200);
    const photoBody = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    assert.equal(photoBody.room.game.photoSubmissions.length, 2);
    for (const submission of photoBody.room.game.photoSubmissions) {
      const storedPhoto = await fetch(`${baseUrl}/api/rooms/${body.room.code}/photos/${submission.key}`, { headers: { Cookie: hostCookie } });
      assert.equal(storedPhoto.status, 200);
      assert.equal(storedPhoto.headers.get("content-type"), "image/png");
    }

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
    assert.equal(dumbLiarHost.room.game.privateRole.label, dumbLiarGuest.room.game.privateRole.label);
    assert.ok([dumbLiarHost, dumbLiarGuest].every((item) => !item.room.game.privateRole.label.includes("라이어")));
    assert.ok([dumbLiarHost, dumbLiarGuest].every((item) => !item.room.game.privateRole.value.includes("라이어")));
    assert.equal(dumbLiarHost.room.game.liarId, undefined);

    const firstDumbResultResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "set-view", view: "result" }),
    });
    const firstDumbResult = await firstDumbResultResponse.json();
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "liar" }),
    });
    const repeatedDumbStart = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "liar", mode: "dumb" }),
    });
    assert.equal(repeatedDumbStart.status, 200);
    const repeatedDumbResultResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "set-view", view: "result" }),
    });
    const repeatedDumbResult = await repeatedDumbResultResponse.json();
    assert.notEqual(repeatedDumbResult.room.game.answer, firstDumbResult.room.game.answer);
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "liar", mode: "dumb" }),
    });

    const gemGuests = [];
    for (const [name, avatar] of [["탐정셋", "🦊"], ["탐정넷", "🐻"]]) {
      const response = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", player: { name, avatar } }),
      });
      assert.equal(response.status, 200);
      gemGuests.push(response.headers.get("set-cookie").split(";")[0]);
    }
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "gem-heist" }),
    });
    const gemStartResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "gem-heist", specialRoles: true }),
    });
    assert.equal(gemStartResponse.status, 200);
    const gemCookies = [hostCookie, guestCookie, ...gemGuests];
    const gemStates = [];
    for (const cookie of gemCookies) {
      gemStates.push(await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: cookie } })).json());
    }
    assert.equal(gemStates.every((state) => state.room.game.gemCase.stolenItem.label), true);
    assert.equal(gemStates.every((state) => state.room.game.gemPrivate && !state.room.game.gemRoles && !state.room.game.gemThiefId), true);
    assert.equal(gemStates.filter((state) => state.room.game.gemPrivate.role === "thief").length, 1);
    assert.equal(gemStates.filter((state) => state.room.game.gemPrivate.role === "detective").length, 1);
    assert.equal(gemStates.filter((state) => state.room.game.gemPrivate.role === "accomplice").length, 0);
    assert.equal(gemStates.every((state) => state.room.game.gemPrivate.dossier.statement.locationClaim), true);
    assert.equal(gemStates.every((state) => state.room.game.gemPrivate.dossier.statement.privateSecret), true);
    const gemStateByPlayer = new Map(gemStates.map((state) => [state.room.meId, state]));
    for (const state of gemStates) {
      const statement = state.room.game.gemPrivate.dossier.statement;
      assert.equal(statement.witnessIds.length >= 1, true);
      for (const witnessId of statement.witnessIds) {
        const witnessStatement = gemStateByPlayer.get(witnessId).room.game.gemPrivate.dossier.statement;
        assert.equal(witnessStatement.witnessIds.includes(state.room.meId), true);
        assert.equal(witnessStatement.witnessLocationId, statement.witnessLocationId);
      }
    }
    const publicAlibiIds = gemStates.map((state) => {
      const info = state.room.game.gemPrivate;
      return info.role === "thief" ? info.dossier.claimedAlibi.id : info.dossier.alibi.id;
    });
    assert.equal(new Set(publicAlibiIds).size, gemStates.length);
    assert.equal(gemStates.every((state) => !state.room.game.gemSolution), true);
    const thiefState = gemStates.find((state) => state.room.game.gemPrivate.role === "thief");
    const thiefId = thiefState.room.meId;
    const crimeLocationId = thiefState.room.game.gemCase.location.id;
    assert.notEqual(thiefState.room.game.gemPrivate.dossier.claimedAlibi.locationId, crimeLocationId);
    for (const state of gemStates.filter((item) => item.room.game.gemPrivate.role !== "thief")) {
      assert.equal(state.room.game.gemPrivate.dossier.alibi.locationId, state.room.game.gemPrivate.dossier.location.id);
    }
    const investigatorClueCounts = gemStates
      .filter((state) => ["investigator", "detective"].includes(state.room.game.gemPrivate.role))
      .map((state) => state.room.game.gemPrivate.clues.length);
    assert.equal(investigatorClueCounts.every((count) => count >= 2), true);
    assert.equal(new Set(investigatorClueCounts).size > 1, true);
    const investigatorClueText = gemStates
      .filter((state) => ["investigator", "detective"].includes(state.room.game.gemPrivate.role))
      .flatMap((state) => state.room.game.gemPrivate.clues.map((clue) => clue.text))
      .join("\n");
    const investigatorClueTitles = gemStates
      .filter((state) => ["investigator", "detective"].includes(state.room.game.gemPrivate.role))
      .flatMap((state) => state.room.game.gemPrivate.clues.map((clue) => clue.title));
    for (const coreTitle of ["인상착의 대조", "이동 기록 대조", "증거 형식 대조"]) {
      assert.equal(investigatorClueTitles.includes(coreTitle), true);
    }
    assert.doesNotMatch(investigatorClueText, /중 한 명입니다|정확한 특징은|동선은 범행 시각과 일치하지 않습니다/);
    const firstCaseKey = `${gemStates[0].room.game.gemCase.scene.id}:${gemStates[0].room.game.gemCase.stolenItem.id}`;

    const investigationResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "gem-start-investigation" }),
    });
    const investigationBody = await investigationResponse.json();
    assert.equal(investigationBody.room.game.gemPhase, "investigation");
    const firstQuestion = investigationBody.room.game.gemQuestion.id;
    const questionIds = [firstQuestion];
    const questionGroups = [investigationBody.room.game.gemQuestion.group];
    for (let questionIndex = 1; questionIndex < 6; questionIndex += 1) {
      const nextGemQuestionResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: hostCookie },
        body: JSON.stringify({ action: "gem-next-question" }),
      });
      const nextGemQuestionBody = await nextGemQuestionResponse.json();
      questionIds.push(nextGemQuestionBody.room.game.gemQuestion.id);
      questionGroups.push(nextGemQuestionBody.room.game.gemQuestion.group);
    }
    assert.equal(new Set(questionIds).size, 6);
    assert.equal(new Set(questionGroups).size, 6);
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "gem-start-vote" }),
    });
    const activeIds = gemStates.map((state) => state.room.meId);
    for (let index = 0; index < gemCookies.length; index += 1) {
      const voterId = activeIds[index];
      const suspectId = voterId === thiefId ? activeIds.find((id) => id !== thiefId) : thiefId;
      const voteResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: gemCookies[index] },
        body: JSON.stringify({ action: "gem-vote", suspectId }),
      });
      assert.equal(voteResponse.status, 200);
    }
    const gemResult = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: hostCookie } })).json();
    assert.equal(gemResult.room.view, "result");
    assert.equal(gemResult.room.game.gemResult.caught, true);
    assert.equal(gemResult.room.game.gemResult.thiefId, thiefId);
    assert.equal(Object.keys(gemResult.room.game.gemResult.votes).length, 4);
    assert.equal(gemResult.room.game.gemResult.solution.decisiveClues.length, 3);
    assert.equal(gemResult.room.game.gemResult.solution.candidateSets.traits.length, 2);
    assert.equal(gemResult.room.game.gemResult.solution.candidateSets.locations.length, 2);
    assert.equal(gemResult.room.game.gemResult.solution.candidateSets.evidenceGroups.length, 2);
    assert.equal(gemResult.room.game.gemResult.solution.finalSuspectIds.length, 2);
    assert.equal(gemResult.room.game.gemResult.solution.finalSuspectIds.includes(thiefId), true);
    assert.equal(gemResult.room.game.gemResult.solution.decoyIds.length, 1);
    assert.match(gemResult.room.game.gemResult.solution.reconstruction, /세 후보군|실제로|가짜|진술/);

    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "gem-heist" }),
    });
    const repeatedGem = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "gem-heist", specialRoles: false, difficulty: "easy" }),
    })).json();
    assert.notEqual(`${repeatedGem.room.game.gemCase.scene.id}:${repeatedGem.room.game.gemCase.stolenItem.id}`, firstCaseKey);
    assert.equal(repeatedGem.room.game.gemDifficulty, "easy");
    const repeatedGemStates = [];
    for (const cookie of gemCookies) {
      repeatedGemStates.push(await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: cookie } })).json());
    }
    const repeatedThiefId = repeatedGemStates.find((state) => state.room.game.gemPrivate.role === "thief").room.meId;
    assert.notEqual(repeatedThiefId, thiefId);
    assert.equal(repeatedGemStates
      .filter((state) => state.room.game.gemPrivate.role === "investigator")
      .every((state) => state.room.game.gemPrivate.clues.length >= 3), true);
    let previousGemFingerprint = {
      scene: repeatedGem.room.game.gemCase.scene.id,
      item: repeatedGem.room.game.gemCase.stolenItem.id,
      thief: repeatedThiefId,
    };
    for (let roundIndex = 0; roundIndex < 12; roundIndex += 1) {
      const difficulty = ["easy", "normal", "hard"][roundIndex % 3];
      const stressStart = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: hostCookie },
        body: JSON.stringify({ action: "start-game", gameId: "gem-heist", specialRoles: roundIndex % 2 === 0, difficulty }),
      });
      assert.equal(stressStart.status, 200);
      const stressStates = [];
      for (const cookie of gemCookies) {
        stressStates.push(await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, { headers: { Cookie: cookie } })).json());
      }
      const stressGame = stressStates[0].room.game;
      const stressThief = stressStates.find((state) => state.room.game.gemPrivate.role === "thief").room.meId;
      assert.notEqual(stressGame.gemCase.scene.id, previousGemFingerprint.scene);
      assert.notEqual(stressGame.gemCase.stolenItem.id, previousGemFingerprint.item);
      assert.notEqual(stressThief, previousGemFingerprint.thief);
      assert.equal(stressStates.every((state) => state.room.game.gemPrivate.dossier.statement.pressurePoint), true);
      assert.equal(new Set(stressStates.map((state) => {
        const info = state.room.game.gemPrivate;
        return info.role === "thief" ? info.dossier.claimedAlibi.id : info.dossier.alibi.id;
      })).size, stressStates.length);
      assert.equal(stressStates
        .filter((state) => ["investigator", "detective"].includes(state.room.game.gemPrivate.role))
        .every((state) => state.room.game.gemPrivate.clues.length >= (difficulty === "easy" ? 3 : 2)), true);
      previousGemFingerprint = { scene: stressGame.gemCase.scene.id, item: stressGame.gemCase.stolenItem.id, thief: stressThief };
    }
    for (let index = 0; index < gemGuests.length; index += 1) {
      const leave = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: gemGuests[index] },
        body: JSON.stringify({ action: "leave" }),
      });
      assert.equal(leave.status, 200);
    }
    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "liar", mode: "normal" }),
    });

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

test("provides a safe solo debug mode for every dealer phase", async () => {
  const fixture = await import(new URL("../public/dealer-cards-2d/debug-fixtures.js", import.meta.url));
  const [debugHtml, debugScript, debugPanel, debugStyles] = await Promise.all([
    readFile(new URL("../public/dealer-cards-2d/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/dealer-cards-2d/game.js", import.meta.url), "utf8"),
    readFile(new URL("../public/dealer-cards-2d/debug-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../public/dealer-cards-2d/styles/debug.css", import.meta.url), "utf8"),
  ]);
  assert.equal(fixture.DEBUG_SCENARIOS.length, 8);
  for (const count of [1, 4, 5, 8]) {
    const state = fixture.createDebugState("select", count);
    assert.equal(state.room.players.length, count);
    assert.equal(state.dealer.phase, "select");
    assert.equal(state.dealer.candidates[state.room.meId].length, 3);
    const auction = fixture.applyDebugAction(state, "dealer-select", { itemIndex: 1 });
    assert.equal(auction.dealer.phase, "auction");
    assert.ok(auction.dealer.currentItem);
  }
  const selectedThirdLot = fixture.applyDebugAction(fixture.createDebugState("select", 4), "dealer-select", { itemIndex: 2 });
  assert.equal(selectedThirdLot.dealer.phase, "auction");
  assert.equal(selectedThirdLot.dealer.currentItem.id, 24);
  const expiredAuction = fixture.createDebugState("auction-mystery", 4);
  expiredAuction.dealer.deadline = Date.now() - 1;
  const expiredRevision = expiredAuction.room.revision;
  const blockedBid = fixture.applyDebugAction(expiredAuction, "dealer-bid");
  assert.equal(blockedBid.room.revision, expiredRevision);
  assert.equal(blockedBid.dealer.currentBid, expiredAuction.dealer.currentBid);
  let state = fixture.createDebugState("auction-mystery", 4);
  assert.equal(state.dealer.knowsPrice, false);
  assert.equal(state.dealer.knowsClauses, false);
  state = fixture.transitionDebugPhase(state, "shop");
  assert.equal(state.dealer.phase, "shop");
  state = fixture.applyDebugAction(state, "dealer-reroll");
  assert.equal(state.dealer.rerolls[state.room.meId], 1);
  assert.deepEqual(state.dealer.shopOffers[state.room.meId], [1, 5, 14]);
  assert.match(debugHtml, /type="module" src="\.\/game\.js/);
  assert.match(debugScript, /debugMode/);
  assert.match(debugScript, /mountDebugPanel/);
  assert.match(debugPanel, /로컬 디버그/);
  assert.match(debugStyles, /debug-panel/);
  assert.match(debugStyles, /body\[data-debug-panel="closed"\] \.debug-panel \{ display: none; \}/);
});

test("keeps the requested game set and removes excluded modes", async () => {
  const [page, layout, hosting, surprise, realtime, eventsRoute, roomRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/surprise.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/realtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/route.ts", import.meta.url), "utf8"),
  ]);
  for (const required of ["오리지널 라이어", "라이어-질문", "가짜 추억 찾기", "무한 훈민정음", "텔레그레이션", "모두 협동", "미니(보드)게임", "같은 게임 다시하기", "게임 시작", "사진 찍기", "재연결 중", "참가자 진행 상태", "다음 그림 공개", "정답으로 인정"]) {
    assert.ok(page.includes(required), `${required} should be present`);
  }
  assert.match(page, /const BOARD_GAMES:[\s\S]*?id: "gem-heist"[\s\S]*?category: "board"/);
  assert.match(page, /const ALL_GAMES = \[\.\.\.SOLO_GAMES, \.\.\.COOP_GAMES, \.\.\.BOARD_GAMES\]/);
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
  assert.match(rounds, /gemCandidateIds/);
  assert.match(rounds, /사건 시각과 맞지 않는 알리바이가 있습니다/);
  assert.match(rounds, /모든 단서를 합쳤을 때 범인을 포함한 용의자 두 명이 남지 않습니다/);
  assert.match(page, /단서 1개만 공개 · 최종 2명은 대화로 판별/);
  assert.match(roomRoute, /handleGemInvestigationTimeout/);
  assert.match(page, /누르는 동안만 보여요/);
  assert.match(page, /FAST_SYNC_INTERVAL_MS = 500/);
  assert.match(page, /IDLE_SYNC_INTERVAL_MS = 1400/);
  assert.match(page, /HOST_ACTION_LOCK_MS = 350/);
  assert.match(page, /patchRoomWithConflictRetry/);
  assert.match(page, /다시 참여할까요/);
  assert.match(page, /기밀 역할 확인하기/);
  assert.match(page, /events\?wait=1&revision=/);
  assert.match(page, /REALTIME_SAFETY_SYNC_INTERVAL_MS = 5000/);
  assert.match(page, /roomRefreshRef\.current\(\)/);
  assert.match(realtime, /REALTIME_ROOM_CHECK_MS = 300/);
  assert.match(realtime, /loadLatest/);
  assert.match(realtime, /REALTIME_WAIT_MS = 12_000/);
  assert.match(eventsRoute, /authenticatePlayer/);
  assert.match(eventsRoute, /readRoomRevision/);
  assert.match(page, /if \(!active \|\| inFlight \|\| roomMutationCountRef\.current > 0 \|\| document\.visibilityState === "hidden"\) return/);
  assert.match(page, /sequence < lastAppliedRoomSequenceRef\.current/);
  assert.match(page, /roomMutationCountRef\.current = Math\.max\(0, roomMutationCountRef\.current - 1\)/);
  assert.match(page, /setPointerCapture/);
  assert.match(page, /draggable=\{false\}/);
  assert.match(page, /SurprisePosition>\(\{ side: "right", y: 220 \}\)/);
  assert.match(page, /setSurprisePosition\(\{ side: "right"/);
  assert.match(page, /사진을 불러오지 못했어요/);
  assert.match(page, /다시 불러오기/);
  assert.match(page, /roleTouchRevealRef/);
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.game-shell \* \{ user-select: none; -webkit-user-select: none; \}/);
  assert.match(styles, /\.game-shell input, \.game-shell textarea/);
  assert.match(styles, /\.role-card \{[^}]*touch-action: pan-y;[^}]*-webkit-touch-callout: none;/);
  assert.match(styles, /\.topbar-actions button \{[^}]*min-height: 44px;/);
  const hostingConfig = JSON.parse(hosting);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, "UPLOADS");
});

test("ships 1000 unique trivia questions and one fixed image catalog", async () => {
  const [{ GAME_CONTENT }, catalog, generatedContent, generatedImages, imageSource] = await Promise.all([
    import(new URL(`../app/api/_lib/content-data.js?test=${Date.now()}`, import.meta.url)),
    readFile(new URL("../content-catalog.html", import.meta.url), "utf8"),
    readFile(new URL("../content-data.js", import.meta.url), "utf8"),
    readFile(new URL("../verified-image-data.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/images.ts", import.meta.url), "utf8"),
  ]);
  const trivia = GAME_CONTENT.triviaMedium;
  assert.equal(trivia.length, 1000);
  assert.equal(new Set(trivia.map((item) => item.question)).size, 1000);
  assert.ok(trivia.every((item) => item.question && item.answer));
  assert.match(catalog, /verified-image-data\.js/);
  assert.match(catalog, /loadVerifiedGallery\('#people-images',verifiedImages\.people\)/);
  assert.match(catalog, /게임 출제 목록과 동일/);
  assert.match(generatedContent, /window\.GAME_CONTENT/);
  assert.match(generatedContent, /\"triviaMedium\":\[/);
  assert.match(generatedImages, /window\.HANPAN_VERIFIED_IMAGES/);
  const registeredImages = [...imageSource.matchAll(/wiki\("[^"]+",/g)].length;
  const catalogImages = (generatedImages.match(/\"id\":/g) ?? []).length;
  assert.equal(catalogImages, registeredImages);
});

test("uses natural Korean subject particles in case reports", async () => {
  const { withSubjectParticle } = await import(new URL(`../app/api/_lib/korean-particles.js?test=${Date.now()}`, import.meta.url));
  assert.equal(withSubjectParticle("태양의 티아라"), "태양의 티아라가");
  assert.equal(withSubjectParticle("왕관"), "왕관이");
});

test("ships the complete 230-asset gem-heist visual system", async () => {
  const source = await readFile(new URL("../app/api/_lib/gem-heist-data.ts", import.meta.url), "utf8");
  const roundsSource = await readFile(new URL("../app/api/_lib/rounds.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const assets = await readFile(new URL("../app/gem-heist-assets.ts", import.meta.url), "utf8");
  const expected = {
    locations: 20,
    stolenItems: 20,
    tools: 20,
    times: 10,
    traits: 30,
    alibis: 50,
    questions: 50,
    backgrounds: 30,
  };
  for (const [key, count] of Object.entries(expected)) {
    const section = source.match(new RegExp(`${key}: \\[([\\s\\S]*?)\\] satisfies`));
    assert.ok(section, `${key} section should exist`);
    assert.equal((section[1].match(/\{ id: "/g) ?? []).length, count, `${key} should contain ${count} curated cards`);
    assert.equal((section[1].match(/icon: "/g) ?? []).length, count, `${key} should illustrate every card`);
  }
  const alibis = source.match(/alibis: \[([\s\S]*?)\] satisfies/);
  assert.ok(alibis);
  assert.equal((alibis[1].match(/locationId: "/g) ?? []).length, 50);
  assert.equal((alibis[1].match(/evidenceGroup: "/g) ?? []).length, 50);
  const alibiCards = [...alibis[1].matchAll(/\{ id: "([^"]+)", label: "([^"]+)", icon: "([^"]+)", detail: "([^"]+)", locationId: "([^"]+)", evidenceGroup: "([^"]+)" \}/g)]
    .map((match) => ({ id: match[1], label: match[2], detail: match[4], locationId: match[5], evidenceGroup: match[6] }));
  assert.equal(alibiCards.length, 50);
  for (const field of ["id", "label", "detail"]) {
    assert.equal(new Set(alibiCards.map((card) => card[field])).size, 50, `alibi ${field} values should all be unique`);
  }
  const locationIds = new Set([...source.match(/locations: \[([\s\S]*?)\] satisfies/)?.[1].matchAll(/\{ id: "([^"]+)"/g) ?? []].map((match) => match[1]));
  assert.equal(alibiCards.every((card) => locationIds.has(card.locationId)), true);
  const evidenceCounts = Object.groupBy(alibiCards, (card) => card.evidenceGroup);
  assert.deepEqual(Object.keys(evidenceCounts).sort(), ["단독 진술", "목격 진술", "사진 기록", "전자 기록"]);
  assert.equal(Object.values(evidenceCounts).every((cards) => cards.length >= 8), true);
  const compactBigrams = (text) => {
    const compact = text.replace(/[^가-힣a-z0-9]/gi, "");
    return new Set([...compact].slice(0, -1).map((character, index) => character + compact[index + 1]));
  };
  for (let left = 0; left < alibiCards.length; left += 1) {
    for (let right = left + 1; right < alibiCards.length; right += 1) {
      const a = compactBigrams(alibiCards[left].label);
      const b = compactBigrams(alibiCards[right].label);
      const overlap = [...a].filter((value) => b.has(value)).length;
      const similarity = overlap / new Set([...a, ...b]).size;
      assert.ok(similarity < 0.72, `alibis are too similar: ${alibiCards[left].label} / ${alibiCards[right].label}`);
    }
  }
  const timeIds = [...source.match(/times: \[([\s\S]*?)\] satisfies/)?.[1].matchAll(/\{ id: "([^"]+)"/g) ?? []].map((match) => match[1]);
  const timeMapBody = roundsSource.match(/const GEM_ALIBI_TIME_IDS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const allowedTimes = new Map([...timeMapBody.matchAll(/"([^"]+)": \[([^\]]+)\]/g)]
    .map((match) => [match[1], [...match[2].matchAll(/"([^"]+)"/g)].map((time) => time[1])]));
  assert.equal([...allowedTimes.keys()].every((id) => alibiCards.some((card) => card.id === id)), true);
  assert.equal([...allowedTimes.values()].flat().every((id) => timeIds.includes(id)), true);
  for (const timeId of timeIds) {
    const compatible = alibiCards.filter((card) => !allowedTimes.has(card.id) || allowedTimes.get(card.id).includes(timeId));
    assert.ok(compatible.length >= 8, `${timeId} should have enough compatible alibis for eight players`);
    assert.equal(new Set(compatible.map((card) => card.evidenceGroup)).size, 4, `${timeId} should retain every evidence type`);
  }
  for (const asset of ["gem-case-scene.webp", "gem-secret-dossier.webp", "gem-suspects.webp", "gem-alibi.webp", "gem-clue.webp", "gem-question.webp", "gem-evidence.webp"]) {
    const info = await stat(new URL(`../public/${asset}`, import.meta.url));
    assert.ok(info.size > 30_000, `${asset} should be a high-quality photographic asset`);
    if (asset !== "gem-clue.webp") assert.match(`${page}\n${css}\n${assets}`, new RegExp(asset.replace(".", "\\.")));
  }
  const photographicAssets = {
    locations: 20,
    items: 20,
    tools: 20,
    traits: 30,
    alibis: 50,
    questions: 50,
    scenes: 30,
  };
  const dataSectionByAssetKind = {
    locations: "locations",
    items: "stolenItems",
    tools: "tools",
    traits: "traits",
    alibis: "alibis",
    questions: "questions",
    scenes: "backgrounds",
  };
  let photoCount = 0;
  for (const [kind, expectedCount] of Object.entries(photographicAssets)) {
    const files = (await readdir(new URL(`../public/gem-heist/${kind}/`, import.meta.url))).filter((file) => file.endsWith(".webp")).sort();
    assert.equal(files.length, expectedCount, `${kind} should contain ${expectedCount} unique photographs`);
    const section = source.match(new RegExp(`${dataSectionByAssetKind[kind]}: \\[([\\s\\S]*?)\\] satisfies`));
    assert.ok(section);
    const expectedFiles = [...section[1].matchAll(/\{ id: "([^"]+)"/g)].map((match) => `${match[1]}.webp`).sort();
    assert.deepEqual(files, expectedFiles, `${kind} filenames should match every content ID exactly`);
    photoCount += files.length;
    for (const file of files) {
      const info = await stat(new URL(`../public/gem-heist/${kind}/${file}`, import.meta.url));
      assert.ok(info.size > 20_000, `${kind}/${file} should be a production photographic asset`);
    }
  }
  assert.equal(photoCount, 220);
  assert.equal(Object.values(photographicAssets).reduce((sum, count) => sum + count, 0) + 10, 230);
  assert.match(page, /gemAsset\("locations", caseFile\.location\.id\)/);
  assert.match(page, /gemAsset\("items", caseFile\.stolenItem\.id\)/);
  assert.match(page, /gemAsset\("tools", caseFile\.tool\.id\)/);
  assert.match(page, /gemAsset\("traits", dossier\.trait\.id\)/);
  assert.match(page, /gemAsset\("alibis", shownAlibi\.id\)/);
  assert.match(page, /gemAsset\("questions", currentGame\.gemQuestion\.id\)/);
  assert.match(page, /gemAsset\("scenes", caseFile\.scene\.id\)/);
  assert.match(page, /className="gem-scene-photo"/);
  assert.match(page, /className="gem-evidence-copy"/);
  assert.match(page, /className="gem-role-overlay"/);
  assert.match(page, /onClick=\{\(\) => onVisibleChange\(true\)\}/);
  assert.match(page, /onClick=\{\(\) => onVisibleChange\(false\)\}/);
  assert.match(page, /자세한 진술 보기/);
  assert.match(page, /사건의 전말 보기/);
  assert.match(page, /사건 파일 닫기/);
  assert.doesNotMatch(page, /addEventListener\("touchend", releaseTouch/);
  assert.match(css, /\.gem-secret-file\s*\{[\s\S]*?touch-action:\s*pan-y/);
  assert.match(page, /GEM_CLOCK_ANGLES/);
  assert.doesNotMatch(page, /gem-scene-location|gem-scene-gem|gem-scene-tool/);
});
