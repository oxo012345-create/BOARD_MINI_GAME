'use client';
import {useEffect,useRef,useState} from 'react';
import type {ClubView} from './api/_lib/club';
import {previewClubInput,type ClubIntent} from './club-input';

export function useClubInput(code:string|undefined,s:ClubView,meId:string|undefined,matchId:string|undefined){
 const socket=useRef<WebSocket|null>(null),latest=useRef(s),watching=useRef(matchId),[intent,setIntent]=useState<ClubIntent|null>(null);
 useEffect(()=>{latest.current=s;watching.current=matchId;},[s,matchId]);
 const enabled=!!code&&!s.finished&&(s.kind==='gomoku'||s.kind==='alkkagi');
 useEffect(()=>{
  if(!enabled)return;
  let stopped=false,connecting=false,retry:ReturnType<typeof setTimeout>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  async function ticket(){const r=await fetch(`/api/rooms/${code}/club/input`,{cache:'no-store'});return r.status===200?await r.json() as {socketUrl:string;ticket:string}:null;}
  async function connect(){
   if(stopped||connecting||socket.current||document.visibilityState==='hidden')return;
   connecting=true;
   try{const t=await ticket();if(stopped||!t)return;
    const ws=new WebSocket(t.socketUrl);socket.current=ws;
    ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='cancel'){setIntent(old=>old&&old.playerId===m.playerId&&old.payload.requestId===m.requestId?null:old);return;}
     if(m.type!=='intent'||m.playerId===meId||m.payload?.matchId!==watching.current||!previewClubInput(latest.current,m))return;
     setIntent(m);clearTimeout(expiry);expiry=setTimeout(()=>setIntent(null),5000);
    }catch{/* Invalid peer data never affects gameplay. */}};
    ws.onclose=()=>{if(socket.current===ws)socket.current=null;if(!stopped)retry=setTimeout(()=>void connect(),1000);};
    ws.onerror=()=>ws.close();
   }catch{if(!stopped)retry=setTimeout(()=>void connect(),2000);}finally{connecting=false;}
  }
  const renewal=setInterval(async()=>{if(document.visibilityState==='hidden')return;const ws=socket.current;if(!ws){void connect();return;}try{const t=await ticket();if(stopped)return;if(t&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'renew',ticket:t.ticket}));else ws.close();}catch{ws.close();}},20000);
  const visible=()=>{if(document.visibilityState==='hidden'){socket.current?.close();setIntent(null);}else void connect();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',connect);void connect();
  return()=>{stopped=true;clearTimeout(retry);clearTimeout(expiry);clearInterval(renewal);socket.current?.close();socket.current=null;document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',connect);};
 },[code,s.id,enabled,meId]);
 const preview=intent?previewClubInput(s,intent):null;
 function publish(payload:Record<string,unknown>){const ws=socket.current;if(ws?.readyState===WebSocket.OPEN&&previewClubInput(s,{playerId:meId??'',payload}))ws.send(JSON.stringify({type:'intent',payload}));}
 function cancel(requestId:unknown){const ws=socket.current;if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'cancel',requestId}));}
 return {preview,publish,cancel};
}
