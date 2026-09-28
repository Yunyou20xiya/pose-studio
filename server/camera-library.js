import {readFile,readdir,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {syncDirectory} from './directory-sync.js';
import {captureCamera} from '../src/camera/bookmarks.js';
const safeId=id=>{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw Error('机位标识无效');return id;};
export async function saveCurrentCamera({store,readProject,verifyProject,request}){
 const project=readProject();if(!project)throw Error('尚无可收藏的机位');
 await verifyProject(project);
 // Validation reads source files asynchronously; capture again at the save boundary.
 return store.save({...request,project:readProject()});
}
export function createCameraStore({directory}){
 async function get(id){
  const item=JSON.parse(await readFile(join(directory,safeId(id)+'.camera.json'),'utf8'));
  if(item.schemaVersion!==1||item.id!==id||typeof item.name!=='string'||!item.name.trim()||item.name.length>60||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw Error('机位收藏格式无效');
  return{schemaVersion:1,id:item.id,name:item.name,createdAt:item.createdAt,camera:captureCamera(item.camera)};
 }
 return{get,async list(){
  await mkdir(directory,{recursive:true});const rows=[];
  for(const file of await readdir(directory)){if(!file.endsWith('.camera.json'))continue;const id=file.slice(0,-12);try{const item=await get(id);rows.push({id:item.id,name:item.name,createdAt:item.createdAt,width:item.camera.width,height:item.camera.height});}catch(e){rows.push({id,name:'暂不能使用的机位',unavailable:true,reason:e.message});}}
  return rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
 },async save({project,projectId,expectedRevision,name}){
  if(!project||project.projectId!==projectId||project.revision!==expectedRevision)throw Error('现场已改变，请用当前取景重新收藏');
  if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw Error('请填写 1–60 字的机位名称');
  const item={schemaVersion:1,id:crypto.randomUUID(),name:name.trim(),createdAt:new Date().toISOString(),camera:captureCamera(project.camera)};
  await mkdir(directory,{recursive:true});const file=join(directory,item.id+'.camera.json'),tmp=file+'.tmp';let handle;
  try{handle=await open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(item,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(tmp,file);await syncDirectory(directory);}
  catch(e){await handle?.close();await unlink(tmp).catch(()=>{});throw e;}return item;
 }};
}
