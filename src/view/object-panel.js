import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {makeCommand,fullScope} from '../pose/state.js';
import {sceneActors,primaryDescriptor,actorDescriptor,actorProject} from '../scene/state.js';
import {groundPoses,groundPoseCommand} from '../assets/ground-poses.js';
import {objectCatalog,objectSpec} from '../scene/catalog.js';
import {mountFurniturePanel} from './furniture-panel.js';
import {mountGazePanel} from './gaze-panel.js';
import {groupDescriptor,sceneGroups} from '../scene/groups.js';
import {mountCombinationPanel} from './combination-panel.js';
import {withSceneGazeScope} from '../scene/gaze-targets.js';
export function mountObjectPanel({host,inspector,client,stage,world,profile,onActor,onEdit,onReport}){
 let selected=primaryDescriptor(client.read()).id,active=true,mode='translate',session=null,busy=false,disposed=false;
 const furniturePreferences={keep:true,targets:{}};
 const target=new THREE.Object3D();stage.scene.add(target);
 const control=new TransformControls(stage.camera,stage.renderer.domElement);control.setSize(.8);const helper=control.getHelper();stage.helpers.add(helper);
 const box=new THREE.Box3Helper(new THREE.Box3(),0x688c68);box.material.depthTest=false;box.material.transparent=true;box.material.opacity=.65;stage.helpers.add(box);
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),canvas=stage.renderer.domElement;
 host.innerHTML='<div class="eyebrow">SCENE OBJECTS</div><h2>布置现场</h2><p class="subtle">先摆人和物，再调整每个人的动作。</p><button class="wide" data-add-actor>＋ 添加角色</button><div class="object-add"><select aria-label="添加物品类型"></select><button aria-label="添加所选物品">＋</button></div><div class="scene-count"></div><div class="object-list" role="list" aria-label="场景对象"></div><p class="subtle">拖动箭头移动；空白处拖动可环绕观察。地面阻止整体下沉；蹲、跪、坐可用右侧动作按钮。</p>';
 const catalog=host.querySelector('select'),list=host.querySelector('.object-list');
 for(const category of [...new Set(objectCatalog.map(x=>x.category))]){const group=document.createElement('optgroup');group.label=category;for(const item of objectCatalog.filter(x=>x.category===category))group.append(new Option(item.name,item.id));catalog.append(group);}
 const group=()=>groupDescriptor(client.read(),selected);
 const item=()=>group()||[...sceneActors(client.read()),...(client.read().scene?.objects||[])].find(x=>x.id===selected);
 const transform=()=>group()?{position:group().position,yaw:group().yaw}:item()?.transform;
 const locked=()=>group()?group().memberIds.some(id=>[...sceneActors(client.read()),...(client.read().scene?.objects||[])].find(a=>a.id===id)?.locked):item()?.locked;
 const combinations=mountCombinationPanel({host,client,stage,world,select,selected:()=>selected,run,command,isBusy:()=>busy,onReport});
 const isActor=()=>!!actorDescriptor(client.read(),selected);
 const canEdit=()=>active&&!busy&&client.isOwner()&&item()&&!locked()&&!stage.isOutputView();
 function command(op,p=client.read()){return makeCommand(p,[{kind:'scene',...op}],{...fullScope(p),scene:true},'scene');}
 async function run(c,selectAfter){if(busy)return;busy=true;syncGizmo();try{const r=await client.send(withSceneGazeScope(c,client.read(),profile));onReport(r);if(r.status==='applied'&&selectAfter)select(selectAfter);return r;}catch(e){onReport({issues:[{severity:'error',message:e.message,bones:[]}]});}finally{busy=false;if(!disposed){draw();syncGizmo();}}}
 function cancel(){session=null;control.dragging=false;stage.controls.enabled=!stage.isOutputView();stage.render(client.read());}
 function select(id){if(session)cancel();selected=id;const a=actorDescriptor(client.read(),id);if(a)onActor(id);draw();syncGizmo();}
 function syncGizmo(){
  const a=item();box.visible=active&&a?.visible!==false&&!stage.isOutputView();if(box.visible){box.box.copy(combinations.bounds(selected));box.visible=!box.box.isEmpty();}
  if(!canEdit()||a.visible===false){control.detach();control.enabled=false;return;}
  if(!session){target.position.fromArray(transform().position);target.rotation.set(0,transform().yaw*Math.PI/180,0);target.scale.set(1,1,1);}
  control.setMode(mode);control.showX=mode==='translate';control.showY=mode==='rotate'||!group();control.showZ=mode==='translate';control.enabled=true;control.attach(target);
 }
 function draw(){
  const p=client.read(),actors=sceneActors(p),objects=p.scene?.objects||[];
  if(![...actors,...objects,...sceneGroups(p)].some(x=>x.id===selected)){selected=primaryDescriptor(p).id;onActor(selected);}
  list.replaceChildren();host.querySelector('.scene-count').textContent=`${actors.length} 名角色 · ${objects.length} 件物品`;
  for(const a of [...actors,...objects]){const b=document.createElement('button');b.className='object-row';b.setAttribute('aria-pressed',String(a.id===selected));b.setAttribute('role','listitem');b.ariaLabel='选择 '+a.name;b.textContent=(actors.includes(a)?'♙ ':'▧ ')+a.name+(a.locked?' · 已锁定':a.visible?'':' · 已隐藏');b.onclick=()=>select(a.id);list.append(b);}
  host.querySelector('[data-add-actor]').disabled=!client.isOwner()||busy||actors.length>=6;
  host.querySelector('.object-add button').disabled=!client.isOwner()||busy||objects.length>=80;
  combinations.draw();const a=item();inspector.replaceChildren();if(!a)return;
  if(group()){combinations.inspector({host:inspector,group:group(),mode,setMode:value=>{mode=value;stage.setOutputView(false);syncGizmo();draw();}});return;}
  const eyebrow=document.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent=isActor()?'CHARACTER PLACEMENT':'OBJECT PLACEMENT';const title=document.createElement('h2');title.textContent=a.name;inspector.append(eyebrow,title);
  const button=(label,fn,container=inspector)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;b.disabled=!client.isOwner()||busy;container.append(b);return b;};
  const update=value=>run(command({action:'update',id:a.id,value},p));
  if(isActor()){button('调整这个角色的动作',()=>onEdit(a.id)).className='primary wide';const quick=document.createElement('div');quick.className='ground-actions';inspector.append(quick);for(const pose of groundPoses){const b=button(pose.name,()=>run(groundPoseCommand({...actorProject(p,a.id),_actorId:a.id},pose.id,profile)),quick);b.disabled||=a.locked;}}
  mountFurniturePanel({host:inspector,project:p,subject:a,isActor:isActor(),disabled:!client.isOwner()||busy||a.locked,preferences:furniturePreferences,submit:op=>run(command({...op,id:a.id},p))});
  if(isActor())mountGazePanel({host:inspector,project:p,subject:a,disabled:!client.isOwner()||busy||a.locked,preferences:furniturePreferences,submit:op=>run(command({...op,id:a.id},p))});
  const nameLabel=document.createElement('label');nameLabel.textContent='名称';const name=document.createElement('input');name.ariaLabel='对象名称';name.maxLength=60;name.value=a.name;name.disabled=a.locked;name.onchange=()=>update({name:name.value.trim()});nameLabel.append(name);inspector.append(nameLabel);
  const modes=document.createElement('div');modes.className='row placement-modes';inspector.append(modes);
  for(const[id,label]of [['translate','移动'],['rotate','转向']]){const b=button(label,()=>{mode=id;stage.setOutputView(false);syncGizmo();draw();},modes);b.setAttribute('aria-pressed',String(mode===id));}
  const fields=document.createElement('div');fields.className='placement-fields';inspector.append(fields);const inputs={};
  const field=(label,key,value,step,min,max)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.step='any';input.min=min;input.max=max;input.value=Number(value.toFixed(3));input.ariaLabel=label;input.disabled=a.locked||!client.isOwner();inputs[key]=input;l.append(input);fields.append(l);};
  a.transform.position.forEach((n,i)=>field(['左右 X（米）','上下 Y（米）','前后 Z（米）'][i],'p'+i,n,.05,-1000,1000));field('转向（度）','yaw',a.transform.yaw,5,-3600,3600);
  const spec=isActor()?null:objectSpec(a.type);
  if(spec)a.transform.scale.forEach((n,i)=>field(['宽度（米）','高度（米）','深度（米）'][i],'s'+i,n*spec.size[i],.01,spec.size[i]*.1,spec.size[i]*10));else field('身高比例','scale',a.transform.scale,.05,.25,3);
  const apply=button('应用位置与尺寸',()=>{
   if(Object.values(inputs).some(i=>i.value.trim()===''||!i.checkValidity())){onReport({issues:[{severity:'error',message:'请在标注范围内填写完整数值',bones:[]}]});return;}
   const t={position:[0,1,2].map(i=>+inputs['p'+i].value),yaw:+inputs.yaw.value,scale:spec?[0,1,2].map(i=>+inputs['s'+i].value/spec.size[i]):+inputs.scale.value};update({transform:t});
  });apply.disabled||=a.locked;apply.className='wide';
  if(spec){const l=document.createElement('label');l.className='object-color';l.textContent='颜色';const input=document.createElement('input');input.type='color';input.ariaLabel='物品颜色';input.value=a.color;input.disabled=a.locked||!client.isOwner();input.onchange=()=>update({color:input.value});l.append(input);inspector.append(l);}
  const actions=document.createElement('div');actions.className='object-actions';inspector.append(actions);
  button('近看所选',()=>stage.fitBounds(combinations.bounds(selected)),actions).disabled=false;
  const land=button('落到地面',()=>{const bounds=combinations.bounds(selected);if(bounds.isEmpty())return;const transform=structuredClone(a.transform);transform.position[1]+=(p.scene?.floorY??p.stage.floorY)-bounds.min.y;return update({transform});},actions);land.disabled||=a.locked||!a.visible;
  button(a.visible?'隐藏':'显示',()=>update({visible:!a.visible}),actions).disabled||=a.locked;
  button(a.locked?'解锁':'锁定',()=>update({locked:!a.locked}),actions);
  button('复制',()=>{const id=crypto.randomUUID();return run(command({action:'duplicate',id:a.id,newId:id}),id);},actions);
  const remove=button('移除',()=>run(command({action:'remove',id:a.id})),actions);remove.disabled||=a.locked||(isActor()&&actors.length===1);
  const note=document.createElement('p');note.className='subtle';note.textContent=isActor()?'整体位置和比例不改变关节动作。复制后可以分别选择姿势；切换站、蹲、跪、坐地会解除家具接触。':'物品用于搭建空间和遮挡。保持接触时会跟随承放表面，解除后可以自由摆放。';inspector.append(note);
 }
 host.querySelector('[data-add-actor]').onclick=()=>{const id=crypto.randomUUID();return run(command({action:'add-actor',id,sourceId:isActor()?selected:primaryDescriptor(client.read()).id}),id);};
 host.querySelector('.object-add button').onclick=()=>{const id=crypto.randomUUID(),a=item(),position=[...(transform()?.position||[0,0,0])];position[0]+=.8;position[1]=client.read().scene?.floorY??client.read().stage.floorY;return run(command({action:'add-object',id,type:catalog.value,position}),id);};
 control.addEventListener('dragging-changed',e=>{
  stage.controls.enabled=!e.value&&!stage.isOutputView();
  if(e.value){if(canEdit())session={project:client.read(),id:selected,transform:structuredClone(transform()),group:!!group(),command:null};return;}
  const s=session;session=null;if(s?.command)run(s.command);else syncGizmo();
 });
 control.addEventListener('objectChange',()=>{
  const s=session;if(!s)return;
  if(s.project.revision!==client.read().revision||!client.isOwner()){cancel();syncGizmo();return;}
  const transform={...s.transform,position:target.position.toArray(),yaw:new THREE.Euler().setFromQuaternion(target.quaternion,'YXZ').y*180/Math.PI};s.command=command(s.group?{action:'group-transform',id:s.id,position:transform.position,yaw:transform.yaw}:{action:'update',id:s.id,value:{transform}},s.project);const preview=client.preview(s.command);stage.render(preview.project);box.box.copy(combinations.bounds(selected));
 });
 let down=null;
 const pointerdown=e=>{if(active&&e.button===0&&!control.axis)down=[e.clientX,e.clientY];};
 const pointerup=e=>{const before=down;down=null;if(!before||session||control.axis||!active||stage.isOutputView()||Math.hypot(e.clientX-before[0],e.clientY-before[1])>4)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,stage.camera);for(const hit of ray.intersectObject(world.root,true)){let o=hit.object;if(!o.visible)continue;let visible=true;for(let n=o;n;n=n.parent)if(!n.visible)visible=false;if(!visible)continue;while(o&&!o.userData.objectId)o=o.parent;if(o){select(o.userData.objectId);break;}}};
 canvas.addEventListener('pointerdown',pointerdown);canvas.addEventListener('pointerup',pointerup);
 const unsub=client.subscribe(()=>{if(session)cancel();draw();syncGizmo();}),unview=stage.onViewChange(()=>{if(session&&stage.isOutputView())cancel();syncGizmo();});
 draw();syncGizmo();
 return{select,focus(){stage.fitBounds(combinations.bounds(selected));},selected:()=>selected,setActive(value){active=value;if(session)cancel();syncGizmo();},sync:syncGizmo,dispose(){disposed=true;combinations.dispose();unsub();unview();canvas.removeEventListener('pointerdown',pointerdown);canvas.removeEventListener('pointerup',pointerup);control.dispose();helper.removeFromParent();box.geometry.dispose();box.material.dispose();box.removeFromParent();target.removeFromParent();}};
}
