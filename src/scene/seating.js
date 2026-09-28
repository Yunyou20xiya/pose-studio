import {Quaternion,Vector3} from 'three';
import {clone} from '../pose/state.js';
import {forward,worldPoint} from '../pose/kinematics.js';
import {solveEffector} from '../pose/ik.js';
import {projectJoint,effectiveRule} from '../pose/limits.js';
import {groundPoseCommand} from '../assets/ground-poses.js';
export const seatLocalPoint=[0,-.067,0],soleLocalPoint=[0,-.0861217565,0];
export function fitSeatedPose(project,height,profile,{initialize=false}={}){
 let p=clone(project);
 if(initialize){
  const base=groundPoseCommand(p,'stand',profile).operations[0].value;Object.assign(p.snapshot.rotations,base.rotations);p.snapshot.contacts=[];p.snapshot.rootRotation=[0,0,0,1];
  const put=(bone,axis,angle)=>{const q=new Quaternion().setFromAxisAngle(new Vector3(...axis),angle*Math.PI/180).toArray();p.snapshot.rotations[bone]=projectJoint(q,effectiveRule(bone,p.snapshot.rotations,profile),p.snapshot.rotations[bone]);};
  for(const side of ['left','right']){const sign=side==='left'?1:-1;put(side+'UpperLeg',[1,0,0],90);put(side+'LowerLeg',[1,0,0],-90);put(side+'UpperArm',[0,0,1],sign*78);put(side+'LowerArm',[0,1,0],-sign*85);}
 }
 const bottom=worldPoint(p,profile,'hips',seatLocalPoint);
 p.snapshot.rootPosition=p.snapshot.rootPosition.map((n,i)=>n+([0,height,0][i]-bottom[i]));
 for(const side of ['left','right']){
  const bone=side+'Foot',w=forward(p,profile),sole=worldPoint(p,profile,bone,soleLocalPoint,w),delta=p.stage.floorY-sole[1];
  // Ordinary chairs ground the feet; tall seats may leave them hanging naturally.
  if(delta>0||Math.abs(delta)<.12){
   const candidate=solveEffector(p,{bone,position:w[bone].position.map((n,i)=>n+(i===1?delta:0)),rotation:w[bone].rotation},{bones:[side+'UpperLeg',side+'LowerLeg',bone]},profile).project;
   if(Math.abs(worldPoint(candidate,profile,bone,soleLocalPoint)[1]-p.stage.floorY)<.008)p=candidate;
  }
  if(worldPoint(p,profile,bone,soleLocalPoint)[1]<p.stage.floorY-.008)throw Error('这个座面高度无法在当前关节限制内坐稳；请稍微抬高座面，或先解除腿部锁定');
 }
 return p;
}
