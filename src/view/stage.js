import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createLightingRig} from './lighting-rig.js';
import {outputFrame,fitView,avatarBounds} from './framing.js';

export function createStage(canvas,{profile}={}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e9e2');
 const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.position.set(1.8,1.5,4.6);
 const controls=new OrbitControls(camera,canvas);controls.target.set(0,.85,0);controls.enableDamping=true;
 const helpers=new THREE.Group();scene.add(helpers);const lighting=createLightingRig({scene,helpers,profile});
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xdce1d9,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const grid=new THREE.GridHelper(8,40,0xc2cec1,0xd0d8ce);grid.position.y=.001;grid.material.opacity=.35;grid.material.transparent=true;scene.add(grid);
 const chair=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x7d9180,roughness:.8});
 const seat=new THREE.Mesh(new THREE.BoxGeometry(1,.045,1),wood);chair.add(seat);const legs=[];
 for(let i=0;i<4;i++){const leg=new THREE.Mesh(new THREE.BoxGeometry(.032,1,.032),wood);legs.push(leg);chair.add(leg);}
 const back=new THREE.Mesh(new THREE.BoxGeometry(1,.34,.035),wood);chair.add(back);chair.visible=false;chair.traverse(o=>{o.castShadow=true;o.receiveShadow=true;});scene.add(chair);
 let capturing=false,outputView=false,project=null,freeView=null,avatar=null,sceneBounds=null,inset=null,inspection=null,lastInspectionFrame=0;
 const listeners=new Set(),size=new THREE.Vector2();
 const viewSpec=()=>({position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,up:camera.up.toArray()});
 const frame=()=>{renderer.getSize(size);return outputView&&project?outputFrame(size.x,size.y,project.camera):{x:0,y:0,width:size.x,height:size.y};};
 const notify=()=>{for(const fn of listeners)fn({outputView,frame:frame(),camera:project?.camera});};
 function applyCamera(spec){camera.position.fromArray(spec.position);camera.up.fromArray(spec.up||[0,1,0]);controls.target.fromArray(spec.target);camera.fov=spec.fov;camera.lookAt(controls.target);camera.updateMatrixWorld(true);}
 function projection(){renderer.getSize(size);camera.aspect=outputView&&project?project.camera.width/project.camera.height:size.x/size.y;camera.updateProjectionMatrix();}
 function renderLive(){
  if(capturing)return;
  renderer.getSize(size);renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);helpers.visible=!outputView;grid.visible=!outputView;
  if(outputView){const r=frame();renderer.setClearColor(0x29332d,1);renderer.clear();renderer.setViewport(r.x,size.y-r.y-r.height,r.width,r.height);renderer.setScissor(r.x,size.y-r.y-r.height,r.width,r.height);renderer.setScissorTest(true);}
  const effect=outputView?null:inspection;effect?.apply();try{renderer.render(scene,camera);}finally{effect?.restore();}renderer.setScissorTest(false);
  if(inset&&!outputView){const mini=new THREE.PerspectiveCamera(inset.fov,.75,.01,100);mini.position.fromArray(inset.position);mini.lookAt(new THREE.Vector3(...inset.target));helpers.visible=false;grid.visible=false;renderer.setViewport(12,80,135,180);renderer.setScissor(12,80,135,180);renderer.setScissorTest(true);renderer.clear();renderer.render(scene,mini);renderer.setScissorTest(false);helpers.visible=true;grid.visible=true;}
 }
 function resize(){if(capturing)return;renderer.setSize(Math.max(canvas.clientWidth,1),Math.max(canvas.clientHeight,1),false);projection();notify();renderLive();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 renderer.setAnimationLoop(time=>{if(capturing||time-lastInspectionFrame<33)return;lastInspectionFrame=time;if(!outputView)controls.update();renderLive();});
 function setOutputView(value){
  if(value===outputView||value&&!project)return;
  if(value){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;freeView={...viewSpec(),up:camera.up.toArray()};outputView=true;controls.enabled=false;applyCamera(project.camera);}
  else{outputView=false;controls.enabled=true;if(freeView){applyCamera(freeView);controls.update();}}
  projection();notify();renderLive();
 }
 function setView(position,target,fov){setOutputView(false);const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.up.set(0,1,0);camera.position.fromArray(position);controls.target.fromArray(target);if(fov!==undefined)camera.fov=fov;controls.update();controls.enableDamping=damping;projection();notify();}
 function fit(includeLighting){
  const bounds=sceneBounds?sceneBounds():avatar?avatarBounds(avatar.root):new THREE.Box3(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1.8,.5));
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1.8,.5));
  if(includeLighting){lighting.lampHandle.updateWorldMatrix(true,true);for(const face of lighting.lampHandle.children.filter(o=>o.visible))bounds.union(new THREE.Box3().setFromObject(face));bounds.expandByPoint(lighting.key.position);bounds.expandByPoint(lighting.target.position);}
  renderer.getSize(size);const spec=fitView(bounds,size.x/size.y,new THREE.Vector3().subVectors(camera.position,controls.target),35);setView(spec.position,spec.target,spec.fov);
 }
 return{scene,camera,renderer,controls,chair,key:lighting.key,lighting,helpers,addAvatar(a){avatar=a;scene.add(a.root);},setSceneBounds(fn){sceneBounds=fn;},fitBounds(bounds){renderer.getSize(size);if(!bounds.isEmpty()){const spec=fitView(bounds,size.x/size.y,new THREE.Vector3().subVectors(camera.position,controls.target),35);setView(spec.position,spec.target,spec.fov);}},setInspection(value){inspection=value;},setInset(spec){inset=spec;},viewSpec,setView,setOutputView,isOutputView:()=>outputView,onViewChange(fn){listeners.add(fn);fn({outputView,frame:frame(),camera:project?.camera});return()=>listeners.delete(fn);},fitAvatar(){fit(false);},fitLighting(){fit(true);},render(p){
  project=p;floor.position.y=p.scene?.floorY??p.stage.floorY;grid.position.y=floor.position.y+.001;
  const c=p.stage.chair;chair.visible=!sceneBounds&&p.snapshot.contacts.some(x=>x.objectId==='chair');chair.position.fromArray(c.position);chair.quaternion.fromArray(c.rotation);seat.scale.set(c.seatWidth,1,c.seatDepth);seat.position.y=c.seatHeight-.0225;back.scale.x=c.seatWidth;back.position.set(0,c.seatHeight+.16,-c.seatDepth/2+.018);
  legs.forEach((l,i)=>{l.scale.y=Math.max(.01,c.seatHeight-.045);l.position.set((i%2?1:-1)*(c.seatWidth/2-.032),(c.seatHeight-.045)/2,(i<2?1:-1)*(c.seatDepth/2-.032));});
  lighting.update(p);scene.background.set(p.lighting.background);if(outputView){applyCamera(p.camera);projection();}notify();
 },async capture(spec,{prepare}={}){
  if(capturing)throw Error('正在生成另一张图片');if(spec.width>renderer.capabilities.maxTextureSize||spec.height>renderer.capabilities.maxTextureSize)throw Error('图片尺寸超过显卡限制');
  capturing=true;const beforeSize=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();helpers.visible=false;grid.visible=false;
  let cleanup;
  try{
   cleanup=prepare?.();
   const output=new THREE.PerspectiveCamera(spec.fov,spec.width/spec.height,.01,100);output.up.fromArray(spec.up||[0,1,0]);output.position.fromArray(spec.position);output.lookAt(new THREE.Vector3().fromArray(spec.target));output.updateMatrixWorld();
   renderer.setScissorTest(false);renderer.setPixelRatio(1);renderer.setSize(spec.width,spec.height,false);renderer.setViewport(0,0,spec.width,spec.height);renderer.render(scene,output);
   const blob=new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('参考图生成失败')),'image/png'));
   // toBlob snapshots the rendered buffer. Restore live resources before its
   // asynchronous callback so queued scene edits never write to temporary materials.
   cleanup?.();cleanup=null;return await blob;
  }finally{cleanup?.();renderer.setPixelRatio(ratio);renderer.setSize(beforeSize.x,beforeSize.y,false);capturing=false;resize();}
 },dispose(){observer.disconnect();renderer.setAnimationLoop(null);listeners.clear();controls.dispose();lighting.dispose();for(const o of [floor,grid,seat,back,...legs])o.geometry.dispose();floor.material.dispose();grid.material.dispose();wood.dispose();renderer.dispose();}};
}
