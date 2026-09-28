import {captureCamera} from './bookmarks.js';

// Three.js filmGauge convention: 36 mm across the longer image dimension.
// FOV remains canonical, so opening older scenes never changes their framing.
const filmHeight=c=>36/Math.max(c.width/c.height,1);
const degrees=180/Math.PI;
export function focalLength(camera){const c=captureCamera(camera);return filmHeight(c)/(2*Math.tan(c.fov/degrees/2));}
export function focalRange(camera){const c=captureCamera(camera),h=filmHeight(c);return{min:h/(2*Math.tan(60/degrees)),max:h/(2*Math.tan(2.5/degrees))};}
export function withFocalLength(camera,mm){
 const c=captureCamera(camera),{min,max}=focalRange(c);
 if(!Number.isFinite(mm)||mm<min-1e-9||mm>max+1e-9)throw Error(`当前画幅的焦距范围为 ${min.toFixed(2)}–${max.toFixed(2)} mm`);
 return captureCamera({...c,fov:Math.max(5,Math.min(120,2*Math.atan(filmHeight(c)/(2*mm))*degrees))});
}
export function resizeCamera(camera,width,height){return withFocalLength(captureCamera({...camera,width,height}),focalLength(camera));}
