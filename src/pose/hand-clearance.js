import {Vector3,Quaternion} from 'three';
import {forward,worldPoint} from './kinematics.js';
import {segmentDistance} from './contacts.js';
import {actorProject,actorDescriptor,toWorld} from '../scene/state.js';
import {issue} from './state.js';
const v=a=>new Vector3().fromArray(a);
const digits={Thumb:'拇指',Index:'食指',Middle:'中指',Ring:'无名指',Little:'小指'};
export function handVolumes(p,h,profile){
 const a=actorProject(p,h.actorId),world=forward(a,profile),side=h.hand.replace('Hand',''),scale=actorDescriptor(p,h.actorId).transform.scale;
 const point=(bone,offset=[0,0,0])=>toWorld(p,h.actorId,worldPoint(a,profile,bone,offset,world));
 const segments=[];
 for(const [digit,label]of Object.entries(digits)){
  const names=(digit==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal']).map(n=>side+digit+n);
  const positions=names.map(n=>point(n));positions.push(point(names[2],[(side==='left'?-1:1)*(digit==='Thumb'?.014:.012),0,0]));
  for(let i=digit==='Thumb'?1:0;i<3;i++)segments.push({a:positions[i],b:positions[i+1],radius:(digit==='Little'?.004:.0048)*scale,label,bone:names[i],digit,index:i});
 }
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),actorDescriptor(p,h.actorId).transform.yaw*Math.PI/180).multiply(new Quaternion().fromArray(world[h.hand].rotation));
 return{...h,segments,scale,palm:{position:point(h.hand),inverse:rotation.invert(),left:side==='left'}};
}
function palmPenetration(point,hand,radius){
 const p=v(point).sub(v(hand.palm.position)).applyQuaternion(hand.palm.inverse).divideScalar(hand.scale);if(hand.palm.left)p.x=-p.x;
 const center=new Vector3(.031,.001,.0035),half=new Vector3(.023,.011,.0255),d=p.sub(center);const outside=new Vector3(Math.max(Math.abs(d.x)-half.x,0),Math.max(Math.abs(d.y)-half.y,0),Math.max(Math.abs(d.z)-half.z,0)).length();
 const inside=Math.min(half.x-Math.abs(d.x),half.y-Math.abs(d.y),half.z-Math.abs(d.z));return outside>0?radius-outside*hand.scale:radius+inside*hand.scale;
}
export function handClearanceDetails(p,r,profile,{threshold=.0035}={}){
 const hands=r.hands.map(h=>handVolumes(p,h,profile)),problems=[];
 for(let i=0;i<2;i++)for(const segment of hands[i].segments){
  const other=hands[1-i];let depth=0,target='手掌';
  for(const t of [.25,.5,.75,1])depth=Math.max(depth,palmPenetration(v(segment.a).lerp(v(segment.b),t).toArray(),other,segment.radius));
  if(i===0)for(const b of other.segments){const penetration=segment.radius+b.radius-segmentDistance(segment.a,segment.b,b.a,b.b);if(penetration>depth){depth=penetration;target=b.label;}}
  if(depth>threshold*Math.min(hands[0].scale,hands[1].scale))problems.push({hand:hands[i],segment,depth,target});
 }
 return problems.sort((a,b)=>b.depth-a.depth);
}
export function handClearanceIssues(p,r,profile){
 const seen=new Set(),worst=handClearanceDetails(p,r,profile).filter(x=>{const k=x.hand.actorId+x.hand.hand+x.segment.digit;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,2);
 return worst.map(x=>issue('HAND_CLEARANCE',actorDescriptor(p,x.hand.actorId).name+'的'+(x.hand.hand==='leftHand'?'左':'右')+'手'+x.segment.label+'与对方'+x.target+'可能穿插，请从侧面检查或降低握合程度',[x.segment.bone],'warning'));
}
