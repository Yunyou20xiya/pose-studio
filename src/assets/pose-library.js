import {clone,same,makeCommand,makeProject,checkProject} from '../pose/state.js';
import {isHandSupport,supportArm,withHandSupportScope} from '../pose/hand-supports.js';

export const poseParts={full:'全身姿势',body:'身体（保留手型和表情）',bothArms:'双臂与掌心方向',rightHand:'右手手型',leftHand:'左手手型',head:'头颈、视线与表情',rightArm:'右臂与掌心方向',leftArm:'左臂与掌心方向'};
const finger=n=>/Thumb|Index|Middle|Ring|Little/.test(n);
const face=n=>['head','neck'].includes(n);
export function bonesForPart(part,profile){
 if(!poseParts[part])throw Error('请选择有效的保存部位');
 return Object.keys(profile.limits).filter(n=>part==='full'?true:part==='body'?!finger(n)&&!face(n):part==='bothArms'?/^(left|right)(Shoulder|UpperArm|LowerArm|Hand)$/.test(n):part==='head'?face(n):part.endsWith('Hand')?n.startsWith(part.slice(0,-4))&&finger(n):n.startsWith(part.slice(0,-3))&&/Shoulder|UpperArm|LowerArm|Hand/.test(n));
}
export function capturePose(project,{name,part},profile){
 name=typeof name==='string'?name.trim():'';
 if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(name))throw Error('姿势名称需要 1—60 个文字');
 const bones=bonesForPart(part,profile),snapshot=project.snapshot;
 const patch={rotations:Object.fromEntries(bones.map(n=>[n,clone(snapshot.rotations[n])]))};
 if(part==='full'||part==='head'){patch.expressions=clone(snapshot.expressions);patch.gaze=clone(snapshot.gaze);}
 if(part==='full'||part==='body'){patch.rootPosition=clone(snapshot.rootPosition);patch.rootRotation=clone(snapshot.rootRotation);patch.contacts=clone(snapshot.contacts);patch.stage=clone(project.stage);}
 if(part==='bothArms')patch.contacts=clone(snapshot.contacts.filter(isHandSupport));
 return{schemaVersion:1,id:crypto.randomUUID(),name,part,createdAt:new Date().toISOString(),model:clone(project.model),profile:clone(project.profile),patch,sources:[...new Set(project.layers.filter(l=>l.bones.some(n=>bones.includes(n))||part==='head'&&l.expressionNames.length).map(l=>l.sourceAsset).filter(Boolean))]};
}
export function validateSavedPose(item,profile,refs){
 if(item?.schemaVersion!==1||typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(item.id))throw Error('收藏姿势格式或标识无效');
 const allowed=new Set(bonesForPart(item.part,profile));
 if(typeof item.name!=='string'||!item.name.trim()||item.name.length>60||/[\u0000-\u001f\u007f]/.test(item.name))throw Error('姿势名称无效');
 if(item.createdAt!==undefined&&(typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt))))throw Error('收藏时间无效');
 if(!same(item.model,refs.model))throw Error('收藏姿势的角色与当前角色不一致');
 if(!same(item.profile,refs.profile))throw Error('收藏姿势的关节配置与当前版本不一致');
 if(!item.patch||!item.patch.rotations||Array.isArray(item.patch.rotations)||Object.keys(item.patch.rotations).some(n=>!allowed.has(n)))throw Error('收藏姿势超出保存部位范围');
 const keys=['rotations',...(['full','body'].includes(item.part)?['rootPosition','rootRotation','contacts','stage']:[]),...(item.part==='bothArms'?['contacts']:[]),...(['full','head'].includes(item.part)?['expressions','gaze']:[])];
 if(item.part==='bothArms'&&item.patch.contacts!==undefined&&(!Array.isArray(item.patch.contacts)||item.patch.contacts.some(c=>!isHandSupport(c)||!allowed.has(c.bone))))throw Error('双臂姿势只能记录手部接触');
 if(Object.keys(item.patch).some(k=>!keys.includes(k)))throw Error('收藏姿势含有范围之外的属性');
 if(!Array.isArray(item.sources)||item.sources.some(x=>typeof x!=='string'))throw Error('收藏来源无效');
 const candidate=makeProject({id:item.model.id,sha256:item.model.sha256,file:item.model.relativePath.slice('models/'.length)},{...profile,assetRef:item.profile});
 for(const [k,v]of Object.entries(item.patch)){if(k==='stage')candidate.stage=clone(v);else if(k==='rotations'||k==='expressions')Object.assign(candidate.snapshot[k],clone(v));else candidate.snapshot[k]=clone(v);}
 const errors=checkProject(candidate,profile);if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
 return item;
}
export function scopeOfPatch(patch,project){
 return{bones:[...new Set([...Object.keys(patch.rotations||{}),...(patch.gaze?.follow>0?['head','neck']:[]),...('contacts'in patch?[...project.snapshot.contacts,...patch.contacts].map(c=>c.bone):[])])],expressions:Object.keys(patch.expressions||{}),root:'rootPosition'in patch||'rootRotation'in patch,gaze:'gaze'in patch,stage:'stage'in patch,camera:false,lighting:false};
}
export function buildPoseCommand(project,item,profile,{preserveHands=true,preserveFace=true,preserveManual=true}={}){
 validateSavedPose(item,profile,project);const value=clone(item.patch),global=['full','body'].includes(item.part);
 if(global&&preserveHands)for(const n of Object.keys(value.rotations))if(finger(n))delete value.rotations[n];
 if(global&&preserveFace){for(const n of ['head','neck'])delete value.rotations[n];delete value.expressions;delete value.gaze;}
 if(global){const incoming=new Set((value.contacts||[]).filter(isHandSupport).map(c=>c.bone));for(const c of project.snapshot.contacts.filter(isHandSupport))if(!incoming.has(c.bone))for(const n of supportArm(c.bone,profile))delete value.rotations[n];}
 // A saved pose contains resolved joints and a world-space gaze target.
 // Camera rebinding remains an explicit gaze action in the editor.
 if(value.contacts){const relevant=new Set(bonesForPart(item.part,profile));const incoming=new Set(value.contacts.filter(isHandSupport).map(c=>c.bone));value.contacts=[...project.snapshot.contacts.filter(c=>!relevant.has(c.bone)||global&&isHandSupport(c)&&!incoming.has(c.bone)),...value.contacts];}
 value.layers=[{id:item.id,sourceAsset:item.id,frame:null,bones:Object.keys(value.rotations),expressionNames:Object.keys(value.expressions||{}),manual:false}];
 const scope=scopeOfPatch(value,project);
 return withHandSupportScope(makeCommand(project,[{kind:'patch',value,...(value.gaze?{gazeMode:'restore'}:{})}],scope,'preset',global&&preserveManual?[]:scope.bones),project,profile,{overwriteLinkedManual:!global||!preserveManual});
}
