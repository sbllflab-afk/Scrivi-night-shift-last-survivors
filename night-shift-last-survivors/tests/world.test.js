import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,MW,MH,GENERATOR_TILES,EXIT_TILES,SURVIVOR_SPAWNS,HUNTER_SPAWN,
 tileToWorld,worldToTile,gridPath,moveCircle,legalPosition,solid} from '../public/world.js';
test('La mappa ha dimensioni e confini solidi',()=>{
 assert.equal(MAP.length,MH);assert.ok(MAP.every(row=>row.length===MW));
 for(let i=0;i<MW;i++){assert.ok(solid(i,0));assert.ok(solid(i,MH-1));}
 for(let j=0;j<MH;j++){assert.ok(solid(0,j));assert.ok(solid(MW-1,j));}
});
test('Tutti i punti obiettivo sono liberi e raggiungibili',()=>{
 const from=tileToWorld(...SURVIVOR_SPAWNS[0]);
 for(const [i,j] of [...GENERATOR_TILES,...EXIT_TILES,...SURVIVOR_SPAWNS,HUNTER_SPAWN]){
  assert.ok(!solid(i,j),`La casella ${i},${j} non è accessibile`);
  assert.ok(legalPosition(...Object.values(tileToWorld(i,j))),`Spawn non valido ${i},${j}`);
  if(i!==SURVIVOR_SPAWNS[0][0]||j!==SURVIVOR_SPAWNS[0][1])assert.ok(gridPath(from,tileToWorld(i,j)).length>0,`Non raggiungibile: ${i},${j}`);
 }
});
test('Conversione griglia / mondo',()=>{
 for(const [i,j] of GENERATOR_TILES)assert.deepEqual(worldToTile(...Object.values(tileToWorld(i,j))),[i,j]);
});
test('I personaggi non attraversano le pareti',()=>{
 const start=tileToWorld(3,3);const moved=moveCircle(start,25,0,.4);
 assert.ok(legalPosition(moved.x,moved.z,.4));
 assert.ok(moved.x<start.x+25);
});
