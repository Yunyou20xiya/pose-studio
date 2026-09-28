import {clone,fullScope,makeCommand,same,stableStringify} from '../pose/state.js';

export function shotSignature(project){
 const value=clone(project);delete value.revision;
 return stableStringify(value);
}
export function shotCommand(current,saved){
 if(current.projectId!==saved.projectId)throw Error('这个镜头属于另一个项目');
 for(const key of ['model','profile'])if(!same(current[key],saved[key]))throw Error('镜头使用的角色或关节配置版本不一致');
 const project=clone(saved);project.revision=current.revision;
 return makeCommand(current,[{kind:'restore',project}],fullScope(current),'load');
}
