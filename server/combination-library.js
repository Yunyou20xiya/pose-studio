import {readFile,readdir,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {clone} from '../src/pose/state.js';
import {checkScene} from '../src/scene/engine.js';
import {primaryDescriptor} from '../src/scene/state.js';
import {captureCombination,externalLinkCount,validateCombinationShape,validId,validName} from '../src/scene/combinations.js';
import {groupDescriptor} from '../src/scene/groups.js';
import {pngBytes} from './pose-library.js';

export function validateStoredCombination(c,baseProject,profile){
 validateCombinationShape(c,baseProject);const p=clone(baseProject),actors=clone(c.actors),objects=clone(c.objects);
 let primary;
 if(actors.length){const {pose,...meta}=actors.shift();Object.assign(p,pose);primary=meta;}
 else{primary=clone(primaryDescriptor(p));primary.id='combination-validation';while(objects.some(o=>o.id===primary.id))primary.id+='-';primary.transform={position:[0,0,0],yaw:0,scale:1};}
 p.scene={version:1,floorY:0,primary,actors,objects,relations:clone(c.relations),gazeTargets:clone(c.gazeTargets),...(c.handInteractions?{handInteractions:clone(c.handInteractions)}:{})};
 const errors=checkScene(p,profile).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
 return c;
}
export async function saveCurrentCombination({store,readProject,verifyProject,request}){
 const p=readProject();if(!p)throw Error('尚无可收藏的场景');await verifyProject(p);
 return store.save({...request,project:readProject()});
}
export function createCombinationStore({directory,builtinDirectory,profile,baseProject}){
 async function get(id){
  if(!validId(id))throw Error('组合标识无效');const builtin=id.startsWith('builtin-');if(builtin&&!builtinDirectory)throw Error('没有这个起步组合');
  const item=JSON.parse(await readFile(join(builtin?builtinDirectory:directory,id+'.combination.json'),'utf8'));
  if(item.schemaVersion!==1||item.id!==id||!validName(item.name)||!Number.isFinite(Date.parse(item.createdAt))||item.name!==item.combination?.name)throw Error('组合收藏格式无效');
  validateStoredCombination(item.combination,baseProject,profile);pngBytes(item.thumbnail);return{...item,builtin};
 }
 return{get,async list(){
  await mkdir(directory,{recursive:true});const rows=[];
  for(const folder of [builtinDirectory,directory].filter(Boolean))for(const file of await readdir(folder).catch(e=>{if(e.code==='ENOENT')return[];throw e;})){
   if(!file.endsWith('.combination.json'))continue;const id=file.slice(0,-17);
   try{const item=await get(id);rows.push({id,name:item.name,builtin:item.builtin,createdAt:item.createdAt,actors:item.combination.actors.length,objects:item.combination.objects.length,members:[...item.combination.actors.map(a=>({id:a.id,name:a.name,kind:'actor'})),...item.combination.objects.map(o=>({id:o.id,name:o.name,kind:'object',type:o.type}))],thumbnail:'/api/combination-images/'+id+'.png'});}catch(e){rows.push({id,name:'暂不能使用的组合',unavailable:true,reason:e.message});}
  }return rows.sort((a,b)=>Number(!!b.builtin)-Number(!!a.builtin)||(b.createdAt||'').localeCompare(a.createdAt||''));
 },async save({project,projectId,expectedRevision,groupId,memberIds,name,thumbnail}){
  if(!project||project.projectId!==projectId||project.revision!==expectedRevision)throw Error('现场已改变，请用当前组合重新收藏');
  const group=groupId?groupDescriptor(project,groupId):null;if(groupId&&!group)throw Error('这个组合已移除');
  const ids=group?.memberIds||memberIds,combination=captureCombination(project,{...(group||{}),memberIds:ids,name});validateStoredCombination(combination,baseProject,profile);pngBytes(thumbnail);
  const item={schemaVersion:1,id:crypto.randomUUID(),name:combination.name,createdAt:new Date().toISOString(),combination,thumbnail,detachedLinks:externalLinkCount(project,ids)};
  await mkdir(directory,{recursive:true});const file=join(directory,item.id+'.combination.json'),temporary=file+'.tmp';let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(item,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(temporary,file);const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}}
  catch(e){await handle?.close();await unlink(temporary).catch(()=>{});throw e;}return item;
 }};
}
