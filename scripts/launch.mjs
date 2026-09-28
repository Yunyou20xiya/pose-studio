import {mkdir,copyFile,writeFile,access,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startLocalServer} from '../server/start.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const data=join(root,'local-data'),exportsFolder=join(root,'导出');
const requested=Number(process.env.POSE_PORT||4173);
const openBrowser=url=>{
 const callback=error=>{if(error)console.log('请手动在浏览器打开：'+url);};
 if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},callback);
 else if(process.platform==='darwin')execFile('/usr/bin/open',[url],callback);
 else execFile('xdg-open',[url],callback);
};
async function seed(port){
 const directory=join(data,port===4173?'runtime':'runtime-'+port);await mkdir(directory,{recursive:true});
 try{await copyFile(join(root,'examples/starter.pose.json'),join(directory,'session.pose.json'),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
}
try{
 if(!Number.isInteger(requested)||requested<1024||requested>65525)throw Error('端口需要是 1024 到 65525 之间的整数。');
 await access(join(root,'dist/index.html'));await mkdir(exportsFolder,{recursive:true});
 const model=JSON.parse(await readFile(join(root,'assets/model-source-a.json'),'utf8'));
 if(createHash('sha256').update(await readFile(join(data,'models',model.file))).digest('hex')!==model.sha256)throw Error('示例角色文件不完整，请重新解压整个压缩包。');
 let server,port;
 for(let candidate=requested;candidate<requested+10;candidate++){
  try{await seed(candidate);server=await startLocalServer({root,port:candidate,exportDirectory:exportsFolder});port=candidate;break;}
  catch(error){if(error.code!=='EADDRINUSE')throw error;}
 }
 if(!server)throw Error('可用端口已被占用，请先关闭重复打开的启动窗口。');
 const url='http://127.0.0.1:'+port+'/';
 await writeFile(join(data,'portable-connection.json'),JSON.stringify({url,port},null,2));
 console.log('\n角色工作台 · Windows 便携版 v0.16.0\n');
 console.log('工作台已启动：'+url);
 console.log('导出的图片：'+exportsFolder);
 console.log('请保留这个窗口。关闭窗口或按 Ctrl+C 停止工作台。');
 console.log('使用完成前请点击页面里的“保存项目”或保存镜头卡片。\n');
 if(process.env.POSE_NO_OPEN!=='1')openBrowser(url);
 const stop=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1200).unref();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(error){console.error('\n启动未完成：'+error.message+'\n请重新解压完整文件夹，并查看“使用说明.html”。');process.exitCode=1;}
