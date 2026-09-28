import {Box3,BoxGeometry,CameraHelper,CylinderGeometry,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster,SphereGeometry,Vector2,Vector3} from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {makeCommand} from '../pose/state.js';
import {moveCamera} from '../camera/movement.js';
import {fitView} from './framing.js';

export const cameraScope={bones:[],expressions:[],root:false,gaze:false,stage:false,camera:true,lighting:false};
export function createCameraDragSession({client,stage,report}){
 let session=null;
 const stale=s=>!client.isOwner()||client.read().revision!==s.project.revision||client.read().projectId!==s.project.projectId;
 const conflict=()=>({status:'conflict',issues:[{severity:'warning',message:'现场已更新，这次镜头拖动未应用，请重新调整。',bones:[]}]});
 function cancel(){session=null;if(client.exists?.()!==false)stage.render(client.read());}
 return{
  active:()=>!!session,
  begin(which,options={}){if(client.isOwner())session={which,options:{...options},project:client.read(),command:null,result:null};},
  move(position){
   const s=session;if(!s)return;if(stale(s)){cancel();report(conflict());return;}
   try{
    const camera=moveCamera(s.project.camera,s.which,position,s.options);
    s.command=makeCommand(s.project,[{kind:'patch',value:{camera}}],cameraScope,'drag',[]);s.result=client.preview(s.command);
   }catch(e){s.command=null;s.result={status:'rejected',issues:[{severity:'error',message:e.message,bones:[]}]};}
   stage.render(s.result.status==='applied'?s.result.project:client.read());if(s.result.status!=='applied')report(s.result);
  },
  async end(){
   const s=session;session=null;if(!s)return;
   try{if(stale(s))return conflict();if(s.result?.status!=='applied')return s.result;if(s.command)return await client.send(s.command);}
   finally{if(client.exists?.()!==false)stage.render(client.read());}
  },cancel,
 };
}

export function mountCameraGizmo({stage,client,run,report}){
 const canvas=stage.renderer.domElement,markers=new Group(),body=new Group(),aim=new Group();markers.add(body,aim);stage.helpers.add(markers);
 const material=new MeshBasicMaterial({color:0x367f9e}),targetMaterial=new MeshBasicMaterial({color:0x348969,depthTest:false});
 const box=new Mesh(new BoxGeometry(.17,.12,.14),material),lens=new Mesh(new CylinderGeometry(.043,.054,.07,16),material),target=new Mesh(new SphereGeometry(.038,16,12),targetMaterial);
 lens.rotation.x=Math.PI/2;lens.position.z=-.10;body.add(box,lens);aim.add(target);
 const view=new PerspectiveCamera(35,1,.025,3),frame=new CameraHelper(view);frame.material.transparent=true;frame.material.opacity=.45;markers.add(frame);
 const transform=new TransformControls(stage.camera,canvas);transform.setMode('translate');transform.setSpace('world');transform.setSize(.75);const helper=transform.getHelper();stage.helpers.add(helper);
 const drag=createCameraDragSession({client,stage,report}),listeners=new Set(),ray=new Raycaster(),pointer=new Vector2();
 let active=false,editable=client.isOwner(),selected='camera',keepTarget=true,pending=false,dragging=false,disposed=false;
 const allowed=()=>active&&editable&&client.isOwner()&&!stage.isOutputView()&&!pending;
 function sync(spec=client.read().camera){
  body.position.fromArray(spec.position);aim.position.fromArray(spec.target);view.position.copy(body.position);view.up.fromArray(spec.up||[0,1,0]);view.lookAt(aim.position);view.fov=spec.fov;view.aspect=spec.width/spec.height;view.far=Math.max(.05,body.position.distanceTo(aim.position));view.updateProjectionMatrix();view.updateMatrixWorld(true);body.quaternion.copy(view.quaternion);frame.update();
  markers.visible=active&&!stage.isOutputView();
  if(!allowed()){
   if(drag.active())drag.cancel();if(dragging)stage.controls.enabled=!stage.isOutputView();dragging=false;transform.dragging=false;transform.detach();transform.enabled=false;
  }else{transform.enabled=true;const object=selected==='camera'?body:aim;if(transform.object!==object)transform.attach(object);}
  for(const fn of listeners)fn(selected);
 }
 function select(which){if(dragging||pending)return;selected=which;sync();}
 transform.addEventListener('dragging-changed',e=>{
  dragging=e.value;stage.controls.enabled=!e.value&&!stage.isOutputView();
  if(e.value){if(allowed())drag.begin(selected,{keepTarget});return;}
  if(!drag.active())return;
  pending=true;const completion=run(()=>drag.end());sync();completion.finally(()=>{pending=false;if(!disposed)sync();});
 });
 transform.addEventListener('objectChange',()=>{if(dragging&&drag.active())drag.move(transform.object.position.toArray());});
 function pick(event){
  if(!allowed()||dragging||transform.axis||event.button!==0)return;
  const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,stage.camera);
  const hit=ray.intersectObjects([box,lens,target],false)[0];if(hit)select(hit.object===target?'target':'camera');
 }
 function cancel(event){if(!drag.active()||event.type==='keydown'&&event.key!=='Escape')return;drag.cancel();dragging=false;transform.dragging=false;stage.controls.enabled=!stage.isOutputView();sync();}
 canvas.addEventListener('pointerdown',pick);canvas.addEventListener('pointercancel',cancel);window.addEventListener('keydown',cancel);window.addEventListener('blur',cancel);
 const unsub=client.subscribe(()=>{if(drag.active()){drag.cancel();dragging=false;transform.dragging=false;stage.controls.enabled=!stage.isOutputView();report({status:'conflict',issues:[{severity:'warning',message:'现场已更新，请重新拖动镜头。',bones:[]}]});}sync();});
 const unview=stage.onViewChange(({camera})=>{if(!disposed&&client.exists?.()!==false)sync(camera||client.read().camera);});
 return{
  select,setActive(value){active=value;sync();},setEditable(value){editable=value;sync();},setKeepTarget(value){keepTarget=value;},
  fit(){const c=client.read().camera,bounds=new Box3().setFromPoints([new Vector3(...c.position),new Vector3(...c.target)]).expandByScalar(.6),size=stage.renderer.getSize(new Vector2()),spec=fitView(bounds,size.x/size.y,new Vector3(1,.6,1),35);stage.setView(spec.position,spec.target,spec.fov);},
  subscribe(fn){listeners.add(fn);fn(selected);return()=>listeners.delete(fn);},
  dispose(){disposed=true;active=false;if(drag.active())drag.cancel();if(dragging)stage.controls.enabled=!stage.isOutputView();unsub();unview();listeners.clear();canvas.removeEventListener('pointerdown',pick);canvas.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',cancel);window.removeEventListener('blur',cancel);transform.dispose();frame.dispose();for(const o of [box,lens,target])o.geometry.dispose();material.dispose();targetMaterial.dispose();stage.helpers.remove(markers,helper);},
 };
}
