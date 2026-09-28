import {MeshStandardMaterial} from 'three';

// A reversible viewport material override. Geometry, textures and the original
// VRM materials remain owned by the avatar; no source asset is rewritten.
export function createLightingReference(root){
 const entries=[],cache=new Map();let active='original';
 root.traverse(mesh=>{if(mesh.isMesh)entries.push({mesh,original:mesh.material});});
 function reference(source){
  if(cache.has(source))return cache.get(source);
  const material=new MeshStandardMaterial({
   name:'Light reference · '+source.name,
   color:source.color?.clone(),map:source.map||null,
   normalMap:source.normalMap||null,
   roughness:.85,metalness:0,
   alphaMap:source.alphaMap||null,alphaTest:source.alphaTest,
   transparent:source.transparent,opacity:source.opacity,
   side:source.side,depthWrite:source.depthWrite,
   visible:source.visible&&!source.isOutline,
  });
  if(source.normalScale)material.normalScale.copy(source.normalScale);
  cache.set(source,material);return material;
 }
 function setMode(mode='original'){
  if(!['original','reference'].includes(mode))throw Error('受光显示方式无效');
  if(active===mode)return;
  for(const {mesh,original}of entries)mesh.material=mode==='original'?original:Array.isArray(original)?original.map(reference):reference(original);
  active=mode;
 }
 return{setMode,dispose(){setMode('original');for(const material of cache.values())material.dispose();cache.clear();}};
}
