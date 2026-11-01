'use client';
import {useEffect,useRef,type ReactNode} from 'react';
export function ClubSheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="club-sheet" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}><header><h3>{title}</h3><button autoFocus type="button" aria-label="닫기" onClick={onClose}>×</button></header><div className="club-sheet-body">{children}</div></dialog>;
}
