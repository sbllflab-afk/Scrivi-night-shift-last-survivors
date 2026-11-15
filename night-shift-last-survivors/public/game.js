import * as THREE from '/vendor/three/build/three.module.js';
import {joystickVector,movementAxes,clampedPitch} from '/controls.js';
import {
  TILE,MW,MH,MAP,GENERATOR_TILES,EXIT_TILES,GEN_DURATION,REQUIRED_GENERATORS,
  tileToWorld,worldToTile,moveCircle,distance,clamp,twoDigit
} from '/world.js';

const $=id=>document.getElementById(id);
const socket=window.io({autoConnect:true,reconnection:true});
const SESSION_KEY='nightshift-room-session-v1';
function saveRoomSession(info){
  if(!info?.code||!info?.token)return;
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({code:info.code,token:info.token}));}catch{}
}
function clearRoomSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
const state={phase:'menu',room:null,host:null,local:null,snapshot:null,pred:null,
  yaw:0,pitch:0,pressed:new Set(),flashlight:true,pointer:false,muted:false,
  events:[],previousHealth:2,lastStep:0,lastInput:0,lastUi:0,lastMap:0,interactProgress:0,
  onceStarted:false,entities:new Map(),attackPulse:0,damagePulse:0,roarPulse:0,
  cameraWobble:0,menuTime:0,showMap:true};
// The mobile UI is intentionally first-class: no pointer lock is required on phones.
const isTouchDevice = () => matchMedia('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints > 0 && window.innerWidth < 980);
let touchMode = isTouchDevice();
document.documentElement.classList.toggle('touch-device', touchMode);
const touch = {enabled:false, joystickId:null, lookId:null, lookX:0, lookY:0,
  axis:{f:0,s:0}, sprint:false, interact:false, crouch:false, attack:false,
  lastAttack:0, lookSensitivity:1.0,holdPointers:{}};
let noticeTimer=0;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('show'),3600);}
function screen(which){for(const id of ['menu','lobby','results'])$(id).classList.toggle('active',id===which);$('hud').classList.toggle('hidden',which!=='game');state.phase=which;}
function timeFmt(s){return `${twoDigit(Math.max(0,s)/60)}:${twoDigit(Math.max(0,s)%60)}`;}
const add=(parent,...objects)=>{for(const ob of objects)parent.add(ob);return parent;};
function rand(n){return (Math.sin(n*78.233+15.729)*43758.5453)%1;}
function signedRand(n){let r=rand(n);return r-Math.floor(r);}
const color=(hex)=>new THREE.Color(hex);
const MAT={
  iron:new THREE.MeshStandardMaterial({color:0x252f34,metalness:.81,roughness:.38}),
  darkIron:new THREE.MeshStandardMaterial({color:0x121a1d,metalness:.68,roughness:.45}),
  orange:new THREE.MeshStandardMaterial({color:0xb75c3b,metalness:.72,roughness:.45}),
  bone:new THREE.MeshStandardMaterial({color:0xa4a79a,metalness:.31,roughness:.6}),
  black:new THREE.MeshStandardMaterial({color:0x080d10,metalness:.4,roughness:.8}),
  glass:new THREE.MeshStandardMaterial({color:0x90d7c8,metalness:.25,roughness:.1,transparent:true,opacity:.6}),
  tealGlow:new THREE.MeshStandardMaterial({color:0x2ee7c9,emissive:0x1ccfaf,emissiveIntensity:2.8,metalness:.2,roughness:.2}),
  redGlow:new THREE.MeshStandardMaterial({color:0xff4c2e,emissive:0xdd2a12,emissiveIntensity:3.5,roughness:.2}),
  amberGlow:new THREE.MeshStandardMaterial({color:0xffaa61,emissive:0xee6e32,emissiveIntensity:2.0,roughness:.18}),
  rubber:new THREE.MeshStandardMaterial({color:0x1b2427,roughness:.98}),
};
function box(w,h,d,mat=MAT.iron){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);}
function cylinder(rt,rb,h,mat=MAT.iron,segments=9){return new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat);}
function sphere(r,mat=MAT.bone,w=12,h=8){return new THREE.Mesh(new THREE.SphereGeometry(r,w,h),mat);}
function part(obj,x,y,z){obj.position.set(x,y,z);return obj;}
function mesh(parent,obj,x,y,z){parent.add(part(obj,x,y,z));return obj;}
function conduit(parent,a,b,r,material){const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),diff=v2.clone().sub(v1);
  const m=cylinder(r,r,diff.length(),material,7);m.position.copy(v1.add(v2).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());parent.add(m);return m;}
function canvasTexture(size,draw){const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');draw(ctx,size);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function createFloorTexture(){const t=canvasTexture(256,(ctx,s)=>{
  ctx.fillStyle='#192123';ctx.fillRect(0,0,s,s);
  for(let i=0;i<4600;i++){const v=16+Math.floor(signedRand(i+7)*48);ctx.fillStyle=`rgba(${v},${v+5},${v+2},${signedRand(i+45)*.09})`;ctx.fillRect(signedRand(i+3)*s,signedRand(i+5)*s,1+signedRand(i+15)*4,1+signedRand(i+17)*4);}
  ctx.strokeStyle='rgba(130,152,143,.21)';ctx.lineWidth=3;ctx.strokeRect(0,0,s,s);
  for(let i=0;i<6;i++){ctx.strokeStyle=`rgba(150,119,95,${signedRand(i+6)*.13})`;ctx.beginPath();const y=signedRand(i+20)*s;ctx.moveTo(0,y);ctx.lineTo(s,y+12);ctx.stroke();}
});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(MW,MH);t.anisotropy=8;return t;}
function createWallTexture(){const t=canvasTexture(256,(ctx,s)=>{
  ctx.fillStyle='#485356';ctx.fillRect(0,0,s,s);
  for(let i=0;i<800;i++){const r=signedRand(i+102);ctx.fillStyle=`rgba(${r>.5?'14,22,24':'130,114,91'},${.018+signedRand(i+10)*.13})`;ctx.fillRect(signedRand(i+4)*s,signedRand(i+50)*s,2+signedRand(i+28)*25,1+signedRand(i+21)*14);}
  ctx.strokeStyle='rgba(12,21,24,.55)';ctx.lineWidth=7;ctx.strokeRect(1,1,s-2,s-2);ctx.lineWidth=2;ctx.strokeStyle='rgba(166,175,159,.15)';ctx.strokeRect(12,12,s-24,s-24);
  for(const x of [20,236])for(const y of [20,236]){ctx.beginPath();ctx.fillStyle='#121b1e';ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
});t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}

const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance',alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,touchMode?1.05:1.65));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x060a0d);scene.fog=new THREE.FogExp2(0x090e12,.024);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.055,180);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new THREE.HemisphereLight(0x9fccc6,0x0d151c,.62));
scene.add(new THREE.AmbientLight(0x66848a,.18));
const moon=new THREE.DirectionalLight(0x758f9a,.7);moon.position.set(23,29,-18);scene.add(moon);
const fogAccent=new THREE.PointLight(0xa3472d,45,31,2);fogAccent.position.set(8,3,8);scene.add(fogAccent);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(MW*TILE,MH*TILE),new THREE.MeshStandardMaterial({map:createFloorTexture(),color:0x9facac,metalness:.28,roughness:.9}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.075;scene.add(floor);
const wallTex=createWallTexture();
const wallMat=new THREE.MeshStandardMaterial({map:wallTex,color:0x789091,metalness:.55,roughness:.72});
const rustMat=new THREE.MeshStandardMaterial({map:wallTex,color:0x695247,metalness:.64,roughness:.78});
const wallMeshes=[[],[]];
for(let j=0;j<MH;j++)for(let i=0;i<MW;i++)if(MAP[j][i]!=='0')wallMeshes[(i*31+j*17)%9===0?1:0].push([i,j]);
for(let typ=0;typ<2;typ++){
  const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE-.025,4.4,TILE-.025),typ?rustMat:wallMat,wallMeshes[typ].length);
  const dummy=new THREE.Object3D();for(let k=0;k<wallMeshes[typ].length;k++){
    const [i,j]=wallMeshes[typ][k],p=tileToWorld(i,j);dummy.position.set(p.x,2.2,p.z);dummy.updateMatrix();inst.setMatrixAt(k,dummy.matrix);
  }inst.instanceMatrix.needsUpdate=true;scene.add(inst);
}
// Top trim and dark outer shadows.
for(const [ix,iz] of [[-1,0],[1,0],[0,-1],[0,1]]){
  const strip=box(Math.abs(ix)?MW*TILE+4:1.1,.22,Math.abs(iz)?MH*TILE+4:1.1,MAT.darkIron);
  strip.position.set(ix*(MW*TILE/2+.4),4.4,iz*(MH*TILE/2+.4));scene.add(strip);
}
const pointLights=[];
const lamps=[[4,4],[12,4],[21,4],[27,4],[4,10],[12,10],[20,10],[27,10],[4,16],[13,16],[21,16],[27,16],[4,21],[12,21],[20,21],[27,21]];
lamps.forEach(([i,j],idx)=>{
  const p=tileToWorld(i,j);
  const fixture=box(1.7,.13,.44,idx%4===0?MAT.orange:MAT.bone);fixture.position.set(p.x,4.8,p.z);scene.add(fixture);
  const lens=box(1.45,.05,.27,new THREE.MeshBasicMaterial({color:idx%5===0?0xd95e3a:0x76d3c0}));lens.position.set(p.x,4.71,p.z);scene.add(lens);
  const lamp=new THREE.PointLight(idx%5===0?0xe3623e:0x90c8bb,idx%5===0?24:17,17,2);
  lamp.position.set(p.x,4.5,p.z);scene.add(lamp);pointLights.push({lamp,idx,seed:idx*33});
});
// Structural pipes along the facility corridors.
for(let i=1;i<MW-1;i+=2){const p=tileToWorld(i,1);const pipe=cylinder(.12,.12,TILE*1.9,MAT.darkIron,8);pipe.rotation.z=Math.PI/2;pipe.position.set(p.x,3.7,p.z+1.2);scene.add(pipe);}
for(let j=1;j<MH-1;j+=3){const p=tileToWorld(1,j);const pipe=cylinder(.09,.09,TILE*2.65,MAT.orange,8);pipe.rotation.x=Math.PI/2;pipe.position.set(p.x+1.1,3.8,p.z);scene.add(pipe);}
// Dense low-poly scraps: no collision (cosmetic only).
const scrapGeo=new THREE.BoxGeometry(.18,.035,.23),scrapMat=new THREE.MeshStandardMaterial({color:0x717367,metalness:.6,roughness:.72});
const scrap=new THREE.InstancedMesh(scrapGeo,scrapMat,210),scrapDummy=new THREE.Object3D();
let scrapCount=0;
for(let k=0;k<1100&&scrapCount<210;k++){
  const i=1+Math.floor(signedRand(k+111)*29),j=1+Math.floor(signedRand(k+271)*23);
  if(MAP[j][i]!=='0'||GENERATOR_TILES.some(([a,b])=>a===i&&b===j))continue;
  const p=tileToWorld(i,j);scrapDummy.position.set(p.x+(signedRand(k+17)-.5)*TILE,p.z*0+.017,p.z+(signedRand(k+13)-.5)*TILE);
  scrapDummy.rotation.y=signedRand(k+301)*Math.PI*2;scrapDummy.scale.setScalar(.4+signedRand(k+501)*2);scrapDummy.updateMatrix();scrap.setMatrixAt(scrapCount++,scrapDummy.matrix);
}
scrap.count=scrapCount;scrap.instanceMatrix.needsUpdate=true;scene.add(scrap);
// Warning decals, scattered near metal columns.
const hazardMaterial=new THREE.MeshBasicMaterial({color:0x9e5b3c,transparent:true,opacity:.36,depthWrite:false});
for(let k=0;k<26;k++){
 const i=1+Math.floor(signedRand(k+120)*29),j=1+Math.floor(signedRand(k+200)*23);
 if(MAP[j][i]!=='0')continue;const p=tileToWorld(i,j);
 for(let s=0;s<3;s++){const d=box(.11,.014,1.25,hazardMaterial);d.rotation.y=.64;d.position.set(p.x-1.1+s*.2,.022,p.z-1.1);scene.add(d);}
}
// Suspended dust gives depth to flashlight.
const dustN=320,dustPositions=new Float32Array(dustN*3);
for(let i=0;i<dustN;i++){dustPositions[i*3]=(signedRand(i+1)-.5)*(MW-2)*TILE;dustPositions[i*3+1]=.2+signedRand(i+40)*4.8;dustPositions[i*3+2]=(signedRand(i+100)-.5)*(MH-2)*TILE;}
const dustGeom=new THREE.BufferGeometry();dustGeom.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
const dust=new THREE.Points(dustGeom,new THREE.PointsMaterial({color:0x8fb3ac,size:.045,transparent:true,opacity:.32,depthWrite:false}));scene.add(dust);

const generators=[];
function makeGenerator(id,ij){
  const g=new THREE.Group();const {x,z}=tileToWorld(...ij);g.position.set(x,0,z);
  const pedestal=box(2.2,.23,1.65,MAT.darkIron);mesh(g,pedestal,0,.13,0);
  mesh(g,box(1.45,1.55,.88,MAT.iron),0,1.02,0);
  for(const sx of [-1,1]){
    const pipe=cylinder(.17,.17,1.8,MAT.orange);mesh(g,pipe,sx*.85,.92,.12);
    mesh(g,cylinder(.28,.28,.12,MAT.darkIron),sx*.85,1.78,.12);
    for(let k=0;k<3;k++)mesh(g,box(.18,.24,.94,MAT.darkIron),sx*.87,.51+k*.48,-.1);
  }
  for(let n=0;n<5;n++){
    const slot=box(.85,.05,.07,MAT.tealGlow);mesh(g,slot,0,.56+n*.21,.48);
  }
  const coreMat=MAT.tealGlow.clone();coreMat.emissiveIntensity=.45;const core=cylinder(.35,.35,1.2,coreMat,14);core.rotation.x=Math.PI/2;mesh(g,core,0,1.23,.54);
  const rotor=new THREE.Group();g.add(rotor);rotor.position.set(0,1.23,.57);
  for(let k=0;k<6;k++){const blade=box(.12,.76,.09,MAT.bone);blade.rotation.z=k*Math.PI/3;rotor.add(blade);}
  const dial=box(.8,.29,.12,MAT.black);mesh(g,dial,0,1.92,.32);
  for(let i=0;i<4;i++)mesh(g,box(.13,.13,.05,i===0?MAT.amberGlow:MAT.redGlow),-.29+i*.195,1.94,.4);
  const beacon=new THREE.PointLight(0x2cdac4,3.5,7,2);beacon.position.set(0,2,.5);g.add(beacon);
  const outline=new THREE.Mesh(new THREE.TorusGeometry(1.25,.022,6,48),new THREE.MeshBasicMaterial({color:0x34b5a4,transparent:true,opacity:.48}));
  outline.rotation.x=Math.PI/2;outline.position.y=.048;g.add(outline);
  scene.add(g);generators.push({g,core,rotor,beacon,outline,id,done:false});
}
GENERATOR_TILES.forEach((ij,i)=>makeGenerator(i,ij));
const exits=[];
function makeExit(id,ij){
 const {x,z}=tileToWorld(...ij);const g=new THREE.Group();g.position.set(x,0,z);
 const isSide=id===0;g.rotation.y=isSide?Math.PI/2:-Math.PI/2;
 for(const side of [-1,1]){
   mesh(g,box(.5,4.65,.55,MAT.iron),side*1.38,2.32,0);
   mesh(g,box(.6,.13,.66,MAT.orange),side*1.38,3.85,0);
 }
 mesh(g,box(3.32,.57,.64,MAT.iron),0,4.35,0);
 const bar=box(2.3,.19,.12,MAT.redGlow);mesh(g,bar,0,1.65,.03);
 mesh(g,box(2.3,.12,.12,MAT.redGlow),0,2.2,.03);
 const gateway=new THREE.PointLight(0xdb543c,10,10,2);gateway.position.set(0,2.1,0);g.add(gateway);
 const sign=box(1.65,.42,.1,MAT.redGlow);mesh(g,sign,0,4.25,.39);
 scene.add(g);exits.push({g,bar,gateway,sign});
}
EXIT_TILES.forEach((ij,i)=>makeExit(i,ij));

function makeKiller(){
 const g=new THREE.Group();const leftArm=new THREE.Group(),rightArm=new THREE.Group(),leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
 // Ripped coat and reinforced ribcage.
 mesh(g,box(.97,1.29,.51,MAT.darkIron),0,1.89,0);
 mesh(g,box(1.15,.28,.57,MAT.orange),0,2.46,.05);
 mesh(g,box(.81,.58,.55,MAT.iron),0,1.08,.04);
 for(let n=0;n<4;n++){
   mesh(g,box(.8-n*.10,.065,.12,MAT.bone),0,2.24-n*.22,.31);
   for(const sx of [-1,1])conduit(g,[sx*.37,2.28-n*.2,.28],[sx*(.49-n*.025),2.2-n*.2,-.08],.035,MAT.orange);
 }
 const heart=sphere(.13,MAT.redGlow);heart.scale.set(1.25,1,.48);mesh(g,heart,0,1.95,.36);
 const neck=cylinder(.19,.21,.4,MAT.iron);mesh(g,neck,0,2.77,0);
 const skull=new THREE.Group();skull.position.set(0,2.98,0);g.add(skull);
 const head=box(.79,.73,.65,MAT.bone);mesh(skull,head,0,.12,0);
 mesh(skull,box(.68,.13,.67,MAT.orange),0,.44,-.04);
 mesh(skull,box(.65,.25,.36,MAT.darkIron),0,-.29,.15);
 for(const sx of [-1,1]){
   const eye=sphere(.117,MAT.redGlow);eye.scale.set(1.25,.73,.4);mesh(skull,eye,sx*.195,.2,.365);
   mesh(skull,box(.26,.06,.16,MAT.iron),sx*.193,.33,.34);
   const antenna=box(.15,.51,.17,MAT.iron);antenna.rotation.z=sx*.32;mesh(skull,antenna,sx*.32,.73,-.11);
   const tip=cylinder(.12,0,.33,MAT.orange,5);tip.rotation.z=sx*.28;mesh(skull,tip,sx*.39,1.02,-.1);
 }
 for(let i=0;i<5;i++)mesh(skull,box(.075,.17,.055,MAT.bone),-.25+i*.125,-.33,.36);
 for(const sx of [-1,1]){
   const arm=sx<0?leftArm:rightArm;arm.position.set(sx*.65,2.37,0);g.add(arm);
   mesh(arm,sphere(.32,MAT.orange),0,-.14,0);
   const upper=cylinder(.17,.14,.9,MAT.iron);upper.rotation.z=sx*.13;mesh(arm,upper,sx*.03,-.56,0);
   const joint=sphere(.16,MAT.darkIron);mesh(arm,joint,sx*.05,-1.04,0);
   const lower=cylinder(.12,.16,.76,MAT.iron);lower.rotation.z=-sx*.09;mesh(arm,lower,sx*.08,-1.37,.02);
   mesh(arm,box(.33,.22,.24,MAT.bone),sx*.12,-1.8,.07);
   for(let f=0;f<3;f++){
     conduit(arm,[sx*.12+(f-1)*.11,-1.87,.14],[sx*.12+(f-1)*.13,-2.20,.25],.045,MAT.orange);
     const claw=cylinder(0,.068,.28,MAT.bone,5);claw.rotation.x=-.2;mesh(arm,claw,sx*.12+(f-1)*.13,-2.29,.3);
   }
 }
 for(const sx of [-1,1]){
   const leg=sx<0?leftLeg:rightLeg;leg.position.set(sx*.29,1.26,0);g.add(leg);
   mesh(leg,cylinder(.20,.15,.64,MAT.iron),0,-.33,.04);
   mesh(leg,sphere(.19,MAT.orange),0,-.69,0);
   mesh(leg,cylinder(.17,.13,.61,MAT.darkIron),0,-.95,0);
   mesh(leg,box(.38,.22,.72,MAT.iron),0,-1.2,.18);
 }
 for(let k=0;k<4;k++)conduit(g,[Math.sin(k*2)*.24,2.55,-.3],[Math.sin(k*2+1)*.21,1.38,-.35],.032,MAT.orange);
 // Independent dim red source on the killer makes a recognizable silhouette.
 const glow=new THREE.PointLight(0xc7462a,6,8,2);glow.position.set(0,2.2,.65);g.add(glow);
 g.userData={leftArm,rightArm,leftLeg,rightLeg,skull,glow};
 return g;
}
function makeSurvivor(index){
 const palette=[0x729d96,0xc4a078,0x7686a7,0x9f7b9e];const cloth=new THREE.MeshStandardMaterial({color:palette[index%palette.length],roughness:.94,metalness:.08});
 const g=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group(),leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
 mesh(g,box(.7,.93,.36,cloth),0,1.33,0);mesh(g,box(.77,.10,.42,MAT.iron),0,1.72,.03);
 mesh(g,box(.57,.42,.13,MAT.darkIron),0,1.40,-.24);
 mesh(g,sphere(.31,MAT.bone),0,1.96,0);
 mesh(g,box(.49,.22,.35,MAT.iron),0,2.19,-.03);
 mesh(g,box(.38,.14,.32,MAT.black),0,1.98,.21);
 mesh(g,box(.30,.044,.06,MAT.tealGlow),0,1.97,.37);
 mesh(g,box(.62,.08,.44,MAT.orange),0,1.18,.05);
 for(const sx of [-1,1]){
   const arm=sx<0?leftArm:rightArm;arm.position.set(sx*.48,1.68,0);g.add(arm);
   mesh(arm,cylinder(.115,.1,.65,cloth),0,-.33,0);
   mesh(arm,box(.23,.21,.22,MAT.bone),0,-.72,0);
   const leg=sx<0?leftLeg:rightLeg;leg.position.set(sx*.21,.94,0);g.add(leg);
   mesh(leg,cylinder(.15,.11,.72,MAT.iron),0,-.36,0);
   mesh(leg,box(.28,.19,.43,MAT.darkIron),0,-.79,.13);
 }
 const lamp=new THREE.PointLight(0x70cec5,2,6,2);lamp.position.set(.2,1.35,.32);g.add(lamp);
 g.userData={leftArm,rightArm,leftLeg,rightLeg,glow:lamp};return g;
}
const showcase=makeKiller();showcase.position.set(10.7,0,6.5);showcase.rotation.y=-.62;showcase.scale.setScalar(1.15);scene.add(showcase);
const flashlight=new THREE.SpotLight(0xe7f6e4,18,31,.30,.72,1.45);
flashlight.position.set(.17,-.19,-.13);flashlight.target.position.set(.17,-.22,-6);
camera.add(flashlight);camera.add(flashlight.target);
const camGlow=new THREE.PointLight(0x6caab1,1.3,5,2);camGlow.position.set(0,-.35,-.2);camera.add(camGlow);
const viewHands=new THREE.Group();viewHands.position.set(0,-.40,-.65);camera.add(viewHands);
function buildHands(role){viewHands.clear();if(role==='hunter'){
  for(const sx of [-1,1]){
    const arm=cylinder(.17,.26,.87,MAT.iron);arm.rotation.z=sx*.53;arm.rotation.x=1.04;mesh(viewHands,arm,sx*.46,-.16,-.34);
    const fist=box(.37,.27,.26,MAT.bone);mesh(viewHands,fist,sx*.5,-.06,-.78);
    for(let j=0;j<3;j++){const claw=cylinder(0,.072,.36,MAT.bone,5);claw.rotation.x=Math.PI/2.7;mesh(viewHands,claw,sx*.5+(j-1)*.1,-.07,-.99);}
  }
 }else{
   const sleeve=cylinder(.2,.27,.9,MAT.iron);sleeve.rotation.z=-.65;sleeve.rotation.x=1.25;mesh(viewHands,sleeve,.38,-.32,-.32);
   mesh(viewHands,box(.32,.23,.29,MAT.bone),.17,-.2,-.7);
   const torch=cylinder(.095,.145,.54,MAT.darkIron);torch.rotation.x=Math.PI/2;mesh(viewHands,torch,.12,-.16,-1.04);
   const lens=cylinder(.13,.13,.04,MAT.tealGlow);lens.rotation.x=Math.PI/2;mesh(viewHands,lens,.12,-.16,-1.33);
   mesh(viewHands,box(.06,.065,.2,MAT.orange),.10,-.08,-.9);
 }
}
buildHands('survivor');

// ----------------------------- PROCEDURAL AUDIO ------------------------------
class AudioMachine{
 constructor(){this.ctx=null;this.master=null;this.drone=null;this.heartbeat=0;this.muted=false;}
 start(){if(this.ctx){this.ctx.resume();return;}
  try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();
   this.master=this.ctx.createGain();this.master.gain.value=.34;this.master.connect(this.ctx.destination);
   this.drone=this.ctx.createOscillator();this.drone.type='sawtooth';this.drone.frequency.value=47;
   const lp=this.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=100;
   const g=this.ctx.createGain();g.gain.value=.19;this.drone.connect(lp);lp.connect(g);g.connect(this.master);this.drone.start();
  }catch(e){console.warn('Audio non disponibile:',e);}}
 tone(freq=320,dur=.16,type='sine',vol=.1,endFreq){if(!this.ctx||this.muted)return;
  const now=this.ctx.currentTime,osc=this.ctx.createOscillator(),g=this.ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(Math.max(1,freq),now);
  if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),now+dur);
  g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.014);
  g.gain.exponentialRampToValueAtTime(.0001,now+dur);osc.connect(g);g.connect(this.master);osc.start(now);osc.stop(now+dur+.01);
 }
 noise(duration=.18,vol=.12,filter=800){if(!this.ctx||this.muted)return;
   const n=Math.ceil(this.ctx.sampleRate*duration),buff=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=buff.getChannelData(0);
   for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/n*2);
   const src=this.ctx.createBufferSource();src.buffer=buff;
   const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;
   const g=this.ctx.createGain();g.gain.value=vol;src.connect(f);f.connect(g);g.connect(this.master);src.start();src.stop(this.ctx.currentTime+duration);
 }
 sound(key){switch(key){
  case 'step':this.noise(.075,.095,260);break;
  case 'repair':this.tone(360,.04,'square',.04,550);break;
  case 'complete':this.tone(220,.38,'sawtooth',.13,690);setTimeout(()=>this.tone(440,.29,'sine',.12,900),120);break;
  case 'hit':this.noise(.45,.32,670);this.tone(55,.45,'sawtooth',.25,31);break;
  case 'swing':this.noise(.23,.19,1500);this.tone(200,.2,'sawtooth',.1,63);break;
  case 'roar':this.tone(52,.85,'sawtooth',.19,29);this.noise(.85,.22,250);break;
  case 'click':this.tone(580,.065,'triangle',.1,360);break;
  case 'heartbeat':this.tone(66,.14,'sine',.21,40);setTimeout(()=>this.tone(58,.11,'sine',.14,37),200);break;
  case 'escape':this.tone(260,.3,'sine',.12,520);setTimeout(()=>this.tone(390,.4,'sine',.12,780),250);break;
 }}
 setMute(m){this.muted=m;if(this.master)this.master.gain.value=m?0:.34;}
}
const audio=new AudioMachine();

// ---------------------------- NETWORK AND LOBBY -----------------------------
socket.on('connect',()=>{
  $('connection').className='online';$('connectionText').textContent='SERVER ONLINE';
  if(state.room&&!state.onceStarted&&state.phase!=='lobby')toast('Connessione ripristinata: rientra nella stanza se necessario.');
  const invite=new URLSearchParams(location.search).get('room');
  if(invite&&state.phase==='menu'&&!state.room){$('joinCode').value=invite.toUpperCase().slice(0,5);}
  let saved=null;try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY));}catch{}
  if(saved?.code&&saved?.token){
    socket.timeout(7000).emit('room:resume',saved,(err,response)=>{
      if(err||!response?.ok){
        clearRoomSession();
        if(state.phase==='game'){returnToMenu();toast('La stanza non è più disponibile: creane una nuova.');}
        return;
      }
      enterRoom(response);toast('Stanza ripristinata dopo la riconnessione.');
    });
  }
});
socket.on('disconnect',()=>{
  $('connection').className='offline';$('connectionText').textContent='CONNESSIONE PERSA';
  state.pressed.clear();resetTouchInputs();
  if(touchMode&&state.phase==='game')pauseTouch();
  toast('Connessione interrotta: tentativo di riconnessione...');
});
function call(event,data,callback){socket.timeout(6000).emit(event,data,(err,response)=>{
 if(err){toast('Il server non risponde. Verifica la connessione.');return;}
 if(!response?.ok){toast(response?.error||'Operazione non riuscita.');return;}
 callback?.(response);
});}
function enterRoom(response){saveRoomSession(response);state.room=response.code;state.onceStarted=false;state.snapshot=null;
 $('roomCode').textContent=response.code;history.replaceState({},'',`${location.pathname}?room=${response.code}`);screen('lobby');audio.sound('click');}
$('createBtn').onclick=()=>call('room:create',{name:$('playerName').value},enterRoom);
$('joinBtn').onclick=()=>{
 const code=$('joinCode').value.trim().toUpperCase();if(code.length!==5){$('menuError').textContent='Inserisci un codice stanza di 5 caratteri.';return;}
 call('room:join',{name:$('playerName').value,code},enterRoom);
};
$('joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click();});
$('playerName').addEventListener('keydown',e=>{if(e.key==='Enter')$('createBtn').click();});
function returnToMenu(){
 if(document.pointerLockElement)document.exitPointerLock();
 clearRoomSession();socket.emit('room:leave');state.room=null;state.host=null;state.snapshot=null;state.local=null;state.pred=null;
 state.onceStarted=false;resetTouchInputs();touch.enabled=false;state.pressed.clear();state.entities.forEach(e=>scene.remove(e.mesh));state.entities.clear();
 history.replaceState({},'',location.pathname);$('pause').classList.add('hidden');screen('menu');
}
$('leaveRoom').onclick=returnToMenu;
$('abandonBtn').onclick=returnToMenu;
$('exitResultsBtn').onclick=returnToMenu;
$('copyRoom').onclick=async()=>{const url=`${location.origin}${location.pathname}?room=${state.room}`;
 try{await navigator.clipboard.writeText(url);toast('Invito copiato negli appunti.');}catch{toast(`Codice della stanza: ${state.room}`);}};
$('rolePref').onchange=()=>socket.emit('lobby:pref',$('rolePref').value);
$('fillBots').onchange=()=>socket.emit('lobby:bots',$('fillBots').checked);
$('startBtn').onclick=()=>call('lobby:start',{},()=>audio.start());
$('restartBtn').onclick=()=>call('match:restart',{},()=>{});
$('chatBtn').onclick=()=>sendChat();
$('chatInput').onkeydown=e=>{if(e.key==='Enter')sendChat();};
function sendChat(){const input=$('chatInput');if(input.value.trim())socket.emit('chat:send',input.value);input.value='';}
function appendChat(item){const div=document.createElement('div');div.className='chat-line';const name=document.createElement('b');name.textContent=item.name+': ';
 const content=document.createTextNode(item.text);div.append(name,content);$('chatLog').append(div);$('chatLog').scrollTop=$('chatLog').scrollHeight;}
socket.on('chat:message',appendChat);
socket.on('room:state',r=>{
 state.room=r.code;state.host=r.host;
 const was=state.phase;
 if(r.phase==='lobby'){
  if(was!=='lobby')screen('lobby');state.onceStarted=false;state.snapshot=null;
  $('roomCode').textContent=r.code;$('roomCount').textContent=`${r.people.length} / 5`;
  $('playerList').replaceChildren();r.people.forEach((p,i)=>{
   const row=document.createElement('div');row.className='player-item';
   const num=document.createElement('span');num.className='player-number';num.textContent=String(i+1).padStart(2,'0');
   const name=document.createElement('span');name.textContent=p.name+(p.id===r.host?' ★':'');
   const tag=document.createElement('span');tag.className='status';tag.textContent=p.pref==='hunter'?'CACCIATORE':p.pref==='survivor'?'SUPERSTITE':'CASUALE';
   row.append(num,name,tag);$('playerList').append(row);
   if(p.id===socket.id)$('rolePref').value=p.pref;
  });
  const host=r.host===socket.id;$('startBtn').style.display=host?'flex':'none';
  $('startHint').textContent=host?'Quando vuoi, inizia. I posti liberi saranno occupati dai bot.':'In attesa che il capostanza avvii la partita.';
  $('fillBots').checked=r.fillBots;$('fillBots').disabled=!host;
  $('botsRow').style.opacity=host?1:.6;
  $('chatLog').replaceChildren();r.chat.forEach(appendChat);
 } else if(r.phase==='playing'&&was!=='game'&&was!=='results'){} // match:start transports full state
});
socket.on('match:start',s=>{
 state.onceStarted=true;state.events=[];state.snapshot=s;state.previousHealth=2;state.local=null;state.pred=null;
 state.pressed.clear();resetTouchInputs();touch.enabled=false;state.pitch=0;state.flashlight=true;state.attackPulse=0;state.roarPulse=0;
 state.entities.forEach(e=>scene.remove(e.mesh));state.entities.clear();
 showcase.visible=false;screen('game');$('pause').classList.remove('hidden');$('deadOverlay').classList.add('hidden');$('deadOverlay').querySelector('h2').textContent='NON CE L’HAI FATTA.';$('deadOverlay').querySelector('p').textContent='Puoi osservare gli altri finché la partita non termina.';$('scoreboard').classList.add('hidden');
 $('resumeBtn').textContent=touchMode?'TOCCA PER GIOCARE →':'ENTRA NELLA NOTTE →';buildHands(s.players.find(p=>p.id===socket.id)?.role||'survivor');
 $('feed').replaceChildren();$('genList').replaceChildren();createFeed('La notte è cominciata. Buona fortuna.','objective');
 for(const p of s.players)if(p.id===socket.id){state.local=p;state.pred={x:p.x,z:p.z};state.yaw=p.yaw;break;}
 audio.start();renderHud();
});
socket.on('match:state',s=>{
 if(state.phase!=='game')return;state.snapshot=s;
 const self=s.players.find(p=>p.id===socket.id);
 if(self){
  if(state.local&&self.health<state.previousHealth){damageEffect();audio.sound('hit');}
  state.previousHealth=self.health;state.local=self;
  if(!state.pred)state.pred={x:self.x,z:self.z};
  const drift=Math.hypot(state.pred.x-self.x,state.pred.z-self.z);
  if(drift>2.3)state.pred={x:self.x,z:self.z};
  else{const f=drift>.8?.26:.105;state.pred.x+=(self.x-state.pred.x)*f;state.pred.z+=(self.z-state.pred.z)*f;}
  if(!self.alive&&!self.escaped){$('deadOverlay').classList.remove('hidden');$('pause').classList.add('hidden');}
  if(self.escaped){$('deadOverlay').classList.remove('hidden');$('deadOverlay').querySelector('h2').textContent='SEI SOPRAVVISSUTO!';$('deadOverlay').querySelector('p').textContent='Attendi la conclusione del turno.';}
 }
 renderHud();
});
socket.on('match:event',item=>{createFeed(item.text,item.type);
 if(item.type==='danger'&&item.text.includes('IMPULSO')&&state.local?.role!=='hunter')audio.sound('roar');
});
socket.on('match:hit',data=>{if(data.target===socket.id){damageEffect();audio.sound('hit');}
 if(data.killer===socket.id){state.attackPulse=.6;audio.sound('hit');const h=$('hitmark');h.style.opacity=1;setTimeout(()=>h.style.opacity=0,340);}
});
socket.on('match:swing',data=>{if(data.killer===socket.id){audio.sound('swing');state.attackPulse=.6;}});
socket.on('match:generator',()=>audio.sound('complete'));
socket.on('match:roar',()=>{state.roarPulse=1;audio.sound('roar');});
socket.on('match:end',data=>{
 screen('results');touch.enabled=false;resetTouchInputs();if(document.pointerLockElement)document.exitPointerLock();audio.sound(data.winner==='survivors'?'escape':'roar');
 $('resultTitle').textContent=data.winner==='survivors'?'L’ALBA È ARRIVATA':'L’OSCURITÀ VINCE';
 $('resultTitle').style.color=data.winner==='survivors'?'#a1e1c9':'#ef7359';
 $('resultReason').textContent=data.reason;
 const survivors=data.stats.players.filter(p=>p.role==='survivor');
 $('resultStats').textContent=`${survivors.filter(p=>p.escaped).length} FUGGITI   //   ${data.stats.completed} GENERATORI RIPRISTINATI`;
 $('restartBtn').style.display=state.host===socket.id?'flex':'none';
 $('restartWait').textContent=state.host===socket.id?'Puoi riavviare subito una nuova partita.':'Attendi che il capostanza avvii un nuovo turno.';
});
function createFeed(text,type='notice'){
 const row=document.createElement('div');row.className=`feed-item ${type}`;row.textContent=text;
 $('feed').prepend(row);while($('feed').children.length>5)$('feed').lastChild.remove();setTimeout(()=>row.remove(),7900);
}
function damageEffect(){state.damagePulse=1;$('flashDamage').style.opacity='.62';setTimeout(()=>$('flashDamage').style.opacity='0',190);}

// ----------------------------- DESKTOP + MOBILE INPUT -------------------------
const gameActive=()=>state.phase==='game'&&state.local?.alive&&!state.local?.escaped;
const locked=()=>document.pointerLockElement===$('scene');
const controlsActive=()=>gameActive()&&(touchMode?touch.enabled:locked());
function resetTouchInputs(){
  touch.axis={f:0,s:0};touch.sprint=false;touch.interact=false;touch.attack=false;touch.crouch=false;
  for(const [id,pointerId] of Object.entries(touch.holdPointers||{})){const el=$(id);if(el?.hasPointerCapture?.(pointerId))el.releasePointerCapture(pointerId);}
  touch.holdPointers={};
  touch.joystickId=null;touch.lookId=null;
  const knob=$('touchKnob');if(knob)knob.style.transform='translate(-50%,-50%)';
  for(const id of ['touchSprint','touchInteract','touchAttack'])$(id)?.classList.remove('pressed');
}
function pauseTouch(){
  touch.enabled=false;resetTouchInputs();state.pressed.clear();
  $('pause').classList.toggle('hidden',!gameActive());
}
function requestMouse(){
  if(state.phase!=='game'||!gameActive())return;
  audio.start();
  if(touchMode){
    touch.enabled=true;state.pressed.clear();$('pause').classList.add('hidden');
    $('resumeBtn').textContent='RIPRENDI →';
    return;
  }
  try {
    const pending=$('scene').requestPointerLock?.();
    pending?.catch?.(()=>toast('Clicca nuovamente per agganciare il mouse.'));
  } catch { toast('Impossibile bloccare il mouse. Riprova cliccando sulla scena.'); }
}
$('resumeBtn').onclick=requestMouse;
$('scene').addEventListener('click',()=>{
  if(touchMode)return; // A tap on the scene is for looking, never for clicking to fire.
  if(state.phase==='game'&&!locked())requestMouse();
  else if(gameActive()&&state.local?.role==='hunter'&&locked())socket.emit('match:attack');
});
$('muteBtn').onclick=()=>{state.muted=!state.muted;audio.setMute(state.muted);$('muteBtn').textContent=`AUDIO: ${state.muted?'DISATTIVATO':'ATTIVO'}`;};
document.addEventListener('pointerlockchange',()=>{
  state.pointer=locked();
  if(!touchMode)$('pause').classList.toggle('hidden',locked()||state.phase!=='game'||!gameActive());
  if(!locked())state.pressed.clear();
});
document.addEventListener('mousemove',e=>{
  if(touchMode||!locked()||!gameActive())return;
  state.yaw-=e.movementX*.00245;state.pitch=clampedPitch(state.pitch-e.movementY*.0022);
});
const gameKeyCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyE','KeyF','KeyM','KeyQ','Space','Tab']);
document.addEventListener('keydown',e=>{
  if(state.phase!=='game')return;
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.code==='Escape'){
    if(touchMode){if(touch.enabled)pauseTouch();else requestMouse();}
    else if(locked())document.exitPointerLock();
    return;
  }
  if(e.code==='Tab'){e.preventDefault();if(controlsActive()){$('scoreboard').classList.remove('hidden');renderScoreboard();}return;}
  if(!controlsActive())return;
  if(gameKeyCodes.has(e.code))e.preventDefault();
  state.pressed.add(e.code);
  if(e.code==='KeyF'&&!e.repeat&&state.local?.role!=='hunter')toggleFlashlight();
  if(e.code==='KeyM'&&!e.repeat)toggleMap();
  if(e.code==='KeyQ'&&!e.repeat&&state.local?.role==='hunter')socket.emit('match:ability');
  if(e.code==='Space'&&!e.repeat&&state.local?.role==='hunter')socket.emit('match:attack');
});
document.addEventListener('keyup',e=>{
  state.pressed.delete(e.code);
  if(e.code==='Tab')$('scoreboard').classList.add('hidden');
});
function toggleFlashlight(){state.flashlight=!state.flashlight;audio.sound('click');}
function toggleMap(){state.showMap=!state.showMap;$('sideHud').style.opacity=state.showMap?1:.12;}
function inputState(){
  const keys=state.pressed;
  const axes=movementAxes(keys,touchMode?touch.axis:{f:0,s:0});
  return {...axes,
    sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||(touchMode&&touch.sprint),
    crouch:keys.has('ControlLeft')||keys.has('ControlRight')||(touchMode&&touch.crouch),
    interact:keys.has('KeyE')||(touchMode&&touch.interact),
    yaw:state.yaw,flashlight:state.flashlight
  };
}
function neutralInput(){return{f:0,s:0,sprint:false,crouch:false,interact:false,yaw:state.yaw,flashlight:state.flashlight};}
setInterval(()=>{
  if(state.phase!=='game')return;
  // With network loss or menus open, always transmit neutral input.
  socket.emit('match:input',controlsActive()?inputState():neutralInput());
  if(touchMode&&controlsActive()&&touch.attack&&state.local?.role==='hunter'){
    const now=performance.now();if(now-touch.lastAttack>330){touch.lastAttack=now;socket.emit('match:attack');}
  }
},50);
function updateTouchRole(){
  if(!touchMode)return;
  const hunter=state.local?.role==='hunter';
  for(const id of ['touchInteract','touchCrouch','touchFlash'])$(id).classList.toggle('hidden',hunter);
  for(const id of ['touchAttack','touchSonar'])$(id).classList.toggle('hidden',!hunter);
  $('touchSprint').textContent=hunter?'INSEGUI':'CORRI';
  $('touchCrouch').classList.toggle('pressed',touch.crouch);
  $('touchFlash').classList.toggle('pressed',state.flashlight);
}
const joystick=$('touchJoystick'),knob=$('touchKnob');
function moveJoystick(e){
  const rect=joystick.getBoundingClientRect();
  const vector=joystickVector(e.clientX-(rect.left+rect.width/2),e.clientY-(rect.top+rect.height/2),rect.width*.40);
  touch.axis={f:vector.f,s:vector.s};
  knob.style.transform=`translate(calc(-50% + ${vector.px*rect.width*.40}px), calc(-50% + ${vector.py*rect.width*.40}px))`;
}
joystick.addEventListener('pointerdown',e=>{
  if(!touchMode||!controlsActive()||touch.joystickId!==null)return;
  e.preventDefault();touch.joystickId=e.pointerId;joystick.setPointerCapture?.(e.pointerId);moveJoystick(e);
});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===touch.joystickId){e.preventDefault();moveJoystick(e);}});
function endJoystick(e){if(e.pointerId!==touch.joystickId)return;touch.joystickId=null;touch.axis={f:0,s:0};knob.style.transform='translate(-50%,-50%)';}
for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,endJoystick);
// The 3-D canvas itself is the look surface: any free finger can swipe to aim.
$('scene').addEventListener('pointerdown',e=>{
  if(!touchMode||!controlsActive()||e.pointerType==='mouse'||touch.lookId!==null)return;
  e.preventDefault();touch.lookId=e.pointerId;touch.lookX=e.clientX;touch.lookY=e.clientY;
  $('scene').setPointerCapture?.(e.pointerId);
});
$('scene').addEventListener('pointermove',e=>{
  if(e.pointerId!==touch.lookId||!controlsActive())return;
  e.preventDefault();
  const dx=e.clientX-touch.lookX,dy=e.clientY-touch.lookY;
  touch.lookX=e.clientX;touch.lookY=e.clientY;
  state.yaw-=dx*.0050*touch.lookSensitivity;
  state.pitch=clampedPitch(state.pitch-dy*.0042*touch.lookSensitivity);
});
function endLook(e){if(e.pointerId===touch.lookId)touch.lookId=null;}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(type,endLook);
function holdButton(id,field){
  const el=$(id);let holder=null;
  el.addEventListener('pointerdown',e=>{
    if(!controlsActive()||holder!==null)return;
    e.preventDefault();holder=e.pointerId;el.setPointerCapture?.(e.pointerId);
    touch[field]=true;touch.holdPointers[id]=e.pointerId;el.classList.add('pressed');
    if(field==='attack'){socket.emit('match:attack');touch.lastAttack=performance.now();}
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>{
    if(e.pointerId!==holder)return;
    holder=null;touch[field]=false;delete touch.holdPointers[id];el.classList.remove('pressed');
  });
}
holdButton('touchSprint','sprint');holdButton('touchInteract','interact');holdButton('touchAttack','attack');
function tapButton(id,callback){$(id).addEventListener('pointerdown',e=>{
  if(!controlsActive())return;
  e.preventDefault();callback();
});}
tapButton('touchCrouch',()=>{touch.crouch=!touch.crouch;updateTouchRole();});
tapButton('touchFlash',()=>{toggleFlashlight();updateTouchRole();});
tapButton('touchSonar',()=>socket.emit('match:ability'));
tapButton('touchMap',toggleMap);
tapButton('touchPause',pauseTouch);
$('lookSensitivity').addEventListener('input',e=>{touch.lookSensitivity=Number(e.target.value)||1;$('lookSensitivityValue').textContent=`${touch.lookSensitivity.toFixed(1)}×`;});
window.addEventListener('blur',()=>{state.pressed.clear();resetTouchInputs();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){state.pressed.clear();resetTouchInputs();if(touchMode&&touch.enabled)pauseTouch();}
});
window.addEventListener('resize',()=>{
  touchMode=isTouchDevice();document.documentElement.classList.toggle('touch-device',touchMode);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,touchMode?1.05:1.65));
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

// -------------------------------- UI AND RADAR -------------------------------
function renderHud(){const s=state.snapshot,p=state.local;if(!s||!p)return;
 $('timer').textContent=timeFmt(s.timeLeft);$('timer').classList.toggle('warning',s.timeLeft<75);
 $('objectiveCount').textContent=`${s.completed} / ${s.required} GENERATORI`; $('sideObjectiveCount').textContent=`${s.completed} / ${s.required}`;
 $('survivorRemaining').textContent=`${s.remaining} SOPRAVVISSUTI RIMASTI`;
 $('objectiveText').textContent=p.role==='hunter'?'NESSUNO DEVE SOPRAVVIVERE':s.exitsOpen?'LE USCITE SONO APERTE':'RIPRISTINA L’ALIMENTAZIONE';
 $('roleLabel').textContent=p.role==='hunter'?'THE WARDEN / HUNTER':'SURVIVOR / CLASS D';
 $('playerHealth').textContent=p.role==='hunter'?'◈ ◈ ◈':p.health>=2?'♥ ♥':p.health===1?'♥ ♡':'♡ ♡';
 $('healthText').textContent=p.role==='hunter'?'UNSTOPPABLE':p.health===2?'NORMAL':p.health===1?'CRITICAL':'LOST';
 $('staminaValue').textContent=p.role==='hunter'?'∞':`${Math.round(p.stamina)}%`;
 $('staminaFill').style.width=p.role==='hunter'?'100%':`${p.stamina}%`;
 $('keyLegend').textContent=touchMode?'SINISTRA MUOVITI · DESTRA GUARDA · TIENI RIPARA':'WASD MUOVITI · SHIFT CORRI · E RIPARA · M MAPPA';
 updateTouchRole();
 $('toolName').textContent=p.role==='hunter'?'SONAR / CLAWS':'FLASHLIGHT / MK-1';
 $('toolDetail').textContent=p.role==='hunter'?`[Q] SCANNER ${p.abilityCd>0?Math.ceil(p.abilityCd)+'s':'READY'}`:`[F] ${state.flashlight?'ON':'OFF'}`;
 $('genList').replaceChildren();for(let i=0;i<s.generators.length;i++){
  const gen=s.generators[i],row=document.createElement('div');row.className=`gen-item ${gen.done?'done':''}`;
  const num=document.createElement('span');num.textContent=`GEN ${String(i+1).padStart(2,'0')}`;
  const meter=document.createElement('span');meter.className='mini-meter';const fill=document.createElement('i');fill.style.width=`${gen.progress*100}%`;meter.append(fill);
  const right=document.createElement('span');right.textContent=gen.done?'✓':`${Math.round(gen.progress*100)}%`;
  row.append(num,meter,right);$('genList').append(row);
 }
 renderScoreboard();
}
function renderScoreboard(){const s=state.snapshot;if(!s||$('scoreboard').classList.contains('hidden'))return;
 $('scoreList').replaceChildren();for(const p of s.players){
  const row=document.createElement('div');row.className='score-row'+(!p.alive?' dead':'');
  const a=document.createElement('span');a.textContent=`${p.role==='hunter'?'☠':'◈'} ${p.name}${p.bot?' · IA':''}`;
  const b=document.createElement('span');b.textContent=p.escaped?'FUGGITO':!p.alive?'ELIMINATO':p.role==='hunter'?'CACCIATORE':p.health===2?'IN SALUTE':'FERITO';row.append(a,b);$('scoreList').append(row);
 }
}
function nearestInteraction(){const s=state.snapshot,p=state.local;
 if(!s||!p||p.role==='hunter'||!p.alive||p.escaped)return null;
 const self=state.pred||p;
 const injured=s.players.find(q=>q.id!==p.id&&q.role==='survivor'&&q.health===1&&q.alive&&!q.escaped&&distance(self,q)<2.65);
 if(injured)return {text:`MANTIENI [E] PER CURARE ${injured.name.toUpperCase()}`,progress:Math.min(1,p.heal/5)};
 if(s.exitsOpen){const n=EXIT_TILES.map(x=>tileToWorld(...x)).find(e=>distance(self,e)<2.8);
  if(n)return{text:'MANTIENI [E] PER APRIRE L’USCITA',progress:Math.min(1,p.escapeCharge/3)};
 }else{
  const target=GENERATOR_TILES.map((ij,id)=>({...tileToWorld(...ij),id})).find(g=>!s.generators[g.id].done&&distance(self,g)<2.85);
  if(target)return{text:`MANTIENI [E] PER RIPARARE GENERATORE ${target.id+1}`,progress:s.generators[target.id].progress};
 }
 return null;
}
function updateInteractionHud(){const info=nearestInteraction();$('interactContainer').style.opacity=info?1:0;
 if(info){$('interactLabel').textContent=info.text;$('interactFill').style.width=`${info.progress*100}%`;}
}
function renderRadar(){const s=state.snapshot,p=state.local;if(!s||!p)return;
 const canvas=$('minimap'),ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height,pad=9;
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#081112';ctx.fillRect(0,0,W,H);
 const cw=(W-pad*2)/MW,ch=(H-pad*2)/MH;
 for(let j=0;j<MH;j++)for(let i=0;i<MW;i++)if(MAP[j][i]!=='0'){
  ctx.fillStyle=MAP[j][i]==='1'?'#2d494c':'#4a4741';ctx.fillRect(pad+i*cw,pad+j*ch,cw+.1,ch+.1);
 }
 function point(x,z,c,r=3){const [i,j]=worldToTile(x,z);ctx.fillStyle=c;ctx.beginPath();ctx.arc(pad+(i+.5)*cw,pad+(j+.5)*ch,r,0,Math.PI*2);ctx.fill();}
 for(const [idx,ij] of GENERATOR_TILES.entries())if(!s.generators[idx].done){const g=tileToWorld(...ij);point(g.x,g.z,'#e8a770',3.4);}
 if(s.exitsOpen)for(const ij of EXIT_TILES){const g=tileToWorld(...ij);point(g.x,g.z,'#8af7d2',4.5);}
 for(const q of s.players){if(q.id===socket.id||!q.alive||q.escaped)continue;
  if(q.role==='hunter'&&p.role==='survivor')continue;
  if(q.role==='survivor'&&p.role==='hunter'&&p.reveal<=0)continue;
  point(q.x,q.z,q.role==='hunter'?'#fc6449':'#82b7ad',3);
 }
 const pp=state.pred||p;point(pp.x,pp.z,'#ffffff',4);
 const [i,j]=worldToTile(pp.x,pp.z);ctx.save();ctx.translate(pad+(i+.5)*cw,pad+(j+.5)*ch);ctx.rotate(state.yaw);
 ctx.fillStyle='#f6f0d9';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();
 ctx.strokeStyle='rgba(133,198,186,.36)';ctx.strokeRect(pad,pad,W-pad*2,H-pad*2);
}

function animateEntity(ent,p,t,dt){
 const group=ent.mesh;
 const dx=p.x-group.position.x,dz=p.z-group.position.z;
 group.position.x+=dx*Math.min(1,dt*10);group.position.z+=dz*Math.min(1,dt*10);
 let delta=Math.atan2(Math.sin(p.yaw+Math.PI-group.rotation.y),Math.cos(p.yaw+Math.PI-group.rotation.y));group.rotation.y+=delta*Math.min(1,dt*9);
 const joints=group.userData;const v=Math.abs(p.step-(ent.lastStep||0));ent.lastStep=p.step;
 const phase=t*8+p.id.length;const swing=Math.sin(phase)*Math.min(.55,v*.85+p.sprint*.25);
 joints.leftLeg.rotation.x=swing;joints.rightLeg.rotation.x=-swing;
 joints.leftArm.rotation.x=-swing*.75;joints.rightArm.rotation.x=swing*.75;
 group.position.y=Math.sin(phase*2)*Math.min(.035,v*.035);
 if(p.role==='hunter'){joints.skull.rotation.z=Math.sin(t*1.4)*.06;joints.glow.intensity=3.9+Math.sin(t*5)*2;}
 else joints.glow.visible=p.flashlight;
 if(!p.alive||p.escaped)group.visible=false;
}
function syncEntities(t,dt){const s=state.snapshot;if(!s)return;
 const active=new Set();
 for(let i=0;i<s.players.length;i++){
  const p=s.players[i];if(p.id===socket.id)continue;active.add(p.id);
  let e=state.entities.get(p.id);
  if(!e){const model=p.role==='hunter'?makeKiller():makeSurvivor(i);
   model.position.set(p.x,0,p.z);model.rotation.y=p.yaw+Math.PI;scene.add(model);e={mesh:model,lastStep:0};state.entities.set(p.id,e);
  }
  e.mesh.visible=p.alive&&!p.escaped;animateEntity(e,p,t,dt);
 }
 for(const [id,e] of state.entities)if(!active.has(id)){scene.remove(e.mesh);state.entities.delete(id);}
}
function animateWorld(t){for(const o of pointLights){o.lamp.intensity=(o.idx%5===0?22:16)*(o.idx%7===0&&Math.sin(t*17+o.seed)>.8?.35:.85+Math.sin(t*.71+o.seed)*.08);}
 for(const gen of generators){const progress=state.snapshot?.generators[gen.id]?.progress??0;
  const done=state.snapshot?.generators[gen.id]?.done??false;
  gen.rotor.rotation.z=t*(done?5:.4+progress*4);
  gen.core.material.emissiveIntensity=done?2.8:(.4+progress*1.7);
  gen.beacon.intensity=done?4.3:1.4+progress*2;
  gen.outline.material.color.setHex(done?0x70f7c9:0xf3925e);
  gen.outline.material.opacity=done?.85:.35+Math.sin(t*3+gen.id)*.12;
 }
 const open=state.snapshot?.exitsOpen;
 for(const e of exits){e.bar.visible=!open;e.gateway.color.setHex(open?0x5ae9a9:0xd7523a);
  e.gateway.intensity=open?20+Math.sin(t*5)*5:9;
  e.sign.material= open?MAT.tealGlow:MAT.redGlow;
 }
 dust.rotation.y=t*.00013;
}
let lastFrame=performance.now(),running=true;
function frame(now){if(!running)return;requestAnimationFrame(frame);
 const dt=clamp((now-lastFrame)/1000,0,.06);lastFrame=now;const t=now/1000;
 animateWorld(t);
 const playing=state.phase==='game'&&state.snapshot&&state.local;
 showcase.visible=!playing&&state.phase!=='results';
 if(playing){
  const p=state.local;const pred=state.pred||{x:p.x,z:p.z};
  if(controlsActive()){
   const input=inputState(),len=Math.max(1,Math.hypot(input.f,input.s));
   let speed=p.role==='hunter'?(input.sprint&&input.f>0?7.1:5.55):
     input.crouch?2.35:(input.sprint&&input.f>0&&p.stamina>0?7.65:4.55);
   const next=moveCircle(pred,((input.f*Math.sin(state.yaw)+input.s*Math.cos(state.yaw))/len)*speed*dt,
    ((-input.f*Math.cos(state.yaw)+input.s*Math.sin(state.yaw))/len)*speed*dt,p.role==='hunter'?.52:.39);
   const moved=Math.hypot(next.x-pred.x,next.z-pred.z);pred.x=next.x;pred.z=next.z;
   state.cameraWobble+=moved*2.8;
   if(moved>.012&&t-state.lastStep>(speed>6?.30:.42)){state.lastStep=t;audio.sound('step');}
  }
  let cameraTarget=pred;
  if(!p.alive||p.escaped){const spectator=state.snapshot.players.find(q=>q.role==='survivor'&&q.alive&&!q.escaped&&q.id!==p.id);
   if(spectator){cameraTarget=spectator;state.yaw=spectator.yaw;}
  }
  const bob=gameActive()?Math.sin(state.cameraWobble*2.2)*.045:0;
  const y=(p.role==='hunter'?2.72:p.crouch?1.18:1.73)+bob;
  camera.position.set(cameraTarget.x,y,cameraTarget.z);camera.rotation.set(state.pitch,state.yaw,0,'YXZ');
  // Light follows camera and reacts to low energy.
  flashlight.visible=p.role!=='hunter'&&state.flashlight&&p.alive;
  flashlight.intensity=state.flashlight?18+(Math.sin(t*9)*.3):0;
  camGlow.visible=p.role!=='hunter'&&state.flashlight;
  viewHands.visible=p.alive&&!p.escaped;
  viewHands.position.x=Math.sin(state.cameraWobble)*.017;
  viewHands.position.y=-.40-Math.abs(Math.cos(state.cameraWobble*2))*.015;
  if(state.attackPulse>0){state.attackPulse=Math.max(0,state.attackPulse-dt*2.8);viewHands.rotation.x=-Math.sin(state.attackPulse*Math.PI)*.65;}
  else viewHands.rotation.x=0;
  state.damagePulse=Math.max(0,state.damagePulse-dt);
  const nearestHunter=state.snapshot.players.find(q=>q.role==='hunter');
  const risk=p.role==='survivor'&&nearestHunter&&p.alive?distance(pred,nearestHunter):100;
  const critical=Math.max(0,1-risk/14);
  $('dangerWarning').style.opacity=critical>.3?critical:0;
  if(critical>.4&&t-audio.heartbeat>(1.7-critical)){audio.heartbeat=t;audio.sound('heartbeat');}
  scene.fog.density=.026+critical*.009;
  const pulse=Math.max(state.damagePulse*.35,critical*.12);$('vignette').style.background=`radial-gradient(ellipse 77% 70% at 51% 48%,transparent 27%,rgba(0,0,0,.37) 68%,rgba(${Math.floor(35+critical*78)},${Math.floor(7+critical*7)},${Math.floor(9+critical*7)},.8) 100%)`;
  if(state.roarPulse>0){state.roarPulse=Math.max(0,state.roarPulse-dt);camera.rotation.z=Math.sin(t*36)*.02*state.roarPulse;}
  syncEntities(t,dt);
  updateInteractionHud();
  if(now-state.lastMap>170){renderRadar();state.lastMap=now;}
 }else{
  state.menuTime+=dt;
  camera.position.set(1.8+Math.sin(t*.16)*.72,2.6+Math.sin(t*.21)*.23,18.5+Math.sin(t*.13)*.7);
  camera.lookAt(5.3,2.0,5.7);
  flashlight.visible=false;camGlow.visible=false;viewHands.visible=false;
  showcase.rotation.y=-.6+Math.sin(t*.25)*.13;showcase.userData.skull.rotation.z=Math.sin(t*1.3)*.13;
  scene.fog.density=.034;
 }
 renderer.render(scene,camera);
}
requestAnimationFrame(frame);
// Show a practical error instead of a blank WebGL scene if anything breaks.
window.addEventListener('error',event=>{console.error(event.error||event.message);toast(`Errore: ${String(event.message).slice(0,90)}`);});
