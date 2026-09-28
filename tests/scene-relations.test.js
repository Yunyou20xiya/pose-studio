import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneEngine} from '../src/scene/engine.js';
import {fresh,profile,apply,ok,add,obj,move,near,cmd} from './scene-fixture.js';
const attach=(e,id,targetId,keep=true,anchor)=>apply(e,{action:'attach',id,targetId,relation:'surface',keep,...(anchor?{anchor}:{})});

test('placing a book on a table aligns its bottom, and follows a turned and scaled table',()=>{
 const e=fresh();add(e,'table','table');add(e,'book','book');ok(attach(e,'book','table',true,[.2,.1]));near(obj(e,'book').transform.position,[.28,.75,.08]);
 ok(move(e,'table',{position:[2,.2,1],yaw:90,scale:[2,1.2,1.5]}));near(obj(e,'book').transform.position,[2.12,1.1,.44]);assert.equal(obj(e,'book').transform.yaw,90);
 assert.equal(e.read().scene.relations.length,1);
});
test('place once and detach preserve the pose while later movement is independent',()=>{
 const e=fresh();add(e,'table','table');add(e,'cup','cup');ok(attach(e,'cup','table',false));assert.equal(e.read().scene.relations?.length||0,0);near(obj(e,'cup').transform.position,[0,.75,0]);
 ok(attach(e,'cup','table'));const before=obj(e,'cup');ok(apply(e,{action:'detach',id:'cup',relation:'surface'}));assert.deepEqual(obj(e,'cup'),before);ok(move(e,'table',{position:[2,0,0]}));assert.deepEqual(obj(e,'cup'),before);
 ok(e.apply(cmd(e,{kind:'undo'})));ok(e.apply(cmd(e,{kind:'undo'})));assert.equal(e.read().scene.relations.length,1);
});
test('a stack follows in dependency order and cycles reject the complete operation',()=>{
 const e=fresh();add(e,'base','platform');add(e,'box','box');add(e,'cup','cup');ok(attach(e,'box','base'));ok(attach(e,'cup','box'));ok(move(e,'base',{position:[1,.3,2]}));near(obj(e,'cup').transform.position,[1,1.05,2]);
 const before=e.read();assert.notEqual(attach(e,'base','box').status,'applied');assert.deepEqual(e.read(),before);
});
test('locked follower, oversized item and non-surface targets reject without partial changes',()=>{
 const e=fresh();add(e,'table','table');add(e,'book','book');add(e,'ball','sphere');ok(attach(e,'book','table'));ok(apply(e,{action:'update',id:'book',value:{locked:true}}));let before=e.read();assert.notEqual(move(e,'table',{position:[1,0,0]}).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'update',id:'book',value:{locked:false}}));before=e.read();assert.notEqual(move(e,'table',{scale:[.1,1,.1]}).status,'applied');assert.deepEqual(e.read(),before);assert.notEqual(attach(e,'book','ball').status,'applied');assert.deepEqual(e.read(),before);
});
test('adjusting a bound prop updates the surface anchor while vertical movement stays on top',()=>{
 const e=fresh();add(e,'table','table');add(e,'cup','cup');ok(attach(e,'cup','table'));ok(move(e,'cup',{position:[.2,2,.1],yaw:30}));near(obj(e,'cup').transform.position,[.2,.75,.1]);ok(move(e,'table',{position:[1,0,0]}));near(obj(e,'cup').transform.position,[1.2,.75,.1]);assert.equal(obj(e,'cup').transform.yaw,30);
});
test('deletion releases dependents, copying does not inherit links, and save/reopen keeps valid links',()=>{
 const e=fresh();add(e,'table','table');add(e,'book','book');ok(attach(e,'book','table'));const original=obj(e,'book');ok(apply(e,{action:'duplicate',id:'book',newId:'copy'}));assert.equal(e.read().scene.relations.length,1);const p=e.read();assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(p)),profile).read(),p);
 ok(apply(e,{action:'remove',id:'table'}));assert.equal(e.read().scene.relations.length,0);assert.deepEqual(obj(e,'book'),original);ok(e.apply(cmd(e,{kind:'undo'})));assert.equal(e.read().scene.relations.length,1);
});
test('invalid, dangling, duplicate and inconsistent saved relationships are rejected',()=>{
 const e=fresh();add(e,'table','table');add(e,'book','book');ok(attach(e,'book','table'));const good=e.read();
 for(const change of [p=>p.scene.relations[0].targetId='missing',p=>p.scene.relations[0].anchor=[NaN,0],p=>p.scene.relations.push({...p.scene.relations[0]}),p=>p.scene.objects.find(o=>o.id==='book').transform.position[1]+=1,p=>p.scene.relations[0].unknown=true]){const p=structuredClone(good);change(p);assert.throws(()=>createSceneEngine(p,profile));}
});
