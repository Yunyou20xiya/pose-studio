import {PerspectiveCamera,Vector3,Color} from 'three';
import {captureCamera} from '../camera/bookmarks.js';
import {sceneActors,actorProject} from '../scene/state.js';

export const normalReferenceLighting={space:'camera',color:'#ffffff',ambient:.85,key:{intensity:1.65,direction:[-.35,.55,1]},fill:{intensity:.55,direction:[.6,.1,1]},castShadows:false};

export function referenceCamera(value){
 const camera=captureCamera(value),scale=Math.min(1,1600/Math.max(camera.width,camera.height));
 return{...camera,width:Math.round(camera.width*scale),height:Math.round(camera.height*scale)};
}
export function referenceProjection(frame){
 const camera=new PerspectiveCamera(frame.fov,frame.width/frame.height,.01,100);camera.position.fromArray(frame.position);camera.up.fromArray(frame.up||[0,1,0]);camera.lookAt(new Vector3(...frame.target));camera.updateMatrixWorld(true);return camera;
}
export function projectedCrop(points,frame,{padding=18}={}){
 const camera=referenceProjection(frame),pixels=points.map(p=>new Vector3(...p)).filter(p=>p.clone().applyMatrix4(camera.matrixWorldInverse).z<-.01).map(p=>p.project(camera)).filter(p=>p.z>=-1&&p.z<=1).map(p=>[(p.x+1)*frame.width/2,(1-p.y)*frame.height/2]);
 if(!pixels.length)return null;
 const left=Math.min(...pixels.map(p=>p[0]))-padding,right=Math.max(...pixels.map(p=>p[0]))+padding,top=Math.min(...pixels.map(p=>p[1]))-padding,bottom=Math.max(...pixels.map(p=>p[1]))+padding;
 if(right<=0||bottom<=0||left>=frame.width||top>=frame.height)return null;
 const x=Math.max(0,Math.floor(left)),y=Math.max(0,Math.floor(top)),width=Math.min(frame.width,Math.ceil(right))-x,height=Math.min(frame.height,Math.ceil(bottom))-y;
 return width>=2&&height>=2?{x,y,width,height}:null;
}
export function segmentLegend(project){
 const actors=sceneActors(project).filter(a=>a.visible),chairs=actors.filter(a=>actorProject(project,a.id).snapshot.contacts.some(c=>c.objectId==='chair')).map(a=>({id:a.id+':support-chair',name:a.name+' · 支撑椅',kind:'object',actorId:a.id,source:'pose-support-chair'}));
 return[...actors.map(a=>({id:a.id,name:a.name,kind:'actor'})),...(project.scene?.objects||[]).filter(o=>o.visible).map(o=>({id:o.id,name:o.name,kind:'object'})),...chairs].map((entry,i)=>({...entry,color:'#'+new Color().setHSL((.055+i*.61803398875)%1,.68,.53).getHexString()}));
}
export const partLabel=part=>({head:'头部',leftHand:'左手',rightHand:'右手'})[part]||part;
