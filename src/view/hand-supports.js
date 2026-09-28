import {isHandSupport,supportLabel,supportArm} from '../pose/hand-supports.js';
export function mountSupportPanel({host,hand,client,profile,run}){
 const section=document.createElement('section');section.className='hand-supports';
 const heading=document.createElement('h3');heading.textContent='接触与支撑';section.append(heading);
 const status=document.createElement('p');status.className='support-status';status.setAttribute('role','status');
 const active=document.createElement('div');active.className='support-active';
 if(hand){
  const choices=document.createElement('div');choices.className='support-choices';
  for(const [preset,label]of [['face','扶脸'],['thigh','放在大腿上'],['chair','扶椅面']]){
   const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',(hand==='leftHand'?'左手':'右手')+label);button.dataset.preset=preset;
   button.onclick=()=>change(hand,preset);choices.append(button);
  }
  const hint=document.createElement('p');hint.className='subtle';hint.textContent='先选坐姿，再放腿上或扶椅面。绿色小点表示接触位置；保持接触时会带动这只手臂。';section.append(choices,hint);
 }
 section.append(status,active);host.append(section);
 function change(bone,preset){return run(()=>{const scope={bones:supportArm(bone,profile),expressions:[],root:false,gaze:false,stage:false,camera:false,lighting:false};return client.submit([{kind:'hand-support',hand:bone,preset}],scope,'preset');});}
 function update(){
  const all=client.read().snapshot.contacts.filter(isHandSupport),selected=all.filter(c=>!hand||c.bone===hand);
  status.textContent=selected.length?'正在保持：'+selected.map(supportLabel).join('、')+'。要自由移动手，请先解除。':hand?'这只手目前可以自由调整。':'手部接触可在左手、右手或手臂面板设置。';
  for(const b of section.querySelectorAll('[data-preset]')){b.setAttribute('aria-pressed',String(selected.some(c=>c.preset===b.dataset.preset)));b.disabled=!client.isOwner();}
  active.replaceChildren();
  for(const c of selected){const b=document.createElement('button');b.className='release-support';b.textContent='解除'+(c.bone==='leftHand'?'左手':'右手')+'接触';b.disabled=!client.isOwner();b.onclick=()=>change(c.bone,null);active.append(b);}
 }
 update();return update;
}
