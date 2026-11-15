import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  TILE,MW,MH,ROUND_SECONDS,REQUIRED_GENERATORS,GEN_DURATION,
  GENERATOR_TILES,EXIT_TILES,SURVIVOR_SPAWNS,HUNTER_SPAWN,
  tileToWorld,moveCircle,gridPath,distance,clamp,lineClear,normalizeAngle
} from './public/world.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.disable('x-powered-by');
app.use(express.static(path.join(ROOT,'public'),{extensions:['html']}));
app.use('/vendor/three',express.static(path.join(ROOT,'node_modules','three')));
app.get('/health',(_req,res)=>res.json({ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((a,r)=>a+r.people.size,0)}));
const server=createServer(app);
const io=new Server(server,{maxHttpBufferSize:32_000,pingTimeout:20_000,cors:{origin:true,methods:['GET','POST']}});
const rooms=new Map();
const names=['FANTASMA','UMBRA','ECHO','RAVEN','NOVA','ASH','MOTH','VEIL','NOX','SPARK'];
const randomCode=()=>randomBytes(4).toString('hex').slice(0,5).toUpperCase();
const cleanName=value=>String(value||'Sopravvissuto').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,16)||'Sopravvissuto';
const roomOf=socket=>rooms.get(socket.data.room);
const newSession=()=>randomBytes(18).toString('hex');
function rememberPlayer(r,socket,name,pref){
  const token=newSession();socket.data.resumeToken=token;
  r.sessions.set(token,{id:socket.id,name,pref});return token;
}
const event=(r,text,type='notice')=>{io.to(r.code).emit('match:event',{id:++r.eventId,text,type});};
const publicLobby=r=>({code:r.code,phase:r.phase,host:r.host,fillBots:r.fillBots,
  people:[...r.people.entries()].map(([id,p])=>({id,name:p.name,pref:p.pref})),
  winner:r.winner,chat:r.chat.slice(-16)});
const syncLobby=r=>io.to(r.code).emit('room:state',publicLobby(r));
function makeRoom(socket,name) {
  let code;do{code=randomCode();}while(rooms.has(code));
  const r={code,host:socket.id,phase:'lobby',fillBots:true,winner:'',people:new Map(),sessions:new Map(),emptyAt:0,
    players:new Map(),generators:[],exits:[],timeLeft:ROUND_SECONDS,lastTick:0,
    chat:[],eventId:0,startedAt:0};
  const clean=cleanName(name);
  r.people.set(socket.id,{name:clean,pref:'survivor'});
  rememberPlayer(r,socket,clean,'survivor');rooms.set(code,r);
  socket.join(code);socket.data.room=code;syncLobby(r);return r;
}
function leave(socket,explicit=false) {
  const r=roomOf(socket);if(!r)return;
  socket.leave(r.code);socket.data.room=null;r.people.delete(socket.id);
  if(explicit&&socket.data.resumeToken)r.sessions.delete(socket.data.resumeToken);
  socket.data.resumeToken=null;
  if(r.phase==='playing'&&r.players.has(socket.id)) {
    const p=r.players.get(socket.id);p.bot=true;p.name=`${p.name} [IA]`;
    p.input={};event(r,`${p.name.replace(' [IA]','')} sostituito da un bot.`);
  }
  if(r.people.size===0){
    if(explicit){rooms.delete(r.code);return;}
    r.emptyAt=Date.now();
  }
  if(r.host===socket.id)r.host=r.people.keys().next().value||socket.id;
  syncLobby(r);
}
function mkPlayer(id,name,role,bot,index=0) {
  const coords=role==='hunter'?HUNTER_SPAWN:SURVIVOR_SPAWNS[index%SURVIVOR_SPAWNS.length];
  const p=tileToWorld(...coords);
  return {id,name,role,bot,x:p.x,z:p.z,yaw:role==='hunter'?Math.PI:0,
    health:role==='hunter'?99:2,stamina:100,alive:true,escaped:false,
    sprint:false,crouch:false,flashlight:role!=='hunter',input:{},
    attackCd:0,abilityCd:0,reveal:0,invulnerable:0,slow:0,
    heal:0,escapeCharge:0,interact:'',botTarget:null,path:[],pathAt:0,
    botRepath:0,step:0,gesture:0,lastInputAt:Date.now()};
}
function startRoom(r) {
  const users=[...r.people.entries()];
  if(users.length<2&&!r.fillBots)return 'Occorrono almeno 2 giocatori oppure attiva i bot.';
  let hunter=users.find(([,p])=>p.pref==='hunter');
  if(!hunter&&(!r.fillBots||users.length>=5))hunter=users.find(([,p])=>p.pref==='random')||users[users.length-1];
  r.players.clear();
  let surv=0;
  for(const [id,u] of users) {
    const role=id===hunter?.[0]?'hunter':'survivor';
    r.players.set(id,mkPlayer(id,u.name,role,false,surv));
    if(role==='survivor')surv++;
  }
  const total=r.fillBots?5:users.length;
  for(let i=users.length;i<total;i++) {
    const role=!hunter&&i===users.length?'hunter':'survivor';
    const id=`bot-${i}-${r.code}`;
    r.players.set(id,mkPlayer(id,role==='hunter'?'THE WARDEN':names[(i+Math.floor(Math.random()*names.length))%names.length],role,true,surv));
    if(role==='survivor')surv++;
    if(role==='hunter')hunter=[id,{}];
  }
  // Solo room + four survivors: one of the bots must be the hunter.
  if(![...r.players.values()].some(p=>p.role==='hunter')){
    const bot=[...r.players.values()].find(p=>p.bot);
    if(bot){r.players.set(bot.id,mkPlayer(bot.id,'THE WARDEN','hunter',true));}
    else{return 'Serve un assassino: aumenta i giocatori o abilita i bot.';}
  }
  r.generators=GENERATOR_TILES.map(([i,j],id)=>({...tileToWorld(i,j),id,progress:0,done:false}));
  r.exits=EXIT_TILES.map(([i,j],id)=>({...tileToWorld(i,j),id}));
  r.timeLeft=ROUND_SECONDS;r.startedAt=Date.now();r.lastTick=Date.now();r.phase='playing';r.winner='';
  syncLobby(r);io.to(r.code).emit('match:start',snapshot(r));
  event(r,'MEZZANOTTE. Riparate 4 generatori e raggiungete l’uscita.','objective');
  return null;
}
function snapshot(r) {
  return {phase:r.phase,code:r.code,timeLeft:Math.max(0,r.timeLeft),winner:r.winner,
    remaining:[...r.players.values()].filter(p=>p.role==='survivor'&&p.alive&&!p.escaped).length,
    completed:r.generators.filter(g=>g.done).length,required:REQUIRED_GENERATORS,
    generators:r.generators.map(g=>({id:g.id,progress:g.progress,done:g.done})),
    exitsOpen:r.generators.filter(g=>g.done).length>=REQUIRED_GENERATORS,
    players:[...r.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,role:p.role,x:p.x,z:p.z,yaw:p.yaw,
      health:p.health,stamina:p.stamina,alive:p.alive,escaped:p.escaped,sprint:p.sprint,
      crouch:p.crouch,flashlight:p.flashlight,attackCd:p.attackCd,abilityCd:p.abilityCd,
      reveal:p.reveal,heal:p.heal,escapeCharge:p.escapeCharge,interact:p.interact,step:p.step,gesture:p.gesture}))};
}
function endRoom(r,winner,reason) {
  if(r.phase!=='playing')return;
  r.phase='ended';r.winner=winner;
  event(r,reason,winner==='survivors'?'success':'danger');
  io.to(r.code).emit('match:end',{winner,reason,stats:snapshot(r)});
  syncLobby(r);
}
function hit(r,killer) {
  if(!killer.alive||killer.attackCd>0)return;
  killer.attackCd=1.22;killer.gesture++;
  const dir={x:Math.sin(killer.yaw),z:-Math.cos(killer.yaw)};
  let target=null,best=3.05;
  for(const p of r.players.values()) {
    if(p.role!=='survivor'||!p.alive||p.escaped||p.invulnerable>0)continue;
    const d=distance(killer,p);if(d>best)continue;
    const dot=((p.x-killer.x)*dir.x+(p.z-killer.z)*dir.z)/Math.max(.01,d);
    if(dot<0.36||!lineClear(killer,p))continue;
    best=d;target=p;
  }
  if(target) {
    target.health--;target.invulnerable=2.1;target.slow=.85;
    event(r,`${target.name} è stato colpito da THE WARDEN!`,'danger');
    if(target.health<=0){target.alive=false;event(r,`${target.name} è stato eliminato.`,'danger');}
    io.to(r.code).emit('match:hit',{target:target.id,killer:killer.id});
  } else io.to(r.code).emit('match:swing',{killer:killer.id});
}
function movePlayer(p,dt) {
  if(!p.alive||p.escaped)return;
  const input=p.input||{};const f=clamp(Number(input.f)||0,-1,1),s=clamp(Number(input.s)||0,-1,1);
  if(Number.isFinite(input.yaw))p.yaw=normalizeAngle(input.yaw);
  const len=Math.max(1,Math.hypot(f,s));
  let speed=p.role==='hunter'?5.55:4.55;
  p.sprint=Boolean(input.sprint)&&((p.role==='hunter')||p.stamina>1)&&f>0;
  p.crouch=p.role==='survivor'&&Boolean(input.crouch);
  if(p.role==='hunter'){if(p.sprint)speed=7.1;}
  else if(p.crouch)speed=2.35;
  else if(p.sprint){speed=7.65;p.stamina=Math.max(0,p.stamina-26*dt);}
  else p.stamina=Math.min(100,p.stamina+18*dt);
  if(p.slow>0)speed*=.48;
  const dx=(f*Math.sin(p.yaw)+s*Math.cos(p.y))/len*speed*dt;
  const dz=(-f*Math.cos(p.yaw)+s*Math.sin(p.yaw))/len*speed*dt;
  const next=moveCircle(p,dx,dz,p.role==='hunter'?.52:.39);
  p.step=Math.hypot(next.x-p.x,next.z-p.z)>0.012?p.step+dt*(p.sprint?1.7:1):p.step;
  p.x=next.x;p.z=next.z;
}
function updateBot(r,p,dt) {
  if(!p.alive||p.escaped)return;
  p.botRepath-=dt;
  let target;
  const players=[...r.players.values()];
  if(p.role==='hunter') {
    const candidates=players.filter(q=>q.role==='survivor'&&q.alive&&!q.escaped);
    if(!candidates.length)return;
    candidates.sort((a,b)=>distance(p,a)-distance(p,b));
    const nearest=candidates[0];
    const tracking=distance(p,nearest)<23;
    if(tracking)target=nearest;
    else {
      const liveG=r.generators.filter(g=>!g.done);
      target=liveG[Math.floor((Date.now()/9000+p.id.length)%Math.max(1,liveG.length))]||nearest;
    }
    if(distance(p,nearest)<2.9&&p.attackCd<=0&&lineClear(p,nearest)){
      p.yaw=Math.atan2(nearest.x-p.x,-(nearest.z-p.z));hit(r,p);
    }
    if(p.abilityCd<=0&&tracking){p.reveal=4;p.abilityCd=22;event(r,'THE WARDEN ha attivato l’ecoscandaglio!','danger');}
  } else {
    const hunter=players.find(q=>q.role==='hunter');
    const danger=hunter&&distance(p,hunter)<9&&hunter.alive;
    if(danger){
      const options=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>({x:p.x+dx*TILE*3,z:p.z+dz*TILE*3}))
        .filter(o=>gridPath(p,o).length>0).sort((a,b)=>distance(b,hunter)-distance(a,hunter));
      target=options[0]||{x:p.x+(p.x-hunter.x),z:p.z+(p.z-hunter.z)};
    } else if(r.generators.filter(g=>g.done).length>=REQUIRED_GENERATORS) {
      target=r.exits.reduce((a,b)=>distance(p,a)<distance(p,b)?a:b);
    } else {
      const available=r.generators.filter(g=>!g.done);
      available.sort((a,b)=>distance(p,a)-distance(p,b));
      target=available[0];
    }
    p.input.interact=Boolean(!danger&&target&&distance(p,target)<2.55);
    if(target&&p.input.interact){p.input={...p.input,f:0,s:0,yaw:p.yaw};return;}
  }
  if(!target)return;
  if(p.botRepath<=0||p.botTarget!==target.id){
    p.path=gridPath(p,target);p.pathAt=0;p.botTarget=target.id;p.botRepath=.65+Math.random()*.4;
  }
  while(p.pathAt<p.path.length&&distance(p,p.path[p.pathAt])<.7)p.pathAt++;
  const next=p.path[p.pathAt]||target;
  const d=distance(p,next);
  if(d>.15){
    p.yaw=Math.atan2(next.x-p.x,-(next.z-p.z));
    p.input={f:1,s:0,sprint:p.role==='hunter'&&distance(p,target)<15,yaw:p.yaw,interact:false};
    if(p.role==='survivor')p.input.sprint=Boolean(players.find(q=>q.role==='hunter'&&distance(p,q)<11));
  }else p.input={f:0,s:0,yaw:p.yaw,interact:!!p.input.interact};
  movePlayer(p,dt);
}
function updateInteraction(r,p,dt) {
  p.interact='';if(!p.alive||p.escaped||p.role==='hunter')return;
  if(!p.input.interact){p.heal=0;p.escapeCharge=Math.max(0,p.escapeCharge-dt*1.3);return;}
  const others=[...r.players.values()].filter(q=>q.id!==p.id&&q.role==='survivor'&&q.alive&&!q.escaped&&q.health<2&&distance(p,q)<2.65);
  const healing=others[0];
  if(healing){p.interact=`CURANDO ${healing.name}`;p.heal+=dt;
    if(p.heal>=5){healing.health=2;p.heal=0;event(r,`${p.name} ha curato ${healing.name}.`,'success');}
    return;
  }
  p.heal=0;
  const done=r.generators.filter(g=>g.done).length;
  if(done>=REQUIRED_GENERATORS) {
    const exit=r.exits.find(e=>distance(p,e)<2.8);
    if(exit){p.interact='SBLOCCO USCITA';p.escapeCharge+=dt;
      if(p.escapeCharge>=3){p.escaped=true;p.escapeCharge=3;event(r,`${p.name} è riuscito a fuggire!`,'success');}
    }
    return;
  }
  const g=r.generators.find(g=>!g.done&&distance(p,g)<2.75);
  if(!g)return;
  p.interact=`RIPARANDO G${g.id+1}`;
  g.progress=Math.min(1,g.progress+dt/(GEN_DURATION*(p.bot?1.7:1)));
  if(g.progress>=1){g.done=true;g.progress=1;event(r,`GENERATORE ${g.id+1} RIPRISTINATO! (${done+1}/${REQUIRED_GENERATORS})`,'success');
    io.to(r.code).emit('match:generator',{id:g.id});
    if(done+1>=REQUIRED_GENERATORS)event(r,'USCITE ATTIVE! Mantenete premuto E davanti al portale.','objective');
  }
}
function tick(r,dt) {
  if(r.phase!=='playing')return;
  r.timeLeft=Math.max(0,r.timeLeft-dt);
  for(const p of r.players.values()) {
    p.attackCd=Math.max(0,p.attackCd-dt);p.abilityCd=Math.max(0,p.abilityCd-dt);
    p.invulnerable=Math.max(0,p.invulnerable-dt);p.slow=Math.max(0,p.slow-dt);p.reveal=Math.max(0,p.reveal-dt);
  }
  for(const p of r.players.values()){
    if(!p.bot&&Date.now()-p.lastInputAt>450)p.input={...p.input,f:0,s:0,sprint:false,interact:false};
    if(p.bot)updateBot(r,p,dt);else movePlayer(p,dt);
  }
  for(const p of r.players.values())updateInteraction(r,p,dt);
  const survivors=[...r.players.values()].filter(p=>p.role==='survivor');
  if(!survivors.some(p=>p.alive&&!p.escaped)) {
    const escaped=survivors.filter(p=>p.escaped).length;
    endRoom(r,escaped?'survivors':'hunter',escaped?`${escaped} sopravvissuti sono fuggiti. I superstiti vincono!`:'Nessun sopravvissuto. THE WARDEN vince.');
  } else if(r.timeLeft<=0) {
    const escaped=survivors.filter(p=>p.escaped).length;
    endRoom(r,escaped?'survivors':'hunter',escaped?'L’alba è arrivata: alcuni sono scappati.':'È arrivata l’alba. Nessuno è riuscito a scappare.');
  }
}

io.on('connection',socket=>{
  socket.on('room:create',(data={},ack)=>{
    if(typeof ack!=='function')return;leave(socket,true);
    const r=makeRoom(socket,data.name);ack({ok:true,code:r.code,token:socket.data.resumeToken});
  });
  socket.on('room:join',(data={},ack)=>{
    if(typeof ack!=='function')return;
    const code=String(data.code||'').toUpperCase().trim();const r=rooms.get(code);
    if(!r)return ack({ok:false,error:'Stanza non trovata. Controlla il codice.'});
    if(r.phase!=='lobby')return ack({ok:false,error:'Partita già iniziata. Attendi il prossimo turno.'});
    if(r.people.size>=5)return ack({ok:false,error:'Stanza piena (massimo 5 giocatori).'});
    leave(socket,true);const clean=cleanName(data.name);
    r.people.set(socket.id,{name:clean,pref:'random'});
    socket.join(r.code);socket.data.room=r.code;r.emptyAt=0;
    rememberPlayer(r,socket,clean,'random');syncLobby(r);
    ack({ok:true,code:r.code,token:socket.data.resumeToken});
  });
  // Recover a phone after Wi-Fi/mobile network changes or a page refresh.
  socket.on('room:resume',(data={},ack)=>{
    if(typeof ack!=='function')return;
    const code=String(data.code||'').toUpperCase().trim();
    const token=String(data.token||'');
    const r=rooms.get(code),session=r?.sessions.get(token);
    if(!session)return ack({ok:false,error:'Stanza scaduta o sessione non riconosciuta.'});
    const oldId=session.id;
    const previous=io.sockets.sockets.get(oldId);
    if(previous&&previous.id!==socket.id){
      previous.leave(r.code);previous.data.room=null;previous.data.resumeToken=null;
      previous.disconnect(true);
    }
    if(roomOf(socket))leave(socket,true);
    const oldPlayer=r.players.get(oldId);
    if(r.phase==='playing'&&!oldPlayer)return ack({ok:false,error:'Giocatore non più recuperabile.'});
    r.people.delete(oldId);
    r.people.set(socket.id,{name:session.name,pref:session.pref});
    r.emptyAt=0;
    if(r.host===oldId)r.host=socket.id;
    if(oldPlayer){
      r.players.delete(oldId);oldPlayer.id=socket.id;oldPlayer.name=session.name;
      oldPlayer.bot=false;oldPlayer.input={};oldPlayer.lastInputAt=Date.now();
      r.players.set(socket.id,oldPlayer);
    }
    session.id=socket.id;socket.data.room=code;socket.data.resumeToken=token;
    socket.join(code);
    ack({ok:true,code,token,phase:r.phase});
    syncLobby(r);
    if(r.phase==='playing')socket.emit('match:start',snapshot(r));
    if(r.phase==='ended')socket.emit('match:end',{winner:r.winner,reason:'La partita è terminata durante la disconnessione.',stats:snapshot(r)});
  });
  socket.on('lobby:pref',value=>{
    const r=roomOf(socket),p=r?.people.get(socket.id);
    if(!r||r.phase!=='lobby'||!p)return;
    if(['hunter','survivor','random'].includes(value)){
      p.pref=value;const session=r.sessions.get(socket.data.resumeToken);
      if(session)session.pref=value;syncLobby(r);
    }
  });
  socket.on('lobby:bots',value=>{
    const r=roomOf(socket);if(!r||r.host!==socket.id||r.phase!=='lobby')return;
    r.fillBots=!!value;syncLobby(r);
  });
  socket.on('lobby:start',(_,ack)=>{
    const r=roomOf(socket);
    if(!r||r.host!==socket.id||r.phase!=='lobby')return ack?.({ok:false,error:'Solo il capostanza può avviare la partita.'});
    const error=startRoom(r);ack?.(error?{ok:false,error}:{ok:true});
  });
  socket.on('match:input',data=>{
    const r=roomOf(socket),p=r?.players.get(socket.id);
    if(!r||r.phase!=='playing'||!p||!data||typeof data!=='object')return;
    p.input={f:clamp(Number(data.f)||0,-1,1),s:clamp(Number(data.s)||0,-1,1),
      yaw:Number.isFinite(data.yaw)?normalizeAngle(data.yaw):p.yaw,
      sprint:!!data.sprint,crouch:!!data.crouch,interact:!!data.interact};
    p.flashlight=!!data.flashlight;p.lastInputAt=Date.now();
  });
  socket.on('match:attack',()=>{
    const r=roomOf(socket),p=r?.players.get(socket.id);
    if(r?.phase==='playing'&&p?.role==='hunter')hit(r,p);
  });
  socket.on('match:ability',()=>{
    const r=roomOf(socket),p=r?.players.get(socket.id);
    if(r?.phase!=='playing'||p?.role!=='hunter'||p.abilityCd>0)return;
    p.abilityCd=23;p.reveal=5;p.gesture++;
    event(r,'THE WARDEN HA EMESSO UN IMPULSO SONAR.','danger');
    io.to(r.code).emit('match:roar',{hunter:p.id});
  });
  socket.on('chat:send',message=>{
    const r=roomOf(socket),p=r?.people.get(socket.id);if(!r||!p)return;
    const text=String(message||'').replace(/[<>]/g,'').trim().slice(0,120);if(!text)return;
    const item={id:Date.now()+Math.random(),name:p.name,text};r.chat.push(item);
    if(r.chat.length>25)r.chat.shift();io.to(r.code).emit('chat:message',item);
  });
  socket.on('match:restart',(_,ack)=>{
    const r=roomOf(socket);if(!r||r.host!==socket.id||r.phase!=='ended')return ack?.({ok:false,error:'Solo il capostanza può riavviare.'});
    r.phase='lobby';r.players.clear();r.generators=[];r.exits=[];r.winner='';
    syncLobby(r);ack?.({ok:true});
  });
  socket.on('room:leave',()=>leave(socket,true));
  socket.on('disconnect',()=>leave(socket));
});
let frame=0,last=Date.now();
setInterval(()=>{
  const now=Date.now();const dt=clamp((now-last)/1000,.005,.09);last=now;
  for(const r of rooms.values()){
    if(r.emptyAt&&now-r.emptyAt>180000){rooms.delete(r.code);continue;}
    if(r.phase==='playing')tick(r,dt);
  }
  if(++frame%2===0)for(const r of rooms.values())if(r.phase==='playing')io.to(r.code).emit('match:state',snapshot(r));
},50);
const PORT=Number(process.env.PORT)||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`\n  NIGHT SHIFT — LAST SURVIVORS\n  Apri http://localhost:${PORT}\n  In LAN: http://IP-DEL-PC:${PORT}\n`));
