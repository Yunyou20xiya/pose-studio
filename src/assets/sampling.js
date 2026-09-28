import {AnimationMixer,LoopOnce} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMAnimationLoaderPlugin,createVRMAnimationClip} from '@pixiv/three-vrm-animation';
export async function sampleIsolated(adapter,prepare,seconds){
 const snapshot=adapter.readSnapshot();let sampler;
 try{sampler=await prepare();return await sampler.sample(seconds);}
 finally{try{sampler?.stop();}finally{adapter.preview(snapshot);}}
}
export async function sampleAsset(asset,seconds,adapter){
 if(typeof asset==='string')throw Error('请先从目录读取动作登记');
 if(asset.type==='pose'){const r=await fetch('/local-motions/'+asset.file);if(!r.ok)throw Error('姿势文件读取失败');return r.json();}
 const r=await fetch('/local-motions/'+asset.file);if(!r.ok)throw Error('动画文件读取失败');
 const loader=new GLTFLoader();loader.register(parser=>new VRMAnimationLoaderPlugin(parser));const gltf=await loader.parseAsync(await r.arrayBuffer(),'');const animation=gltf.userData.vrmAnimations?.[0];if(!animation)throw Error('文件缺少 VRM 动画');
 return sampleIsolated(adapter,async()=>{
  const clip=createVRMAnimationClip(animation,adapter.vrm),mixer=new AnimationMixer(adapter.vrm.scene),action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
  return{sample(t){if(!Number.isFinite(t)||t<0||t>clip.duration)throw Error(`取帧范围为 0—${clip.duration.toFixed(2)} 秒`);mixer.setTime(t);adapter.vrm.update(0);const current=adapter.readSnapshot();
   return{rotations:Object.fromEntries(Object.entries(current.rotations).filter(([n])=>!n.endsWith('Eye'))),layers:[{id:'frame-'+asset.id,sourceAsset:asset.id,frame:t,bones:Object.keys(current.rotations).filter(n=>!n.endsWith('Eye')),expressionNames:[],manual:false}]};},stop(){mixer.stopAllAction();mixer.uncacheRoot(adapter.vrm.scene);}};
 },seconds);
}
