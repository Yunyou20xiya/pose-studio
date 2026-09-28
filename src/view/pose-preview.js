import {Vector3,Quaternion}from'three';
import {loadAvatar}from'../avatar/adapter.js';import{createStage}from'./stage.js';import{createEngine}from'../pose/engine.js';import{makeProject,makeCommand,fullScope,clone}from'../pose/state.js';import{sampleAsset}from'../assets/sampling.js';import{handGesture}from'../assets/gestures.js';import{forward,worldPoint}from'../pose/kinematics.js';
export const blobData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
export function createPosePreviewer({model,profile,catalog}){
 let avatar,stage,disposed=false,queue=Promise.resolve();const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-3000px;top:0;width:400px;height:480px';document.body.append(canvas);
 const ready=(async()=>{avatar=await loadAvatar(await(await fetch('/local-assets/'+model.file)).arrayBuffer());stage=createStage(canvas,{profile});stage.addAvatar(avatar);})();
 const schedule=fn=>{const result=queue.catch(()=>{}).then(async()=>{await ready;if(disposed)throw Error('预览已关闭');return fn();});queue=result;return result;};
 async function render(project,part='full',view='front'){
  avatar.render(project);stage.render(project);const w=forward(project,profile),center=new Vector3().fromArray(w.hips.position);let spec={position:[center.x,center.y+.60,3.55],target:[center.x,center.y+.07,.05],fov:34,width:320,height:420};
  if(part==='head'){const h=w.head.position;spec={position:[h[0],h[1]+.05,h[2]+.72],target:[h[0],h[1]+.02,h[2]],fov:33,width:320,height:320};}
  if(part.endsWith('Hand')){const side=part.startsWith('right')?'right':'left',bone=side+'Hand',sign=side==='right'?1:-1;spec={position:worldPoint(project,profile,bone,[sign*.05,-.29,.015],w),target:worldPoint(project,profile,bone,[sign*.045,-.015,0],w),up:new Vector3(sign,0,0).applyQuaternion(new Quaternion().fromArray(w[bone].rotation)).toArray(),fov:33,width:320,height:320};}
  if(view!=='front'){spec={position:view==='side'?[3.5,center.y+.55,.15]:[0,center.y+.55,-3.5],target:[center.x,center.y+.08,0],fov:34,width:320,height:420};}
  return blobData(await stage.capture(spec));
 }
 return{capture(project,part='full',view='front'){let copy=clone(project);if(part.endsWith('Hand')){copy=makeProject(model,profile);const side=part.startsWith('right')?'right':'left';for(const n of Object.keys(copy.snapshot.rotations))if(n.startsWith(side)&&/Thumb|Index|Middle|Ring|Little/.test(n))copy.snapshot.rotations[n]=clone(project.snapshot.rotations[n]);}return schedule(()=>render(copy,part,view));},asset(asset,view='front'){
  return schedule(async()=>{let p=makeProject(model,profile);const e=createEngine(p,profile);const apply=value=>{const r=e.apply(makeCommand(e.read(),[{kind:'patch',value}],fullScope(e.read()),'preset'));if(r.status!=='applied')throw Error(r.issues.map(i=>i.message).join('；'));};
   const standing=catalog.find(a=>a.id==='stand');if(standing)apply(await sampleAsset(standing,0,avatar));for(const side of ['right','left'])apply(handGesture('relaxed',side,1,.2,profile));
   avatar.render(e.read());apply(await sampleAsset(asset,asset.frame??1.5,avatar));p=e.read();return{image:await render(p,asset.part==='head'?'head':'full',view),project:p};
  });},dispose(){disposed=true;queue.finally(()=>ready.then(()=>{stage?.dispose();avatar?.dispose();canvas.remove();})).catch(()=>{});}};
}
