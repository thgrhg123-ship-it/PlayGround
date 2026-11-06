(() => {
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const wildCanvas = document.getElementById('wildCanvas');
  const wctx = wildCanvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const species = [
    { id:'mossling', name:'Mossling', kind:'Leaf friend', color:'#83b887', belly:'#cfe7ad', accent:'#e4c96e', ears:'leaf', blurb:'A gentle guardian of the meadow.' },
    { id:'emberkit', name:'Emberkit', kind:'Cinder friend', color:'#ed9972', belly:'#ffd8a2', accent:'#f7c85e', ears:'flame', blurb:'A warm spark with a brave heart.' },
    { id:'dewbit', name:'Dewbit', kind:'Puddle friend', color:'#77b7c8', belly:'#c1e8df', accent:'#e9f8cf', ears:'fin', blurb:'It carries the morning dew.' },
    { id:'puffkin', name:'Puffkin', kind:'Cloud friend', color:'#ad9bc6', belly:'#eadbf0', accent:'#f1d17b', ears:'cloud', blurb:'A daydream drifting through flowers.' }
  ];
  const world = { w:2180, h:1560 };
  const defaults = { orbs:5, caught:{}, wins:0 };
  let save = loadSave();
  let view={w:900,h:520,dpr:1}, camera={x:0,y:0};
  let player={x:335,y:460,face:'right',moving:false,step:0};
  let active=null, battle=false, moving=new Set(), lastMove=0, toastTimer=0, battleDelay=false;
  let props=[], flowers=[], grassPatches=[], wilds=[];
  let nearest=null;
  const keys={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};

  function loadSave(){ try { return {...defaults,...JSON.parse(localStorage.getItem('mosslight-save')||'{}'),caught:{...(JSON.parse(localStorage.getItem('mosslight-save')||'{}').caught||{})}}; } catch { return {...defaults,caught:{}}; } }
  function persist(){ localStorage.setItem('mosslight-save',JSON.stringify(save)); updateHUD(); }
  function updateHUD(){ $('orbCount').textContent=save.orbs; const total=Object.values(save.caught).reduce((a,b)=>a+b,0); $('journalCount').textContent=total; $('journalProgress').textContent=`${Object.keys(save.caught).length} / ${species.length}`; const done=Object.keys(save.caught).length>0; $('questText').textContent=done?'Make another little friend':'Find a wild friend'; $('tipText').textContent=save.orbs===0?'Your pockets are empty — look for a glowing seed':'A tiny friend is hiding nearby'; }
  function rng(seed){let n=seed>>>0;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296}}
  function buildWorld(){
    const r=rng(4112);
    for(let i=0;i<330;i++){const x=35+r()*2110,y=35+r()*1490; if(!((x<500&&y<700)||(x>2050)||(y>1470))) props.push({x,y,type:r()<.72?'tree':'rock',scale:.65+r()*.7,shade:r()});}
    for(let i=0;i<830;i++)flowers.push({x:r()*world.w,y:r()*world.h,color:['#f5d875','#fff4d8','#df9d91','#c2d993'][Math.floor(r()*4)],size:1+r()*2});
    grassPatches=[{x:535,y:465,rx:260,ry:175},{x:1120,y:390,rx:310,ry:205},{x:1515,y:990,rx:340,ry:240},{x:680,y:1160,rx:290,ry:210},{x:1850,y:610,rx:195,ry:260}];
    wilds=[{species:0,x:460,y:435,active:true,seed:1},{species:1,x:1100,y:390,active:true,seed:2},{species:2,x:1480,y:990,active:true,seed:3},{species:3,x:650,y:1140,active:true,seed:4},{species:0,x:1810,y:640,active:true,seed:5}];
  }
  function resize(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);view={w:rect.width,h:rect.height,dpr};canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0); camera.x=clamp(player.x-view.w/2,0,world.w-view.w);camera.y=clamp(player.y-view.h/2,0,world.h-view.h);}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
  function screen(x,y){return [x-camera.x,y-camera.y]}
  function draw(){
    const {w,h}=view;ctx.clearRect(0,0,w,h);ctx.fillStyle='#9cc68f';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(-camera.x,-camera.y);
    // soft meadow variation
    for(let y=Math.floor(camera.y/150)*150;y<camera.y+h+150;y+=150)for(let x=Math.floor(camera.x/150)*150;x<camera.x+w+150;x+=150){const n=((Math.floor(x/150)*31+Math.floor(y/150)*17)%11+11)%11;ctx.fillStyle=n%2?'#a7ce98':'#96c28e';ctx.globalAlpha=.16;ctx.beginPath();ctx.ellipse(x+58,y+84,110+n*2,74+n,0,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
    drawPond();drawPath();
    // flowers tucked into open grass
    for(const f of flowers){if(f.x<camera.x-10||f.x>camera.x+w+10||f.y<camera.y-10||f.y>camera.y+h+10)continue;ctx.fillStyle='#4f8956';ctx.globalAlpha=.55;ctx.fillRect(f.x,f.y+2,1,3);ctx.globalAlpha=.95;ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(f.x,f.y,f.size,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
    grassPatches.forEach((g,i)=>drawGrass(g,i));
    props.filter(p=>p.x>camera.x-70&&p.x<camera.x+w+70&&p.y>camera.y-90&&p.y<camera.y+h+80).sort((a,b)=>a.y-b.y).forEach(drawProp);
    wilds.forEach((m)=>{if(!m.active)return;const sx=m.x,sy=m.y;if(sx<camera.x-55||sx>camera.x+w+55||sy<camera.y-60||sy>camera.y+h+60)return; drawCreature(ctx,species[m.species],sx,sy,0.65,performance.now()/900+m.seed); if(Math.hypot(m.x-player.x,m.y-player.y)<190){ctx.fillStyle='#fff9de';roundRect(ctx,sx-12,sy-41,24,17,8);ctx.fillStyle='#e2ad4f';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('!',sx,sy-29)}});
    drawPlayer();ctx.restore();
    requestAnimationFrame(draw);
  }
  function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
  function drawPath(){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-80,635);ctx.bezierCurveTo(250,650,300,780,560,710);ctx.bezierCurveTo(820,650,760,515,980,550);ctx.bezierCurveTo(1220,595,1270,820,1540,735);ctx.bezierCurveTo(1790,650,1750,480,2280,465);ctx.strokeStyle='#d5cc9b';ctx.lineWidth=118;ctx.stroke();ctx.strokeStyle='#e8dfb3';ctx.lineWidth=92;ctx.stroke();ctx.globalAlpha=.35;ctx.setLineDash([6,18]);ctx.strokeStyle='#b8ae80';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
  function drawPond(){const x=1740,y=1260;ctx.save();ctx.fillStyle='#77a889';ctx.beginPath();ctx.ellipse(x,y,270,130,-.16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#77c0c2';ctx.beginPath();ctx.ellipse(x,y-5,250,109,-.16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a5d9cf';ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(x-45,y-34,73,11,-.16,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#699c69':'#b4ce83';ctx.beginPath();ctx.ellipse(x-210+i*91,y+45+Math.sin(i)*10,18,8,.35,0,Math.PI*2);ctx.fill()}ctx.restore()}
  function drawGrass(g,i){const {x,y,rx,ry}=g;ctx.save();ctx.fillStyle=i%2?'#82b276':'#88ba79';ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.13,0,Math.PI*2);ctx.fill();const r=rng(44+i*99);for(let n=0;n<145;n++){const a=r()*Math.PI*2,rad=Math.sqrt(r()),px=x+Math.cos(a)*rx*rad,py=y+Math.sin(a)*ry*rad;ctx.strokeStyle=n%4===0?'#578e61':'#6aa16a';ctx.globalAlpha=.32+r()*.24;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px,py+5);ctx.quadraticCurveTo(px-4,py-2,px-2+r()*6,py-9-r()*5);ctx.stroke()}ctx.globalAlpha=1;ctx.restore()}
  function drawProp(p){ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.scale,p.scale);if(p.type==='tree'){ctx.fillStyle='#557d51';ctx.beginPath();ctx.ellipse(2,7,30,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c6547';ctx.fillRect(-6,-18,12,31);ctx.fillStyle=p.shade>.5?'#4f875b':'#598f61';ctx.beginPath();ctx.arc(-9,-27,23,0,Math.PI*2);ctx.arc(10,-32,25,0,Math.PI*2);ctx.arc(0,-48,22,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.shade>.5?'#79aa6b':'#83b879';ctx.beginPath();ctx.arc(-14,-38,12,0,Math.PI*2);ctx.arc(7,-48,13,0,Math.PI*2);ctx.arc(16,-28,11,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.65;ctx.fillStyle='#d4e4a4';ctx.beginPath();ctx.arc(-11,-43,3,0,Math.PI*2);ctx.fill()}else{ctx.fillStyle='#749976';ctx.beginPath();ctx.ellipse(0,4,19,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8b9b86';ctx.beginPath();ctx.moveTo(-20,5);ctx.lineTo(-14,-11);ctx.lineTo(-4,-17);ctx.lineTo(9,-12);ctx.lineTo(19,5);ctx.closePath();ctx.fill();ctx.fillStyle='#bdc9a6';ctx.beginPath();ctx.ellipse(-5,-9,6,3,-.4,0,Math.PI*2);ctx.fill()}ctx.restore()}
  function drawPlayer(){const x=player.x,y=player.y,step=player.moving?Math.sin(player.step)*2:0;ctx.save();ctx.translate(x,y+step);ctx.fillStyle='#557b5960';ctx.beginPath();ctx.ellipse(0,2,13,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f0bd8b';ctx.beginPath();ctx.arc(0,-14,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#5e493e';ctx.beginPath();ctx.arc(0,-17,8,Math.PI,Math.PI*2);ctx.lineTo(7,-12);ctx.quadraticCurveTo(0,-17,-7,-12);ctx.fill();ctx.fillStyle='#e88d72';ctx.beginPath();ctx.ellipse(0,-4,9,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f8e6a8';ctx.beginPath();ctx.ellipse(0,-3,5,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#729a6a';ctx.beginPath();ctx.ellipse(-5,5+Math.max(0,step),4,3,-.2,0,Math.PI*2);ctx.ellipse(5,5+Math.max(0,-step),4,3,.2,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawCreature(c,spec,cx,cy,scale=1,t=0){const bob=Math.sin(t)*2; c.save();c.translate(cx,cy+bob);c.scale(scale,scale);c.fillStyle='#496d4a25';c.beginPath();c.ellipse(0,29,30,8,0,0,Math.PI*2);c.fill();
    // ears and species motif
    if(spec.ears==='leaf'){c.fillStyle='#5e9f6b';c.beginPath();c.ellipse(-17,-28,8,19,-.55,0,Math.PI*2);c.ellipse(17,-29,8,19,.55,0,Math.PI*2);c.fill();c.strokeStyle='#c1dfa0';c.lineWidth=1.7;c.beginPath();c.moveTo(-18,-16);c.lineTo(-12,-38);c.moveTo(18,-16);c.lineTo(12,-39);c.stroke()}
    else if(spec.ears==='flame'){c.fillStyle='#ec9369';c.beginPath();c.moveTo(-20,-20);c.quadraticCurveTo(-31,-42,-12,-45);c.quadraticCurveTo(-15,-31,-5,-26);c.moveTo(20,-20);c.quadraticCurveTo(31,-42,12,-45);c.quadraticCurveTo(15,-31,5,-26);c.fill()}
    else if(spec.ears==='fin'){c.fillStyle='#64aabc';c.beginPath();c.ellipse(-24,-15,8,16,-.7,0,Math.PI*2);c.ellipse(24,-15,8,16,.7,0,Math.PI*2);c.fill()}
    else{c.fillStyle='#b29ecb';c.beginPath();c.arc(-20,-21,12,0,Math.PI*2);c.arc(20,-21,12,0,Math.PI*2);c.fill()}
    c.fillStyle=spec.color;c.beginPath();c.ellipse(0,-5,28,31,0,0,Math.PI*2);c.fill();c.fillStyle=spec.belly;c.beginPath();c.ellipse(0,7,17,17,0,0,Math.PI*2);c.fill();
    // cheeks and face
    c.fillStyle='#fff';c.beginPath();c.ellipse(-9,-10,4.5,6,0,0,Math.PI*2);c.ellipse(9,-10,4.5,6,0,0,Math.PI*2);c.fill();c.fillStyle='#344d42';c.beginPath();c.arc(-8,-9,2,0,Math.PI*2);c.arc(10,-9,2,0,Math.PI*2);c.fill();c.fillStyle='#e58f82';c.globalAlpha=.75;c.beginPath();c.ellipse(-17,0,4,2.4,0,0,Math.PI*2);c.ellipse(17,0,4,2.4,0,0,Math.PI*2);c.fill();c.globalAlpha=1;c.strokeStyle='#715d53';c.lineWidth=1.6;c.lineCap='round';c.beginPath();c.moveTo(-2,-1);c.quadraticCurveTo(0,2,2,-1);c.stroke();
    if(spec.id==='mossling'){c.fillStyle='#e6ce6d';c.beginPath();c.arc(0,-31,6,0,Math.PI*2);c.fill();c.fillStyle='#fff1a7';c.beginPath();c.arc(-2,-33,2,0,Math.PI*2);c.fill()}
    if(spec.id==='emberkit'){c.fillStyle='#f5cb6b';c.beginPath();c.moveTo(0,20);c.quadraticCurveTo(13,15,12,9);c.quadraticCurveTo(24,22,5,26);c.fill()}
    if(spec.id==='dewbit'){c.fillStyle='#e7f7d1';c.beginPath();c.ellipse(0,-33,7,4,0,0,Math.PI*2);c.fill()}
    if(spec.id==='puffkin'){c.fillStyle='#f3df86';c.beginPath();c.arc(0,-34,5,0,Math.PI*2);c.fill()}
    c.restore()}
  function move(dir,dt){let dx=0,dy=0;if(dir==='up')dy=-1;if(dir==='down')dy=1;if(dir==='left')dx=-1;if(dir==='right')dx=1;if(!dx&&!dy)return;const len=Math.hypot(dx,dy);player.x=clamp(player.x+dx/len*dt*0.19,15,world.w-15);player.y=clamp(player.y+dy/len*dt*0.19,15,world.h-15);player.face=dir;player.step+=dt*.012;}
  function loopMove(now){const dt=Math.min(40,now-lastMove||16);lastMove=now;player.moving=moving.size>0&&!battle&&!battleDelay;if(player.moving){const dirs=[...moving];if(dirs.includes('left')&&dirs.includes('right')){}else if(dirs.includes('up')&&dirs.includes('down')){}else move(dirs[dirs.length-1],dt);}
    const {w,h}=view;camera.x+=(clamp(player.x-w/2,0,world.w-w)-camera.x)*.13;camera.y+=(clamp(player.y-h/2,0,world.h-h)-camera.y)*.13;
    nearest=wilds.filter(m=>m.active).map(m=>({m,d:Math.hypot(player.x-m.x,player.y-m.y)})).sort((a,b)=>a.d-b.d)[0]||null;
    if(!battle&&!battleDelay&&nearest&&nearest.d<38){startBattle(nearest.m)}
    requestAnimationFrame(loopMove);
  }
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
  function startBattle(m){battleDelay=true;moving.clear();active=m;$('toast').classList.remove('show');setTimeout(()=>{battle=true;battleDelay=false;active.resolve=100;active.turn=0;$('battleName').textContent=species[m.species].name;$('battleMessage').textContent=`A little ${species[m.species].name} peeked out of the ferns.`;$('battleOverlay').classList.remove('hidden');$('bottomHint').classList.add('hidden');drawWild();updateBattleUI()},230)}
  function drawWild(){wctx.clearRect(0,0,240,190);drawCreature(wctx,species[active.species],120,105,1.35,performance.now()/900+2)}
  function updateBattleUI(){const resolve=active?.resolve??100;$('moodFill').style.width=`${resolve}%`;$('spiritValue').textContent=`${resolve}%`;$('moodLabel').textContent=resolve>68?'CURIOUS':resolve>35?'FEELING SAFE':'VERY CALM';$('moodLabel').style.color=resolve>68?'#d6915e':'#679468';let odds=Math.round(Math.min(92,30+(100-resolve)*.72));$('catchOdds').textContent=save.orbs?`${odds}% chance`:'No orbs left';$('catchButton').disabled=save.orbs===0;$('catchButton').style.opacity=save.orbs===0?'.55':'1'}
  function finishBattle(message){battle=false;active.active=false;$('battleOverlay').classList.add('hidden');$('bottomHint').classList.remove('hidden');if(message)showToast(message);updateHUD()}
  function soothed(){if(!battle)return;active.resolve=Math.max(15,active.resolve-30);active.turn++;$('battleMessage').textContent=`${species[active.species].name} relaxes a little. It trusts you more.`;updateBattleUI();}
  function catchIt(){if(!battle||save.orbs<=0)return;save.orbs--;active.turn++;persist();const odds=Math.min(.92,.30+(100-active.resolve)*.0072);if(Math.random()<odds){const spec=species[active.species];save.caught[spec.id]=(save.caught[spec.id]||0)+1;save.wins++;persist();$('battleMessage').textContent=`${spec.name} is happy to come along!`;setTimeout(()=>finishBattle(`${spec.name} joined your little journey!`),850)}else{active.resolve=Math.max(15,active.resolve-9);$('battleMessage').textContent=`The orb wobbled... ${species[active.species].name} is still deciding.`;updateBattleUI();if(save.orbs===0)setTimeout(()=>{if(battle)finishBattle('The little spirit wandered back into the meadow.')},1000)}}
  function runAway(){if(!battle)return;const name=species[active.species].name;battle=false;$('battleOverlay').classList.add('hidden');$('bottomHint').classList.remove('hidden');showToast(`${name} skips back into the flowers.`)}
  function openJournal(){if(battle)return;$('collectionOverlay').classList.remove('hidden');renderCollection()}
  function renderCollection(){const grid=$('collectionGrid');grid.innerHTML='';species.forEach((s,i)=>{const count=save.caught[s.id]||0;const card=document.createElement('div');card.className=`creature-card${count?'':' locked'}`;card.innerHTML=`<div class="creature-thumb"><canvas width="96" height="96"></canvas></div><div class="creature-info"><b>${count?s.name:'???'}</b><small>${count?s.kind:'Not met yet'}</small></div>${count?`<span class="creature-count">×${count}</span>`:''}`;grid.appendChild(card);const c=card.querySelector('canvas').getContext('2d');drawCreature(c,s,48,53,.78,0);if(!count){c.fillStyle='#e9eadf9c';c.fillRect(0,0,96,96)}});}
  function triggerExplore(){if(battle)return;if(nearest&&nearest.d<175){const dx=nearest.m.x-player.x,dy=nearest.m.y-player.y;player.face=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');player.x+=dx/Math.hypot(dx,dy)*42;player.y+=dy/Math.hypot(dx,dy)*42;showToast('You hear a tiny rustle in the grass...')}else{const face=player.face;move(face,210);showToast('The meadow rustles softly around you.')}}
  function bindControls(){document.querySelectorAll('.pad').forEach(btn=>{const dir=btn.dataset.dir;const down=e=>{e.preventDefault();moving.add(dir);btn.classList.add('pressed');try{btn.setPointerCapture(e.pointerId)}catch{}};const up=e=>{e.preventDefault();moving.delete(dir);btn.classList.remove('pressed')};btn.addEventListener('pointerdown',down);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,up));});window.addEventListener('keydown',e=>{if(keys[e.key]){e.preventDefault();moving.add(keys[e.key])}if(e.key==='Escape'){battle?runAway():$('collectionOverlay').classList.add('hidden')}});window.addEventListener('keyup',e=>{if(keys[e.key])moving.delete(keys[e.key])});window.addEventListener('blur',()=>moving.clear());$('exploreButton').addEventListener('click',triggerExplore);$('journalButton').addEventListener('click',openJournal);$('closeJournal').addEventListener('click',()=>$('collectionOverlay').classList.add('hidden'));$('collectionOverlay').addEventListener('click',e=>{if(e.target===$('collectionOverlay'))$('collectionOverlay').classList.add('hidden')});$('sootheButton').addEventListener('click',soothed);$('catchButton').addEventListener('click',catchIt);$('runButton').addEventListener('click',runAway);$('resetButton').addEventListener('click',()=>{if(confirm('Start over? Your friends and orbs will be forgotten.')){localStorage.removeItem('mosslight-save');save={...defaults,caught:{}};persist();renderCollection();showToast('A fresh journey begins!')}})}
  buildWorld();updateHUD();bindControls();resize();new ResizeObserver(resize).observe(canvas);requestAnimationFrame(draw);requestAnimationFrame(loopMove);
})();
