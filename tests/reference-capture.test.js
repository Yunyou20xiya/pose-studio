import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial,Color,Box3,Vector3,SpotLight,DirectionalLight,Texture} from 'three';
import * as reference from '../src/view/reference-capture.js';
import {prepareSceneReference,sceneDepthRange,captureSceneReference} from '../src/view/reference-capture.js';
import {fresh} from './scene-fixture.js';

test('normal lighting preserves colors, geometry and background and restores every original light',()=>{
 const scene=new Scene(),material=new MeshStandardMaterial({color:'#ae6677',map:new Texture()}),mesh=new Mesh(new BoxGeometry(),material),key=new SpotLight('#ff0011',4),disabled=new DirectionalLight();disabled.visible=false;scene.add(mesh,key,disabled);
 const background=new Color('#060713'),environment=new Texture();scene.background=background;scene.environment=environment;
 const before=scene.children.slice(),matrix=mesh.matrix.clone(),frame={position:[0,0,2],target:[0,0,0],up:[1,0,0],fov:35,width:640,height:480};
 const cleanup=reference.prepareNormalLighting({scene,frame});
 assert.equal(key.visible,false);assert.equal(disabled.visible,false);assert.equal(mesh.material,material);assert.equal(material.color.getHexString(),'ae6677');assert.ok(material.map);assert.deepEqual(mesh.matrix,matrix);assert.equal(scene.background,background);assert.equal(scene.environment,null);
 const lights=[];scene.traverseVisible(o=>{if(o.isLight)lights.push(o);});assert.ok(lights.length>=2);assert.ok(lights.every(o=>o.color.getHexString()==='ffffff'));assert.ok(lights.some(o=>o.isDirectionalLight&&o.position.x>0&&o.position.z>0),'neutral light follows rolled screen up');
 cleanup();assert.deepEqual(scene.children,before);assert.equal(key.visible,true);assert.equal(key.intensity,4);assert.equal(key.color.getHexString(),'ff0011');assert.equal(disabled.visible,false);assert.equal(scene.background,background);assert.equal(scene.environment,environment);assert.equal(mesh.material,material);
 material.map.dispose();environment.dispose();material.dispose();mesh.geometry.dispose();
});

test('failed normal-light preparation removes partial lights and restores the original rig',()=>{
 const scene=new Scene(),light=new SpotLight(),environment=new Texture();scene.add(light);scene.environment=environment;const add=scene.add;
 scene.add=function(...items){add.call(this,items[0]);throw Error('lighting setup failed');};
 assert.throws(()=>reference.prepareNormalLighting({scene,frame:fresh().read().camera}),/lighting setup failed/);
 assert.equal(light.visible,true);assert.equal(scene.environment,environment);assert.deepEqual(scene.children,[light]);environment.dispose();
});

test('paired capture uses one camera and crops normal-light pixels, leaving artistic lighting untouched',async t=>{
 const saved={FileReader:globalThis.FileReader,createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};t.after(()=>Object.assign(globalThis,saved));
 globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
 let bitmapSource,closed=false;globalThis.createImageBitmap=async blob=>{bitmapSource=await blob.text();return{close(){closed=true;}};};
 const crops=[];globalThis.document={createElement:()=>({getContext:()=>({drawImage(...args){crops.push(args.slice(1));}}),toBlob:callback=>callback(new Blob(['crop']))})};
 const project=fresh().read(),before=structuredClone(project),scene=new Scene(),light=new SpotLight('#ee1122',4);scene.add(light);const frames=[],lightStates=[],world={ready:async()=>{},bounds:()=>new Box3(),avatar:()=>({worldBones:()=>({head:{position:[0,1,0]}})}),object:()=>null};
 let last;const stage={scene,async capture(frame,{prepare}){const cleanup=prepare?.();try{frames.push(structuredClone(frame));lightStates.push(light.visible);return new Blob(['pass-'+frames.length]);}finally{cleanup?.();}}};
 const result=await captureSceneReference({project,stage,world,render:p=>{last=p;},assertCurrent:()=>{}});
 assert.deepEqual(Object.keys(result.images).sort(),['depth','normal','segments','source','structure']);assert.equal(frames.length,5);assert.ok(frames.every(frame=>JSON.stringify(frame)===JSON.stringify(frames[0])));
 assert.equal(result.images.normal,'data:image/png;base64,'+Buffer.from(bitmapSource).toString('base64'));assert.equal(lightStates[Object.keys(result.images).indexOf('normal')],false);assert.equal(lightStates[Object.keys(result.images).indexOf('source')],true);
 assert.ok(crops.length>0);assert.ok(result.details.every(d=>d.source==='normal.png'));assert.equal(closed,true);assert.deepEqual(project,before);assert.equal(light.visible,true);assert.equal(light.intensity,4);assert.equal(last,undefined);
});

test('reference passes restore original materials and background, including a failed preparation',()=>{
 const scene=new Scene(),group=new Group(),material=new MeshStandardMaterial({color:'#ab7788'}),mesh=new Mesh(new BoxGeometry(),material),background=new Color('#adbcdd'),world={object:()=>group};group.add(mesh);scene.add(group);scene.background=background;
 for(const style of ['structure','depth','segments']){
  const cleanup=prepareSceneReference({scene,world,project:fresh().read(),style,depth:{near:1,far:3}});assert.notEqual(mesh.material,material);assert.notEqual(scene.background,background);
  let disposed=false;mesh.material.addEventListener('dispose',()=>disposed=true);cleanup();assert.equal(mesh.material,material);assert.equal(scene.background,background);assert.equal(disposed,true);
 }
 const broken=new Mesh();broken.material=null;group.add(broken);assert.throws(()=>prepareSceneReference({scene,world,project:fresh().read(),style:'structure'}));assert.equal(mesh.material,material);assert.equal(scene.background,background);
 mesh.geometry.dispose();material.dispose();broken.geometry.dispose();
});
test('depth ranges remain finite and inside capture clipping even when nothing is in the camera',()=>{
 const box=new Box3(),world={bounds:()=>box};
 for(const position of [[0,0,2],[0,0,1000]]){
  const depth=sceneDepthRange(world,{position,target:[0,0,0],fov:60,width:640,height:480});assert.ok(depth.near>=.01);assert.ok(depth.far<=100);assert.ok(depth.far>depth.near);
 }
 box.set(new Vector3(-1,-1,-1),new Vector3(1,1,1));const depth=sceneDepthRange(world,{position:[0,0,2],target:[0,0,0],fov:60,width:640,height:480});assert.ok(depth.near<1);assert.ok(depth.far>3);
});
test('scene capture starts actor loading first and restores latest render when the revision changes',async()=>{
 let started=false,last='none',captured=false;
 await assert.rejects(captureSceneReference({project:fresh().read(),world:{async ready(){assert.equal(started,true);}},render:p=>{started=true;last=p?'captured':'latest';},stage:{async capture(){captured=true;}},assertCurrent:()=>{throw Error('changed');}}),/changed/);
 assert.equal(last,'latest');assert.equal(captured,false);
});

test('depth range includes visible surfaces when bounds cross the camera plane',()=>{
 const box=new Box3(new Vector3(-1,-1,-3),new Vector3(1,1,1));const depth=sceneDepthRange({bounds:()=>box},{position:[0,0,0],target:[0,0,-1],up:[0,1,0],fov:60,width:640,height:480});assert.equal(depth.near,.01);assert.ok(depth.far>3);
});

test('pose support chair pixels use a different ownership color than the actor',()=>{
 const project=fresh().read();project.snapshot.contacts.push({objectId:'chair'});const scene=new Scene(),group=new Group(),avatar=new Mesh(new BoxGeometry(),new MeshStandardMaterial()),chair=new Mesh(new BoxGeometry(),new MeshStandardMaterial());group.add(avatar,chair);scene.add(group);
 const cleanup=prepareSceneReference({scene,world:{object:()=>group,avatar:()=>({root:avatar}),supportChair:()=>chair},project,style:'segments'});
 const color=mesh=>{const shader={uniforms:{},fragmentShader:'#include <opaque_fragment>',vertexShader:''};mesh.material.onBeforeCompile(shader);return shader.uniforms.referenceColor.value.getHexString();};assert.notEqual(color(avatar),color(chair));cleanup();for(const mesh of [avatar,chair]){mesh.geometry.dispose();mesh.material.dispose();}
});
