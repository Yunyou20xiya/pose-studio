import {captureHandReference,blobData} from './hand-reference.js';

export async function captureHandRepair({stage,world,relation,assertCurrent}){
 // Fix the camera once for every pass. Inspection/isolation is intentionally
 // ignored: source, depth and mask must share actual body and prop occlusion.
 const camera={...stage.viewSpec(),width:512,height:512},images={};
 for(const [name,style] of [['source','beauty'],['depth','depth'],['mask','mask'],['ownership','ownership']]){
  assertCurrent();
  const blob=await captureHandReference({stage,world,relation,style,frame:camera,isolate:false});
  assertCurrent();
  if(name==='mask'){
   const bitmap=await createImageBitmap(blob);
   try{
    const canvas=document.createElement('canvas');canvas.width=camera.width;canvas.height=camera.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0,clipped=false;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4]>127){count++;if(x<20||y<20||x>=canvas.width-20||y>=canvas.height-20)clipped=true;}
    if(count<64)throw Error('画面中的手太小或被遮住，请先放大双手再导出');
    if(clipped)throw Error('手部接近画面边缘，请稍微拉远，为修图留出余量');
   }finally{bitmap.close();}
  }
  images[name]=await blobData(blob);
 }
 assertCurrent();return{camera,images};
}
