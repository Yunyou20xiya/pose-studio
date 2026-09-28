import test from 'node:test';
import assert from 'node:assert/strict';
import {mountShotWorkspace} from '../src/view/shot-workspace.js';
class Node {
 constructor(){this.children=[];this.value='';this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 focus(){}
}
const surface=()=>{const nodes=new Map();return{nodes,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);},querySelectorAll(){return[];}};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t,options={}){
 const originalDocument=globalThis.document,originalReader=globalThis.FileReader;
 globalThis.document={createElement:()=>new Node()};globalThis.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,test';queueMicrotask(()=>this.onload());}};
 const library=surface(),inspector=surface(),project={projectId:'test',revision:0,camera:{width:1600,height:1200}},board={projectId:'test',revision:0,sceneRevision:0,shots:[],recoveries:[]};
 const client={read:()=>structuredClone(project),isOwner:()=>true,subscribe:()=>()=>{},api:async(path,value)=>options.api?.(path,value)||board};
 const view=mountShotWorkspace({library,inspector,client,world:options.world||{ready:async()=>{}},stage:options.stage||{setOutputView(){},capture:async()=>new Blob()},render:options.render||(()=>{}),captureReference:options.captureReference});
 t.after(()=>{view.dispose();globalThis.document=originalDocument;globalThis.FileReader=originalReader;});view.setActive(true);await tick();
 return{library,inspector,project,board};
}
test('first-card name and intent survive refresh even without clicking new',async t=>{
 const h=await setup(t),name=h.inspector.querySelector('input'),note=h.inspector.querySelector('textarea');name.value='第一张镜头';name.oninput();note.value='正在写的拍摄意图';note.oninput();
 await h.library.querySelector('[data-action="refresh"]').onclick();assert.equal(name.value,'第一张镜头');assert.equal(note.value,'正在写的拍摄意图');
 h.board.revision++;h.board.shots.push({id:'external',name:'AI 新镜头',note:'外部添加',actors:1,objects:0,width:1600,height:1200});
 await h.library.querySelector('[data-action="refresh"]').onclick();assert.equal(name.value,'第一张镜头');assert.equal(note.value,'正在写的拍摄意图');
});
test('thumbnail capture waits for actors started by rendering the saved scene',async t=>{
 let loading,loaded=false,captured=false,saved=false;
 const h=await setup(t,{render(){if(!loading)loading=tick().then(()=>{loaded=true;});},world:{async ready(){await loading;}},stage:{setOutputView(){},async capture(){assert.equal(loaded,true,'new actor must be loaded before capture');captured=true;return new Blob();}},api(path){if(path==='/api/shots/save'){saved=true;return{id:'new',name:'完整人物'};}}});
 const name=h.inspector.querySelector('input');name.value='完整人物';name.oninput();await h.inspector.querySelector('[data-action="save"]').onclick();assert.ok(captured);assert.ok(saved);
});
test('typing before the first board response preserves the same-project draft',async t=>{
 let finish;const response=new Promise(resolve=>finish=resolve),h=await setup(t,{api:()=>response});
 const name=h.inspector.querySelector('input'),note=h.inspector.querySelector('textarea');name.value='慢连接下的草稿';name.oninput();note.value='先写下意图';note.oninput();finish(h.board);await tick();
 assert.equal(name.value,'慢连接下的草稿');assert.equal(note.value,'先写下意图');
});
test('a scene change while loading cancels thumbnail saving and restores latest render',async t=>{
 let h,latestRender,saved=false,captured=false;
 h=await setup(t,{render(p){latestRender=p.revision;},world:{async ready(){h.project.revision++;}},stage:{setOutputView(){},async capture(){captured=true;return new Blob();}},api(path){if(path==='/api/shots/save')saved=true;}});
 const name=h.inspector.querySelector('input');name.value='不应错存';name.oninput();
 await h.inspector.querySelector('[data-action="save"]').onclick();
 assert.equal(saved,false);assert.equal(captured,false);assert.equal(latestRender,1);assert.match(h.inspector.querySelector('.shot-status').textContent,/现场已改变/);
});

test('reference export uses the actual current card instead of the selected unopened preview',async t=>{
 let sent;
 const h=await setup(t,{captureReference:async({project,assertCurrent})=>{assertCurrent();return{images:{source:'test'},camera:project.camera};},api(path,value){if(path==='/api/reference-pack/export'){sent=value;return{url:'/package',details:2};}}});
 h.board.shots.push({id:'unopened',name:'另一张特写',note:'不要使用的意图',matchesCurrent:false},{id:'current',name:'现场全景',note:'当前意图',matchesCurrent:true});h.board.revision++;
 await h.library.querySelector('[data-action="refresh"]').onclick();
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(sent.title,'现场全景');assert.equal(sent.intent,'当前意图');
 h.board.shots[1].matchesCurrent=false;h.project.revision++;
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(sent.title,'当前现场');assert.equal(sent.intent,'');
});
test('reference export never uploads a capture invalidated by a scene edit',async t=>{
 let h,sent=false,lastRender;
 h=await setup(t,{render:p=>lastRender=p.revision,captureReference:async({render})=>{h.project.revision++;render();return{};},api(path){if(path==='/api/reference-pack/export')sent=true;}});
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(sent,false);assert.equal(lastRender,1);assert.match(h.inspector.querySelector('.shot-status').textContent,/现场已改变/);
});

test('changing the scene during board refresh cancels export before using stale card intent',async t=>{
 let h,captured=false,sent=false;
 h=await setup(t,{captureReference:async()=>{captured=true;return{};},api(path){if(h&&path.startsWith('/api/shots?')){h.project.revision++;return{...h.board,shots:[{id:'stale',name:'旧镜头',note:'旧说明',matchesCurrent:true}]};}if(path==='/api/reference-pack/export'){sent=true;return{url:'/package'};}}});
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(captured,false);assert.equal(sent,false);assert.match(h.inspector.querySelector('.shot-status').textContent,/现场已改变/);
});

test('identical scenes with different card intentions export without guessing an intention',async t=>{
 let sent;const h=await setup(t,{captureReference:async()=>({}),api(path,value){if(path==='/api/reference-pack/export'){sent=value;return{url:'/package',details:0};}}});
 h.board.shots.push({id:'a',name:'意图一',note:'愉快',matchesCurrent:true},{id:'b',name:'意图二',note:'紧张',matchesCurrent:true});h.board.revision++;
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(sent.title,'当前现场');assert.equal(sent.intent,'');
});

test('lagging server scene does not attach stale matchesCurrent metadata to a newer capture',async t=>{
 let sent;const h=await setup(t,{captureReference:async()=>({}),api(path,value){if(path==='/api/reference-pack/export'){sent=value;return{url:'/package',details:0};}}});
 h.project.revision=2;h.board.sceneRevision=1;h.board.shots.push({id:'old',name:'旧版现场',note:'旧版意图',matchesCurrent:true});h.board.revision++;
 await h.inspector.querySelector('[data-action="reference"]').onclick();assert.equal(sent.expectedRevision,2);assert.equal(sent.title,'当前现场');assert.equal(sent.intent,'');
});
