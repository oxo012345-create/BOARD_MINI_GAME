'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Match } from './api/_lib/club';
import { simulateShot } from './api/_lib/club-physics';
import { ShotPlayback } from './club-motion';

export function useClubShot(m: Match, obstacles: boolean, onShot: (p: Record<string, unknown>) => Promise<Match | null>, onMotion: (locked: boolean) => void, onSettle?: (launchId:string)=>Promise<Match|null>) {
  const [controller] = useState(() => new ShotPlayback(m.shot ?? 0, m.discs));
  const [view, setView] = useState(() => controller.sample(0));
  const raf = useRef(0), mounted = useRef(false), reported = useRef(false), callback = useRef(onMotion), settleCallback=useRef(onSettle);
  useEffect(() => { callback.current = onMotion; settleCallback.current=onSettle; }, [onMotion,onSettle]);
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
  useEffect(() => { controller.sync(m,obstacles,performance.now()); wake(); }, [controller,m,obstacles,wake]);
  const pendingLaunch=m.launch&&!m.launch.settled?m.launch.id:undefined;
  useEffect(()=>{
    if(!pendingLaunch||!settleCallback.current)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined,attempt=0;
    // Every connected client can recover a launch if the shooter disappears.
    async function settle(){
      try{const result=await settleCallback.current?.(pendingLaunch!);if(cancelled)return;
        if(result?.launch?.id===pendingLaunch&&result.launch.settled){controller.sync(result,obstacles,performance.now());wake();return;}
      }catch{/* Retry transport errors without restarting the local animation. */}
      if(!cancelled)timer=setTimeout(settle,Math.min(3000,500*2**Math.min(attempt++,3)));
    }
    void settle();return()=>{cancelled=true;clearTimeout(timer);};
  },[pendingLaunch,controller,obstacles,wake]);
  async function fire(id: number, dx: number, dy: number) {
    if (controller.sample(performance.now()).locked) return;
    const shot = (m.shot ?? 0) + 1;
    const prediction = simulateShot(m.discs, id, dx, dy, obstacles);
    if (!controller.predict(shot, prediction.frames, performance.now())) return;
    wake(); // Start on this device immediately; only the server can change turns/results.
    try {
      const confirmed = await onShot({ discId: id, dx, dy });
      if (confirmed) controller.sync(confirmed,obstacles,performance.now());
      else controller.reject(shot);
    } catch { controller.reject(shot); }
    if (mounted.current) wake();
  }
  return { ...view, fire };
}
