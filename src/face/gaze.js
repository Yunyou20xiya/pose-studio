import {Quaternion,Vector3} from 'three';
import {clone,issue} from '../pose/state.js';
import {forward} from '../pose/kinematics.js';
import {projectJoint,effectiveRule} from '../pose/limits.js';
const v=a=>new Vector3().fromArray(a),q=a=>new Quaternion().fromArray(a),clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function gazeRequest(project,kind,view){return{mode:kind==='camera'?'camera':'point',target:[...(kind==='camera'?project.camera.position:view.position)],follow:1};}
export function solveGaze(project,target,follow,profile,{allowedBones=['head','neck']}={}){
 const next=clone(project),issues=[];
 if(!Array.isArray(target)||target.length!==3||!target.every(Number.isFinite)||!Number.isFinite(follow)||follow<0||follow>1)return{project,issues:[issue('INVALID_GAZE','注视目标或跟随程度无效')]};
 if(!profile.capabilities.gazeAvailable)return{project,issues:[issue('GAZE_MISSING','角色没有可用的视线控制')]};
 const locked=new Set([...next.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone),...['head','neck'].filter(b=>!allowedBones.includes(b))]);let world=forward(next,profile);
 const parent=profile.bones.neck.parent,local=v(target).sub(v(world.head.position)).applyQuaternion(q(world[parent].rotation).invert()).normalize();
 const yaw=clamp(Math.atan2(-local.x,-local.z),-Math.PI*.6,Math.PI*.6),pitch=Math.asin(clamp(local.y,-1,1));
 if(follow>0)for(const [bone,share]of [['neck',1-(profile.gaze?.headShare??.68)],['head',profile.gaze?.headShare??.68]]){
  if(locked.has(bone)||!profile.limits[bone])continue;
  const other=bone==='head'?'neck':'head',weight=locked.has(other)?1:share;
  const rot=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw*weight*follow).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),pitch*weight*follow));
  next.snapshot.rotations[bone]=projectJoint(rot.toArray(),effectiveRule(bone,next.snapshot.rotations,profile),next.snapshot.rotations[bone]);
 }
 world=forward(next,profile);const remaining=v(target).sub(v(world.head.position)).applyQuaternion(q(world.head.rotation).invert()).normalize();
 const ry=Math.abs(Math.atan2(-remaining.x,-remaining.z)),rp=Math.abs(Math.asin(clamp(remaining.y,-1,1)));
 if(ry>(profile.gaze?.yaw??.21)+.005||rp>(profile.gaze?.pitch??.175)+.005)issues.push(issue('GAZE_UNREACHABLE','眼睛已到活动边界；可增加头颈跟随或调整目标位置',['head','neck'],'warning'));
 next.snapshot.gaze={...next.snapshot.gaze,target:clone(target),follow};return{project:next,issues};
}
