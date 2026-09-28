import {withHandInteractionScope} from '../scene/hand-interactions.js';
import {createSceneEngine as createEngine} from '../scene/engine.js';
import {actorProject,putActorProject,actorDescriptor,primaryDescriptor,toWorld,toLocal} from '../scene/state.js';
import {makeCommand} from '../pose/state.js';
import {withHandSupportScope} from '../pose/hand-supports.js';
import {withSceneSupportScope} from '../scene/relations.js';
import {withSceneGazeScope} from '../scene/gaze-targets.js';
export function createClient({initial,profile,token,onRender=()=>{},onStatus=()=>{},onResult=()=>{}}){
 let engine=createEngine(initial,profile),owner=false,disposed=false,busy=false,inflight=null;const editorId=crypto.randomUUID(),listeners=new Set(),pending=new Map();
 async function api(path,value,method){const r=await fetch(path,{method:method||(value===undefined?'GET':'POST'),keepalive:path==='/api/editor/release',headers:{'Content-Type':'application/json','x-workbench-token':token},...(value===undefined?{}:{body:JSON.stringify(value)})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.message),{code:data.code});return data;}
 const render=()=>{const p=engine.read();onRender(p);for(const f of listeners)f(p);};
 async function connect(){const state=await api('/api/editor/claim',{editorId,project:engine.read()});owner=state.granted;if(state.project)engine=createEngine(state.project,profile);render();onStatus(owner?'已连接 · 可编辑':'另一个窗口正在编辑 · 当前只读',owner);return owner;}
 async function pump(){if(disposed||busy)return;busy=true;try{
  if(owner){
   if(!inflight){const command=await api('/api/editor/next?editorId='+editorId);if(command){const result=engine.apply(command);inflight={editorId,result,project:engine.read()};}}
   if(inflight){await api('/api/editor/result',inflight);const result=inflight.result;inflight=null;render();onResult(result);}
  }
  for(const[id,waiter]of pending){const r=await api('/api/commands/'+encodeURIComponent(id));if(!['queued','running'].includes(r.status)){pending.delete(id);waiter.resolve(r);}else if(Date.now()>waiter.deadline){pending.delete(id);waiter.reject(Error('页面尚未完成应用；动作仍可在连接恢复后处理'));}}
 }catch(e){onStatus(e.message,false);if(['EDITOR_OFFLINE','CONNECTION_EXPIRED'].includes(e.code)){owner=false;inflight=null;const state=await api('/api/state').catch(()=>null);if(state?.project){engine=createEngine(state.project,profile);render();}}}finally{busy=false;}}
 const timer=setInterval(pump,250),heartbeat=setInterval(async()=>{if(!owner||disposed)return;try{await api('/api/editor/heartbeat',{editorId});}catch(e){owner=false;onStatus(e.message,false);}},2000);
 const send=async command=>{if(!owner)throw Error('当前窗口只有观察权限，请重新连接');await api('/api/commands',command);const result=new Promise((resolve,reject)=>pending.set(command.id,{resolve,reject,deadline:Date.now()+30000}));pump();return result;};
 return{api,connect,read:()=>engine.read(),preview:c=>engine.preview(c),isOwner:()=>owner,send,submit(operations,scope,source='slider',overwriteManual=scope.bones){const p=engine.read();return send(withHandSupportScope(makeCommand(p,operations,scope,source,overwriteManual),p,profile,{overwriteLinkedManual:true}));},subscribe(f){listeners.add(f);return()=>listeners.delete(f);},refresh:render,async dispose(){disposed=true;clearInterval(timer);clearInterval(heartbeat);if(owner)await api('/api/editor/release',{editorId}).catch(()=>{});for(const w of pending.values())w.reject(Error('工作台已关闭'));pending.clear();}};
}


// This view is transient. The transport and saved project always use the complete scene.
export function actorClient(client,actorId,profile){
 const view=p=>({...actorProject(p,actorId),_actorId:actorId,_sceneProject:p});
 const read=()=>view(client.read());
 const scoped=c=>withHandInteractionScope(withSceneSupportScope(withSceneGazeScope({...c,actorId:c.actorId||actorId},client.read(),profile),client.read(),profile),client.read(),profile);
 const send=c=>client.send(scoped(c));
 return{...client,read,actorId,exists:()=>!!actorDescriptor(client.read(),actorId),isOwner:()=>client.isOwner(),canPose:()=>client.isOwner()&&!actorDescriptor(client.read(),actorId)?.locked,
  api:(path,value,method)=>client.api(path,path==='/api/poses/save'?{...value,actorId}:value,method),
  preview(c){const result=client.preview(scoped(c));return{...result,project:actorDescriptor(result.project,actorId)?view(result.project):{...actorProject(result.project),_actorId:primaryDescriptor(result.project).id,_sceneProject:result.project}};},
  send,submit(operations,scope,source='slider',overwriteManual=scope.bones){const p=read();return send(withHandSupportScope(makeCommand(p,operations,scope,source,overwriteManual),p,profile,{overwriteLinkedManual:true}));},
  subscribe(fn){return client.subscribe(p=>{if(actorDescriptor(p,actorId))fn(view(p));});},
  toWorld:point=>toWorld(client.read(),actorId,point),toLocal:point=>toLocal(client.read(),actorId,point),
 };
}
export function sceneFromView(view){return view._sceneProject?putActorProject(structuredClone(view._sceneProject),view._actorId,view):view;}
