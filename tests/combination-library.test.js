import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fresh,profile,apply,ok,add,cmd} from './scene-fixture.js';
import {captureCombination} from '../src/scene/combinations.js';
const storage=await import('../server/combination-library.js').catch(()=>({}));
const thumbnail='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
function fixture(){const e=fresh();add(e,'chair','chair');ok(apply(e,{action:'attach',id:'primary',targetId:'chair',relation:'seat',keep:true}));add(e,'book','book',[0,.75,1]);ok(apply(e,{action:'look-at',id:'primary',targetId:'book',keep:true}));return e;}

test('collections survive restart and refuse an outdated revision or another project',async()=>{
 assert.equal(typeof storage.createCombinationStore,'function');const directory=await mkdtemp(join(tmpdir(),'scene-combinations-'));
 try{const e=fixture(),project=e.read(),store=storage.createCombinationStore({directory,profile,baseProject:project}),request={project,projectId:project.projectId,expectedRevision:project.revision,memberIds:['primary','chair'],name:'  椅上休息  ',thumbnail};
  const one=await store.save(request),two=await store.save(request);assert.notEqual(one.id,two.id);assert.equal(one.name,'椅上休息');assert.equal(one.detachedLinks,1);
  const reopened=await storage.createCombinationStore({directory,profile,baseProject:project}).get(one.id);assert.deepEqual(reopened.combination,one.combination);assert.equal(reopened.combination.gazeTargets.length,0);assert.equal(reopened.combination.relations.length,1);
  const files=await readdir(directory);for(const extra of [{expectedRevision:0},{projectId:'elsewhere'},{thumbnail:'broken'},{memberIds:['absent']}])await assert.rejects(store.save({...request,...extra}));assert.deepEqual(await readdir(directory),files);
  assert.deepEqual(e.read(),project);await assert.rejects(store.get('../outside'));await writeFile(join(directory,'broken.combination.json'),'{');assert.equal((await store.list()).filter(r=>r.unavailable).length,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('saving rechecks the current project after asynchronous reference verification',async()=>{
 assert.equal(typeof storage.saveCurrentCombination,'function');const directory=await mkdtemp(join(tmpdir(),'scene-combination-race-'));
 try{let current=fixture().read(),release;const gate=new Promise(r=>release=r),store=storage.createCombinationStore({directory,profile,baseProject:current});
  const pending=storage.saveCurrentCombination({store,readProject:()=>structuredClone(current),verifyProject:()=>gate,request:{projectId:current.projectId,expectedRevision:current.revision,memberIds:['primary'],name:'测试',thumbnail}});current.revision++;release();await assert.rejects(pending,/改变/);assert.deepEqual(await store.list(),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('apply adds a saved arrangement while preserving the existing actors, camera and lighting',()=>{
 const source=fixture().read(),c=captureCombination(source,{memberIds:['primary','chair','book'],name:'椅子与书'}),e=fresh(),before=e.read();
 ok(apply(e,{action:'apply-combination',combination:c,id:'new-group',idMap:{primary:'new-actor',chair:'new-chair',book:'new-book'},position:[3,0,2],yaw:90}));
 for(const field of ['snapshot','stage','layers','camera','lighting'])assert.deepEqual(e.read()[field],before[field]);assert.equal(e.read().scene.actors.length,1);assert.equal(e.read().scene.gazeTargets[0].targetId,'new-book');
 ok(e.apply(cmd(e,{kind:'undo'})));assert.equal(e.read().scene,undefined);
});
test('object-only and complete six-actor collections validate without an extra placeholder actor',async()=>{
 assert.equal(typeof storage.createCombinationStore,'function');const directory=await mkdtemp(join(tmpdir(),'scene-combination-count-'));
 try{const e=fresh();add(e,'table','table');for(let i=0;i<5;i++)ok(apply(e,{action:'add-actor',id:'actor'+i}));const p=e.read(),store=storage.createCombinationStore({directory,profile,baseProject:p});
  for(const memberIds of [['table'],['primary','actor0','actor1','actor2','actor3','actor4']]){const saved=await store.save({project:p,projectId:p.projectId,expectedRevision:p.revision,memberIds,name:'组合',thumbnail});assert.equal((await store.get(saved.id)).combination.actors.length,memberIds[0]==='table'?0:6);}
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('corrupt stored poses, external references and incompatible models cannot be applied',()=>{
 const e=fresh(),good=captureCombination(fixture().read(),{memberIds:['primary','chair','book'],name:'组合'}),before=e.read();
 for(const edit of [c=>c.actors[0].pose.snapshot.rotations.head=[0,0,0,9],c=>c.gazeTargets[0].targetId='outside',c=>c.model.sha256='a'.repeat(64),c=>c.objects[0].transform.position=[Infinity,0,0],c=>c.actors[0].pose.snapshot.gaze.target=[9,9,9]]){const c=structuredClone(good);edit(c);assert.notEqual(apply(e,{action:'apply-combination',combination:c,id:'g',idMap:{primary:'a',chair:'c',book:'b'},position:[3,0,2],yaw:0}).status,'applied');assert.deepEqual(e.read(),before);}
});
test('a stored first actor cannot silently borrow missing pose fields from the current scene',async()=>{
 assert.equal(typeof storage.createCombinationStore,'function');const directory=await mkdtemp(join(tmpdir(),'scene-combination-missing-pose-'));
 try{const p=fixture().read(),store=storage.createCombinationStore({directory,profile,baseProject:p});const item=await store.save({project:p,projectId:p.projectId,expectedRevision:p.revision,memberIds:['primary','chair','book'],name:'组合',thumbnail});
  for(const key of ['pose','snapshot','layers','stage']){const bad=structuredClone(item);if(key==='pose')delete bad.combination.actors[0].pose;else delete bad.combination.actors[0].pose[key];await writeFile(join(directory,item.id+'.combination.json'),JSON.stringify(bad));await assert.rejects(store.get(item.id));assert.equal((await store.list())[0].unavailable,true);}
 }finally{await rm(directory,{recursive:true,force:true});}
});
