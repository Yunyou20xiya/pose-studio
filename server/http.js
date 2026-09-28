import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createQueue} from './queue.js';
import {saveProject,readProject,verifyReferences} from './projects.js';
import {checkScene as checkPose} from '../src/scene/engine.js';
import {actorProject} from '../src/scene/state.js';
import {createPoseStore,pngBytes} from './pose-library.js';
import {createLightingStore} from './lighting-library.js';
import {createCameraStore,saveCurrentCamera} from './camera-library.js';
import {createShotStore} from './shot-library.js';
import {createImageExportStore,defaultExportDirectory} from './image-exports.js';
import {saveReferencePackage,readReferenceFile} from './reference-pack.js';
import {createCombinationStore,saveCurrentCombination} from './combination-library.js';
import {saveHandRepairPackage,readHandRepairFile} from './hand-repair.js';
import {makeProject} from '../src/pose/state.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function createApi({root,port=4173,exportDirectory}){
 const runtime=port===4173?'local-data/runtime':'local-data/runtime-'+port;
 const path=(...parts)=>join(root,...parts),json=async file=>JSON.parse(await readFile(file,'utf8'));
 const model=await json(path('assets/model-source-a.json')),profileBytes=await readFile(path('assets/profiles/primary.json')),profile=JSON.parse(profileBytes),catalog=await json(path('assets/catalog.json'));
 profile.assetRef={id:profile.id,sha256:hash(profileBytes),relativePath:'profiles/primary.json'};
 const refs={[model.id]:{id:model.id,sha256:model.sha256,relativePath:'models/'+model.file},[profile.id]:profile.assetRef};
 const poseStore=createPoseStore({directory:path('local-data/poses'),profile,refs:{model:refs[model.id],profile:profile.assetRef}});
 const lightingStore=createLightingStore({directory:path('local-data/lighting-presets')});
 const cameraStore=createCameraStore({directory:path('local-data/camera-presets')});
 const combinationStore=createCombinationStore({directory:path('local-data/combinations'),builtinDirectory:path('assets/scene-combinations'),profile,baseProject:makeProject(model,profile)});
 const validate=p=>checkPose(p,profile);let initial=null,startupIssues=[];
 try{initial=await readProject(path(runtime,'session.pose.json'));startupIssues=[...verifyReferences(initial,refs),...validate(initial)];if(startupIssues.some(i=>i.severity==='error'))initial=null;}catch(e){if(e.code!=='ENOENT')startupIssues=[{severity:'warning',code:'RECOVERY_FAILED',message:'上次会话无法恢复：'+e.message,bones:[]}];}
 const queue=createQueue({initial,validate}),token=randomUUID();
 await mkdir(path(runtime),{recursive:true});await writeFile(path(runtime,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${port}`,token,pid:process.pid},null,2),{mode:0o600});
 const reply=(res,status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
 const body=async req=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('请提交 JSON 数据'),{code:'CONTENT_TYPE'});let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>48*1024*1024)throw Error('提交内容过大');data+=chunk;}return JSON.parse(data||'{}');};
 const checkFiles=async p=>{const fresh={...refs,[model.id]:{...refs[model.id],sha256:hash(await readFile(path('local-data/models',model.file)))},[profile.id]:{...refs[profile.id],sha256:hash(await readFile(path('assets/profiles/primary.json')))}};const errors=[...verifyReferences(p,fresh),...validate(p)].filter(i=>i.severity==='error');if(errors.length)throw Object.assign(Error(errors.map(x=>x.message).join('；')),{code:'PROJECT_INVALID'});};
 const safeId=id=>{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))throw Error('项目名称无效');return id;};
 // Cards belong to this live session. Separate preview ports must not share a board.
 const shotStore=createShotStore({directory:path(runtime,'shots'),profile,refs,readProject:()=>queue.readState().project,verifyProject:checkFiles});
 const imageExports=createImageExportStore({directory:exportDirectory,legacyDirectory:path('local-data/exports')});
 const referenceDirectory=join(exportDirectory||defaultExportDirectory(),'AI参考包');
 return async function handle(req,res){
  const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
  if(!route.startsWith('/api/')&&!route.startsWith('/local-assets/')&&!route.startsWith('/local-motions/'))return false;
  try{
   if(!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host||''))throw Error('仅允许通过本机地址访问');
   const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`)throw Error('来源地址不匹配');
   if(route.startsWith('/local-assets/')){if(decodeURIComponent(route.slice(14))!==model.file)throw Error('模型未登记');const bytes=await readFile(path('local-data/models',model.file));if(hash(bytes)!==model.sha256)throw Error('角色文件已变化');res.setHeader('Content-Type','application/octet-stream');res.end(bytes);return true;}
   if(route.startsWith('/local-motions/')){const file=decodeURIComponent(route.slice('/local-motions/'.length)),asset=catalog.find(a=>a.file===file);if(!asset)throw Error('动作未登记');const bytes=await readFile(path('local-data/motions',file));if(hash(bytes)!==asset.sha256)throw Error('动作文件内容已变化');res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'application/octet-stream');res.end(bytes);return true;}
   if(route.startsWith('/api/pose-images/')&&req.method==='GET'){const id=route.slice('/api/pose-images/'.length).replace(/\.png$/,'');const item=await poseStore.get(id);res.setHeader('Content-Type','image/png');res.end(pngBytes(item.thumbnail));return true;}
   if(route.startsWith('/api/library-images/')&&req.method==='GET'){const asset=catalog.find(a=>a.thumbnail===route||a.thumbnail.replace(/\.png$/,'-side.png')===route||a.thumbnail.replace(/\.png$/,'-back.png')===route);if(!asset)throw Error('预览未登记');try{res.setHeader('Content-Type','image/png');res.end(await readFile(path('local-data/library-previews',basename(route))));}catch(e){res.statusCode=404;res.end('预览尚未生成');}return true;}
   if(route.startsWith('/api/combination-images/')&&req.method==='GET'){const id=route.slice('/api/combination-images/'.length).replace(/\.png$/,'');const item=await combinationStore.get(id);res.setHeader('Content-Type','image/png');res.end(pngBytes(item.thumbnail));return true;}
   if(route==='/api/bootstrap'&&req.method==='GET'){reply(res,200,{model,profile,catalog,token,startupIssues,startupProject:initial?{projectId:initial.projectId,revision:initial.revision}:null});return true;}
   if(route==='/api/state'&&req.method==='GET'){reply(res,200,queue.readState());return true;}
   if(route.startsWith('/api/images/')&&req.method==='GET'){const bytes=await imageExports.read(decodeURIComponent(route.slice('/api/images/'.length)));res.setHeader('Content-Type','image/png');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);return true;}
   if(route.startsWith('/api/shot-images/')&&req.method==='GET'){
    const parts=route.slice('/api/shot-images/'.length).split('/');if(parts.length!==2)throw Error('镜头图片路径无效');
    const item=await shotStore.get({projectId:decodeURIComponent(parts[0]),id:parts[1].replace(/\.png$/,'')});
    if(!item.thumbnail){res.statusCode=404;res.end('镜头尚未生成预览');return true;}res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','no-store');res.end(pngBytes(item.thumbnail));return true;
   }
   if(route.startsWith('/api/hand-repair/files/')&&req.method==='GET'){const parts=route.slice('/api/hand-repair/files/'.length).split('/');if(parts.length!==2)throw Error('修手资料名称无效');const file=await readHandRepairFile(path('local-data/hand-repair'),parts[0],decodeURIComponent(parts[1]));res.setHeader('Content-Type',file.type);res.setHeader('X-Content-Type-Options','nosniff');res.end(file.bytes);return true;}
   if(route.startsWith('/api/reference-pack/files/')&&req.method==='GET'){const parts=route.slice('/api/reference-pack/files/'.length).split('/');if(parts.length!==2)throw Error('参考包路径无效');const file=await readReferenceFile(referenceDirectory,parts[0],decodeURIComponent(parts[1]));res.setHeader('Content-Type',file.type);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");res.end(file.bytes);return true;}
   if(req.headers['x-workbench-token']!==token)throw Object.assign(Error('本地连接已失效，请刷新页面'),{code:'CONNECTION_EXPIRED'});
   if(route==='/api/reference-pack/export'&&req.method==='POST'){const request=await body(req),p=queue.readState().project;if(!p)throw Error('尚无可导出的现场');await checkFiles(p);reply(res,200,await saveReferencePackage({directory:referenceDirectory,readProject:()=>queue.readState().project,request}));return true;}
   if(route==='/api/shots'&&req.method==='GET'){reply(res,200,await shotStore.list(url.searchParams.get('projectId')||queue.readState().project?.projectId));return true;}
   if(route.startsWith('/api/shots/')&&req.method==='POST'){
    const action=route.slice('/api/shots/'.length),methods={save:'save',import:'import',open:'prepareOpen',item:'get',reorder:'reorder',thumbnail:'setThumbnail'};
    if(!Object.hasOwn(methods,action))throw Error('没有这个镜头操作');reply(res,200,await shotStore[methods[action]](await body(req)));return true;
   }
   if(route==='/api/hand-repair/export'&&req.method==='POST'){const request=await body(req);reply(res,200,await saveHandRepairPackage({directory:path('local-data/hand-repair'),readProject:()=>queue.readState().project,request}));return true;}
   if(route==='/api/combinations'&&req.method==='GET'){reply(res,200,await combinationStore.list());return true;}
   if(route==='/api/combinations/open'&&req.method==='POST'){reply(res,200,await combinationStore.get((await body(req)).id));return true;}
   if(route==='/api/combinations/save'&&req.method==='POST'){const b=await body(req),item=await saveCurrentCombination({store:combinationStore,readProject:()=>queue.readState().project,verifyProject:checkFiles,request:b});reply(res,200,{id:item.id,name:item.name,detachedLinks:item.detachedLinks});return true;}
   if(route==='/api/poses'&&req.method==='GET'){reply(res,200,await poseStore.list());return true;}
   if(route==='/api/lights'&&req.method==='GET'){reply(res,200,await lightingStore.list());return true;}
   if(route==='/api/cameras'&&req.method==='GET'){reply(res,200,await cameraStore.list());return true;}
   if(route==='/api/cameras/open'&&req.method==='POST'){const b=await body(req);reply(res,200,await cameraStore.get(b.id));return true;}
   if(route==='/api/cameras/save'&&req.method==='POST'){const b=await body(req),item=await saveCurrentCamera({store:cameraStore,readProject:()=>queue.readState().project,verifyProject:checkFiles,request:{projectId:b.projectId,expectedRevision:b.expectedRevision,name:b.name}});reply(res,200,{id:item.id,name:item.name});return true;}
   if(route==='/api/lights/open'&&req.method==='POST'){const b=await body(req);reply(res,200,await lightingStore.get(b.id));return true;}
   if(route==='/api/lights/save'&&req.method==='POST'){const b=await body(req),project=queue.readState().project;if(!project)throw Error('尚无可收藏的布光');await checkFiles(project);const item=await lightingStore.save({project,expectedRevision:b.expectedRevision,name:b.name});reply(res,200,{id:item.id,name:item.name});return true;}
   if(route==='/api/poses/open'&&req.method==='POST'){const b=await body(req);reply(res,200,await poseStore.get(b.id));return true;}
   if(route==='/api/poses/save'&&req.method==='POST'){const b=await body(req),project=queue.readState().project;if(!project)throw Error('尚无可收藏的姿势');await checkFiles(project);const item=await poseStore.save({project:actorProject(project,b.actorId),expectedRevision:b.expectedRevision,name:b.name,part:b.part,thumbnail:b.thumbnail});reply(res,200,{id:item.id,name:item.name,part:item.part});return true;}
   if(route==='/api/library-previews'&&req.method==='POST'){const b=await body(req),asset=catalog.find(a=>a.id===b.id&&a.sha256===b.assetSha256);if(!asset||!asset.thumbnail?.startsWith('/api/library-images/')||b.view&&!['front','side','back'].includes(b.view))throw Error('预览动作版本无效');const bytes=pngBytes(b.image),url=b.view&&b.view!=='front'?asset.thumbnail.replace(/\.png$/,'-'+b.view+'.png'):asset.thumbnail;await mkdir(path('local-data/library-previews'),{recursive:true});await writeFile(path('local-data/library-previews',basename(url)),bytes);reply(res,200,{url});return true;}
   if(route==='/api/commands'&&req.method==='POST'){reply(res,202,queue.enqueue(await body(req)));return true;}
   if(route.startsWith('/api/commands/')&&req.method==='GET'){const r=queue.get(decodeURIComponent(route.slice(14)));reply(res,r?200:404,r||{code:'NOT_FOUND',message:'动作未找到'});return true;}
   if(route==='/api/editor/claim'&&req.method==='POST'){const b=await body(req);reply(res,200,queue.claim(b.editorId,b.project));return true;}
   if(route==='/api/editor/heartbeat'&&req.method==='POST'){reply(res,200,queue.heartbeat((await body(req)).editorId));return true;}
   if(route==='/api/editor/release'&&req.method==='POST'){reply(res,200,queue.release((await body(req)).editorId));return true;}
   if(route==='/api/editor/next'&&req.method==='GET'){reply(res,200,queue.next(url.searchParams.get('editorId')));return true;}
   if(route==='/api/editor/result'&&req.method==='POST'){const b=await body(req),r=queue.complete(b.editorId,b.result,b.project);if(r.status==='applied')await saveProject(path(runtime,'session.pose.json'),b.project);reply(res,200,r);return true;}
   if(route==='/api/projects'&&req.method==='GET'){await mkdir(path('local-data/projects'),{recursive:true});const files=await readdir(path('local-data/projects'));reply(res,200,await Promise.all(files.filter(f=>f.endsWith('.pose.json')).map(async file=>{let label='';try{const p=await readProject(path('local-data/projects',file));label=`${1+(p.scene?.actors.length||0)} 人 · ${p.scene?.objects.length||0} 件物品`;}catch{}return{id:file.slice(0,-10),name:file,label};})));return true;}
   if(route==='/api/projects/save'&&req.method==='POST'){await body(req);const p=queue.readState().project;if(!p)throw Error('尚无已应用项目');await checkFiles(p);const file=path('local-data/projects',safeId(p.projectId)+'.pose.json');await saveProject(file,p);reply(res,200,{saved:true,file,revision:p.revision});return true;}
   if(route==='/api/projects/open'&&req.method==='POST'){const b=await body(req),p=await readProject(path('local-data/projects',safeId(b.id)+'.pose.json'));await checkFiles(p);reply(res,200,{project:p});return true;}
   if(route==='/api/thumbnails'&&req.method==='POST'){const b=await body(req);if(!/^(right|left)-(number-(10|[1-9])|relaxed|open|fist|v-sign|point)$/.test(b.name)||!b.image?.startsWith('data:image/png;base64,'))throw Error('缩略图无效');const folder=b.collection==='v2'?'local-data/acceptance-v2/gestures':'local-data/acceptance/gestures';await mkdir(path(folder),{recursive:true});const file=path(folder,b.name+'.png');await writeFile(file,Buffer.from(b.image.slice(22),'base64'));reply(res,200,{file});return true;}
   if(route==='/api/diagnostics'&&req.method==='POST'){const b=await body(req);if(b.name!=='rig-render-consistency')throw Error('检查名称无效');await mkdir(path('local-data/acceptance'),{recursive:true});await writeFile(path('local-data/acceptance/rig-render-consistency.json'),JSON.stringify(b.value,null,2));reply(res,200,{saved:true});return true;}
   if(route==='/api/export'&&req.method==='POST'){reply(res,200,await imageExports.save((await body(req)).image));return true;}
   if(route==='/api/exports/open'&&req.method==='POST'){await body(req);reply(res,200,await imageExports.openDirectory());return true;}
   reply(res,404,{code:'NOT_FOUND',message:'没有这个本地功能'});return true;
  }catch(e){reply(res,400,{code:e.code||'REQUEST_FAILED',message:e.message});return true;}
 };
}
