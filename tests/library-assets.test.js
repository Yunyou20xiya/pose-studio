import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{createEngine}from'../src/pose/engine.js';import{makeProject,makeCommand,fullScope}from'../src/pose/state.js';
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url)));
test('redistributable pose assets have source records and apply as legal fixed-character poses',async()=>{
 const catalog=await read('assets/catalog.json');const ids=['stand','weight-shift','hands-behind-head','wave-right','look-left','head-down','raise-right'];
 for(const id of ids)assert.ok(catalog.some(a=>a.id===id),'missing '+id);
 const profile=await read('assets/profiles/primary.json'),model=await read('assets/model-source-a.json');profile.assetRef={id:profile.id,sha256:createHash('sha256').update(await readFile(new URL('../assets/profiles/primary.json',import.meta.url))).digest('hex'),relativePath:'profiles/primary.json'};
 const base=makeProject(model,profile),stand=await read('local-data/motions/stand.json');
 for(const asset of catalog.filter(a=>a.type==='pose')){
  assert.ok(asset.source&&asset.adaptation&&asset.part&&asset.affectedLabel,asset.id+' missing metadata');assert.ok(asset.thumbnail.startsWith('/api/library-images/'));
  const bytes=await readFile(new URL('../local-data/motions/'+asset.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  const e=createEngine(base,profile);assert.equal(e.apply(makeCommand(e.read(),[{kind:'patch',value:stand}],fullScope(e.read()),'preset')).status,'applied');
  const result=e.apply(makeCommand(e.read(),[{kind:'patch',value:JSON.parse(bytes)}],fullScope(e.read()),'preset'));assert.equal(result.status,'applied',asset.id+': '+JSON.stringify(result.issues));
 }
});
