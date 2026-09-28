import {Vector3,Quaternion,Matrix4} from 'three';
import {clone,issue,same} from './state.js';
import {forward,worldPoint} from './kinematics.js';
import {solveEffector,ikChain} from './ik.js';
import {projectJoint,effectiveRule} from './limits.js';
import presets from '../../assets/hand-support-presets.json' with {type:'json'};

const v=a=>new Vector3().fromArray(a),q=a=>new Quaternion().fromArray(a);
export const isHandSupport=c=>c?.kind==='hand-support';
export const supportLabel=c=>(c.bone==='leftHand'?'左手':'右手')+({face:'扶脸',backHead:'枕在后脑',thigh:'放在大腿上',chair:'扶椅面'}[c.preset]||'接触');
export const supportArm=(hand,profile)=>[...ikChain(hand,profile),hand];
const basis=(x,y)=>new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(v(x),v(y),v(x).cross(v(y))));

export function supportFrame(project,c,profile,world=forward(project,profile)){
 return c.objectId==='scene-surface'?c.frame:c.objectId==='chair'?project.stage.chair:world[c.targetBone];
}
export function supportGeometry(project,c,profile,world=forward(project,profile)){
 const frame=supportFrame(project,c,profile,world);
 const rotation=q(frame.rotation).multiply(q(c.relativeRotation));
 const target=v(c.targetPoint).applyQuaternion(q(frame.rotation)).add(v(frame.position));
 const actual=v(worldPoint(project,profile,c.bone,c.localPoint,world));
 const normalAngle=new Vector3(0,-1,0).applyQuaternion(rotation).angleTo(new Vector3(0,-1,0).applyQuaternion(q(world[c.bone].rotation)));
 return{target:target.toArray(),actual:actual.toArray(),rotation:rotation.toArray(),distance:target.distanceTo(actual),angle:rotation.angleTo(q(world[c.bone].rotation)),normalAngle,wrist:target.clone().sub(v(c.localPoint).applyQuaternion(rotation)).toArray()};
}
export function handSupportIssues(project,c,profile){
 const g=supportGeometry(project,c,profile),issues=[];
 if(g.distance>profile.height*.006||g.normalAngle>.12)issues.push(issue('HAND_CONTACT_CONFLICT',`${supportLabel(c)}无法保持：接触偏离 ${(g.distance*100).toFixed(1)} 厘米，掌心方向偏离 ${(g.normalAngle*180/Math.PI).toFixed(0)}°。请减小调整，或先解除接触。`,[c.bone]));
 if(c.objectId==='chair'){
  const chair=project.stage.chair,p=c.targetPoint;
  if(Math.abs(p[1]-chair.seatHeight)>.015||Math.abs(p[0])>chair.seatWidth/2||Math.abs(p[2])>chair.seatDepth/2)issues.push(issue('HAND_CONTACT_SURFACE','手的接触点已离开椅面，请重新选择扶椅面。',[c.bone]));
 }
 return issues;
}

// Retain the last arm configuration as a regularizer to avoid elbow flips.
function fit(project,c,profile,allowed,align=true){
 let current=clone(project);const start=forward(project,profile),preferred=clone(project.snapshot.rotations);
 const goal=supportGeometry(current,c,profile);
 const locked=new Set(current.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone));
 const joints=supportArm(c.bone,profile).filter(n=>allowed.includes(n)&&!locked.has(n));
 const elbow=c.bone.replace('Hand','LowerArm');
 const cost=()=>{
  const world=forward(current,profile),g=supportGeometry(current,c,profile,world);
  const drift=v(world[elbow].position).distanceToSquared(v(start[elbow].position));
  return (c.preset==='backHead'?2:1)*g.distance*g.distance+(align ? (c.preset==='paired'?.012:.0012)*g.angle*g.angle+(['backHead','surface','paired'].includes(c.preset)?.006*g.normalAngle*g.normalAngle:0) : 0)+(c.preset==='paired'?.00005:.002)*drift;
 };
 let score=cost();const original=current;
 current=solveEffector(current,{bone:c.bone,position:goal.wrist,...(align?{rotation:goal.rotation}:{})},{bones:allowed},profile).project;
 if(cost()<score)score=cost();else current=clone(original);
 for(const step of [.16,.07,.025,.008,.002])for(let pass=0;pass<(['backHead','surface','paired'].includes(c.preset)?7:3);pass++){
  let changed=false;
  for(const bone of joints)for(const axis of [[1,0,0],[0,1,0],[0,0,1]]){
   const original=current.snapshot.rotations[bone];let best=original;
   for(const sign of [-1,1]){
    const rotation=new Quaternion().setFromAxisAngle(v(axis),step*sign).multiply(q(original)).toArray();
    current.snapshot.rotations[bone]=projectJoint(rotation,effectiveRule(bone,current.snapshot.rotations,profile),preferred[bone]);
    const next=cost();if(next<score-1e-12){score=next;best=current.snapshot.rotations[bone];changed=true;}
   }
   current.snapshot.rotations[bone]=best;
  }
  if(!changed)break;
 }
 return current;
}

// External surfaces are transient solver inputs. Their identities live in scene.relations.
export function surfaceHandContact(hand,position,rotation=[0,0,0,1]){
 const sign=hand==='leftHand'?1:-1;
 return{bone:hand,preset:'surface',objectId:'scene-surface',localPoint:[-sign*.032,-.012,0],frame:{position,rotation},targetPoint:[0,0,0],relativeRotation:basis([0,0,-sign],[0,1,0]).toArray()};
}
export function fitHandToSurface(project,c,profile,allowed,{initialize=false}={}){
 const candidates=[fit(project,c,profile,allowed)];
 if(initialize){const seed=clone(project),side=c.bone==='leftHand'?'left':'right',locked=new Set(seed.snapshot.locks.map(l=>l.bone));
  for(const [n,r]of Object.entries(presets.rest)){const bone=n.replace('left',side);if(allowed.includes(bone)&&!locked.has(bone))seed.snapshot.rotations[bone]=projectJoint(side==='left'?r:[r[0],-r[1],-r[2],r[3]],effectiveRule(bone,seed.snapshot.rotations,profile),seed.snapshot.rotations[bone]);}
  candidates.push(fit(seed,c,profile,allowed));
 }
 const score=p=>{const g=supportGeometry(p,c,profile);return(g.distance>profile.height*.006||g.normalAngle>.12?100:0)+g.distance+(c.preset==='paired'?g.angle:g.normalAngle)*.02;};
 candidates.sort((a,b)=>score(a)-score(b));return{project:candidates[0],issues:handSupportIssues(candidates[0],c,profile)};
}

export function setHandSupport(project,op,command,profile){
 const hand=op.hand;if(!['leftHand','rightHand'].includes(hand)||!['face','thigh','chair',null].includes(op.preset))throw Error('请选择一只手和有效的接触方式');
 let p=clone(project);p.snapshot.contacts=p.snapshot.contacts.filter(c=>!isHandSupport(c)||c.bone!==hand);
 if(op.preset===null)return{project:p,issues:[]};
 if(project.model.id!==presets.modelId)throw Error('接触预设尚未适配这个角色');
 const side=hand==='leftHand'?'left':'right',sign=side==='left'?1:-1,arm=supportArm(hand,profile),locked=new Set(p.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone));
 const manual=new Set(p.layers.filter(l=>l.manual).flatMap(l=>l.bones));
 const allowed=arm.filter(n=>command.scope.bones.includes(n)&&(!manual.has(n)||command.overwriteManual.includes(n)));
 if(arm.some(n=>!allowed.includes(n)))return{project,issues:[issue('HAND_CONTACT_SCOPE','建立手部接触需要允许这只手臂联动。',arm)]};
 const seed=op.preset==='face'?presets.face:presets.rest;
 for(const [n,r]of Object.entries(seed)){
  const bone=n.replace('left',side),rotation=side==='left'?r:[r[0],-r[1],-r[2],r[3]];
  if(!locked.has(bone))p.snapshot.rotations[bone]=projectJoint(rotation,effectiveRule(bone,p.snapshot.rotations,profile),p.snapshot.rotations[bone]);
 }
 const c={kind:'hand-support',bone:hand,preset:op.preset,objectId:op.preset==='chair'?'chair':'body',localPoint:[-sign*.032,-.012,0],targetPoint:[],relativeRotation:[],mode:'required'};
 if(op.preset==='face'){
  c.targetBone='head';c.targetPoint=[-sign*.073,.006,-.08];c.localPoint=[-sign*.055,-.008,0];
  const reference=clone(p);reference.snapshot.rotations.head=[0,0,0,1];reference.snapshot.rotations.neck=[0,0,0,1];const world=forward(reference,profile);
  c.relativeRotation=q(world.head.rotation).invert().multiply(q(world[hand].rotation)).toArray();
 }else if(op.preset==='thigh'){
  c.targetBone=side+'UpperLeg';const leg=profile.bones[side+'LowerLeg'].position;
  c.targetPoint=[0,leg[1]*.48,-.065];c.relativeRotation=basis([0,sign,0],[0,0,-1]).toArray();
 }else{
  c.targetPoint=[sign*(p.stage.chair.seatWidth/2-.026),p.stage.chair.seatHeight+.003,.015];c.relativeRotation=basis([0,0,-sign],[0,1,0]).toArray();
 }
 p.snapshot.contacts.push(c);p=fit(p,c,profile,allowed,true);
 // Capture the reachable legal palm orientation; subsequent edits retain it.
 let world=forward(p,profile);c.relativeRotation=q(supportFrame(p,c,profile,world).rotation).invert().multiply(q(world[hand].rotation)).toArray();
 p.snapshot.contacts=p.snapshot.contacts.map(x=>isHandSupport(x)&&x.bone===hand?c:x);
 p=fit(p,c,profile,allowed,true);
 world=forward(p,profile);c.relativeRotation=q(supportFrame(p,c,profile,world).rotation).invert().multiply(q(world[hand].rotation)).toArray();
 p.snapshot.contacts=p.snapshot.contacts.map(x=>isHandSupport(x)&&x.bone===hand?c:x);
 return{project:p,issues:handSupportIssues(p,c,profile)};
}

export function followHandSupports(project,command,profile,previous){
 let p=project;const issues=[];
 for(const c of p.snapshot.contacts.filter(isHandSupport)){
  const old=previous?.snapshot.contacts.find(x=>isHandSupport(x)&&x.bone===c.bone);
  if(old&&same(old,c)){
   const beforeWorld=forward(previous,profile),afterWorld=forward(p,profile);
   if(same(supportFrame(previous,c,profile,beforeWorld),supportFrame(p,c,profile,afterWorld))&&same(beforeWorld[c.bone],afterWorld[c.bone]))continue;
  }
  const g=supportGeometry(p,c,profile);if(g.distance<.0005&&g.angle<.003)continue;
  const manual=new Set(p.layers.filter(l=>l.manual).flatMap(l=>l.bones));
  const allowed=supportArm(c.bone,profile).filter(n=>command.scope.bones.includes(n)&&(!manual.has(n)||command.overwriteManual.includes(n)));
  if(!allowed.length){issues.push(issue('HAND_CONTACT_SCOPE',`${supportLabel(c)}需要允许对应手臂联动，或先解除接触。`,[c.bone]));continue;}
  p=fit(p,c,profile,allowed,true);issues.push(...handSupportIssues(p,c,profile));
 }
 return{project:p,issues};
}

// Only callers intending linked editing invoke this helper. Raw engine commands
// still use their exact declared scope and cannot silently widen authorization.
export function withHandSupportScope(command,project,profile,{overwriteLinkedManual=false}={}){
 const next=clone(command);if(next.operations.some(o=>['restore','undo','redo'].includes(o.kind)))return next;
 const supports=[...project.snapshot.contacts.filter(isHandSupport),...next.operations.flatMap(o=>o.value?.contacts?.filter(isHandSupport)||[])];
 const extra=new Set();
 for(const op of next.operations)if(op.kind==='hand-support')for(const n of supportArm(op.hand,profile))extra.add(n);
 for(const c of supports){
  const ancestry=[];for(let n of [c.targetBone,c.bone])while(n){ancestry.push(n);n=profile.bones[n]?.parent;}
  const arm=supportArm(c.bone,profile);
  if(next.scope.root||c.objectId==='chair'&&next.scope.stage||[...ancestry,...arm].some(n=>next.scope.bones.includes(n)))for(const n of arm)extra.add(n);
 }
 next.scope.bones=[...new Set([...next.scope.bones,...extra])];
 if(overwriteLinkedManual)next.overwriteManual=[...new Set([...next.overwriteManual,...extra])];return next;
}
