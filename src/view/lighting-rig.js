import * as THREE from 'three';
import {lightingDefaults,lightTarget} from '../lighting/settings.js';
import {beamTexture,emitterSamples} from '../lighting/shapes.js';

export function createLightingRig({scene,helpers,profile}){
 const key=new THREE.DirectionalLight(0xfff6e5,2.6),fill=new THREE.HemisphereLight(0xffffff,0x819582,1.4),target=new THREE.Object3D();
 key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0001;key.shadow.normalBias=.008;
 Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:15});key.shadow.camera.updateProjectionMatrix();key.target=target;scene.add(key,fill,target);
 const spots=Array.from({length:5},()=>{const light=new THREE.SpotLight();light.target=target;light.castShadow=true;light.decay=0;light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0001;light.shadow.normalBias=.003;light.shadow.camera.near=.01;light.visible=false;scene.add(light);return light;});
 let mask=null,maskKey='';
 const markers=new THREE.Group(),lampHandle=new THREE.Group(),aimHandle=new THREE.Group();markers.add(lampHandle,aimHandle);helpers.add(markers);markers.visible=false;
 const gold=new THREE.MeshBasicMaterial({color:0xc48525,depthTest:false,toneMapped:false}),green=new THREE.MeshBasicMaterial({color:0x2c9974,depthTest:false,toneMapped:false});
 const lamp=new THREE.Mesh(new THREE.IcosahedronGeometry(.095,1),gold),ring=new THREE.Mesh(new THREE.TorusGeometry(.14,.012,8,32),gold);lampHandle.add(lamp,ring);
 const faceMaterial=new THREE.MeshBasicMaterial({color:0xfff6e5,side:THREE.DoubleSide,transparent:true,opacity:.8,toneMapped:false,depthTest:false});
 const rectangle=new THREE.Mesh(new THREE.PlaneGeometry(1,1),faceMaterial),disc=new THREE.Mesh(new THREE.CircleGeometry(.5,48),faceMaterial);lampHandle.add(rectangle,disc);
 const aim=new THREE.Mesh(new THREE.SphereGeometry(.032,12,10),green);aimHandle.add(aim);
 const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Array(6).fill(0),3));
 const line=new THREE.Line(lineGeometry,new THREE.LineDashedMaterial({color:0x9c976f,dashSize:.07,gapSize:.05,transparent:true,opacity:.7,depthTest:false}));markers.add(line);
 markers.traverse(o=>{o.renderOrder=100;});
 const pickables=[lamp,ring,aim],orientation=new THREE.Quaternion();
 function update(project){
  const l=lightingDefaults(project.lighting),aimPosition=lightTarget(project,profile);
  key.position.fromArray(l.keyPosition);target.position.fromArray(aimPosition);target.updateMatrixWorld(true);
  const shaped=l.beamShape!=='none',area=l.emitterShape!=='point';key.visible=!shaped&&!area;
  key.intensity=l.keyEnabled&&key.visible?l.keyIntensity:0;fill.intensity=l.fillEnabled?l.fillIntensity:0;
  key.color.set(l.keyColor);fill.color.set(l.fillColor);fill.groundColor.set(0x819582).multiply(fill.color);
  key.shadow.radius=1+7*l.shadowSoftness;key.shadow.camera.far=Math.max(15,key.position.distanceTo(target.position)+6);key.shadow.camera.updateProjectionMatrix();
  lampHandle.position.copy(key.position);aimHandle.position.copy(target.position);gold.color.set(l.keyEnabled?0xc48525:0x8c938d);
  lampHandle.lookAt(target.position);orientation.copy(lampHandle.quaternion);
  lamp.visible=ring.visible=!area;rectangle.visible=area&&l.emitterShape!=='disc';disc.visible=l.emitterShape==='disc';
  const height=l.emitterShape==='rectangle'?l.emitterHeight:l.emitterWidth;rectangle.scale.set(l.emitterWidth,height,1);disc.scale.set(l.emitterWidth,l.emitterWidth,1);faceMaterial.color.set(l.keyEnabled?l.keyColor:'#7c827e');
  pickables.splice(0,pickables.length,...(area?[disc.visible?disc:rectangle]:[lamp,ring]),aim);
  const nextMaskKey=shaped?JSON.stringify([l.beamShape,l.beamWidth,l.beamHeight,l.beamRotation,l.beamEdge]):'';
  if(nextMaskKey!==maskKey){mask?.texture.dispose();mask=shaped?beamTexture(l):null;maskKey=nextMaskKey;}
  const samples=emitterSamples(l);
  spots.forEach((light,i)=>{
   light.visible=(shaped||area)&&l.keyEnabled&&l.keyIntensity>0&&i<samples.length;light.intensity=light.visible?l.keyIntensity/samples.length:0;light.color.copy(key.color);light.map=mask?.texture||null;
   if(!light.visible)return;
   light.position.set(...samples[i],0).applyQuaternion(orientation).add(key.position);
   const distance=Math.max(.05,light.position.distanceTo(target.position)),far=Math.max(30,distance+20);
   light.angle=mask?Math.atan(mask.span/2/distance):Math.PI*.44;light.penumbra=mask?0:.25;light.distance=far;
   light.shadow.radius=1+5*l.shadowSoftness;light.shadow.camera.far=far;light.shadow.needsUpdate=true;
  });
  const a=lineGeometry.attributes.position;a.setXYZ(0,...l.keyPosition);a.setXYZ(1,...aimPosition);a.needsUpdate=true;line.computeLineDistances();lineGeometry.computeBoundingSphere();
 }
 return{key,fill,target,markers,lampHandle,aimHandle,pickables,update,dispose(){helpers.remove(markers);scene.remove(key,fill,target,...spots);const geometries=new Set(),materials=new Set();markers.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();key.shadow.dispose();for(const light of spots)light.shadow.dispose();mask?.texture.dispose();}};
}
