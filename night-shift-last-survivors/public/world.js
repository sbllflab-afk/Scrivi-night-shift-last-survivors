/** Identical map and collision rules shared between the server and browser. */
export const TILE = 3.6;
export const MW = 31;
export const MH = 25;
export const ROUND_SECONDS = 420;
export const REQUIRED_GENERATORS = 4;
export const GEN_DURATION = 13;

const cells = Array.from({length: MH}, (_, j) =>
  Array.from({length: MW}, (_, i) => (i === 0 || i === MW - 1 || j === 0 || j === MH - 1) ? 1 : 0));
function hline(j, a, b, gaps) { for (let i = a; i <= b; i++) if (!gaps.includes(i)) cells[j][i] = 1; }
function vline(i, a, b, gaps) { for (let j = a; j <= b; j++) if (!gaps.includes(j)) cells[j][i] = 1; }
hline(6, 2, 28, [4, 5, 12, 13, 20, 21, 27]);
hline(12, 2, 28, [3, 9, 10, 15, 21, 22, 27]);
hline(18, 2, 28, [5, 6, 12, 13, 20, 26, 27]);
vline(8, 2, 22, [3, 4, 9, 10, 15, 16, 21]);
vline(16, 2, 22, [4, 5, 10, 11, 15, 16, 21]);
vline(24, 2, 22, [3, 4, 9, 10, 15, 16, 21]);
// Isolated machinery, not large impenetrable blockades.
for (const [i,j] of [[3,9],[4,9],[12,9],[20,9],[27,9],[5,21],[6,21],[11,15],[12,15],[19,15],[20,15],[27,21],[2,20],[22,3]]) cells[j][i] = 2;
export const MAP = cells.map(row => row.join(''));
export const GENERATOR_TILES = [[4,3],[13,3],[21,4],[5,15],[13,21],[27,15]];
export const EXIT_TILES = [[1,11],[29,13]];
export const SURVIVOR_SPAWNS = [[4,10],[11,10],[20,10],[27,20]];
export const HUNTER_SPAWN = [14,20];
export function tileToWorld(i,j) { return {x:(i-(MW-1)/2)*TILE,z:(j-(MH-1)/2)*TILE}; }
export function worldToTile(x,z) { return [Math.round(x/TILE+(MW-1)/2),Math.round(z/TILE+(MH-1)/2)]; }
export function atTile(i,j) { return MAP[j]?.[i] ?? '1'; }
export function solid(i,j) { return atTile(i,j) !== '0'; }
export function distance(a,b) { return Math.hypot(a.x-b.x,a.z-b.z); }
export function clamp(v,mi,ma) { return Math.max(mi,Math.min(ma,v)); }
export function normalizeAngle(a) { return Math.atan2(Math.sin(a),Math.cos(a)); }
export function legalPosition(x,z,r=0.38) {
  // Invalid coordinates must NEVER be interpreted as an empty/collision-free position.
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(r)||r<=0)return false;
  const [ci,cj]=worldToTile(x,z);
  for(let j=cj-2;j<=cj+2;j++)for(let i=ci-2;i<=ci+2;i++) {
    if(!solid(i,j))continue;
    const c=tileToWorld(i,j), h=TILE/2;
    const nx=clamp(x,c.x-h,c.x+h), nz=clamp(z,c.z-h,c.z+h);
    if((nx-x)**2+(nz-z)**2<r*r)return false;
  }
  return true;
}
export function moveCircle(p,dx,dz,r=0.38) {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return {x:0,z:0};
  if(!Number.isFinite(dx)||!Number.isFinite(dz))return {x:p.x,z:p.z};
  // Substeps prevent fast clients or lag spikes tunnelling through walls.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/0.55));
  let x=p.x,z=p.z;
  for(let s=0;s<steps;s++) {
    const ax=dx/steps,az=dz/steps;
    if(legalPosition(x+ax,z,r))x+=ax;
    if(legalPosition(x,z+az,r))z+=az;
  }
  return {x,z};
}
export function gridPath(from,to) {
  const [sx,sy]=worldToTile(from.x,from.z),[tx,ty]=worldToTile(to.x,to.z);
  if(solid(tx,ty))return [];
  const q=[[sx,sy]], seen=new Set([`${sx},${sy}`]),prev=new Map();
  let hit=false;
  for(let n=0;n<q.length;n++) {
    const [x,y]=q[n];if(x===tx&&y===ty){hit=true;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const xx=x+dx,yy=y+dy,k=`${xx},${yy}`;
      if(solid(xx,yy)||seen.has(k))continue;
      seen.add(k);prev.set(k,[x,y]);q.push([xx,yy]);
    }
  }
  if(!hit)return [];
  const route=[];let at=[tx,ty];
  while(!(at[0]===sx&&at[1]===sy)) {
    route.push(tileToWorld(...at));at=prev.get(`${at[0]},${at[1]}`);if(!at)break;
  }
  return route.reverse();
}
export function lineClear(a,b) {
  const len=distance(a,b), steps=Math.max(1,Math.ceil(len/0.5));
  for(let i=1;i<steps;i++) {
    const t=i/steps;const [cx,cy]=worldToTile(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
    if(solid(cx,cy))return false;
  }
  return true;
}
export function twoDigit(n){return String(Math.floor(n)).padStart(2,'0');}
