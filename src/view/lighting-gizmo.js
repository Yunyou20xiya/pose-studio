import {Raycaster,Vector2} from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {makeCommand} from '../pose/state.js';

const lightScope={bones:[],expressions:[],root:false,gaze:false,stage:false,camera:false,lighting:true};
export function createLightingDragSession({client,stage,report}){
 let session=null;
 const stale=s=>!client.isOwner()||client.read().revision!==s.project.revision||client.read().projectId!==s.project.projectId;
 const conflict=()=>({status:'conflict',issues:[{severity:'warning',message:'现场已更新，这次拖动未应用，请重新调整。',bones:[]}]});
 function cancel(){session=null;if(client.exists?.()!==false)stage.render(client.read());}
 return{
  active:()=>!!session,
  begin(which){if(!client.isOwner())return;session={which,project:client.read(),command:null,result:null};},
  move(position){
   const s=session;if(!s)return;if(stale(s)){cancel();report(conflict());return;}
   const lighting={...s.project.lighting,...(s.which==='lamp'?{keyPosition:[...position]}:{keyTargetMode:'point',keyTarget:[...position]})};
   s.command=makeCommand(s.project,[{kind:'patch',value:{lighting}}],lightScope,'drag',[]);
   s.result=client.preview(s.command);stage.render(s.result.status==='applied'?s.result.project:client.read());
   if(s.result.status!=='applied')report(s.result);
  },
  async end(){
   const s=session;session=null;if(!s)return;
   try{if(stale(s))return conflict();if(!s.command)return;if(s.result.status!=='applied')return s.result;return await client.send(s.command);}
   finally{stage.render(client.read());}
  },cancel,
 };
}

export function mountLightingGizmo({stage,client,run,report}){
 const rig=stage.lighting,canvas=stage.renderer.domElement,transform=new TransformControls(stage.camera,canvas);
 transform.setMode('translate');transform.setSpace('world');transform.setSize(.7);const helper=transform.getHelper();stage.helpers.add(helper);
 const drag=createLightingDragSession({client,stage,report}),ray=new Raycaster(),pointer=new Vector2(),listeners=new Set();
 let active=false,selected='lamp',pending=false,editable=client.isOwner(),disposed=false,dragging=false;
 const allowed=()=>active&&editable&&client.isOwner()&&!stage.isOutputView()&&!pending;
 function sync(){
  rig.markers.visible=active&&!stage.isOutputView();
  if(!allowed()){
   if(drag.active())drag.cancel();dragging=false;transform.dragging=false;transform.detach();transform.enabled=false;
  }else{transform.enabled=true;transform.attach(selected==='lamp'?rig.lampHandle:rig.aimHandle);}
  for(const fn of listeners)fn(selected);
 }
 function select(which){if(dragging)return;selected=which;sync();}
 transform.addEventListener('dragging-changed',e=>{
  dragging=e.value;stage.controls.enabled=!e.value&&!stage.isOutputView();
  if(e.value){if(allowed())drag.begin(selected);return;}
  if(!drag.active())return;
  pending=true;const completion=run(()=>drag.end());sync();completion.finally(()=>{pending=false;if(!disposed)sync();});
 });
 transform.addEventListener('objectChange',()=>{if(dragging&&drag.active())drag.move(transform.object.position.toArray());});
 // Clicking either marker selects it. Dragging the arrows remains TransformControls' responsibility.
 function pick(event){
  if(!allowed()||dragging||transform.axis||event.button!==0)return;
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(pointer,stage.camera);const hit=ray.intersectObjects(rig.pickables,false)[0];if(hit)select(hit.object.parent===rig.lampHandle?'lamp':'target');
 }
 canvas.addEventListener('pointerdown',pick);
 const unsub=client.subscribe(()=>{if(drag.active()){drag.cancel();dragging=false;transform.dragging=false;report({status:'conflict',issues:[{severity:'warning',message:'现场已更新，请重新拖动灯光。',bones:[]}]});}sync();});
 const unview=stage.onViewChange(()=>{if(disposed||client.exists?.()===false)return;if(!allowed()&&drag.active())drag.cancel();sync();});
 return{
  select,selected:()=>selected,setActive(value){active=value;sync();},setEditable(value){editable=value;sync();},
  subscribe(fn){listeners.add(fn);fn(selected);return()=>listeners.delete(fn);},
  dispose(){disposed=true;if(drag.active())drag.cancel();unsub();unview();listeners.clear();canvas.removeEventListener('pointerdown',pick);transform.dispose();stage.helpers.remove(helper);rig.markers.visible=false;},
 };
}
