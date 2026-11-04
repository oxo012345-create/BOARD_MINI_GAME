// Local timings only. Hidden time and intentional menus are not frame stalls.
export class ConnectionHealth {
 constructor(){this.visible=true;this.frame={count:0,maxMs:0};this.state={count:0,maxMs:0};this.lastFrame=null;this.lastState=null;this.backgrounds=0;this.reconnects=0;this.recoveries=0;this.recoveryAt=null;this.lastRecoveryMs=null;this.maxRecoveryMs=0;this.events=[];}
 gap(kind,at,threshold){const key=kind==='frame'?'lastFrame':'lastState',before=this[key];this[key]=at;if(!this.visible||before===null)return;const ms=at-before;if(ms<threshold)return;this[kind].count++;this[kind].maxMs=Math.max(this[kind].maxMs,ms);this.events.push({kind,ms:Math.round(ms),at:Math.round(at)});if(this.events.length>24)this.events.shift();}
 painted(at,active){if(!active||!this.visible){this.lastFrame=null;return;}this.gap('frame',at,100);}
 snapshot(at){this.gap('state',at,200);if(this.recoveryAt!==null){this.lastRecoveryMs=at-this.recoveryAt;this.maxRecoveryMs=Math.max(this.maxRecoveryMs,this.lastRecoveryMs);this.recoveries++;this.recoveryAt=null;}}
 visibility(visible){if(this.visible&&!visible)this.backgrounds++;this.visible=visible;if(!visible)this.recoveryAt=null;this.lastFrame=null;this.lastState=null;}
 recovering(at){if(this.recoveryAt===null)this.recoveryAt=at;}
 diagnostics(at){const live=(kind,last,threshold)=>{const elapsed=this.visible&&last!==null?at-last:0;return{count:this[kind].count+(elapsed>=threshold?1:0),maxMs:Math.max(this[kind].maxMs,elapsed>=threshold?elapsed:0),thresholdMs:threshold};};return{frame:live('frame',this.lastFrame,100),state:live('state',this.lastState,200),backgrounds:this.backgrounds,reconnects:this.reconnects,recoveries:this.recoveries,lastRecoveryMs:this.lastRecoveryMs,maxRecoveryMs:this.maxRecoveryMs,recoveryPendingMs:this.recoveryAt===null?null:at-this.recoveryAt,recent:[...this.events]};}
}
