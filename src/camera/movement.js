import {Vector3} from 'three';
import {captureCamera} from './bookmarks.js';

export function moveCamera(camera,which,position,{keepTarget=true}={}){
 const c=captureCamera(camera);
 if(!['camera','target'].includes(which))throw Error('请选择相机或瞄准点');
 if(!Array.isArray(position)||position.length!==3||position.some(v=>!Number.isFinite(v)))throw Error('请填入完整的位置数值');
 if(which==='target')c.target=[...position];
 else{if(!keepTarget)c.target=c.target.map((v,i)=>v+position[i]-c.position[i]);c.position=[...position];}
 return captureCamera(c);
}
export function stepCamera(camera,direction,distance){
 const c=captureCamera(camera);
 if(!Number.isFinite(distance)||distance<=0||distance>10)throw Error('每次移动距离需大于 0 且不超过 10 米');
 const forward=new Vector3(...c.target).sub(new Vector3(...c.position)).normalize(),right=forward.clone().cross(new Vector3(...c.up)).normalize(),up=right.clone().cross(forward).normalize();
 const axes={forward,back:forward.clone().negate(),right,left:right.clone().negate(),up,down:up.clone().negate()};
 if(!axes[direction])throw Error('移动方向无效');
 return moveCamera(c,'camera',new Vector3(...c.position).addScaledVector(axes[direction],distance).toArray(),{keepTarget:false});
}
