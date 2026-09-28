import * as THREE from 'three';
import {objectSpec} from './catalog.js';
import {enableProjectedLight} from '../avatar/projected-light.js';
import {createAquariumObject} from './aquarium-geometry.js';
export function createObjectMesh(type,color){
 const spec=objectSpec(type);if(!spec)throw Error('没有这种物品');
 if(['glass-wall','aquarium-tank','fish'].includes(type))return createAquariumObject(type,color||spec.color);
 const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:color||spec.color,roughness:.8});enableProjectedLight(mat);
 mat.userData.objectTint=true;
 const add=(geometry,x=0,y=0,z=0,material=mat)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
 const box=(w,h,d,x,y,z,material)=>add(new THREE.BoxGeometry(w,h,d),x,y,z,material);
 const cylinder=(r,h,x,y,z)=>add(new THREE.CylinderGeometry(r,r,h,24),x,y,z);
 const legs=(w,h,d,r=.06)=>{for(const x of [-1,1])for(const z of [-1,1])box(r,h,r,x*(w-r)/2,h/2,z*(d-r)/2);};
 if(type==='table'){box(1.4,.06,.8,0,.72,0);legs(1.28,.69,.68);}
 if(type==='round-table'){cylinder(.5,.055,0,.7125,0);cylinder(.07,.67,0,.335,0);cylinder(.32,.03,0,.015,0);}
 if(type==='chair'){box(.48,.045,.48,0,.4575,0);legs(.42,.435,.42,.035);box(.48,.38,.04,0,.69,-.22);}
 if(type==='stool'){cylinder(.19,.04,0,.43,0);legs(.26,.41,.26,.04);}
 if(type==='bench'){box(1.3,.05,.38,0,.425,0);legs(1.18,.4,.29,.055);}
 if(type==='box'){box(.55,.55,.55,0,.275,0);const band=new THREE.MeshStandardMaterial({color:'#8f754e',roughness:.9});enableProjectedLight(band);box(.556,.035,.556,0,.45,0,band);box(.556,.035,.556,0,.1,0,band);}
 if(type==='sphere')add(new THREE.SphereGeometry(.225,24,16),0,.225,0);
 if(type==='cylinder')cylinder(.2,.7,0,.35,0);
 if(type==='cup'){
  const points=[new THREE.Vector2(0,0),new THREE.Vector2(.038,0),new THREE.Vector2(.047,.13),new THREE.Vector2(.039,.13),new THREE.Vector2(.031,.013),new THREE.Vector2(0,.013)];add(new THREE.LatheGeometry(points,24));
  add(new THREE.TorusGeometry(.03,.009,10,24),.05,.072,0);
 }
 if(type==='book'){box(.22,.008,.3,0,.004,0);box(.22,.008,.3,0,.036,0);const pages=new THREE.MeshStandardMaterial({color:'#eee9d7',roughness:.95});enableProjectedLight(pages);box(.206,.024,.286,0,.02,0,pages);box(.008,.024,.3,-.106,.02,0);}
 if(type==='platform')box(3,.2,2,0,.1,0);
 if(type==='wall')box(3,2.8,.16,0,1.4,0);
 if(type==='doorway'){box(.7,2.8,.2,-.85,1.4,0);box(.7,2.8,.2,.85,1.4,0);box(1,.65,.2,0,2.475,0);}
 if(type==='window-wall'){box(.7,2.8,.2,-1.15,1.4,0);box(.7,2.8,.2,1.15,1.4,0);box(1.6,.85,.2,0,.425,0);box(1.6,.55,.2,0,2.525,0);}
 if(type==='stairs')for(let i=0;i<6;i++)box(1.4,(i+1)*.2,2/6,0,(i+1)*.1,(i+.5)*2/6-1);
 if(type==='house'){
  box(3,2.3,2.6,0,1.15,0);const roofMat=new THREE.MeshStandardMaterial({color:'#8b8273',roughness:.9});enableProjectedLight(roofMat);
  const shape=new THREE.Shape();shape.moveTo(-1.62,0);shape.lineTo(0,.9);shape.lineTo(1.62,0);shape.closePath();add(new THREE.ExtrudeGeometry(shape,{depth:2.82,bevelEnabled:false}),0,2.3,-1.41,roofMat);
 }
 return g;
}
export function updateObjectColor(root,color){root.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(m.userData.objectTint)m.color.set(color);});}
export function disposeObject(root){const materials=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});materials.forEach(m=>m.dispose());root.removeFromParent();}
export function updateSupportChair(chair,c){
 chair.position.fromArray(c.position);chair.quaternion.fromArray(c.rotation);chair.scale.set(c.seatWidth/.48,c.seatHeight/.48,c.seatDepth/.48);
}
