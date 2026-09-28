import {Vector3,Quaternion} from 'three';
export function forward(project,profile){
  const result={},pending=new Set(Object.keys(profile.bones));
  const rootQ=new Quaternion().fromArray(project.snapshot.rootRotation),rootP=new Vector3().fromArray(project.snapshot.rootPosition);
  const basisQ=rootQ.clone().multiply(new Quaternion().fromArray(profile.basisRotation||[0,0,0,1]));
  const basisP=new Vector3().fromArray(profile.basisPosition||[0,0,0]).applyQuaternion(rootQ).add(rootP);
  while(pending.size){let progressed=false;for(const name of pending){const bone=profile.bones[name];if(bone.parent&&!result[bone.parent])continue;
    const p=bone.parent?new Vector3().fromArray(result[bone.parent].position):basisP.clone();
    const q=bone.parent?new Quaternion().fromArray(result[bone.parent].rotation):basisQ.clone();
    p.add(new Vector3().fromArray(bone.position).applyQuaternion(q));
    q.multiply(new Quaternion().fromArray(project.snapshot.rotations[name]||[0,0,0,1])).multiply(new Quaternion().fromArray(bone.restRotation||[0,0,0,1])).normalize();
    result[name]={position:p.toArray(),rotation:q.toArray()};pending.delete(name);progressed=true;
  }if(!progressed)throw Error('骨骼层级含循环或缺少父节点');}
  return result;
}
export function worldPoint(project,profile,bone,localPoint,world=forward(project,profile)){return new Vector3().fromArray(localPoint).applyQuaternion(new Quaternion().fromArray(world[bone].rotation)).add(new Vector3().fromArray(world[bone].position)).toArray();}
