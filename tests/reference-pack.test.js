import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fresh} from './scene-fixture.js';
import {ensureScene} from '../src/scene/state.js';
const pack=await import('../server/reference-pack.js').catch(()=>({}));
const render=await import('../src/exports/reference-spec.js').catch(()=>({}));
const png=await readFile(new URL('./fixtures/repair-64.png',import.meta.url)),image='data:image/png;base64,'+png.toString('base64');
async function setup(t){assert.equal(typeof pack.saveReferencePackage,'function');const directory=await mkdtemp(join(tmpdir(),'pose-reference-'));t.after(()=>rm(directory,{recursive:true,force:true}));const project=fresh().read();project.camera={...project.camera,width:64,height:64};return{directory,project};}
function request(p){return{projectId:p.projectId,expectedRevision:p.revision,title:'镜头 <一>',intent:'保留动作与光影',camera:{...p.camera,up:[0,1,0]},depth:{near:1,far:6},images:{normal:image,source:image,structure:image,depth:image,segments:image},details:[{actorId:'primary',part:'head',rect:{x:0,y:0,width:64,height:64},source:'normal.png',image}]};}
test('reference package saves aligned passes, scene and mapped detail crops without mutating live scene',async t=>{
 const h=await setup(t),before=structuredClone(h.project),saved=await pack.saveReferencePackage({...h,readProject:()=>h.project,request:request(h.project)}),m=JSON.parse(await readFile(join(saved.directory,'manifest.json')));
 assert.deepEqual(h.project,before);assert.deepEqual(JSON.parse(await readFile(join(saved.directory,'scene.pose.json'))),before);assert.equal(m.status,'reference-ready');assert.deepEqual(m.camera,{...h.project.camera,up:[0,1,0]});assert.equal(m.files['source.png'].width,64);assert.deepEqual(m.details[0].rect,{x:0,y:0,width:64,height:64});assert.equal(m.segmentation.legend[0].id,'primary');
 for(const n of ['normal','source','structure','depth','segments'])assert.deepEqual(await readFile(join(saved.directory,n+'.png')),png);
 assert.equal(m.details[0].source,'normal.png');assert.equal(m.references.normal.file,'normal.png');assert.equal(m.references.lit.file,'source.png');assert.deepEqual(m.references.lit.lighting,h.project.lighting);
 assert.match(await readFile(join(saved.directory,'index.html'),'utf8'),/镜头 &lt;一&gt;/);
 const second=await pack.saveReferencePackage({...h,readProject:()=>h.project,request:request(h.project)});assert.notEqual(saved.directory,second.directory);
});
test('stale versions, changed cameras, missing passes and invalid crops never publish a partial package',async t=>{
 const h=await setup(t),base=request(h.project);
 for(const patch of [{expectedRevision:-1},{camera:{...base.camera,fov:70}},{images:{...base.images,normal:null}},{images:{...base.images,depth:null}},{depth:{near:6,far:1}},{details:[{...base.details[0],source:'source.png'}]},{details:[{...base.details[0],rect:{x:60,y:0,width:64,height:64}}]},{details:[{...base.details[0],actorId:'missing'}]}]){
  await assert.rejects(pack.saveReferencePackage({...h,readProject:()=>h.project,request:{...base,...patch}}));assert.deepEqual(await readdir(h.directory),[]);
 }
 let n=0;await assert.rejects(pack.saveReferencePackage({...h,readProject:()=>++n===1?h.project:{...h.project,revision:1},request:base}),/改变/);assert.deepEqual(await readdir(h.directory),[]);
});
test('package viewer only serves files declared in its manifest, with escaped user labels',async t=>{
 const h=await setup(t),saved=await pack.saveReferencePackage({...h,readProject:()=>h.project,request:request(h.project)});
 assert.deepEqual((await pack.readReferenceFile(h.directory,saved.id,'source.png')).bytes,png);
 assert.deepEqual((await pack.readReferenceFile(h.directory,saved.id,'normal.png')).bytes,png);
 for(const [id,name]of [['..','source.png'],[saved.id,'../manifest.json'],[saved.id,'connection.json']])await assert.rejects(pack.readReferenceFile(h.directory,id,name));
});
test('projection crops use the output camera including roll and reject points behind or outside it',()=>{
 assert.equal(typeof render.projectedCrop,'function');const camera={position:[0,0,2],target:[0,0,0],up:[0,1,0],fov:60,width:640,height:480};
 const rect=render.projectedCrop([[0,0,0],[.1,.1,0]],camera,{padding:0});assert.ok(rect.x>=320);assert.ok(rect.y<240);assert.ok(rect.x+rect.width<=640);
 assert.equal(render.projectedCrop([[100,0,0]],camera),null);assert.equal(render.projectedCrop([[0,0,3]],camera),null);
 const rolled=render.projectedCrop([[.3,0,0]],{...camera,up:[1,0,0]},{padding:10});assert.ok(Math.abs(rolled.x+rolled.width/2-320)<2);assert.ok(rolled.y<240);
});
test('reference frame scales large exports uniformly and color legend tracks each visible object',()=>{
 assert.equal(typeof render.referenceCamera,'function');const p=fresh().read();ensureScene(p);p.camera.width=8000;p.camera.height=4000;const camera=render.referenceCamera(p.camera);assert.equal(camera.width,1600);assert.equal(camera.height,800);assert.equal(camera.fov,p.camera.fov);
 p.scene.actors.push({...structuredClone(p.scene.primary),id:'hidden',name:'hidden',visible:false});p.scene.objects.push({id:'table',name:'桌子',visible:true});const legend=render.segmentLegend(p);assert.deepEqual(legend.map(s=>s.id),['primary','table']);assert.equal(new Set(legend.map(s=>s.color)).size,2);
});

test('a revision change during final publication retracts the new package',async t=>{
 const h=await setup(t);let reads=0;await assert.rejects(pack.saveReferencePackage({...h,readProject:()=>++reads<3?h.project:{...h.project,revision:1},request:request(h.project)}),/改变/);assert.deepEqual(await readdir(h.directory),[]);
});

test('pose support chairs receive their own object legend entry',()=>{
 const p=fresh().read();p.snapshot.contacts.push({objectId:'chair'});const legend=render.segmentLegend(p);assert.deepEqual(legend.map(e=>[e.id,e.kind]),[['primary','actor'],['primary:support-chair','object']]);assert.equal(legend[1].actorId,'primary');assert.notEqual(legend[0].color,legend[1].color);
});

test('glass helper convention is recorded in metadata and instructions',async t=>{
 const h=await setup(t);ensureScene(h.project);h.project.scene.objects.push({id:'glass',type:'glass-wall',visible:true,name:'观景玻璃'});
 const saved=await pack.saveReferencePackage({...h,readProject:()=>h.project,request:request(h.project)}),m=JSON.parse(await readFile(join(saved.directory,'manifest.json')));
 assert.deepEqual(m.transparency,{helperPolicy:'omit-glass-pane-retain-frame',objectIds:['glass']});assert.match(m.guidance,/透过透明玻璃/);assert.match(await readFile(join(saved.directory,'使用说明.md'),'utf8'),/保留实体边框/);
});
