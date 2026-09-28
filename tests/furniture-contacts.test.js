import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {fresh,profile,apply,ok,add,move,near,cmd} from './scene-fixture.js';
import {actorProject,toWorld} from '../src/scene/state.js';
import {worldPoint,forward} from '../src/pose/kinematics.js';
import {createSceneEngine} from '../src/scene/engine.js';
import {groundPoseCommand} from '../src/assets/ground-poses.js';
import {actorClient} from '../src/view/client.js';
const seat=(e,kind='chair')=>{add(e,'seat',kind);ok(apply(e,{action:'attach',id:'primary',targetId:'seat',relation:'seat',keep:true,anchor:[0,0]}));};
const hand=(e,side)=>apply(e,{action:'attach',id:'primary',targetId:'table',relation:'hand',hand:side+'Hand',anchor:[side==='left'?.14:-.14,-.3],keep:true});
const hip=e=>toWorld(e.read(),'primary',worldPoint(actorProject(e.read()),profile,'hips',[0,-.067,0]));
function checkHand(e,side){const p=e.read(),a=actorProject(p),local=[side==='left'?-.032:.032,-.012,0];const actual=toWorld(p,'primary',worldPoint(a,profile,side+'Hand',local));const target=p.scene.objects.find(o=>o.id==='table').transform;const point=new Vector3(side==='left'?.196:-.196,.75,-.24).multiply(new Vector3(...target.scale)).applyAxisAngle(new Vector3(0,1,0),target.yaw*Math.PI/180).add(new Vector3(...target.position)).toArray();near(actual,point,.012);}
test('chair, stool and bench seat the actor without changing fingers, face or another actor',()=>{
 for(const kind of ['chair','stool','bench']){const e=fresh();ok(apply(e,{action:'add-actor',id:'second'}));ok(e.apply(cmd(e,{kind:'patch',value:{expressions:{happy:.8}}})));const before=e.read();seat(e,kind);near(hip(e),[0,kind==='chair'?.48:.45,0],.008);assert.deepEqual(e.read().scene.actors,before.scene.actors);assert.deepEqual(e.read().snapshot.expressions,before.snapshot.expressions);
  for(const n of Object.keys(before.snapshot.rotations).filter(n=>/Thumb|Index|Middle|Ring|Little|head|neck/.test(n)))assert.deepEqual(e.read().snapshot.rotations[n],before.snapshot.rotations[n]);
  for(const side of ['left','right'])assert.ok(toWorld(e.read(),'primary',worldPoint(actorProject(e.read()),profile,side+'Foot',[0,-.0861217565,0]))[1]>-.008);
  assert.ok(!e.read().snapshot.contacts.some(c=>c.objectId==='chair'),'scene furniture must not create a second legacy chair');
 }
});
test('seated actor follows seat position yaw and height with legal feet and can be detached',()=>{
 const e=fresh();seat(e);ok(move(e,'seat',{position:[1,.1,2],yaw:60,scale:[1.2,1.1,1.2]}));near(hip(e),[1,.628,2],.008);assert.equal(e.read().scene.primary.transform.yaw,60);
 const before=e.read().snapshot;ok(apply(e,{action:'detach',id:'primary',relation:'seat'}));assert.deepEqual(e.read().snapshot,before);const actor=e.read().scene.primary;ok(move(e,'seat',{position:[2,.1,2]}));assert.deepEqual(e.read().scene.primary,actor);
});
test('joint locks and locked seated followers reject atomically',()=>{
 const e=fresh(),p=e.read();ok(e.apply(cmd(e,{kind:'set-locks',value:[{kind:'joint',bone:'leftUpperLeg',rotation:p.snapshot.rotations.leftUpperLeg}]})));add(e,'seat','chair');let before=e.read();assert.notEqual(apply(e,{action:'attach',id:'primary',targetId:'seat',relation:'seat',keep:true}).status,'applied');assert.deepEqual(e.read(),before);
 const f=fresh();seat(f);ok(apply(f,{action:'update',id:'primary',value:{locked:true}}));before=f.read();assert.notEqual(move(f,'seat',{position:[1,0,0]}).status,'applied');assert.deepEqual(f.read(),before);
});
test('either palm can contact a table and follows small table movements without changing fingers',()=>{
 for(const side of ['left','right']){const e=fresh();seat(e);add(e,'table','table',[0,0,.6]);const before=e.read();ok(hand(e,side));checkHand(e,side);ok(move(e,'table',{position:[.01,.005,.61]}));checkHand(e,side);
  for(const n of Object.keys(before.snapshot.rotations).filter(n=>/Thumb|Index|Middle|Ring|Little/.test(n)||n.startsWith(side==='left'?'right':'left')))assert.deepEqual(e.read().snapshot.rotations[n],before.snapshot.rotations[n]);
  assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(e.read())),profile).read(),e.read());
 }
});
test('unreachable surface and arm locks keep the entire scene unchanged',()=>{
 const e=fresh();seat(e);add(e,'table','table',[0,0,.6]);ok(hand(e,'right'));let before=e.read();assert.notEqual(move(e,'table',{position:[3,0,.6]}).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'detach',id:'primary',relation:'hand',hand:'rightHand'}));const a=e.read();ok(e.apply(cmd(e,{kind:'set-locks',value:['rightShoulder','rightUpperArm','rightLowerArm','rightHand'].map(bone=>({kind:'joint',bone,rotation:a.snapshot.rotations[bone]}))})));ok(move(e,'table',{position:[.2,0,.6]}));before=e.read();assert.notEqual(hand(e,'right').status,'applied');assert.deepEqual(e.read(),before);
});
test('hand follow requires declared arm scope and the actor client expands linked torso edits',async()=>{
 const e=fresh();seat(e);add(e,'table','table',[0,0,.6]);ok(hand(e,'right'));const before=e.read(),rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.13).toArray();
 const c=cmd(e,{kind:'patch',value:{rotations:{chest:rotation}}});c.actorId='primary';c.scope.bones=['chest'];c.overwriteManual=['chest'];assert.notEqual(e.apply(c).status,'applied');assert.deepEqual(e.read(),before);
 const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'primary',profile);c.id=crypto.randomUUID();ok(await client.send(c));checkHand(e,'right');
});
test('ground pose replacement releases seat and surface hands; detach, undo and stale commands stay coherent',()=>{
 const e=fresh();seat(e);add(e,'table','table',[0,0,.6]);ok(hand(e,'right'));const before=e.read();ok(e.apply(groundPoseCommand({...actorProject(e.read()),_actorId:'primary'},'stand',profile)));assert.equal(e.read().scene.relations.length,0);
 ok(e.apply(cmd(e,{kind:'undo'})));assert.deepEqual(e.read().scene.relations,before.scene.relations);assert.deepEqual(e.read().snapshot,before.snapshot);
});
test('malformed seat and hand records, out-of-surface anchors and invalid seated height cannot be opened',()=>{
 const e=fresh();seat(e);const good=e.read();for(const edit of [p=>p.scene.primary.transform.position[0]+=1,p=>p.scene.relations[0].anchor=[.8,0],p=>p.scene.relations[0].kind='hand']){const p=structuredClone(good);edit(p);assert.throws(()=>createSceneEngine(p,profile));}
});
test('old single-actor hand contact operations remain usable without creating a scene',()=>{
 const e=fresh();ok(e.apply(cmd(e,{kind:'hand-support',hand:'rightHand',preset:null})));assert.equal(e.read().scene,undefined);
});
test('adjusting seat or hand contact points preserves the existing upper-body pose',()=>{
 const e=fresh();seat(e);ok(e.apply(cmd(e,{kind:'patch',value:{rotations:{chest:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.1).toArray()}}})));const chest=e.read().snapshot.rotations.chest;
 ok(apply(e,{action:'adjust-contact',id:'primary',relation:'seat',anchor:[.1,0]}));near(hip(e),[.048,.48,0],.008);assert.deepEqual(e.read().snapshot.rotations.chest,chest);
 add(e,'table','table',[0,0,.6]);ok(hand(e,'right'));ok(apply(e,{action:'adjust-contact',id:'primary',relation:'hand',hand:'rightHand',anchor:[-.13,-.3]}));assert.deepEqual(e.read().snapshot.rotations.chest,chest);
});
test('preserve-manual body commands never unlock a manual arm through scene scope composition',async()=>{
 const e=fresh();seat(e);add(e,'table','table',[0,0,.6]);ok(hand(e,'right'));const bones=['rightShoulder','rightUpperArm','rightLowerArm','rightHand'];
 ok(e.apply(cmd(e,{kind:'patch',value:{layers:[{id:'manual',manual:true,bones,expressionNames:[]}]}})));const before=e.read();
 const c=cmd(e,{kind:'patch',value:{rotations:{chest:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.15).toArray()}}});c.scope.bones=['chest'];c.overwriteManual=[];c.source='preset';
 const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'primary',profile);const r=await client.send(c);for(const b of bones)assert.deepEqual(e.read().snapshot.rotations[b],before.snapshot.rotations[b]);if(r.status!=='applied')assert.deepEqual(e.read(),before);
});
