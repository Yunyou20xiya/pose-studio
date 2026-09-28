import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,profile,apply,ok,add,move,near,cmd,obj} from './scene-fixture.js';
import {actorDescriptor,actorProject,toWorld} from '../src/scene/state.js';
import {createSceneEngine} from '../src/scene/engine.js';

const group=(e,ids,id='group')=>apply(e,{action:'group-create',id,name:'桌边一组',memberIds:ids});
const shift=(e,position,yaw=0)=>apply(e,{action:'group-transform',id:'group',position,yaw});
function tableScene(){
 const e=fresh();add(e,'chair','chair');ok(apply(e,{action:'attach',id:'primary',targetId:'chair',relation:'seat',keep:true}));
 add(e,'table','table',[0,0,.6]);ok(apply(e,{action:'attach',id:'primary',targetId:'table',relation:'hand',hand:'rightHand',keep:true}));
 add(e,'book','book',[-.2,0,.7]);ok(apply(e,{action:'attach',id:'book',targetId:'table',relation:'surface',anchor:[-.1,0],keep:true}));
 ok(apply(e,{action:'look-at',id:'primary',targetId:'book',keep:true}));return e;
}

test('a group moves and turns as a rigid arrangement without changing any member pose',()=>{
 const e=tableScene();ok(group(e,['primary','chair','table','book']));const before=e.read(),g=before.scene.groups[0];
 ok(shift(e,[2,0,3],90));
 for(const id of g.memberIds){const old=actorDescriptor(before,id)||before.scene.objects.find(o=>o.id===id),now=actorDescriptor(e.read(),id)||obj(e,id);near(now.transform.position,[2+old.transform.position[2]-g.position[2],old.transform.position[1],3-old.transform.position[0]+g.position[0]]);assert.equal(now.transform.yaw,old.transform.yaw+90);}
 assert.deepEqual(e.read().snapshot,before.snapshot);assert.deepEqual(e.read().layers,before.layers);assert.deepEqual(e.read().scene.relations,before.scene.relations);assert.deepEqual(e.read().camera,before.camera);assert.deepEqual(e.read().lighting,before.lighting);
 const moved=e.read();ok(e.apply(cmd(e,{kind:'undo'})));assert.deepEqual(e.read().scene,before.scene);ok(e.apply(cmd(e,{kind:'redo'})));assert.deepEqual(e.read().scene,moved.scene);
});
test('copying a group remaps internal contacts and gaze and can move independently',()=>{
 const e=tableScene();ok(group(e,['primary','chair','table','book']));const before=e.read();
 ok(apply(e,{action:'group-duplicate',id:'group',newId:'copy',idMap:{primary:'actor-copy',chair:'chair-copy',table:'table-copy',book:'book-copy'},position:[4,0,0],yaw:30}));
 assert.equal(e.read().scene.groups.length,2);assert.deepEqual(actorProject(e.read(),'primary').snapshot,before.snapshot);
 assert.deepEqual(e.read().scene.gazeTargets.at(-1),{subjectId:'actor-copy',targetId:'book-copy',offset:[0,0,0]});
 assert.ok(e.read().scene.relations.some(r=>r.subjectId==='actor-copy'&&r.targetId==='chair-copy'&&r.kind==='seat'));
 const originalChair=obj(e,'chair').transform;ok(apply(e,{action:'group-transform',id:'copy',position:[5,0,2],yaw:90}));assert.deepEqual(obj(e,'chair').transform,originalChair);
 assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(e.read())),profile).read(),e.read());
});
test('locked members and contact links across the group boundary reject the whole move',()=>{
 const e=tableScene();ok(group(e,['primary','chair']));let before=e.read();assert.notEqual(shift(e,[2,0,0]).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'group-dissolve',id:'group'}));ok(group(e,['primary','chair','table','book']));ok(apply(e,{action:'update',id:'book',value:{locked:true}}));before=e.read();assert.notEqual(shift(e,[2,0,0]).status,'applied');assert.deepEqual(e.read(),before);
});
test('outside gaze observers follow a group and a locked observer rejects its movement atomically',()=>{
 const e=fresh();add(e,'book','book',[0,.75,1]);ok(group(e,['book']));ok(apply(e,{action:'look-at',id:'primary',targetId:'book',keep:true}));
 ok(shift(e,[1,0,2],90));near(toWorld(e.read(),'primary',e.read().snapshot.gaze.target),[1,.77,2]);
 ok(apply(e,{action:'update',id:'primary',value:{locked:true}}));const before=e.read();assert.notEqual(shift(e,[2,0,2],90).status,'applied');assert.deepEqual(e.read(),before);
});
test('individual editing, primary promotion, removal and dissolve keep membership valid',()=>{
 const e=fresh();ok(apply(e,{action:'add-actor',id:'friend'}));add(e,'cup','cup');ok(group(e,['primary','friend','cup']));
 ok(move(e,'cup',{position:[.2,0,.3]}));assert.deepEqual(e.read().scene.groups[0].memberIds,['primary','friend','cup']);
 ok(apply(e,{action:'remove',id:'primary'}));assert.equal(e.read().scene.primary.id,'friend');assert.deepEqual(e.read().scene.groups[0].memberIds,['friend','cup']);
 const before=e.read();ok(apply(e,{action:'group-dissolve',id:'group'}));assert.deepEqual(e.read().snapshot,before.snapshot);assert.deepEqual(e.read().scene.objects,before.scene.objects);assert.equal(e.read().scene.groups.length,0);
});
test('group membership and transforms reject malformed values without partial changes',()=>{
 const e=fresh();add(e,'cup','cup');ok(group(e,['cup']));const before=e.read();
 for(const op of [{action:'group-create',id:'other',name:'重复',memberIds:['cup']},{action:'group-transform',id:'group',position:[0,1,0],yaw:0},{action:'group-transform',id:'group',position:[NaN,0,0],yaw:0},{action:'group-create',id:'cup',name:'冲突',memberIds:['primary']},{action:'group-create',id:'other',name:'不存在',memberIds:['missing']}]){assert.notEqual(apply(e,op).status,'applied');assert.deepEqual(e.read(),before);}
 for(const edit of [p=>p.scene.groups[0].memberIds.push('missing'),p=>p.scene.groups[0].memberIds.push('cup'),p=>p.scene.groups.push({...p.scene.groups[0],id:'other'}),p=>p.scene.groups[0].position=[0,NaN,0]]){const p=structuredClone(before);edit(p);assert.throws(()=>createSceneEngine(p,profile));}
});
test('copy capacity and ID collisions cannot partially add a combination',()=>{
 const e=fresh();add(e,'cup','cup');ok(group(e,['primary','cup']));for(let i=0;i<5;i++)ok(apply(e,{action:'add-actor',id:'actor'+i}));const before=e.read();
 assert.notEqual(apply(e,{action:'group-duplicate',id:'group',newId:'copy',idMap:{primary:'copy-person',cup:'copy-cup'},position:[4,0,0],yaw:0}).status,'applied');assert.deepEqual(e.read(),before);
});
