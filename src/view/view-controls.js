export function mountViewControls({stage}){
 const workspace=document.querySelector('.workspace'),frame=document.querySelector('#output-frame'),caption=document.querySelector('#frame-caption');
 const free=document.querySelector('#free-view'),final=document.querySelector('#final-view');
 free.onclick=()=>stage.setOutputView(false);final.onclick=()=>stage.setOutputView(true);
 document.querySelector('#fit-avatar').onclick=()=>stage.fitAvatar();document.querySelector('#fit-lights').onclick=()=>stage.fitLighting();
 for(const id of ['library','editor']){
  const toggle=document.querySelector('#toggle-'+id);
  const apply=hidden=>{workspace.classList.toggle('hide-'+id,hidden);toggle.setAttribute('aria-expanded',String(!hidden));toggle.textContent=(hidden?'展开':'收起')+(id==='library'?'场景栏':'调整栏');};
  apply(id==='library'&&window.innerWidth<900);
  toggle.onclick=()=>apply(!workspace.classList.contains('hide-'+id));
 }
 const unsubscribe=stage.onViewChange(({outputView,frame:r,camera})=>{
  free.setAttribute('aria-pressed',String(!outputView));final.setAttribute('aria-pressed',String(outputView));
  document.querySelector('#stage').classList.toggle('output-view',outputView);frame.hidden=!outputView;
  if(outputView){Object.assign(frame.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});caption.textContent=`最终取景 · ${camera.width} × ${camera.height}`;}
 });
 return{dispose:unsubscribe};
}
