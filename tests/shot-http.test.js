import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createApi} from '../server/http.js';
import {fresh,profile} from './scene-fixture.js';

test('separate runtime ports keep same-project card collections isolated',async t=>{
 const root=await mkdtemp(join(tmpdir(),'shot-http-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'assets/profiles'),{recursive:true});await mkdir(join(root,'local-data/models'),{recursive:true});
 const bytes=Buffer.from('isolated-model-reference'),model={id:'test-model',file:'test.vrm',sha256:createHash('sha256').update(bytes).digest('hex')};
 const localProfile={...profile,modelSha256:model.sha256};delete localProfile.assetRef;const profileBytes=JSON.stringify(localProfile);await writeFile(join(root,'assets/profiles/primary.json'),profileBytes);
 await writeFile(join(root,'local-data/models/test.vrm'),bytes);await writeFile(join(root,'assets/model-source-a.json'),JSON.stringify(model));await writeFile(join(root,'assets/catalog.json'),'[]');
 const project=fresh().read();project.projectId='same-project';project.model={id:model.id,relativePath:'models/test.vrm',sha256:model.sha256};
 project.profile={id:localProfile.id,relativePath:'profiles/primary.json',sha256:createHash('sha256').update(profileBytes).digest('hex')};
 async function connect(port){
  const handle=await createApi({root,port});let token;
  const request=async(route,data)=>{let result;const req=Readable.from(data?[JSON.stringify(data)]:[]);Object.assign(req,{url:route,method:data?'POST':'GET',headers:{host:'127.0.0.1:'+port,'content-type':'application/json','x-workbench-token':token}});const res={statusCode:200,setHeader(){},end(value){result=JSON.parse(value);}};assert.equal(await handle(req,res),true);assert.equal(res.statusCode,200,JSON.stringify(result));return result;};
  token=(await request('/api/bootstrap')).token;assert.equal((await request('/api/editor/claim',{editorId:'test',project})).granted,true);return request;
 }
 const a=await connect(47110),b=await connect(47111),guard={projectId:project.projectId,expectedRevision:project.revision,expectedBoardRevision:0};
 await Promise.all([a('/api/shots/save',{...guard,name:'现场 A'}),b('/api/shots/save',{...guard,name:'现场 B'})]);
 assert.equal((await a('/api/shots')).sceneRevision,project.revision);
 assert.deepEqual((await a('/api/shots')).shots.map(s=>s.name),['现场 A']);assert.deepEqual((await b('/api/shots')).shots.map(s=>s.name),['现场 B']);
});
