import {readFile,open,rename,copyFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {syncDirectory} from './directory-sync.js';
import {issue} from '../src/pose/state.js';
const saves=new Map();
function finiteTree(v){if(typeof v==='number'&&!Number.isFinite(v))throw Error('项目含有非法数字');if(v&&typeof v==='object')Object.values(v).forEach(finiteTree);}
export async function saveProject(file,project){
 finiteTree(project);if(project.schemaVersion!==1||!project.snapshot?.rotations||!project.camera||!project.model)throw Error('项目格式不完整');
 const text=JSON.stringify(project,null,2)+'\n',previous=saves.get(file)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{await mkdir(dirname(file),{recursive:true});const temporary=file+'.'+crypto.randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
  try{await copyFile(file,file+'.bak');}catch(e){if(e.code!=='ENOENT')throw e;}await rename(temporary,file);
  await syncDirectory(dirname(file));
 });saves.set(file,task);try{await task;}finally{if(saves.get(file)===task)saves.delete(file);}
}
export async function readProject(file){const p=JSON.parse(await readFile(file,'utf8'));finiteTree(p);if(p.schemaVersion!==1)throw Error('项目格式版本不受支持');return p;}
export function verifyReferences(p,catalog){
 if(p.schemaVersion!==1)return[issue('FORMAT_VERSION','项目格式版本不受支持')];const issues=[];
 for(const kind of ['model','profile']){const ref=p[kind],registered=ref&&catalog[ref.id];if(!registered||registered.sha256!==ref.sha256||registered.relativePath!==ref.relativePath)issues.push(issue('REFERENCE_MISMATCH',`${kind==='model'?'角色':'关节配置'}文件内容或版本与项目记录不同`));}return issues;
}
