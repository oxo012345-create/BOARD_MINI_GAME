type RealtimeSnapshot = {
  revision: number;
  room?: unknown | null;
};

const REALTIME_ROOM_CHECK_MS = 300;
const REALTIME_HEARTBEAT_MS = 15_000;
const REALTIME_MAX_FAILURES = 3;

export function createRoomEventStreamResponse(
  initialRevision: number,
  loadLatest: (knownRevision: number) => Promise<RealtimeSnapshot>,
) {
  const encoder = new TextEncoder();
  let lastRevision = initialRevision;
  let checking = false;
  let failures = 0;
  let roomTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (roomTimer) clearInterval(roomTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        roomTimer = null;
        heartbeatTimer = null;
      };
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const pushLatest = async () => {
        if (checking) return;
        checking = true;
        try {
          const snapshot = await loadLatest(lastRevision);
          failures = 0;
          lastRevision = Math.max(lastRevision, snapshot.revision);
          if (snapshot.room !== undefined) {
            send("room-state", { room: snapshot.room, revision: snapshot.revision, at: Date.now() });
            if (snapshot.room === null) {
              cleanup();
              controller.close();
            }
          }
        } catch {
          failures += 1;
          if (failures >= REALTIME_MAX_FAILURES) {
            cleanup();
            controller.error(new Error("REALTIME_SYNC_FAILED"));
          }
        } finally {
          checking = false;
        }
      };

      send("connected", { revision: lastRevision, at: Date.now() });
      roomTimer = setInterval(() => { void pushLatest(); }, REALTIME_ROOM_CHECK_MS);
      heartbeatTimer = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); }
        catch { cleanup(); }
      }, REALTIME_HEARTBEAT_MS);
    },
    cancel() {
      if (roomTimer) clearInterval(roomTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      roomTimer = null;
      heartbeatTimer = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
