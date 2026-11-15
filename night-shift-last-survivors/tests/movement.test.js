import test from 'node:test';
import assert from 'node:assert/strict';
import {movementDelta,joystickVector,yawTowards} from '../public/controls.js';
import {moveCircle,legalPosition,tileToWorld,SURVIVOR_SPAWNS,HUNTER_SPAWN} from '../public/world.js';

const near=(a,b,eps=.00001)=>assert.ok(Math.abs(a-b)<eps, `${a} != ${b}`);
test('forward movement with yaw 0 moves toward -Z, matching Three camera',()=>{
  const v=movementDelta(1,0,0,4.5,.5); near(v.dx,0);near(v.dz,-2.25);
});
test('turning camera right makes forward move world +X, not left',()=>{
  const v=movementDelta(1,0,-Math.PI/2); near(v.dx,1);near(v.dz,0);
});
test('turning camera left makes forward move world -X',()=>{
  const v=movementDelta(1,0,Math.PI/2); near(v.dx,-1);near(v.dz,0);
});
test('backward movement is the reverse of forward at any camera angle',()=>{
  for(const yaw of [0,.2,-Math.PI/2,Math.PI,2.4]){
    const f=movementDelta(1,0,yaw);const b=movementDelta(-1,0,yaw);near(f.dx,-b.dx);near(f.dz,-b.dz);
  }
});
test('strafe right is camera right, including after rotating',()=>{
  const a=movementDelta(0,1,0);near(a.dx,1);near(a.dz,0);
  const b=movementDelta(0,1,-Math.PI/2);near(b.dx,0);near(b.dz,1);
});
test('joystick up and down correspond to forward and backward 3D travel',()=>{
  const up=joystickVector(0,-40,40); const down=joystickVector(0,40,40);
  assert.ok(up.f>.99);assert.ok(down.f<-.99);
  assert.ok(movementDelta(up.f,up.s,0).dz<0);
  assert.ok(movementDelta(down.f,down.s,0).dz>0);
});
test('analog movement scales and diagonal cannot become faster',()=>{
  const half=movementDelta(.5,0,0); near(Math.hypot(half.dx,half.dz),.5);
  const diagonal=movementDelta(1,1,-.5); near(Math.hypot(diagonal.dx,diagonal.dz),1);
});
test('bot yaw faces its actual target in Three coordinate system',()=>{
  for(const [x,z] of [[3,0],[-3,0],[0,2],[0,-2],[1,2]]){
   const a=movementDelta(1,0,yawTowards(x,z));near(a.dx,x/Math.hypot(x,z));near(a.dz,z/Math.hypot(x,z));
  }
});
test('players can travel in multiple directions from every spawn point',()=>{
  for(const coords of [...SURVIVOR_SPAWNS,HUNTER_SPAWN]){
    const p=tileToWorld(...coords);assert.ok(legalPosition(p.x,p.z),`invalid spawn ${coords}`);
    let open=0;for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      const v=movementDelta(1,0,yaw,4,0.25);const n=moveCircle(p,v.dx,v.dz,.39);
      if(Math.hypot(n.x-p.x,n.z-p.z)>.45)open++;
    }
    assert.ok(open>=2, `trapped spawn ${coords}`);
  }
});

test('invalid coordinates cannot poison the simulation or bypass walls',()=>{
 const p=tileToWorld(...SURVIVOR_SPAWNS[0]);
 assert.equal(legalPosition(NaN,p.z),false);
 assert.equal(legalPosition(p.x,Infinity),false);
 assert.deepEqual(moveCircle(p,NaN,1),p);
 assert.deepEqual(moveCircle(p,1,Infinity),p);
});
