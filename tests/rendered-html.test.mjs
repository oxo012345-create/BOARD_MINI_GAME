import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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
    const thiefState = gemStates.find((state) => state.room.game.gemPrivate.role === "thief");
    const thiefId = thiefState.room.meId;
    const firstCaseKey = `${gemStates[0].room.game.gemCase.scene.id}:${gemStates[0].room.game.gemCase.stolenItem.id}`;

    const investigationResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "gem-start-investigation" }),
    });
    const investigationBody = await investigationResponse.json();
    assert.equal(investigationBody.room.game.gemPhase, "investigation");
    const firstQuestion = investigationBody.room.game.gemQuestion.id;
    const nextGemQuestionResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "gem-next-question" }),
    });
    assert.notEqual((await nextGemQuestionResponse.json()).room.game.gemQuestion.id, firstQuestion);
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

    await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "prepare-game", gameId: "gem-heist" }),
    });
    const repeatedGem = await (await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "gem-heist", specialRoles: false }),
    })).json();
    assert.notEqual(`${repeatedGem.room.game.gemCase.scene.id}:${repeatedGem.room.game.gemCase.stolenItem.id}`, firstCaseKey);
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

test("keeps the requested game set and removes excluded modes", async () => {
  const [page, layout, hosting, surprise, realtime, eventsRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/surprise.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/realtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/events/route.ts", import.meta.url), "utf8"),
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

test("ships the complete illustrated gem-heist case library", async () => {
  const source = await readFile(new URL("../app/api/_lib/gem-heist-data.ts", import.meta.url), "utf8");
  const expected = {
    locations: 20,
    stolenItems: 20,
    tools: 20,
    times: 10,
    traits: 30,
    alibis: 20,
    questions: 50,
    backgrounds: 30,
  };
  for (const [key, count] of Object.entries(expected)) {
    const section = source.match(new RegExp(`${key}: \\[([\\s\\S]*?)\\] satisfies`));
    assert.ok(section, `${key} section should exist`);
    assert.equal((section[1].match(/\{ id: "/g) ?? []).length, count, `${key} should contain ${count} curated cards`);
    assert.equal((section[1].match(/icon: "/g) ?? []).length, count, `${key} should illustrate every card`);
  }
});
