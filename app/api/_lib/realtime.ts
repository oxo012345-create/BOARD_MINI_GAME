export type RealtimeSnapshot = {
  revision: number;
  room?: unknown | null;
};

const REALTIME_ROOM_CHECK_MS = 300;
const REALTIME_WAIT_MS = 12_000;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function waitForRoomUpdate(
  initialRevision: number,
  signal: AbortSignal,
  loadLatest: (knownRevision: number) => Promise<RealtimeSnapshot>,
) {
  const deadline = Date.now() + REALTIME_WAIT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const snapshot = await loadLatest(initialRevision);
    if (snapshot.room !== undefined) return snapshot;
    await wait(REALTIME_ROOM_CHECK_MS, signal);
  }
  return { revision: initialRevision } satisfies RealtimeSnapshot;
}
