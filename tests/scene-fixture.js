import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeProject,makeCommand,fullScope} from '../src/pose/state.js';
import {createSceneEngine} from '../src/scene/engine.js';
const bytes=readFileSync(new URL('../assets/profiles/primary.json',import.meta.url));
export const profile=JSON.parse(bytes);profile.assetRef={id:profile.id,sha256:createHash('sha256').update(bytes).digest('hex'),relativePath:'profiles/primary.json'};
export const model=JSON.parse(readFileSync(new URL('../assets/model-source-a.json',import.meta.url)));
export const fresh=()=>createSceneEngine(makeProject(model,profile),profile);
export const cmd=(e,op,actorId)=>({...makeCommand(e.read(),[op],{...fullScope(e.read()),scene:true},'scene'),...(actorId?{actorId}:{})});
export const apply=(e,op)=>e.apply(cmd(e,{kind:'scene',...op}));
export const ok=r=>assert.equal(r.status,'applied',JSON.stringify(r.issues));
export function add(e,id,type,position=[0,0,0]){ok(apply(e,{action:'add-object',id,type,position}));return obj(e,id);}
export const obj=(e,id)=>e.read().scene.objects.find(x=>x.id===id);
export const move=(e,id,value)=>apply(e,{action:'update',id,value:{transform:{...obj(e,id).transform,...value}}});
export const near=(a,b,eps=1e-6)=>assert.ok(Math.hypot(...a.map((n,i)=>n-b[i]))<eps,JSON.stringify({actual:a,expected:b}));
