import {Quaternion,Vector3} from 'three';
import definitions from '../../assets/gestures.json' with {type:'json'};
export const gestures=definitions;
const q=(axis,degrees)=>new Quaternion().setFromAxisAngle(new Vector3(...axis),degrees*Math.PI/180);
export function handGesture(name,side,openness=1,spread=.3,profile){
 const def=definitions.find(d=>d.id===name);if(!def||!['left','right'].includes(side))throw Error('没有这个手势或手部');
 if(![openness,spread].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('手势程度应在 0 到 1 之间');
 const sign=side==='left'?1:-1,rotations={};
 for(const[finger,i]of ['Thumb','Index','Middle','Ring','Little'].map((f,i)=>[f,i])){
  const parts=finger==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'];
  parts.forEach((part,j)=>{
   const bone=side+finger+part;if(!profile.bones[bone]||!profile.limits[bone])throw Error('模型缺少可编辑指节 '+bone);
   const curl=1-def.open[i];let target;
   if(finger==='Thumb')target=q([0,1,0],sign*[65,30,15][j]*curl).multiply(q([0,0,1],sign*[18,30,35][j]*curl)).multiply(q([1,0,0],-12*curl*(j===0?1:0)));
   else{
    let angle=[78,96,66][j]*curl;if(name==='number-9'&&finger==='Index')angle=[22,96,66][j];
    let fan=[0,1,.25,-.4,-1][i]*spread*16;
    if(['v-sign','number-2'].includes(name))fan=(i===1?1:i===2?-1:0)*(6+spread*10);
    if(name==='number-7'&&i<3)fan=i===1?-8:8;
    target=q([0,1,0],j===0?-sign*fan:0).multiply(q([0,0,1],sign*angle));
   }
   if(def.rightRotations){const r=def.rightRotations['right'+finger+part];target=new Quaternion().fromArray(side==='right'?r:[r[0],-r[1],-r[2],r[3]]);if(j===0&&finger!=='Thumb')target.premultiply(q([0,1,0],-sign*(spread-.3)*(finger==='Index'?3:finger==='Middle'?-3:0)));}
   const relaxed=q([0,0,1],sign*(finger==='Thumb'?8:[12,12,6][j]));
   rotations[bone]=relaxed.slerp(target,openness).normalize().toArray();
  });
 }
 return{rotations};
}
// Reflection about the character sagittal plane: axial vector (x,y,z) -> (x,-y,-z).
export function mirrorPatch(patch,profile){
 const rotations={};for(const[n,q]of Object.entries(patch.rotations||{})){
  const target=n.startsWith('left')?n.replace(/^left/,'right'):n.startsWith('right')?n.replace(/^right/,'left'):n;
  if(!profile.bones[target]||!profile.limits[target])throw Error('目标关节无法镜像 '+target);
  rotations[target]=[q[0],-q[1],-q[2],q[3]];
 }return{rotations};
}
