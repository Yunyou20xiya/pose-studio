// VRM may expose a shared blink plus two additive, per-eye channels.
export function eyeClosure(weights={}){
 const clamp=value=>Math.max(0,Math.min(1,value));
 return{left:clamp((weights.blink||0)+(weights.blinkLeft||0)),right:clamp((weights.blink||0)+(weights.blinkRight||0))};
}

export function eyeClosurePatch(current,capabilities,change){
 const eyes={...eyeClosure(current),...change};
 if(![eyes.left,eyes.right].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('闭眼程度应在 0 到 1 之间');
 const names=Array.isArray(capabilities.expressions)?capabilities.expressions:Object.keys(capabilities.expressions||{});
 const patch=Object.fromEntries(['blink','blinkLeft','blinkRight'].filter(n=>names.includes(n)).map(n=>[n,0]));
 if(eyes.left===eyes.right&&'blink'in patch)patch.blink=eyes.left;
 else if('blinkLeft'in patch&&'blinkRight'in patch){patch.blinkLeft=eyes.left;patch.blinkRight=eyes.right;}
 else throw Error('这个角色不支持所选的闭眼方式');
 return patch;
}
