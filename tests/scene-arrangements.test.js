import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,profile,apply,ok,cmd,add} from './scene-fixture.js';
import * as plans from '../src/scene/arrangements.js';
import {captureCombination} from '../src/scene/combinations.js';
const arrange=(e,steps)=>apply(e,{action:'arrange',label:'桌边看书',steps});
const scene=op=>({kind:'scene',...op});
const steps=[scene({action:'add-object',id:'chair',type:'chair',position:[0,0,0]}),scene({action:'attach',id:'primary',targetId:'chair',relation:'seat',keep:true}),scene({action:'add-object',id:'book',type:'book',position:[0,.75,1]}),scene({action:'look-at',id:'primary',targetId:'book',keep:true}),scene({action:'group-create',id:'reading',name:'看书',memberIds:['primary','chair','book']})];

test('an AI arrangement applies existing steps atomically with one revision and one undo',()=>{
 const e=fresh(),before=e.read();const r=arrange(e,steps);ok(r);assert.equal(e.read().revision,before.revision+1);assert.equal(e.read().scene.groups[0].id,'reading');assert.equal(e.read().scene.relations[0].targetId,'chair');assert.equal(e.read().scene.gazeTargets[0].targetId,'book');
 ok(e.apply(cmd(e,{kind:'undo'})));assert.deepEqual({...e.read(),revision:before.revision},before);ok(e.apply(cmd(e,{kind:'redo'})));assert.equal(e.read().scene.groups[0].id,'reading');
});
test('an impossible later step rolls back every earlier object and actor change',()=>{
 const e=fresh(),before=e.read();const r=arrange(e,[...steps,scene({action:'add-object',id:'bad',type:'unknown'})]);assert.notEqual(r.status,'applied');assert.deepEqual(e.read(),before);assert.ok(r.issues.some(i=>i.message.includes('第 6 步')));
});
test('an arrangement does not widen a body command scope or bypass locks',()=>{
 const e=fresh();const before=e.read();const body={operations:[{kind:'patch',value:{rotations:{head:[0,.1,0,Math.sqrt(.99)]}}}],scope:{bones:[],expressions:[],root:false,gaze:false,camera:false,lighting:false,stage:false},overwriteManual:[]};
 assert.notEqual(arrange(e,[steps[0],body]).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'update',id:'primary',value:{locked:true}}));const locked=e.read();assert.notEqual(arrange(e,steps).status,'applied');assert.deepEqual(e.read(),locked);
});
test('arrangements can address a secondary actor and never touch the primary pose',()=>{
 const e=fresh();ok(apply(e,{action:'add-actor',id:'friend'}));const before=e.read();
 ok(arrange(e,[{actorId:'friend',operations:[{kind:'patch',value:{expressions:{happy:.7}}}],scope:{bones:[],expressions:['happy'],root:false,gaze:false,camera:false,lighting:false,stage:false},overwriteManual:[]}]));assert.deepEqual(e.read().snapshot,before.snapshot);assert.equal(e.read().scene.actors[0].pose.snapshot.expressions.happy,.7);
});
test('nested arrangements and history or restore steps are rejected without side effects',()=>{
 const e=fresh(),before=e.read();for(const extra of [[],[scene({action:'arrange',label:'nested',steps})],[{operations:[{kind:'restore',project:before}]}],[{operations:[{kind:'undo'}]}],[{operations:[{kind:'redo'}]}]]){assert.notEqual(arrange(e,extra).status,'applied');assert.deepEqual(e.read(),before);}
 const c=cmd(e,{kind:'scene',action:'arrange',label:'过期',steps});add(e,'existing','cup');const newer=e.read();assert.equal(e.apply(c).status,'conflict');assert.deepEqual(e.read(),newer);
});
test('AI plans reference a saved combination by ID and retain predictable member IDs for later steps',async()=>{
 assert.equal(typeof plans.expandArrangement,'function');const source=fresh();add(source,'chair','chair');const combination=captureCombination(source.read(),{name:'人物与椅子',memberIds:['primary','chair']});
 const plan={label:'坐下',steps:[{kind:'scene',action:'use-combination',combinationId:'my-seat',id:'seat-group',idMap:{primary:'reader',chair:'seat'},position:[2,0,0],yaw:0},scene({action:'attach',id:'reader',targetId:'seat',relation:'seat',keep:true})]},before=structuredClone(plan);
 const expanded=await plans.expandArrangement(plan,async id=>{assert.equal(id,'my-seat');return{combination};});const e=fresh();ok(e.apply(plans.buildArrangementCommand(e.read(),expanded)));assert.equal(e.read().scene.relations[0].subjectId,'reader');assert.equal(e.read().scene.relations[0].targetId,'seat');assert.deepEqual(plan,before);
});
