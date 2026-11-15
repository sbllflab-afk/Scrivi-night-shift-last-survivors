import test from 'node:test';
import assert from 'node:assert/strict';
import {joystickVector,movementAxes,clampedPitch} from '../public/controls.js';
test('joystick center produces no movement',()=>{
  assert.deepEqual(joystickVector(0,0,50),{f:0,s:0,px:0,py:0});
});
test('forward and strafe directions match server coordinates',()=>{
  const forward=joystickVector(0,-50,50);
  const right=joystickVector(50,0,50);
  assert.ok(Math.abs(forward.f-1)<.001); assert.ok(Math.abs(forward.s)<.001);
  assert.ok(Math.abs(right.s-1)<.001);assert.ok(Math.abs(right.f)<.001);
});
test('stick is analog and never exceeds one',()=>{
  const small=joystickVector(0,-14,50);const large=joystickVector(140,-140,50);
  assert.ok(small.f>0&&small.f<.3);assert.ok(Math.hypot(large.f,large.s)<=1.00000001);
});
test('keyboard diagonal speed is normalized and arrows supported',()=>{
  const axes=movementAxes(new Set(['KeyW','KeyD']));
  assert.ok(Math.abs(Math.hypot(axes.f,axes.s)-1)<.001);
  assert.deepEqual(movementAxes(new Set(['ArrowLeft'])),{f:0,s:-1});
});
test('combined movement and pitch are bounded',()=>{
  const axes=movementAxes(new Set(['KeyW']),{f:1,s:1});
  assert.ok(Math.hypot(axes.f,axes.s)<=1.000001);
  assert.equal(clampedPitch(800),1.38);assert.equal(clampedPitch(-800),-1.38);
});
