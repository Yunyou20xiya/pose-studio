import {Vector3,Quaternion} from 'three';
import {objectSpec} from './catalog.js';

const surfaces={
 table:{height:.75,width:1.4,depth:.8},'round-table':{height:.74,width:1,depth:1,round:true},
 chair:{height:.48,width:.48,depth:.48,seat:true},stool:{height:.45,width:.38,depth:.38,round:true,seat:true},bench:{height:.45,width:1.3,depth:.38,seat:true},
 platform:{height:.2,width:3,depth:2},box:{height:.55,width:.55,depth:.55},
 'glass-wall':{height:4.2,width:8,depth:.12,vertical:true,handOnly:true}
};
export const surfaceSpec=type=>surfaces[type];
export const yawQuaternion=degrees=>new Quaternion().setFromAxisAngle(new Vector3(0,1,0),degrees*Math.PI/180);
export function surfaceRotation(object){const q=yawQuaternion(object.transform.yaw);return surfaceSpec(object.type)?.vertical?q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2)):q;}
export function surfacePoint(object,anchor){
 const s=surfaceSpec(object.type),t=object.transform;
 if(!s)throw Error('这个物品没有可用的承放表面');
 const point=s.vertical?new Vector3(anchor[0]*s.width,(anchor[1]+.5)*s.height,-s.depth/2):new Vector3(anchor[0]*s.width,s.height,anchor[1]*s.depth);
 return point.multiply(new Vector3(...t.scale)).applyQuaternion(yawQuaternion(t.yaw)).add(new Vector3(...t.position)).toArray();
}
export function surfaceAnchor(object,point){
 const s=surfaceSpec(object.type),t=object.transform;
 const local=new Vector3(...point).sub(new Vector3(...t.position)).applyQuaternion(yawQuaternion(-t.yaw)).divide(new Vector3(...t.scale));
 return[local.x/s.width,s.vertical?local.y/s.height-.5:local.z/s.depth];
}
// Check the actual oriented footprint, including the corners on round surfaces.
export function surfaceContains(target,anchor,subject){
 const s=surfaceSpec(target.type);if(!s)return false;
 if(s.handOnly)return !subject&&anchor.every(n=>Math.abs(n)<=.500001);
 const w=s.width*target.transform.scale[0],d=s.depth*target.transform.scale[2],center=[anchor[0]*w,anchor[1]*d];
 const size=subject?objectSpec(subject.type).size:[0,0,0],scale=subject?.transform.scale||[1,1,1];
 const angle=((subject?.transform.yaw??target.transform.yaw)-target.transform.yaw)*Math.PI/180;
 for(const x of [-size[0]*scale[0]/2,size[0]*scale[0]/2])for(const z of [-size[2]*scale[2]/2,size[2]*scale[2]/2]){
  const px=(center[0]+x*Math.cos(angle)+z*Math.sin(angle))/(w/2),pz=(center[1]-x*Math.sin(angle)+z*Math.cos(angle))/(d/2);
  if(s.round?px*px+pz*pz>1.00001:Math.abs(px)>1.00001||Math.abs(pz)>1.00001)return false;
 }return true;
}
export function nearestSurfaceAnchor(target,point,subject){
 const anchor=surfaceAnchor(target,point).map(n=>Math.max(-.49,Math.min(.49,n)));
 if(!surfaceContains(target,[0,0],subject))throw Error('表面太小，放不下这个物品；请扩大表面或缩小物品');
 if(surfaceContains(target,anchor,subject))return anchor;
 let low=0,high=1;for(let i=0;i<24;i++){const t=(low+high)/2;if(surfaceContains(target,anchor.map(n=>n*t),subject))low=t;else high=t;}
 return anchor.map(n=>n*low);
}
