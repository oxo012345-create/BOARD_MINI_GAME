const encoder=new TextEncoder();
const bytes=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const url64=value=>btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function signTicket(secret,payload){
 if(typeof secret!=='string'||secret.length<32)throw new Error('Realtime secret is not configured');
 const body=url64(encoder.encode(JSON.stringify(payload))),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return body+'.'+url64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body))));
}
export async function verifyTicket(secret,token,kind,now=Date.now()){
 try{
  if(typeof secret!=='string'||secret.length<32||typeof token!=='string'||token.length>4096)return null;
  const [body,signature,extra]=token.split('.');if(!body||!signature||extra)return null;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,bytes(signature),encoder.encode(body)))return null;
  const p=JSON.parse(new TextDecoder().decode(bytes(body)));
  if(p.version!==1||p.kind!==kind||!Number.isFinite(p.expiresAt)||p.expiresAt<=now||p.expiresAt>now+60000||!/^\d{4}$/.test(p.roomCode)||!/^[-a-f0-9]{36}$/.test(p.matchId))return null;
  return p;
 }catch{return null;}
}
