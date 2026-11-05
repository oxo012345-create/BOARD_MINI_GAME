# Unlimited battles and inactivity

## Rules

- Battles have no time limit, overtime or automatic time draw in any mode.
  The header shows elapsed time. AI practice pauses its clock when paused;
  online elapsed time uses server wall time. Annihilation determines victory.
- Online connected players receive a warning after90seconds with no meaningful
  progress, followed by30seconds to press **계속 플레이** or play normally.
  Actual combat/capture anywhere counts as watching a progressing battle for
  connected living players, including FFA observers and2v2 teammates. Ordered
  movement that actually approaches its destination and successful new orders or
  research count as personal activity. Production, regeneration, transport ping,
  state receipts, invalid orders and repeated no-op destinations do not count.
- A missing player has120seconds to return. Away time pauses the personal idle
  budget, while the elapsed match clock continues. Once forfeited, the seat cannot
  regain its army by reconnecting. A timely reconnect retains authoritative state.
- A personal forfeit removes that player's units, projectiles and overlord and
  neutralizes only their bases, without kill bounty. Their ally continues playing.
  The team loses only when no surviving teammate remains. Eliminated players can
  continue spectating. Simultaneous inactivity of everyone is a draw, independent
  of seat iteration order.
- If no living participant is present for120seconds, the match is abandoned with
  no winner. Connected eliminated spectators do not keep an abandoned match alive.

## Runtime

The server distinguishes connection presence from play. Receipt/ping traffic only
updates presence; it cannot extend meaningful activity. Stale traffic beyond15s
counts as away, allowing a frozen or backgrounded open socket to stop keeping
expensive simulation alive. Real socket closes are observed immediately.

Policy progress, absence budgets and the absolute server start timestamp survive
checkpoints. Movement samples are transient and bounded by the population. Clock
updates/movement observation run at most once per second during normal ticks;
commands recheck inactivity before execution. Reconnect and manual continue never
reset elapsed time. Legacy checkpoints retain their start time, but old countdown
metadata is replaced and old deadline alarms cannot end an active battle.

The existing three-state receipt window,20Hz broadcast,30Hz simulation and
authentication remain. No heartbeat or continuous AFK HTTP request is added.
Only a deliberate continue button sends the new sequenced `active` command.
False/unused policy fields are omitted from wire player metadata.

One persisted Durable Object alarm covers all-away cleanup only. Active battles
have no deadline alarm; any old one is cleared. The cleanup alarm is installed
on lifecycle changes, not on every tick.
It can finish an empty room without a live socket or a repeating simulation loop.
Duplicate alarm delivery is safe. Final results delete their pending alarm and
stop computation; sockets still receive a final authoritative snapshot before
closing. Abandoned battles discard unit/projectile/overlord payloads and retain
a small ended checkpoint, preventing the same match from being recreated later.
If a backgrounded client misses its final packet before the server closes it,
it makes one authenticated attempt to fetch the saved result, without restarting
the battle or entering an unlimited reconnect loop.

The existing HTTP fallback applies the same rules when polled and retains its
existing storage expiration; it does not acquire a new background job. Active
public Hanpan matches use the Durable Object path.

## UI and validation

The header shows elapsed time without overtime or countdown messaging. The warning
includes a48px-high continue button, including inside the online rules/pause menu.
Results distinguish inactivity draw, abandonment and forfeit instead of claiming
every result was an annihilation.

Policy tests cover all modes beyond an hour without a time draw, AI practice,
watching others' combat, team-only forfeits,
simultaneous inactivity, meaningful movement versus jitter, invalid/no-op orders,
sequenced confirmation, absence/reconnect budgets, persisted clocks and a final
snapshot bypassing a full receipt window. Real workerd/SQLite tests exercise
an actual persisted alarm firing after every client leaves, cleanup, duplicate
alarm delivery, a legacy deadline alarm during active play after6minutes,
and final-state replay after object restart.

Browser QA uses a disposable800-unit local fixture, with clock controls excluded
from production.393×665 and320×568 viewports cover warnings, confirmation inside
rules and individual2v2 forfeit. The removed time-draw UI was previously covered;
regression tests now require play to continue after6minutes. Small screens scroll rather
than clipping controls. Physical phone-call/OS behavior is not reproduced by this
fixture. Source images, combat tuning and other games are unchanged.

Alarm reference: https://developers.cloudflare.com/durable-objects/api/alarms/

Rollback baseline: Sites225 and Worker `9a791a79-649c-4bf2-b1a1-b0e86c736288`.
Ended/forfeited matches are not resurrected by a code rollback.
