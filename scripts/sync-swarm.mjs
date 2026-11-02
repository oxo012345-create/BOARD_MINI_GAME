import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const source=path.resolve(process.argv[2]||'../swarm-territory'),target=path.resolve('public/swarm'),runtime=path.resolve('app/api/_lib/vendor/swarm');
await fs.mkdir(target,{recursive:true});await fs.mkdir(runtime,{recursive:true});
const files=['index.html','style.css','app.js','engine.js','rules.js','modes.js','integration.js','art.js','audio.js','frame-clock.js','icon.svg','network.js','net-protocol.js','http-network.js'];
const hashes={};
for(const file of files){const raw=await fs.readFile(path.join(source,'dist',file));hashes[file]=createHash('sha256').update(raw.toString().replaceAll('\r\n','\n')).digest('hex');let contents=raw;
 if(file==='index.html')contents=raw.toString().replace('</head>','<link rel="stylesheet" href="hanpan-theme.css"></head>').replace('<a href="online/" class="friend-link">친구와 대전 ↗</a>','<button type="button" class="friend-link" id="hanpan-join">친구와 대전 ↗</button>').replace('</body>','<script type="module" src="hanpan-practice.js"></script></body>');
 if(file==='app.js'){
  const exit="window.parent.postMessage({type:'hanpan-swarm-exit',matchId:new URLSearchParams(location.search).get('match')},location.origin)";
  // The parent asks for confirmation. Keep this connection alive if cancelled.
  contents=raw.toString().replaceAll("session.close();location.href='/online/'",exit).replaceAll("location.href='/online/'",exit)+"\nexport function showNetworkNotice(message){toast(message);}\n";
 }
 await fs.writeFile(path.join(target,file),contents);
}
const index=await fs.readFile(path.join(target,'index.html'),'utf8');
await fs.writeFile(path.join(target,'hanpan.html'),index.replace('class="modal-layer" id="modal-layer"','class="modal-layer" id="modal-layer" hidden').replace('src="app.js"','src="hanpan-entry.js"').replace('<script type="module" src="hanpan-practice.js"></script>','').replace('</body>','<section id="swarm-connection" class="swarm-connection" role="status"><p id="swarm-connection-text">전투에 연결 중…</p><button id="swarm-retry" hidden>다시 연결</button></section></body>'));
for(const [name,file]of [['room.js','online/room.js'],['d1-rooms.js','worker/d1-rooms.js']]){let raw=await fs.readFile(path.join(source,file),'utf8');raw=raw.replaceAll("'../online/room.js'","'./room.js'").replaceAll("'../dist/","'../../../../../public/swarm/");await fs.writeFile(path.join(runtime,name),raw);}
await fs.writeFile(path.join(target,'source.json'),JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),hashEncoding:'UTF-8 with CRLF normalized to LF',hashes,adaptations:['Background/text color overlay','Hanpan navigation messages','Same-origin authenticated room transport']},null,2)+'\n');
console.log('Swarm assets and server runtime copied; rules/engine/art/audio are unchanged.');
