import {resolveStaticPath} from './static-path.js';
import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {createApi} from './http.js';
export async function startLocalServer({root,port=4173,exportDirectory}){
 await stat(resolve(root,'dist/index.html'));let api=null;
 const server=createServer(async(req,res)=>{
  if(!api){res.statusCode=503;res.end('工作台正在启动');return;}
  if(await api(req,res))return;
  try{const url=new URL(req.url,'http://127.0.0.1'),name=decodeURIComponent(url.pathname),file=resolveStaticPath(root,name);const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end('页面不存在');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 try{api=await createApi({root,port:server.address().port,exportDirectory});return server;}catch(e){await new Promise(r=>server.close(r));throw e;}
}
