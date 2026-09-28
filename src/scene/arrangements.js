import {makeCommand,fullScope,clone} from '../pose/state.js';
import {sceneActors,actorProject} from './state.js';
import {sceneGroups} from './groups.js';
import {validName} from './combinations.js';

export function arrangementSteps(op){
 if(!validName(op.label)||!Array.isArray(op.steps)||!op.steps.length||op.steps.length>128)throw Error('请为整套布置填写名称和 1–128 个步骤');
 for(const step of op.steps){
  const ops=step?.kind==='scene'?[step]:step?.operations;
  if(!Array.isArray(ops)||!ops.length||ops.some(o=>!o||['restore','undo','redo'].includes(o.kind)||o.kind==='scene'&&o.action==='arrange'))throw Error('整套布置不能嵌套，也不能包含撤销、重做或打开项目');
 }
 return op.steps;
}
export function arrangementStepCommand(project,step){
 if(step.kind==='scene')return makeCommand(project,[clone(step)],{...fullScope(project),scene:true},'dialogue');
 // Body steps retain the caller's explicit scope and manual-overwrite choices.
 return{...clone(step),id:crypto.randomUUID(),projectId:project.projectId,expectedRevision:project.revision,source:step.source||'dialogue'};
}
export function buildArrangementCommand(project,{label,steps}){
 const op={kind:'scene',action:'arrange',label,steps};arrangementSteps(op);return makeCommand(project,[op],{...fullScope(project),scene:true},'dialogue');
}
export async function expandArrangement(plan,loadCombination){
 const expanded=clone(plan);arrangementSteps(expanded);
 for(const [index,step]of expanded.steps.entries())if(step.kind==='scene'&&step.action==='use-combination'){
  const {combinationId,...placement}=step,item=await loadCombination(combinationId);
  expanded.steps[index]={...placement,action:'apply-combination',combination:clone(item.combination)};
 }
 return expanded;
}
export function sceneSummary(p){
 return{projectId:p.projectId,revision:p.revision,floorY:p.scene?.floorY??p.stage.floorY,capacity:{actors:6,objects:80},
  actors:sceneActors(p).map(a=>({id:a.id,name:a.name,visible:a.visible,locked:a.locked,transform:clone(a.transform),jointLocks:clone(actorProject(p,a.id).snapshot.locks),poseSources:[...new Set(actorProject(p,a.id).layers.map(l=>l.sourceAsset).filter(Boolean))],manuallyAdjustedBones:[...new Set(actorProject(p,a.id).layers.filter(l=>l.manual).flatMap(l=>l.bones))]})),
  objects:clone(p.scene?.objects||[]),groups:clone(sceneGroups(p)),handInteractions:clone(p.scene?.handInteractions||[]),contacts:clone(p.scene?.relations||[]),gazeTargets:clone(p.scene?.gazeTargets||[]),camera:clone(p.camera),lighting:clone(p.lighting)};
}
