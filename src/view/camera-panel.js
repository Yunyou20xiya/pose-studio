import {makeCommand} from '../pose/state.js';
import {cameraPatch,captureCamera} from '../camera/bookmarks.js';
import {focalLength,focalRange,withFocalLength,resizeCamera} from '../camera/optics.js';
import {moveCamera,stepCamera} from '../camera/movement.js';
import {cameraScope} from './camera-gizmo.js';

export function mountCameraPanel({host,client,stage,cameraGizmo,run,patch}){
 const root=document.createElement('div');root.className='scene-panel camera-panel';host.append(root);
 root.innerHTML=`
  <div class="row"><button data-action="preview">从镜头看</button><button data-action="fit">查看机位</button></div>
  <p class="subtle" data-view-hint></p>
  <section class="light-section"><h3>焦距</h3>
   <div class="lens-presets">${[18,24,35,50,85,135,200].map(mm=>`<button data-focal="${mm}">${mm} mm</button>`).join('')}</div>
   <div class="slider numeric-slider"><span><span>广角 ↔ 长焦</span><span class="setting-value"><input type="number" step="any" aria-label="镜头焦距数值"><span>mm</span></span></span><input type="range" step=".1" aria-label="镜头焦距"></div>
   <p class="subtle">短焦容纳更多环境，长焦取景更窄。用“推近 / 拉远”改变拍摄距离。</p>
  </section>
  <section class="light-section"><h3>移动与朝向</h3>
   <div class="row"><button data-camera="camera">移动相机</button><button data-camera="target">移动瞄准点</button></div>
   <label class="camera-follow"><input type="checkbox" checked aria-label="移动相机时锁定瞄准点">移动相机时锁定瞄准点</label>
   <p class="subtle">蓝色是相机，绿色是瞄准点。拖动箭头自由移动；取消勾选可让两者一起平移。</p>
   <label>每次移动<select aria-label="镜头移动步长"><option value=".05">5 厘米</option><option value=".1" selected>10 厘米</option><option value=".5">50 厘米</option><option value="1">1 米</option></select></label>
   <div class="camera-steps">${[['left','← 左移'],['up','↑ 上移'],['forward','推近'],['right','右移 →'],['down','↓ 下移'],['back','拉远']].map(([id,label])=>`<button data-step="${id}">${label}</button>`).join('')}</div>
   <p class="subtle">微调按钮沿镜头方向平移，始终保持原朝向。</p>
   <details><summary>位置与瞄准点 · 精细调整</summary><div data-position="camera"></div><div data-position="target"></div></details>
  </section>
  <section class="light-section"><h3>画幅与构图</h3>
   <button class="wide" data-action="save-camera">用当前视角作为取景</button>
   <label>参考图尺寸<select aria-label="参考图尺寸"><option value="1600,1200">1600 × 1200 · 横向</option><option value="1200,1600">1200 × 1600 · 竖向</option><option value="2048,2048">2048 × 2048 · 方形</option><option value="1920,1080">1920 × 1080 · 宽屏</option></select></label>
   <p class="subtle">预览画框就是导出范围。焦距按 36mm 长边画幅换算，切换画幅时保留焦距。</p>
  </section>
  <details><summary>我的机位收藏</summary>
   <label>机位名称<input type="text" maxlength="60" aria-label="机位收藏名称" placeholder="例如：双人中景、手部特写"></label>
   <button class="wide" data-action="save-camera-bookmark">收藏当前取景</button>
   <label>已收藏机位<select aria-label="已收藏机位"><option value="">尚未选择</option></select></label>
   <label class="camera-follow"><input type="checkbox" aria-label="切换时同时看向镜头">切换时同时看向镜头</label>
   <p class="subtle">勾选后让当前角色尝试看向镜头；关节锁定与双手接触仍然有效。</p>
   <button class="wide" data-action="apply-camera-bookmark">应用所选机位</button><p class="subtle" data-camera-status role="status"></p>
  </details>`;
 const q=s=>root.querySelector(s),fields=[],mutators=[],cleanups=[];let disposed=false,busy=0,cameraAppliedRevision=null,lensCommand=null,numberDraft=null;
 const input=q('[type="range"]'),number=q('[aria-label="镜头焦距数值"]'),keepTarget=q('[aria-label="移动相机时锁定瞄准点"]');
 async function act(fn){busy++;sync();try{return await run(fn);}finally{busy--;if(!disposed){stage.render(client.read());sync(true);}}}
 function button(selector,fn){const b=q(selector);b.onclick=()=>act(fn);mutators.push(b);return b;}
 function sync(force=false){
  if(disposed)return;if(force&&root.contains(document.activeElement))document.activeElement.blur();
  fields.forEach(f=>f());mutators.forEach(el=>{el.disabled=busy>0||!client.isOwner();});
  const c=client.read().camera,{min,max}=focalRange(c),mm=focalLength(c);
  if(!lensCommand){input.min=min;input.max=max;number.min=min;number.max=max;if(document.activeElement!==input)input.value=mm;if(document.activeElement!==number)number.value=Number(mm.toFixed(2));input.setAttribute('aria-valuetext',mm.toFixed(1)+' mm');}
  for(const b of root.querySelectorAll('[data-focal]')){b.disabled=busy>0||!client.isOwner()||+b.dataset.focal<min||+b.dataset.focal>max;b.setAttribute('aria-pressed',String(Math.abs(+b.dataset.focal-mm)<.05));}
  saveCamera.disabled=busy>0||!client.isOwner()||stage.isOutputView();
  saveBookmark.disabled=busy>0||!client.isOwner()||!cameraName.value.trim();applyBookmark.disabled=busy>0||!client.isOwner()||!cameraCollection.value;
  if(cameraAppliedRevision!==null&&client.read().revision!==cameraAppliedRevision){cameraStatus.textContent='';cameraAppliedRevision=null;}
  q('[data-view-hint]').textContent=stage.isOutputView()?'正在预览导出画面，可调焦距或用按钮微调机位。':'正在自由观察；点“从镜头看”检查最终构图。';
 }
 q('[data-action="preview"]').onclick=()=>stage.setOutputView(true);q('[data-action="fit"]').onclick=()=>cameraGizmo.fit();
 for(const b of root.querySelectorAll('[data-focal]')){b.onclick=()=>act(()=>{const camera=withFocalLength(client.read().camera,+b.dataset.focal);stage.setOutputView(true);return patch({camera});});mutators.push(b);}
 function preview(){
  if(!client.isOwner()||busy)return;const mm=Number(input.value);
  if(!lensCommand){const p=client.read();lensCommand=makeCommand(p,[{kind:'patch',value:{camera:p.camera}}],cameraScope,'slider',[]);}
  try{lensCommand.operations[0].value.camera=withFocalLength(lensCommand.operations[0].value.camera,mm);stage.setOutputView(true);number.value=Number(mm.toFixed(2));input.setAttribute('aria-valuetext',mm.toFixed(1)+' mm');const result=client.preview(lensCommand);stage.render(result.status==='applied'?result.project:client.read());}
  catch(e){lensCommand=null;stage.render(client.read());run(()=>{throw e;});}
 }
 input.oninput=preview;input.onchange=()=>{if(!lensCommand)preview();const c=lensCommand;lensCommand=null;if(c)act(()=>client.send(c));};
 const cancelLens=()=>{lensCommand=null;numberDraft=null;stage.render(client.read());sync(true);};
 input.onblur=()=>{if(lensCommand)cancelLens();};input.onpointercancel=cancelLens;
 number.oninput=()=>{numberDraft=number.value;};
 number.onchange=number.onblur=()=>{if(numberDraft===null)return;const raw=numberDraft;numberDraft=null;lensCommand=null;return act(()=>{const p=client.read(),camera=withFocalLength(p.camera,raw.trim()===''?NaN:Number(raw));stage.setOutputView(true);return patch({camera});});};
 for(const field of [input,number])field.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancelLens();}else if(e.key==='Enter'){e.preventDefault();field.blur();}};
 mutators.push(input,number,keepTarget);keepTarget.onchange=()=>cameraGizmo.setKeepTarget(keepTarget.checked);
 for(const b of root.querySelectorAll('[data-camera]'))b.onclick=()=>{stage.setOutputView(false);cameraGizmo.select(b.dataset.camera);};
 cleanups.push(cameraGizmo.subscribe(which=>{for(const b of root.querySelectorAll('[data-camera]'))b.setAttribute('aria-pressed',String(b.dataset.camera===which));}));
 for(const b of root.querySelectorAll('[data-step]')){b.onclick=()=>act(()=>patch({camera:stepCamera(client.read().camera,b.dataset.step,Number(q('[aria-label="镜头移动步长"]').value))}));mutators.push(b);}
 for(const which of ['camera','target']){
  const parent=q(`[data-position="${which}"]`),label=which==='camera'?'相机':'瞄准点',edits={},inputs=[];let draftRevision=null;
  parent.innerHTML=`<p class="subtle">${label}位置（米）</p><div class="position-fields"></div>`;
  const current=()=>client.read().camera[which==='camera'?'position':'target'];
  for(let i=0;i<3;i++){const field=document.createElement('input');field.type='number';field.step='.05';field.min='-1000';field.max='1000';field.ariaLabel=label+' '+['X','Y','Z'][i];field.oninput=()=>{draftRevision??=client.read().revision;edits[i]=field.value.trim()===''?NaN:Number(field.value);};inputs.push(field);mutators.push(field);parent.querySelector('div').append(field);}
  fields.push(()=>{const p=current();inputs.forEach((field,i)=>{if(!(i in edits)&&document.activeElement!==field)field.value=Number(p[i].toFixed(4));});});
  const apply=document.createElement('button');apply.textContent='应用'+label+'位置';parent.append(apply);mutators.push(apply);
  apply.onclick=()=>act(async()=>{try{const p=client.read();if(draftRevision!==null&&p.revision!==draftRevision)throw Error('现场已改变，请重新输入位置');const position=current().map((n,i)=>i in edits?edits[i]:n);return await patch({camera:moveCamera(p.camera,which,position,{keepTarget:keepTarget.checked})});}finally{for(const k of Object.keys(edits))delete edits[k];draftRevision=null;}});
 }
 const saveCamera=button('[data-action="save-camera"]',()=>{const p=client.read(),camera=captureCamera({...p.camera,...stage.viewSpec()});return patch({camera,...(p.snapshot.gaze.mode==='camera'?{gaze:{...p.snapshot.gaze,target:client.toLocal?client.toLocal(camera.position):camera.position}}:{})});});
 const size=q('[aria-label="参考图尺寸"]');mutators.push(size);
 fields.push(()=>{const c=client.read().camera,value=[c.width,c.height].join(',');if(!Array.from(size.options).some(o=>o.value===value))size.append(new Option(`${c.width} × ${c.height} · 自定义`,value));size.value=value;});
 size.onchange=()=>{const [width,height]=size.value.split(',').map(Number);return act(()=>{const camera=resizeCamera(client.read().camera,width,height);stage.setOutputView(true);return patch({camera});});};
 const cameraName=q('[aria-label="机位收藏名称"]'),cameraCollection=q('[aria-label="已收藏机位"]'),cameraStatus=q('[data-camera-status]'),cameraFollow=q('[aria-label="切换时同时看向镜头"]');
 async function refreshCameras(selected=cameraCollection.value){
  const rows=await client.api('/api/cameras');if(disposed)return;
  cameraCollection.replaceChildren(new Option(rows.length?'选择已收藏的机位':'暂无收藏',''));
  for(const item of rows){const option=new Option(item.name+(item.unavailable?' · 暂不可用':` · ${item.width} × ${item.height}`),item.id);option.disabled=!!item.unavailable;cameraCollection.append(option);}cameraCollection.value=selected;sync();
 }
 const saveBookmark=button('[data-action="save-camera-bookmark"]',async()=>{const p=client.read(),item=await client.api('/api/cameras/save',{projectId:p.projectId,expectedRevision:p.revision,name:cameraName.value.trim()});if(disposed)return;await refreshCameras(item.id);cameraStatus.textContent='已收藏：'+item.name;cameraName.value='';});
 const applyBookmark=button('[data-action="apply-camera-bookmark"]',async()=>{
  cameraStatus.textContent='';cameraAppliedRevision=null;const p=client.read(),lookAtCamera=cameraFollow.checked,item=await client.api('/api/cameras/open',{id:cameraCollection.value});if(disposed)return;
  const current=client.read();if(current.projectId!==p.projectId||current.revision!==p.revision)throw Error('现场已改变，请重新应用所选机位');
  const value=cameraPatch(current,item.camera,{lookAtCamera});if(value.gaze&&client.toLocal)value.gaze.target=client.toLocal(value.gaze.target);
  const result=await patch(value,'preset');if(result?.status==='applied'&&!disposed){cameraAppliedRevision=result.revision;stage.setOutputView(true);cameraStatus.textContent='已应用：'+item.name;}return result;
 });
 cameraName.oninput=()=>sync();cameraCollection.onchange=()=>{cameraStatus.textContent='';sync();};mutators.push(cameraFollow,cameraCollection,cameraName);
 refreshCameras().catch(e=>{if(!disposed)cameraStatus.textContent=e.message;});cleanups.push(stage.onViewChange(()=>sync()));sync();
 return{sync,dispose(){disposed=true;lensCommand=null;numberDraft=null;cleanups.forEach(fn=>fn());if(client.exists?.()!==false)stage.render(client.read());root.remove();}};
}
