import {actorDescriptor,actorProject,putActorProject} from '../scene/state.js';
import {handGesture} from '../assets/gestures.js';
import {handClearanceDetails,handVolumes} from './hand-clearance.js';
import {segmentDistance} from './contacts.js';
import {projectJoint,effectiveRule} from './limits.js';
import {same} from './state.js';

// Search coupled finger bends, not free rotations: each candidate remains a
// recognisable hand shape. The palms and the approved arm solution stay fixed.
export function settleHandFingers(p,r,profile,{overwriteManual=false}={}){
 if(r.preset==='palms-together')return;
 const expected=.25+r.strength*.36,values=new Map(),entries=[];
 for(const h of r.hands){if(actorDescriptor(p,h.actorId).locked)continue;const a=actorProject(p,h.actorId),side=h.hand.replace('Hand','');const protectedBones=new Set([...a.snapshot.locks.filter(l=>l.kind==='joint').map(l=>l.bone),...(!overwriteManual?a.layers.filter(l=>l.manual).flatMap(l=>l.bones):[])]);
  for(const digit of ['Index','Middle','Ring','Little']){const bones=['Proximal','Intermediate','Distal'].map(n=>side+digit+n);if(bones.some(n=>protectedBones.has(n)))continue;const id=h.actorId+side+digit;entries.push({...h,side,digit,bones,id});values.set(id,expected);}
 }
 const score=()=>{
  const depths=handClearanceDetails(p,r,profile,{threshold:0}).map(x=>Math.max(0,x.depth-.001));
  const hands=r.hands.map(h=>handVolumes(p,h,profile));let gap=Infinity;
  for(const a of hands[0].segments)for(const b of hands[1].segments)gap=Math.min(gap,segmentDistance(a.a,a.b,b.a,b.b)-a.radius-b.radius);
  return depths.reduce((n,d)=>n+d*d*8,0)+Math.max(0,gap-.002)**2*4+[...values.values()].reduce((n,c)=>n+(c-expected)**2*.00002,0);
 };
 let best=score();
 for(const step of [.15,.06,.025])for(let pass=0;pass<2;pass++)for(const entry of entries){
  const a=actorProject(p,entry.actorId),old=entry.bones.map(b=>a.snapshot.rotations[b]),start=values.get(entry.id);let chosen=start,bestRotations=old;
  for(const sign of [-1,1]){
   const value=Math.max(.06,Math.min(.86,start+step*sign));values.set(entry.id,value);const patch=handGesture('fist',entry.side,value,.1,profile).rotations;
   for(const bone of entry.bones)a.snapshot.rotations[bone]=projectJoint(patch[bone],effectiveRule(bone,a.snapshot.rotations,profile),a.snapshot.rotations[bone]);putActorProject(p,entry.actorId,a);
   const next=score();if(next<best-1e-10){best=next;chosen=value;bestRotations=entry.bones.map(b=>a.snapshot.rotations[b]);}
  }
  values.set(entry.id,chosen);entry.bones.forEach((b,i)=>a.snapshot.rotations[b]=bestRotations[i]);
  if(!same(old,bestRotations)){a.layers=a.layers.map(l=>({...l,bones:l.bones.filter(b=>!entry.bones.includes(b))})).filter(l=>l.bones.length||l.expressionNames.length);a.layers.push({id:'finger-fit-'+r.id+'-'+entry.side+'-'+entry.digit,sourceAsset:r.preset,manual:false,bones:entry.bones,expressionNames:[]});}
  putActorProject(p,entry.actorId,a);
 }
}
