import {readFile,readdir,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {lightingIssues} from '../src/lighting/settings.js';
const safeId=id=>{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw Error('布光标识无效');return id;};
export function createLightingStore({directory}){
 async function get(id){
  const item=JSON.parse(await readFile(join(directory,safeId(id)+'.light.json'),'utf8'));
  if(item.schemaVersion!==1||item.id!==id||typeof item.name!=='string'||!item.name.trim()||item.name.length>60||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt))||lightingIssues(item.lighting).length)throw Error('布光收藏格式无效');
  return item;
 }
 return{get,async list(){
  await mkdir(directory,{recursive:true});const rows=[];
  for(const file of await readdir(directory)){if(!file.endsWith('.light.json'))continue;const id=file.slice(0,-11);try{const item=await get(id);rows.push({id:item.id,name:item.name,createdAt:item.createdAt});}catch(e){rows.push({id,name:'暂不能使用的布光',unavailable:true,reason:e.message});}}
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
 },async save({project,expectedRevision,name}){
  if(project.revision!==expectedRevision)throw Error('灯光已改变，请用当前现场重新收藏');
  if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw Error('请填写 1–60 字的布光名称');const errors=lightingIssues(project.lighting);if(errors.length)throw Error(errors.join('；'));
  const item={schemaVersion:1,id:crypto.randomUUID(),name:name.trim(),createdAt:new Date().toISOString(),lighting:structuredClone(project.lighting)};
  await mkdir(directory,{recursive:true});const file=join(directory,item.id+'.light.json'),tmp=file+'.tmp';let handle;
  try{handle=await open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(item,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(tmp,file);const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}}
  catch(e){await handle?.close();await unlink(tmp).catch(()=>{});throw e;}return item;
 }};
}
