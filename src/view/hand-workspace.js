import {Vector3,Box3} from 'three';
import {makeCommand,fullScope} from '../pose/state.js';
import {sceneActors,actorDescriptor,actorProject,toWorld,toLocal} from '../scene/state.js';
import {forward} from '../pose/kinematics.js';
import {handInteractions,handTemplates} from '../scene/hand-interactions.js';
import {handFrame,handBounds,captureHandReference,blobData,prepareHandReference} from './hand-reference.js';
import {captureHandRepair} from './hand-repair.js';
import {fitView} from './framing.js';
import {showExportResult} from './export-notice.js';

export function defaultHandPlacement(p,preset,hands,profile){
 const shoulders=hands.map(h=>toWorld(p,h.actorId,forward(actorProject(p,h.actorId),profile)[h.hand.replace('Hand','UpperArm')].position));
 const point=shoulders[0].map((n,i)=>(n+shoulders[1][i])/2);
 if(preset==='palms-together'){const a=actorProject(p,hands[0].actorId),w=forward(a,profile);return{position:[(w.leftUpperArm.position[0]+w.rightUpperArm.position[0])/2,w.leftUpperArm.position[1]-.067,w.leftUpperArm.position[2]+.26],yaw:0};}
 const scale=hands.reduce((n,h)=>n+actorDescriptor(p,h.actorId).transform.scale,0)/2;point[1]-=(preset==='handshake'?.247:.407)*scale;point[2]+=(preset==='handshake'?0:.02)*scale;return{position:toLocal(p,hands[0].actorId,point),yaw:0};
}
export function mountHandWorkspace({library,inspector,client,stage,world,profile,onReport,onMode,onEdit}){
 let active=false,busy=false,selected=null,returnView=null,disposed=false,preset='palms-together',choice=[],outputs=[],inspection=null,isolate=true,projectId=client.read().projectId,outputMode=stage.isOutputView();
 const note=document.createElement('div');note.className='hand-overview';note.textContent='全身参照';note.hidden=true;document.querySelector('#stage').append(note);
 const tell=message=>onReport({issues:[],summary:message,status:'applied',revision:client.read().revision});
 const relation=()=>handInteractions(client.read()).find(r=>r.id===selected);
 const button=(host,text,fn,{editable=true}={})=>{const b=document.createElement('button');b.textContent=text;b.disabled=editable&&(!client.isOwner()||busy);b.onclick=fn;host.append(b);return b;};
 const paragraph=(host,text,cls='subtle')=>{const p=document.createElement('p');p.className=cls;p.textContent=text;host.append(p);return p;};
 function overview(){const r=relation();note.hidden=!active||!r||stage.isOutputView();if(note.hidden){stage.setInset?.(null);return;}const bounds=new Box3();for(const h of r.hands)bounds.union(world.bounds(h.actorId));stage.setInset?.(fitView(bounds,.75,new Vector3(.6,.2,1),35));}
 function updateInspection(){inspection?.();inspection=null;stage.setInspection?.(null);const r=relation();if(active&&r&&isolate&&!stage.isOutputView()){inspection=prepareHandReference({scene:stage.scene,world,relation:r,style:'inspection',frame:stage.viewSpec(),isolate:true});inspection.restore();stage.setInspection?.(inspection);}}
 function focus(id=selected,direction){selected=id;const r=relation();if(!r)return;if(!active){onMode('hand');}if(!returnView)returnView=stage.viewSpec();isolate=true;const frame=handFrame(world,r,direction||new Vector3(.4,.2,1));stage.setView(frame.position,frame.target,frame.fov);overview();updateInspection();draw();}
 function showArms(){const r=relation();if(!r)return;if(!returnView)returnView=stage.viewSpec();isolate=false;const p=client.read(),yaw=(actorDescriptor(p,r.hands[0].actorId).transform.yaw+r.yaw)*Math.PI/180,direction=(r.preset==='handshake'?new Vector3(1,.3,.6):new Vector3(.4,.2,1)).applyAxisAngle(new Vector3(0,1,0),yaw),frame=fitView(handBounds(world,r,{arms:true}),1.2,direction,32);stage.setView(frame.position,frame.target,frame.fov);overview();updateInspection();draw();}
 async function run(op){if(busy)return;busy=true;draw();try{const p=client.read(),r=await client.send(makeCommand(p,[{kind:'scene',...op}],{...fullScope(p),scene:true},'scene'));onReport(r);if(r.status==='applied'&&op.action!=='hand-release'){selected=op.id;focus();}return r;}catch(e){onReport({issues:[{severity:'error',message:e.message,bones:[]}]});}finally{busy=false;if(!disposed){draw();overview();}}}
 async function exportReference(style){if(busy)return;const p=client.read(),id=selected;busy=true;draw();try{await world.ready();assertCurrent(p);const r=handInteractions(p).find(r=>r.id===id);if(!r)throw Error('这个互动已不存在');const frame={...stage.viewSpec(),width:1200,height:1000};const blob=await captureHandReference({stage,world,relation:r,style,frame,isolate}),image=await blobData(blob);assertCurrent(p);const saved=await client.api('/api/export',{image});assertCurrent(p);outputs.push({url:saved.url,label:({beauty:'手部特写',depth:'深度图',ownership:'双方归属图'})[style]+' · 版本 '+p.revision});tell('手部参考已保存');showExportResult(document.querySelector('#notice'),saved,'手部参考图');}catch(e){onReport({issues:[{severity:'error',message:e.message,bones:[]}]});}finally{busy=false;draw();}}
 function assertCurrent(p){const now=client.read();if(now.projectId!==p.projectId||now.revision!==p.revision)throw Error('现场已改变，请重新导出当前双手');}
 async function exportRepair(){
  if(busy)return;const p=client.read(),id=selected;busy=true;draw();
  try{
   await world.ready();assertCurrent(p);const r=handInteractions(p).find(r=>r.id===id);if(!r)throw Error('这个互动已不存在');
   const capture=await captureHandRepair({stage,world,relation:r,assertCurrent:()=>assertCurrent(p)});
   const saved=await client.api('/api/hand-repair/export',{projectId:p.projectId,expectedRevision:p.revision,interactionId:id,...capture});
   outputs.push({url:saved.url,label:'修手资料 · 版本 '+p.revision});tell('修手资料已准备（尚未运行修图） · '+saved.directory);
  }catch(e){onReport({issues:[{severity:'error',message:e.message,bones:[]}]});}finally{busy=false;draw();}
 }
 function draw(){
  const p=client.read();if(projectId!==p.projectId){projectId=p.projectId;outputs=[];selected=null;returnView=null;}const actors=sceneActors(p),rows=handInteractions(p);if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||null;
  library.innerHTML='<div class="eyebrow">HAND WORKSPACE</div><h2>手部工作间</h2><p class="subtle">AI 先把双手摆好，在这里近看和微调。</p>';
  for(const r of rows){const b=button(library,handTemplates.find(t=>t.id===r.preset).name+' · '+r.hands.map(h=>actors.find(a=>a.id===h.actorId).name).filter((x,i,a)=>a.indexOf(x)===i).join(' / '),()=>focus(r.id),{editable:false});b.className='object-row wide';b.setAttribute('aria-pressed',String(r.id===selected));}
  const create=document.createElement('details');create.open=!rows.length;create.innerHTML='<summary>摆出一个双手动作</summary>';create.className='hand-create';library.append(create);
  const label=document.createElement('label');label.textContent='互动动作';const pick=document.createElement('select');pick.ariaLabel='互动动作';for(const t of handTemplates)pick.append(new Option(t.name,t.id));pick.value=preset;label.append(pick);create.append(label);
  if(choice.length!==2||choice.some(h=>!actors.some(a=>a.id===h.actorId))){choice=[{actorId:actors[0].id,hand:preset==='handshake'?'rightHand':'leftHand'},{actorId:preset==='palms-together'?actors[0].id:actors[1]?.id||actors[0].id,hand:'rightHand'}];}
  pick.onchange=()=>{preset=pick.value;choice=[];draw();};
  for(let i=0;i<2;i++){const l=document.createElement('label');l.textContent=i?'另一只手':'第一只手';const a=document.createElement('select'),h=document.createElement('select');a.ariaLabel=i?'第二位参与者':'第一位参与者';h.ariaLabel=i?'第二只参与手':'第一只参与手';for(const person of actors)a.append(new Option(person.name,person.id));a.value=choice[i].actorId;for(const [v,n]of [['leftHand','左手'],['rightHand','右手']])h.append(new Option(n,v));h.value=choice[i].hand;a.onchange=()=>{choice[i].actorId=a.value;};h.onchange=()=>{choice[i].hand=h.value;};l.append(a,h);create.append(l);}
  const replace=document.createElement('label'),check=document.createElement('input');check.type='checkbox';replace.className='keep-contact';replace.append(check,document.createTextNode('替换参与手臂的手动调整'));create.append(replace);
  button(create,'摆出这个动作',()=>{const p=client.read(),hands=structuredClone(choice);return run({action:'hand-interact',id:crypto.randomUUID(),preset,hands,...defaultHandPlacement(p,preset,hands,profile),strength:.45,overwriteManual:check.checked});}).className='primary wide';
  paragraph(create,'合掌：同一人的左右手。握手：两人的同侧手。牵手：两人的相反侧手。先在场景里安排人物距离。');
  inspector.replaceChildren();const r=relation();if(!r){paragraph(inspector,'从已有互动开始，或在左侧摆出一个动作。');return;}
  const title=document.createElement('h2');title.textContent=handTemplates.find(t=>t.id===r.preset).name;inspector.append(title);
  r.hands.forEach((h,i)=>paragraph(inspector,(i?'蓝色 · ':'橙色 · ')+actors.find(a=>a.id===h.actorId).name+' · '+(h.hand==='leftHand'?'左手':'右手'),'hand-party'));
  const isolateLabel=document.createElement('label'),isolateCheck=document.createElement('input');isolateCheck.type='checkbox';isolateCheck.checked=isolate;isolateLabel.className='keep-contact';isolateLabel.append(isolateCheck,document.createTextNode('只看双手，保留全身参照'));inspector.append(isolateLabel);isolateCheck.onchange=()=>{isolate=isolateCheck.checked;updateInspection();};
  const views=document.createElement('div');views.className='object-actions';inspector.append(views);
  button(views,'放大双手',()=>focus(),{editable:false});button(views,'连同手臂查看',showArms,{editable:false});button(views,'从侧面看',()=>focus(selected,new Vector3(1,.15,.15)),{editable:false});button(views,'从另一侧看',()=>focus(selected,new Vector3(-1,.15,.15)),{editable:false});button(views,'返回全身',()=>{isolate=false;updateInspection();if(returnView){stage.setView(returnView.position,returnView.target,returnView.fov);returnView=null;}else stage.fitAvatar();draw();},{editable:false});
  const fields=document.createElement('div');fields.className='placement-fields';inspector.append(fields);const values=[];
  for(const [i,n]of ['接触左右（厘米）','接触高度（厘米）','接触前后（厘米）','双手转向（度）'].entries()){const l=document.createElement('label');l.textContent=n;const input=document.createElement('input');input.type='number';input.step='any';input.min=i===3?-3600:-10000;input.max=i===3?3600:10000;input.ariaLabel=n;input.value=Number((i===3?r.yaw:r.position[i]*100).toFixed(2));input.disabled=busy||!client.isOwner();l.append(input);fields.append(l);values.push(input);}
  button(inspector,'调整接触位置',()=>{if(values.some(i=>!i.value.trim()||!i.reportValidity()))return;return run({action:'hand-adjust',id:r.id,position:values.slice(0,3).map(i=>+i.value/100),yaw:+values[3].value});}).className='wide';
  if(r.preset!=='palms-together'){const l=document.createElement('label');l.textContent='握合程度（%）';const n=document.createElement('input');n.ariaLabel='握合程度（%）';n.type='number';n.min=0;n.max=100;n.value=Math.round(r.strength*100);n.disabled=busy||!client.isOwner();l.append(n);inspector.append(l);button(inspector,'调整松紧',()=>{if(!n.value.trim()||!n.reportValidity())return;return run({action:'hand-adjust',id:r.id,strength:+n.value/100});});}
  const fine=document.createElement('div');fine.className='object-actions';inspector.append(fine);r.hands.forEach((h,i)=>button(fine,'精调'+(i?'第二只手':'第一只手'),()=>onEdit(h.actorId,h.hand),{editable:false}));
  button(inspector,'解除这个互动',()=>run({action:'hand-release',id:r.id})).className='wide';
  const exports=document.createElement('div');exports.className='hand-exports';inspector.append(exports);button(exports,'导出手部特写',()=>exportReference('beauty'));button(exports,'导出深度图',()=>exportReference('depth'));button(exports,'导出双方归属图',()=>exportReference('ownership'));
  button(exports,'导出修手资料',exportRepair).className='primary';
  paragraph(inspector,'修手资料保留同一机位的原图、深度和修图范围。建议先放大双手，给手指留足画面；替换成插画前，先对齐双手。');
  const name=document.createElement('input');name.ariaLabel='手部组合名称';name.placeholder='给这个动作起个名字';name.value=handTemplates.find(t=>t.id===r.preset).name;inspector.append(name);
  button(inspector,'收藏这组动作',async()=>{if(busy||!name.value.trim())return;busy=true;draw();try{await world.ready();const p=client.read();if(!handInteractions(p).some(x=>x.id===r.id))throw Error('这个互动已不存在');const thumbnail=await blobData(await captureHandReference({stage,world,relation:r,frame:{...handFrame(world,r),width:480,height:400},isolate:true}));await client.api('/api/combinations/save',{projectId:p.projectId,expectedRevision:p.revision,memberIds:[...new Set(r.hands.map(h=>h.actorId))],name:name.value.trim(),thumbnail});tell('已收藏，可从场景组合库再次添加');}catch(e){onReport({issues:[{severity:'error',message:e.message,bones:[]}]});}finally{busy=false;draw();}}).className='wide';
  for(const item of outputs){const a=document.createElement('a');a.href=item.url;a.target='_blank';a.textContent=item.label;a.className='hand-output';inspector.append(a);}
  paragraph(inspector,'收藏包含参与人物的当前姿态与内部互动。结构图可供绘图工具参考；细调手指后请从侧面检查。');
 }
 const unsub=client.subscribe(()=>{inspection?.();inspection=null;draw();overview();updateInspection();});const unview=stage.onViewChange(({outputView})=>{overview();if(outputMode!==outputView){outputMode=outputView;updateInspection();}});draw();
 return{beforeRender(){inspection?.();inspection=null;stage.setInspection?.(null);},focus,selectActor(id){choice=[{actorId:id,hand:'leftHand'},{actorId:id,hand:'rightHand'}];preset='palms-together';draw();},sync:draw,setActive(value){const entering=value&&!active;active=value;library.hidden=!value;inspector.hidden=!value;if(entering&&relation()){focus();return;}overview();updateInspection();},dispose(){disposed=true;unsub();unview();note.remove();inspection?.();stage.setInspection?.(null);stage.setInset?.(null);}};
}
