import {clone,issue,same} from '../pose/state.js';
import {actorDescriptor,actorProject,ensureScene} from './state.js';
import {handTemplates,handTargets,pairedGeometry,fitPairedHands} from '../pose/paired-hands.js';
import {forward} from '../pose/kinematics.js';
import {supportArm} from '../pose/hand-supports.js';
export {handTemplates} from '../pose/paired-hands.js';
export const handInteractions=p=>p.scene?.handInteractions||[];
const key=h=>h.actorId+':'+h.hand,validId=x=>typeof x==='string'&&/^[-\w]{1,100}$/.test(x),vector=x=>Array.isArray(x)&&x.length===3&&x.every(n=>Number.isFinite(n)&&Math.abs(n)<=100),keys=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));
export function handInteractionIssues(p,profile,{geometry=true}={}){
 const rows=p.scene?.handInteractions;if(rows===undefined)return[];const error=m=>issue('HAND_INTERACTION_CONFLICT',m);
 if(!Array.isArray(rows)||rows.length>6)return[error('手部互动记录无效')];
 const ids=new Set(),hands=new Set(),issues=[];
 for(const r of rows){
  if(!keys(r,['id','preset','hands','position','yaw','strength'])||!validId(r.id)||ids.has(r.id)||!handTemplates.some(t=>t.id===r.preset)||!Array.isArray(r.hands)||r.hands.length!==2||!vector(r.position)||!Number.isFinite(r.yaw)||Math.abs(r.yaw)>3600||!Number.isFinite(r.strength)||r.strength<0||r.strength>1){issues.push(error('手部互动模板、位置或标识无效'));continue;}ids.add(r.id);
  for(const h of r.hands){if(!keys(h,['actorId','hand'])||!actorDescriptor(p,h.actorId)||!['leftHand','rightHand'].includes(h.hand)||hands.has(key(h))){issues.push(error('互动参与手无效，或同一只手被重复使用'));continue;}hands.add(key(h));
   if(actorProject(p,h.actorId).snapshot.contacts.some(c=>c.bone===h.hand)||(p.scene?.relations||[]).some(c=>c.subjectId===h.actorId&&c.kind==='hand'&&c.hand===h.hand))issues.push(error('这只手已保持其他接触，请先解除已有接触'));
  }
  const [a,b]=r.hands;
  if(r.preset==='palms-together'?(a?.actorId!==b?.actorId||a?.hand===b?.hand):(a?.actorId===b?.actorId||(r.preset==='handshake'?a?.hand!==b?.hand:a?.hand===b?.hand)))issues.push(error('合掌使用同一人的左右手，握手使用两人的同侧手，牵手使用两人的相反侧手'));
 }
 if(issues.length||!geometry)return issues;
 for(const r of rows)for(const g of pairedGeometry(p,r,profile))if(g.distance>.006||g.angle>8*Math.PI/180)issues.push(error('双手接触已偏离，请重新调整互动或解除接触'));
 return issues;
}
export function handOperation(p,op,profile){
 const allowed=op.action==='hand-interact'?['kind','action','id','preset','hands','position','yaw','strength','overwriteManual']:op.action==='hand-adjust'?['kind','action','id','position','yaw','strength','overwriteManual']:['kind','action','id'];
 if(Object.keys(op).some(k=>!allowed.includes(k)))throw Error('手部互动含有未支持的设置');
 if(op.action==='hand-release'){if(!handInteractions(p).some(r=>r.id===op.id))throw Error('这个手部互动已解除');p.scene.handInteractions=p.scene.handInteractions.filter(r=>r.id!==op.id);return;}
 if(op.overwriteManual!==undefined&&typeof op.overwriteManual!=='boolean')throw Error('请选择是否允许替换手动调整');
 let r;
 if(op.action==='hand-interact'){
  if(handInteractions(p).some(r=>r.id===op.id))throw Error('互动标识已使用');
  r={id:op.id,preset:op.preset,hands:clone(op.hands),position:clone(op.position),yaw:op.yaw??0,strength:op.strength??.45};ensureScene(p);(p.scene.handInteractions??=[]).push(r);
 }else{
  r=handInteractions(p).find(r=>r.id===op.id);if(!r)throw Error('这个手部互动已解除');
  for(const k of ['position','yaw','strength'])if(Object.hasOwn(op,k))r[k]=clone(op[k]);
 }
 const bad=handInteractionIssues(p,profile,{geometry:false});if(bad.length)throw Error(bad[0].message);
 if(p.model.id!=='vroid-sample-a')throw Error('当前手部模板尚未适配这个模型');
 fitPairedHands(p,r,profile,{initialize:op.action==='hand-interact',reshape:Object.hasOwn(op,'strength'),overwriteManual:op.overwriteManual===true});
}
export function followHandInteractions(p,previous,{operation,bodyCommand,profile}={}){
 const bad=handInteractionIssues(p,profile,{geometry:false});if(bad.length)throw Error(bad[0].message);
 for(const r of handInteractions(p)){
  const old=handInteractions(previous).find(x=>x.id===r.id);if(!old)continue;
  const previousTargets=handTargets(previous,old,profile),targets=handTargets(p,r,profile),skipHands=new Set();
  r.hands.forEach((h,i)=>{if(same(h,old.hands[i])&&same(targets[i].contact,previousTargets[i].contact)&&same(forward(actorProject(p,h.actorId),profile)[h.hand],forward(actorProject(previous,h.actorId),profile)[h.hand]))skipHands.add(key(h));});
  if(skipHands.size===2)continue;
  fitPairedHands(p,r,profile,{bodyCommand,skipHands});
 }
 return[];
}
export function removeHandInteractions(p,actorId){if(p.scene?.handInteractions)p.scene.handInteractions=p.scene.handInteractions.filter(r=>r.hands.every(h=>h.actorId!==actorId));}
export function copySelfHandInteractions(p,sourceId,newId){
 const copies=handInteractions(p).filter(r=>r.hands.every(h=>h.actorId===sourceId)).map(r=>({...clone(r),id:crypto.randomUUID(),hands:r.hands.map(h=>({...h,actorId:newId}))}));
 if(copies.length)(p.scene.handInteractions??=[]).push(...copies);
}
export function withHandInteractionScope(command,project,profile){
 const p=project._sceneProject||project,c=clone(command),id=c.actorId||project._actorId||p.scene?.primary.id||'primary';
 if(c.operations.some(o=>['scene','undo','redo','restore'].includes(o.kind)))return c;
 const hands=handInteractions(p).flatMap(r=>r.hands).filter(h=>h.actorId===id),arms=[...new Set(hands.flatMap(h=>supportArm(h.hand,profile)))];
 if(c.scope.root||c.scope.bones.some(b=>[...arms,'hips','spine','chest','upperChest'].includes(b)))c.scope.bones=[...new Set([...c.scope.bones,...arms])];
 return c;
}
