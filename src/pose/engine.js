import {clone,issue,same,checkProject} from './state.js';
import {createTransactions} from './transactions.js';
import {projectJoint,effectiveRule,quaternionDistance} from './limits.js';
import {solveEffector} from './ik.js';
import {checkContacts} from './contacts.js';
import {solveGaze} from '../face/gaze.js';
import {resolveExpressions} from '../face/expressions.js';
import {isHandSupport,setHandSupport,followHandSupports} from './hand-supports.js';
const patchKeys=['rotations','rootPosition','rootRotation','expressions','gaze','contacts','stage','camera','lighting','layers'];
export function checkPose(p,profile,options={}){
 const issues=checkProject(p,profile,options);if(issues.length)return issues;
 if(profile.modelSha256&&p.model.sha256!==profile.modelSha256)issues.push(issue('MODEL_MISMATCH','角色文件与关节配置不匹配'));
 if(profile.assetRef&&!same(p.profile,profile.assetRef))issues.push(issue('PROFILE_MISMATCH','项目的关节配置版本不匹配'));
 for(const[n,q]of Object.entries(p.snapshot.rotations)){
  if(!profile.limits[n]){if(quaternionDistance(q,[0,0,0,1])>1e-5)issues.push(issue('JOINT_UNCONFIGURED','此关节尚未开放编辑',[n]));continue;}
  if(quaternionDistance(q,projectJoint(q,effectiveRule(n,p.snapshot.rotations,profile),q))>1e-5)issues.push(issue('ILLEGAL_POSE','姿态超出当前关节范围',[n]));
 }
 for(const l of p.snapshot.locks)if(l.kind==='joint'&&quaternionDistance(l.rotation,p.snapshot.rotations[l.bone])>1e-6)issues.push(issue('JOINT_LOCKED','关节锁与姿态不一致',[l.bone]));
 return [...issues,...checkContacts(p,profile)];
}
export function createEngine(initial,profile,options={}){
 const initialIssues=checkPose(initial,profile,options);if(initialIssues.some(i=>i.severity==='error'))throw Error(initialIssues.map(i=>i.message).join('；'));
 const tx=createTransactions(initial,p=>checkPose(p,profile,options));
 function produce(project,c){
  const issues=[];const start=clone(project);const manual=new Set(project.layers.filter(l=>l.manual).flatMap(l=>l.bones));
  for(const op of c.operations){
   if(['undo','redo'].includes(op.kind))continue;
   if(op.kind==='restore'){if(c.operations.length!==1)throw Error('重新打开必须单独执行');return{project:clone(op.project),issues};}
   if(op.kind==='set-locks'){project.snapshot.locks=clone(op.value);continue;}
   if(op.kind==='hand-support'){
    const result=setHandSupport(project,op,c,profile);project=result.project;issues.push(...result.issues);continue;
   }
   if(op.kind==='effector'){
    if(project.snapshot.contacts.some(x=>isHandSupport(x)&&x.bone===op.bone)){issues.push(issue('HAND_CONTACT_ACTIVE','这只手正在保持接触，请先解除接触再自由拖动。',[op.bone]));continue;}
    if(!Array.isArray(op.position)||op.position.length!==3||!op.position.every(Number.isFinite))throw Error('目标位置无效');
    const allow=c.scope.bones.filter(n=>!manual.has(n)||c.overwriteManual.includes(n));
    const result=solveEffector(project,op,{...c.scope,bones:allow},profile);project=result.project;issues.push(...result.issues);continue;
   }
   if(op.kind!=='patch'||!op.value||Object.keys(op.value).some(n=>!patchKeys.includes(n)))throw Error('不支持的动作操作或字段');
   if(op.gazeMode!==undefined&&!['solve','restore'].includes(op.gazeMode))throw Error('视线应用方式无效');
   const patch=op.value;
   for(const[n,q]of Object.entries(patch.rotations||{})){
    if(!profile.bones[n]||!profile.bones[n].editable||!profile.limits[n]){issues.push(issue('JOINT_UNCONFIGURED','此关节尚未开放编辑',[n]));continue;}
    if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>.001){issues.push(issue('INVALID_ROTATION','关节旋转无效',[n]));continue;}
    if(manual.has(n)&&!c.overwriteManual.includes(n)){issues.push(issue('MANUAL_PRESERVED','保留了这个部位的手工调整',[n],'warning'));continue;}
    project.snapshot.rotations[n]=clone(q);
   }
   for(const key of ['rootPosition','rootRotation','gaze','contacts'])if(key in patch)project.snapshot[key]=clone(patch[key]);
   if(patch.expressions){const face=resolveExpressions(patch.expressions,profile.capabilities);Object.assign(project.snapshot.expressions,face.values);issues.push(...face.issues);}
   for(const key of ['stage','camera','lighting'])if(key in patch)project[key]=clone(patch[key]);
   if(patch.layers)project.layers.push(...clone(patch.layers));
   for(const n of Object.keys(patch.rotations||{}))if(profile.limits[n]&&project.snapshot.rotations[n]){
    const before=project.snapshot.rotations[n],limited=projectJoint(before,effectiveRule(n,project.snapshot.rotations,profile),start.snapshot.rotations[n]);
    if(quaternionDistance(before,limited)>1e-6)issues.push(issue('JOINT_LIMIT','已停在该关节的活动边界',[n],'warning'));
    project.snapshot.rotations[n]=limited;
   }
   if(patch.gaze&&op.gazeMode!=='restore'){const solved=solveGaze(project,patch.gaze.target,patch.gaze.follow,profile);project=solved.project;issues.push(...solved.issues);}
  }
  if(!c.operations.some(o=>['undo','redo'].includes(o.kind))){const followed=followHandSupports(project,c,profile,start);project=followed.project;issues.push(...followed.issues);}
  const changed=Object.keys(project.snapshot.rotations).filter(n=>!same(start.snapshot.rotations[n],project.snapshot.rotations[n]));
  const expressions=Object.keys(project.snapshot.expressions).filter(n=>!same(start.snapshot.expressions[n],project.snapshot.expressions[n]));
  if(changed.length||expressions.length){
   project.layers=project.layers.map(l=>({...l,bones:l.bones.filter(n=>!changed.includes(n)),expressionNames:l.expressionNames.filter(n=>!expressions.includes(n))})).filter(l=>l.bones.length||l.expressionNames.length);
   const provenance=c.operations.find(o=>o.value?.layers)?.value.layers?.[0];
   project.layers.push({id:c.id,sourceAsset:provenance?.sourceAsset||null,frame:provenance?.frame??null,bones:changed,expressionNames:expressions,manual:['slider','drag'].includes(c.source)});
  }
  return{project,issues};
 }
 return{read:tx.read,apply(c){return tx.run(c,p=>produce(p,c));},preview(c){
  const temp=createTransactions(tx.read(),p=>checkPose(p,profile,options));let candidate=tx.read();const result=temp.run(c,p=>{const out=produce(p,c);candidate=clone(out.project);return out;});
  if(result.status!=='applied')candidate=tx.read();candidate.revision=tx.read().revision;return{project:candidate,issues:result.issues,status:result.status};
 }};
}
