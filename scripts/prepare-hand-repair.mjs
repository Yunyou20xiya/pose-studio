import {readFile,writeFile,mkdir,rename,rm,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {buildHandRepairWorkflow} from '../src/exports/hand-repair-workflow.js';

// File preparation only; no downloads, inference requests, or global config edits.
try{
 const flags=new Map(),args=process.argv.slice(2);
 for(let i=0;i<args.length;i+=2){if(!['--package','--input-dir','--workflow-dir','--checkpoint','--controlnet','--models-dir'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('参数无效');flags.set(args[i],args[i+1]);}
 for(const name of ['--package','--input-dir','--workflow-dir'])if(!flags.has(name))throw Error('用法：--package 资料夹 --input-dir ComfyUI输入目录 --workflow-dir 工作流输出目录 [--models-dir 模型目录 --checkpoint 模型文件名 --controlnet 深度模型文件名]');
 const source=resolve(flags.get('--package')),input=resolve(flags.get('--input-dir')),output=resolve(flags.get('--workflow-dir'));
 const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
 if(manifest.schemaVersion!==1||!/^hands-[a-f0-9-]{36}$/.test(manifest.id||''))throw Error('资料格式无效');
 const checkpoint=flags.get('--checkpoint'),controlnet=flags.get('--controlnet'),models=flags.get('--models-dir');
 if(checkpoint||controlnet||models){
  if(!checkpoint||!controlnet||!models)throw Error('指定模型时需要同时提供模型目录、基础模型与深度模型');
  for(const [sub,name] of [['checkpoints',checkpoint],['controlnet',controlnet]]){
   if(name.startsWith('/')||name.split(/[\\/]/).some(n=>n==='..'||!n))throw Error('请用模型目录内的相对文件名');
   if(!(await stat(resolve(models,sub,name))).isFile())throw Error('模型文件不可用：'+name);
  }
 }
 const images={};
 for(const name of ['source.png','depth.png','mask.png','ownership.png']){
  const bytes=await readFile(join(source,name));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.files?.[name]?.sha256)throw Error('资料图片已变化，请重新导出或另建经对齐检查的成图资料包：'+name);
  images[name]=bytes;
 }
 const {workflow,prompt}=buildHandRepairWorkflow({id:manifest.id,checkpoint,controlnet,preset:manifest.interaction.preset});
 await mkdir(input,{recursive:true});await mkdir(output,{recursive:true});
 // Core LoadImage selectors enumerate only immediate files, although the API accepts subfolders.
 // Keep the isolated originals and expose uniquely named copies for the graphical workflow.
 const inputFiles=Object.fromEntries(Object.keys(images).map(name=>[name,manifest.id+'-'+name]));
 const missing=[];
 for(const [name,filename] of Object.entries(inputFiles)){
  try{if(!(await readFile(join(input,filename))).equals(images[name]))throw Error('输入目录已有不同图片，保留原文件：'+filename);}
  catch(e){if(e.code!=='ENOENT')throw e;missing.push(name);}
 }
 const target=join(input,manifest.id),staging=join(input,'.'+manifest.id+'-'+randomUUID()+'.tmp');
 let exists=false;try{exists=(await stat(target)).isDirectory();}catch(e){if(e.code!=='ENOENT')throw e;}
 if(exists){for(const [name,bytes] of Object.entries(images))if(!(await readFile(join(target,name))).equals(bytes))throw Error('输入目录已有不同图片，保留原文件：'+name);}
 else{
  await mkdir(staging);
  try{for(const [name,bytes] of Object.entries(images))await writeFile(join(staging,name),bytes,{flag:'wx'});await rename(staging,target);}catch(e){await rm(staging,{recursive:true,force:true});throw e;}
 }
 for(const name of missing)await writeFile(join(input,inputFiles[name]),images[name],{flag:'wx'});
 for(const [id,node] of Object.entries(prompt))if(['LoadImage','LoadImageMask'].includes(node.class_type)){
  const filename=inputFiles[node.inputs.image.slice(manifest.id.length+1)];
  node.inputs.image=filename;workflow.nodes.find(n=>String(n.id)===id).widgets_values[0]=filename;
 }
 const prepared=join(output,manifest.id+'-'+randomUUID().slice(0,8));await mkdir(prepared);
 for(const [name,value] of [['workflow.json',workflow],['workflow-api.json',prompt],['preparation.json',{source,images:target,inputFiles,modelsSelected:!!checkpoint,inference:'not-run',checkpoint:checkpoint||null,controlnet:controlnet||null}]])await writeFile(join(prepared,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:checkpoint?'prepared-with-model-files':'prepared-template',inference:'not-run',images:target,inputFiles,workflow:join(prepared,'workflow.json'),prompt:join(prepared,'workflow-api.json')},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
