import {eyeClosure,eyeClosurePatch} from '../face/eye-closure.js';

export function mountEyePanel({host,client,profile,patch,run}){
 const names=profile.capabilities.expressions,separate=names.includes('blinkLeft')&&names.includes('blinkRight');
 if(!names.includes('blink')&&!separate)return()=>{};
 const section=document.createElement('section');section.className='eye-panel';
 section.innerHTML='<h3>眨眼与闭眼</h3><div class="eye-presets"></div><p class="subtle">固定在你需要的程度，适合挡光、休息或眨眼的一瞬。</p>';
 host.append(section);
 const fields=[],buttons=[],read=()=>eyeClosure(client.read().snapshot.expressions);
 const apply=change=>patch({expressions:eyeClosurePatch(client.read().snapshot.expressions,profile.capabilities,change)},'slider');
 let pending=false;
 async function change(value){if(pending)return;pending=true;sync(true);try{return await run(()=>apply(value));}finally{pending=false;sync(true);}}
 for(const [label,value]of [['睁眼',0],['眯眼',.5],['闭眼',1]]){
  const b=document.createElement('button');b.textContent=label;b.onclick=()=>change({left:value,right:value});
  section.querySelector('.eye-presets').append(b);buttons.push({button:b,value});
 }
 function slider(parent,label,side){
  const wrap=document.createElement('label');wrap.className='slider';
  wrap.innerHTML=`<span>${label}<output></output></span><input type="range" min="0" max="1" step=".01" aria-label="${label}">`;
  const input=wrap.querySelector('input'),output=wrap.querySelector('output');
  input.oninput=()=>{output.value=Math.round(Number(input.value)*100)+'%';};
  input.onchange=()=>change(side?{[side]:Number(input.value)}:{left:Number(input.value),right:Number(input.value)});
  parent.append(wrap);fields.push({input,output,side});
 }
 slider(section,'双眼闭合程度');
 if(separate){
  const details=document.createElement('details');
  details.innerHTML='<summary>左右眼分别调整</summary><p class="subtle">左右以角色自身为准。0% 睁开，100% 闭合。</p>';
  slider(details,'左眼闭合程度','left');slider(details,'右眼闭合程度','right');section.append(details);
 }
 function sync(force=false){
  const eyes=read(),disabled=pending||!client.isOwner()||(client.canPose&&!client.canPose());
  for(const {button,value}of buttons){button.disabled=disabled;button.setAttribute('aria-pressed',String(Math.abs(eyes.left-value)<.005&&Math.abs(eyes.right-value)<.005));}
  for(const {input,output,side}of fields){
   input.disabled=disabled;
   if(force||document.activeElement!==input){
    const value=side?eyes[side]:(eyes.left+eyes.right)/2;input.value=value;
    output.value=!side&&Math.abs(eyes.left-eyes.right)>.005?'左右不同':Math.round(value*100)+'%';
   }
  }
 }
 sync();return sync;
}
