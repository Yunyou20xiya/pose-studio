import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createApi} from '../server/http.js';
const module=await import('../server/image-exports.js').catch(()=>({}));
const png=await readFile(new URL('./fixtures/repair-64.png',import.meta.url)),image='data:image/png;base64,'+png.toString('base64');
async function setup(t){const root=await mkdtemp(join(tmpdir(),'pose-exports-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'图片/角色工作台/导出'),legacyDirectory=join(root,'old-exports');return{root,directory,legacyDirectory};}
test('exports go to the selected visible folder, keep image bytes, and never overwrite an earlier image',async t=>{
 assert.equal(typeof module.createImageExportStore,'function');const h=await setup(t),store=module.createImageExportStore(h),first=await store.save(image),second=await store.save(image);
 assert.notEqual(first.file,second.file);assert.equal(first.directory,h.directory);assert.equal(first.file,join(h.directory,first.name));assert.deepEqual(await readFile(first.file),png);assert.deepEqual(await store.read(first.name),png);
});
test('old exported image links remain readable after switching folders',async t=>{
 assert.equal(typeof module.createImageExportStore,'function');const h=await setup(t);await mkdir(h.legacyDirectory);await writeFile(join(h.legacyDirectory,'pose-old.png'),png);const store=module.createImageExportStore(h);assert.deepEqual(await store.read('pose-old.png'),png);
 await assert.rejects(store.read('../pose-old.png'));await assert.rejects(store.read('/pose-old.png'));await assert.rejects(store.read('private.txt'));await assert.rejects(store.save('data:image/png;base64,bad'));
});
test('the folder action creates and opens only the configured export directory',async t=>{
 assert.equal(typeof module.createImageExportStore,'function');const h=await setup(t);let opened;const store=module.createImageExportStore({...h,openFolder:async directory=>{opened=directory;}});const result=await store.openDirectory();assert.equal(opened,h.directory);assert.equal(result.directory,h.directory);
});
test('export API serves generated PNG links to a browser without exposing arbitrary paths',async t=>{
 const h=await setup(t);await mkdir(join(h.root,'assets/profiles'),{recursive:true});for(const rel of ['profiles/primary.json','model-source-a.json','catalog.json'])await copyFile(new URL('../assets/'+rel,import.meta.url),join(h.root,'assets',rel));
 const handle=await createApi({root:h.root,port:47112,exportDirectory:h.directory});
 async function request(route,data,token){let output;const req=Readable.from(data?[JSON.stringify(data)]:[]);Object.assign(req,{url:route,method:data?'POST':'GET',headers:{host:'127.0.0.1:47112','content-type':'application/json',...(token?{'x-workbench-token':token}:{})}});const headers={},res={statusCode:200,setHeader(k,v){headers[k]=v;},end(value){output=value;}};await handle(req,res);return{status:res.statusCode,body:output,headers};}
 const token=JSON.parse((await request('/api/bootstrap')).body).token;
 assert.equal((await request('/api/export',{image})).status,400);
 const saved=await request('/api/export',{image},token);assert.equal(saved.status,200);const item=JSON.parse(saved.body);assert.equal(item.directory,h.directory);assert.deepEqual(await readFile(item.file),png);
 const opened=await request(item.url);assert.equal(opened.status,200);assert.equal(opened.headers['Content-Type'],'image/png');assert.deepEqual(opened.body,png);
 assert.equal((await request('/api/images/..%2Fsecret.png')).status,400);
});
