import {settleHandFingers} from './hand-fitting.js';
import {Matrix4,Quaternion,Vector3} from 'three';
import {actorDescriptor,actorProject,putActorProject,toWorld,toLocal} from '../scene/state.js';
import {fitHandToSurface,supportGeometry,supportArm} from './hand-supports.js';
import {handGesture} from '../assets/gestures.js';
import {projectJoint,effectiveRule} from './limits.js';
import {fingerBones} from '../avatar/capabilities.js';
import {same,clone} from './state.js';
const v=a=>new Vector3().fromArray(a),yaw=a=>new Quaternion().setFromAxisAngle(new Vector3(0,1,0),a*Math.PI/180);
export const handTemplates=[
 {id:'palms-together',name:'双手合掌',description:'同一人的左右手，掌面贴合，手指朝上。'},
 {id:'handshake',name:'两人握手',description:'两人的同侧手相握，默认双方右手。'},
 {id:'hand-hold',name:'普通牵手',description:'并排人物的相反侧手轻轻牵住。'}
];
export const interactionBones=(hand,profile)=>[...supportArm(hand,profile),...fingerBones(hand.replace('Hand',''))];
function palmRotation(hand,direction,normal){
 const x=v(direction).multiplyScalar(hand==='leftHand'?-1:1),y=v(normal).negate(),z=x.clone().cross(y).normalize();
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
export function handTargets(p,r,profile){
 const anchor=actorDescriptor(p,r.hands[0].actorId),frame=yaw(anchor.transform.yaw+r.yaw),center=v(toWorld(p,anchor.id,r.position));
 return r.hands.map((h,i)=>{
  let direction,normal,offset=[0,0,0];
  if(r.preset==='palms-together'){direction=[0,1,0];normal=[h.hand==='leftHand'?-1:1,0,0];}
  else if(r.preset==='handshake'){direction=[0,0,i?-1:1];normal=[(h.hand==='rightHand'?1:-1)*(i?-1:1),0,0];offset=[0,0,(i?1:-1)*.008];}
  else{direction=[(h.hand==='leftHand'?1:-1)*.42,-Math.sqrt(1-.42**2),0];normal=[0,0,i?1:-1];offset=[0,0,i?-.008:.008];}
  const a=actorDescriptor(p,h.actorId),worldRotation=frame.clone().multiply(palmRotation(h.hand,direction,normal));
  const position=center.clone().add(v(offset).multiplyScalar(anchor.transform.scale).applyQuaternion(frame));
  const rotation=yaw(-a.transform.yaw).multiply(worldRotation).toArray();
  return{...h,scale:a.transform.scale,contact:{bone:h.hand,preset:'paired',objectId:'scene-surface',localPoint:[h.hand==='leftHand'?-.038:.038,-.011,0],frame:{position:toLocal(p,a.id,position.toArray()),rotation},targetPoint:[0,0,0],relativeRotation:[0,0,0,1]}};
 });
}
export function pairedGeometry(p,r,profile){return handTargets(p,r,profile).map(t=>({...t,...supportGeometry(actorProject(p,t.actorId),t.contact,profile)}));}
export function fitPairedHands(p,r,profile,{initialize=false,reshape=false,overwriteManual=false,bodyCommand,skipHands}={}){
 const locked=new Map(r.hands.filter(h=>actorDescriptor(p,h.actorId).locked).map(h=>{const a=actorProject(p,h.actorId);return[h.actorId,{snapshot:clone(a.snapshot),layers:clone(a.layers)}];}));
 for(const t of handTargets(p,r,profile)){
  if(skipHands?.has(t.actorId+':'+t.hand))continue;
  const before=actorProject(p,t.actorId),desc=actorDescriptor(p,t.actorId),hand=t.hand,side=hand.replace('Hand',''),bones=interactionBones(hand,profile);
  const manual=new Set(before.layers.filter(l=>l.manual).flatMap(l=>l.bones));
  const scope=bodyCommand&&(bodyCommand.actorId||p.scene?.primary.id||'primary')===t.actorId?bodyCommand:null;
  const allowed=supportArm(hand,profile).filter(b=>(!scope||scope.scope.bones.includes(b))&&(!manual.has(b)||overwriteManual||scope?.overwriteManual.includes(b)));
  let start=clone(before);
  if(initialize||reshape){
   const fingers=handGesture(r.preset==='palms-together'?'open':'fist',side,r.preset==='palms-together'?1:.25+r.strength*.36,.1,profile).rotations;
   const locked=new Set(start.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone));
   for(const [bone,rotation]of Object.entries(fingers)){
    const target=bone.includes('Thumb')?new Quaternion().setFromAxisAngle(new Vector3(1,0,0),bone.endsWith('Metacarpal')?.2:0).toArray():rotation;
    const next=projectJoint(target,effectiveRule(bone,start.snapshot.rotations,profile),start.snapshot.rotations[bone]);
    if(!same(next,start.snapshot.rotations[bone])&&(locked.has(bone)||manual.has(bone)&&!overwriteManual))throw Error(desc.name+'的手指已有锁定或手动调整；可允许替换手动调整，锁定仍需先解除');
    start.snapshot.rotations[bone]=next;
   }
  }
  const current=supportGeometry(start,t.contact,profile);
  const fitted=current.distance<.001&&current.angle<.015?{project:start}:fitHandToSurface(start,t.contact,profile,allowed,{initialize});
  const g=supportGeometry(fitted.project,t.contact,profile);
  if(g.distance>.006||g.angle>8*Math.PI/180)throw Error(desc.name+'的'+(side==='left'?'左':'右')+'手无法保持互动（相差 '+(g.distance*100).toFixed(1)+' 厘米，方向 '+(g.angle*180/Math.PI).toFixed(0)+'°）；请调整人物距离、接触位置或关节锁定');
  const changed=bones.filter(b=>!same(before.snapshot.rotations[b],fitted.project.snapshot.rotations[b]));
  if(changed.length&&desc.locked)throw Error(desc.name+'已锁定，无法跟随手部互动');
  if(changed.some(b=>manual.has(b)&&!overwriteManual&&!scope?.overwriteManual.includes(b)))throw Error(desc.name+'的手动调整需要保留；请解除互动或明确允许替换');
  if(changed.length){fitted.project.layers=fitted.project.layers.map(l=>({...l,bones:l.bones.filter(b=>!changed.includes(b))})).filter(l=>l.bones.length||l.expressionNames.length);fitted.project.layers.push({id:'hands-'+r.id+'-'+hand,sourceAsset:r.preset,manual:false,bones:changed,expressionNames:[]});}
  putActorProject(p,t.actorId,fitted.project);
 }
 if(initialize||reshape)settleHandFingers(p,r,profile,{overwriteManual});
 for(const [id,before]of locked){const a=actorProject(p,id);if(!same(before.snapshot,a.snapshot)||!same(before.layers,a.layers))throw Error(actorDescriptor(p,id).name+'已锁定，无法调整手部互动');}
 return p;
}
