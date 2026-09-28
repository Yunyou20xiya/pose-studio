import {handTemplates} from '../src/pose/paired-hands.js';
import {readFile,writeFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {makeCommand,fullScope} from '../src/pose/state.js';
import {buildArrangementCommand,sceneSummary,expandArrangement} from '../src/scene/arrangements.js';
import {combinationOperation} from '../src/scene/combinations.js';
import {buildPoseCommand} from '../src/assets/pose-library.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try{
 if(!process.env.POSE_URL&&!process.env.POSE_PORT){try{const info=JSON.parse(await readFile(resolve(root,'local-data/portable-connection.json'),'utf8'));process.env.POSE_PORT=String(info.port);}catch{}}
 let connection;
 if(process.env.POSE_URL){const url=new URL(process.env.POSE_URL);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.search||url.hash)throw Error('请使用本机工作台地址');const boot=await(await fetch(url.origin+'/api/bootstrap')).json();if(!boot.token)throw Error('工作台连接未准备好');connection={url:url.origin,token:boot.token};}
 else connection=JSON.parse(await readFile(resolve(root,process.env.POSE_PORT&&process.env.POSE_PORT!=='4173'?'local-data/runtime-'+process.env.POSE_PORT+'/connection.json':'local-data/runtime/connection.json'),'utf8'));
 const request=async(path,value)=>{const r=await fetch(connection.url+path,{method:value?'POST':'GET',headers:{'Content-Type':'application/json','x-workbench-token':connection.token},...(value?{body:JSON.stringify(value)}:{})});const data=await r.json();if(!r.ok)throw Error(data.message);return data;};
 const args=process.argv.slice(2);if(args[0]==='--state'){console.log(JSON.stringify(await request('/api/state'),null,2));process.exit(0);}
 if(args[0]==='--scene'){const state=await request('/api/state');if(!state.project)throw Error('请先打开角色工作台');console.log(JSON.stringify(sceneSummary(state.project),null,2));process.exit(0);}
 if(args[0]==='--catalog'){console.log(JSON.stringify((await request('/api/bootstrap')).catalog,null,2));process.exit(0);}
 if(args[0]==='--poses'){console.log(JSON.stringify(await request('/api/poses'),null,2));process.exit(0);}
 if(args[0]==='--hand-interactions'){console.log(JSON.stringify(handTemplates,null,2));process.exit(0);}
 if(args[0]==='--combinations'){console.log(JSON.stringify(await request('/api/combinations'),null,2));process.exit(0);}
 if(!['--file','--apply-pose','--apply-combination','--arrange'].includes(args[0])||!args[1])throw Error('用法：--file 指令.json / --apply-pose 收藏标识 / --state / --catalog / --poses / --scene / --arrange 布置.json / --combinations / --apply-combination 收藏标识 [--x 米 --z 米 --yaw 度]');
 let command;
 if(args[0]==='--arrange'){const state=await request('/api/state');if(!state.project)throw Error('请先打开角色工作台');const plan=await expandArrangement(JSON.parse(await readFile(resolve(args[1]),'utf8')),id=>request('/api/combinations/open',{id}));command=buildArrangementCommand(state.project,plan);}
 else if(args[0]==='--apply-combination'){const state=await request('/api/state'),item=await request('/api/combinations/open',{id:args[1]});if(!state.project)throw Error('请先打开角色工作台');const op=combinationOperation(state.project,item.combination);for(const [flag,key]of [['--x',0],['--z',2],['--yaw','yaw']]){const i=args.indexOf(flag);if(i<0)continue;const n=Number(args[i+1]);if(!args[i+1]||!Number.isFinite(n))throw Error('请为 '+flag+' 填写数值');if(key==='yaw')op.yaw=n;else op.position[key]=n;}command=makeCommand(state.project,[op],{...fullScope(state.project),scene:true},'dialogue');}
 else if(args[0]==='--apply-pose'){const state=await request('/api/state'),bootstrap=await request('/api/bootstrap'),item=await request('/api/poses/open',{id:args[1]});if(!state.project)throw Error('请先打开角色工作台');command=buildPoseCommand(state.project,item,bootstrap.profile,{preserveHands:!args.includes('--include-hands'),preserveFace:!args.includes('--include-face'),preserveManual:!args.includes('--replace-manual')});command.source='dialogue';}
 else{const file=resolve(args[1]),input=JSON.parse(await readFile(file,'utf8'));command=input;
 if(!input.id||!input.projectId||input.expectedRevision===undefined){const state=await request('/api/state');if(!state.project)throw Error('请先打开角色工作台');command=makeCommand(state.project,input.operations,input.scope,'dialogue',input.overwriteManual||[]);if(input.id)command.id=input.id;await writeFile(file,JSON.stringify(command,null,2)+'\n');}
 }
 let result=await request('/api/commands',command);const deadline=Date.now()+30000;
 while(['queued','running'].includes(result.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,300));result=await request('/api/commands/'+encodeURIComponent(command.id));}
 console.log(JSON.stringify(result,null,2));if(result.status!=='applied'){if(['queued','running'].includes(result.status))console.error('动作仍在等待：请确认编辑器在线，未宣称已应用。');process.exitCode=1;}
}catch(e){console.error(e.message);process.exitCode=1;}
