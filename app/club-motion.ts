import type { Match } from './api/_lib/club';
import { simulateShot, FRAME_MS, type Disc } from './api/_lib/club-physics';

/** Presentation only. A speculative shot cannot advance the server's turn. */
export class ShotPlayback {
  private launchCache?: {id:string;frames:Disc[][]};
  private confirmed: number;
  private settled: Disc[];
  private active?: { shot: number; start: number; frames: Disc[][]; duration: number; acknowledged: boolean };

  constructor(shot: number, discs: Disc[]) {
    this.confirmed = shot;
    this.settled = discs;
  }

  predict(shot: number, frames: Disc[][], now: number) {
    if (shot <= this.confirmed || this.active || frames.length < 2) return false;
    this.active = { shot, start: now, frames, duration: (frames.length-1)*FRAME_MS, acknowledged: false };
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
      this.active = frames.length > 1 ? { shot, start: now, frames, duration: (frames.length-1)*FRAME_MS, acknowledged: true } : undefined;
    }
  }

  sync(m:Match,obstacles:boolean,now:number){
    const launch=m.launch;
    if(launch){
      if(this.launchCache?.id!==launch.id)this.launchCache={id:launch.id,frames:simulateShot(launch.discs,launch.discId,launch.dx,launch.dy,obstacles).frames};
      if(launch.settled)this.receive(launch.shot,this.launchCache.frames,m.discs,now);
      else this.predict(launch.shot,this.launchCache.frames,now);
    }else this.receive(m.shot??0,m.frames??[],m.discs,now);
  }

  reject(shot: number) {
    if (this.active?.shot === shot && !this.active.acknowledged) this.active = undefined;
  }

  sample(now: number) {
    const a = this.active;
    if (!a) return { discs: this.settled, moving: false, awaiting: false, locked: false };
    // Show the complete path even when delivery took longer than the shot.
    // One physics frame remains 50 ms: never accelerate or skip collisions.
    const position = Math.max(0, now - a.start) / a.duration * (a.frames.length-1);
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
