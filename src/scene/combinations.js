import {Vector3} from 'three';
import {clone,same} from '../pose/state.js';
import {sceneActors,actorProject,ensureScene} from './state.js';

export const sceneItems=p=>[...sceneActors(p),...(p.scene?.objects||[])];
export const validId=id=>typeof id==='string'&&/^[-\w]{1,100}$/.test(id);
export const validName=name=>typeof name==='string'&&!!name.trim()&&name.trim().length<=60;
export const validPosition=p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000);
export const rotate=(point,yaw)=>new Vector3(...point).applyAxisAngle(new Vector3(0,1,0),yaw*Math.PI/180).toArray();
export function selectionCenter(project,memberIds){
 const items=sceneItems(project).filter(a=>memberIds.includes(a.id));if(!items.length)throw Error('请先选择组合成员');
 return [items.reduce((n,a)=>n+a.transform.position[0],0)/items.length,project.scene?.floorY??project.stage.floorY,items.reduce((n,a)=>n+a.transform.position[2],0)/items.length];
}
export function externalLinkCount(project,memberIds){
 const ids=new Set(memberIds);return [...(project.scene?.relations||[]),...(project.scene?.gazeTargets||[])].filter(r=>ids.has(r.subjectId)&&!ids.has(r.targetId)).length+(project.scene?.handInteractions||[]).filter(r=>r.hands.some(h=>ids.has(h.actorId))&&!r.hands.every(h=>ids.has(h.actorId))).length;
}
export function captureCombination(project,{memberIds,name,position=selectionCenter(project,memberIds),yaw=0}){
 const all=sceneItems(project),ids=new Set(memberIds);
 if(!validName(name)||!Array.isArray(memberIds)||!memberIds.length||ids.size!==memberIds.length||memberIds.some(id=>!all.some(a=>a.id===id)))throw Error('组合名称或成员无效');
 const actors=[],objects=[];
 for(const item of all.filter(a=>ids.has(a.id))){
  const a=clone(item);a.transform.position=rotate(a.transform.position.map((n,i)=>n-position[i]),-yaw);a.transform.yaw-=yaw;
  if(sceneActors(project).some(x=>x.id===a.id)){const p=actorProject(project,a.id);a.pose={snapshot:p.snapshot,layers:p.layers,stage:p.stage};actors.push(a);}else objects.push(a);
 }
 const internal=rows=>clone((rows||[]).filter(r=>ids.has(r.subjectId)&&ids.has(r.targetId)));
 return{schemaVersion:1,name:name.trim(),model:clone(project.model),profile:clone(project.profile),actors,objects,relations:internal(project.scene?.relations),gazeTargets:internal(project.scene?.gazeTargets),...(project.scene?.handInteractions?{handInteractions:clone(project.scene.handInteractions.filter(r=>r.hands.every(h=>ids.has(h.actorId))))}:{})};
}
export function validateCombinationShape(c,project){
 if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['schemaVersion','name','model','profile','actors','objects','relations','gazeTargets','handInteractions'].includes(k))||c.schemaVersion!==1||!validName(c.name)||!Array.isArray(c.actors)||!Array.isArray(c.objects)||!Array.isArray(c.relations)||!Array.isArray(c.gazeTargets)||!c.actors.length&&!c.objects.length||c.actors.length>6||c.objects.length>80)throw Error('组合收藏格式无效');
 if(!same(c.model,project.model)||!same(c.profile,project.profile))throw Error('组合使用的角色或关节设置与当前工作台不一致');
 if(c.handInteractions!==undefined&&!Array.isArray(c.handInteractions))throw Error('组合手部互动格式无效');
 const ids=new Set();for(const item of [...c.actors,...c.objects]){if(!item||!validId(item.id)||ids.has(item.id)||!validPosition(item.transform?.position)||!Number.isFinite(item.transform?.yaw))throw Error('组合成员格式无效');ids.add(item.id);}
 for(const actor of c.actors){const pose=actor.pose;if(!pose||typeof pose!=='object'||Array.isArray(pose)||Object.keys(pose).some(k=>!['snapshot','layers','stage'].includes(k))||!['snapshot','layers','stage'].every(k=>Object.hasOwn(pose,k)))throw Error('组合中的角色缺少完整姿态');}
 for(const r of [...c.relations,...c.gazeTargets])if(!r||!ids.has(r.subjectId)||!ids.has(r.targetId))throw Error('组合包含丢失的接触或注视对象');
 for(const r of c.handInteractions||[])if(!r||!Array.isArray(r.hands)||r.hands.some(h=>!h||!c.actors.some(a=>a.id===h.actorId)))throw Error('组合包含丢失的互动人物');
 return c;
}
export function insertCombination(project,{combination,id,idMap,position,yaw=0,name}){
 const c=validateCombinationShape(combination,project),s=ensureScene(project),used=new Set([...sceneItems(project).map(a=>a.id),...(s.groups||[]).map(g=>g.id)]),items=[...c.actors,...c.objects];
 if(!validId(id)||used.has(id)||!validPosition(position)||Math.abs(position[1]-s.floorY)>1e-7||!Number.isFinite(yaw)||Math.abs(yaw)>3600||!validName(name??c.name))throw Error('组合标识、位置或转向无效');used.add(id);
 if(!idMap||typeof idMap!=='object'||Object.keys(idMap).length!==items.length)throw Error('组合缺少新的成员标识');
 for(const item of items){const mapped=idMap[item.id];if(!validId(mapped)||used.has(mapped))throw Error('组合成员标识重复或已被使用');used.add(mapped);}
 if(sceneActors(project).length+c.actors.length>6||s.objects.length+c.objects.length>80)throw Error('添加后将超过 6 名角色或 80 件物品，请先减少当前现场的对象');
 const place=item=>{const a=clone(item);a.id=idMap[item.id];a.locked=false;a.transform.position=rotate(a.transform.position,yaw).map((n,i)=>n+position[i]);a.transform.yaw+=yaw;return a;};
 s.actors.push(...c.actors.map(place));s.objects.push(...c.objects.map(place));
 for(const key of ['relations','gazeTargets'])if(c[key].length)(s[key]??=[]).push(...c[key].map(r=>({...clone(r),subjectId:idMap[r.subjectId],targetId:idMap[r.targetId]})));
 if(c.handInteractions?.length)(s.handInteractions??=[]).push(...c.handInteractions.map(r=>({...clone(r),id:crypto.randomUUID(),hands:r.hands.map(h=>({...h,actorId:idMap[h.actorId]}))})));
 (s.groups??=[]).push({id,name:(name??c.name).trim(),memberIds:items.map(a=>idMap[a.id]),position:clone(position),yaw});
 return project;
}
export function combinationOperation(project,combination,placement={}){
 const center=selectionCenter(project,sceneItems(project).map(a=>a.id));
 // Place beyond existing objects rather than on top of the current arrangement.
 const maxX=Math.max(...sceneItems(project).map(a=>a.transform.position[0]));
 return{kind:'scene',action:'apply-combination',combination,id:crypto.randomUUID(),idMap:Object.fromEntries([...combination.actors,...combination.objects].map(a=>[a.id,crypto.randomUUID()])),position:placement.position||[maxX+2.5,center[1],center[2]],yaw:placement.yaw??0};
}
