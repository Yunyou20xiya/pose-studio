import {mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pngBytes} from './pose-library.js';
import {buildHandRepairWorkflow} from '../src/exports/hand-repair-workflow.js';
export {buildHandRepairWorkflow};
const names=['source.png','depth.png','mask.png','ownership.png','manifest.json','scene.pose.json','workflow.json','workflow-api.json','使用说明.md','index.html'];
const json=value=>JSON.stringify(value,null,2)+'\n';
const same=(p,r)=>p&&p.projectId===r.projectId&&p.revision===r.expectedRevision;

function validateCamera(camera){
 if(!camera||!['position','target','up'].every(k=>Array.isArray(camera[k])&&camera[k].length===3&&camera[k].every(Number.isFinite))||!Number.isFinite(camera.fov)||camera.fov<5||camera.fov>120||!['width','height'].every(k=>Number.isInteger(camera[k])&&camera[k]>=64&&camera[k]<=2048&&camera[k]%8===0)||camera.width!==camera.height)throw Error('修手资料需要有效的方形机位与尺寸');
 const distance=Math.hypot(...camera.position.map((v,i)=>v-camera.target[i]));
 if(distance<.01||Math.hypot(...camera.up)<.5)throw Error('取景机位无效');
 const near=Math.max(.01,distance-.3);return{near,far:near+.6,encoding:'linear-camera-depth',nearColor:'white',farColor:'black'};
}

export async function saveHandRepairPackage({directory,readProject,request}){
 const current=readProject();if(!same(current,request))throw Error('现场已改变，请重新导出修手资料');
 const project=structuredClone(current),relation=project.scene?.handInteractions?.find(r=>r.id===request.interactionId);
 if(!relation)throw Error('这个手部互动已不存在');
 const camera=structuredClone(request.camera),depth=validateCamera(camera),images={};
 for(const name of ['source','depth','mask','ownership']){
  const bytes=pngBytes(request.images?.[name]);
  if(bytes.readUInt32BE(16)!==camera.width||bytes.readUInt32BE(20)!==camera.height)throw Error('修手参考图尺寸不一致，请重新导出');
  images[name+'.png']=bytes;
 }
 const id='hands-'+randomUUID(),folder=join(directory,id),temporary=join(directory,'.'+id+'.tmp'),{workflow,prompt}=buildHandRepairWorkflow({id,preset:relation.preset});
 const manifest={schemaVersion:1,id,status:'prepared',createdAt:new Date().toISOString(),sourceKind:'workbench-render',project:{id:project.projectId,revision:project.revision},interaction:relation,camera,depth,mask:{white:'repair',black:'preserve',visibility:'visible hand surfaces only',growPixels:12,featherRadiusPixels:6},models:{family:'select-matching-SDXL-or-SD1.5',checkpoint:'not-selected',controlnet:'not-selected',inference:'not-run'},files:Object.fromEntries(Object.entries(images).map(([name,bytes])=>[name,{sha256:createHash('sha256').update(bytes).digest('hex'),width:camera.width,height:camera.height}]))};
 const readme=`# 手部局部修图资料\n\n状态：已准备参考资料，未运行图像生成。\n\n这组图片来自工作台同一现场版本、同一机位、同一尺寸。source.png 是三维现场的原图；depth.png 为近白远黑的线性深度；mask.png 的白色是可见手部，黑色保留；ownership.png 用橙色与蓝色区分双方，仅供检查。\n\n## 使用\n\n1. 由 AI 使用工作台的 scripts/prepare-hand-repair.mjs 将本资料夹放到 ComfyUI 输入目录，并指定已安装的基础模型与同系列深度 ControlNet（例如 SDXL 配 SDXL）。脚本只准备文件，不自动运行或下载。\n2. 在 ComfyUI 打开准备好的 workflow.json。流程仅使用内置节点，查看实际修图范围后运行。起始深度强度 0.65、重绘程度 0.65 需要按画风做对照。\n3. 结果保存为新候选，原图保留。最后一步按柔化后的范围贴回，范围外使用原图像素。\n\n## 给成图修手\n\n当前 source.png 是三维示例，不是已经生成的插画。替换成图时，画幅、人物位置、双手方向与大小必须和参考一致；先检查对齐，再调整 mask.png 覆盖坏手的全部轮廓（包括多余手指）。同尺寸本身不能证明对齐。不同构图不能直接套用。本版不做自动图片配准，也不从陌生图片识别手。\n\n遮罩默认只包括当前可见的手部，流程向外留 12 像素并柔化 6 像素；完全被遮挡的手不会被凭空补画。过远或被衣袖遮住时，先在工作台放大、换角度或手工改范围。\n\n## 依赖与边界\n\n需要可启动的 ComfyUI、可用的 SDXL 或 SD1.5 基础模型和匹配的深度 ControlNet。模板中的 SELECT_... 名称是待选择项。SDXL 基础模型应配 SDXL 深度 ControlNet；HandRefiner 官方对应 SD1.5 权重不能混用。模型搭配与参数均需实际出图验证。该流程采用深度约束局部重绘，不包含 HandRefiner 的图片重建预处理，也不能保证模型完全遵守五指或接触关系。\n\n来源现场：${project.projectId}，版本 ${project.revision}。完整姿态和机位记录在 scene.pose.json / manifest.json。\n`;
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>手部修图资料</title><style>body{margin:36px auto;padding:0 24px;max-width:1100px;font:16px/1.7 system-ui;background:#edf0e9;color:#24372d}h1{font-size:30px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}figure{margin:0;background:white;padding:14px;border-radius:14px}img{width:100%;display:block}a{color:#245e47}nav{display:flex;gap:22px;flex-wrap:wrap;margin:24px 0}.tag{color:#80551f}p{max-width:850px}</style><h1>手部修图资料</h1><p class="tag">参考已准备 · 尚未运行修图模型</p><p>四张图片来自同一机位。修图流程只更新手部范围，再贴回原图。替换成插画时，需要先对齐双手，并让修图范围覆盖多余或缺失手指的位置。</p><nav><a download href="workflow.json">ComfyUI 流程</a><a href="使用说明.md">使用说明</a><a download href="manifest.json">机位与资料记录</a><a download href="scene.pose.json">原始姿态</a></nav><section>${[['source','原图 · 保留手臂与身体'],['depth','深度 · 近处白，远处黑'],['mask','手部范围 · 白色参与修图'],['ownership','双方归属 · 橙色 / 蓝色']].map(([key,label])=>`<figure><a download href="${key}.png"><img src="${key}.png" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</section><p>流程需要已安装的基础模型与同系列深度 ControlNet。当前图片是三维示例；模型生成效果仍需实际对照。</p></html>`;
 await mkdir(directory,{recursive:true});await mkdir(temporary);
 try{
  const files={...images,'manifest.json':json(manifest),'scene.pose.json':json(project),'workflow.json':json(workflow),'workflow-api.json':json(prompt),'使用说明.md':readme,'index.html':html};
  for(const [name,bytes] of Object.entries(files))await writeFile(join(temporary,name),bytes,{flag:'wx'});
  if(!same(readProject(),request))throw Error('现场已改变，请重新导出修手资料');
  await rename(temporary,folder);
  return{id,directory:folder,url:'/api/hand-repair/files/'+id+'/index.html',revision:project.revision};
 }catch(e){await rm(temporary,{recursive:true,force:true});throw e;}
}

export async function readHandRepairFile(directory,id,name){
 if(!/^hands-[a-f0-9-]{36}$/.test(id||'')||!names.includes(name))throw Error('修手资料名称无效');
 const bytes=await readFile(join(directory,id,name));
 return{bytes,type:name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8'};
}
