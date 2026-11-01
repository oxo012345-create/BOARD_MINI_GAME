'use client';
import {useEffect,useRef,useState} from 'react';
import {playStone,StoneSoundGate} from './club-sound';

export function StoneSound({gameId,matchId,attempt,turn}:{gameId:string;matchId:string;attempt:number;turn:number}) {
  const [enabled,setEnabled] = useState(true);
  const audio = useRef<AudioContext|null>(null), gate = useRef(new StoneSoundGate());
  useEffect(() => {
    function unlock() {
      try {
        const Context = window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if (!Context) return;
        audio.current ??= new Context();
        if (audio.current.state !== 'running' && audio.current.state !== 'closed') void audio.current.resume().catch(() => {});
      } catch { /* Audio availability must never affect a move. */ }
    }
    document.addEventListener('pointerdown',unlock,{capture:true});
    document.addEventListener('keydown',unlock,{capture:true});
    return () => { document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);void audio.current?.close().catch(()=>{});audio.current=null; };
  },[]);
  useEffect(() => {
    if (gate.current.accept(`${gameId}:${matchId}:${attempt}`,turn,document.visibilityState==='visible') && enabled && audio.current) {
      try { playStone(audio.current); } catch { /* Silent fallback, game stays playable. */ }
    }
  },[gameId,matchId,attempt,turn,enabled]);
  return <button className="club-sound-toggle" aria-label={`착수음 ${enabled?'켜짐':'꺼짐'}`} aria-pressed={enabled} onClick={()=>setEnabled(!enabled)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z" stroke="currentColor" strokeWidth="1.6"/>{enabled?<path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" stroke="currentColor" strokeWidth="1.5"/>:<path d="m17 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.6"/>}</svg><span>소리</span></button>;
}
