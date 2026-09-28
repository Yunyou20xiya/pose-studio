// A compound arrangement has a single handoff camera. Ignore completed work
// after a newer scene edit or project switch while models are still loading.
export async function focusSceneResult(result,{read,ready,hand,group}){
 const p=read();
 if(result.status!=='applied'||result.revision!==p.revision)return;
 const target=result.handInteractionId?()=>hand?.(result.handInteractionId):result.focusId?()=>group?.(result.focusId):null;
 if(!target)return;
 await ready();const current=read();
 if(current.projectId===p.projectId&&current.revision===p.revision)target();
}
