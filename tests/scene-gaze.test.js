import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {fresh,profile,apply,ok,add,move,near,cmd} from './scene-fixture.js';
import {actorProject,toWorld,actorDescriptor} from '../src/scene/state.js';
import {createSceneEngine} from '../src/scene/engine.js';
import {actorClient} from '../src/view/client.js';
import {groundPoseCommand} from '../src/assets/ground-poses.js';
const look=(e,id,targetId,extra={})=>apply(e,{action:'look-at',id,targetId,keep:true,follow:1,...extra});
const gaze=(e,id='primary')=>actorProject(e.read(),id).snapshot.gaze;
const worldTarget=(e,id='primary')=>toWorld(e.read(),id,gaze(e,id).target);
const turn=(e,id,value)=>apply(e,{action:'update',id,value:{transform:{...actorDescriptor(e.read(),id).transform,...value}}});

test('look at an object center follows support movement, yaw/scale and observer placement',()=>{
 const e=fresh();add(e,'table','table',[0,0,1]);add(e,'cup','cup');ok(apply(e,{action:'attach',id:'cup',targetId:'table',relation:'surface',keep:true}));
 const before=e.read();ok(look(e,'primary','cup'));near(worldTarget(e),[0,.82,.65],1e-5);
 assert.deepEqual(e.read().snapshot.expressions,before.snapshot.expressions);for(const b of Object.keys(before.snapshot.rotations).filter(b=>!['head','neck'].includes(b)))assert.deepEqual(e.read().snapshot.rotations[b],before.snapshot.rotations[b]);
 ok(move(e,'table',{position:[1,0,2],yaw:90}));near(worldTarget(e),[.65,.82,2],1e-5);
 ok(turn(e,'primary',{position:[2,0,1],yaw:65,scale:.8}));near(worldTarget(e),[.65,.82,2],1e-5);
});
test('people can look at each other and the target follows sitting without recursive drift',async()=>{
 const e=fresh();ok(apply(e,{action:'add-actor',id:'second'}));ok(turn(e,'second',{position:[0,0,1.8],yaw:180}));ok(look(e,'primary','second'));ok(look(e,'second','primary'));
 const before=gaze(e).target;const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'second',profile);
 ok(await client.send(groundPoseCommand({...actorProject(e.read(),'second'),_actorId:'second'},'squat',profile)));assert.ok(gaze(e).target[1]<before[1]-.2);
 const stable=e.read();ok(apply(e,{action:'update',id:'second',value:{name:'朋友'}}));assert.deepEqual(e.read().snapshot,stable.snapshot);assert.deepEqual(actorProject(e.read(),'second').snapshot,actorProject(stable,'second').snapshot);
 assert.equal(e.read().scene.gazeTargets.length,2);assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(e.read())),profile).read(),e.read());
});
test('once, release, delete and duplicate have explicit lifecycle and undo restores links',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book',{keep:false}));assert.equal(e.read().scene.gazeTargets.length,0);let fixed=gaze(e);ok(move(e,'book',{position:[.3,.75,1]}));assert.deepEqual(gaze(e),fixed);
 ok(look(e,'primary','book'));ok(apply(e,{action:'duplicate',id:'primary',newId:'copy'}));assert.equal(e.read().scene.gazeTargets.length,1);
 const before=e.read().snapshot;ok(apply(e,{action:'clear-gaze',id:'primary'}));assert.deepEqual(e.read().snapshot,before);ok(e.apply(cmd(e,{kind:'undo'})));assert.equal(e.read().scene.gazeTargets.length,1);
 fixed=gaze(e);ok(apply(e,{action:'remove',id:'book'}));assert.equal(e.read().scene.gazeTargets.length,0);assert.deepEqual(gaze(e),fixed);
});
test('offset changes aim independently and zero follow preserves the head while tracking eyes',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book'));const bones=e.read().snapshot.rotations;
 ok(apply(e,{action:'adjust-gaze',id:'primary',offset:[.1,.2,-.1],follow:0}));near(worldTarget(e),[.1,.97,.9]);assert.deepEqual(e.read().snapshot.rotations,bones);
 ok(move(e,'book',{position:[.4,.75,1],yaw:90,scale:[2,1,1]}));near(worldTarget(e),[.3,.97,.8]);assert.deepEqual(e.read().snapshot.rotations,bones);
});
test('joint locks stay fixed; a locked actor makes dependent target movement atomic',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(e.apply(cmd(e,{kind:'set-locks',value:['head','neck'].map(bone=>({kind:'joint',bone,rotation:e.read().snapshot.rotations[bone]}))})));const before=e.read().snapshot.rotations;const r=look(e,'primary','book');ok(r);assert.deepEqual(e.read().snapshot.rotations,before);assert.ok(r.issues.some(i=>i.code==='GAZE_UNREACHABLE'));
 ok(apply(e,{action:'update',id:'primary',value:{locked:true}}));const p=e.read();assert.notEqual(move(e,'book',{position:[1,.75,1]}).status,'applied');assert.deepEqual(e.read(),p);
});
test('raw torso edits cannot widen gaze scope, while actor controls explicitly compose it',async()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book'));const before=e.read();const c=cmd(e,{kind:'patch',value:{rotations:{chest:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.1).toArray()}}});c.scope.bones=['chest'];c.scope.gaze=false;c.overwriteManual=['chest'];c.actorId='primary';
 assert.notEqual(e.apply(c).status,'applied');assert.deepEqual(e.read(),before);c.id=crypto.randomUUID();const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'primary',profile);ok(await client.send(c));near(worldTarget(e),[0,.77,1]);
});
test('manual head adjustment persists until the target moves, and switching gaze clears tracking',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book'));const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.1).toArray();ok(e.apply(cmd(e,{kind:'patch',value:{rotations:{head:rotation}}})));assert.deepEqual(e.read().snapshot.rotations.head,rotation);
 ok(e.apply(cmd(e,{kind:'patch',value:{gaze:{mode:'camera',target:[0,1.5,4],follow:1}}})));assert.equal(e.read().scene.gazeTargets.length,0);const fixed=e.read().snapshot;ok(move(e,'book',{position:[.2,.75,1]}));assert.deepEqual(e.read().snapshot,fixed);
});
test('preserve-manual torso requests cannot silently overwrite a manually posed head',async()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book'));ok(e.apply(cmd(e,{kind:'patch',value:{layers:[{id:'manual-head',bones:['head','neck'],expressionNames:[],manual:true}]}})));const before=e.read();const c=cmd(e,{kind:'patch',value:{rotations:{chest:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.1).toArray()}}});c.scope.bones=['chest'];c.overwriteManual=[];c.source='preset';
 const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'primary',profile);ok(await client.send(c));for(const b of ['head','neck'])assert.deepEqual(e.read().snapshot.rotations[b],before.snapshot.rotations[b]);
});
test('gaze coexists with sitting and a hand on the table, including after furniture moves',()=>{
 const e=fresh();add(e,'seat','chair');ok(apply(e,{action:'attach',id:'primary',targetId:'seat',relation:'seat',keep:true}));add(e,'table','table',[0,0,.6]);ok(apply(e,{action:'attach',id:'primary',targetId:'table',relation:'hand',hand:'rightHand',keep:true}));add(e,'book','book',[-.2,.75,.7]);const before=e.read();ok(look(e,'primary','book'));assert.deepEqual(e.read().scene.relations,before.scene.relations);assert.deepEqual(e.read().snapshot.rotations.rightHand,before.snapshot.rotations.rightHand);ok(move(e,'seat',{position:[.01,0,.01]}));near(worldTarget(e),[-.2,.77,.7]);
});
test('malformed or stale gaze references cannot open or partially change a project',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(look(e,'primary','book'));const good=e.read();for(const edit of [p=>p.scene.gazeTargets[0].targetId='missing',p=>p.scene.gazeTargets[0].targetId='primary',p=>p.scene.gazeTargets[0].offset=[NaN,0,0],p=>p.scene.gazeTargets.push({...p.scene.gazeTargets[0]}),p=>p.snapshot.gaze.target[0]+=1,p=>p.scene.gazeTargets[0].unknown=true]){const p=structuredClone(good);edit(p);assert.throws(()=>createSceneEngine(p,profile));}
 for(const extra of [{follow:NaN},{offset:[10,0,0]},{keep:'yes'},{targetId:'primary'}]){assert.notEqual(look(e,'primary','book',extra).status,'applied');assert.deepEqual(e.read(),good);}
});
