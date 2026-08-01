import * as THREE from "three";

const roomCode = new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || "";
const $ = (id) => document.getElementById(id);
const ui = { round:$("round"),phase:$("phase"),timer:$("timer"),cash:$("cash"),seats:$("seats"),auction:$("auction-card"),seller:$("seller"),itemName:$("item-name"),itemEra:$("item-era"),bid:$("bid"),highest:$("highest"),dossier:$("private-dossier"),value:$("true-value"),clauses:$("clauses"),notice:$("notice"),content:$("content"),itemCount:$("item-count"),cardCount:$("card-count") };
let room=null, dealer=null, tab="game", busy=false, lastRevision=-1, lastItemUid="", serverOffset=0;
const money=(n)=>`$${Math.round(Number(n)||0).toLocaleString("en-US")}`;
const phaseNames={select:"판매품 선택",auction:"실시간 경매",resolution:"낙찰 정산",shop:"카드 상점",finished:"최종 순위"};
const clauseText=["총액 $500 초과 시 +$100","시장 판매가 +10%","시장 판매가 +30%","리롤마다 가치 +10%","카드마다 가치 +10%","빈 카드칸마다 가치 +10%","33% 3배 / 실패 1/3","전체 가격 보너스 +15%","모든 시대 와일드카드","1라운드 판매 잠금","구매자 카드 사용 잠금","판매자 카드 사용 잠금","구매자 무작위 카드 제거","판매자 무작위 카드 제거","7경매 후 복사 귀환","-$250 시작·입찰마다 +$50","경매마다 시대 변경","카드 전부 환전","매 라운드 ±$150","라운드마다 -$100","수익을 무작위 참가자와 분배","아이템 수마다 +12%","구매자 말하기 금지","판매자 말하기 금지","구매자·판매자 미니 승부"];
const cards=[
 ["Price Insider",300,"실제 가치 공개"],["Clause Insider",300,"조항 2개 공개"],["Reroll Saver I",100,"리롤 10% 할인"],["Reroll Saver II",200,"리롤 20% 할인"],["Black Marketeer I",100,"시장 수익 +10%"],["Black Marketeer II",200,"시장 수익 +20%"],["Hammer Lock",400,"대상 입찰 금지"],["Loan Shark",200,"즉시 $1,000 대출"],["Roll the Dice I",150,"75%로 $300"],["Roll the Dice II",250,"50%로 $500"],["Roll the Dice III",300,"30%로 $700"],["Roll the Dice IV",300,"15%로 $1,000"],["Roll the Dice V",350,"5%로 $1,500"],["Sharp Guess",100,"부자 대상 -$300"],["Pickpocket",200,"카드 1장 강탈"],["All In I",400,"80%로 현금 +20%"],["All In II",400,"50%로 현금 +35%"],["All In III",300,"20%로 현금 +50%"],["Robin Hood",150,"최대 $250 강탈"],["Shut Down",150,"카드 효과 면역"],["Bank Heist",100,"모두에게 $100 강탈"],["Overbid Trap",100,"5회 입찰 함정"]
];
const itemIcons=["✝","🥚","☕","🥇","🥈","⛑","🏺","🖥","🎸","🚀","⛵","🧰","🪴","♨","🎼","♛","▰","🔑","🪭","☢","⌛","🗡","⚔","📜","🔫","◉","🩴","🪖","⌨"];
const playerName=(id)=>room?.players.find(p=>p.id===id)?.name||"참가자";
const me=()=>room?.meId;

async function act(action, extra={}){
 if(busy)return; busy=true; ui.notice.textContent="처리 중…";
 try{const res=await fetch(`/api/rooms/${roomCode}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});const body=await res.json();if(!res.ok)throw new Error(body.error||"요청 실패");room=body.room;serverOffset=room.serverNow-Date.now();dealer=room.game?.dealer;render();}
 catch(error){ui.notice.textContent=error.message||"다시 시도해 주세요."}finally{busy=false}
}
async function sync(){
 try{const res=await fetch(`/api/rooms/${roomCode}`,{cache:"no-store"});if(!res.ok)throw new Error();const body=await res.json();room=body.room;serverOffset=room.serverNow-Date.now();dealer=room?.game?.dealer;if(!dealer)throw new Error();if(room.revision!==lastRevision){lastRevision=room.revision;render();}}
 catch{ui.notice.textContent="연결을 다시 시도하는 중…"}
}

const canvas=$("scene"),scene=new THREE.Scene();scene.background=new THREE.Color(0x170c09);scene.fog=new THREE.FogExp2(0x170c09,.035);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance",alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const camera=new THREE.PerspectiveCamera(43,1,.1,80);camera.position.set(0,8,15);camera.lookAt(0,1.2,0);
scene.add(new THREE.HemisphereLight(0xffdca8,0x23122a,2.2));const key=new THREE.SpotLight(0xffc36b,90,30,.62,.7,1);key.position.set(0,12,1);key.castShadow=true;scene.add(key);const rim=new THREE.PointLight(0x9c3d31,25,20);rim.position.set(-7,4,-5);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CylinderGeometry(13,13,.25,64),new THREE.MeshStandardMaterial({color:0x20100c,roughness:.8}));floor.position.y=-.35;floor.receiveShadow=true;scene.add(floor);
const table=new THREE.Group();scene.add(table);const top=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.35,.45,64),new THREE.MeshStandardMaterial({color:0x3f1e10,roughness:.58,metalness:.05}));top.position.y=1.65;top.castShadow=top.receiveShadow=true;table.add(top);const rimMesh=new THREE.Mesh(new THREE.TorusGeometry(5.25,.11,12,64),new THREE.MeshStandardMaterial({color:0xd08c32,metalness:.65,roughness:.25}));rimMesh.rotation.x=Math.PI/2;rimMesh.position.y=1.88;table.add(rimMesh);const leg=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.75,2.2,32),new THREE.MeshStandardMaterial({color:0x25100b,roughness:.72}));leg.position.y=.45;table.add(leg);
const characterRoot=new THREE.Group();scene.add(characterRoot);const itemRoot=new THREE.Group();itemRoot.position.y=3.2;scene.add(itemRoot);
const palette=[0x38cdb1,0xff5a7f,0xf1c53c,0x4a8fff,0x9861e9,0xf47b2b,0x75d748,0x555f72];
const accents=[0xffa52d,0xfff2d2,0x4e9cff,0x79f4ff,0xffd84c,0x3a4962,0x42d8ff,0xff4f72];
function mat(color,rough=.48,metal=.02){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
function addMesh(parent,geo,material,pos,scale=[1,1,1],rot=[0,0,0]){const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function makeCharacter(index){
 const g=new THREE.Group(),color=palette[index%palette.length],body=mat(color),dark=mat(0x17121a,.55),skin=mat(0xf6e0b8,.72),accent=mat(accents[index%accents.length],.35,.12);
 addMesh(g,new THREE.CapsuleGeometry(.46,.8,8,16),body,[0,1.05,0],[1,1,.9]);addMesh(g,new THREE.SphereGeometry(.48,22,14),skin,[0,1.92,.03],[1,1,.92]);
 [-1,1].forEach(s=>{addMesh(g,new THREE.CapsuleGeometry(.1,.38,5,10),body,[s*.52,1.05,0],[1,1,1],[0,0,-s*.28]);addMesh(g,new THREE.CapsuleGeometry(.13,.2,5,10),dark,[s*.26,.28,.08]);addMesh(g,new THREE.SphereGeometry(.055,10,8),dark,[s*.16,1.98,.45],[.75,1,.5])});
 if(index===0){addMesh(g,new THREE.BoxGeometry(.72,.78,.28),accent,[0,1.18,-.47]);addMesh(g,new THREE.BoxGeometry(.44,.1,.1),dark,[0,1.55,-.64]);}
 else if(index===1){addMesh(g,new THREE.CylinderGeometry(.4,.46,.18,20),accent,[0,2.3,0]);[-.22,0,.22].forEach((x,i)=>addMesh(g,new THREE.SphereGeometry(.25,14,10),accent,[x,2.52+(i===1?.06:0),0]));}
 else if(index===2){addMesh(g,new THREE.TorusGeometry(.45,.05,8,24),dark,[0,2.2,0],[1,.82,1],[Math.PI/2,0,0]);addMesh(g,new THREE.CylinderGeometry(.11,.14,.11,14),accent,[0,2.25,.43],[1,1,1],[Math.PI/2,0,0]);}
 else if(index===3){[-.2,.2].forEach(x=>addMesh(g,new THREE.TorusGeometry(.15,.05,8,20),accent,[x,1.98,.46]));addMesh(g,new THREE.BoxGeometry(.16,.05,.06),accent,[0,1.98,.46]);}
 else if(index===4){[-.56,.56].forEach(x=>addMesh(g,new THREE.SphereGeometry(.25,14,10),accent,[x,1.33,0],[1.12,.62,1]));}
 else if(index===5){addMesh(g,new THREE.SphereGeometry(.54,20,10,0,Math.PI*2,0,Math.PI/2),accent,[0,2.28,0],[1,.68,1]);addMesh(g,new THREE.BoxGeometry(.86,.08,.28),accent,[0,2.34,.28]);}
 else if(index===6){[-.5,.5].forEach(x=>addMesh(g,new THREE.CylinderGeometry(.18,.18,.13,16),accent,[x,2.12,0],[1,1,1],[0,0,Math.PI/2]));addMesh(g,new THREE.TorusGeometry(.52,.06,8,24,Math.PI),accent,[0,2.18,0]);}
 else{[-.27,.27].forEach(x=>addMesh(g,new THREE.ConeGeometry(.13,.46,10),accent,[x,2.53,0],[1,1,.85],[0,0,x<0?-.18:.18]));}
 g.scale.setScalar(.78);return g;
}
function rebuildSeats(){
 characterRoot.clear();if(!room)return;const count=room.players.length,own=Math.max(0,room.players.findIndex(p=>p.id===me()));
 room.players.forEach((p,i)=>{const angle=(i/count)*Math.PI*2-Math.PI/2,r=6.55,g=makeCharacter(i);g.position.set(Math.cos(angle)*r,0,Math.sin(angle)*r);g.lookAt(0,g.position.y,0);characterRoot.add(g);const chair=addMesh(characterRoot,new THREE.BoxGeometry(1.15,1.55,.35),mat(0x24130f,.8),[Math.cos(angle)*7.05,.65,Math.sin(angle)*7.05]);chair.rotation.y=-angle+Math.PI/2;});
 const ownAngle=(own/count)*Math.PI*2-Math.PI/2;camera.position.set(Math.cos(ownAngle)*11.8,6.3,Math.sin(ownAngle)*11.8);camera.lookAt(0,1.45,0);
}
function makeCenterItem(item){
 itemRoot.clear();if(!item)return;const gold=mat(0xd8a234,.27,.62),silver=mat(0xb9c0c8,.25,.75),wood=mat(0x6e3218,.67),ceramic=mat(0xd9c4a4,.42),dark=mat(0x252329,.4,.35),g=itemRoot,id=item.id;
 const pedestal=addMesh(g,new THREE.CylinderGeometry(1.05,1.2,.22,32),mat(0x1b1010,.4,.25),[0,-.76,0]);addMesh(g,new THREE.TorusGeometry(1.02,.06,8,32),gold,[0,-.63,0],[1,1,1],[Math.PI/2,0,0]);
 if(id===1)addMesh(g,new THREE.SphereGeometry(.62,28,20),gold,[0,.15,0],[.82,1.25,.82]);
 else if(id===2){addMesh(g,new THREE.CylinderGeometry(.54,.5,.75,28),ceramic,[0,.05,0]);addMesh(g,new THREE.TorusGeometry(.36,.1,10,22),ceramic,[.58,.12,0],[1,1,1],[Math.PI/2,0,0]);}
 else if([6,12].includes(id)){addMesh(g,new THREE.CylinderGeometry(.42,.58,1.25,24),ceramic,[0,.02,0]);addMesh(g,new THREE.SphereGeometry(.5,20,14),mat(0x2f8d59),[0,.72,0],[1,.45,1]);}
 else if([8,14].includes(id)){const neck=addMesh(g,new THREE.BoxGeometry(.18,1.45,.16),wood,[0,.08,0],[1,1,1],[0,0,-.25]);addMesh(g,new THREE.SphereGeometry(.5,22,16),wood,[.18,-.35,0],[.8,1,.35]);}
 else if([20].includes(id)){addMesh(g,new THREE.CylinderGeometry(.45,.45,1.15,24),glassMat(),[0,.02,0]);addMesh(g,new THREE.ConeGeometry(.34,.5,22),gold,[0,.18,0],[1,1,1],[0,0,Math.PI]);addMesh(g,new THREE.ConeGeometry(.34,.5,22),gold,[0,-.32,0]);}
 else if([21,22].includes(id)){addMesh(g,new THREE.BoxGeometry(.16,1.65,.08),silver,[0,.05,0],[1,1,1],[0,0,-.55]);addMesh(g,new THREE.BoxGeometry(.72,.16,.15),gold,[.5,-.55,0],[1,1,1],[0,0,-.55]);}
 else if([7,28].includes(id)){addMesh(g,new THREE.BoxGeometry(1.2,.78,.28),dark,[0,.05,0]);for(let x=-.45;x<.5;x+=.18)addMesh(g,new THREE.BoxGeometry(.1,.1,.38),ceramic,[x,-.45,.08]);}
 else if([3,4].includes(id)){addMesh(g,new THREE.CylinderGeometry(.58,.58,.13,32),id===3?gold:silver,[0,.1,0],[1,1,1],[Math.PI/2,0,0]);}
 else if([15].includes(id)){addMesh(g,new THREE.CylinderGeometry(.5,.62,.46,12),gold,[0,.25,0]);[-.42,-.14,.14,.42].forEach(x=>addMesh(g,new THREE.ConeGeometry(.13,.55,10),gold,[x,.74,0]));}
 else if([17].includes(id)){addMesh(g,new THREE.TorusGeometry(.38,.13,10,24),gold,[0,.1,0]);addMesh(g,new THREE.BoxGeometry(.8,.18,.14),gold,[.58,.1,0]);}
 else if([23].includes(id)){addMesh(g,new THREE.CylinderGeometry(.13,.13,1.35,18),ceramic,[0,.05,0],[1,1,1],[0,0,Math.PI/2]);addMesh(g,new THREE.CylinderGeometry(.2,.2,.18,18),gold,[-.72,.05,0],[1,1,1],[0,0,Math.PI/2]);addMesh(g,new THREE.CylinderGeometry(.2,.2,.18,18),gold,[.72,.05,0],[1,1,1],[0,0,Math.PI/2]);}
 else{addMesh(g,new THREE.DodecahedronGeometry(.68,1),id%2?gold:silver,[0,.08,0]);}
 function glassMat(){return new THREE.MeshPhysicalMaterial({color:0xffe6b0,transparent:true,opacity:.55,roughness:.08,transmission:.4})}
 lastItemUid=item.uid;
}
function resize(){const h=Math.max(1,canvas.clientHeight),w=Math.max(1,canvas.clientWidth);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}addEventListener("resize",resize);resize();
function animate(t){requestAnimationFrame(animate);itemRoot.rotation.y=t*.00055;itemRoot.position.y=3.05+Math.sin(t*.0018)*.14;characterRoot.children.forEach((c,i)=>{if(c.type==="Group")c.position.y=Math.sin(t*.0015+i)*.035});renderer.render(scene,camera)}requestAnimationFrame(animate);

function render(){
 if(!room||!dealer)return;ui.notice.textContent="";const mine=me(),inventory=dealer.inventories[mine]||[],myCards=dealer.cards[mine]||[];
 ui.round.textContent=`ROUND ${dealer.round}/${dealer.totalRounds}`;ui.phase.textContent=phaseNames[dealer.phase];ui.cash.textContent=money(dealer.balances[mine]);ui.itemCount.textContent=`${inventory.length}/4`;ui.cardCount.textContent=`${myCards.length}/3`;
 ui.seats.innerHTML=room.players.map((p,i)=>`<div class="seat ${p.id===mine?"me":""} ${p.id===dealer.sellerId?"seller":""}" style="--seat:#${palette[i%palette.length].toString(16).padStart(6,"0")}"><i></i><b>${escapeHtml(p.name)}</b><span>${money(dealer.balances[p.id])}</span></div>`).join("");
 ui.auction.hidden=!dealer.currentItem||dealer.phase==="select"||dealer.phase==="shop"||dealer.phase==="finished";if(dealer.currentItem){ui.seller.textContent=`${playerName(dealer.sellerId)} 판매`;ui.itemName.textContent=dealer.currentItem.name;ui.itemEra.textContent=dealer.currentItem.era;ui.bid.textContent=money(Math.max(100,dealer.currentBid+50));ui.highest.textContent=dealer.highestBidderId?`${playerName(dealer.highestBidderId)} 최고 입찰 ${money(dealer.currentBid)}`:"첫 입찰을 기다리는 중";if(lastItemUid!==dealer.currentItem.uid)makeCenterItem(dealer.currentItem)} else makeCenterItem(null);
 const know=dealer.currentItem&&(dealer.knowsPrice||dealer.knowsClauses);ui.dossier.hidden=!know;if(know){ui.value.textContent=dealer.knowsPrice?money(dealer.currentItem.value):"가격 미확인";ui.clauses.innerHTML=dealer.knowsClauses?dealer.currentItem.clauses.map(id=>`<div>§${id} ${escapeHtml(clauseText[id])}</div>`).join(""):"<div>조항 미확인</div>"}
 renderTab();rebuildSeats();
}
function renderTab(){if(tab==="items")return renderItems();if(tab==="cards")return renderCards();if(tab==="rules")return renderRules();renderGame()}
function renderGame(){
 const mine=me();if(dealer.phase==="select"){const selected=dealer.selected[mine]!==undefined,items=dealer.candidates[mine]||[];ui.content.innerHTML=`<div class="section-title"><h2>판매할 물건을 고르세요</h2><span>판매자만 가치·조항 확인</span></div><div class="candidate-grid">${items.map((x,i)=>`<button class="item-card" data-select="${i}" ${selected?"disabled":""}><em>${itemIcons[x.id]||"◆"}</em><strong>${escapeHtml(x.name)}</strong><small>${x.era}</small><b>${money(x.value)}</b>${x.clauses.map(c=>`<small>§${c} ${escapeHtml(clauseText[c])}</small>`).join("")}</button>`).join("")}</div>${selected?`<p class="notice">선택 완료 · 다른 딜러를 기다리는 중</p>`:""}`;ui.content.querySelectorAll("[data-select]").forEach(b=>b.onclick=()=>act("dealer-select",{itemIndex:Number(b.dataset.select)}));return}
 if(dealer.phase==="auction"){const seller=dealer.sellerId===mine,blocked=dealer.blockedBidders.includes(mine),speechLocked=dealer.speechLocked.includes(mine),full=(dealer.inventories[mine]?.length||0)>=4,next=dealer.currentBid+50,afford=dealer.balances[mine]>=next;ui.content.innerHTML=`<div class="section-title"><h2>${seller?"당신의 물건을 설득해 파세요":"말로 협상하고 입찰하세요"}</h2><span>종료 3초 이내 입찰 시 +5초</span></div>${speechLocked?`<div class="notice">🤐 조항 효과: 이번 경매가 끝날 때까지 말하지 마세요.</div>`:""}${seller?`<div class="notice">실제 가치와 조항은 위 감정서에서 확인하세요. 거짓말도 협상도 자유입니다.</div>`:`<button class="primary-action" id="bid-button" ${blocked||full||!afford?"disabled":""}>${blocked?"HAMMER LOCK · 입찰 금지":full?"아이템 인벤토리 가득 참":!afford?"현금 부족":`${money(next)} 입찰하기`}</button>`}<button class="secondary-action" data-goto-cards>카드 확인·사용</button>`;const bid=$("bid-button");if(bid)bid.onclick=()=>act("dealer-bid");ui.content.querySelector("[data-goto-cards]").onclick=()=>setTab("cards");return}
 if(dealer.phase==="resolution"){const r=dealer.lastResult;ui.content.innerHTML=`<div class="section-title"><h2>${r?.sold?"낙찰 완료":"유찰"}</h2><span>10초 후 다음 경매</span></div>${r?`<div class="inventory-row"><span>${itemIcons[r.item.id]}</span><div><strong>${escapeHtml(r.item.name)}</strong><small>${escapeHtml(r.message)}</small>${r.item.clauses.map(c=>`<div class="clause">§${c} ${escapeHtml(clauseText[c])}</div>`).join("")}</div><b>${money(r.item.value)}</b></div>`:""}`;return}
 if(dealer.phase==="shop"){const offers=dealer.shopOffers[mine]||[],reroll=dealer.rerolls[mine]||0,discount=myCards().includes(3)?.8:myCards().includes(2)?.9:1,cost=Math.round((100+reroll*100)*discount/10)*10;ui.content.innerHTML=`<div class="section-title"><h2>개인 카드 상점</h2><span>리롤 ${reroll}회 · 다음 ${money(cost)}</span></div><div class="shop-grid">${offers.map(id=>{const c=cards[id];return `<button class="card-card" data-buy="${id}" ${myCards().length>=3||dealer.balances[mine]<c[1]?"disabled":""}><strong>${c[0]}</strong><small>${c[2]}</small><b>${money(c[1])}</b></button>`}).join("")}</div><div class="action-row"><button class="secondary-action" id="reroll" ${dealer.balances[mine]<cost?"disabled":""}>↻ ${money(cost)} 리롤</button><button class="secondary-action" id="checkout" ${!(dealer.inventories[mine]?.length)?"disabled":""}>아이템 전부 시장 판매</button></div>`;ui.content.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>act("dealer-buy-card",{cardId:Number(b.dataset.buy)}));$("reroll").onclick=()=>act("dealer-reroll");$("checkout").onclick=()=>act("dealer-checkout");return}
 const ranks=[...room.players].sort((a,b)=>dealer.balances[b.id]-dealer.balances[a.id]);ui.content.innerHTML=`<div class="section-title"><h2>최종 현금 순위</h2><span>보유 아이템을 정산하세요</span></div>${ranks.map((p,i)=>`<div class="rank"><span>${i+1}</span><strong>${escapeHtml(p.name)}${p.id===mine?" · 나":""}</strong><b>${money(dealer.balances[p.id])}</b></div>`).join("")}<button class="secondary-action" id="checkout" ${!(dealer.inventories[mine]?.length)?"disabled":""}>남은 아이템 시장 판매</button>`;const checkout=$("checkout");if(checkout)checkout.onclick=()=>act("dealer-checkout");
}
function myCards(){return dealer.cards[me()]||[]}
function renderItems(){const list=dealer.inventories[me()]||[];ui.content.innerHTML=`<div class="section-title"><h2>내 아이템</h2><span>${list.length}/4 · 같은 시대 2/3/4개 = ×1.5/2/2.5</span></div><div class="inventory-list">${list.length?list.map(x=>`<div class="inventory-row"><span>${itemIcons[x.id]}</span><div><strong>${escapeHtml(x.name)}</strong><small>${x.era}</small>${x.clauses.map(c=>`<div class="clause">§${c} ${escapeHtml(clauseText[c])}</div>`).join("")}</div><b>${money(x.value)}</b></div>`).join(""):"<div class='notice'>아직 보유한 아이템이 없어요.</div>"}</div>`}
function renderCards(){const mine=me(),list=myCards(),targets=room.players.filter(p=>p.id!==mine),targetOptions=targets.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");ui.content.innerHTML=`<div class="section-title"><h2>내 카드</h2><span>${list.length}/3</span></div><select class="target-select" id="target"><option value="">대상 자동/없음</option>${targetOptions}</select><div class="inventory-list">${list.length?list.map(id=>{const c=cards[id],passive=id>=2&&id<=5;return `<div class="inventory-row"><span>▣</span><div><strong>${c[0]}</strong><small>${c[2]}</small></div><div class="card-actions">${passive?"<b>영구</b>":`<button data-use="${id}" ${dealer.phase!=="auction"?"disabled":""}>사용</button>`}</div></div>`}).join(""):"<div class='notice'>상점에서 카드를 구입하세요.</div>"}</div>`;ui.content.querySelectorAll("[data-use]").forEach(b=>b.onclick=()=>act("dealer-use-card",{cardId:Number(b.dataset.use),targetId:$("target").value}));}
function renderRules(){ui.content.innerHTML=`<div class="section-title"><h2>실제 대화형 경매 규칙</h2><span>Double Dealers 데모 확인값 기반</span></div><div class="log"><div>시작 자금 $2,000 · 아이템 4칸 · 카드 3칸</div><div>판매 후보 3개를 20초 안에 선택</div><div>경매 50초 · $100 시작 · $50 단위 · 막판 +5초</div><div>판매자는 실제 가치와 조항 2개를 보고 말로 협상</div><div>상점 60초 · 리롤 $100 → $200 → $300…</div><div>5라운드 뒤 현금이 가장 많은 딜러 승리</div>${dealer.log.slice(0,8).map(x=>`<div>${escapeHtml(x)}</div>`).join("")}</div>`}
function setTab(next){tab=next;document.querySelectorAll(".dock button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));renderTab()}
document.querySelectorAll(".dock button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
setInterval(()=>{if(dealer){const left=Math.max(0,dealer.deadline-(Date.now()+serverOffset));const sec=Math.ceil(left/1000);ui.timer.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;ui.timer.classList.toggle("danger",sec<=5&&dealer.phase!=="finished")}},200);
setInterval(sync,650);sync();
