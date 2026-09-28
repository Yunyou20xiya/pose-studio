import {readFile,mkdir,open,rename,unlink,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {syncDirectory} from './directory-sync.js';
import {clone} from '../src/pose/state.js';
import {checkScene} from '../src/scene/engine.js';
import {verifyReferences} from './projects.js';
import {pngBytes} from './pose-library.js';
import {shotCommand,shotSignature} from '../src/shots/state.js';

const validId=value=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,100}$/.test(value);
function id(value){if(!validId(value))throw Error('镜头或项目标识无效');return value;}
function text(value,max,label){if(typeof value!=='string'||value.trim().length>max)throw Error(label+'过长或无效');return value.trim();}
function image(value){if(value!==null&&value!==undefined)pngBytes(value);return value||null;}
const all=board=>[...board.shots,...board.recoveries];

// A board is separate from the live scene: saving and ordering cards never apply a pose.
export function createShotStore({directory,profile,refs,readProject,verifyProject=async()=>{}}){
 const writes=new Map(),file=projectId=>join(directory,id(projectId)+'.shots.json');
 function validateProject(project,projectId){
  if(project?.projectId!==projectId)throw Error('镜头与当前项目不一致');
  const issues=[...verifyReferences(project,refs),...checkScene(project,profile)].filter(i=>i.severity==='error');
  if(issues.length)throw Error(issues.map(i=>i.message).join('；'));
 }
 function validateItem(item,projectId){
  if(!item||!validId(item.id)||!text(item.name,80,'镜头名称')||typeof item.note!=='string'||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt)))throw Error('镜头卡片记录无效');
  text(item.note,500,'拍摄意图');image(item.thumbnail);validateProject(item.project,projectId);return item;
 }
 async function read(projectId){
  let board;try{board=JSON.parse(await readFile(file(projectId),'utf8'));}catch(e){if(e.code==='ENOENT')return{schemaVersion:1,projectId,revision:0,shots:[],recoveries:[]};throw e;}
  if(board.schemaVersion!==1||board.projectId!==projectId||!Number.isSafeInteger(board.revision)||board.revision<0||!Array.isArray(board.shots)||!Array.isArray(board.recoveries)||all(board).length>640||new Set(all(board).map(s=>s.id)).size!==all(board).length)throw Error('镜头卡片文件格式无效，请保留原文件');
  all(board).forEach(item=>validateItem(item,projectId));return board;
 }
 async function write(board){
  if(board.shots.length>128||board.recoveries.length>512)throw Error('镜头记录已满，请先将现场保存为项目');
  await mkdir(directory,{recursive:true});const target=file(board.projectId),temporary=target+'.'+crypto.randomUUID()+'.tmp';let handle;
  try{
   handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(board)+'\n');await handle.sync();await handle.close();handle=null;
   try{await copyFile(target,target+'.bak');}catch(e){if(e.code!=='ENOENT')throw e;}
   await rename(temporary,target);await syncDirectory(directory);
  }catch(e){await handle?.close();await unlink(temporary).catch(()=>{});throw e;}
 }
 function current(request){
  const p=readProject();if(!p||p.projectId!==request.projectId||p.revision!==request.expectedRevision)throw Error('现场已改变，请基于当前画面重试');return p;
 }
 async function source(request){
  const p=current(request);await verifyProject(p);const latest=current(request);validateProject(latest,request.projectId);return clone(latest);
 }
 function item(project,{name,note='',thumbnail=null}){
  const label=text(name,80,'镜头名称');if(!label)throw Error('请填写镜头名称');
  const now=new Date().toISOString();return{id:crypto.randomUUID(),name:label,note:text(note,500,'拍摄意图'),createdAt:now,updatedAt:now,project:clone(project),thumbnail:image(thumbnail)};
 }
 function recover(board,project,name,thumbnail=null,note=''){
  const signature=shotSignature(project),existing=all(board).find(s=>shotSignature(s.project)===signature);if(existing)return existing;
  const saved=item(project,{name:name.slice(0,80),note,thumbnail});board.recoveries.push(saved);return saved;
 }
 function mutate(request,fn){
  const projectId=id(request.projectId),previous=writes.get(projectId)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   const board=await read(projectId);if(board.revision!==request.expectedBoardRevision)throw Error('镜头卡片已改变，请刷新后重试');
   const result=await fn(board);if(result.changed!==false){board.revision++;await write(board);}return{...result.value,boardRevision:board.revision};
  });writes.set(projectId,task);task.finally(()=>{if(writes.get(projectId)===task)writes.delete(projectId);}).catch(()=>{});return task;
 }
 const find=(board,shotId)=>{id(shotId);const value=all(board).find(s=>s.id===shotId);if(!value)throw Error('这个镜头已经不存在');return value;};
 function summary(s,currentSignature){return{id:s.id,name:s.name,note:s.note,createdAt:s.createdAt,updatedAt:s.updatedAt,actors:1+(s.project.scene?.actors.length||0),objects:s.project.scene?.objects.length||0,width:s.project.camera.width,height:s.project.camera.height,matchesCurrent:currentSignature===shotSignature(s.project),thumbnail:s.thumbnail?`/api/shot-images/${encodeURIComponent(s.project.projectId)}/${s.id}.png?v=${encodeURIComponent(s.updatedAt)}`:null};}
 return{
  async list(projectId){
   const board=await read(projectId),p=readProject(),signature=p?.projectId===projectId?shotSignature(p):null;
   return{projectId,revision:board.revision,sceneRevision:signature===null?null:p.revision,shots:board.shots.map(s=>summary(s,signature)),recoveries:board.recoveries.map(s=>summary(s,signature)).reverse()};
  },
  async get({projectId,id:shotId}){return clone(find(await read(projectId),shotId));},
  save(request){return mutate(request,async board=>{
   const project=await source(request),saved=item(project,request);
   if(request.id){
    const index=board.shots.findIndex(s=>s.id===request.id);if(index<0)throw Error('请先选择可更新的镜头卡片');
    const old=board.shots[index];saved.id=old.id;saved.createdAt=old.createdAt;
    board.shots[index]=saved;
    // The old version remains available from the same scene recovery list.
    recover(board,old.project,old.name+' · 更新前',old.thumbnail,old.note);
   }else board.shots.push(saved);
   return{value:{id:saved.id,name:saved.name}};
  });},
  import(request){return mutate(request,async board=>{
   await source(request);
   if(!Array.isArray(request.shots)||!request.shots.length||request.shots.length>24)throw Error('每次请提供 1–24 张镜头卡片');
   const additions=request.shots.map(s=>{validateProject(s.project,request.projectId);return item(s.project,s);});
   current(request);board.shots.push(...additions);return{value:{ids:additions.map(s=>s.id)}};
  });},
  prepareOpen(request){return mutate(request,async board=>{
   const selected=find(board,request.id),project=await source(request),command=shotCommand(project,selected.project),before=board.recoveries.length;
   const saved=recover(board,project,'切换前现场',null,'打开“'+selected.name+'”之前的完整现场');
   return{changed:before!==board.recoveries.length,value:{command,name:selected.name,recoveryId:saved.id,preserved:before!==board.recoveries.length}};
  });},
  reorder(request){return mutate(request,async board=>{
   current(request);const ids=request.ids;
   if(!Array.isArray(ids)||ids.length!==board.shots.length||new Set(ids).size!==ids.length||ids.some(key=>!board.shots.some(s=>s.id===key)))throw Error('镜头顺序无效，请完整保留每张卡片');
   board.shots=ids.map(key=>board.shots.find(s=>s.id===key));return{value:{}};
  });},
  setThumbnail(request){return mutate(request,async board=>{
   const selected=find(board,request.id),project=current(request);
   if(shotSignature(project)!==shotSignature(selected.project))throw Error('当前画面与镜头卡片不同，不能替换预览图');
   if(!request.thumbnail)throw Error('缺少预览图');selected.thumbnail=image(request.thumbnail);selected.updatedAt=new Date().toISOString();return{value:{id:selected.id}};
  });},
 };
}
