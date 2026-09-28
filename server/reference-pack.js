import {mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {imageBytes} from './image-exports.js';
import {referenceCamera,segmentLegend,partLabel,normalReferenceLighting} from '../src/exports/reference-spec.js';

const json=value=>JSON.stringify(value,null,2)+'\n';
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(p,r)=>p&&p.projectId===r.projectId&&p.revision===r.expectedRevision;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const safeName=name=>['normal.png','source.png','structure.png','depth.png','segments.png','manifest.json','scene.pose.json','使用说明.md','index.html'].includes(name)||/^detail-(0[1-9]|1[0-8])\.png$/.test(name);

export async function saveReferencePackage({directory,readProject,request}){
 const current=readProject();if(!request||!same(current,request))throw Error('现场已改变，请重新导出参考包');
 const project=structuredClone(current),camera=referenceCamera(project.camera),legend=segmentLegend(project),depth=request.depth;
 if(!isDeepStrictEqual(camera,request.camera))throw Error('参考图与当前取景机位不一致，请重新导出');
 if(!depth||!Number.isFinite(depth.near)||!Number.isFinite(depth.far)||depth.near<.01||depth.far>100||depth.far<=depth.near)throw Error('深度范围无效');
 if(typeof request.title!=='string'||!request.title.trim()||request.title.length>80||typeof request.intent!=='string'||request.intent.length>500)throw Error('镜头名称或拍摄意图无效');
 if(!Array.isArray(request.details)||request.details.length>18)throw Error('局部图数量无效');
 const files={},details=[],seen=new Set(),title=request.title.trim(),intent=request.intent.trim();
 function addImage(name,image,width,height){const bytes=imageBytes(image);if(bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)throw Error('参考图尺寸不一致，请重新导出');files[name]=bytes;}
 for(const name of ['normal','source','structure','depth','segments'])addImage(name+'.png',request.images?.[name],camera.width,camera.height);
 for(const detail of request.details){
  const actor=legend.find(a=>a.id===detail?.actorId&&a.kind==='actor'),r=detail?.rect,key=detail?.actorId+':'+detail?.part;
  if(detail?.source!=='normal.png'||!actor||!['head','leftHand','rightHand'].includes(detail.part)||seen.has(key)||!r||!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>camera.width||r.y+r.height>camera.height)throw Error('局部图范围或角色无效');
  seen.add(key);const file=`detail-${String(details.length+1).padStart(2,'0')}.png`;addImage(file,detail.image,r.width,r.height);
  details.push({file,actorId:actor.id,actorName:actor.name,part:detail.part,rect:{x:r.x,y:r.y,width:r.width,height:r.height},source:'normal.png',resampled:false});
 }
 const id='reference-'+randomUUID(),folder=join(directory,id),temporary=join(directory,'.'+id+'.tmp');
 const transparency={helperPolicy:"omit-glass-pane-retain-frame",objectIds:(project.scene?.objects||[]).filter(o=>o.visible&&o.type==="glass-wall").map(o=>o.id)};
 const glassNote=transparency.objectIds.length?"观景玻璃在两张主参考中保留；体块、深度和分色辅助图透过透明玻璃记录后方对象，保留实体边框，不将玻璃当成不透明遮挡。":"";
 const guidance=`${glassNote}请结合两张主参考：normal.png（正常光）确定角色外观、原色、姿势、表情、手型与遮挡；source.png（打灯后）确定最终光线方向、光斑、明暗、色温与投影。两张图使用相同的现场、机位和材质，只切换照明；不要把正常光图的均匀照明混入最终打光。保持角色数量、左右手归属、肢体与物品的前后位置；手与脸的受光应服从手掌、手指和指缝的遮挡。局部图直接裁切自 normal.png，用于辨认细节；不代表另一个角度，不要补画被挡住的手指。structure.png 用于查看轮廓与体块。depth.png 可供支持线性深度的流程使用；segments.png 的颜色仅标记角色和物品，不是服装配色。`;
 const readme=`# ${title}\n\n状态：参考包已准备。生成插画应另存为候选，再逐项核对。\n\n## 拍摄意图\n\n${intent||'未另填拍摄意图，请以两张主参考为准。'}\n\n## 给图像模型的说明\n\n${guidance}\n\n## 两张主参考\n\n- normal.png：正常光参考。保留当前角色与物品的颜色、纹理、材质、背景；临时使用跟随机位的均匀白光，无窄光束、彩色灯光和灯光投影，保留几何遮挡和表面明暗。\n- source.png：打灯后参考。完整保留当前现场的实际灯光与阴影。\n\n两张图严格使用同一姿势、表情、机位与画幅；正常光不是原图提亮，也不是灰色体块图。\n\n## 辅助图像\n\n- structure.png：相同机位的中性体块图，保留实体几何与透明裁切，取消原来的颜色和灯光。${glassNote}\n- depth.png：近白远黑的线性相机深度；近端 ${depth.near} 米，远端 ${depth.far} 米，背景黑色。\n- segments.png：角色和物品的归属颜色，地面与背景黑色；颜色对照见 manifest.json。\n- detail-*.png：从 normal.png 直接裁切的头部、左右手细节，位置与范围记录在 manifest.json。骨骼投影只决定裁切范围；被衣物或其他物体挡住的部分仍然不可见。\n\n五张整图均为 ${camera.width} × ${camera.height} 像素。深度、分色的轮廓边缘含抗锯齿；分色不是通用模型的语义标签，深度也不会自动接入控制模型。具体模型是否遵守参考，需实际验证。\n\n来源项目：${project.projectId}，版本 ${project.revision}。scene.pose.json 保存完整现场，可恢复原姿势、表情、灯光和相机。\n`;
 const figure=(file,label)=>`<figure><a href="${file}"><img src="${file}" alt="${escape(label)}" loading="lazy"></a><figcaption>${escape(label)}</figcaption></figure>`;
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · AI 参考包</title><style>body{margin:36px auto;padding:0 24px;max-width:1180px;font:16px/1.7 system-ui;background:#eef0ea;color:#293a32}h1{font-size:30px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:20px}.pair{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:640px){.pair{grid-template-columns:1fr}}figure{margin:0;background:white;padding:14px;border-radius:14px}img{width:100%;display:block}figcaption{margin-top:8px}a{color:#245e47}nav{display:flex;gap:22px;flex-wrap:wrap;margin:24px 0}p{white-space:pre-wrap;max-width:1050px}.tag{color:#71602a}.details img{max-height:350px;object-fit:contain}.legend{display:flex;gap:16px;flex-wrap:wrap}.swatch{display:inline-block;width:13px;height:13px;margin-right:6px}</style><h1>${escape(title)}</h1><p class="tag">参考包已准备 · ${camera.width} × ${camera.height} · 现场版本 ${project.revision}</p><p>${escape(intent||'请结合正常光与打灯后两张主参考。')}</p><nav><a href="使用说明.md">使用说明</a><a download href="manifest.json">机位与裁切记录</a><a download href="scene.pose.json">完整现场</a></nav><h2>两张主参考</h2><p>同一姿势、表情和机位，只切换照明。正常光看外观与动作，打灯后看最终明暗。</p><section class="pair">${figure('normal.png','① 正常光 · 原色、手型与遮挡')}${figure('source.png','② 打灯后 · 最终光斑、明暗与投影')}</section><h2>头部与手部细节</h2><p>直接裁切自正常光图，保持原有透视、遮挡和像素。未进入画面的部位不生成局部图。</p><section class="details">${details.map(d=>figure(d.file,d.actorName+' · '+partLabel(d.part))).join('')||'<p>当前机位没有足够大的头部或手部范围。</p>'}</section><h2>辅助图像</h2><section>${[['structure.png','中性体块 · 查看轮廓与遮挡'],['depth.png','线性深度 · 近白远黑'],['segments.png','对象归属 · 区分角色与物品']].map(([file,label])=>figure(file,label)).join('')}</section><p class="legend">${legend.map(a=>`<span><i class="swatch" style="background:${a.color}"></i>${escape(a.name)}</span>`).join('')}</p><h2>给图像模型的说明</h2><p>${escape(guidance)}</p></html>`;
 Object.assign(files,{'scene.pose.json':json(project),'使用说明.md':readme,'index.html':html});
 const manifest={schemaVersion:2,id,status:'reference-ready',createdAt:new Date().toISOString(),title,intent,sourceKind:'workbench-render',project:{id:project.projectId,revision:project.revision},camera,transparency,references:{normal:{file:'normal.png',role:'appearance-pose-occlusion',lighting:normalReferenceLighting},lit:{file:'source.png',role:'final-lighting',lighting:project.lighting},shared:['camera','pose','expressions','geometry','materials','background']},depth:{near:depth.near,far:depth.far,encoding:'linear-camera-depth',nearColor:'white',farColor:'black',background:'black',antialiased:true},segmentation:{legend,background:'#000000',ground:'#000000',semanticLabels:false,antialiased:true},details,guidance,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{sha256:hash(bytes),...(name.endsWith('.png')?{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}:{})}]))};
 files['manifest.json']=json(manifest);
 await mkdir(directory,{recursive:true});await mkdir(temporary);let published=false;
 try{
  for(const [name,bytes]of Object.entries(files))await writeFile(join(temporary,name),bytes,{flag:'wx'});
  if(!same(readProject(),request))throw Error('现场已改变，请重新导出参考包');
  await rename(temporary,folder);published=true;
  if(!same(readProject(),request))throw Error('现场已改变，请重新导出参考包');
  return{id,directory:folder,url:'/api/reference-pack/files/'+id+'/index.html',revision:project.revision,details:details.length};
 }catch(e){await rm(published?folder:temporary,{recursive:true,force:true});throw e;}
}

export async function readReferenceFile(directory,id,name){
 if(!/^reference-[a-f0-9-]{36}$/.test(id||'')||typeof name!=='string'||!safeName(name))throw Error('参考包文件名称无效');
 const manifest=JSON.parse(await readFile(join(directory,id,'manifest.json'),'utf8'));
 if(name!=='manifest.json'&&!Object.hasOwn(manifest.files,name))throw Error('参考包没有这个文件');
 return{bytes:await readFile(join(directory,id,name)),type:name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8'};
}
