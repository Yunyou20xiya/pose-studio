import {Box3,Vector3} from 'three';
import {sceneItems,combinationOperation,externalLinkCount} from '../scene/combinations.js';
import {sceneGroups,groupDescriptor} from '../scene/groups.js';
import {sceneActors} from '../scene/state.js';
import {fitView} from './framing.js';

export function mountCombinationPanel({host,client,stage,world,select,selected,run,command,isBusy,onReport}){
 const root=document.createElement('section');root.className='combination-panel';host.append(root);let members=new Set(),rows=[],disposed=false;
 root.innerHTML='<h3>AI 布置与组合</h3><p class="subtle">在对话里描述现场，AI 摆好后，选中组合或成员继续微调。</p><div class="group-list"></div><details class="group-builder"><summary>手动选择成员组成一组</summary><p class="subtle">勾选要一起摆放的人和物品。每个对象属于一组，也能单独调整。</p><div class="member-picker"></div><div class="row"><button data-pick-all>全选未分组</button><button data-pick-contact>补齐接触对象</button></div><label>组合名称<input aria-label="新组合名称" maxlength="60" placeholder="例如：窗边看书"></label><button class="wide" data-create>组成一组</button></details><details class="combination-library" open><summary>组合库 · 一键摆出</summary><p class="subtle">添加到当前现场，之后可整组挪动。镜头和灯光沿用当前设置。</p><div class="combination-cards"></div><p class="subtle" data-library-status role="status"></p></details>';
 const q=s=>root.querySelector(s),status=message=>q('[data-library-status]').textContent=message;
 const report=e=>onReport({issues:[{severity:'error',message:e.message,bones:[]}]});
 const button=(parent,text,fn,disabled=false)=>{const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=fn;parent.append(b);return b;};
 const bounds=id=>{const g=groupDescriptor(client.read(),id);if(!g)return world.bounds(id);const box=new Box3();for(const member of g.memberIds)box.union(world.bounds(member));return box;};
 async function refresh(){try{rows=await client.api('/api/combinations');if(!disposed){status('');drawCards();}}catch(e){if(!disposed)status(e.message);}}
 function drawCards(){
  const container=q('.combination-cards');container.replaceChildren();const p=client.read();
  for(const row of rows){const card=document.createElement('article');card.className='combination-card';container.append(card);if(!row.unavailable){const img=document.createElement('img');img.src=row.thumbnail;img.alt=row.name+'组合预览';img.loading='lazy';card.append(img);}
   const title=document.createElement('strong');title.textContent=row.name;card.append(title);const caption=document.createElement('small');caption.textContent=row.unavailable?row.reason:`${row.builtin?'起步组合':'我的收藏'} · ${row.actors} 人 · ${row.objects} 件物品`;card.append(caption);
   const full=sceneActors(p).length+row.actors>6||(p.scene?.objects.length||0)+row.objects>80;
   button(card,full?'当前场景容量不足':'添加 '+row.name,async()=>{
    try{status('正在摆出组合…');const item=await client.api('/api/combinations/open',{id:row.id}),op=combinationOperation(client.read(),item.combination),r=await run(command(op),op.id);if(r?.status==='applied'){await world.ready();stage.fitBounds(bounds(op.id));status('已添加“'+item.name+'”。可在右侧整组移动，也能选择单个成员。');}else status('未添加；请查看画面下方的提示。');}
    catch(e){status(e.message);report(e);}
   },row.unavailable||full||!client.isOwner()||isBusy());
  }if(!rows.length)status('还没有收藏。先将角色和物品组成一组，再在右侧收藏。');
 }
 function draw(){
  const p=client.read(),items=sceneItems(p),grouped=new Set(sceneGroups(p).flatMap(g=>g.memberIds));members=new Set([...members].filter(id=>items.some(a=>a.id===id)&&!grouped.has(id)));
  const list=q('.group-list');list.replaceChildren();for(const g of sceneGroups(p)){const b=button(list,g.name+' · '+g.memberIds.length+' 个成员',()=>select(g.id));b.className='object-row';b.ariaLabel='选择组合 '+g.name;b.setAttribute('aria-pressed',String(selected()===g.id));}
  const picker=q('.member-picker');picker.replaceChildren();for(const a of items){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.ariaLabel='组合成员 '+a.name;input.checked=members.has(a.id);input.disabled=grouped.has(a.id)||!client.isOwner()||isBusy();input.onchange=()=>{input.checked?members.add(a.id):members.delete(a.id);q('[data-create]').disabled=!members.size||!client.isOwner()||isBusy();};label.append(input,document.createTextNode(a.name+(grouped.has(a.id)?' · 已分组':'')));picker.append(label);}
  q('[data-create]').disabled=!members.size||!client.isOwner()||isBusy();q('[data-pick-all]').disabled=q('[data-pick-contact]').disabled=!client.isOwner()||isBusy();drawCards();
 }
 q('[data-pick-all]').onclick=()=>{const grouped=new Set(sceneGroups(client.read()).flatMap(g=>g.memberIds));members=new Set(sceneItems(client.read()).filter(a=>!grouped.has(a.id)).map(a=>a.id));draw();};
 q('[data-pick-contact]').onclick=()=>{let changed=true;while(changed){changed=false;for(const r of client.read().scene?.relations||[])if(members.has(r.subjectId)||members.has(r.targetId))for(const id of [r.subjectId,r.targetId])if(!members.has(id)){members.add(id);changed=true;}}draw();};
 q('[data-create]').onclick=async()=>{const id=crypto.randomUUID(),name=q('[aria-label="新组合名称"]').value.trim()||'场景组合',r=await run(command({action:'group-create',id,name,memberIds:[...members]}),id);if(r?.status==='applied'){members.clear();q('.group-builder').open=false;draw();}};
 async function thumbnail(group){
  await world.ready();const box=bounds(group.id);if(box.isEmpty())throw Error('组合成员均已隐藏，请先显示至少一个成员再收藏');
  const hidden=[];try{
   for(const item of sceneItems(client.read()))if(!group.memberIds.includes(item.id)){const object=world.object(item.id);if(object){hidden.push([object,object.visible]);object.visible=false;}}
   const view=fitView(box,4/3,new Vector3().subVectors(stage.camera.position,stage.controls.target)),blob=await stage.capture({...view,width:480,height:360});
   return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }finally{for(const [object,visible]of hidden)object.visible=visible;stage.render(client.read());}
 }
 function inspector({host:panel,group,mode,setMode}){
  const p=client.read(),g=group,blocked=!client.isOwner()||isBusy(),locked=g.memberIds.some(id=>sceneItems(p).find(a=>a.id===id)?.locked);
  panel.innerHTML='<div class="eyebrow">SCENE COMBINATION</div><h2></h2><p class="subtle">拖动箭头沿地面移动，或切换转向。点下面的成员可单独调整。</p>';
  panel.querySelector('h2').textContent=g.name;
  const label=document.createElement('label');label.textContent='组合名称';const name=document.createElement('input');name.ariaLabel='组合名称';name.maxLength=60;name.value=g.name;name.disabled=blocked;name.onchange=()=>run(command({action:'group-rename',id:g.id,name:name.value}));label.append(name);panel.append(label);
  const modes=document.createElement('div');modes.className='row placement-modes';panel.append(modes);for(const [key,title]of [['translate','整组移动'],['rotate','整组转向']]){const b=button(modes,title,()=>setMode(key),blocked||locked);b.setAttribute('aria-pressed',String(mode===key));}
  const fields=document.createElement('div');fields.className='placement-fields';panel.append(fields);const inputs=[];
  for(const [title,value,min,max]of [['组合左右（米）',g.position[0],-1000,1000],['组合前后（米）',g.position[2],-1000,1000],['组合转向（度）',g.yaw,-3600,3600]]){const l=document.createElement('label');l.textContent=title;const i=document.createElement('input');i.type='number';i.step='any';i.min=min;i.max=max;i.value=Number(value.toFixed(3));i.ariaLabel=title;i.disabled=blocked||locked;l.append(i);fields.append(l);inputs.push(i);}
  button(panel,'应用整组位置',()=>{if(inputs.some(i=>!i.value.trim()||!i.checkValidity()))return report(Error('请填写有效的组合位置与转向'));return run(command({action:'group-transform',id:g.id,position:[+inputs[0].value,p.scene.floorY,+inputs[1].value],yaw:+inputs[2].value}));},blocked||locked).className='wide';
  const membersBox=document.createElement('div');membersBox.className='group-members';panel.append(membersBox);for(const id of g.memberIds){const a=sceneItems(p).find(a=>a.id===id);button(membersBox,'调整 '+a.name,()=>select(id));}
  const linkCount=externalLinkCount(p,g.memberIds),note=document.createElement('p');note.className='subtle';note.textContent=linkCount?`复制或收藏会保留当前姿态，省去 ${linkCount} 处通向组外的绑定。组内的接触与注视继续保留。`:'复制和收藏会保留成员之间的接触与注视关系。';panel.append(note);
  const actions=document.createElement('div');actions.className='object-actions';panel.append(actions);
  button(actions,'近看组合',()=>stage.fitBounds(bounds(g.id)));
  button(actions,'复制整组',async()=>{const id=crypto.randomUUID(),r=await run(command({action:'group-duplicate',id:g.id,newId:id,idMap:Object.fromEntries(g.memberIds.map(m=>[m,crypto.randomUUID()]))}),id);if(r?.status==='applied'){await world.ready();stage.fitBounds(bounds(id));}},blocked);
  const save=button(actions,'收藏这个组合',async()=>{save.disabled=true;message.textContent='正在生成组合预览…';try{const image=await thumbnail(g),item=await client.api('/api/combinations/save',{projectId:p.projectId,expectedRevision:p.revision,groupId:g.id,name:g.name,thumbnail:image});message.textContent='已收藏“'+item.name+'”'+(item.detachedLinks?`；省去 ${item.detachedLinks} 处组外绑定。`:'。');await refresh();}catch(e){message.textContent=e.message;}finally{save.disabled=blocked;}},blocked);
  button(actions,'解除分组',()=>run(command({action:'group-dissolve',id:g.id})),blocked);
  const message=document.createElement('p');message.className='subtle';message.setAttribute('role','status');panel.append(message);
  if(locked){const warning=document.createElement('p');warning.className='subtle';warning.textContent='有成员已锁定；解锁后可以整组移动。';panel.append(warning);}
 }
 refresh();return{draw,inspector,bounds,dispose(){disposed=true;root.remove();}};
}
