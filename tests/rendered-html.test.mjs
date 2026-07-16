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
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`vinext dev exited early:\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return await run(baseUrl, response);
      } catch { /* server is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`vinext dev did not become ready:\n${output}`);
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

    const soloStartResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "set-view", view: "hub" }),
    });
    assert.equal(soloStartResponse.status, 200);
    const soloStartBody = await soloStartResponse.json();
    assert.equal(soloStartBody.room.players.length, 1);
    assert.equal(soloStartBody.room.view, "hub");

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

    const publicRoomResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`);
    assert.equal(publicRoomResponse.status, 200);
    const publicRoomBody = await publicRoomResponse.json();
    assert.equal(publicRoomBody.room.authenticated, false);
    assert.equal(publicRoomBody.room.game.answer, undefined);
    assert.equal(JSON.stringify(publicRoomBody.room).includes("sessionHash"), false);

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

    const nextGameResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "start-game", gameId: "hunmin" }),
    });
    assert.equal(nextGameResponse.status, 200);
    const nextGameBody = await nextGameResponse.json();
    assert.equal(nextGameBody.room.players.find((player) => player.name === "중간참가자").status, "active");

    const guestLeaveResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: guestCookie },
      body: JSON.stringify({ action: "leave" }),
    });
    assert.equal(guestLeaveResponse.status, 200);

    const leaveResponse = await fetch(`${baseUrl}/api/rooms/${body.room.code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: hostCookie },
      body: JSON.stringify({ action: "leave" }),
    });
    assert.equal(leaveResponse.status, 200);
    assert.equal((await leaveResponse.json()).room, null);
    assert.equal((await fetch(`${baseUrl}/api/rooms/${body.room.code}`)).status, 404);
  });
});

test("keeps the requested game set and removes excluded modes", async () => {
  const [page, layout, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  for (const required of ["오리지널 라이어", "가짜 추억 찾기", "무한 훈민정음", "텔레그레이션", "모두 협동", "같은 게임 다시하기"]) {
    assert.match(page, new RegExp(required));
  }
  for (const removed of ["소리지르기 대결", "조용히 말해요", "흔들림 탐지", "고요 속의 외침", "음악퀴즈", "만장일치 방해꾼"]) {
    assert.doesNotMatch(page, new RegExp(removed));
  }
  assert.match(page, /혼자 시작하기/);
  assert.doesNotMatch(page, /한 명만 더 기다려요|room\.players\.length < 2/);
  const rounds = await readFile(new URL("../app/api/_lib/rounds.ts", import.meta.url), "utf8");
  assert.match(rounds, /players\.length > 1 \? selectedPlayer : undefined/);
  assert.doesNotMatch(page, /wikipedia\.org\/api|commons\.wikimedia\.org\/w\/api/);
  assert.match(layout, /lang="ko"/);
  const hostingConfig = JSON.parse(hosting);
  assert.match(hostingConfig.project_id, /^appgprj_/);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
});
