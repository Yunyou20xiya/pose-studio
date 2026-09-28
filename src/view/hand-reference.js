import {Box3,Vector3,Float32BufferAttribute,MeshBasicMaterial,MeshStandardMaterial,Color} from 'three';
import {fingerBones} from '../avatar/capabilities.js';
import {fitView} from './framing.js';

export function handBounds(world,relation,{forearms=false,arms=false}={}){
 const bounds=new Box3();
 for(const h of relation.hands){const avatar=world.avatar(h.actorId);if(!avatar)continue;const bones=avatar.worldBones(),side=h.hand.replace('Hand','');
  for(const name of [h.hand,...fingerBones(side),...((forearms||arms)?[side+'LowerArm']:[]),...(arms?[side+'UpperArm']:[])])if(bones[name])bounds.expandByPoint(new Vector3().fromArray(bones[name].position));
 }
 return bounds.expandByScalar(.035);
}
export function handFrame(world,relation,direction=new Vector3(.4,.2,1),aspect=1.2){return{...fitView(handBounds(world,relation),aspect,direction,32),width:1200,height:Math.round(1200/aspect)};}
export function prepareHandReference({scene,world,relation,style,frame,isolate=false}){
 const changes=[],temporary=[],geometries=[],background=scene.background;
 const near=Math.max(.01,new Vector3(...frame.position).distanceTo(new Vector3(...frame.target))-.3),far=near+.6;
 try{
  const owners=new Map();relation.hands.forEach((h,i)=>{const avatar=world.avatar(h.actorId);if(!avatar)return;const side=h.hand.replace('Hand','');for(const name of [h.hand,...(isolate||style==='mask'?[]:[side+'LowerArm']),...fingerBones(side)]){const bone=avatar.vrm.humanoid.getRawBoneNode(name);if(bone)owners.set(bone,i);}});
  scene.background=new Color(style==='inspection'?'#e4e9e2':'#000000');
  scene.traverse(mesh=>{
   if(!mesh.isMesh)return;
   changes.push({mesh,material:mesh.material,geometry:mesh.geometry});
   const original=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   if(style==='ownership'||style==='mask'||isolate){
    const geometry=mesh.geometry.clone(),count=geometry.attributes.position.count,weights=new Float32Array(count*2),indices=geometry.attributes.skinIndex,skinWeights=geometry.attributes.skinWeight;
    if(mesh.isSkinnedMesh&&indices&&skinWeights)for(let i=0;i<count;i++)for(let j=0;j<4;j++){const owner=owners.get(mesh.skeleton.bones[indices.getComponent(i,j)]);if(owner!==undefined)weights[i*2+owner]+=skinWeights.getComponent(i,j);}
    geometry.setAttribute('handOwnership',new Float32BufferAttribute(weights,2));mesh.geometry=geometry;geometries.push(geometry);
   }
   const mats=original.map(m=>{
    const material=style==='inspection'?new MeshStandardMaterial({color:'#d7bba4',roughness:.85,side:m.side}):new MeshBasicMaterial({map:m.map||null,alphaMap:m.alphaMap||null,alphaTest:Math.max(m.alphaTest||0,m.transparent?.35:0),side:m.side,toneMapped:false});temporary.push(material);
    material.onBeforeCompile=shader=>{
     if(style==='ownership'||style==='mask'||isolate){
      shader.vertexShader='attribute vec2 handOwnership; varying vec2 referenceOwner;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nreferenceOwner = handOwnership;');
      shader.fragmentShader='varying vec2 referenceOwner;\n'+shader.fragmentShader;
      if(isolate)shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(max(referenceOwner.x,referenceOwner.y)<0.48) discard;');
      if(style==='ownership')shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = max(referenceOwner.x,referenceOwner.y) < 0.45 ? vec3(0.0) : referenceOwner.x > referenceOwner.y ? vec3(1.0,0.25,0.03) : vec3(0.03,0.4,1.0);\n#include <opaque_fragment>');
      if(style==='mask')shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = vec3(max(referenceOwner.x,referenceOwner.y) < 0.45 ? 0.0 : 1.0);\n#include <opaque_fragment>');
     }if(style==='depth'){
      shader.vertexShader='varying float referenceDepth;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nreferenceDepth = -mvPosition.z;');
      shader.fragmentShader='varying float referenceDepth; uniform float referenceNear; uniform float referenceFar;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','');
      shader.uniforms.referenceNear={value:near};shader.uniforms.referenceFar={value:far};
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = vec3(1.0 - clamp((referenceDepth-referenceNear)/(referenceFar-referenceNear),0.0,1.0));\n#include <opaque_fragment>');
     }
    };
    material.customProgramCacheKey=()=>style+'-'+isolate+'-hands-v11';return material;
   });mesh.material=Array.isArray(mesh.material)?mats:mats[0];
  });
 }catch(e){cleanup();throw e;}
 const prepared=changes.map(({mesh})=>({mesh,material:mesh.material,geometry:mesh.geometry})),preparedBackground=scene.background;
 function restore(){scene.background=background;for(const {mesh,material,geometry}of changes){mesh.material=material;mesh.geometry=geometry;}}
 function cleanup(){restore();for(const m of temporary)m.dispose();for(const g of geometries)g.dispose();}
 cleanup.restore=restore;cleanup.apply=()=>{scene.background=preparedBackground;for(const {mesh,material,geometry}of prepared){mesh.material=material;mesh.geometry=geometry;}};
 return cleanup;
}
export async function captureHandReference({stage,world,relation,style='beauty',frame=handFrame(world,relation),isolate=false}){
 return stage.capture(frame,{prepare:style==='beauty'&&!isolate?undefined:()=>prepareHandReference({scene:stage.scene,world,relation,style:style==='beauty'?'inspection':style,frame,isolate})});
}
export const blobData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
