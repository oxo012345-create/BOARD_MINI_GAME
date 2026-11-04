// Browsers can freeze a page without closing its apparently-open socket.
// Always recover authoritative state on return; never replay local simulation.
export function bindSessionLifecycle(session,{page=globalThis.document,host=globalThis.window}={}){
 const events=[
  [page,'visibilitychange',()=>session.setVisible(!page.hidden)],
  [page,'freeze',()=>session.setVisible(false)],
  [page,'resume',()=>{if(!page.hidden){session.setVisible(true);session.recover('resume');}}],
  [host,'online',()=>session.recover('online')],
  [host,'focus',()=>{if(!page.hidden)session.recover('focus');}],
 ];
 for(const [target,type,callback]of events)target?.addEventListener(type,callback);
 session.setVisible(!page.hidden);
 return()=>{for(const [target,type,callback]of events)target?.removeEventListener(type,callback);};
}
