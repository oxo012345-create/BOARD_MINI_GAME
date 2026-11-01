import { FRAME_MS, type Disc } from './api/_lib/club-physics';

/** Presentation only. A speculative shot cannot advance the server's turn. */
export class ShotPlayback {
  private confirmed: number;
  private settled: Disc[];
  private active?: { shot: number; start: number; frames: Disc[][]; acknowledged: boolean };

  constructor(shot: number, discs: Disc[]) {
    this.confirmed = shot;
    this.settled = discs;
  }

  predict(shot: number, frames: Disc[][], now: number) {
    if (shot <= this.confirmed || this.active || frames.length < 2) return false;
    this.active = { shot, start: now, frames, acknowledged: false };
    return true;
  }

  receive(shot: number, frames: Disc[][], discs: Disc[], now: number) {
    if (shot < this.confirmed) return;
    const newer = shot > this.confirmed;
    this.confirmed = shot;
    this.settled = discs;
    if (this.active?.shot === shot) {
      this.active.acknowledged = true;
      // Keep the original start time: a response must never replay our shot.
      if (frames.length > 1) this.active.frames = frames;
    } else if (newer) {
      this.active = frames.length > 1 ? { shot, start: now, frames, acknowledged: true } : undefined;
    }
  }

  reject(shot: number) {
    if (this.active?.shot === shot && !this.active.acknowledged) this.active = undefined;
  }

  sample(now: number) {
    const a = this.active;
    if (!a) return { discs: this.settled, moving: false, awaiting: false, locked: false };
    const position = Math.max(0, now - a.start) / FRAME_MS;
    const index = Math.floor(position);
    if (index >= a.frames.length - 1) {
      if (a.acknowledged) {
        this.active = undefined;
        return { discs: this.settled, moving: false, awaiting: false, locked: false };
      }
      return { discs: a.frames.at(-1)!, moving: false, awaiting: true, locked: true };
    }
    const next = a.frames[index + 1], mix = position - index;
    return {
      discs: a.frames[index].map((d, i) => ({ ...d, x: d.x + (next[i].x - d.x) * mix, y: d.y + (next[i].y - d.y) * mix })),
      moving: true, awaiting: false, locked: true,
    };
  }
}
