import {issue} from '../pose/state.js';
export function resolveExpressions(weights,capabilities){
 const channels=Array.isArray(capabilities.expressions)?Object.fromEntries(capabilities.expressions.map(n=>[n,capabilities.expressionRules?.[n]||{}])):capabilities.expressions||{},mapping={smile:'happy',blink:'blink',...capabilities.expressionMap},values={},issues=[];
 for(const [semantic,value]of Object.entries(weights)){
  const name=mapping[semantic]||semantic,channel=channels[name];
  if(!channel){issues.push(issue('EXPRESSION_MISSING','角色没有这个表情通道：'+semantic));continue;}
  if(!Number.isFinite(value)||value<0||value>1){issues.push(issue('INVALID_EXPRESSION','表情程度应在 0 到 1 之间'));continue;}
  values[name]=channel.isBinary?(value>.5?1:0):value;
 }
 const effective={...values};
 for(const [name,weight]of Object.entries(values))if(weight>0){
  for(const [key,names]of Object.entries({overrideBlink:['blink','blinkLeft','blinkRight'],overrideMouth:['aa','ih','ou','ee','oh'],overrideLookAt:['lookUp','lookDown','lookLeft','lookRight']})){
   const type=channels[name][key];if(type==='block'||type==='blend')for(const n of names)if(effective[n]>0){effective[n]*=type==='block'?0:1-weight;issues.push(issue('EXPRESSION_OVERRIDE',`${name} 会${type==='block'?'覆盖':'减弱'} ${n}，实际程度 ${effective[n].toFixed(2)}`,[],'warning'));}
  }
 }
 return{values,effective,issues};
}
