import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { inspectCapabilities } from './capabilities.js';
import {createLightingReference} from './lighting-reference.js';
import {enableProjectedLight} from './projected-light.js';
export function readLocalGaze(root,target){const point=target.position.clone();if(root.parent?.userData.actorPlacement){root.parent.updateWorldMatrix(true,false);root.parent.worldToLocal(point);}return point.toArray();}
export async function loadAvatar(bytes){
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes,'');const vrm=gltf.userData.vrm;
  if(!vrm)throw Error('文件没有可用的 VRM 角色');
  VRMUtils.rotateVRM0(vrm);
  const root=new THREE.Group();root.add(vrm.scene);
  vrm.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  const materials=new Set();vrm.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});materials.forEach(enableProjectedLight);
  const lightingReference=createLightingReference(vrm.scene);
  const target=new THREE.Object3D();target.position.set(0,1.5,4);
  if(vrm.lookAt)vrm.lookAt.target=target;
  vrm.humanoid.resetNormalizedPose();vrm.update(0);root.updateMatrixWorld(true);
  const entries=Object.values(VRMHumanBoneName).map(name=>[name,vrm.humanoid.getNormalizedBoneNode(name)]).filter(x=>x[1]);
  const names=new Map(entries.map(([n,node])=>[node,n]));
  const expressions=vrm.expressionManager.expressions.map(e=>e.expressionName);
  function inspect(){return{bones:entries.map(x=>x[0]),expressions,gazeAvailable:!!vrm.lookAt};}
  function describeRig(){
    root.updateMatrixWorld(true);const bones={};
    const basisNode=vrm.humanoid.getNormalizedBoneNode('hips').parent;
    const basisRotation=basisNode.getWorldQuaternion(new THREE.Quaternion()),basisPosition=basisNode.getWorldPosition(new THREE.Vector3());
    for(const[name,node]of entries){
      let parent=node.parent;while(parent&&!names.has(parent))parent=parent.parent;
      const pos=node.getWorldPosition(new THREE.Vector3()),rot=node.getWorldQuaternion(new THREE.Quaternion());
      if(parent){const pq=parent.getWorldQuaternion(new THREE.Quaternion());pos.sub(parent.getWorldPosition(new THREE.Vector3())).applyQuaternion(pq.clone().invert());rot.premultiply(pq.invert());}
      else{pos.sub(basisPosition).applyQuaternion(basisRotation.clone().invert());rot.premultiply(basisRotation.clone().invert());}
      bones[name]={parent:parent?names.get(parent):null,position:pos.toArray(),restRotation:rot.toArray(),editable:!name.endsWith('Eye')};
    }
    const box=new THREE.Box3().setFromObject(vrm.scene);
    return{version:1,bones,basisRotation:basisRotation.toArray(),basisPosition:basisPosition.toArray(),height:box.max.y-box.min.y,bounds:{min:box.min.toArray(),max:box.max.toArray()},capabilities:{...inspect(),report:inspectCapabilities(inspect())}};
  }
  function readSnapshot(){return{rotations:Object.fromEntries(Object.entries(vrm.humanoid.getNormalizedPose()).map(([n,p])=>[n,p.rotation||[0,0,0,1]])),rootPosition:root.position.toArray(),rootRotation:root.quaternion.toArray(),expressions:Object.fromEntries(expressions.map(n=>[n,vrm.expressionManager.getValue(n)||0])),gaze:{target:readLocalGaze(root,target),follow:0,mode:'point'},locks:[],contacts:[]};}
  function preview(s){
    root.position.fromArray(s.rootPosition||[0,0,0]);root.quaternion.fromArray(s.rootRotation||[0,0,0,1]);
    vrm.humanoid.resetNormalizedPose();vrm.humanoid.setNormalizedPose(Object.fromEntries(Object.entries(s.rotations).map(([n,q])=>[n,{rotation:q}])));
    for(const name of expressions)vrm.expressionManager.setValue(name,s.expressions?.[name]||0);
    target.position.fromArray(s.gaze?.target||[0,1.5,4]);
    if(root.parent?.userData.actorPlacement){root.parent.updateWorldMatrix(true,false);root.parent.localToWorld(target.position);}
    root.updateWorldMatrix(true,true);target.updateMatrixWorld(true);
    vrm.update(0);root.updateMatrixWorld(true);
  }
  return{root,vrm,inspect,describeRig,readSnapshot,preview,worldBones(){root.updateMatrixWorld(true);return Object.fromEntries(entries.map(([name,node])=>[name,{position:node.getWorldPosition(new THREE.Vector3()).toArray(),rotation:node.getWorldQuaternion(new THREE.Quaternion()).toArray()}]));},render(project){preview(project.snapshot);lightingReference.setMode(project.lighting.materialMode||'original');},dispose(){lightingReference.dispose();VRMUtils.deepDispose(root);},gltf};
}
