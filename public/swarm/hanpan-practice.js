document.getElementById('hanpan-join')?.addEventListener('click',()=>{window.parent.postMessage({type:'hanpan-swarm-exit',matchId:null},location.origin);});
