import {Vector3,Quaternion} from 'three';
import {forward,worldPoint} from './kinematics.js';
import {issue} from './state.js';
import {isHandSupport,handSupportIssues} from './hand-supports.js';
const v=a=>new Vector3().fromArray(a),clamp=x=>Math.max(0,Math.min(1,x));
// Closest points on two finite segments, including point and parallel cases.
export function segmentDistance(a,b,c,d){
 const p=v(a),q=v(c),u=v(b).sub(p),w=v(d).sub(q),r=p.clone().sub(q),aa=u.dot(u),ee=w.dot(w),ff=w.dot(r);let s=0,t=0;
 if(aa<1e-12&&ee<1e-12)return p.distanceTo(q);
 if(aa<1e-12)t=clamp(ff/ee);else{const cc=u.dot(r);if(ee<1e-12)s=clamp(-cc/aa);else{const bb=u.dot(w),den=aa*ee-bb*bb;s=den>1e-12?clamp((bb*ff-cc*ee)/den):0;t=(bb*s+ff)/ee;if(t<0){t=0;s=clamp(-cc/aa);}else if(t>1){t=1;s=clamp((bb-cc)/aa);}}}
 return p.addScaledVector(u,s).distanceTo(q.addScaledVector(w,t));
}
export function checkContacts(project,profile){
 const world=forward(project,profile),issues=[],tolerance=profile.height*.005;
 for(const c of project.snapshot.contacts){
  if(isHandSupport(c)){issues.push(...handSupportIssues(project,c,profile));continue;}
  const anchor=worldPoint(project,profile,c.bone,c.localPoint,world),distance=v(anchor).distanceTo(v(c.worldPoint));
  if(distance>tolerance)issues.push(issue(c.mode==='required'?'CONTACT_CONFLICT':'CONTACT_GUIDE',`${c.bone} 离${c.objectId==='chair'?'座面':'地面'}接触点 ${(distance*100).toFixed(1)} 厘米`,[c.bone],c.mode==='required'?'error':'warning'));
  if(c.objectId==='floor'&&Math.abs(c.worldPoint[1]-project.stage.floorY)>tolerance)issues.push(issue('CONTACT_SURFACE','脚底锚点不在地面上',[c.bone],c.mode==='required'?'error':'warning'));
  if(c.objectId==='chair'){
   const chair=project.stage.chair,local=v(c.worldPoint).sub(v(chair.position)).applyQuaternion(new Quaternion().fromArray(chair.rotation).invert());
   if(Math.abs(local.y-chair.seatHeight)>tolerance||Math.abs(local.x)>chair.seatWidth/2+tolerance||Math.abs(local.z)>chair.seatDepth/2+tolerance)issues.push(issue('CONTACT_SURFACE','座面锚点已离开椅子',[c.bone],c.mode==='required'?'error':'warning'));
  }
 }
 for(const l of project.snapshot.locks)if(l.kind==='anchor'){
  const actual=world[l.bone];
  if(v(actual.position).distanceTo(v(l.position))>tolerance||new Quaternion().fromArray(actual.rotation).angleTo(new Quaternion().fromArray(l.rotation))>.015)issues.push(issue('ANCHOR_LOCKED','已固定的世界锚点不能移动或旋转',[l.bone]));
 }
 const capsules=profile.colliders?.capsules||[],ignore=new Set((profile.colliders?.ignore||[]).map(x=>x.slice().sort().join(':')));
 for(let i=0;i<capsules.length;i++)for(let j=i+1;j<capsules.length;j++){
  const a=capsules[i],b=capsules[j];if(ignore.has([a.id,b.id].sort().join(':'))||[a.from,a.to].some(n=>n===b.from||n===b.to))continue;
  const distance=segmentDistance(world[a.from].position,world[a.to].position,world[b.from].position,world[b.to].position);
  if(distance<a.radius+b.radius-profile.height*.008)issues.push(issue('BODY_INTERSECTION','身体部位可能穿插，请转动视角检查',[a.from,b.from],'warning'));
 }
 // Conservative capsule/seat box overlap samples; this is assistance, not cloth collision.
 if(project.snapshot.contacts.some(c=>c.objectId==='chair')){
  const chair=project.stage.chair,inv=new Quaternion().fromArray(chair.rotation).invert();
  for(const c of capsules){if(c.seatIgnore)continue;let hit=false;for(let n=0;n<=8;n++){
   const p=v(world[c.from].position).lerp(v(world[c.to].position),n/8).sub(v(chair.position)).applyQuaternion(inv);
   const dx=Math.max(Math.abs(p.x)-chair.seatWidth/2,0),dy=Math.max(Math.abs(p.y-(chair.seatHeight-.0225))-.0225,0),dz=Math.max(Math.abs(p.z)-chair.seatDepth/2,0);
   if(Math.hypot(dx,dy,dz)<c.radius*.65)hit=true;
  }if(hit)issues.push(issue('CHAIR_INTERSECTION','肢体可能碰入座面，请检查',[c.from],'warning'));}
 }
 return issues;
}
