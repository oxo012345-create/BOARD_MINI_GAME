# Mobile audio and player-relative view

The online match used to request AudioContext.resume() from its socket callback.
This is outside a trusted gesture and was reproduced as a suspended context in
Chromium. All/half selection did not retry it. Audio now activates on trusted
pointer, touch-end, click and keyboard events inside the game document. These
listeners remain installed to recover after interruptions and respect saved mute.
An outstanding non-gesture resume cannot suppress a fresh gesture resume.

Suspended/interrupted contexts resume; closed contexts rebuild their graph and
reset to the new audio clock. State changes stop/restart one BGM scheduler, and
suspended effects are discarded rather than accumulating. Where Audio Session is
supported, enabled gameplay requests playback, releasing it to auto on mute,
pause, backgrounding or match end. Existing BGM, effects, volumes and limits stay
in place. The iframe already permits autoplay, but still needs a trusted gesture
when the browser blocks autoplay.

The battlefield now uses a fixed quarter-turn view chosen from the local seat.
Every local starting base is on the bottom row. For 2v2, both allied bases are
below and both opponents are above. Unit art, HP bars and text remain upright.
Projected drawing covers bases, units, projectiles, overlords, target links and
combat effects. Pointer and keyboard commands apply the inverse transform before
sending server coordinates. Seat identities, colors, teams, rules, unit limits
and server authority do not change.

## Validation

- Focused audio/view tests cover all seats/modes, inverse coordinates, preserved
  authority, pending autoplay resumes, interruptions, mute and closed contexts.
- Local WebSocket browser fixture: seat 3 team movement + claim, seat 2 FFA,
  seat 1 duel attack. Actual AudioContext moves from suspended to running after
  the all/half interaction, producing nonzero analyser RMS. Suspend and close
  recovery also tested through fixture buttons. No fixture controls ship.
- 320×568 and 393×665 responsive layouts: no horizontal overflow; command buttons
  remain 48px high. Local 800-unit test uses 393×665, DPR3, 4× CPU slowdown,
  12 seconds per revision. Both versions draw 30 FPS; mean rAF callback time is
  3.05ms in each. p95 is 6.5ms before / 9.3ms after; neither run has a long task
  or skipped rAF interval. This is a short desktop simulation, not a physical
  phone CPU/GPU/thermal measurement or an Internet latency measurement.
- A real Android/iPhone speaker, OS volume/silent switch, phone-call interruption
  and the experimental Audio Session implementation require device verification.

Autoplay reference: https://developer.chrome.com/blog/web-audio-autoplay

Optional Audio Session behavior: https://www.w3.org/TR/audio-session/
