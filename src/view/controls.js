import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {gestures,handGesture,mirrorPatch} from '../assets/gestures.js';
import {mountPoseLibrary} from './pose-library.js';
import {makeCommand,fullScope} from '../pose/state.js';
import {forward} from '../pose/kinematics.js';
import {ikChain} from '../pose/ik.js';
import {effectorFieldTarget} from './field-state.js';
import {isHandSupport,supportGeometry,withHandSupportScope} from '../pose/hand-supports.js';
import {mountSupportPanel} from './hand-supports.js';
import {mountScenePanel} from './scene-panel.js';
import {mountLightingGizmo} from './lighting-gizmo.js';
import {mountCameraGizmo} from './camera-gizmo.js';
import {mountCameraPanel} from './camera-panel.js';
import {mountViewControls} from './view-controls.js';
import {gazeRequest} from '../face/gaze.js';
import {mountEyePanel} from './eye-panel.js';
import {showExportResult} from './export-notice.js';
export const boneLabel=n=>{let t=n.replace(/^right/,'右').replace(/^left/,'左');for(const[a,b]of Object.entries({UpperArm:'上臂',LowerArm:'前臂',UpperLeg:'大腿',LowerLeg:'小腿',Shoulder:'肩',Hand:'手腕',Foot:'脚踝',Toes:'脚趾',Thumb:'拇指',Index:'食指',Middle:'中指',Ring:'无名指',Little:'小指',Metacarpal:'掌根',Proximal:'根节',Intermediate:'中节',Distal:'末节',upperChest:'上胸',chest:'胸',spine:'腰背',hips:'骨盆',neck:'颈部',head:'头部'}))t=t.replace(a,b);return t;};
export function scopeFor(patch,project){return{bones:[...new Set([...Object.keys(patch.rotations||{}),...(patch.gaze&&patch.gaze.follow>0?['head','neck']:[]),...('contacts'in patch?[...project.snapshot.contacts,...patch.contacts].map(c=>c.bone):[])])],expressions:Object.keys(patch.expressions||{}),root:'rootPosition'in patch||'rootRotation'in patch,gaze:'gaze'in patch,stage:'stage'in patch,camera:'camera'in patch,lighting:'lighting'in patch};}
const blobData=blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
export function mountControls({library,panel,client,avatar,stage,profile,catalog,model}){
 let syncFields=[],scenePanel=null,editable=client.isOwner(),pendingActions=0,poseActive=true,disposed=false;
 const toWorld=point=>client.toWorld?client.toWorld(point):point,toLocal=point=>client.toLocal?client.toLocal(point):point;
 let part='rightHand',selected='rightHand',gesture='v-sign',degree=1,spread=.3,previewCommand=null,updating=false;
 const notice=document.querySelector('#notice'),region=document.querySelector('#region');
 region.innerHTML=Object.entries({body:'全身',rightHand:'右手',leftHand:'左手',head:'头颈与表情',rightArm:'右臂',leftArm:'左臂',rightFoot:'右腿与脚',leftFoot:'左腿与脚',scene:'光线',camera:'镜头'}).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');region.value=part;
 const warnGroup=new THREE.Group();stage.helpers.add(warnGroup);
 const supportGroup=new THREE.Group();stage.helpers.add(supportGroup);
 function clearSupportMarkers(){while(supportGroup.children.length){const o=supportGroup.children[0];supportGroup.remove(o);o.geometry.dispose();o.material.dispose();}}
 function report(result){const issues=result?.issues||[];notice.textContent=issues.length?issues.map(i=>`${i.message}${i.bones?.length?'（'+i.bones.map(boneLabel).join('、')+'）':''}`).join('；'):result?.status==='applied'?(result.summary||'已应用 · 版本 '+result.revision):'';notice.className=issues.some(i=>i.severity==='error')?'error':issues.length?'warning':'good';while(warnGroup.children.length){const o=warnGroup.children[0];warnGroup.remove(o);o.geometry.dispose();o.material.dispose();}const w=forward(client.read(),profile);for(const n of new Set(issues.flatMap(i=>i.bones||[]))){if(!w[n])continue;const dot=new THREE.Mesh(new THREE.SphereGeometry(.015,10,8),new THREE.MeshBasicMaterial({color:0xd6813d,depthTest:false,transparent:true,opacity:.7}));dot.position.fromArray(toWorld(w[n].position));warnGroup.add(dot);}}
 async function run(action){pendingActions++;document.querySelector('#export').disabled=true;document.querySelector('#save').disabled=true;try{const r=await action();if(r?.status)report(r);return r;}catch(e){notice.textContent=e.message;notice.className='error';return null;}finally{pendingActions--;document.querySelector('#export').disabled=pendingActions>0;document.querySelector('#save').disabled=pendingActions>0;}}
 const patch=(value,source='slider',overwrite=true)=>client.submit([{kind:'patch',value}],scopeFor(value,client.read()),source,overwrite?scopeFor(value,client.read()).bones:[]);
 const partBones=()=>Object.keys(profile.limits).filter(n=>part==='body'?!/Thumb|Index|Middle|Ring|Little|Eye/.test(n):part==='head'?['head','neck'].includes(n):part.endsWith('Hand')?n.startsWith(part.startsWith('right')?'right':'left')&&/Hand|Thumb|Index|Middle|Ring|Little/.test(n):part.endsWith('Arm')?n.startsWith(part.startsWith('right')?'right':'left')&&/Shoulder|Arm|Hand/.test(n):part.endsWith('Foot')?n.startsWith(part.startsWith('right')?'right':'left')&&/Leg|Foot|Toes/.test(n):false);
 const target=new THREE.Object3D();stage.scene.add(target);const dot=new THREE.Mesh(new THREE.SphereGeometry(.015,14,10),new THREE.MeshBasicMaterial({color:0x258a68,depthTest:false}));stage.helpers.add(dot);
 const transform=new TransformControls(stage.camera,stage.renderer.domElement);transform.setSize(.65);transform.setMode('translate');const helper=transform.getHelper();stage.helpers.add(helper);let dragging=false;
 const effector=()=>part.endsWith('Hand')?part:part.endsWith('Arm')?part.replace('Arm','Hand'):part.endsWith('Foot')?part:null;
 function updateMarker(){const p=client.read(),supports=p.snapshot.contacts.filter(isHandSupport),n=effector();clearSupportMarkers();for(const c of supports){const g=supportGeometry(p,c,profile),mark=new THREE.Mesh(new THREE.SphereGeometry(.009,12,8),new THREE.MeshBasicMaterial({color:0x19855c,depthTest:false,transparent:true,opacity:.95}));mark.renderOrder=1000;mark.position.fromArray(toWorld(g.target));supportGroup.add(mark);}
  const paired=(p._sceneProject?.scene?.handInteractions||[]).some(r=>r.hands.some(h=>h.actorId===p._actorId&&h.hand===n));
  if(poseActive&&n&&!paired&&!supports.some(c=>c.bone===n)&&!stage.isOutputView()){const pos=forward(p,profile)[n].position;target.position.fromArray(toWorld(pos));dot.position.copy(target.position);dot.visible=true;transform.attach(target);transform.enabled=editable&&client.isOwner()&&(!client.canPose||client.canPose());}else{transform.detach();dot.visible=false;}}
 transform.addEventListener('dragging-changed',e=>{dragging=e.value;stage.controls.enabled=!e.value&&!stage.isOutputView();if(e.value){const p=client.read(),bone=effector();previewCommand=withHandSupportScope(makeCommand(p,[{kind:'effector',bone,position:toLocal(target.position.toArray())}],{bones:[bone,...ikChain(bone,profile)],expressions:[],root:false,gaze:false,stage:false,camera:false,lighting:false},'drag'),p,profile,{overwriteLinkedManual:true});}else if(previewCommand){const command=previewCommand;previewCommand=null;command.operations[0].position=toLocal(target.position.toArray());run(()=>client.send(command));}});
 transform.addEventListener('objectChange',()=>{if(!dragging||!previewCommand)return;previewCommand.operations[0].position=toLocal(target.position.toArray());const result=client.preview(previewCommand);avatar.preview(result.project.snapshot);stage.render(result.project);dot.position.copy(target.position);report(result);});
 const lightingGizmo=mountLightingGizmo({stage,client,run,report}),cameraGizmo=mountCameraGizmo({stage,client,run,report}),viewControls=mountViewControls({stage});
 const unview=stage.onViewChange(()=>{if(disposed||client.exists?.()===false)return;if(stage.isOutputView()&&dragging){previewCommand=null;dragging=false;transform.dragging=false;avatar.render(client.read());}if(!dragging)updateMarker();});
 const poseLibrary=mountPoseLibrary({host:library,client,avatar,profile,catalog,model,run});
 const button=(label,fn,host=panel)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(fn);host.append(b);return b;};
 const slider=(host,label,value,min,max,step,onchange,onpreview)=>{const wrap=document.createElement('label');wrap.className='slider';wrap.innerHTML=`<span>${label}<output>${value}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">`;const input=wrap.querySelector('input');input.oninput=()=>{wrap.querySelector('output').value=input.value;onpreview?.(+input.value);};input.onchange=()=>run(()=>onchange(+input.value));host.append(wrap);return input;};
 function draw(){
  scenePanel?.dispose();scenePanel=null;lightingGizmo.setActive(poseActive&&part==='scene');cameraGizmo.setActive(poseActive&&part==='camera');
  syncFields=[];
  panel.innerHTML=`<div class="eyebrow">LOCAL ADJUSTMENT</div><h2>${region.selectedOptions[0].textContent}</h2>`;
  if(!['scene','camera','head'].includes(part)){const hand=part.endsWith('Hand')?part:part.endsWith('Arm')?part.replace('Arm','Hand'):null;syncFields.push(mountSupportPanel({host:panel,hand,client,profile,run}));}
  if(part.endsWith('Hand')){
   if((client.read()._sceneProject?.scene?.handInteractions||[]).some(r=>r.hands.some(h=>h.actorId===client.actorId&&h.hand===part))){const hint=document.createElement('p');hint.className='subtle';hint.textContent='这只手正在互动中。可在此细调手指；接触位置请回到手部工作间调整。';panel.append(hint);}
   const side=part.startsWith('right')?'right':'left',grid=document.createElement('div');grid.className='gesture-grid';panel.append(grid);
   button('查看左右手势图册',async()=>{const {showGestureGallery}=await import('./gallery.js');return showGestureGallery({client,profile,model});});
   const applyGesture=()=>patch(handGesture(gesture,side,degree,spread,profile),'preset');
   for(const g of gestures.slice(0,5)){const b=button(g.name,()=>{gesture=g.id;return applyGesture();},grid);b.dataset.gesture=g.id;}
   const nums=document.createElement('details');nums.innerHTML='<summary>数字 1—10</summary><p class="subtle">采用单手手型；10 用握拳表示。</p><div class="gesture-grid"></div>';panel.append(nums);for(const g of gestures.slice(5))button(g.name.replace(/ · .*/,''),()=>{gesture=g.id;return applyGesture();},nums.querySelector('div'));
   slider(panel,'手势程度',degree,0,1,.01,v=>{degree=v;return applyGesture();});slider(panel,'手指展开',spread,0,1,.01,v=>{spread=v;return applyGesture();});
   slider(panel,'掌心转向',0,-90,90,1,v=>{const p=client.read(),fore=side+'LowerArm',wrist=side+'Hand',rq=new THREE.Quaternion().fromArray(p.snapshot.rotations[fore]),hand=new THREE.Quaternion().fromArray(p.snapshot.rotations[wrist]);const axis=new THREE.Vector3(1,0,0),twist=q=>new THREE.Quaternion(q.x,0,0,q.w).normalize();const swing=rq.clone().multiply(twist(rq).invert()),ws=hand.clone().multiply(twist(hand).invert());return patch({rotations:{[fore]:swing.multiply(new THREE.Quaternion().setFromAxisAngle(axis,v*Math.PI/180*.8)).toArray(),[wrist]:ws.multiply(new THREE.Quaternion().setFromAxisAngle(axis,v*Math.PI/180*.2)).toArray()}});});
  }
  if(part==='head'){
   syncFields.push(mountEyePanel({host:panel,client,profile,patch,run}));
   button('看向取景镜头',async()=>{const r=await patch({gaze:{...gazeRequest(client.read(),'camera',stage.viewSpec()),target:toLocal(client.read().camera.position)}},'preset');if(r?.status==='applied')stage.setOutputView(true);return r;});
   button('看向当前视角',()=>patch({gaze:{...gazeRequest(client.read(),'view',stage.viewSpec()),target:toLocal(stage.viewSpec().position)}},'preset'));
   const hint=document.createElement('p');hint.className='subtle';hint.textContent='取景镜头用于导出，点击后进入取景预览；当前视角是你此刻观察的位置。头颈受关节限制，背后的目标需要先转身。';panel.append(hint);
   const syncedSlider=(host,label,get,onchange)=>{let input;const sync=force=>{if(force||document.activeElement!==input){input.value=get();input.closest('label').querySelector('output').value=Number(get()).toFixed(2);}};input=slider(host,label,get(),0,1,.01,async v=>{try{return await onchange(v);}finally{sync(true);}});syncFields.push(()=>sync(false));return input;};
   syncedSlider(panel,'头颈跟随',()=>client.read().snapshot.gaze.follow,v=>patch({gaze:{...client.read().snapshot.gaze,follow:v}}));
   const faceLabels={happy:'微笑',blink:'眨眼',angry:'生气',sad:'难过',relaxed:'放松',Surprised:'惊讶',aa:'张嘴 · 啊',ih:'嘴形 · 衣',ou:'嘴形 · 乌',ee:'嘴形 · 诶',oh:'嘴形 · 哦',blinkLeft:'左眼眨眼',blinkRight:'右眼眨眼'};
   if(profile.capabilities.expressions.includes('happy'))syncedSlider(panel,'微笑',()=>client.read().snapshot.expressions.happy||0,v=>patch({expressions:{happy:v}}));
   const more=document.createElement('details');more.innerHTML='<summary>更多表情与嘴形</summary>';panel.append(more);for(const n of profile.capabilities.expressions.filter(n=>!['happy','blink','blinkLeft','blinkRight','neutral'].includes(n)))syncedSlider(more,faceLabels[n]||n,()=>client.read().snapshot.expressions[n]||0,v=>patch({expressions:{[n]:v}}));
   button('恢复中性表情',()=>patch({expressions:Object.fromEntries(profile.capabilities.expressions.map(n=>[n,0]))}));
  }
  if(part==='camera'){scenePanel=mountCameraPanel({host:panel,client,stage,cameraGizmo,run,patch});syncFields.push(()=>scenePanel?.sync());return;}
  if(part==='scene'){
   scenePanel=mountScenePanel({host:panel,client,stage,profile,lightGizmo:lightingGizmo,run,patch});syncFields.push(()=>scenePanel?.sync());
   return;
  }
  const edit=document.createElement('details');edit.open=!part.endsWith('Hand')&&part!=='head';edit.innerHTML='<summary>精细调整关节</summary><label>关节<select id="joint" aria-label="选择关节"></select></label><div id="angles"></div>';panel.append(edit);
  const joints=partBones(),select=edit.querySelector('#joint');select.innerHTML=joints.map(n=>`<option value="${n}">${boneLabel(n)}</option>`).join('');if(!joints.includes(selected))selected=joints[0];select.value=selected;
  let angleSync=()=>{};
  function angles(){const host=edit.querySelector('#angles');host.innerHTML='';const inputs={};const current=()=>new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(client.read().snapshot.rotations[selected]),'XYZ');const euler=current();
   for(const axis of ['x','y','z'])inputs[axis]=slider(host,`关节旋转 ${axis.toUpperCase()}`,Math.round(euler[axis]*180/Math.PI),-180,180,1,async value=>{const e=current();e[axis]=value*Math.PI/180;try{return await patch({rotations:{[selected]:new THREE.Quaternion().setFromEuler(e).toArray()}});}finally{angleSync(true);}});
   angleSync=(force=false)=>{const e=current();for(const axis of ['x','y','z'])if(force||document.activeElement!==inputs[axis]){inputs[axis].value=Math.round(e[axis]*180/Math.PI);inputs[axis].closest('label').querySelector('output').value=inputs[axis].value;}};
  }
  syncFields.push(()=>angleSync());
  select.onchange=()=>{selected=select.value;angles();};angles();
  const locks=document.createElement('div');locks.className='row';panel.append(locks);
  button('锁定 / 解锁该关节',()=>{const p=client.read(),exists=p.snapshot.locks.some(l=>l.kind==='joint'&&l.bone===selected),value=p.snapshot.locks.filter(l=>!(l.kind==='joint'&&l.bone===selected));if(!exists)value.push({kind:'joint',bone:selected,rotation:p.snapshot.rotations[selected]});return client.submit([{kind:'set-locks',value}],{...scopeFor({},p),bones:[selected]});},locks);
  if(effector())button('固定 / 释放控制点',()=>{const p=client.read(),bone=effector(),existing=p.snapshot.locks.some(l=>l.kind==='anchor'&&l.bone===bone),value=p.snapshot.locks.filter(l=>!(l.kind==='anchor'&&l.bone===bone));if(!existing)value.push({kind:'anchor',bone,...forward(p,profile)[bone]});return client.submit([{kind:'set-locks',value}],{...scopeFor({},p),bones:[bone]});},locks);
  if(part.startsWith('left')||part.startsWith('right'))button('镜像到另一侧',()=>patch(mirrorPatch({rotations:Object.fromEntries(partBones().map(n=>[n,client.read().snapshot.rotations[n]]))},profile),'mirror'));
  if(effector()){
   const position=document.createElement('details');position.innerHTML='<summary>控制点位置</summary><p class="subtle">拖动绿色箭头，或输入角色内部的位置（米）。</p><div class="row"></div>';panel.append(position);const world=forward(client.read(),profile)[effector()].position,edits={},fields=[];
   for(let i=0;i<3;i++){const input=document.createElement('input');input.type='number';input.step='.01';input.value=world[i].toFixed(3);input.ariaLabel='控制点 '+['X','Y','Z'][i];input.dataset.axis=i;input.oninput=()=>{edits[i]=Number(input.value);};fields.push(input);position.querySelector('div').append(input);}
   syncFields.push(()=>{const point=forward(client.read(),profile)[effector()].position;fields.forEach((input,i)=>{if(document.activeElement!==input&&!(i in edits))input.value=point[i].toFixed(3);});});
   button('移动控制点',async()=>{const p=client.read(),bone=effector(),pos=effectorFieldTarget(p,bone,edits,profile);const result=await client.submit([{kind:'effector',bone,position:pos}],{...scopeFor({},p),bones:[bone,...ikChain(bone,profile)]},'drag');if(result.status==='applied'){Object.keys(edits).forEach(k=>delete edits[k]);syncFields.forEach(f=>f());}return result;},position);
  }
 }
 region.onchange=()=>{part=region.value;selected=part==='head'?'head':part==='body'?'hips':part==='scene'?null:part.endsWith('Arm')?part.replace('Arm','UpperArm'):part;draw();updateMarker();};
 document.querySelector('#undo').onclick=()=>run(()=>client.submit([{kind:'undo'}],fullScope(client.read())));document.querySelector('#redo').onclick=()=>run(()=>client.submit([{kind:'redo'}],fullScope(client.read())));
 document.querySelector('#save').onclick=()=>run(async()=>{const r=await client.api('/api/projects/save',{});notice.className='good';notice.textContent='已保存版本 '+r.revision+' · '+r.file;await updateProjects();return r;});
 const projectSelect=document.querySelector('#projects');async function updateProjects(){const rows=await client.api('/api/projects');projectSelect.innerHTML='<option value="">重新打开已保存项目…</option>'+rows.map(r=>`<option value="${r.id}">${r.id===client.read().projectId?'当前项目 · ':''}${r.label?r.label+' · ':''}${r.id.slice(0,8)}</option>`).join('');}
 projectSelect.onchange=()=>run(async()=>{if(!projectSelect.value)return;const {project}=await client.api('/api/projects/open',{id:projectSelect.value}),p=client.read();const c=makeCommand(p,[{kind:'restore',project}],fullScope(p),'load');const check=client.preview(c);if(check.status!=='applied'){report(check);return;}return client.send(c);});
 document.querySelector('#export').onclick=()=>run(async()=>{const p=client.read();await stage.ready?.();avatar.render(p);stage.render(p);const blob=await stage.capture(p.camera),r=await client.api('/api/export',{image:await blobData(blob)});showExportResult(notice,r);return r;});
 document.querySelector('#exports-folder').onclick=()=>run(async()=>{const r=await client.api('/api/exports/open',{});notice.className='good';notice.textContent='已打开导出文件夹：'+r.displayDirectory;return r;});
 document.querySelector('#reconnect').onclick=()=>run(()=>client.connect());
 for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{const name=b.dataset.view,w=forward(client.read(),profile),center=toWorld(part==='head'?w.head.position:effector()?w[effector()].position:[0,.8,0]);if(name==='detail')stage.setView([center[0],center[1]+.05,center[2]+.7],center);else stage.setView(toWorld(name==='front'?[0,1.05,4]:name==='side'?[4,1.05,0]:[0,1.05,-4]),toWorld([0,.8,.05]));};
 const syncState=p=>{if(!dragging){updateMarker();syncFields.forEach(f=>f());}document.querySelector('#revision').textContent='版本 '+p.revision;const lockLabel=document.querySelector('#lock-state');lockLabel.textContent=p.snapshot.locks.length?'已锁定：'+p.snapshot.locks.map(l=>boneLabel(l.bone)+(l.kind==='anchor'?'位置':'')).join('、'):'没有锁定的部位';};const unsub=client.subscribe(syncState);
 draw();syncState(client.read());updateMarker();updateProjects().catch(e=>{notice.textContent=e.message;});
 return{report,setPoseActive(value,regionValue){poseActive=value;if(dragging){previewCommand=null;dragging=false;transform.dragging=false;stage.controls.enabled=!stage.isOutputView();stage.render(client.read());}supportGroup.visible=value;warnGroup.visible=value;if(regionValue){part=regionValue;region.value=part;}draw();updateMarker();},setEditable(value){editable=value;lightingGizmo.setEditable(value);cameraGizmo.setEditable(value);transform.enabled=value&&!stage.isOutputView();if(!dragging)updateMarker();scenePanel?.sync();},dispose(){disposed=true;previewCommand=null;dragging=false;scenePanel?.dispose();lightingGizmo.dispose();cameraGizmo.dispose();viewControls.dispose();unview();poseLibrary.dispose();unsub();transform.dispose();clearSupportMarkers();stage.helpers.remove(supportGroup,warnGroup,dot,helper);dot.geometry.dispose();dot.material.dispose();while(warnGroup.children.length){const o=warnGroup.children.pop();o.geometry.dispose();o.material.dispose();}stage.scene.remove(target);}};
}
