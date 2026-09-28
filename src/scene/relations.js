import {removeHandInteractions} from './hand-interactions.js';
import {Vector3} from 'three';
import {same,issue,clone} from '../pose/state.js';
import {sceneActors,actorDescriptor,actorProject,putActorProject,toWorld,toLocal} from './state.js';
import {surfaceSpec,surfacePoint,surfaceAnchor,surfaceContains,nearestSurfaceAnchor,surfaceRotation,yawQuaternion} from './surfaces.js';
import {worldPoint} from '../pose/kinematics.js';
import {fitSeatedPose,seatLocalPoint,soleLocalPoint} from './seating.js';
import {fitHandToSurface,surfaceHandContact,supportGeometry,supportArm} from '../pose/hand-supports.js';

export const relations=p=>p.scene?.relations||[];
export const relationKey=r=>r.subjectId+':'+r.kind+(r.hand?':'+r.hand:'');
const all=p=>[...sceneActors(p),...(p.scene?.objects||[])];
const find=(p,id)=>all(p).find(a=>a.id===id);
export function relationStructureIssues(p){
 const rows=p.scene?.relations;if(rows===undefined)return[];
 const bad=m=>issue('INVALID_RELATION',m);
 if(!Array.isArray(rows)||rows.length>160)return[bad('场景接触记录无效')];
 const errors=[],seen=new Set();
 for(const r of rows){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['kind','subjectId','targetId','anchor','yaw','hand'].includes(k))||!['surface','seat','hand'].includes(r.kind)||typeof r.subjectId!=='string'||typeof r.targetId!=='string'||!Array.isArray(r.anchor)||r.anchor.length!==2||r.anchor.some(n=>!Number.isFinite(n)||Math.abs(n)>.5)||(r.kind==='hand'&&!['leftHand','rightHand'].includes(r.hand))){errors.push(bad('接触位置或类型无效'));continue;}
  if(r.kind==='hand'?(r.yaw!==undefined):(r.hand!==undefined||!Number.isFinite(r.yaw)||Math.abs(r.yaw)>7200)){errors.push(bad('接触转向或手部无效'));continue;}
  const subject=find(p,r.subjectId),target=p.scene.objects.find(o=>o.id===r.targetId),surface=surfaceSpec(target?.type);
  if(!subject||!target||subject.id===target.id||!surface||surface.handOnly&&r.kind!=='hand'||r.kind==='seat'&&!surface.seat||r.kind==='surface'&&actorDescriptor(p,subject.id)||r.kind!=='surface'&&!actorDescriptor(p,subject.id))errors.push(bad('接触对象已丢失或不支持这种接触'));
  const key=relationKey(r);if(seen.has(key))errors.push(bad('同一个部位不能同时绑定多个表面'));seen.add(key);
 }
 if(errors.length)return errors;
 try{orderedRelations(p);}catch(e){errors.push(bad(e.message));}return errors;
}
export function orderedRelations(p){
 const result=[],done=new Set(),visiting=new Set(),rows=relations(p);
 function visit(r){const key=relationKey(r);if(done.has(key))return;if(visiting.has(key))throw Error('物品承放关系不能形成循环');visiting.add(key);
  for(const parent of rows.filter(x=>x.subjectId===r.targetId||r.kind==='hand'&&x.kind==='seat'&&x.subjectId===r.subjectId))visit(parent);
  visiting.delete(key);done.add(key);result.push(r);
 }for(const r of rows)visit(r);return result;
}
export function detachRelation(p,id,kind,hand){
 if(!p.scene?.relations)return;
 p.scene.relations=relations(p).filter(r=>!(r.subjectId===id&&r.kind===kind&&(kind!=='hand'||r.hand===hand)));
}
export function attachRelation(p,op){
 const subject=find(p,op.id),target=p.scene.objects.find(o=>o.id===op.targetId),s=surfaceSpec(target?.type);
 if(!subject||!target||!s||subject.id===target.id)throw Error('请选择另一个有承放表面的物品');
 if(subject.locked)throw Error('对象已锁定，请先解锁');
 if(op.keep!==undefined&&typeof op.keep!=='boolean')throw Error('保持接触选项无效');
 const r={kind:op.relation,subjectId:subject.id,targetId:target.id,anchor:op.anchor||(op.relation==='seat'?[0,0]:nearestSurfaceAnchor(target,subject.transform.position,op.relation==='surface'?subject:null)),...(op.relation==='hand'?{hand:op.hand}:{yaw:op.relation==='seat'?0:subject.transform.yaw-target.transform.yaw})};
 detachRelation(p,op.id,op.relation,op.hand);(p.scene.relations??=[]).push(r);
 const errors=relationStructureIssues(p);if(errors.length)throw Error(errors[0].message);
 return r;
}
export function releaseRemovedRelations(p,id){if(p.scene?.relations)p.scene.relations=relations(p).filter(r=>r.subjectId!==id&&r.targetId!==id);}
function handContact(p,r){
 const target=find(p,r.targetId),rotation=surfaceRotation(target),point=new Vector3(...surfacePoint(target,r.anchor));
 point.add(new Vector3(0,.003,0).applyQuaternion(rotation));
 // Keep the established horizontal hand orientation; vertical contacts rotate
 // their frame into actor-local space so yaw and actor placement stay coherent.
 const frame=surfaceSpec(target.type).vertical?yawQuaternion(-actorDescriptor(p,r.subjectId).transform.yaw).multiply(rotation).toArray():[0,0,0,1];
 return surfaceHandContact(r.hand,toLocal(p,r.subjectId,point.toArray()),frame);
}
function recordPose(previous,next,source){
 const changed=Object.keys(next.snapshot.rotations).filter(b=>!same(previous.snapshot.rotations[b],next.snapshot.rotations[b]));
 if(changed.length){next.layers=next.layers.map(l=>({...l,bones:l.bones.filter(b=>!changed.includes(b))})).filter(l=>l.bones.length||l.expressionNames.length);next.layers.push({id:'contact-'+source,sourceAsset:'furniture-contact',frame:null,bones:changed,expressionNames:[],manual:false});}
 return next;
}
export function withSceneSupportScope(command,project,profile){
 const p=project._sceneProject||project,id=command.actorId||project._actorId||p.scene?.primary.id||'primary',next=clone(command);
 if(next.operations.some(o=>['undo','redo','restore','scene'].includes(o.kind)))return next;
 for(const r of relations(p).filter(r=>r.subjectId===id&&r.kind==='hand')){
  const arm=supportArm(r.hand,profile),affected=next.scope.root||next.scope.bones.some(b=>arm.includes(b)||['hips','spine','chest','upperChest'].includes(b));
  if(affected){next.scope.bones=[...new Set([...next.scope.bones,...arm])];if(next.source!=='preset'||next.overwriteManual.length)next.overwriteManual=[...new Set([...next.overwriteManual,...arm])];}
 }return next;
}
export function releasePoseRelations(p,id,c){
 const replacement=c.source==='preset'&&c.operations.some(o=>o.kind==='patch'&&o.value&&'rootPosition'in o.value&&'contacts'in o.value);
 if(replacement)removeHandInteractions(p,id);
 if(replacement&&p.scene?.relations)p.scene.relations=relations(p).filter(r=>r.subjectId!==id);
 for(const o of c.operations)if(o.kind==='hand-support')detachRelation(p,id,'hand',o.hand);
}
export function followRelations(p,previous,{operation,profile,bodyCommand}={}){
 const problems=relationStructureIssues(p);if(problems.length)throw Error(problems[0].message);
 if(operation?.action==='update'&&operation.value?.transform){
  const subject=find(p,operation.id);
  for(const r of relations(p).filter(r=>r.subjectId===subject.id&&['surface','seat'].includes(r.kind))){
   const target=find(p,r.targetId);r.anchor=surfaceAnchor(target,subject.transform.position);r.yaw=subject.transform.yaw-target.transform.yaw;
  }
 }
 for(const r of orderedRelations(p)){
  const subject=find(p,r.subjectId),target=find(p,r.targetId);
  if(r.kind==='surface'){
   const transform={...subject.transform,position:surfacePoint(target,r.anchor),yaw:target.transform.yaw+r.yaw};
   if(!surfaceContains(target,r.anchor,{...subject,transform}))throw Error('物品超出了表面范围；请调整位置、尺寸或解除接触');
   if(subject.locked&&!same(transform,find(previous,subject.id)?.transform))throw Error('支撑物移动会影响已锁定的物品，请先解除接触或解锁');
   subject.transform=transform;
  }
  if(r.kind==='seat'){
   if(!surfaceContains(target,r.anchor))throw Error('坐的位置超出了座面，请减小偏移');
   const start=actorProject(p,r.subjectId),oldSubject=find(previous,r.subjectId),oldTarget=find(previous,r.targetId);
   const initialize=operation?.action==='attach'&&operation.id===r.subjectId&&operation.relation==='seat';
   if(initialize||operation?.action==='adjust-contact'&&operation.id===r.subjectId&&operation.relation==='seat'||!same(target.transform,oldTarget?.transform)||!same(subject.transform,oldSubject?.transform)){
    const point=surfacePoint(target,r.anchor),height=(point[1]-p.scene.floorY)/subject.transform.scale;
    if(surfaceSpec(target.type).width*target.transform.scale[0]<profile.height*.12*subject.transform.scale||surfaceSpec(target.type).depth*target.transform.scale[2]<profile.height*.1*subject.transform.scale)throw Error('座面太小，请扩大座面或缩小角色');
    subject.transform={...subject.transform,position:[point[0],p.scene.floorY,point[2]],yaw:target.transform.yaw+r.yaw};
    start.stage.floorY=0;const next=fitSeatedPose(start,height,profile,{initialize});
    if(subject.locked&&(!same(subject.transform,oldSubject?.transform)||!same(next.snapshot,actorProject(previous,r.subjectId).snapshot)))throw Error('支撑物移动会影响已锁定的角色，请先解锁或解除接触');
    putActorProject(p,r.subjectId,recordPose(start,next,r.subjectId+'-seat'));
   }
  }
  if(r.kind==='hand'){
   let start=actorProject(p,r.subjectId);const initialize=operation?.action==='attach'&&operation.id===r.subjectId&&operation.relation==='hand'&&operation.hand===r.hand;
   if(initialize){start.snapshot.contacts=start.snapshot.contacts.filter(c=>c.bone!==r.hand);if(!operation.anchor)r.anchor=nearestSurfaceAnchor(target,toWorld(p,r.subjectId,worldPoint(start,profile,r.hand,surfaceHandContact(r.hand,[]).localPoint)));}
   if(!surfaceContains(target,r.anchor))throw Error('手的接触点超出了表面，请减小偏移');
   const contact=handContact(p,r),g=supportGeometry(start,contact,profile);
   if(!initialize&&g.distance<.0008&&g.normalAngle<.08)continue;
   const manual=new Set(start.layers.filter(l=>l.manual).flatMap(l=>l.bones));
   const allowed=supportArm(r.hand,profile).filter(b=>!bodyCommand||bodyCommand.scope.bones.includes(b)&&(!manual.has(b)||bodyCommand.overwriteManual.includes(b)));
   const fitted=fitHandToSurface(start,contact,profile,allowed,{initialize});
   if(fitted.issues.some(i=>i.severity==='error'))throw Error('这只手够不到目标，或关节已锁定；请让目标表面靠近一些，或解除接触');
   if(subject.locked&&!same(fitted.project.snapshot,actorProject(previous,r.subjectId).snapshot))throw Error('表面移动会影响已锁定的角色，请先解锁或解除接触');
   putActorProject(p,r.subjectId,recordPose(start,fitted.project,r.subjectId+'-'+r.hand));
  }
 }return p;
}
export function relationGeometryIssues(p,profile){
 const errors=[];
 for(const r of relations(p))if(r.kind==='surface'){
  const subject=find(p,r.subjectId),target=find(p,r.targetId),point=surfacePoint(target,r.anchor);
  if(Math.hypot(...point.map((n,i)=>n-subject.transform.position[i]))>.001||Math.abs(subject.transform.yaw-target.transform.yaw-r.yaw)>.001||!surfaceContains(target,r.anchor,subject))errors.push(issue('SURFACE_CONTACT_CONFLICT','物品没有保持在承放表面上'));
 }else if(r.kind==='seat'){
  const pose=actorProject(p,r.subjectId),point=surfacePoint(find(p,r.targetId),r.anchor),actual=toWorld(p,r.subjectId,worldPoint(pose,profile,'hips',seatLocalPoint));
  if(Math.hypot(...point.map((n,i)=>n-actual[i]))>.008||!surfaceContains(find(p,r.targetId),r.anchor))errors.push(issue('SEAT_CONTACT_CONFLICT','身体已离开座面；请先解除坐姿接触再自由移动'));
  for(const side of ['left','right'])if(toWorld(p,r.subjectId,worldPoint(pose,profile,side+'Foot',soleLocalPoint))[1]<p.scene.floorY-.008)errors.push(issue('SEAT_FLOOR_CONFLICT','脚不能穿入地面，请调整座面或腿部姿态'));
 }else if(r.kind==='hand'){
  const g=supportGeometry(actorProject(p,r.subjectId),handContact(p,r),profile);
  if(g.distance>profile.height*.006||g.normalAngle>.12||!surfaceContains(find(p,r.targetId),r.anchor))errors.push(issue('SURFACE_HAND_CONFLICT','手掌没有保持在指定表面上',[r.hand]));
 }return errors;
}
