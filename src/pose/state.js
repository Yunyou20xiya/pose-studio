import {lightingIssues,lightTarget} from '../lighting/settings.js';
import {captureCamera} from '../camera/bookmarks.js';
export const clone = value => structuredClone(value);
export const issue = (code,message,bones=[],severity='error')=>({code,message,bones,severity});
export function stableStringify(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export const same=(a,b)=>stableStringify(a)===stableStringify(b);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const quat=v=>vector(v,4)&&Math.abs(Math.hypot(...v)-1)<.001;
export function checkProject(p,profile,{skipLightingTarget=false}={}){
  const issues=[];const bad=m=>issues.push(issue('INVALID_PROJECT',m));
  if(!object(p)||p.schemaVersion!==1)return[issue('FORMAT_VERSION','项目格式版本不受支持')];
  const top=['schemaVersion','projectId','revision','model','profile','snapshot','layers','stage','camera','lighting','scene'];
  if(Object.keys(p).some(k=>!top.includes(k)))bad('项目含有未支持字段');
  if(typeof p.projectId!=='string'||!p.projectId||!Number.isSafeInteger(p.revision)||p.revision<0)bad('项目标识或版本无效');
  for(const name of['model','profile']){const r=p[name];if(!object(r)||typeof r.id!=='string'||!r.id||!/^[a-f0-9]{64}$/i.test(r.sha256||'')||typeof r.relativePath!=='string'||r.relativePath.includes('..')||r.relativePath.startsWith('/'))bad(name+' 引用无效');}
  const s=p.snapshot;if(!object(s))return [...issues,issue('INVALID_PROJECT','缺少姿态')];
  if(!object(s.rotations))bad('缺少骨骼旋转');else{
    for(const[n,q]of Object.entries(s.rotations)){if(!profile.bones[n])bad('未知骨骼 '+n);if(!quat(q))bad('无效骨骼旋转 '+n);}
    for(const name of Object.keys(profile.bones))if(!s.rotations[name])bad('缺少骨骼 '+name);
  }
  if(!vector(s.rootPosition,3)||s.rootPosition.some(v=>Math.abs(v)>1000)||!quat(s.rootRotation))bad('角色位置或朝向无效');
  const expressions=profile.capabilities?.expressions||[];
  if(!object(s.expressions))bad('表情无效');else for(const[n,w]of Object.entries(s.expressions))if(!expressions.includes(n)||!Number.isFinite(w)||w<0||w>1)bad('表情通道或权重无效 '+n);
  if(!object(s.gaze)||!vector(s.gaze.target,3)||!Number.isFinite(s.gaze.follow)||s.gaze.follow<0||s.gaze.follow>1||!['point','camera'].includes(s.gaze.mode))bad('视线设置无效');
  if(!Array.isArray(s.locks))bad('锁定无效');else for(const l of s.locks){if(!object(l)||!profile.bones[l.bone]||!['joint','anchor'].includes(l.kind)||!quat(l.rotation)||(l.kind==='anchor'&&!vector(l.position,3)))bad('锁定关节无效');}
  if(!Array.isArray(s.contacts))bad('接触无效');else {
    const supported=new Set();
    for(const c of s.contacts){
      if(c?.kind==='hand-support'){
        const side=c.bone==='leftHand'?'left':c.bone==='rightHand'?'right':null;
        const validTarget=['face','backHead'].includes(c.preset)?c.objectId==='body'&&c.targetBone==='head':c.preset==='thigh'?c.objectId==='body'&&c.targetBone===side+'UpperLeg':c.preset==='chair'&&c.objectId==='chair'&&c.targetBone===undefined;
        if(!side||!validTarget||c.mode!=='required'||!vector(c.localPoint,3)||!vector(c.targetPoint,3)||[...(c.localPoint||[]),...(c.targetPoint||[])].some(x=>Math.abs(x)>2)||!quat(c.relativeRotation)||supported.has(c.bone))bad('手部接触记录无效');
        supported.add(c.bone);
      }else if(!object(c)||c.kind!==undefined||!profile.bones[c.bone]||!['floor','chair'].includes(c.objectId)||!['required','guide'].includes(c.mode)||!vector(c.localPoint,3)||!vector(c.worldPoint,3))bad('接触点无效');
    }
  }
  if(!Array.isArray(p.layers))bad('动作来源无效');else for(const l of p.layers){if(!object(l)||typeof l.id!=='string'||!Array.isArray(l.bones)||l.bones.some(b=>!profile.bones[b])||!Array.isArray(l.expressionNames)||l.expressionNames.some(e=>!expressions.includes(e))||typeof l.manual!=='boolean')bad('动作分层无效');}
  const chair=p.stage?.chair;if(!Number.isFinite(p.stage?.floorY)||!object(chair)||!vector(chair.position,3)||!quat(chair.rotation)||!['seatWidth','seatHeight','seatDepth'].every(k=>Number.isFinite(chair[k])&&chair[k]>.01&&chair[k]<10))bad('地面或椅子无效');
  try{captureCamera(p.camera);}catch(e){bad(e.message);}
  for(const message of lightingIssues(p.lighting))bad(message);
  if(!skipLightingTarget&&!issues.length&&p.lighting.keyEnabled!==false&&p.lighting.keyTargetMode&&p.lighting.keyTargetMode!=='point'){
    const target=lightTarget(p,profile);if(Math.hypot(...p.lighting.keyPosition.map((n,i)=>n-target[i]))<.05)bad('主光与照射点太近，请拉开一点');
  }
  return issues;
}
export function makeProject(model,profile){
  return{schemaVersion:1,projectId:crypto.randomUUID(),revision:0,model:{id:model.id,sha256:model.sha256,relativePath:'models/'+model.file},profile:clone(profile.assetRef),snapshot:{rotations:Object.fromEntries(Object.keys(profile.bones).map(n=>[n,[0,0,0,1]])),rootPosition:[0,0,0],rootRotation:[0,0,0,1],expressions:Object.fromEntries(profile.capabilities.expressions.map(n=>[n,0])),gaze:{target:[0,profile.height*.88,4],follow:0,mode:'point'},locks:[],contacts:[]},layers:[],stage:{floorY:0,chair:{position:[0,0,0],rotation:[0,0,0,1],seatWidth:.44,seatDepth:.4,seatHeight:.48}},camera:{position:[0,1.15,3.6],target:[0,.85,0],fov:35,width:1600,height:1200},lighting:{keyPosition:[-2,4,4],keyIntensity:2.6,fillIntensity:2,background:'#e7e9e2'}};
}
export const fullScope=p=>({bones:Object.keys(p.snapshot.rotations),expressions:Object.keys(p.snapshot.expressions),root:true,gaze:true,stage:true,camera:true,lighting:true});
export function makeCommand(project,operations,scope,source='slider',overwriteManual=scope.bones){return{id:crypto.randomUUID(),projectId:project.projectId,expectedRevision:project.revision,source,scope,overwriteManual,operations,...(project._actorId?{actorId:project._actorId}:{})};}
