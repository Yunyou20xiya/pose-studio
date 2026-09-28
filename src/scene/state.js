import {Vector3,Quaternion} from 'three';
import {objectSpec} from './catalog.js';
const copy=v=>structuredClone(v),identity=()=>({position:[0,0,0],yaw:0,scale:1});
export function primaryDescriptor(p){return p.scene?.primary||{id:'primary',name:'角色 1',visible:true,locked:false,transform:identity()};}
export function sceneActors(p){return[primaryDescriptor(p),...(p.scene?.actors||[])];}
export function actorDescriptor(p,id){return sceneActors(p).find(a=>a.id===id);}
export function actorProject(p,id=primaryDescriptor(p).id){
 const a=actorDescriptor(p,id);if(!a)throw Error('这个角色已不在场景中');
 const {scene,_actorId,_sceneProject,...base}=p;
 return copy({...base,...(id===primaryDescriptor(p).id?{}:a.pose)});
}
export function ensureScene(p){if(!p.scene)p.scene={version:1,floorY:p.stage.floorY,primary:primaryDescriptor(p),actors:[],objects:[]};return p.scene;}
export function putActorProject(p,id,view){
 const pose={snapshot:copy(view.snapshot),layers:copy(view.layers),stage:copy(view.stage)};
 if(id===primaryDescriptor(p).id)Object.assign(p,pose);else{const a=actorDescriptor(p,id);if(!a)throw Error('这个角色已不在场景中');a.pose=pose;}
 p.camera=copy(view.camera);p.lighting=copy(view.lighting);return p;
}
export function toWorld(p,id,point){const t=actorDescriptor(p,id)?.transform||identity();return new Vector3().fromArray(point).multiplyScalar(t.scale).applyAxisAngle(new Vector3(0,1,0),t.yaw*Math.PI/180).add(new Vector3().fromArray(t.position)).toArray();}
export function toLocal(p,id,point){const t=actorDescriptor(p,id)?.transform||identity();return new Vector3().fromArray(point).sub(new Vector3().fromArray(t.position)).applyAxisAngle(new Vector3(0,1,0),-t.yaw*Math.PI/180).divideScalar(t.scale).toArray();}
export function applyTransform(group,t){group.position.fromArray(t.position);group.quaternion.setFromAxisAngle(new Vector3(0,1,0),t.yaw*Math.PI/180);Array.isArray(t.scale)?group.scale.fromArray(t.scale):group.scale.setScalar(t.scale);group.updateMatrixWorld(true);}
export function sceneStructureIssues(p){
 const s=p.scene;if(s===undefined)return[];
 const errors=[],bad=m=>errors.push({code:'INVALID_SCENE',message:m,bones:[],severity:'error'}),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000),keys=(v,list)=>obj(v)&&Object.keys(v).every(k=>list.includes(k));
 if(!keys(s,['version','floorY','primary','actors','objects','relations','gazeTargets','groups','handInteractions'])||s.version!==1||!Number.isFinite(s.floorY)||Math.abs(s.floorY)>100||!Array.isArray(s.actors)||!Array.isArray(s.objects)){bad('场景结构无效');return errors;}
 if(s.actors.length>5||s.objects.length>80)bad('场景最多放置 6 名角色、80 件物品');
 const ids=new Set();
 for(const [a,isActor,isPrimary]of [[s.primary,true,true],...s.actors.map(a=>[a,true,false]),...s.objects.map(a=>[a,false,false])]){
  if(!obj(a)){bad('场景对象无效');continue;}
  if(!keys(a,['id','name','visible','locked','transform',...(isActor&&!isPrimary?['pose']:[]),...(!isActor?['type','color']:[])]))bad('场景对象含有未支持字段');
  if(typeof a.id!=='string'||!/^[-\w]{1,100}$/.test(a.id)||ids.has(a.id))bad('场景对象标识无效或重复');ids.add(a.id);
  if(typeof a.name!=='string'||!a.name.trim()||a.name.length>60||typeof a.visible!=='boolean'||typeof a.locked!=='boolean')bad('场景对象名称或状态无效');
  const t=a.transform;
  if(!keys(t,['position','yaw','scale'])||!vec(t.position)||!Number.isFinite(t.yaw)||Math.abs(t.yaw)>3600||(isActor?!(Number.isFinite(t.scale)&&t.scale>=.25&&t.scale<=3):!(vec(t.scale)&&t.scale.every(n=>n>=.1&&n<=10))))bad('对象位置、转向或尺寸无效');
  if(isActor&&!isPrimary&&(!keys(a.pose,['snapshot','layers','stage'])||!['snapshot','layers','stage'].every(k=>Object.hasOwn(a.pose,k))))bad('角色姿态无效');
  if(!isActor&&(!objectSpec(a.type)||!/^#[\da-f]{6}$/i.test(a.color)))bad('物品类型或颜色无效');
 }
 return errors;
}
