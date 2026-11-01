/** Deterministic server-side disc physics. Coordinates use a 600 × 600 board.
 * Fixed 120 Hz integration, equal-mass elastic impulses and static obstacles.
 * No client-provided positions or simulation results are accepted. */
export type Disc = { id: number; side: number; x: number; y: number; vx: number; vy: number; alive: boolean };
export type Barrier = { x: number; y: number; w: number; h: number };
export const DISC_RADIUS = 19;
export const BARRIERS: Barrier[] = [{ x: 270, y: 190, w: 60, h: 35 }, { x: 270, y: 375, w: 60, h: 35 }];
export function initialDiscs(): Disc[] {
  return [0, 1].flatMap(side => Array.from({ length: 5 }, (_, i) => ({ id: side * 5 + i, side, x: 100 + i * 100, y: side ? 485 : 115, vx: 0, vy: 0, alive: true })));
}
export function simulateShot(input: Disc[], id: number, dx: number, dy: number, obstacles: boolean) {
  if (![dx, dy].every(Number.isFinite) || Math.hypot(dx, dy) < 3 || Math.hypot(dx, dy) > 181) throw new Error('힘을 다시 조절해 주세요.');
  const discs = structuredClone(input);
  const selected = discs.find(d => d.id === id && d.alive);
  if (!selected) throw new Error('돌을 다시 선택해 주세요.');
  selected.vx = dx * 5; selected.vy = dy * 5;
  const frames: Disc[][] = [structuredClone(discs)];
  for (let step = 0; step < 1200; step++) {
    for (const d of discs) {
      if (!d.alive) continue;
      d.x += d.vx / 120; d.y += d.vy / 120;
      d.vx *= .984; d.vy *= .984;
      if (d.x < 0 || d.x > 600 || d.y < 0 || d.y > 600) { d.alive = false; d.vx = d.vy = 0; continue; }
      for (const b of obstacles ? BARRIERS : []) {
        const nx = Math.max(b.x, Math.min(d.x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(d.y, b.y + b.h));
        const ex = d.x - nx, ey = d.y - ny, distance = Math.hypot(ex, ey);
        if (distance > 0 && distance < DISC_RADIUS) {
          const ux = ex / distance, uy = ey / distance;
          d.x += ux * (DISC_RADIUS - distance); d.y += uy * (DISC_RADIUS - distance);
          const vn = d.vx * ux + d.vy * uy;
          if (vn < 0) { d.vx -= 1.84 * vn * ux; d.vy -= 1.84 * vn * uy; }
        }
      }
    }
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i], b = discs[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
      if (distance >= DISC_RADIUS * 2) continue;
      const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
      const overlap = (DISC_RADIUS * 2 - distance) / 2 + .001;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (approach > 0) { const impulse = approach * .94; a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny; }
    }
    // Resolve removals even when separation impulses moved a centre off-board.
    for (const d of discs) if (d.alive && (d.x < 0 || d.x > 600 || d.y < 0 || d.y > 600)) { d.alive = false; d.vx = d.vy = 0; }
    if (step % 12 === 0) frames.push(structuredClone(discs));
    if (discs.every(d => !d.alive || Math.hypot(d.vx, d.vy) < 1)) break;
  }
  for (const d of discs) { d.vx = 0; d.vy = 0; }
  frames.push(structuredClone(discs));
  return { discs, frames };
}
