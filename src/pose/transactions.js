import {clone,issue,same,stableStringify,checkProject} from './state.js';
export function createTransactions(initial,validator){
  let current=clone(initial);const undo=[],redo=[],results=new Map();
  const inferred={bones:Object.fromEntries(Object.keys(initial.snapshot.rotations).map(n=>[n,{}])),capabilities:{expressions:Object.keys(initial.snapshot.expressions)}};
  const validate=validator||((p)=>checkProject(p,inferred));
  const read=()=>clone(current);
  function run(command,produce){
    const c=command;const result=(status,issues=[],changedBones=[])=>({id:c?.id||'',status,projectId:current.projectId,revision:current.revision,issues,changedBones});
    if(!c||typeof c.id!=='string'||!c.id||c.id.length>200)return result('rejected',[issue('INVALID_COMMAND','动作指令缺少有效标识')]);
    const signature=stableStringify(c),prior=results.get(c.id);
    if(prior)return prior.signature===signature?clone(prior.result):result('rejected',[issue('ID_REUSED','同一动作标识不能表示不同内容')]);
    const finish=r=>{results.set(c.id,{signature,result:clone(r)});if(results.size>1000)results.delete(results.keys().next().value);return r;};
    if(c.projectId!==current.projectId||c.expectedRevision!==current.revision)return finish(result('conflict',[issue('STALE_REVISION','姿势已改变，请基于当前状态重试')]));
    if(!c.scope||!Array.isArray(c.scope.bones)||!Array.isArray(c.scope.expressions)||!Array.isArray(c.operations)||!c.operations.length||!Array.isArray(c.overwriteManual)||c.overwriteManual.some(b=>!c.scope.bones.includes(b)))return finish(result('rejected',[issue('INVALID_COMMAND','动作范围无效')]));
    const history=c.operations.length===1&&['undo','redo'].includes(c.operations[0].kind)?c.operations[0].kind:null;
    const restore=c.operations.length===1&&c.operations[0].kind==='restore';
    const source=history==='undo'?undo:redo;
    if(history&&!source.length)return finish(result('rejected',[issue('HISTORY_EMPTY',history==='undo'?'没有可撤销的动作':'没有可重做的动作')]));
    try{
      let base=history?clone(source.at(-1)):clone(current);
      const outcome=produce(base);const candidate=outcome.project;
      const issues=[...(outcome.issues||[]),...validate(candidate)];
      if(issues.some(i=>i.severity==='error'))return finish(result(issues.some(i=>i.code.includes('LOCK')||i.code.includes('CONTACT'))?'conflict':'rejected',issues));
      const changed=Object.keys(current.snapshot.rotations).filter(n=>!same(current.snapshot.rotations[n],candidate.snapshot.rotations[n]));
      if(!history&&!restore&&!(c.scope.scene&&c.operations.length===1&&c.operations[0].kind==='scene')){
        const s=c.scope;
        if(changed.some(n=>!s.bones.includes(n)))return finish(result('rejected',[issue('OUTSIDE_SCOPE','修改超出了指定身体部位')]));
        if(Object.keys(current.snapshot.expressions).some(n=>!s.expressions.includes(n)&&!same(current.snapshot.expressions[n],candidate.snapshot.expressions[n])))return finish(result('rejected',[issue('OUTSIDE_SCOPE','修改了未指定的表情')]));
        for(const key of['gaze','rootPosition','rootRotation'])if(!s[key.startsWith('root')?'root':key]&&!same(current.snapshot[key],candidate.snapshot[key]))return finish(result('rejected',[issue('OUTSIDE_SCOPE','修改了未指定的姿态属性')]));
        for(const key of['stage','camera','lighting','scene'])if(!s[key]&&!same(current[key],candidate[key]))return finish(result('rejected',[issue('OUTSIDE_SCOPE','修改了未指定的场景属性')]));
        for(const key of['model','profile','projectId','schemaVersion'])if(!same(current[key],candidate[key]))return finish(result('rejected',[issue('OUTSIDE_SCOPE','普通动作不能替换项目或模型')]));
        const lockEdit=c.operations.some(o=>o.kind==='set-locks');
        if(!lockEdit&&!same(current.snapshot.locks,candidate.snapshot.locks))return finish(result('rejected',[issue('LOCK_EDIT_REQUIRED','请使用明确的锁定操作')]));
        if(lockEdit){for(const l of [...current.snapshot.locks,...candidate.snapshot.locks])if(!s.bones.includes(l.bone)&&!same(current.snapshot.locks.filter(x=>x.bone===l.bone),candidate.snapshot.locks.filter(x=>x.bone===l.bone)))return finish(result('rejected',[issue('OUTSIDE_SCOPE','锁定修改超出了指定部位')]));}
        for(const lock of current.snapshot.locks){if(lock.kind==='joint'&&changed.includes(lock.bone)&&candidate.snapshot.locks.some(l=>l.kind==='joint'&&l.bone===lock.bone))return finish(result('conflict',[issue('JOINT_LOCKED','这个关节已锁定',[lock.bone])]));}
        for(const contact of [...current.snapshot.contacts,...candidate.snapshot.contacts])if(!s.bones.includes(contact.bone)&&!same(current.snapshot.contacts.filter(x=>x.bone===contact.bone),candidate.snapshot.contacts.filter(x=>x.bone===contact.bone)))return finish(result('rejected',[issue('OUTSIDE_SCOPE','接触修改超出了指定部位')]));
      }
      if(history){source.pop();(history==='undo'?redo:undo).push(clone(current));}else{undo.push(clone(current));if(undo.length>100)undo.shift();redo.length=0;}
      const revision=current.revision+1;current=clone(candidate);current.revision=revision;
      return finish(result('applied',issues,changed));
    }catch(e){return finish(result('rejected',[issue('OPERATION_FAILED',e.message||'动作无法应用')]));}
  }
  return{read,run};
}
