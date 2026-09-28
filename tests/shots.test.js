import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {profile,fresh,apply,ok,cmd} from './scene-fixture.js';
import {createSceneEngine} from '../src/scene/engine.js';
import {fullScope,makeCommand} from '../src/pose/state.js';
const shots=await import('../server/shot-library.js').catch(()=>({}));
const thumbnail='data:image/png;base64,'+(await readFile(new URL('./fixtures/repair-64.png',import.meta.url))).toString('base64');

async function setup(t){
 assert.equal(typeof shots.createShotStore,'function');
 const directory=await mkdtemp(join(tmpdir(),'pose-shots-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const engine=fresh();ok(apply(engine,{action:'add-actor',id:'second'}));ok(apply(engine,{action:'add-object',id:'table',type:'table',position:[2,0,0]}));
 const initial=engine.read(),refs={[initial.model.id]:initial.model,[initial.profile.id]:initial.profile};
 let current=initial,verify=async()=>{};
 const options={directory,profile,refs,readProject:()=>structuredClone(current),verifyProject:p=>verify(p)};
 const store=shots.createShotStore(options);
 const request=async extra=>({projectId:current.projectId,expectedRevision:current.revision,expectedBoardRevision:(await store.list(current.projectId)).revision,...extra});
 return{store,directory,options,engine,initial,request,get:()=>current,set:p=>{current=structuredClone(p);},verify:f=>{verify=f;}};
}

test('shot cards persist the entire multi-actor scene without editing the live project',async t=>{
 const h=await setup(t),before=structuredClone(h.get());
 const saved=await h.store.save(await h.request({name:'  手部近景  ',note:'手挡在光与脸之间',thumbnail}));
 assert.deepEqual(h.get(),before);
 const reopened=shots.createShotStore(h.options),item=await reopened.get({projectId:before.projectId,id:saved.id});
 assert.equal(item.name,'手部近景');assert.equal(item.note,'手挡在光与脸之间');assert.equal(item.thumbnail,thumbnail);assert.deepEqual(item.project,before);
 const list=await reopened.list(before.projectId);assert.equal(list.shots.length,1);assert.equal(list.shots[0].matchesCurrent,true);assert.equal(list.shots[0].actors,2);assert.equal(list.shots[0].objects,1);
});

test('opening a card preserves unsaved work on disk, restores the whole scene and can be undone',async t=>{
 const h=await setup(t),saved=await h.store.save(await h.request({name:'原镜头',thumbnail}));
 ok(h.engine.apply(cmd(h.engine,{kind:'patch',value:{expressions:{blink:.7},camera:{...h.initial.camera,fov:22},lighting:{...h.initial.lighting,keyIntensity:1.2}}},'second')));
 h.set(h.engine.read());const manual=structuredClone(h.get());
 const prepared=await h.store.prepareOpen(await h.request({id:saved.id}));assert.deepEqual(h.get(),manual);
 const board=await shots.createShotStore(h.options).list(manual.projectId);assert.equal(board.recoveries.length,1);
 assert.deepEqual((await h.store.get({projectId:manual.projectId,id:board.recoveries[0].id})).project,manual);
 const engine=createSceneEngine(manual,profile);ok(engine.apply(prepared.command));
 assert.deepEqual({...engine.read(),revision:h.initial.revision},h.initial);
 ok(engine.apply(makeCommand(engine.read(),[{kind:'undo'}],fullScope(engine.read()))));
 assert.deepEqual({...engine.read(),revision:manual.revision},manual);
});

test('updating a card retains the previous picture and scene as a recoverable version',async t=>{
 const h=await setup(t),saved=await h.store.save(await h.request({name:'近景',thumbnail}));
 const manual=structuredClone(h.get());manual.camera.fov=20;manual.revision++;h.set(manual);
 const updated=await h.store.save(await h.request({id:saved.id,name:'近景 · 微调',note:'再靠近一点',thumbnail}));
 assert.equal(updated.id,saved.id);
 const board=await h.store.list(manual.projectId);assert.equal(board.shots.length,1);assert.equal(board.recoveries.length,1);
 assert.deepEqual((await h.store.get({projectId:manual.projectId,id:board.recoveries[0].id})).project,h.initial);
 assert.deepEqual((await h.store.get({projectId:manual.projectId,id:saved.id})).project,manual);
});

test('stale scene or board versions and cross-project requests cannot overwrite saved cards',async t=>{
 const h=await setup(t),request=await h.request({name:'最初镜头',thumbnail});
 const saved=await h.store.save(request),before=await h.store.list(h.initial.projectId);
 await assert.rejects(h.store.save({...request,name:'过期页面'}),/改变/);
 await assert.rejects(h.store.save({...request,expectedBoardRevision:before.revision,expectedRevision:request.expectedRevision-1}),/改变/);
 await assert.rejects(h.store.save({...request,expectedBoardRevision:before.revision,projectId:'another-project'}),/改变/);
 await assert.rejects(h.store.prepareOpen({...request,id:saved.id}),/改变/);
 assert.deepEqual(await h.store.list(h.initial.projectId),before);
});

test('asynchronous source validation rechecks the live scene before saving',async t=>{
 const h=await setup(t);let finish,entered;
 const gate=new Promise(resolve=>finish=resolve),started=new Promise(resolve=>entered=resolve);
 h.verify(async()=>{entered();await gate;});
 const pending=h.store.save(await h.request({name:'不能错存'}));await started;
 const changed=structuredClone(h.get());changed.revision++;changed.camera.fov=25;h.set(changed);finish();
 await assert.rejects(pending,/改变/);assert.equal((await h.store.list(h.initial.projectId)).shots.length,0);
});

test('concurrent saves from the same board revision cannot silently overwrite one another',async t=>{
 const h=await setup(t),request=await h.request({name:'镜头 A'});
 const results=await Promise.allSettled([h.store.save(request),h.store.save({...request,name:'镜头 B'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await h.store.list(h.initial.projectId)).shots.length,1);
});

test('AI can add an ordered batch without changing the live scene, and a bad member rejects the entire batch',async t=>{
 const h=await setup(t),close=structuredClone(h.get());close.camera.fov=20;
 await h.store.import(await h.request({shots:[{name:'全景',project:h.initial},{name:'特写',project:close}]}));
 const board=await h.store.list(h.initial.projectId);assert.deepEqual(board.shots.map(s=>s.name),['全景','特写']);assert.deepEqual(h.get(),h.initial);
 const bad=structuredClone(close);bad.snapshot.expressions.blink=4;
 await assert.rejects(h.store.import(await h.request({shots:[{name:'正常',project:close},{name:'错误',project:bad}]})));
 assert.deepEqual(await h.store.list(h.initial.projectId),board);
 const wrong=structuredClone(close);wrong.model.sha256='0'.repeat(64);
 await assert.rejects(h.store.import(await h.request({shots:[{name:'错模型',project:wrong}]})),/版本|模型|文件/);
});

test('reordering changes only the sequence, rejects duplicate ids, and survives reload',async t=>{
 const h=await setup(t);
 await h.store.import(await h.request({shots:[{name:'一',project:h.initial},{name:'二',project:h.initial},{name:'三',project:h.initial}]}));
 const before=await h.store.list(h.initial.projectId),ids=before.shots.map(s=>s.id);
 await h.store.reorder(await h.request({ids:[ids[2],ids[0],ids[1]]}));
 const after=await shots.createShotStore(h.options).list(h.initial.projectId);assert.deepEqual(after.shots.map(s=>s.name),['三','一','二']);assert.deepEqual(h.get(),h.initial);
 await assert.rejects(h.store.reorder(await h.request({ids:[ids[0],ids[0],ids[2]]})));
 assert.deepEqual(await h.store.list(h.initial.projectId),after);
});

test('saved scenes are deduplicated during automatic recovery and thumbnails cannot attach to a different scene',async t=>{
 const h=await setup(t),saved=await h.store.save(await h.request({name:'原镜头'}));
 await h.store.prepareOpen(await h.request({id:saved.id}));assert.equal((await h.store.list(h.initial.projectId)).recoveries.length,0);
 await h.store.setThumbnail(await h.request({id:saved.id,thumbnail}));
 const different=structuredClone(h.get());different.revision++;different.camera.fov=20;h.set(different);
 await assert.rejects(h.store.setThumbnail(await h.request({id:saved.id,thumbnail})),/画面|现场/);
 assert.equal((await h.store.get({projectId:h.initial.projectId,id:saved.id})).thumbnail,thumbnail);
});

test('invalid names, thumbnails, traversal and broken storage do not replace a good board',async t=>{
 const h=await setup(t),saved=await h.store.save(await h.request({name:'保留',thumbnail})),before=await h.store.list(h.initial.projectId);
 await assert.rejects(h.store.save(await h.request({name:'  '})));
 await assert.rejects(h.store.save(await h.request({name:'坏图',thumbnail:'data:image/png;base64,broken'})));
 await assert.rejects(h.store.get({projectId:'../outside',id:saved.id}));
 await assert.rejects(h.store.get({projectId:h.initial.projectId,id:'../outside'}));
 assert.deepEqual(await h.store.list(h.initial.projectId),before);
 await writeFile(join(h.directory,h.initial.projectId+'.shots.json'),'{');
 await assert.rejects(h.store.save({...await h.request({}).catch(()=>({projectId:h.initial.projectId,expectedRevision:h.initial.revision,expectedBoardRevision:before.revision})),name:'不能覆盖坏档'}));
 assert.equal(await readFile(join(h.directory,h.initial.projectId+'.shots.json'),'utf8'),'{');
});
