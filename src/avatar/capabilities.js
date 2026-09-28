export const fingerBones = side => ['Thumb','Index','Middle','Ring','Little'].flatMap(f =>
  (f === 'Thumb' ? ['Metacarpal','Proximal','Distal'] : ['Proximal','Intermediate','Distal']).map(p => side+f+p));
export const requiredBones = ['hips','spine','chest','neck','head', ...['left','right'].flatMap(s => [
  ...['Shoulder','UpperArm','LowerArm','Hand','UpperLeg','LowerLeg','Foot'].map(p=>s+p), ...fingerBones(s)])];
export function inspectCapabilities({bones=[],expressions=[],gazeAvailable=false}) {
  const missing=requiredBones.filter(b=>!bones.includes(b));
  if(!expressions.includes('happy')&&!expressions.includes('smile')) missing.push('smile');
  if(!expressions.includes('blink')) missing.push('blink');
  if(!gazeAvailable) missing.push('gaze');
  return {complete:missing.length===0,missing};
}
