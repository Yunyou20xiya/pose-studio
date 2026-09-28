import {Quaternion,Vector3} from 'three';
import {forward} from './kinematics.js';
import {projectJoint,effectiveRule} from './limits.js';
import {clone,issue} from './state.js';
export function ikChain(bone,profile){let n=profile.bones[bone]?.parent;const names=[];while(n&&!['hips','spine','chest','upperChest'].includes(n)&&names.length<3){names.push(n);n=profile.bones[n]?.parent;}return names;}
export function solveEffector(project,target,scope,profile){
  if(!profile.bones[target.bone])return{project,issues:[issue('BONE_MISSING','找不到指定关节',[target.bone])]};
  const working=clone(project),locks=new Set(working.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone));
  const chain=ikChain(target.bone,profile).filter(n=>scope.bones.includes(n)&&!locks.has(n)&&profile.limits[n]);
  const point=new Vector3().fromArray(target.position);let best=clone(working),bestDistance=Infinity;
  for(let iteration=0;iteration<32;iteration++){
    for(const joint of chain){
      const world=forward(working,profile),center=new Vector3().fromArray(world[joint].position);
      const from=new Vector3().fromArray(world[target.bone].position).sub(center),to=point.clone().sub(center);
      if(from.length()<1e-9||to.length()<1e-9)continue;
      const change=new Quaternion().setFromUnitVectors(from.normalize(),to.normalize());const angle=new Quaternion().angleTo(change);
      if(angle>.15)change.slerp(new Quaternion(),1-.15/angle);
      const parent=profile.bones[joint].parent;
      const parentQ=parent?new Quaternion().fromArray(world[parent].rotation):new Quaternion().fromArray(working.snapshot.rootRotation).multiply(new Quaternion().fromArray(profile.basisRotation||[0,0,0,1]));
      const local=parentQ.clone().invert().multiply(change).multiply(parentQ).multiply(new Quaternion().fromArray(working.snapshot.rotations[joint]));
      working.snapshot.rotations[joint]=projectJoint(local.toArray(),effectiveRule(joint,working.snapshot.rotations,profile),working.snapshot.rotations[joint]);
    }
    const world=forward(working,profile),distance=point.distanceTo(new Vector3().fromArray(world[target.bone].position));
    if(distance<bestDistance){best=clone(working);bestDistance=distance;}
    if(distance<profile.height*.002)break;
  }
  if(target.rotation&&scope.bones.includes(target.bone)&&!locks.has(target.bone)){
    const world=forward(best,profile),parent=profile.bones[target.bone].parent;
    const parentQ=parent?new Quaternion().fromArray(world[parent].rotation):new Quaternion();
    const local=parentQ.invert().multiply(new Quaternion().fromArray(target.rotation)).multiply(new Quaternion().fromArray(profile.bones[target.bone].restRotation||[0,0,0,1]).invert());
    best.snapshot.rotations[target.bone]=projectJoint(local.toArray(),effectiveRule(target.bone,best.snapshot.rotations,profile),best.snapshot.rotations[target.bone]);
  }
  const issues=bestDistance>profile.height*.002?[issue('TARGET_UNREACHABLE',`目标超出当前可达范围，相差 ${(bestDistance*100).toFixed(1)} 厘米`,[target.bone],'warning')]:[];
  return{project:best,issues};
}
