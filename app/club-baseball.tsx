'use client';
import {useMemo,useState} from 'react';
import {judge,type ClubView} from './api/_lib/club';
export function ClubBaseball({s,name,meId,busy,onGuess}:{s:ClubView;name:(id?:string)=>string;meId?:string;busy:boolean;onGuess:(value:string)=>void}){
 const [draft,setDraft]=useState({round:s.round,value:''}),[notes,setNotes]=useState<string[]>([]);
 const entry=draft.round===s.round?draft.value:'';
 const setEntry=(value:string)=>setDraft({round:s.round,value});
 const disabled=busy||s.mySubmitted||s.inputter!==meId||!!s.paused?.length||s.finished;
 const candidates=useMemo(()=>{let count=0;function walk(value:string){if(value.length===s.setup.digits){if(s.history.every(h=>{const r=judge(value,h.value);return r.strikes===h.strikes&&r.balls===h.balls;}))count++;return;}for(const c of '123456789')if(!value.includes(c))walk(value+c);}walk('');return count;},[s.setup.digits,s.history]);
 function key(k:string){if(disabled)return;if(k==='clear')setEntry('');else if(k==='back')setEntry(entry.slice(0,-1));else if(entry.length<s.setup.digits&&!entry.includes(k))setEntry(entry+k);}
 return <section className="club-panel club-baseball"><div className="club-secret"><small>숨겨진 {s.setup.digits}자리 숫자</small><div className="club-secret-slots">{Array.from({length:s.setup.digits},(_,i)=><span key={i}>?</span>)}</div><div className="club-bb-meta">{candidates.toLocaleString()}개 후보 <span>·</span> {s.round}라운드</div></div>
 <div className="club-submitted">{(s.setup.mode==='team'?['team-0','team-1']:s.players).map((id,i)=><span key={id} className={s.submitted.includes(id)?'ready':''}><i/>{s.setup.mode==='team'?i?'백 팀':'흑 팀':name(id)}<small>{s.submitted.includes(id)?'제출 완료':'입력 중'}</small></span>)}</div>
 <div className="club-log-head"><b>{s.setup.mode==='team'?'우리 팀 추리 기록':'나의 추리 기록'}</b><span>S 자리까지 일치 · B 숫자 일치</span></div><div className="club-history">{s.history.length?s.history.map(h=><div className="club-guess-row" key={h.round}><small>{String(h.round).padStart(2,'0')}</small><b>{h.value}</b><div className="club-pills">{!h.strikes&&!h.balls?<span className="out">OUT</span>:<><span>{h.strikes} S</span><span className="ball">{h.balls} B</span></>}</div></div>):<div className="club-empty"><span>⌕</span>첫 번째 숫자로 가능성을 좁혀 보세요.</div>}</div>
 {!s.finished&&<><form onSubmit={e=>{e.preventDefault();if(!disabled&&entry.length===s.setup.digits)onGuess(entry);}}>
 <label className="club-entry" aria-label="추리 숫자">{Array.from({length:s.setup.digits},(_,i)=><span className={i===entry.length&&!disabled?'cursor':''} key={i}>{entry[i]}</span>)}<input aria-label="추리 숫자" inputMode="none" autoComplete="off" value={entry} disabled={disabled} onChange={e=>setEntry([...new Set(e.target.value.replace(/[^1-9]/g,''))].join('').slice(0,s.setup.digits))}/></label>
 <div className="club-keypad">{['1','2','3','4','5','6','7','8','9','clear','back'].map(k=><button type="button" key={k} disabled={disabled||(k.length===1&&(entry.includes(k)||entry.length===s.setup.digits))} aria-label={k==='clear'?'모두 지우기':k==='back'?'한 자리 지우기':`숫자 ${k}`} onClick={()=>key(k)}>{k==='clear'?'비우기':k==='back'?'⌫':k}</button>)}<button className="submit" disabled={disabled||entry.length!==s.setup.digits}>제출</button></div></form>
 <div className="club-status" aria-live="polite"><i/><div><b>{s.mySubmitted?'제출 완료 · 다른 참가자를 기다리는 중':`${name(s.inputter)} 입력 차례`}</b><small>모두 제출하면 함께 결과를 확인해요.</small></div></div>
 <div className="club-memo-label">숫자 메모 <span>누르면 제외 표시 · 나에게만 보여요</span></div><div className="club-notes">{'123456789'.split('').map(n=><button key={n} aria-label={`${n} 제외 표시`} aria-pressed={notes.includes(n)} onClick={()=>setNotes(notes.includes(n)?notes.filter(v=>v!==n):[...notes,n])}>{n}</button>)}</div></>}
 </section>;
}
