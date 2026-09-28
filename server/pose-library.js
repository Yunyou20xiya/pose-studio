import {readFile,readdir,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {syncDirectory} from './directory-sync.js';
import {capturePose,validateSavedPose} from '../src/assets/pose-library.js';
const safeId=id=>{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw Error('收藏标识无效');return id;};
export function pngBytes(data){
 if(typeof data!=='string'||!data.startsWith('data:image/png;base64,')||data.length>3*1024*1024)throw Error('预览图片无效或过大');
 const bytes=Buffer.from(data.slice(22),'base64');
 if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||[16,20].some(n=>bytes.readUInt32BE(n)<1||bytes.readUInt32BE(n)>2048))throw Error('预览不是有效尺寸的 PNG');
 return bytes;
}
export function createPoseStore({directory,profile,refs}){
 async function get(id){const item=JSON.parse(await readFile(join(directory,safeId(id)+'.pose.json'),'utf8'));validateSavedPose(item,profile,refs);pngBytes(item.thumbnail);return item;}
 return{get,async list(){await mkdir(directory,{recursive:true});const result=[];for(const name of await readdir(directory)){if(!name.endsWith('.pose.json'))continue;try{const item=await get(name.slice(0,-10));result.push({id:item.id,name:item.name,part:item.part,createdAt:item.createdAt,model:item.model,profile:item.profile,sources:item.sources});}catch(e){result.push({id:name.slice(0,-10),name:'暂不能使用的收藏',unavailable:true,reason:e.message});}}return result.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));},
 async save({project,expectedRevision,name,part,thumbnail}){
  if(project.revision!==expectedRevision)throw Error('姿势已改变，请用当前姿势重新收藏');
  const item=capturePose(project,{name,part},profile);validateSavedPose(item,profile,refs);pngBytes(thumbnail);item.thumbnail=thumbnail;
  await mkdir(directory,{recursive:true});const file=join(directory,item.id+'.pose.json'),temporary=file+'.tmp';let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(item,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(temporary,file);await syncDirectory(directory);}
  catch(e){await handle?.close();await unlink(temporary).catch(()=>{});throw e;}return item;
 }};
}
