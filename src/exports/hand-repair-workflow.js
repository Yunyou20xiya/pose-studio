// ComfyUI core nodes only. Model placeholders deliberately cannot run as a job.
export function buildHandRepairWorkflow({id,checkpoint='SELECT_CHECKPOINT.safetensors',controlnet='SELECT_MATCHING_DEPTH_CONTROLNET.safetensors',preset='palms-together'}={}){
 if(!/^hands-[-a-zA-Z0-9_]+$/.test(id||''))throw Error('修手资料标识无效');
 const prompt={},nodes=[],links=[];
 function node(type,title,pos,inputs,outputs,widgets={}){
  const n=nodes.length+1,key=String(n),ins=[];
  prompt[key]={class_type:type,inputs:{...widgets},_meta:{title}};
  for(const [name,source] of Object.entries(inputs)){
   const origin=nodes[source[0]-1],slot=source[1],link=links.length+1;
   links.push([link,origin.id,slot,n,ins.length,origin.outputs[slot].type]);
   origin.outputs[slot].links.push(link);ins.push({name,type:origin.outputs[slot].type,link});prompt[key].inputs[name]=[String(source[0]),slot];
  }
  const values=Object.values(widgets);
  // These two frontend widgets are not prompt inputs.
  if(type==='LoadImage'||type==='LoadImageMask')values.push('image');
  if(type==='KSampler')values.splice(1,0,'fixed');
  nodes.push({id:n,type,title,pos,size:[300,type==='CLIPTextEncode'?180:Math.max(120,70+(ins.length+values.length)*24)],flags:{},order:n-1,mode:0,inputs:ins,outputs:outputs.map((t,i)=>({name:t,type:t,links:[],slot_index:i})),properties:{'Node name for S&R':type},widgets_values:values});
  return n;
 }
 const model=node('CheckpointLoaderSimple','选择基础模型 · SDXL / SD1.5',[30,40],{},['MODEL','CLIP','VAE'],{ckpt_name:checkpoint});
 const source=node('LoadImage','原图 · 同机位同尺寸',[30,400],{},['IMAGE','MASK'],{image:id+'/source.png'});
 const depth=node('LoadImage','三维手部深度 · 近白远黑',[30,770],{},['IMAGE','MASK'],{image:id+'/depth.png'});
 const mask=node('LoadImageMask','修手范围 · 读取白色',[370,400],{},['MASK'],{image:id+'/mask.png',channel:'red'});
 const grow=node('GrowMask','给手部边缘留余量',[370,620],{mask:[mask,0]},['MASK'],{expand:12,tapered_corners:true});
 const maskImage=node('MaskToImage','范围转图片',[710,620],{mask:[grow,0]},['IMAGE']);
 const blur=node('ImageBlur','柔化范围边缘',[1050,620],{image:[maskImage,0]},['IMAGE'],{blur_radius:6,sigma:3});
 const softMask=node('ImageToMask','实际修图范围',[1390,620],{image:[blur,0]},['MASK'],{channel:'red'});
 const control=node('ControlNetLoader','选择与基础模型匹配的深度 ControlNet',[370,940],{},['CONTROL_NET'],{control_net_name:controlnet});
 const gesture=({'palms-together':'two hands pressed palm to palm','handshake':'two people shaking hands','hand-hold':'two people holding hands'})[preset]||'two interacting hands';
 const positive=node('CLIPTextEncode','保持原画风与手部动作',[370,40],{clip:[model,1]},['CONDITIONING'],{text:gesture+', anatomically correct hands, natural fingers and wrists, same gesture, matching the original style and lighting'});
 const negative=node('CLIPTextEncode','避免手部结构错误',[710,40],{clip:[model,1]},['CONDITIONING'],{text:'extra fingers, missing fingers, fused fingers, extra hands, malformed hands, twisted wrists'});
 const conditioned=node('ControlNetApplyAdvanced','用三维深度约束姿态',[1050,40],{positive:[positive,0],negative:[negative,0],control_net:[control,0],image:[depth,0],vae:[model,2]},['CONDITIONING','CONDITIONING'],{strength:.65,start_percent:0,end_percent:1});
 const encoded=node('VAEEncodeForInpaint','只给修图范围加噪',[1730,400],{pixels:[source,0],vae:[model,2],mask:[softMask,0]},['LATENT'],{grow_mask_by:0});
 const sample=node('KSampler','局部重绘 · 起始参数',[2080,40],{model:[model,0],positive:[conditioned,0],negative:[conditioned,1],latent_image:[encoded,0]},['LATENT'],{seed:270927,steps:24,cfg:6,sampler_name:'dpmpp_2m',scheduler:'karras',denoise:.65});
 const decoded=node('VAEDecode','解码候选',[2430,40],{samples:[sample,0],vae:[model,2]},['IMAGE']);
 const composite=node('ImageCompositeMasked','仅贴回修手范围 · 保留原图其余部分',[2770,40],{destination:[source,0],source:[decoded,0],mask:[softMask,0]},['IMAGE'],{x:0,y:0,resize_source:false});
 node('SaveImage','保存候选 · 不覆盖原图',[3110,40],{images:[composite,0]},[],{filename_prefix:'pose-hand-repair/'+id});
 node('PreviewImage','检查最终修图范围',[1730,750],{images:[blur,0]},[]);
 return{prompt,workflow:{last_node_id:nodes.length,last_link_id:links.length,nodes,links,groups:[],config:{},extra:{ds:{scale:.65,offset:[20,20]}},version:.4}};
}
