import {Vector3} from 'three';
import {clone,same,issue,makeCommand} from '../pose/state.js';
import {forward,worldPoint} from '../pose/kinematics.js';
import {solveGaze} from '../face/gaze.js';
import {followHandSupports,withHandSupportScope} from '../pose/hand-supports.js';
import {actorDescriptor,actorProject,putActorProject,primaryDescriptor,toLocal,toWorld} from './state.js';
import {objectSpec} from './catalog.js';

export const gazeTargets=p=>p.scene?.gazeTargets||[];
const targetObject=(p,id)=>actorDescriptor(p,id)||p.scene?.objects.find(o=>o.id===id);
const headBones=['head','neck'];
export function gazeTargetIssues(p){
 const rows=p.scene?.gazeTargets;if(rows===undefined)return[];
 const bad=message=>issue('INVALID_GAZE_TARGET',message),seen=new Set(),issues=[];
 if(!Array.isArray(rows)||rows.length>6)return[bad('视线目标记录无效')];
 for(const r of rows){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['subjectId','targetId','offset'].includes(k))||!actorDescriptor(p,r.subjectId)||!targetObject(p,r.targetId)||r.subjectId===r.targetId||!Array.isArray(r.offset)||r.offset.length!==3||r.offset.some(n=>!Number.isFinite(n)||Math.abs(n)>2)||seen.has(r.subjectId))issues.push(bad('视线目标已丢失、重复或瞄准位置无效'));
  seen.add(r?.subjectId);
 }return issues;
}
export function gazeTargetPoint(p,r,profile){
 const target=targetObject(p,r.targetId),actor=actorDescriptor(p,r.targetId);
 if(actor){
  // Use a face-height anchor carried by the torso. Head/neck aiming must not
  // feed back into the other person's aim when two people look at each other.
  const pose=actorProject(p,r.targetId);for(const b of headBones)pose.snapshot.rotations[b]=[0,0,0,1];
  const face=worldPoint(pose,profile,'head',[0,.035,0]);
  return toWorld(p,r.targetId,face.map((n,i)=>n+r.offset[i]));
 }
 const local=new Vector3(r.offset[0],objectSpec(target.type).size[1]/2+r.offset[1],r.offset[2]);
 return local.multiply(new Vector3(...target.transform.scale)).applyAxisAngle(new Vector3(0,1,0),target.transform.yaw*Math.PI/180).add(new Vector3(...target.transform.position)).toArray();
}
export function gazeGeometryIssues(p,profile){
 return gazeTargets(p).flatMap(r=>{
  const gaze=actorProject(p,r.subjectId).snapshot.gaze,point=toLocal(p,r.subjectId,gazeTargetPoint(p,r,profile));
  return gaze.mode!=='point'||Math.hypot(...point.map((n,i)=>n-gaze.target[i]))>1e-5?[issue('GAZE_TARGET_CONFLICT','视线目标与场景位置不一致')]:[];
 });
}
export function clearGazeTarget(p,id){if(p.scene?.gazeTargets)p.scene.gazeTargets=gazeTargets(p).filter(r=>r.subjectId!==id);}
export function removeGazeTarget(p,id){if(p.scene?.gazeTargets)p.scene.gazeTargets=gazeTargets(p).filter(r=>r.subjectId!==id&&r.targetId!==id);}
export function setGazeTarget(p,op){
 const actor=actorDescriptor(p,op.id);if(!actor)throw Error('请先选择要调整视线的角色');
 if(op.keep!==undefined&&typeof op.keep!=='boolean')throw Error('保持注视选项无效');
 const old=gazeTargets(p).find(r=>r.subjectId===op.id);
 if(op.action==='adjust-gaze'&&!old)throw Error('注视已经解除，请重新选择目标');
 const follow=op.follow??(op.action==='adjust-gaze'?actorProject(p,op.id).snapshot.gaze.follow:1);
 if(!Number.isFinite(follow)||follow<0||follow>1)throw Error('头颈跟随程度应在 0 到 100% 之间');
 const r={subjectId:op.id,targetId:op.action==='adjust-gaze'?old.targetId:op.targetId,offset:clone(op.offset??(op.action==='adjust-gaze'?old.offset:[0,0,0]))};
 clearGazeTarget(p,op.id);(p.scene.gazeTargets??=[]).push(r);
 const errors=gazeTargetIssues(p);if(errors.length)throw Error(errors[0].message);
 const pose=actorProject(p,op.id);pose.snapshot.gaze.follow=follow;putActorProject(p,op.id,pose);
}
export function releaseExplicitGaze(p,id,command,previous){
 for(const op of command.operations)if(op.kind==='patch'&&op.value?.gaze){
  const gaze=op.value.gaze,old=actorProject(previous,id).snapshot.gaze;
  if(op.gazeMode==='restore'||gaze.mode!=='point'||!same(gaze.target,old.target))clearGazeTarget(p,id);
 }
}
export function withSceneGazeScope(command,project,profile){
 const p=project._sceneProject||project,id=command.actorId||project._actorId||primaryDescriptor(p).id,next=clone(command);
 if(!gazeTargets(p).some(r=>r.subjectId===id)||next.operations.some(o=>['undo','redo','restore','scene'].includes(o.kind)))return next;
 const ancestors=[];for(let b=profile.bones.neck.parent;b;b=profile.bones[b]?.parent)ancestors.push(b);
 if(next.scope.root||next.scope.gaze||next.scope.bones.some(b=>ancestors.includes(b))){
  next.scope.gaze=true;next.scope.bones=[...new Set([...next.scope.bones,...headBones])];
  if(next.source!=='preset'||next.overwriteManual.length)next.overwriteManual=[...new Set([...next.overwriteManual,...headBones])];
  return withHandSupportScope(next,actorProject(p,id),profile,{overwriteLinkedManual:next.source!=='preset'||next.overwriteManual.length>0});
 }return next;
}
const frame=(p,profile)=>forward(p,profile)[profile.bones.neck.parent];
export function followGazeTargets(p,previous,{profile,operation,bodyCommand,rigidIds}={}){
 const errors=gazeTargetIssues(p);if(errors.length)return errors;
 const issues=[],targets=gazeTargets(p).map(r=>[r,gazeTargetPoint(p,r,profile)]);
 for(const [r,worldTarget]of targets){
  if(rigidIds?.has(r.subjectId)&&rigidIds.has(r.targetId))continue;
  const start=actorProject(p,r.subjectId),old=actorDescriptor(previous,r.subjectId)?actorProject(previous,r.subjectId):start,target=toLocal(p,r.subjectId,worldTarget);
  const force=['look-at','adjust-gaze'].includes(operation?.action)&&operation.id===r.subjectId;
  if(!force&&same(target,start.snapshot.gaze.target)&&same(start.snapshot.gaze.follow,old.snapshot.gaze.follow)&&same(frame(start,profile),frame(old,profile)))continue;
  const own=bodyCommand&&(bodyCommand.actorId||primaryDescriptor(p).id)===r.subjectId;
  const scope={bones:headBones,expressions:[],root:false,gaze:true,stage:false,camera:false,lighting:false};
  const linked=own?bodyCommand:withHandSupportScope(makeCommand(start,[],scope,'scene'),start,profile,{overwriteLinkedManual:true});
  const manual=new Set(start.layers.filter(l=>l.manual).flatMap(l=>l.bones));
  const allowedBones=headBones.filter(b=>!own||!manual.has(b)||linked.overwriteManual.includes(b));
  const solved=solveGaze(start,target,start.snapshot.gaze.follow,profile,{allowedBones});
  issues.push(...solved.issues.map(i=>({...i,message:actorDescriptor(p,r.subjectId).name+'：'+i.message})));
  const next=solved.project;next.snapshot.gaze.mode='point';
  const support=followHandSupports(next,linked,profile,start);issues.push(...support.issues);
  const fitted=support.project,changed=Object.keys(start.snapshot.rotations).filter(b=>!same(start.snapshot.rotations[b],fitted.snapshot.rotations[b]));
  if(own&&(changed.some(b=>!linked.scope.bones.includes(b))||!linked.scope.gaze&&!same(start.snapshot.gaze,fitted.snapshot.gaze))){issues.push(issue('GAZE_TARGET_SCOPE','保持注视需要允许头颈与视线联动，请先解除注视或使用联动调整'));continue;}
  if(actorDescriptor(p,r.subjectId).locked&&!same(old.snapshot,fitted.snapshot)){issues.push(issue('GAZE_TARGET_LOCKED','目标移动会改变已锁定角色的视线，请先解锁或解除注视'));continue;}
  if(changed.length){fitted.layers=fitted.layers.map(l=>({...l,bones:l.bones.filter(b=>!changed.includes(b))})).filter(l=>l.bones.length||l.expressionNames.length);fitted.layers.push({id:'gaze-'+r.subjectId,sourceAsset:'scene-gaze',frame:null,bones:changed,expressionNames:[],manual:false});}
  putActorProject(p,r.subjectId,fitted);
 }return issues;
}
