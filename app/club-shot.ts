'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Match } from './api/_lib/club';
import { simulateShot } from './api/_lib/club-physics';
import { ShotPlayback } from './club-motion';

export function useClubShot(m: Match, obstacles: boolean, onShot: (p: Record<string, unknown>) => Promise<Match | null>, onMotion: (locked: boolean) => void) {
  const [controller] = useState(() => new ShotPlayback(m.shot ?? 0, m.discs));
  const [view, setView] = useState(() => controller.sample(0));
  const raf = useRef(0), mounted = useRef(false), reported = useRef(false), callback = useRef(onMotion);
  useEffect(() => { callback.current = onMotion; }, [onMotion]);
  const wake = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const tick = () => {
      if (!mounted.current) return;
      const next = controller.sample(performance.now()); setView(next);
      if (reported.current !== next.locked) { reported.current = next.locked; callback.current(next.locked); }
      if (next.moving) raf.current = requestAnimationFrame(tick);
    };
    tick();
  }, [controller]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAnimationFrame(raf.current); callback.current(false); }; }, []);
  // A fresh room response may contain identical frames. It must not restart or cancel playback.
  useEffect(() => { controller.receive(m.shot ?? 0, m.frames ?? [], m.discs, performance.now()); wake(); }, [controller, m.shot, m.frames, m.discs, wake]);
  async function fire(id: number, dx: number, dy: number) {
    if (controller.sample(performance.now()).locked) return;
    const shot = (m.shot ?? 0) + 1;
    const prediction = simulateShot(m.discs, id, dx, dy, obstacles);
    if (!controller.predict(shot, prediction.frames, performance.now())) return;
    wake(); // Start on this device immediately; only the server can change turns/results.
    try {
      const confirmed = await onShot({ discId: id, dx, dy });
      if (confirmed) controller.receive(confirmed.shot ?? 0, confirmed.frames ?? [], confirmed.discs, performance.now());
      else controller.reject(shot);
    } catch { controller.reject(shot); }
    if (mounted.current) wake();
  }
  return { ...view, fire };
}
