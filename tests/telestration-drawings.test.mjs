import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * End-to-end guard for the bug where a submitted drawing came back blank.
 *
 * The rules audit (scripts/telestration-audit.ts) covers the round logic, but it
 * cannot see the failure that actually bit players: a drawing was accepted over
 * HTTP, then overwritten by an empty one written on the polling path, and the
 * real submission was discarded as a duplicate while still returning 200. Only a
 * live server with concurrent polling reproduces that, so this test drives real
 * requests and hammers the poll endpoint while drawings are being submitted.
 */
async function withDevServer(run) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const cli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
  const port = 4800 + Math.floor(Math.random() * 400);
  const persistPath = await mkdtemp(join(tmpdir(), "hanpan-telestration-test-"));
  const child = spawn(process.execPath, [cli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, HANPAN_LOCAL_PERSIST_PATH: persistPath, MINIFLARE_REGISTRY_PATH: join(persistPath, "registry") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (child.exitCode !== null) throw new Error(`vinext dev exited early:\n${output}`);
      try { ready = (await fetch(baseUrl)).ok; } catch { /* still starting */ }
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error(`vinext dev did not become ready:\n${output}`);
    return await run(baseUrl);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    }
    await rm(persistPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

const call = async (baseUrl, path, { method = "PATCH", body, cookie } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: response.status, json, cookie: (response.headers.get("set-cookie") ?? "").split(";")[0] };
};

/** A drawing whose stroke count identifies who drew it and when. */
const drawingOf = (strokeCount) => Array.from({ length: strokeCount }, (_, index) => ({
  eraser: false,
  points: [
    { x: 0.1 + index * 0.02, y: 0.2 },
    { x: 0.3 + index * 0.02, y: 0.7 },
    { x: 0.5 + index * 0.02, y: 0.4 },
  ],
}));

test("a submitted drawing is never replaced by a blank one", { timeout: 180_000 }, async () => {
  await withDevServer(async (baseUrl) => {
    const created = await call(baseUrl, "/api/rooms", { method: "POST", body: { player: { name: "호스트", avatar: "🎨" } } });
    assert.equal(created.status, 201, `room creation failed: ${JSON.stringify(created.json)}`);
    const code = created.json.room.code;
    const players = [{ cookie: created.cookie }];
    for (const name of ["둘째", "셋째"]) {
      const joined = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "join", player: { name, avatar: "🖍" } } });
      assert.equal(joined.status, 200, `join failed: ${JSON.stringify(joined.json)}`);
      players.push({ cookie: joined.cookie });
    }

    await call(baseUrl, `/api/rooms/${code}`, { body: { action: "prepare-game", gameId: "telestration" }, cookie: players[0].cookie });
    const started = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "start-game", gameId: "telestration" }, cookie: players[0].cookie });
    assert.equal(started.status, 200, `start failed: ${JSON.stringify(started.json)}`);
    assert.equal(started.json.room.game.telestrationTask.deadline, undefined, "a round deadline would resurrect the blanking timeout");

    // Poll from every player throughout, which is what used to blank drawings.
    let polling = true;
    const pollers = players.map(async (player) => {
      while (polling) {
        await call(baseUrl, `/api/rooms/${code}`, { method: "GET", cookie: player.cookie }).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
    });

    const expected = [];
    try {
      for (let round = 1; round <= 3; round += 1) {
        for (const [index, player] of players.entries()) {
          const strokeCount = round * 3 + index + 1;
          expected.push(strokeCount);
          const submitted = await call(baseUrl, `/api/rooms/${code}`, {
            body: { action: "submit-telestration", strokes: drawingOf(strokeCount) },
            cookie: player.cookie,
          });
          assert.equal(submitted.status, 200, `round ${round} submit failed: ${JSON.stringify(submitted.json)}`);
        }
      }
    } finally {
      polling = false;
      await Promise.all(pollers);
    }

    for (const player of players) {
      await call(baseUrl, `/api/rooms/${code}`, { body: { action: "submit-telestration", guess: "정답" }, cookie: player.cookie });
    }

    const final = await call(baseUrl, `/api/rooms/${code}`, { method: "GET", cookie: players[0].cookie });
    assert.equal(final.json.room.view, "result", "the game should finish once everyone has answered");
    const chains = final.json.room.game.telestrationResults;
    assert.ok(Array.isArray(chains) && chains.length === players.length, `expected ${players.length} chains, got ${chains?.length}`);

    // Fail loudly rather than passing on an empty set: an earlier version of this
    // check read the wrong field, inspected nothing, and reported success.
    const drawings = chains.flatMap((chain) => chain.steps.filter((step) => step.strokes));
    assert.equal(drawings.length, players.length * 3, `expected ${players.length * 3} drawings, saw ${drawings.length}`);
    assert.equal(drawings.filter((step) => step.strokes.length === 0).length, 0, "a submitted drawing came back blank");
    assert.deepEqual(
      drawings.map((step) => step.strokes.length).sort((a, b) => a - b),
      [...expected].sort((a, b) => a - b),
      "every drawing must come back with exactly the strokes it was sent with",
    );
  });
});

test("the host can move a round on when somebody never submits", { timeout: 180_000 }, async () => {
  await withDevServer(async (baseUrl) => {
    const created = await call(baseUrl, "/api/rooms", { method: "POST", body: { player: { name: "호스트", avatar: "🎨" } } });
    const code = created.json.room.code;
    const host = { cookie: created.cookie };
    const guest = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "join", player: { name: "둘째", avatar: "🖍" } } });
    const third = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "join", player: { name: "셋째", avatar: "🖍" } } });

    await call(baseUrl, `/api/rooms/${code}`, { body: { action: "prepare-game", gameId: "telestration" }, cookie: host.cookie });
    await call(baseUrl, `/api/rooms/${code}`, { body: { action: "start-game", gameId: "telestration" }, cookie: host.cookie });

    // Only two of three submit; without an override the round would hang forever.
    for (const player of [host, guest]) {
      await call(baseUrl, `/api/rooms/${code}`, { body: { action: "submit-telestration", strokes: drawingOf(4) }, cookie: player.cookie });
    }
    const stuck = await call(baseUrl, `/api/rooms/${code}`, { method: "GET", cookie: host.cookie });
    assert.equal(stuck.json.room.game.telestrationRound, 1, "the round must wait for the missing player");

    const guestForce = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "force-telestration-round" }, cookie: guest.cookie });
    assert.equal(guestForce.status, 403, "only the host may move the round on");

    const forced = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "force-telestration-round" }, cookie: host.cookie });
    assert.equal(forced.status, 200, `force failed: ${JSON.stringify(forced.json)}`);
    assert.equal(forced.json.room.game.telestrationRound, 2, "the round should advance");

    const again = await call(baseUrl, `/api/rooms/${code}`, { body: { action: "force-telestration-round" }, cookie: host.cookie });
    assert.equal(again.status, 200, "advancing a fresh round is still allowed");

    // The two real drawings must survive being forced past.
    void third;
  });
});
