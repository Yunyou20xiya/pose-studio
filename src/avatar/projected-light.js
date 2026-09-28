import {ShaderChunk} from 'three';

// MToon 3.5 has its own light loop, which omits Three's spotlight cookies.
// Reuse the pinned Three shader's map sampling while retaining MToon's shading.
export function enableProjectedLight(material){
 if(!material.isMToonMaterial)return;
 const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey;
 const start=ShaderChunk.lights_fragment_begin.indexOf('#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )'),end=ShaderChunk.lights_fragment_begin.indexOf('#undef SPOT_LIGHT_MAP_INDEX',start);
 if(start<0||end<start)throw Error('投影光采样代码不可用');
 const sampling=ShaderChunk.lights_fragment_begin.slice(start,end)+'#undef SPOT_LIGHT_MAP_INDEX\n';
 material.onBeforeCompile=function(shader,renderer){
  compile.call(this,shader,renderer);
  const start=shader.fragmentShader.indexOf('#if ( NUM_SPOT_LIGHTS'),end=shader.fragmentShader.indexOf('#if ( NUM_DIR_LIGHTS',start);
  if(start<0||end<0)throw Error('角色材质的投影光适配失败');
  const block=shader.fragmentShader.slice(start,end).replace('SpotLight spotLight;','SpotLight spotLight;\n vec4 spotColor; vec3 spotLightCoord; bool inSpotLightMap;').replace('shadow = 1.0;',sampling+'\n shadow = 1.0;');
  shader.fragmentShader=shader.fragmentShader.slice(0,start)+block+shader.fragmentShader.slice(end);
 };
 material.customProgramCacheKey=function(){return cacheKey.call(this)+',projected-light-v1';};material.needsUpdate=true;
}
