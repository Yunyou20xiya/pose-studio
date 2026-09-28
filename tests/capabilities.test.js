import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/avatar/capabilities.js').catch(() => ({}));
const sides=['left','right'];
const bones=['hips','spine','chest','neck','head',...sides.flatMap(s=>[
  ...['Shoulder','UpperArm','LowerArm','Hand','UpperLeg','LowerLeg','Foot','Eye'].map(x=>s+x),
  ...['Thumb','Index','Middle','Ring','Little'].flatMap(f=>(f==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal']).map(p=>s+f+p))])];
test('a loaded model still fails when finger and smile channels are missing',()=>{
  assert.equal(typeof api.inspectCapabilities,'function','capability inspection must exist');
  const result=api.inspectCapabilities({bones:bones.filter(x=>x!=='rightIndexDistal'),expressions:['blink'],gazeAvailable:true});
  assert.equal(result.complete,false);
  assert.ok(result.missing.includes('rightIndexDistal'));
  assert.ok(result.missing.includes('smile'));
});
test('complete mapped rig is eligible for visual validation',()=>{
  assert.equal(typeof api.inspectCapabilities,'function');
  assert.deepEqual(api.inspectCapabilities({bones,expressions:['happy','blink'],gazeAvailable:true}).missing,[]);
});
