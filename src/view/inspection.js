import {Quaternion,Vector3} from 'three';
import {makeCommand,fullScope,clone} from '../pose/state.js';
import {forward,worldPoint} from '../pose/kinematics.js';
export const rotation=(axis,deg)=>new Quaternion().setFromAxisAngle(new Vector3(...axis),deg*Math.PI/180).toArray();
export function diagnosticPose(name,project,profile){
 const p=clone(project),r=p.snapshot.rotations;
 if(name==='neutral')return{rotations:Object.fromEntries(Object.keys(profile.limits).map(n=>[n,[0,0,0,1]])),rootPosition:[0,0,0],contacts:[]};
 if(name==='stand'||name==='sit'){
  for(const n of Object.keys(profile.limits))r[n]=[0,0,0,1];
  r.leftUpperArm=rotation([0,0,1],78);r.rightUpperArm=rotation([0,0,1],-78);
  p.snapshot.rootPosition=[0,0,0];p.snapshot.contacts=[];
  if(name==='sit'){
   r.leftLowerArm=rotation([0,1,0],-85);r.rightLowerArm=rotation([0,1,0],85);
   for(const side of ['left','right']){r[side+'UpperLeg']=rotation([1,0,0],90);r[side+'LowerLeg']=rotation([1,0,0],-90);}
   const neutral=clone(p);for(const side of ['left','right']){neutral.snapshot.rotations[side+'UpperLeg']=[0,0,0,1];neutral.snapshot.rotations[side+'LowerLeg']=[0,0,0,1];}
   const rest=forward(neutral,profile),world=forward(p,profile),sole=rest.leftFoot.position[1]-profile.bounds.min[1];
   p.snapshot.rootPosition[1]=sole-world.leftFoot.position[1];
   const w=forward(p,profile),bottom=worldPoint(p,profile,'hips',[0,-.067,0],w);
   p.stage.chair={position:[bottom[0],0,bottom[2]-.03],rotation:[0,0,0,1],seatWidth:.44,seatDepth:.4,seatHeight:bottom[1]};
   p.snapshot.contacts=[{bone:'hips',objectId:'chair',localPoint:[0,-.067,0],worldPoint:bottom,mode:'required'},...['left','right'].map(side=>({bone:side+'Foot',objectId:'floor',localPoint:[0,-sole,0],worldPoint:worldPoint(p,profile,side+'Foot',[0,-sole,0],w),mode:'required'}))];
  }
  return{rotations:Object.fromEntries(Object.entries(r).filter(([n])=>profile.limits[n])),rootPosition:p.snapshot.rootPosition,contacts:p.snapshot.contacts,stage:p.stage};
 }
 if(name==='arms')return{rotations:{leftUpperArm:rotation([0,0,1],-55),rightUpperArm:rotation([0,0,1],55),leftShoulder:rotation([0,0,1],-15),rightShoulder:rotation([0,0,1],15)}};
 if(name==='elbows')return{rotations:{rightUpperArm:rotation([0,0,1],-35),rightLowerArm:rotation([0,1,0],100),leftLowerArm:rotation([0,1,0],-100)}};
 if(name==='wrist')return{rotations:{rightHand:rotation([0,0,1],-40),rightLowerArm:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.8)).toArray()}};
 if(name==='fist')return{rotations:Object.fromEntries(Object.keys(r).filter(n=>/^right(Thumb|Index|Middle|Ring|Little)/.test(n)).map(n=>[n,rotation([0,0,1],n.includes('Thumb')?-40:n.endsWith('Distal')?-60:-80)]))};
 if(name==='head')return{rotations:{head:rotation([0,1,0],45),neck:rotation([0,1,0],15)}};
 throw Error('没有这个诊断动作');
}
export function mountInspection(panel,engine,avatar,stage,profile){
 panel.innerHTML='<h1>身体验证</h1><span class="badge">VRoid 示例角色 A</span><p>所有按钮通过同一个关节限制入口。</p><div id="probes" class="row"></div><h2>观察视角</h2><div id="views" class="row"></div><h2>当前结果</h2><pre id="report"></pre>';
 const render=()=>{avatar.render(engine.read());stage.render(engine.read());};
 for(const[id,label]of Object.entries({neutral:'中立',stand:'站立',sit:'坐下',arms:'双臂上举',elbows:'屈肘',wrist:'转腕',fist:'握拳',head:'转头'})){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{const p=engine.read(),result=engine.apply(makeCommand(p,[{kind:'patch',value:diagnosticPose(id,p,profile)}],fullScope(p),'preset'));document.querySelector('#report').textContent=JSON.stringify(result,null,2);render();};panel.querySelector('#probes').append(b);}
 for(const[id,pos]of Object.entries({正面:[0,1,3.6],侧面:[3.3,1.1,0],背面:[0,1,-3.6],手部:[-1,1.3,.8]})){const b=document.createElement('button');b.textContent=id;b.onclick=()=>stage.setView(pos,id==='手部'?[-.35,1.15,.25]:[0,.8,0]);panel.querySelector('#views').append(b);}
 render();
}
