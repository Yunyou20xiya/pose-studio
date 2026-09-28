import {focusSceneResult} from './view/result-focus.js';
import {mountShotWorkspace} from './view/shot-workspace.js';
import {mountHandWorkspace} from './view/hand-workspace.js';
import './view/styles.css';
import {createStage} from './view/stage.js';
import {makeProject} from './pose/state.js';
import {createClient,actorClient,sceneFromView} from './view/client.js';
import {mountControls} from './view/controls.js';
import {createSceneWorld} from './view/scene-world.js';
import {mountObjectPanel} from './view/object-panel.js';
import {primaryDescriptor,actorDescriptor,sceneActors} from './scene/state.js';
const status=document.querySelector('#status');
try{
 const bootstrap=await(await fetch('/api/bootstrap')).json();if(!bootstrap.profile)throw Error(bootstrap.message||'服务尚未准备好');
 const {model,profile,catalog,token}=bootstrap,stage=createStage(document.querySelector('#viewport'),{profile});
 const response=await fetch('/local-assets/'+model.file);if(!response.ok)throw Error('角色文件读取失败');const bytes=await response.arrayBuffer();
 let controls,objects,hands,shots,activeActor=null,mode='layout',requestedActor=null,pendingResult=null;
 const render=p=>{
  if(activeActor&&!actorDescriptor(p,activeActor)){const previous=controls;controls=null;activeActor=null;previous?.dispose();}
  hands?.beforeRender();world.render(p);stage.render(p);
  if(!activeActor&&requestedActor){requestedActor=primaryDescriptor(p).id;activate(requestedActor);}
  const select=document.querySelector('#active-actor'),previous=select.value;select.replaceChildren(...sceneActors(p).map(a=>new Option(a.name,a.id)));select.value=actorDescriptor(p,requestedActor)?requestedActor:activeActor||previous||primaryDescriptor(p).id;
 };
 const world=createSceneWorld({stage,bytes,onReady:id=>{if(id===requestedActor)activate(id);objects?.sync();},onError:e=>{status.textContent='角色载入未完成：'+e.message;}});
 const client=createClient({initial:makeProject(model,profile),profile,token,onRender:render,onStatus:(message,owner)=>{status.textContent=message;document.querySelector('#app').dataset.owner=owner;controls?.setEditable(owner);objects?.sync();hands?.sync();shots?.sync();},onResult:r=>{if(controls)controls.report(r);else pendingResult=r;focusSceneResult(r,{read:client.read,ready:()=>world.ready(),hand:id=>hands?.focus(id),group:id=>{if(objects){objects.select(id);setMode('layout');objects.focus();}}}).catch(e=>{status.textContent='近景尚未准备好：'+e.message;});}});
 const viewStage={...stage,render:p=>render(sceneFromView(p)),ready:()=>world.ready()};
 function setMode(value){mode=value;document.querySelector('.workspace').classList.remove('layout-mode','pose-mode','light-mode','hand-mode','camera-mode','face-mode','shots-mode');document.querySelector('.workspace').classList.add(mode+'-mode');document.querySelector('#camera-guide').hidden=mode!=='camera';document.querySelector('#face-guide').hidden=mode!=='face';document.querySelector('#objects').hidden=mode!=='layout';document.querySelector('#pose-library').hidden=mode!=='pose';for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));const ready=activeActor===requestedActor;document.querySelector('#pose-library').inert=!ready;document.querySelector('#panel').inert=!ready;document.querySelector('#region').disabled=!ready;hands?.setActive(mode==='hand');shots?.setActive(mode==='shots');controls?.setPoseActive(['pose','light','camera','face'].includes(mode)&&ready,mode==='light'?'scene':mode==='camera'?'camera':mode==='face'?'head':mode==='pose'?'body':undefined);objects?.setActive(mode==='layout');}
 function activate(id){
  requestedActor=id;if(activeActor===id&&controls){setMode(mode);return;}const avatar=world.avatar(id);if(!avatar){document.querySelector('#active-actor').value=id;setMode(mode);document.querySelector('#notice').textContent='正在准备所选角色…';return;}
  controls?.dispose();activeActor=id;document.querySelector('#active-actor').value=id;controls=mountControls({library:document.querySelector('#pose-library'),panel:document.querySelector('#panel'),client:actorClient(client,id,profile),avatar,stage:viewStage,profile,catalog,model});setMode(mode);if(pendingResult){controls.report(pendingResult);pendingResult=null;}else if(document.querySelector('#notice').textContent==='正在准备所选角色…')document.querySelector('#notice').textContent='';
 }
 await client.connect();requestedActor=primaryDescriptor(client.read()).id;await world.ready();activate(requestedActor);
 objects=mountObjectPanel({host:document.querySelector('#objects'),inspector:document.querySelector('#object-inspector'),client,stage:{...stage,render},world,profile,onActor:activate,onEdit:id=>{activate(id);setMode('pose');},onReport:r=>controls?.report(r)});
 hands=mountHandWorkspace({library:document.querySelector('#hand-library'),inspector:document.querySelector('#hand-inspector'),client,stage,world,profile,onReport:r=>controls?.report(r),onMode:setMode,onEdit:(id,hand)=>{objects.select(id);setMode('pose');const region=document.querySelector('#region');region.value=hand;region.dispatchEvent(new Event('change'));}});
 shots=mountShotWorkspace({library:document.querySelector('#shot-library'),inspector:document.querySelector('#shot-inspector'),client,stage,world,render,onReport:r=>controls?.report(r)});
 client.subscribe(p=>{if(!actorDescriptor(p,activeActor))activate(primaryDescriptor(p).id);});
 document.querySelector('#active-actor').onchange=e=>objects.select(e.target.value);
 for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);
 setMode(mode);client.refresh();if(bootstrap.startupIssues.length&&(!bootstrap.startupProject||bootstrap.startupProject.projectId===client.read().projectId&&bootstrap.startupProject.revision===client.read().revision))controls.report({issues:bootstrap.startupIssues});
 window.addEventListener('pagehide',()=>{client.dispose();objects.dispose();hands.dispose();shots.dispose();controls.dispose();world.dispose();stage.dispose();},{once:true});
}catch(e){status.textContent='载入未完成';document.querySelector('#panel').textContent=e.message;console.error(e);}
