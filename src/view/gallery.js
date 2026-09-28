import * as THREE from 'three';
import {loadAvatar} from '../avatar/adapter.js';import {createStage} from './stage.js';import {createEngine} from '../pose/engine.js';import {makeProject,makeCommand,fullScope} from '../pose/state.js';import {handGesture,gestures} from '../assets/gestures.js';import {forward,worldPoint} from '../pose/kinematics.js';
const toData=blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
export async function showGestureGallery({client,profile,model}){
 const dialog=document.createElement('dialog');dialog.className='gallery';dialog.innerHTML='<div class="gallery-head"><h2>左右手势实测预览</h2><button>关闭</button></div><p>采用当前角色真实手指；数字 7 为三指捏合，数字 10 为握拳。点击卡片查看大图。</p><div class="gallery-status">正在准备独立预览角色…</div><div class="gallery-grid"></div>';document.body.append(dialog);dialog.showModal();let cancelled=false;dialog.querySelector('button').onclick=()=>{cancelled=true;dialog.close();};
 const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:480px;height:480px;';document.body.append(canvas);let avatar,stage;
 try{
  avatar=await loadAvatar(await(await fetch('/local-assets/'+model.file)).arrayBuffer());stage=createStage(canvas,{profile});stage.addAvatar(avatar);const initial=makeProject(model,profile),engine=createEngine(initial,profile);let maxPositionError=0;
  for(const side of ['right','left'])for(const gesture of gestures){
   if(cancelled)return;const p=engine.read(),value=handGesture(gesture.id,side,1,.45,profile);const result=engine.apply(makeCommand(p,[{kind:'patch',value}],{...fullScope(p),bones:Object.keys(value.rotations)},'preset'));if(result.status!=='applied')throw Error(result.issues.map(i=>i.message).join('；'));
   const current=engine.read();avatar.render(current);stage.render(current);const w=forward(current,profile),bone=side+'Hand',sign=side==='right'?1:-1;
   for(const[n,actual]of Object.entries(avatar.worldBones()))if(!n.endsWith('Eye'))maxPositionError=Math.max(maxPositionError,new THREE.Vector3().fromArray(w[n].position).distanceTo(new THREE.Vector3().fromArray(actual.position)));
   const position=worldPoint(current,profile,bone,[sign*.05,-.29,.015],w),target=worldPoint(current,profile,bone,[sign*.045,-.015,0],w),up=new THREE.Vector3(sign,0,0).applyQuaternion(new THREE.Quaternion().fromArray(w[bone].rotation)).toArray();
   const blob=await stage.capture({position,target,up,fov:33,width:360,height:360}),image=await toData(blob),name=side+'-'+gesture.id;const saved=await client.api('/api/thumbnails',{name,image,collection:'v2'});
   const card=document.createElement('a');card.href=image;card.target='_blank';card.innerHTML=`<img src="${image}" alt="${side==='right'?'右手':'左手'}${gesture.name}"><span>${side==='right'?'右':'左'} · ${gesture.name}</span>`;dialog.querySelector('.gallery-grid').append(card);dialog.querySelector('.gallery-status').textContent=`已生成 ${dialog.querySelectorAll('.gallery-grid a').length} / 30 张真实手势预览`;
  }
  dialog.querySelector('.gallery-status').textContent+=' · 骨骼位置校验误差 '+(maxPositionError*1000).toFixed(5)+' 毫米';
  await client.api('/api/diagnostics',{name:'rig-render-consistency',value:{maxPositionError,model:model.id,count:30}});
 }catch(e){dialog.querySelector('.gallery-status').textContent=e.message;}finally{stage?.dispose();avatar?.dispose();canvas.remove();}
}
