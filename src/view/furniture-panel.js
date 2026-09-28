import {surfaceSpec} from '../scene/surfaces.js';
import {relations} from '../scene/relations.js';
import {sceneActors} from '../scene/state.js';

export function mountFurniturePanel({host,project,subject,isActor,disabled,preferences,submit}){
 const section=document.createElement('section');section.className='furniture-panel';host.append(section);
 const heading=document.createElement('h3');heading.textContent=isActor?'与场景接触':'放到物品表面';section.append(heading);
 const surfaces=(project.scene?.objects||[]).filter(o=>o.id!==subject.id&&o.visible&&surfaceSpec(o.type));
 const active=relations(project).filter(r=>r.subjectId===subject.id);
 const names=new Map([...sceneActors(project),...(project.scene?.objects||[])].map(o=>[o.id,o.name]));
 const paragraph=text=>{const p=document.createElement('p');p.className='subtle';p.textContent=text;section.append(p);return p;};
 const button=(text,fn,parent=section)=>{const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=fn;parent.append(b);return b;};
 function targetSelect(label,kind,choices){
  const wrap=document.createElement('label');wrap.textContent=label;const select=document.createElement('select');select.ariaLabel=label;select.disabled=disabled||!choices.length;
  if(!choices.length)select.append(new Option('请先添加合适的家具',''));
  for(const item of choices)select.append(new Option(item.name,item.id));
  const key=subject.id+':'+kind,wanted=preferences.targets[key]||active.find(r=>r.kind===kind)?.targetId;
  if(choices.some(o=>o.id===wanted))select.value=wanted;
  select.onchange=()=>{preferences.targets[key]=select.value;};wrap.append(select);section.append(wrap);return select;
 }
 const keepLabel=document.createElement('label');keepLabel.className='keep-contact';const keep=document.createElement('input');keep.type='checkbox';keep.checked=preferences.keep;keep.disabled=disabled;keep.ariaLabel='保持接触';keep.onchange=()=>{preferences.keep=keep.checked;};keepLabel.append(keep,document.createTextNode('保持接触 · 家具移动时跟随'));
 const attach=(relation,targetId,hand)=>submit({action:'attach',relation,targetId,keep:keep.checked,...(hand?{hand}:{})});
 if(isActor){
  const seats=targetSelect('坐到哪把座椅','seat',surfaces.filter(o=>surfaceSpec(o.type).seat));
  const sit=button('坐到座椅上',()=>attach('seat',seats.value));sit.className='wide';sit.disabled||=!seats.value;
  const handTarget=targetSelect('手贴在哪个表面','hand',surfaces);
  const row=document.createElement('div');row.className='row';section.append(row);
  for(const[hand,label]of [['leftHand','左手贴上去'],['rightHand','右手贴上去']])button(label,()=>attach('hand',handTarget.value,hand),row).disabled||=!handTarget.value;
  section.append(keepLabel);paragraph('坐下会替换身体基础姿势，保留手型和表情。够不到或与锁定冲突时，会保留原来的现场。');
 }else{
  const target=targetSelect('放到哪个表面','surface',surfaces.filter(o=>!surfaceSpec(o.type).handOnly));
  const place=button('放到表面上',()=>attach('surface',target.value));place.className='wide';place.disabled||=!target.value;
  section.append(keepLabel);paragraph('底部自动对齐表面。保持接触时，左右拖动可调整落点，上下位置会贴住表面。');
 }
 for(const r of active){
  const row=document.createElement('div');row.className='contact-binding';const label=r.kind==='seat'?'坐姿':r.kind==='surface'?'物品':r.hand==='leftHand'?'左手':'右手';
  const text=document.createElement('p');text.className='binding-title';text.textContent=label+'接触 · '+names.get(r.targetId);row.append(text);
  button('解除'+label+'接触',()=>submit({action:'detach',relation:r.kind,...(r.hand?{hand:r.hand}:{})}),row);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='微调'+label+'接触位置';details.append(summary);const fields=document.createElement('div');fields.className='placement-fields';details.append(fields);const inputs=[];
  const vertical=surfaceSpec(project.scene.objects.find(o=>o.id===r.targetId)?.type)?.vertical;
  for(let i=0;i<2;i++){const axis=i?(vertical?'上下':'前后'):'左右',l=document.createElement('label');l.textContent=axis+'落点（%）';const n=document.createElement('input');n.type='number';n.min=-50;n.max=50;n.step='any';n.value=Number((r.anchor[i]*100).toFixed(2));n.ariaLabel=label+axis+'落点';n.disabled=disabled;l.append(n);fields.append(l);inputs.push(n);}
  const note=document.createElement('p');note.className='subtle';note.textContent='0 是表面中心，方向随家具转向。';details.append(note);
  button('更新'+label+'落点',()=>{if(inputs.some(n=>n.value.trim()===''||!n.reportValidity()))return;return submit({action:'adjust-contact',relation:r.kind,...(r.hand?{hand:r.hand}:{}),anchor:inputs.map(n=>+n.value/100)});},details);row.append(details);section.append(row);
 }
 const dependents=relations(project).filter(r=>r.targetId===subject.id);
 if(dependents.length)paragraph('正在承托：'+dependents.map(r=>names.get(r.subjectId)+(r.kind==='hand'?(r.hand==='leftHand'?'的左手':'的右手'):'')).join('、')+'。移动时会一起检查接触。');
}
