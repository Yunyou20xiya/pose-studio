import {Vector3,Box3} from 'three';
// SkinnedMesh caches its default bounds; precise bounds follow the current pose.
export function avatarBounds(root){root.updateMatrixWorld(true);return new Box3().setFromObject(root,true);}
export function outputFrame(width,height,camera){
 const scale=Math.min(width/camera.width,height/camera.height),w=camera.width*scale,h=camera.height*scale;
 return{x:(width-w)/2,y:(height-h)/2,width:w,height:h};
}
export function fitView(bounds,aspect,direction=new Vector3(0,.1,1),fov=35){
 const center=bounds.getCenter(new Vector3()),tanY=Math.tan(fov*Math.PI/360),tanX=tanY*Math.max(.01,aspect),dir=direction.clone().normalize();if(dir.lengthSq()===0)dir.set(0,0,1);
 const right=new Vector3().crossVectors(new Vector3(0,1,0),dir).normalize();if(right.lengthSq()===0)right.set(1,0,0);const up=new Vector3().crossVectors(dir,right).normalize();
 let distance=.2;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const corner=new Vector3(x,y,z).sub(center),depth=corner.dot(dir);
  distance=Math.max(distance,depth+.02,depth+1.12*Math.abs(corner.dot(right))/tanX,depth+1.12*Math.abs(corner.dot(up))/tanY);
 }
 return{position:center.clone().addScaledVector(dir,distance).toArray(),target:center.toArray(),fov};
}
