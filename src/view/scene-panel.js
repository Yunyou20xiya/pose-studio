import {makeCommand} from '../pose/state.js';
import {lightingDefaults,lightTarget} from '../lighting/settings.js';
import {lightPresets,presetLighting,buildLightingCommand} from '../lighting/presets.js';

export function mountScenePanel({host,client,stage,profile,lightGizmo,run,patch}){
 const root=document.createElement('div');root.className='scene-panel';host.append(root);
 root.innerHTML=`
  <label>受光显示<select aria-label="受光显示"><option value="original">角色原貌</option><option value="reference">打光参考 · 哑光受光</option></select></label>
  <p class="subtle">打光参考更便于观察明暗与遮挡，可随时切回角色原貌。</p>
  <section class="light-section"><h3>主光 <label class="switch"><input type="checkbox" aria-label="主光开关">开启</label></h3>
   <div class="row light-move"><button data-light="lamp">移动主灯</button><button data-light="target">移动照射点</button></div>
   <p class="subtle light-drag-hint">橙色是灯，绿色是照射点。拖动箭头调整位置。</p>
   <button class="wide" data-action="fit">查看灯位</button>
   <label>照向哪里<select aria-label="照射目标"><option value="head">跟随头部</option><option value="upperBody">跟随上身</option><option value="point">固定位置</option></select></label>
   <label>灯具<select aria-label="灯具形状"><option value="point">小灯 · 原有主光</option><option value="square">方形柔光箱</option><option value="rectangle">长方形柔光箱</option><option value="disc">圆形柔光灯</option></select></label>
   <div data-fields="emitter"></div>
   <p class="subtle">发光面越大，遮挡边缘越柔和。灯具示意只在调灯时显示；柔光采用实时近似。</p>
   <label>光斑<select aria-label="光斑形状"><option value="none">宽幅照明</option><option value="circle">圆形光斑</option><option value="square">方形光斑</option><option value="rectangle">长方形 / 长条光斑</option></select></label>
   <div data-fields="beam"></div>
   <p class="subtle" data-beam-note>光斑尺寸以照射点处为准；斜照到地面或身体上会随表面变形。</p>
   <div data-fields="key"></div>
   <details><summary>灯位与照射点 · 精细调整</summary><div data-position="lamp"></div><div data-position="target"></div><p class="subtle">位置以米为单位；修改照射点后使用固定位置。</p></details>
  </section>
  <section class="light-section"><h3>环境补光 <label class="switch"><input type="checkbox" aria-label="补光开关">开启</label></h3><div data-fields="fill"></div></section>
  <section class="light-section"><h3>布光方案</h3><div class="light-presets"></div>
   <details><summary>我的布光收藏</summary>
    <label>收藏名称<input type="text" maxlength="60" aria-label="布光收藏名称" placeholder="例如：窗边冷光"></label>
    <button class="wide" data-action="save-light">收藏当前布光</button>
    <label>已收藏<select aria-label="已收藏布光"><option value="">尚未选择</option></select></label>
    <button class="wide" data-action="apply-light">应用所选布光</button><p class="subtle" data-light-status role="status"></p>
   </details>
  </section>
  `;
 const targetNote=document.createElement('p');targetNote.className='subtle';targetNote.textContent='跟随头部或上身时，以场景中的第一名角色为目标；照射点可自由移动。';root.prepend(targetNote);
 const q=s=>root.querySelector(s),fields=[],mutators=[],cleanups=[];let disposed=false,busy=0;
 const l=()=>lightingDefaults(client.read().lighting);
 function bind(input,get,set,{checkbox=false}={}){
  fields.push(()=>{if(document.activeElement!==input){if(checkbox)input.checked=get();else input.value=get();}});
  input.onchange=()=>{const value=checkbox?input.checked:input.value;return act(()=>set(value));};mutators.push(input);return input;
 }
 function button(selector,fn,mutates=true){const b=q(selector);b.onclick=()=>act(fn);if(mutates)mutators.push(b);return b;}
 async function act(fn){busy++;sync();try{return await run(fn);}finally{busy--;if(!disposed){stage.render(client.read());sync(true);}}}
 function sync(force=false){
  if(disposed)return;
  // Preserve a field while the user is typing; committed controls are synchronized after success or rejection.
  if(force){const active=document.activeElement;if(root.contains(active))active.blur();}
  fields.forEach(f=>f());mutators.forEach(el=>{el.disabled=busy>0||!client.isOwner();});
  saveLight.disabled=busy>0||!client.isOwner()||!name.value.trim();applyLight.disabled=busy>0||!client.isOwner()||!collection.value;
  q('.light-drag-hint').textContent=stage.isOutputView()?'正在预览最终画面；选择移动主灯可回到自由观察。':'橙色是灯，绿色是照射点。拖动箭头调整位置。';
 }
 function range(parent,label,key,min,max,step,{camera=false,format=String}={}){
  const percent=['shadowSoftness','beamEdge'].includes(key),scale=percent?100:1,unit=percent?'%':/Width|Height/.test(key)?'m':['fov','beamRotation'].includes(key)?'°':'';
  const upper=/Width|Height/.test(key)?8:/Intensity/.test(key)?30:key==='fov'?120:max,lower=key==='fov'?5:min;
  const wrap=document.createElement('div');wrap.className='slider numeric-slider';wrap.innerHTML=`<span><span>${label}</span><span class="setting-value"><input type="number" min="${lower*scale}" max="${upper*scale}" step="any" aria-label="${label}数值"><span>${unit}</span></span></span><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}">`;parent.append(wrap);
  const input=wrap.querySelector('[type="range"]'),number=wrap.querySelector('[type="number"]');let command=null,numberDraft=null;
  const current=()=>camera?client.read().camera[key]:l()[key],display=v=>Number((v*scale).toFixed(6));
  function preview(){
   if(!client.isOwner())return;
   if(camera)stage.setOutputView(true);
   const p=command?null:client.read();
   if(!command)command=makeCommand(p,[{kind:'patch',value:camera?{camera:{...p.camera}}:{lighting:{...p.lighting}}}],{bones:[],expressions:[],root:false,gaze:false,stage:false,camera,lighting:!camera},'slider',[]);
   command.operations[0].value[camera?'camera':'lighting'][key]=+input.value;
   number.value=display(+input.value);input.setAttribute('aria-valuetext',format(+input.value));const result=client.preview(command);stage.render(result.status==='applied'?result.project:client.read());
  }
  input.oninput=preview;input.onchange=()=>{if(!command)preview();const c=command;command=null;if(c)act(()=>client.send(c));};
  input.onblur=()=>{if(command){command=null;stage.render(client.read());sync();}};
  number.oninput=()=>{numberDraft=number.value;};
  number.onchange=number.onblur=()=>{
   if(numberDraft===null)return;const raw=numberDraft;numberDraft=null;command=null;
   return act(()=>{const value=raw.trim()===''?NaN:Number(raw)/scale;
    if(!Number.isFinite(value)||value<lower||value>upper)throw Error(`${label}请输入 ${lower*scale}–${upper*scale}${unit} 之间的数值`);
    if(value===current())return;
    const p=client.read();if(camera)stage.setOutputView(true);return patch(camera?{camera:{...p.camera,[key]:value}}:{lighting:{...p.lighting,[key]:value}});
   });
  };
  number.onkeydown=e=>{if(e.key==='Escape'){numberDraft=null;number.value=display(current());number.blur();}else if(e.key==='Enter'){e.preventDefault();number.blur();}};
  fields.push(()=>{if(!command){const value=current();if(document.activeElement!==input){input.min=Math.min(min,value);input.max=Math.max(max,value);input.value=value;input.setAttribute('aria-valuetext',format(value));}if(document.activeElement!==number)number.value=display(value);}});mutators.push(input,number);
  cleanups.push(()=>{command=null;numberDraft=null;});return wrap;
 }
 function color(parent,label,key){
  const wrap=document.createElement('div');wrap.className='light-color';wrap.innerHTML=`<label>${label}<input type="color" aria-label="${label}"></label><div class="row"><button data-color="#ffd3a3">暖光</button><button data-color="#ffffff">白光</button><button data-color="#d6e6ff">冷光</button></div>`;parent.append(wrap);
  bind(wrap.querySelector('input'),()=>l()[key],v=>patch({lighting:{...client.read().lighting,[key]:v}}));
  wrap.querySelectorAll('button').forEach(b=>{b.onclick=()=>act(()=>patch({lighting:{...client.read().lighting,[key]:b.dataset.color}}));mutators.push(b);});
 }
 bind(q('[aria-label="受光显示"]'),()=>l().materialMode,v=>patch({lighting:{...client.read().lighting,materialMode:v}}));
 for(const [label,key]of [['主光开关','keyEnabled'],['补光开关','fillEnabled']])bind(q(`[aria-label="${label}"]`),()=>l()[key],v=>patch({lighting:{...client.read().lighting,[key]:v}}),{checkbox:true});
 bind(q('[aria-label="照射目标"]'),()=>l().keyTargetMode,v=>{const p=client.read();return patch({lighting:{...p.lighting,keyTargetMode:v,...(v==='point'?{keyTarget:lightTarget(p,profile)}:{})}});});
 for(const [label,key]of [['灯具形状','emitterShape'],['光斑形状','beamShape']])bind(q(`[aria-label="${label}"]`),()=>l()[key],v=>patch({lighting:{...client.read().lighting,[key]:v}}));
 const metres=v=>v.toFixed(2)+' m',emitterWidth=range(q('[data-fields="emitter"]'),'发光面宽度 / 直径','emitterWidth',.05,2,.05,{format:metres}),emitterHeight=range(q('[data-fields="emitter"]'),'发光面高度','emitterHeight',.05,2,.05,{format:metres});
 range(q('[data-fields="beam"]'),'光斑宽度 / 直径','beamWidth',.05,4,.05,{format:metres});
 const beamHeight=range(q('[data-fields="beam"]'),'光斑高度','beamHeight',.05,4,.05,{format:metres});
 const beamRotation=range(q('[data-fields="beam"]'),'光斑旋转','beamRotation',-180,180,1,{format:v=>v+'°'});
 range(q('[data-fields="beam"]'),'光斑边缘柔和度','beamEdge',0,1,.05,{format:v=>Math.round(v*100)+'%'});
 fields.push(()=>{const light=l();emitterWidth.hidden=light.emitterShape==='point';emitterHeight.hidden=light.emitterShape!=='rectangle';q('[data-fields="beam"]').hidden=q('[data-beam-note]').hidden=light.beamShape==='none';beamHeight.hidden=light.beamShape!=='rectangle';beamRotation.hidden=light.beamShape==='circle';});
 for(const which of ['lamp','target'])q(`[data-light="${which}"]`).onclick=()=>{stage.setOutputView(false);lightGizmo.select(which);};
 cleanups.push(lightGizmo.subscribe(which=>{for(const b of root.querySelectorAll('[data-light]'))b.setAttribute('aria-pressed',b.dataset.light===which);}));
 q('[data-action="fit"]').onclick=()=>stage.fitLighting();
 range(q('[data-fields="key"]'),'主光强度','keyIntensity',0,6,.05,{format:v=>v.toFixed(2)});
 color(q('[data-fields="key"]'),'主光颜色','keyColor');
 range(q('[data-fields="key"]'),'阴影柔和度','shadowSoftness',0,1,.05,{format:v=>Math.round(v*100)+'%'});
 range(q('[data-fields="fill"]'),'补光强度','fillIntensity',0,4,.05,{format:v=>v.toFixed(2)});
 color(q('[data-fields="fill"]'),'补光颜色','fillColor');
 for(const which of ['lamp','target']){
  const parent=q(`[data-position="${which}"]`),label=which==='lamp'?'主灯':'照射点',edits={},inputs=[];
  parent.innerHTML=`<p class="subtle">${label}位置</p><div class="position-fields"></div>`;
  const current=()=>which==='lamp'?l().keyPosition:lightTarget(client.read(),profile);
  for(let i=0;i<3;i++){const input=document.createElement('input');input.type='number';input.step='.05';input.min='-1000';input.max='1000';input.ariaLabel=label+' '+['X','Y','Z'][i];input.oninput=()=>{edits[i]=input.value===''?NaN:Number(input.value);};inputs.push(input);mutators.push(input);parent.querySelector('div').append(input);}
  fields.push(()=>{const p=current();inputs.forEach((input,i)=>{if(!(i in edits)&&document.activeElement!==input)input.value=p[i].toFixed(3);});});
  const apply=document.createElement('button');apply.textContent='应用'+label+'位置';parent.append(apply);mutators.push(apply);
  apply.onclick=()=>act(async()=>{try{const p=client.read(),point=current().map((n,i)=>i in edits?edits[i]:n);if(point.some(n=>!Number.isFinite(n)))throw Error('请填入完整的位置数值');return await patch({lighting:{...p.lighting,...(which==='lamp'?{keyPosition:point}:{keyTargetMode:'point',keyTarget:point})}});}finally{Object.keys(edits).forEach(k=>delete edits[k]);}});
 }
 for(const preset of lightPresets){const b=document.createElement('button');b.textContent=preset.name;b.title=preset.description;b.onclick=()=>act(()=>{const p=client.read();return client.send(buildLightingCommand(p,presetLighting(preset.id,p,profile)));});q('.light-presets').append(b);mutators.push(b);}
 const name=q('[aria-label="布光收藏名称"]'),collection=q('[aria-label="已收藏布光"]'),status=q('[data-light-status]');
 async function refreshCollection(selected=collection.value){
  const rows=await client.api('/api/lights');if(disposed)return;
  collection.replaceChildren(new Option(rows.length?'选择已收藏的布光':'暂无收藏',''));
  for(const item of rows){const option=new Option(item.name+(item.unavailable?' · 暂不可用':''),item.id);option.disabled=!!item.unavailable;collection.append(option);}collection.value=selected;sync();
 }
 const saveLight=button('[data-action="save-light"]',async()=>{const p=client.read(),item=await client.api('/api/lights/save',{expectedRevision:p.revision,name:name.value.trim()});await refreshCollection(item.id);status.textContent='已收藏：'+item.name;name.value='';});
 const applyLight=button('[data-action="apply-light"]',async()=>{const p=client.read(),item=await client.api('/api/lights/open',{id:collection.value});return client.send(buildLightingCommand(p,item.lighting));});
 name.oninput=()=>sync();collection.onchange=()=>sync();
 cleanups.push(stage.onViewChange(()=>sync()));
 refreshCollection().catch(e=>{if(!disposed)status.textContent=e.message;});sync();
 return{sync,dispose(){disposed=true;cleanups.forEach(fn=>fn());if(client.exists?.()!==false)stage.render(client.read());root.remove();}};
}
