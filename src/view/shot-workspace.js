import {captureSceneReference} from './reference-capture.js';
const blobData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('预览图读取失败'));reader.readAsDataURL(blob);});

export function mountShotWorkspace({library,inspector,client,stage,world,render,onReport,captureReference=captureSceneReference}){
 library.innerHTML='<div class="eyebrow">SHOT LIST</div><h2>镜头卡片</h2><p class="subtle">AI 先排镜头，你逐张微调。</p><div class="shot-list"></div><div class="shot-library-actions"><button data-action="new">＋ 保存当前现场</button><button data-action="refresh">刷新卡片</button></div><details class="shot-recovery"><summary>自动保留的现场 <span></span></summary><p class="subtle">切换前的调整、更新前的版本，都可在这里找回。</p><div></div></details>';
 inspector.innerHTML='<div class="eyebrow">COMPLETE SHOT</div><h2>保存一个完整画面</h2><p class="shot-current subtle"></p><div class="shot-preview"></div><p class="shot-meta subtle"></p><button class="wide primary" data-action="open">打开这个镜头</button><p class="subtle">恢复人物、手型、表情、物品、灯光和相机。未存入卡片的现场会先自动保留，也可以撤销切换。</p><div class="shot-order row"><button data-action="up">↑ 前移</button><button data-action="down">↓ 后移</button></div><section class="shot-save"><h3>保存当前现场</h3><label>镜头名称<input aria-label="镜头卡片名称" maxlength="80" placeholder="例如：挡光 · 脸部特写"></label><label>拍摄意图<textarea aria-label="镜头拍摄意图" maxlength="500" rows="3" placeholder="这一张想表现什么？"></textarea></label><button class="wide" data-action="save">另存为新镜头</button><button class="wide" data-action="update">更新所选镜头</button><p class="subtle">更新会保留上一版。只对当前项目的卡片生效。</p></section><section class="shot-reference"><h3>交给 AI 出图</h3><p class="subtle">成对导出正常光和打灯后参考：同姿势、同机位。另附正常光下的手脸细节、体块、深度和分色。以中间当前画面为准。</p><button class="wide primary" data-action="reference">导出 AI 参考包</button><div class="reference-result"></div></section><p class="shot-status" role="status"></p>';
 const q=s=>inspector.querySelector(s),list=library.querySelector('.shot-list'),history=library.querySelector('.shot-recovery>div'),name=q('input'),note=q('textarea'),status=q('.shot-status');
 let board={projectId:client.read().projectId,revision:0,shots:[],recoveries:[]},selected=null,active=false,busy=false,disposed=false,dirty=false,creating=false,serial=0,lastSceneRevision=null;
 const selectedItem=()=>[...board.shots,...board.recoveries].find(s=>s.id===selected);
 const request=p=>({projectId:p.projectId,expectedRevision:p.revision,expectedBoardRevision:board.revision});
 function message(value,error=false){status.textContent=value;status.className='shot-status '+(error?'error':'good');}
 function select(id){selected=id;creating=false;dirty=false;paint();}
 function card(item,index,recovery=false){
  const button=document.createElement('button');button.className=recovery?'shot-recovery-row':'shot-card';button.setAttribute('aria-pressed',String(item.id===selected));button.onclick=()=>select(item.id);
  if(!recovery){
   if(item.thumbnail){const img=document.createElement('img');img.src=item.thumbnail;img.alt=item.name+'取景预览';img.loading='lazy';button.append(img);}
   else{const empty=document.createElement('span');empty.className='shot-no-image';empty.textContent='打开镜头后生成预览';button.append(empty);}
  }
  const label=document.createElement('strong');label.textContent=(recovery?'':String(index+1).padStart(2,'0')+' · ')+item.name;button.append(label);
  const sub=document.createElement('small');sub.textContent=item.matchesCurrent?'当前画面':recovery?new Date(item.createdAt).toLocaleString('zh-CN',{hour12:false}):item.note||`${item.actors} 人 · ${item.objects} 件物品`;button.append(sub);return button;
 }
 function paint(){
  list.replaceChildren(...board.shots.map((s,i)=>card(s,i)));
  if(!board.shots.length){const empty=document.createElement('p');empty.className='subtle shot-empty';empty.textContent='先摆好一张画面，保存为第一张镜头卡片。';list.append(empty);}
  history.replaceChildren(...board.recoveries.map((s,i)=>card(s,i,true)));library.querySelector('.shot-recovery span').textContent=board.recoveries.length?'（'+board.recoveries.length+'）':'';
  const item=selectedItem(),preview=q('.shot-preview');preview.replaceChildren();
  q('h2').textContent=item?item.name:'保存一个完整画面';
  if(item?.thumbnail){const img=document.createElement('img');img.src=item.thumbnail;img.alt='所选镜头的已保存画面';preview.append(img);}
  q('.shot-meta').textContent=item?`${item.actors} 人 · ${item.objects} 件物品 · ${item.width} × ${item.height}`:'人物、手型、表情、灯光与相机一起保存。';
  const match=[...board.shots,...board.recoveries].find(s=>s.matchesCurrent);q('.shot-current').textContent=match?'当前现场对应：'+match.name:'当前现场有尚未存入卡片的调整';
  if(!dirty){name.value=item?.name||'';note.value=item?.note||'';}
  sync();
 }
 function sync(){
  const blocked=busy||!client.isOwner(),index=board.shots.findIndex(s=>s.id===selected);
  q('[data-action="reference"]').disabled=blocked;
  q('[data-action="open"]').disabled=blocked||!selectedItem();q('[data-action="save"]').disabled=blocked||!name.value.trim();q('[data-action="update"]').disabled=blocked||index<0||!name.value.trim();
  q('[data-action="up"]').disabled=blocked||index<=0;q('[data-action="down"]').disabled=blocked||index<0||index>=board.shots.length-1;
  for(const field of [name,note])field.disabled=blocked;
  library.querySelector('[data-action="new"]').disabled=blocked;library.querySelector('[data-action="refresh"]').disabled=busy;
  for(const button of library.querySelectorAll('.shot-card,.shot-recovery-row'))button.disabled=busy;
 }
 async function refresh(force=false){
  const p=client.read(),ticket=++serial,next=await client.api('/api/shots?projectId='+encodeURIComponent(p.projectId));
  if(disposed||ticket!==serial||client.read().projectId!==p.projectId)return;
  const changed=force||board.projectId!==p.projectId||board.revision!==next.revision||lastSceneRevision!==p.revision;
  if(board.projectId!==p.projectId){selected=null;creating=false;dirty=false;message('');}
  board=next;lastSceneRevision=p.revision;
  if(!selectedItem()&&!creating&&!dirty){selected=board.shots[0]?.id||null;}
  if(changed)paint();else sync();
 }
 async function act(fn){
  if(busy)return;busy=true;sync();message('正在处理…');
  try{await fn();}catch(e){message(e.message,true);}
  finally{busy=false;if(!disposed){await refresh().catch(e=>message(e.message,true));sync();}}
 }
 async function capture(p){
  try{
   render(p);await world.ready();const current=client.read();if(current.projectId!==p.projectId||current.revision!==p.revision)throw Error('现场已改变，请重新保存镜头');
   render(p);const scale=480/Math.max(p.camera.width,p.camera.height);
   return await blobData(await stage.capture({...p.camera,width:Math.max(1,Math.round(p.camera.width*scale)),height:Math.max(1,Math.round(p.camera.height*scale))}));
  }
  finally{render(client.read());}
 }
 async function save(update){
  const p=client.read(),args={...request(p),name:name.value.trim(),note:note.value.trim(),...(update?{id:selected}:{})};
  const thumbnail=await capture(p),result=await client.api('/api/shots/save',{...args,thumbnail});
  if(disposed||client.read().projectId!==p.projectId)return;selected=result.id;creating=false;dirty=false;message(update?'已更新镜头；上一版已自动保留。':'已保存完整镜头：'+result.name);
 }
 q('[data-action="reference"]').onclick=()=>act(async()=>{
  const p=client.read();
  const assertCurrent=()=>{const now=client.read();if(now.projectId!==p.projectId||now.revision!==p.revision)throw Error('现场已改变，请重新导出参考包');};
  await refresh(true);assertCurrent();const matches=[...board.shots,...board.recoveries].filter(s=>s.matchesCurrent),match=board.sceneRevision===p.revision&&matches.length===1?matches[0]:null,title=match?.name||'当前现场',intent=match?.note||'';
  const captured=await captureReference({project:p,stage,world,render:value=>render(value||client.read()),assertCurrent,onProgress:(step,total)=>message(`正在准备参考图 ${step} / ${total}…`)});
  assertCurrent();message('正在保存参考包…');
  const result=await client.api('/api/reference-pack/export',{projectId:p.projectId,expectedRevision:p.revision,title,intent,...captured});
  if(disposed)return;
  const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener';link.textContent='查看 AI 参考包 ↗';
  const hint=document.createElement('p');hint.className='subtle';hint.textContent='已保存到导出文件夹的「AI参考包」中。';
  q('.reference-result').replaceChildren(link,hint);message('已保存：'+title+'，含正常光、打灯后两张主参考，另有三张辅助图和 '+result.details+' 张局部图。');
 });
 q('[data-action="save"]').onclick=()=>act(()=>save(false));q('[data-action="update"]').onclick=()=>act(()=>save(true));
 q('[data-action="open"]').onclick=()=>act(async()=>{
  const p=client.read(),target=selectedItem(),result=await client.api('/api/shots/open',{...request(p),id:target.id});
  if(disposed||client.read().projectId!==p.projectId)throw Error('项目已切换，请重新选择镜头');
  const applied=await client.send(result.command);onReport?.(applied);if(applied.status!=='applied')throw Error(applied.issues.map(i=>i.message).join('；'));
  await world.ready();stage.setOutputView(true);
  if(!target.thumbnail){
   try{const opened=client.read();if(opened.revision!==applied.revision||opened.projectId!==p.projectId)throw Error('现场已继续调整');const thumbnail=await capture(opened);await client.api('/api/shots/thumbnail',{projectId:p.projectId,expectedRevision:opened.revision,expectedBoardRevision:result.boardRevision,id:target.id,thumbnail});}
   catch(e){message('已打开镜头；预览图稍后可随保存更新。'+e.message,true);return;}
  }
  message('已打开：'+result.name+(result.preserved?'；切换前现场已自动保留。':'；可以撤销切换。'));
 });
 for(const [action,offset]of [['up',-1],['down',1]])q(`[data-action="${action}"]`).onclick=()=>act(async()=>{
  const index=board.shots.findIndex(s=>s.id===selected),ids=board.shots.map(s=>s.id);if(index<0||index+offset<0||index+offset>=ids.length)return;
  [ids[index],ids[index+offset]]=[ids[index+offset],ids[index]];await client.api('/api/shots/reorder',{...request(client.read()),ids});message('镜头顺序已调整。');
 });
 name.oninput=note.oninput=()=>{dirty=true;sync();};
 library.querySelector('[data-action="new"]').onclick=()=>{selected=null;creating=true;dirty=false;paint();name.focus();};
 library.querySelector('[data-action="refresh"]').onclick=()=>refresh(true).catch(e=>message(e.message,true));
 const unsubscribe=client.subscribe(()=>{if(active&&!busy)refresh().catch(e=>message(e.message,true));});
 const timer=setInterval(()=>{if(active&&!busy)refresh().catch(e=>message(e.message,true));},5000);
 return{sync,setActive(value){active=value;library.hidden=inspector.hidden=!value;if(value){stage.setOutputView(true);refresh().catch(e=>message(e.message,true));}},dispose(){disposed=true;serial++;clearInterval(timer);unsubscribe();}};
}
