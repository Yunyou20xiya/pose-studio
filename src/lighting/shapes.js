import {DataTexture,RGBAFormat,LinearFilter} from 'three';

export function beamDimensions(l){return[l.beamWidth,l.beamShape==='rectangle'?l.beamHeight:l.beamWidth];}
// Coordinates are metres on the plane through the aiming point, perpendicular to the lamp.
export function beamValue(x,y,l){
 const [w,h]=beamDimensions(l),a=l.beamRotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),u=(c*x+s*y)/(w/2),v=(-s*x+c*y)/(h/2);
 const d=l.beamShape==='circle'?Math.hypot(u,v):Math.max(Math.abs(u),Math.abs(v));
 if(d>=1)return 0;if(l.beamEdge===0)return 1;
 const t=Math.max(0,Math.min(1,(1-d)/l.beamEdge));return t*t*(3-2*t);
}
export function beamTexture(l){
 const [w,h]=beamDimensions(l),span=Math.hypot(w,h)*1.02,size=256,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const value=Math.round(255*beamValue(((x+.5)/size-.5)*span,((y+.5)/size-.5)*span,l)),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;}
 const texture=new DataTexture(data,size,size,RGBAFormat);texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;return{texture,span};
}
export function emitterSamples(l){
 if(l.emitterShape==='point')return[[0,0]];
 const h=l.emitterShape==='rectangle'?l.emitterHeight:l.emitterWidth;
 // Five distributed samples retain real occlusion. The PCF filter softens sample boundaries.
 const scale=l.emitterShape==='disc'?Math.SQRT1_2:.72;
 return[[0,0],...[-1,1].flatMap(x=>[-1,1].map(y=>[x*l.emitterWidth/2*scale,y*h/2*scale]))];
}
