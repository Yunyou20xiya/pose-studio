import {sceneActors} from '../scene/state.js';
import {gazeTargets} from '../scene/gaze-targets.js';

export function mountGazePanel({host,project,subject,disabled,preferences,submit}){
 const section=document.createElement('section');section.className='furniture-panel gaze-panel';host.append(section);
 const heading=document.createElement('h3');heading.textContent='看向目标';section.append(heading);
 const active=gazeTargets(project).find(r=>r.subjectId===subject.id),actors=sceneActors(project),all=[...actors,...(project.scene?.objects||[])];
 const label=document.createElement('label');label.textContent='看向谁或什么';const select=document.createElement('select');select.ariaLabel='看向谁或什么';label.append(select);section.append(label);
 const targets=all.filter(o=>o.id!==subject.id&&(o.visible||o.id===active?.targetId));
 for(const target of targets)select.append(new Option(target.name+(actors.includes(target)?' · 人物':' · 物品')+(target.visible?'':' · 已隐藏'),target.id));
 if(!targets.length)select.append(new Option('请先添加另一个角色或物品',''));
 const chosen=preferences.targets[subject.id+':gaze']||active?.targetId;if(targets.some(o=>o.id===chosen))select.value=chosen;
 select.onchange=()=>{preferences.targets[subject.id+':gaze']=select.value;};select.disabled=disabled||!targets.length;
 const makeButton=(text,fn,parent=section)=>{const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=fn;parent.append(b);return b;};
 const keepLabel=document.createElement('label');keepLabel.className='keep-contact';const keep=document.createElement('input');keep.type='checkbox';keep.ariaLabel='保持注视';keep.checked=preferences.gazeKeep??true;keep.disabled=disabled;keep.onchange=()=>{preferences.gazeKeep=keep.checked;};keepLabel.append(keep,document.createTextNode('保持注视 · 随目标移动'));
 const look=makeButton('看向这个目标',()=>submit({action:'look-at',targetId:select.value,follow:1,keep:keep.checked}));look.className='wide';look.disabled||=!targets.length;section.append(keepLabel);
 const note=document.createElement('p');note.className='subtle';note.textContent='人物默认瞄准脸部附近，物品默认瞄准中心。头颈有转动限制，目标在身后时请先转身。';section.append(note);
 if(!active)return;
 const status=document.createElement('p');status.className='binding-title';status.textContent='正在注视 · '+all.find(o=>o.id===active.targetId).name;section.append(status);
 makeButton('解除注视',()=>submit({action:'clear-gaze'}));
 const details=document.createElement('details');details.innerHTML='<summary>微调注视位置</summary>';section.append(details);
 const inputs=[];const fields=document.createElement('div');fields.className='placement-fields';details.append(fields);
 for(const [i,name]of ['视线左右偏移（厘米）','视线高低偏移（厘米）','视线前后偏移（厘米）'].entries()){
  const l=document.createElement('label');l.textContent=name;const n=document.createElement('input');n.type='number';n.min=-200;n.max=200;n.step='any';n.value=Number((active.offset[i]*100).toFixed(2));n.ariaLabel=name;n.disabled=disabled;l.append(n);fields.append(l);inputs.push(n);
 }
 const followLabel=document.createElement('label');followLabel.textContent='头颈跟随（%）';const follow=document.createElement('input');follow.type='number';follow.min=0;follow.max=100;follow.step='any';follow.ariaLabel='目标头颈跟随（%）';follow.disabled=disabled;follow.value=Math.round((subject.pose?.snapshot||project.snapshot).gaze.follow*100);followLabel.append(follow);fields.append(followLabel);
 const hint=document.createElement('p');hint.className='subtle';hint.textContent='偏移随目标转向与尺寸变化。跟随 0% 保留当前头颈姿势，只调整眼睛；目标再次移动时，会按跟随程度重新瞄准。';details.append(hint);
 makeButton('更新注视位置',()=>{if([...inputs,follow].some(n=>!n.value.trim()||!n.reportValidity()))return;return submit({action:'adjust-gaze',offset:inputs.map(n=>+n.value/100),follow:+follow.value/100});},details);
}
