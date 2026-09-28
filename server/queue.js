import {clone,same,stableStringify} from '../src/pose/state.js';
export function createQueue({now=()=>Date.now(),initial=null,validate=()=>[]}={}){
 let project=clone(initial),owner=null,expires=0;const rows=new Map();
 function expire(){if(owner&&expires<=now()){owner=null;for(const row of rows.values())if(row.status==='running')row.status='queued';}}
 function requireOwner(id){expire();if(!owner||owner!==id)throw Object.assign(Error('编辑会话已失效，请重新连接'),{code:'EDITOR_OFFLINE'});}
 const readState=()=>{expire();return{project:clone(project),online:!!owner,editorId:owner,expiresAt:expires};};
 return{readState,claim(id,p){expire();if(typeof id!=='string'||!id||id.length>200)throw Error('编辑窗口标识无效');if(owner&&owner!==id)return{granted:false,...readState()};if(!project){const errors=validate(p).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('；'));project=clone(p);}owner=id;expires=now()+10000;return{granted:true,...readState()};},heartbeat(id){requireOwner(id);expires=now()+10000;return readState();},release(id){requireOwner(id);owner=null;for(const row of rows.values())if(row.status==='running')row.status='queued';return{released:true};},enqueue(c){
  if(!c||typeof c.id!=='string'||!c.id||c.id.length>200||!Number.isSafeInteger(c.expectedRevision)||!Array.isArray(c.operations)||!c.operations.length)throw Object.assign(Error('动作指令格式无效'),{code:'INVALID_COMMAND'});
  const signature=stableStringify(c),prior=rows.get(c.id);if(prior){if(prior.signature!==signature)throw Object.assign(Error('动作标识已用于另一条指令'),{code:'ID_REUSED'});return clone(prior.result||{id:c.id,status:prior.status});}
  if(rows.size>2000)throw Error('本次会话动作队列已满，请保存后重启');rows.set(c.id,{command:clone(c),signature,status:'queued'});return{id:c.id,status:'queued'};
 },next(id){requireOwner(id);if([...rows.values()].some(r=>r.status==='running'))return null;const row=[...rows.values()].find(r=>r.status==='queued');if(!row)return null;row.status='running';return clone(row.command);},complete(id,result,p){
  requireOwner(id);const row=rows.get(result?.id);if(!row)throw Error('找不到这条待处理动作');if(row.result){if(same(row.result,result))return clone(row.result);throw Error('动作结果不可重新发布');}if(row.status!=='running'||!['applied','conflict','rejected'].includes(result.status))throw Error('动作尚未运行或结果状态无效');
  if(result.projectId!==p?.projectId||result.revision!==p?.revision)throw Error('动作结果和实际项目版本不一致');
  const errors=validate(p).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('；'));
  if(result.status==='applied'){
   if(row.command.expectedRevision!==project.revision||row.command.projectId!==project.projectId||p.revision!==project.revision+1)throw Error('应用结果基于过期版本');
   if(!row.command.operations.some(o=>o.kind==='restore')&&p.projectId!==project.projectId)throw Error('普通操作不能切换项目');
   project=clone(p);
  }else if(!same(project,p))throw Error('未成功动作不能发布新项目');
  row.status=result.status;row.result=clone(result);return clone(result);
 },get(id){const r=rows.get(id);return r?clone(r.result||{id,status:r.status}):null;}};
}
