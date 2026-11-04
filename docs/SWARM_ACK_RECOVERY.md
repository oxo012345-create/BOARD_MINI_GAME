# State receipts, mobile recovery and stall diagnostics

The server still simulates at30Hz and sends active state at20Hz. Commands and
their result acknowledgements remain immediate. Personal200 balance, fixed
authenticated seats, parent-room authority, SQLite checkpoints and other games
are unchanged. No hosting bindings, secrets, storage schemas or tariffs change.

## Receipts

The welcome message advertises cumulative-receipt support, three outstanding
snapshot credits,50ms patches and optional compact receipts. Old clients continue
using their original JSON receipts; new clients use old behavior on old servers.
Compact `["a",revision]` receipts preserve validation against that peer's last
sent revision. Only this authenticated peer's credits can be acknowledged.

At low, recently measured RTT, pairs of state receipts can be combined. The
deadline is20–60ms, capped by100ms minus the maximum of the last five RTTs.
RTT above65ms, stale ping data, a foreground arrival gap over100ms, or increasing
server backpressure disables batching; gap/backpressure protection lasts10s.
Full/final snapshots are acknowledged immediately. Pending receipts can ride
commands or pings, and never delay those messages. The original3-state and128KB
backpressure limits remain. Compact receipts still save upload bytes when
batching is disabled. Statistics count application payloads, excluding TLS,
TCP/WebSocket framing, radio overhead and parent-room requests.

A fixed60ms batching trial had an unstable public phase (211ms arrival gap).
It was not published to the frontend. The adaptive deadline, arrival-gap
protection and compact fallback were compared again before release.

## Recovery

The original welcome handler replaced the game object, leaving the renderer
attached to an old object after socket reconnection. Same-mode reconnect now
preserves that reference and loads the authoritative full state, including
units, upgrades, minerals, bases and accepted command sequence.

Visibility, freeze/resume, focus and online events recover without local battle
simulation. Queued stale deltas cannot unlock commands before a fresh full state.
An apparently open but unresponsive socket is replaced after an800ms full-state
probe; new signed tickets still come through Hanpan cookie authorization.
Old-socket callbacks cannot restart a newer connection. Terminal removals and
completed battles still stop automatic retry. Hidden time is excluded from
foreground stalls, and the fast WebSocket watchdog never duplicates HTTP polls.
Full resync clears only that peer's receipt credits, so a backgrounded peer can
escape a full credit window. Returning players see the current ongoing battle,
not a battle paused at the time they left.

## Measurement

`? → 연결·화면 상태` now includes frame gaps at least100ms and state-arrival gaps
at least200ms, their counts/maxima, foreground recovery duration, reconnects,
resync/errors and application upload/download bytes. There is no remote telemetry
upload. Recent event records are bounded to24. Menus and hidden time are excluded
from frame stalls. Arrival gaps can also be caused by a blocked client event loop;
these metrics distinguish observations and do not prove the server caused a gap.

## Verification

- `node scripts/swarm-ack-compare.mjs`: actual800-unit engine, codec, room and
  client on deterministic ordered WAN links. Seven40–300ms/jitter/spike profiles;
  each has12s warmup plus8s measurement. Both revisions receive identical snapshot
  counts and have identical command-to-scheduled-draw p95. No additional credit
  drops. At40ms: messages−45.7%, upload payload−71.9%. At80ms: same message count,
  upload−61.0% through immediate compact receipts. Total application bytes only
  fall about0.3% at800 units because server state dominates.
- Actual public four-cookie team room, ABBA baseline/optimized phases. State rate
  stays about20/client/s with zero new credit drops. Upload payload31822→12847B
  across equally long paired phases (about60% less). Mean command-to-scheduled
  Node draw98.5→94.8ms; actual browser rendering is not included. Real network
  variation prevents attributing the small timing difference to this patch.
- Chromium393×665/DPR3,800-unit local fixture: background return, normal reconnect
  and an apparently open dead socket preserve seat3,200 units and attack+1.
  Full-state dead-link recovery takes about804ms on loopback. An injected500ms
  delivery pause records507ms, while drawing continues. An injected250ms browser
  block records258ms frame /290ms arrival gaps. These are controlled test results,
  not physical phone-call, GPU, thermal or carrier measurements.
- Focused tests include mixed old/compact SQLite DO peers, tampering, authority
  revocation, checkpoint restore, duplicate commands, final cleanup and slow HTTP
  polling. Existing art/audio/player-relative view tests are retained.

References: [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[Colyseus reconnection](https://docs.colyseus.io/room/reconnection),
[Colyseus latency simulation source](https://github.com/colyseus/colyseus/blob/master/packages/core/src/Server.ts).

Rollback: Sites224 and its `hanpan-swarm-bottom-audio.tar.gz` archive are retained.
The new server accepts old JSON receipts, so frontend rollback is compatible.
The previous server version is `f23e53c8-9e52-4d1e-b919-0a866a5910be`.
