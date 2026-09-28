import {Vector3,Color,MeshBasicMaterial,MeshStandardMaterial,Group,AmbientLight,DirectionalLight} from 'three';
import {fingerBones} from '../avatar/capabilities.js';
import {sceneActors} from '../scene/state.js';
import {referenceCamera,referenceProjection,projectedCrop,segmentLegend,normalReferenceLighting} from '../exports/reference-spec.js';
import {blobData} from './hand-reference.js';

function boxPoints(box){return[0,1,2,3,4,5,6,7].map(i=>[i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z]);}
export function prepareNormalLighting({scene,frame}){
 const settings=normalReferenceLighting,camera=referenceProjection(frame),rig=new Group(),originals=[],environment=scene.environment;
 rig.add(new AmbientLight(settings.color,settings.ambient));
 for(const spec of [settings.key,settings.fill]){
  const light=new DirectionalLight(settings.color,spec.intensity);light.position.fromArray(spec.direction).normalize().applyQuaternion(camera.quaternion);rig.add(light,light.target);
 }
 // Keep all meshes, textures and the background intact. The temporary rig is
 // removed synchronously by stage.capture before any queued edit can run.
 try{
  scene.traverse(o=>{if(o.isLight){originals.push([o,o.visible]);o.visible=false;}});
  scene.environment=null;scene.add(rig);
 }catch(e){cleanup();throw e;}
 function cleanup(){scene.remove(rig);scene.environment=environment;for(const [light,visible]of originals)light.visible=visible;}
 return cleanup;
}
export function sceneDepthRange(world,frame){
 const box=world.bounds(),camera=referenceProjection(frame),depths=box.isEmpty()?[]:boxPoints(box).map(p=>-new Vector3(...p).applyMatrix4(camera.matrixWorldInverse).z).filter(Number.isFinite);
 const distance=new Vector3(...frame.position).distanceTo(new Vector3(...frame.target));
 const near=Math.min(99.9,Math.max(.01,Math.min(...(depths.length?depths:[distance-1]))-.08)),far=Math.min(100,Math.max(near+.1,Math.max(...(depths.length?depths:[distance+1]))+.08));return{near,far};
}
export function prepareSceneReference({scene,world,project,style,depth}){
 const originals=[],temporary=[],background=scene.background,owners=new Map();
 for(const entry of segmentLegend(project)){
  const root=entry.source==='pose-support-chair'?world.supportChair?.(entry.actorId):entry.kind==='actor'?world.avatar?.(entry.id)?.root||world.object(entry.id):world.object(entry.id);
  root?.traverse(o=>owners.set(o,entry.color));
 }
 try{
  scene.background=new Color(style==='structure'?'#dfe2de':'#000000');
  scene.traverse(mesh=>{
   if(!mesh.isMesh)return;originals.push([mesh,mesh.material]);
   const converted=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(source=>{
    const Type=style==='structure'?MeshStandardMaterial:MeshBasicMaterial;
    const material=new Type({map:source.map||null,alphaMap:source.alphaMap||null,alphaTest:Math.max(source.alphaTest||0,source.transparent?.35:0),side:source.side,toneMapped:false,visible:source.visible&&!source.isOutline&&!source.userData.referenceHidden});temporary.push(material);
    material.onBeforeCompile=shader=>{
     if(style==='depth'){
      shader.vertexShader='varying float referenceDepth;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nreferenceDepth=-mvPosition.z;');
      shader.fragmentShader='varying float referenceDepth; uniform float referenceNear; uniform float referenceFar;\n'+shader.fragmentShader;shader.uniforms.referenceNear={value:depth.near};shader.uniforms.referenceFar={value:depth.far};
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=vec3(1.0-clamp((referenceDepth-referenceNear)/(referenceFar-referenceNear),0.0,1.0));\n#include <opaque_fragment>').replace('#include <colorspace_fragment>','');
     }else if(style==='segments'){
      shader.uniforms.referenceColor={value:new Color(owners.get(mesh)||'#000000')};shader.fragmentShader='uniform vec3 referenceColor;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=referenceColor;\n#include <opaque_fragment>');
     }else shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=vec3(0.74)*(0.48+0.52*max(dot(normal,normalize(vec3(-0.35,0.6,1.0))),0.0));\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey=()=>style+'-scene-reference-v15';return material;
   });mesh.material=Array.isArray(mesh.material)?converted:converted[0];
  });
 }catch(e){cleanup();throw e;}
 function cleanup(){scene.background=background;for(const [mesh,material]of originals)mesh.material=material;for(const material of temporary)material.dispose();}
 return cleanup;
}
function detailRects(world,project,frame){
 const details=[];
 for(const actor of sceneActors(project).filter(a=>a.visible)){
  const bones=world.avatar(actor.id)?.worldBones();if(!bones)continue;
  for(const part of ['head','leftHand','rightHand']){
   const names=part==='head'?['head','leftEye','rightEye']:[part,...fingerBones(part.replace('Hand',''))],radius=(part==='head'?.125:.018)*actor.transform.scale;
   const points=names.filter(n=>bones[n]).flatMap(n=>{const p=bones[n].position;return[...[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[p[0]+x*radius,p[1]+y*radius,p[2]+z*radius])))];});
   const rect=projectedCrop(points,frame);if(rect&&rect.width>=24&&rect.height>=24)details.push({actorId:actor.id,part,rect});
  }
 }return details;
}
export async function captureSceneReference({project,stage,world,render,assertCurrent,onProgress=()=>{}}){
 const camera=referenceCamera(project.camera),images={},details=[];
 try{
  render(project);await world.ready();assertCurrent();render(project);const depth=sceneDepthRange(world,camera),rects=detailRects(world,project,camera);let normal;
  for(const [index,style]of ['normal','source','structure','depth','segments'].entries()){
   assertCurrent();render(project);onProgress(index+1,5);
   const prepare=style==='source'?undefined:style==='normal'?()=>prepareNormalLighting({scene:stage.scene,frame:camera}):()=>prepareSceneReference({scene:stage.scene,world,project,style,depth});
   const blob=await stage.capture(camera,{prepare});assertCurrent();images[style]=await blobData(blob);if(style==='normal')normal=blob;
  }
  const bitmap=await createImageBitmap(normal);
  try{
   for(const detail of rects){const {rect}=detail,canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;canvas.getContext('2d').drawImage(bitmap,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('局部图生成失败')),'image/png'));details.push({...detail,source:'normal.png',image:await blobData(blob)});assertCurrent();}
  }finally{bitmap.close();}
  assertCurrent();return{camera,depth,images,details};
 }finally{render();}
}
