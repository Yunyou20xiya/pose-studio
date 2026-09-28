import {Quaternion,Vector3,Euler} from 'three';
import {clone,makeCommand} from '../pose/state.js';
import {forward,worldPoint} from '../pose/kinematics.js';
import {projectJoint,effectiveRule} from '../pose/limits.js';
export const groundPoses=[{id:'stand',name:'站立'},{id:'squat',name:'蹲下'},{id:'kneel',name:'跪下'},{id:'floor-sit',name:'坐地'}];
const rad=n=>n*Math.PI/180,q=(x=0,y=0,z=0)=>new Quaternion().setFromEuler(new Euler(rad(x),rad(y),rad(z))).toArray();
export function groundPoseCommand(project,kind,profile){
 if(!groundPoses.some(x=>x.id===kind))throw Error('没有这个基础姿势');
 const p=clone(project),body=Object.keys(profile.limits).filter(n=>!/(Thumb|Index|Middle|Ring|Little|Eye)/.test(n)&&!['head','neck'].includes(n));
 for(const n of body)p.snapshot.rotations[n]=[0,0,0,1];
 const put=(n,value)=>{p.snapshot.rotations[n]=projectJoint(value,effectiveRule(n,p.snapshot.rotations,profile),[0,0,0,1]);};
 if(kind==='squat'){put('hips',q(-20));put('spine',q(-5));}
 for(const side of ['left','right']){
  const sign=side==='left'?1:-1;
  put(side+'UpperArm',q(0,0,sign*(kind==='floor-sit'?45:72)));
  if(kind==='squat'){put(side+'UpperLeg',q(112));put(side+'LowerLeg',q(-130));put(side+'Foot',q(38));put(side+'LowerArm',q(0,-sign*80,0));}
  if(kind==='kneel'){put(side+'UpperLeg',q(10));put(side+'LowerLeg',q(-110));put(side+'Foot',q(-30));put(side+'LowerArm',q(0,-sign*25,0));}
  if(kind==='floor-sit'){put(side+'UpperLeg',q(90));put(side+'LowerLeg',q(-5));put(side+'Foot',q(-25));put(side+'LowerArm',q(0,-sign*25,0));}
 }
 p.snapshot.rootRotation=[0,0,0,1];p.snapshot.rootPosition=[project.snapshot.rootPosition[0],0,project.snapshot.rootPosition[2]];p.snapshot.contacts=[];
 let w=forward(p,profile),supports=[];
 if(kind==='kneel')supports=['leftLowerLeg','rightLowerLeg'].map(bone=>({bone,worldOffset:[0,-.045,0]}));
 else if(kind==='floor-sit')supports=[{bone:'hips',worldOffset:[0,-.12,0]}];
 else supports=['leftFoot','rightFoot'].map(bone=>({bone,worldOffset:[0,-.0861217565,0]}));
 const base=Math.min(...supports.map(s=>w[s.bone].position[1]+s.worldOffset[1]));p.snapshot.rootPosition[1]=p.stage.floorY-base;w=forward(p,profile);
 // Store grounded anchors in each joint's local frame; whole-actor placement remains independent.
 for(const s of supports){const localPoint=new Vector3().fromArray(s.worldOffset).applyQuaternion(new Quaternion().fromArray(w[s.bone].rotation).invert()).toArray();p.snapshot.contacts.push({bone:s.bone,objectId:'floor',localPoint,worldPoint:worldPoint(p,profile,s.bone,localPoint,w),mode:'required'});}
 if(kind==='floor-sit')for(const bone of ['leftUpperLeg','rightUpperLeg']){
  const point=[...w[bone].position];point[1]=p.stage.floorY;
  const localPoint=new Vector3().fromArray(point).sub(new Vector3().fromArray(w[bone].position)).applyQuaternion(new Quaternion().fromArray(w[bone].rotation).invert()).toArray();p.snapshot.contacts.push({bone,objectId:'floor',localPoint,worldPoint:point,mode:'required'});
 }
 const value={rotations:Object.fromEntries(body.map(n=>[n,p.snapshot.rotations[n]])),rootPosition:p.snapshot.rootPosition,rootRotation:p.snapshot.rootRotation,contacts:p.snapshot.contacts};
 return makeCommand(project,[{kind:'patch',value}],{bones:[...new Set([...body,...project.snapshot.contacts.map(c=>c.bone)])],expressions:[],root:true,gaze:false,stage:false,camera:false,lighting:false},'preset',body);
}
