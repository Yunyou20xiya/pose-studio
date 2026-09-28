import {Quaternion,Vector3} from 'three';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function nearest(point,polygon){
  if(polygon.length>=3){let positive=false,negative=false;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];const c=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);if(c>1e-10)positive=true;if(c< -1e-10)negative=true;}if(!(positive&&negative))return point;}
  let best=polygon[0],distance=Infinity;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1];const t=clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);const q=[a[0]+t*dx,a[1]+t*dy],d=(q[0]-point[0])**2+(q[1]-point[1])**2;if(d<distance){best=q;distance=d;}}
  return best;
}
function decomposition(q,axis,previous){
  const d=new Vector3(q.x,q.y,q.z).dot(axis);let t=new Quaternion(axis.x*d,axis.y*d,axis.z*d,q.w);
  if(t.length()<1e-8){const pd=new Vector3(previous.x,previous.y,previous.z).dot(axis);t.set(axis.x*pd,axis.y*pd,axis.z*pd,previous.w);if(t.length()<1e-8)t.identity();}
  t.normalize();return{twist:t,swing:q.clone().multiply(t.clone().invert()).normalize()};
}
export function projectJoint(input,rule,previous=[0,0,0,1],rest=[0,0,0,1]){
  if(!rule)throw Error('关节没有限制配置');
  const rq=new Quaternion().fromArray(rest),q=rq.clone().invert().multiply(new Quaternion().fromArray(input)).normalize(),prev=rq.clone().invert().multiply(new Quaternion().fromArray(previous)).normalize();
  if(q.dot(prev)<0)q.set(-q.x,-q.y,-q.z,-q.w);
  const axis=new Vector3().fromArray(rule.axis).normalize(),{twist,swing}=decomposition(q,axis,prev);
  const previousParts=decomposition(prev,axis,prev),ps=previousParts.swing;
  if(ps.w<0)ps.set(-ps.x,-ps.y,-ps.z,-ps.w);
  const pv=new Vector3(ps.x,ps.y,ps.z),pl=pv.length();if(pl>1e-10)pv.multiplyScalar(2*Math.atan2(pl,ps.w)/pl);
  const sv=new Vector3(swing.x,swing.y,swing.z),len=sv.length();
  if(len>1e-10){const angle=2*Math.atan2(len,swing.w),direction=sv.clone().multiplyScalar(1/len),a=direction.clone().multiplyScalar(angle),b=direction.clone().multiplyScalar(angle-2*Math.PI);sv.copy(a.distanceToSquared(pv)<=b.distanceToSquared(pv)?a:b);}else sv.set(0,0,0);
  const u=new Vector3().fromArray(rule.swingBasis[0]),v=new Vector3().fromArray(rule.swingBasis[1]);
  const p=nearest([sv.dot(u),sv.dot(v)],rule.hardSwing),limited=u.multiplyScalar(p[0]).add(v.multiplyScalar(p[1]));
  const angle=limited.length(),sq=angle>1e-10?new Quaternion().setFromAxisAngle(limited.multiplyScalar(1/angle),angle):new Quaternion();
  let twistAngle=2*Math.atan2(new Vector3(twist.x,twist.y,twist.z).dot(axis),twist.w);
  const pt=previousParts.twist;let previousAngle=2*Math.atan2(new Vector3(pt.x,pt.y,pt.z).dot(axis),pt.w);
  while(previousAngle>Math.PI)previousAngle-=2*Math.PI;while(previousAngle< -Math.PI)previousAngle+=2*Math.PI;
  while(twistAngle-previousAngle>Math.PI)twistAngle-=2*Math.PI;while(twistAngle-previousAngle< -Math.PI)twistAngle+=2*Math.PI;
  const tq=new Quaternion().setFromAxisAngle(axis,clamp(twistAngle,...rule.hardTwist));
  const result=rq.multiply(sq.multiply(tq)).normalize(),previousQ=new Quaternion().fromArray(previous);
  if(result.dot(previousQ)<0)result.set(-result.x,-result.y,-result.z,-result.w);
  return result.toArray();
}
export function effectiveRule(name,rotations,profile){
  const original=profile.limits[name];if(!original)return null;
  const coupling=profile.couplings?.find(c=>c.bone===name);if(!coupling)return original;
  const driver=new Quaternion().fromArray(rotations[coupling.driver]||[0,0,0,1]);
  const direction=new Vector3(coupling.side==='right'?1:-1,0,0).applyQuaternion(driver);
  const lift=Math.max(0,Math.asin(clamp(direction.y,-1,1)))*coupling.gain;
  const rule=structuredClone(original);rule.hardSwing=rule.hardSwing.map(([u,v])=>[u,v+(coupling.side==='right'&&v>0?lift:coupling.side==='left'&&v<0?-lift:0)]);return rule;
}
export function quaternionDistance(a,b){return new Quaternion().fromArray(a).angleTo(new Quaternion().fromArray(b));}
