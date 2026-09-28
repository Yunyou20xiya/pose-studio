const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000);
export function captureCamera(camera){
 if(!camera||!vector(camera.position)||!vector(camera.target)||!Number.isFinite(camera.fov)||camera.fov<5||camera.fov>120||!['width','height'].every(k=>Number.isSafeInteger(camera[k])&&camera[k]>=64&&camera[k]<=8192))throw Error('机位位置、视角或画幅无效');
 const up=camera.up??[0,1,0];if(!vector(up))throw Error('机位朝上方向无效');
 const d=camera.target.map((n,i)=>n-camera.position[i]),cross=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]],distance=Math.hypot(...d),upLength=Math.hypot(...up);
 if(distance<.000001||upLength<.000001||Math.hypot(...cross)<distance*upLength*.000001)throw Error('机位朝向无效，请拉开镜头与取景目标');
 return{position:[...camera.position],target:[...camera.target],up:[...up],fov:camera.fov,width:camera.width,height:camera.height};
}
export function cameraPatch(project,saved,{lookAtCamera=false}={}){
 const camera=captureCamera(saved);
 return{camera,...(lookAtCamera?{gaze:{...project.snapshot.gaze,mode:'camera',target:[...camera.position],follow:1}}:{})};
}
