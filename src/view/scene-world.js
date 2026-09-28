import * as THREE from 'three';
import {loadAvatar} from '../avatar/adapter.js';
import {sceneActors,actorProject,applyTransform} from '../scene/state.js';
import {createObjectMesh,disposeObject,updateSupportChair,updateObjectColor} from '../scene/geometry.js';
import {avatarBounds} from './framing.js';
export function createSceneWorld({stage,bytes,onReady=()=>{},onError=()=>{}}){
 const root=new THREE.Group(),actors=new Map(),objects=new Map(),pending=new Map();stage.scene.add(root);let project=null,disposed=false,loadError=null;
 function render(p){
  if(disposed)return;project=p;const descriptors=sceneActors(p),ids=new Set(descriptors.map(a=>a.id));
  for(const [id,entry]of actors)if(!ids.has(id)){entry.avatar.dispose();disposeObject(entry.chair);entry.group.removeFromParent();actors.delete(id);}
  for(const a of descriptors){
   if(!actors.has(a.id)){
    if(!pending.has(a.id)){
     const task=loadAvatar(bytes.slice(0)).then(avatar=>{
      if(disposed||!sceneActors(project).some(d=>d.id===a.id)){avatar.dispose();return;}
      const group=new THREE.Group(),chair=createObjectMesh('chair');group.userData.actorPlacement=true;group.userData.objectId=a.id;group.add(avatar.root,chair);root.add(group);actors.set(a.id,{avatar,group,chair});render(project);onReady(a.id);
     }).catch(e=>{loadError=e;onError(e);}).finally(()=>pending.delete(a.id));pending.set(a.id,task);
    }continue;
   }
   const entry=actors.get(a.id),pose=actorProject(p,a.id);entry.group.visible=a.visible;applyTransform(entry.group,a.transform);entry.avatar.render(pose);entry.chair.visible=pose.snapshot.contacts.some(c=>c.objectId==='chair');updateSupportChair(entry.chair,pose.stage.chair);
  }
  const props=p.scene?.objects||[];for(const[id,g]of objects)if(!props.some(x=>x.id===id)){disposeObject(g);objects.delete(id);}
  for(const item of props){let g=objects.get(item.id);if(!g){g=createObjectMesh(item.type,item.color);g.userData.objectId=item.id;g.userData.color=item.color;objects.set(item.id,g);root.add(g);}g.visible=item.visible;applyTransform(g,item.transform);if(g.userData.color!==item.color){updateObjectColor(g,item.color);g.userData.color=item.color;}}
  root.updateMatrixWorld(true);
 }
 const bounds=id=>{
  const box=new THREE.Box3();for(const[key,e]of actors)if(e.group.visible&&(!id||key===id)){box.union(avatarBounds(e.avatar.root));if(e.chair.visible)box.union(new THREE.Box3().setFromObject(e.chair));}
  for(const[key,g]of objects)if(g.visible&&(!id||key===id))box.union(new THREE.Box3().setFromObject(g));return box;
 };
 stage.setSceneBounds(()=>bounds());
 return{root,render,bounds,object:id=>actors.get(id)?.group||objects.get(id),avatar:id=>actors.get(id)?.avatar,supportChair:id=>actors.get(id)?.chair,async ready(){await Promise.all([...pending.values()]);if(loadError)throw loadError;},dispose(){disposed=true;for(const e of actors.values()){e.avatar.dispose();disposeObject(e.chair);}for(const g of objects.values())disposeObject(g);root.removeFromParent();}};
}
