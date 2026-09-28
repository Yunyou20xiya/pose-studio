import {defineConfig} from 'vite';import {createApi} from './server/http.js';
export default defineConfig({server:{host:'127.0.0.1',port:4173,strictPort:true},plugins:[{name:'pose-local-api',configureServer(server){
 let ready;const api=new Promise((resolve,reject)=>{ready=()=>createApi({root:process.cwd(),port:4173}).then(resolve,reject);});
 server.httpServer.once('listening',ready);
 server.middlewares.use(async(req,res,next)=>{try{if(!await(await api)(req,res))next();}catch(e){res.statusCode=500;res.end(e.message);}});
}}]});
