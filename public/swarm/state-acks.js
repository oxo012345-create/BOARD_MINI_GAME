// Cumulative receipts, never delayed commands or snapshots. The server keeps a
// three-snapshot credit window; only batch pairs on a measured fast connection.
export class StateAcks {
 constructor({send,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){this.send=send;this.setTimer=setTimer;this.clearTimer=clearTimer;this.reset();}
 reset(){this.cancel();this.pending=0;this.confirmed=0;this.count=0;}
 cancel(){if(this.timer!==undefined)this.clearTimer(this.timer);this.timer=undefined;}
 offer(revision,batch,delay=60){if(revision<=this.confirmed)return;this.pending=revision;this.count++;if(!batch||this.count>=2)return this.flush();if(this.timer===undefined)this.timer=this.setTimer(()=>{this.timer=undefined;this.flush();},delay);}
 flush(){if(!this.pending)return;const revision=this.pending;if(this.send({type:'stateAck',revision})!==false)this.confirm(revision);else if(this.timer===undefined)this.timer=this.setTimer(()=>{this.timer=undefined;this.flush();},20);}
 confirm(revision){if(revision<this.pending)return;this.confirmed=Math.max(this.confirmed,revision);this.pending=0;this.count=0;this.cancel();}
}
