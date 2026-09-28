import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
const repair=await import('../server/hand-repair.js').catch(()=>({}));
const png=await readFile(new URL('./fixtures/repair-64.png',import.meta.url));
const image='data:image/png;base64,'+png.toString('base64');
const project=JSON.parse(await readFile(new URL('./fixtures/repair-scene.pose.json',import.meta.url)));
const camera={position:[.2,1.2,.8],target:[0,1.18,.24],up:[0,1,0],fov:32,width:64,height:64};
const request=()=>({projectId:project.projectId,expectedRevision:project.revision,interactionId:project.scene.handInteractions[0].id,camera,images:{source:image,depth:image,mask:image,ownership:image}});

test('repair export saves a self-contained aligned package without editing the scene',async()=>{
 assert.equal(typeof repair.saveHandRepairPackage,'function');
 const directory=await mkdtemp(join(tmpdir(),'pose-hand-repair-')),before=structuredClone(project);
 try{
  const saved=await repair.saveHandRepairPackage({directory,readProject:()=>project,request:request()});
  const manifest=JSON.parse(await readFile(join(saved.directory,'manifest.json')));
  assert.equal(manifest.project.revision,project.revision);assert.deepEqual(manifest.camera,camera);
  assert.equal(manifest.status,'prepared');assert.equal(manifest.sourceKind,'workbench-render');
  assert.deepEqual(JSON.parse(await readFile(join(saved.directory,'scene.pose.json'))),before);
  for(const name of ['source','depth','mask','ownership'])assert.deepEqual(await readFile(join(saved.directory,name+'.png')),png);
  assert.deepEqual(project,before);
  const again=await repair.saveHandRepairPackage({directory,readProject:()=>project,request:request()});assert.notEqual(saved.id,again.id);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('stale capture, changed interaction and mismatched dimensions produce no package',async()=>{
 assert.equal(typeof repair.saveHandRepairPackage,'function');const directory=await mkdtemp(join(tmpdir(),'pose-hand-repair-'));
 try{
  for(const patch of [{expectedRevision:project.revision-1},{projectId:'another'},{interactionId:'missing'},{camera:{...camera,width:128}}]){
   await assert.rejects(repair.saveHandRepairPackage({directory,readProject:()=>project,request:{...request(),...patch}}));
   assert.deepEqual(await readdir(directory),[]);
  }
  let reads=0;
  await assert.rejects(repair.saveHandRepairPackage({directory,readProject:()=>++reads===1?project:{...project,revision:project.revision+1},request:request()}),/改变/);
  assert.deepEqual(await readdir(directory),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('workflow restores the original outside the repair mask and uses depth on both conditions',()=>{
 assert.equal(typeof repair.buildHandRepairWorkflow,'function');
 const {prompt,workflow}=repair.buildHandRepairWorkflow({id:'hands-example',checkpoint:'local.safetensors',controlnet:'depth.safetensors'});
 const entry=type=>Object.entries(prompt).find(([,v])=>v.class_type===type);
 const [maskId,mask]=entry('LoadImageMask');assert.equal(mask.inputs.channel,'red');
 const [compositeId,composite]=entry('ImageCompositeMasked');const [outputId,output]=entry('SaveImage');
 assert.deepEqual(output.inputs.images,[compositeId,0]);assert.equal(prompt[composite.inputs.destination[0]].inputs.image,'hands-example/source.png');
 const softMask=prompt[composite.inputs.mask[0]],blur=prompt[softMask.inputs.image[0]],maskImage=prompt[blur.inputs.image[0]],grow=prompt[maskImage.inputs.mask[0]];
 assert.equal(softMask.class_type,'ImageToMask');assert.equal(blur.class_type,'ImageBlur');assert.equal(grow.class_type,'GrowMask');assert.deepEqual(grow.inputs.mask,[maskId,0]);
 const [controlId,control]=entry('ControlNetApplyAdvanced');const [,sampler]=entry('KSampler');
 assert.deepEqual(sampler.inputs.positive,[controlId,0]);assert.deepEqual(sampler.inputs.negative,[controlId,1]);
 assert.equal(prompt[control.inputs.image[0]].inputs.image,'hands-example/depth.png');
 assert.equal(entry('CheckpointLoaderSimple')[1].inputs.ckpt_name,'local.safetensors');
 assert.equal(entry('ControlNetLoader')[1].inputs.control_net_name,'depth.safetensors');
 assert.equal(workflow.nodes.find(n=>String(n.id)===outputId).type,'SaveImage');
 const links=new Map(workflow.links.map(l=>[l[0],l]));
 for(const node of workflow.nodes)for(const input of node.inputs||[])if(input.link!==null){const link=links.get(input.link);assert.ok(link);assert.equal(link[3],node.id);}
});

test('bundle file serving only exposes named package artifacts',async()=>{
 assert.equal(typeof repair.readHandRepairFile,'function');const directory=await mkdtemp(join(tmpdir(),'pose-hand-repair-'));
 try{
  const saved=await repair.saveHandRepairPackage({directory,readProject:()=>project,request:request()});
  assert.deepEqual((await repair.readHandRepairFile(directory,saved.id,'source.png')).bytes,png);
  for(const [id,name] of [['..','source.png'],[saved.id,'../manifest.json'],[saved.id,'connection.json']])await assert.rejects(repair.readHandRepairFile(directory,id,name));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('preparation stages verified images and preserves conflicting existing inputs',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pose-hand-prepare-')),run=promisify(execFile);
 try{
  const saved=await repair.saveHandRepairPackage({directory:join(directory,'packages'),readProject:()=>project,request:request()});
  const input=join(directory,'input'),workflows=join(directory,'workflows'),args=[new URL('../scripts/prepare-hand-repair.mjs',import.meta.url).pathname,'--package',saved.directory,'--input-dir',input,'--workflow-dir',workflows];
  const result=JSON.parse((await run(process.execPath,args)).stdout);assert.equal(result.inference,'not-run');
  assert.deepEqual(await readFile(join(result.images,'source.png')),png);
  const graph=JSON.parse(await readFile(result.workflow)),prompt=JSON.parse(await readFile(result.prompt));
  for(const [id,node] of Object.entries(prompt).filter(([,node])=>['LoadImage','LoadImageMask'].includes(node.class_type))){
   assert.ok(!node.inputs.image.includes('/'),'ComfyUI image selectors only list files directly in the input directory');
   assert.deepEqual(await readFile(join(input,node.inputs.image)),png);
   assert.equal(graph.nodes.find(n=>String(n.id)===id).widgets_values[0],node.inputs.image);
  }
  await writeFile(join(result.images,'source.png'),'existing user change');
  await assert.rejects(run(process.execPath,args),/保留原文件/);
  assert.equal(await readFile(join(result.images,'source.png'),'utf8'),'existing user change');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('preparation never overwrites a conflicting image visible in the ComfyUI selector',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pose-hand-prepare-')),run=promisify(execFile);
 try{
  const saved=await repair.saveHandRepairPackage({directory:join(directory,'packages'),readProject:()=>project,request:request()});
  const input=join(directory,'input'),workflows=join(directory,'workflows');await mkdir(input);
  const conflict=join(input,saved.id+'-source.png');await writeFile(conflict,'existing user image');
  const args=[new URL('../scripts/prepare-hand-repair.mjs',import.meta.url).pathname,'--package',saved.directory,'--input-dir',input,'--workflow-dir',workflows];
  await assert.rejects(run(process.execPath,args),/保留原文件/);
  assert.equal(await readFile(conflict,'utf8'),'existing user image');
  assert.deepEqual(await readdir(input),[saved.id+'-source.png']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
