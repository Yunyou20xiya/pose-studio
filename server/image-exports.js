import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,basename,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
export const defaultExportDirectory=()=>process.env.POSE_EXPORT_DIR||join(homedir(),'Pictures','角色工作台','导出');
async function reveal(directory){
 const executable=process.platform==='darwin'?'/usr/bin/open':process.platform==='win32'?'explorer.exe':'xdg-open';
 await execute(executable,[directory]);
}
export function imageBytes(image){
 if(typeof image!=='string'||!image.startsWith('data:image/png;base64,')||image.length>44*1024*1024)throw Error('导图内容无效或过大');
 const bytes=Buffer.from(image.slice(22),'base64');
 if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||[16,20].some(i=>bytes.readUInt32BE(i)<1||bytes.readUInt32BE(i)>8192))throw Error('不是有效尺寸的 PNG');
 return bytes;
}
export function createImageExportStore({directory=defaultExportDirectory(),legacyDirectory,openFolder=reveal}){
 if(typeof directory!=='string'||!isAbsolute(directory))throw Error('导出文件夹必须是完整路径');
 directory=resolve(directory);
 const relative=directory.startsWith(homedir()+'/')?directory.slice(homedir().length+1):directory;
 const displayDirectory=relative.replace(/^Pictures\//,'图片/').replace(/^Desktop\//,'桌面/').replaceAll('/',' / ');
 return{
  async save(image){
   const bytes=imageBytes(image),name=`pose-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.png`,file=join(directory,name);
   await mkdir(directory,{recursive:true});await writeFile(file,bytes,{flag:'wx'});
   return{name,file,directory,displayDirectory,url:'/api/images/'+name};
  },
  async read(name){
   if(typeof name!=='string'||name!==basename(name)||name.length>200||!/^pose-[-a-zA-Z0-9_.]+\.png$/.test(name))throw Error('图片名称无效');
   try{return await readFile(join(directory,name));}
   catch(e){if(e.code!=='ENOENT'||!legacyDirectory)throw e;return readFile(join(legacyDirectory,name));}
  },
  async openDirectory(){await mkdir(directory,{recursive:true});await openFolder(directory);return{directory,displayDirectory};},
 };
}
