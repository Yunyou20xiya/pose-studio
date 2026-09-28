import {handClearanceIssues} from '../pose/hand-clearance.js';
import {handInteractionIssues,handOperation,followHandInteractions,removeHandInteractions,copySelfHandInteractions} from './hand-interactions.js';
import {createEngine,checkPose} from '../pose/engine.js';
import {createTransactions} from '../pose/transactions.js';
import {clone,fullScope,issue,checkProject} from '../pose/state.js';
import {ensureScene,sceneActors,actorDescriptor,actorProject,primaryDescriptor,putActorProject,sceneStructureIssues} from './state.js';
import {objectSpec} from './catalog.js';
import {attachRelation,detachRelation,followRelations,releaseRemovedRelations,releasePoseRelations,relationStructureIssues,relationGeometryIssues} from './relations.js';
import {gazeTargetIssues,gazeGeometryIssues,setGazeTarget,clearGazeTarget,removeGazeTarget,releaseExplicitGaze,followGazeTargets} from './gaze-targets.js';
import {groupIssues,groupOperation,removeGroupMember} from './groups.js';
import {arrangementSteps,arrangementStepCommand} from './arrangements.js';
export function checkScene(p,profile){
 const structural=[...sceneStructureIssues(p),...checkProject(p,profile)];if(structural.length)return structural;
 const relationships=[...relationStructureIssues(p),...gazeTargetIssues(p),...groupIssues(p),...handInteractionIssues(p,profile,{geometry:false})];if(relationships.length)return relationships;
 try{return [...handInteractionIssues(p,profile),...(p.scene?.handInteractions||[]).flatMap(r=>handClearanceIssues(p,r,profile)),...relationGeometryIssues(p,profile),...gazeGeometryIssues(p,profile),...sceneActors(p).flatMap(a=>checkPose(actorProject(p,a.id),profile,{skipLightingTarget:true}).map(i=>({...i,message:p.scene?a.name+'：'+i.message:i.message})))];}catch(e){return[issue('INVALID_SCENE',e.message)];}
}
function sceneOperation(p,op){
 const s=ensureScene(p),actors=sceneActors(p),all=[...actors,...s.objects],find=id=>{const a=all.find(a=>a.id===id);if(!a)throw Error('对象已经移除');return a;},unique=id=>{if(all.some(a=>a.id===id))throw Error('对象标识已使用');return id;};
 const addActor=(source,id)=>{if(actors.length>=6)throw Error('本版最多同时放置 6 名角色');const original=find(source),view=actorProject(p,source),a=clone(original);a.id=unique(id);a.name='角色 '+(actors.length+1);a.locked=false;a.visible=true;a.transform.position[0]+=1.2;a.pose={snapshot:view.snapshot,layers:view.layers,stage:view.stage};s.actors.push(a);copySelfHandInteractions(p,source,id);};
 if(op.action==='add-actor'){addActor(op.sourceId||s.primary.id,op.id);return p;}
 if(op.action==='add-object'){
  if(s.objects.length>=80)throw Error('本版最多放置 80 件物品');const spec=objectSpec(op.type);if(!spec)throw Error('没有这种物品');
  s.objects.push({id:unique(op.id),name:spec.name,visible:true,locked:false,type:spec.id,color:spec.color,transform:{position:op.position||[1,s.floorY,0],yaw:0,scale:[1,1,1]}});return p;
 }
 const a=find(op.id),actor=actors.some(x=>x.id===op.id);
 if(op.action==='duplicate'){
  if(actor)addActor(a.id,op.newId);else{if(s.objects.length>=80)throw Error('本版最多放置 80 件物品');const copy=clone(a);copy.id=unique(op.newId);copy.name=(a.name+' 副本').slice(0,60);copy.locked=false;copy.transform.position[0]+=.6;s.objects.push(copy);}return p;
 }
 if(a.locked&&!(op.action==='update'&&Object.keys(op.value||{}).length===1&&op.value.locked===false))throw Error('对象已锁定，请先解锁');
 if(['look-at','adjust-gaze'].includes(op.action)){setGazeTarget(p,op);return p;}
 if(op.action==='clear-gaze'){clearGazeTarget(p,op.id);return p;}
 if(op.action==='attach'){attachRelation(p,op);return p;}
 if(op.action==='adjust-contact'){
  const r=s.relations?.find(r=>r.subjectId===op.id&&r.kind===op.relation&&(r.kind!=='hand'||r.hand===op.hand));if(!r)throw Error('这个接触已经解除，请重新选择目标');r.anchor=clone(op.anchor);return p;
 }
 if(op.action==='detach'){if(!['seat','surface','hand'].includes(op.relation))throw Error('请选择有效的接触关系');detachRelation(p,op.id,op.relation,op.hand);return p;}
 if(op.action==='update'){
  if(!op.value||Object.keys(op.value).some(k=>!['name','visible','locked','transform',...(!actor?['color']:[])].includes(k)))throw Error('不支持的对象修改');
  const value=clone(op.value);if(value.transform){const t=value.transform;if(Array.isArray(t.position)&&t.position.length===3&&Number.isFinite(t.position[1])){const localFloor=actor?actorProject(p,a.id).stage.floorY:0;t.position[1]=Math.max(t.position[1],s.floorY-localFloor*(actor?t.scale:1));}}Object.assign(a,value);return p;
 }
 if(op.action==='remove'){
  if(actor&&actors.length===1)throw Error('场景至少保留一名角色，可以隐藏这名角色');
  removeHandInteractions(p,op.id);releaseRemovedRelations(p,op.id);removeGazeTarget(p,op.id);removeGroupMember(p,op.id);
  if(op.id===s.primary.id){const next=s.actors.shift(),{pose,...meta}=next;Object.assign(p,clone(pose));s.primary=meta;}else if(actor)s.actors=s.actors.filter(x=>x.id!==op.id);else s.objects=s.objects.filter(x=>x.id!==op.id);return p;
 }
 throw Error('不支持的场景操作');
}
export function createSceneEngine(initial,profile){
 const errors=checkScene(initial,profile).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
 const tx=createTransactions(initial,p=>checkScene(p,profile));
 function run(transaction,c){
  // The outer transaction owns revision/history. Body scope is validated by the original pose engine.
  const envelope={...c,scope:{...fullScope(transaction.read()),scene:true},overwriteManual:Object.keys(transaction.read().snapshot.rotations),originalCommand:c};
  return transaction.run(envelope,p=>{
   if(!Array.isArray(c.operations)||!c.operations.length)throw Error('指令无效');
   if(c.operations.length===1&&['undo','redo'].includes(c.operations[0].kind))return{project:p,issues:[]};
   if(c.operations.length===1&&c.operations[0].kind==='restore')return{project:clone(c.operations[0].project),issues:[]};
   if(c.operations.some(o=>o.kind==='scene')){if(c.operations.length!==1)throw Error('场景操作需单独执行');const op=c.operations[0],previous=clone(p);
    if(['hand-interact','hand-adjust','hand-release'].includes(op.action)){handOperation(p,op,profile);return{project:p,issues:[]};}
    if(op.action==='arrange'){
     const steps=arrangementSteps(op),draft=createSceneEngine(p,profile),issues=[];
     for(const [index,step]of steps.entries()){
      const result=draft.apply(arrangementStepCommand(draft.read(),step));
      const detail=result.issues.map(i=>({...i,message:'第 '+(index+1)+' 步：'+i.message}));
      if(result.status!=='applied')return{project:p,issues:[...detail,issue('ARRANGEMENT_FAILED','第 '+(index+1)+' 步未能应用，整套布置已保留原状')]};
      issues.push(...detail);
     }
     const project=draft.read();project.revision=p.revision;return{project,issues};
    }
    if(op.action?.startsWith('group-')||op.action==='apply-combination'){const rigidIds=groupOperation(p,op);const issues=rigidIds?followGazeTargets(p,previous,{operation:op,profile,rigidIds}):[];return{project:p,issues};}sceneOperation(p,op);followRelations(p,previous,{operation:op,profile});followHandInteractions(p,previous,{operation:op,profile});const issues=followGazeTargets(p,previous,{operation:op,profile});if(op.action==='attach'&&op.keep===false)detachRelation(p,op.id,op.relation,op.hand);if(op.action==='look-at'&&op.keep===false)clearGazeTarget(p,op.id);return{project:p,issues};}
   const id=c.actorId||primaryDescriptor(p).id,a=actorDescriptor(p,id);if(!a)throw Error('这个角色已不在场景中');
   if(a.locked&&c.operations.some(o=>o.kind!=='patch'||Object.keys(o.value||{}).some(k=>!['camera','lighting'].includes(k))))throw Error('角色已锁定，请先解锁');
   const inner=createEngine(actorProject(p,id),profile,{skipLightingTarget:true}),result=inner.apply(c);
   if(result.status!=='applied')return{project:p,issues:result.issues};
   const previous=clone(p);releasePoseRelations(p,id,c);releaseExplicitGaze(p,id,c,previous);putActorProject(p,id,inner.read());followRelations(p,previous,{profile,bodyCommand:c});followHandInteractions(p,previous,{profile,bodyCommand:c});
   return{project:p,issues:[...result.issues,...followGazeTargets(p,previous,{profile,bodyCommand:c})]};
  });
 }
 return{read:tx.read,apply(c){const result=run(tx,c),op=c?.operations?.[0];if(result.status==='applied'&&op?.kind==='scene'&&op.action==='arrange'){result.summary='已完成“'+op.label+'” · 可整套撤销';const last=[...op.steps].reverse().find(s=>s.kind==='scene'&&['group-create','apply-combination','group-duplicate'].includes(s.action));if(last)result.focusId=last.action==='group-duplicate'?last.newId:last.id;}else if(result.status==='applied'&&op?.kind==='scene'&&['group-create','group-duplicate','apply-combination'].includes(op.action))result.focusId=op.action==='group-duplicate'?op.newId:op.id;const handOp=op?.action==='arrange'?[...op.steps].reverse().find(s=>s.kind==='scene'&&['hand-interact','hand-adjust'].includes(s.action)):op;if(result.status==='applied'&&['hand-interact','hand-adjust'].includes(handOp?.action)&&tx.read().scene?.handInteractions?.some(r=>r.id===handOp.id)){result.handInteractionId=handOp.id;result.summary='双手已摆好 · 可进入手部工作间微调';}if(result.focusId&&!tx.read().scene?.groups?.some(g=>g.id===result.focusId))delete result.focusId;return result;},preview(c){const temp=createTransactions(tx.read(),p=>checkScene(p,profile)),result=run(temp,c),p=temp.read();p.revision=tx.read().revision;return{project:p,status:result.status,issues:result.issues};}};
}
