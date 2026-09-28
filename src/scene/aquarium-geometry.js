import * as THREE from 'three';

// Open-front tank and separate glass keep cameras usable on either side.
// The pane is omitted only from structural references, never from beauty renders.
export function createAquariumObject(type,color){
 const root=new THREE.Group();
 const material=(settings,tint=false)=>{const m=new THREE.MeshStandardMaterial(settings);m.userData.objectTint=tint;return m;};
 const add=(geometry,mat,position=[0,0,0],shadow=true)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.fromArray(position);mesh.castShadow=shadow;mesh.receiveShadow=shadow;root.add(mesh);return mesh;};
 const box=(size,mat,position,shadow=true)=>add(new THREE.BoxGeometry(...size),mat,position,shadow);
 if(type==='glass-wall'){
  const frame=material({color:'#13262e',roughness:.46,metalness:.35});
  const pane=material({color,roughness:.09,metalness:.05,transparent:true,opacity:.085,depthWrite:false,side:THREE.DoubleSide},true);pane.userData.referenceHidden=true;
  box([7.76,3.96,.12],pane,[0,2.1,0],false);
  for(const x of [-3.94,3.94])box([.12,4.2,.12],frame,[x,2.1,0]);
  for(const y of [.06,4.14])box([7.76,.12,.12],frame,[0,y,0]);
 }else if(type==='aquarium-tank'){
  const water=new THREE.MeshBasicMaterial({color,vertexColors:true,side:THREE.DoubleSide});water.userData.objectTint=true;
  const backdrop=new THREE.PlaneGeometry(8,4.2,120,64),positions=backdrop.attributes.position,colors=[];
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i),y=positions.getY(i)/4.2+.5;
   const rays=Math.pow(.5+.5*Math.sin(x*6.1+y*.8),8)*.23+Math.pow(.5+.5*Math.sin(x*13.7-y*1.5),12)*.09;
   const light=.25+.62*y+rays*(.3+.7*y),ripple=.022*Math.sin(y*160+x*5)*Math.sin(x*17+y*19);
   colors.push((light+ripple)*.57,(light+ripple)*.88,light+ripple);
  }
  backdrop.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  add(backdrop,water,[0,2.1,2.5],false);
  const sand=material({color:'#71959c',roughness:1});
  box([8,.03,5],sand,[0,.015,0]);
  for(const x of [-4,4]){const side=add(backdrop.clone(),water,[x,2.1,0],false);side.scale.x=5/8;side.rotation.y=Math.PI/2;}
  const surface=new THREE.MeshBasicMaterial({color:'#398da8',side:THREE.DoubleSide});
  const top=add(new THREE.PlaneGeometry(8,5),surface,[0,4.2,0],false);top.rotation.x=Math.PI/2;
 }else if(type==='fish'){
  const skin=material({color,roughness:.38,metalness:.15},true),fin=material({color,roughness:.65,side:THREE.DoubleSide},true);
  const body=add(new THREE.SphereGeometry(1,24,14),skin,[.035,.14,0]);body.scale.set(.265,.115,.065);
  const shape=(points,position=[0,0,0])=>{const outline=new THREE.Shape();points.forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));outline.closePath();return add(new THREE.ShapeGeometry(outline),fin,position);};
  shape([[-.18,.14],[-.34,.265],[-.31,.14],[-.34,.015]]);
  shape([[-.13,.22],[-.08,.30],[.12,.24]]);
  shape([[-.07,.07],[-.13,0],[.09,.04]]);
  for(const side of [-1,1]){
   const eye=material({color:'#101c25',roughness:.25}),glint=material({color:'#e3faff',roughness:.1});
   add(new THREE.SphereGeometry(.013,10,8),eye,[.22,.17,side*.045]);
   add(new THREE.SphereGeometry(.004,8,6),glint,[.224,.174,side*.054]);
   const pectoral=shape([[-.045,.08],[.08,.145],[-.055,.145]],[0,0,side*.057]);pectoral.rotation.x=side*.55;
  }
 }
 return root;
}
