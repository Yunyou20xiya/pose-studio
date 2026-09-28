import {clone,issue} from '../pose/state.js';
import {ensureScene} from './state.js';
import {sceneItems,validId,validName,validPosition,rotate,selectionCenter,captureCombination,insertCombination} from './combinations.js';

export const sceneGroups=p=>p.scene?.groups||[];
export const groupDescriptor=(p,id)=>sceneGroups(p).find(g=>g.id===id);
export function groupIssues(p){
 if(p.scene?.groups===undefined)return[];
 const groups=p.scene.groups,bad=()=>[issue('INVALID_GROUP','组合名称、成员或位置无效')];if(!Array.isArray(groups)||groups.length>86)return bad();
 const items=new Set(sceneItems(p).map(a=>a.id)),used=new Set(items),members=new Set();
 for(const g of groups){
  if(!g||typeof g!=='object'||Object.keys(g).some(k=>!['id','name','memberIds','position','yaw'].includes(k))||!validId(g.id)||used.has(g.id)||!validName(g.name)||!Array.isArray(g.memberIds)||!g.memberIds.length||!validPosition(g.position)||Math.abs(g.position[1]-p.scene.floorY)>1e-7||!Number.isFinite(g.yaw)||Math.abs(g.yaw)>3600)return bad();used.add(g.id);
  for(const id of g.memberIds){if(!items.has(id)||members.has(id))return bad();members.add(id);}
 }return[];
}
export function removeGroupMember(p,id){if(p.scene?.groups)p.scene.groups=p.scene.groups.map(g=>({...g,memberIds:g.memberIds.filter(m=>m!==id)})).filter(g=>g.memberIds.length);}
export function groupOperation(p,op){
 const s=ensureScene(p),items=sceneItems(p),allIds=new Set([...items.map(a=>a.id),...sceneGroups(p).map(g=>g.id)]);
 if(op.action==='apply-combination'){insertCombination(p,op);return;}
 if(op.action==='group-create'){
  if(!validId(op.id)||allIds.has(op.id)||!validName(op.name)||!Array.isArray(op.memberIds)||!op.memberIds.length||new Set(op.memberIds).size!==op.memberIds.length||op.memberIds.some(id=>!items.some(a=>a.id===id)))throw Error('请填写组合名称并选择有效成员');
  if(sceneGroups(p).some(g=>g.memberIds.some(id=>op.memberIds.includes(id))))throw Error('成员已属于另一组，请先解除原来的分组');
  (s.groups??=[]).push({id:op.id,name:op.name.trim(),memberIds:clone(op.memberIds),position:selectionCenter(p,op.memberIds),yaw:0});return;
 }
 const g=groupDescriptor(p,op.id);if(!g)throw Error('这个组合已经移除');
 if(op.action==='group-dissolve'){s.groups=s.groups.filter(g=>g.id!==op.id);return;}
 if(op.action==='group-rename'){if(!validName(op.name))throw Error('请填写 1–60 字的组合名称');g.name=op.name.trim();return;}
 if(op.action==='group-duplicate'){
  const combination=captureCombination(p,{...g,name:(g.name+' 副本').slice(0,60)});
  insertCombination(p,{combination,id:op.newId,idMap:op.idMap,position:op.position??[g.position[0]+2.5,s.floorY,g.position[2]],yaw:op.yaw??g.yaw});return;
 }
 if(op.action==='group-transform'){
  if(!validPosition(op.position)||Math.abs(op.position[1]-s.floorY)>1e-7||!Number.isFinite(op.yaw)||Math.abs(op.yaw)>3600)throw Error('组合沿地面移动，请填写有效的位置与转向');
  const ids=new Set(g.memberIds),members=items.filter(a=>ids.has(a.id));if(members.some(a=>a.locked))throw Error('组合中有已锁定的成员，请先解锁');
  if((s.relations||[]).some(r=>ids.has(r.subjectId)!==ids.has(r.targetId)))throw Error('组合与组外物品仍有接触，请把接触对象加入同一组，或先解除接触');
  if((s.handInteractions||[]).some(r=>r.hands.some(h=>ids.has(h.actorId))&&!r.hands.every(h=>ids.has(h.actorId))))throw Error('组合仍与组外人物牵手或握手，请一起移动或先解除互动');
  const delta=op.yaw-g.yaw;
  for(const a of members){a.transform.position=rotate(a.transform.position.map((n,i)=>n-g.position[i]),delta).map((n,i)=>n+op.position[i]);a.transform.yaw+=delta;}
  g.position=clone(op.position);g.yaw=op.yaw;return ids;
 }
 throw Error('不支持的组合操作');
}
