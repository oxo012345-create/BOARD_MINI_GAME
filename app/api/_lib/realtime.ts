type RealtimeSocket = WebSocket & { accept(): void };

type RealtimeSnapshot = {
  revision: number;
  room?: unknown | null;
};

const REALTIME_ROOM_CHECK_MS = 300;
const REALTIME_MAX_FAILURES = 3;

export function createRoomSocketResponse(
  initialRevision: number,
  loadLatest: (knownRevision: number, force: boolean) => Promise<RealtimeSnapshot>,
) {
  const Pair = (globalThis as typeof globalThis & {
    WebSocketPair?: new () => { 0: WebSocket; 1: RealtimeSocket };
  }).WebSocketPair;
  if (!Pair) return Response.json({ error: "실시간 연결을 사용할 수 없어요." }, { status: 501 });

  const pair = new Pair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  let lastRevision = initialRevision;
  let checking = false;
  let failures = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const pushLatest = async (force = false) => {
    if (checking) return;
    checking = true;
    try {
      const snapshot = await loadLatest(lastRevision, force);
      failures = 0;
      lastRevision = Math.max(lastRevision, snapshot.revision);
      if (snapshot.room !== undefined) {
        server.send(JSON.stringify({ type: "room-state", room: snapshot.room, revision: snapshot.revision, at: Date.now() }));
        if (snapshot.room === null) {
          cleanup();
          server.close(1000, "room closed");
        }
      }
    } catch {
      failures += 1;
      if (failures >= REALTIME_MAX_FAILURES) {
        cleanup();
        try { server.close(1011, "sync failed"); } catch { /* already closed */ }
      }
    } finally {
      checking = false;
    }
  };

  server.addEventListener("close", cleanup);
  server.addEventListener("error", cleanup);
  server.addEventListener("message", (event) => {
    if (event.data === "refresh") void pushLatest(true);
    else if (event.data === "ping") {
      try { server.send("pong"); } catch { cleanup(); }
    }
  });
  timer = setInterval(() => { void pushLatest(); }, REALTIME_ROOM_CHECK_MS);
  server.send(JSON.stringify({ type: "connected", revision: lastRevision, at: Date.now() }));

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}
