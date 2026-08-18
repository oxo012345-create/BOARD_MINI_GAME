import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { createMultiplayerServer } from "./server.mjs";

function createMessageClient(url) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.on("message", (rawData) => {
    const message = JSON.parse(rawData.toString());
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    queue.push(message);
  });
  const nextWhere = (predicate, label = "message", timeout = 2500) => {
    const queuedIndex = queue.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${label}`));
        }, timeout),
      };
      waiters.push(waiter);
    });
  };
  return {
    socket,
    async open() {
      if (socket.readyState === WebSocket.OPEN) return;
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
    },
    next(type, timeout = 2500) {
      return nextWhere((message) => message.type === type, type, timeout);
    },
    nextWhere,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    },
  };
}

test("8인 서버 판정, 게임 상태, 맵 제어와 정원 제한", async (context) => {
  const server = createMultiplayerServer({ port: 0 });
  const address = await server.listen();
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const clients = [];

  context.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  let firstWelcome = null;
  for (let index = 0; index < 8; index += 1) {
    const client = createMessageClient(url);
    clients.push(client);
    await client.open();
    client.send({ type: "join", room: "TEST8", name: `배달부 ${index + 1}`, character: index });
    const welcome = await client.next("welcome");
    if (index === 0) firstWelcome = welcome;
    assert.equal(welcome.room, "TEST8");
    assert.equal(welcome.players.length, index + 1);
    assert.equal(welcome.maxPlayers, 8);
    assert.equal(welcome.authority, "server");
    assert.equal(welcome.game.items.length, 8);
    assert.ok(Number.isInteger(welcome.game.players[index].game.recipeIndex));
  }

  const statePromise = clients[1].nextWhere(
    (message) => message.type === "state" && message.id === firstWelcome.id,
    "authoritative state",
  );
  clients[0].send({
    type: "state",
    seq: 1,
    x: 2.25,
    y: 2.5,
    z: -3.5,
    rotation: 1.2,
    moving: true,
    sprinting: false,
  });
  const stateMessage = await statePromise;
  assert.notEqual(stateMessage.state.x, 2.25);
  assert.notEqual(stateMessage.state.z, -3.5);
  assert.equal(stateMessage.state.y, 0.04);
  assert.ok(Math.hypot(stateMessage.state.x + 1, stateMessage.state.z - 7.85) < 0.5);
  assert.equal(stateMessage.state.moving, true);

  const pickupPromise = clients[0].nextWhere(
    (message) => message.type === "event" && message.kind === "pickup",
    "authoritative pickup",
  );
  clients[0].send({ type: "action", action: "interact" });
  const pickup = await pickupPromise;
  assert.equal(pickup.actorId, firstWelcome.id);
  assert.ok(pickup.itemId.startsWith("item-"));

  const worldPromises = clients.map((client) => client.next("world"));
  clients[0].send({ type: "control", kind: "map", seed: 123456789 });
  const worlds = await Promise.all(worldPromises);
  assert.ok(worlds.every((world) => world.mapSeed === 123456789));
  assert.ok(worlds.every((world) => world.players.length === 8));
  assert.ok(worlds.every((world) => world.game.items.length === 8));

  const hostOnlyPromise = clients[2].nextWhere(
    (message) => message.type === "error" && message.code === "HOST_ONLY",
    "host-only error",
  );
  clients[2].send({ type: "control", kind: "theme", theme: "space" });
  const hostOnlyError = await hostOnlyPromise;
  assert.equal(hostOnlyError.code, "HOST_ONLY");

  const ninth = createMessageClient(url);
  clients.push(ninth);
  await ninth.open();
  ninth.send({ type: "join", room: "TEST8", name: "아홉 번째", character: 9 });
  const roomFullError = await ninth.next("error");
  assert.equal(roomFullError.code, "ROOM_FULL");
});

test("서버가 스킬 넉백·기절·쿨타임과 재료 제출을 판정", async (context) => {
  const server = createMultiplayerServer({ port: 0 });
  const address = await server.listen();
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const attackerClient = createMessageClient(url);
  const targetClient = createMessageClient(url);
  context.after(async () => {
    attackerClient.close();
    targetClient.close();
    await server.close();
  });
  await attackerClient.open();
  attackerClient.send({ type: "join", room: "RULES", name: "공격자", character: 0 });
  const attackerWelcome = await attackerClient.next("welcome");
  await targetClient.open();
  targetClient.send({ type: "join", room: "RULES", name: "대상", character: 1 });
  const targetWelcome = await targetClient.next("welcome");

  const room = server.rooms.get("RULES");
  const attacker = room.players.get(attackerWelcome.id);
  const target = room.players.get(targetWelcome.id);
  attacker.state.x = 2;
  attacker.state.z = 0;
  target.state.x = 2.75;
  target.state.z = 0;
  const beforeKnockback = target.state.x;
  const powerPushEventPromise = attackerClient.nextWhere(
    (message) => message.type === "event" && message.kind === "skill" && message.skill === "power-push",
    "power push",
  );
  attackerClient.send({ type: "action", action: "skill", skill: "power-push" });
  await powerPushEventPromise;
  assert.ok(target.state.x > beforeKnockback);
  assert.ok(target.stunUntil > Date.now() + 2500);
  assert.ok(attacker.cooldowns["power-push"] > Date.now() + 9000);

  const recipe = attacker.recipeIndex;
  const needed = new Set(attackerWelcome.game.players[0].game.progress);
  const ingredient = room.items.values().find((item) => (
    !item.heldBy && !needed.has(item.ingredientKey)
  ));
  assert.ok(ingredient);
  const depot = [
    [-1, -8.3], [1, -8.3], [8.3, -1], [8.3, 1],
    [-1, 8.3], [1, 8.3], [-8.3, -1], [-8.3, 1],
  ][ingredient.depotIndex];
  attacker.state.x = depot[0];
  attacker.state.z = depot[1];
  const pickupPromise = attackerClient.nextWhere(
    (message) => message.type === "event" && message.kind === "pickup",
    "pickup",
  );
  attackerClient.send({ type: "action", action: "interact" });
  await pickupPromise;
  assert.equal(attacker.heldItemId, ingredient.id);
  attacker.state.x = 1.6;
  attacker.state.z = 0;
  const submitPromise = attackerClient.nextWhere(
    (message) => message.type === "event" && ["submitted", "recipeComplete"].includes(message.kind),
    "submission",
  );
  attackerClient.send({ type: "action", action: "interact" });
  await submitPromise;
  assert.equal(attacker.heldItemId, null);
  assert.ok(attacker.recipeProgress.size > 0 || attacker.recipeIndex !== recipe || attacker.score > 0);
});
