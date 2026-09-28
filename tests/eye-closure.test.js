import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eyeClosure,eyeClosurePatch} from '../src/face/eye-closure.js';
import {createSceneEngine} from '../src/scene/engine.js';
import {makeProject,makeCommand,fullScope} from '../src/pose/state.js';
const capabilities={expressions:['happy','aa','blink','blinkLeft','blinkRight']};

test('opening both eyes clears all overlapping blink channels, preserving other expressions',()=>{
 const current={happy:.4,aa:.2,blink:.3,blinkLeft:.8,blinkRight:.1};
 const patch=eyeClosurePatch(current,capabilities,{left:0,right:0});
 assert.deepEqual({...current,...patch},{happy:.4,aa:.2,blink:0,blinkLeft:0,blinkRight:0});
 assert.equal(current.blinkLeft,.8);
});
test('changing one eye from a shared blink preserves the opposite eye',()=>{
 const current={blink:.4,blinkLeft:.2,blinkRight:.1};
 const patch=eyeClosurePatch(current,capabilities,{left:1});
 assert.deepEqual(eyeClosure({...current,...patch}),{left:1,right:.5});
 assert.equal(patch.blink,0);
 assert.deepEqual(eyeClosure({blink:.8,blinkLeft:.5}),{left:1,right:.8});
});
test('partial closure works with a shared channel or separate channels, never inventing missing channels',()=>{
 assert.deepEqual(eyeClosurePatch({}, {expressions:['blink']},{left:.5,right:.5}),{blink:.5});
 assert.deepEqual(eyeClosurePatch({}, {expressions:['blinkLeft','blinkRight']},{left:.5,right:.5}),{blinkLeft:.5,blinkRight:.5});
 assert.throws(()=>eyeClosurePatch({}, {expressions:['blink']},{left:1,right:0}));
 assert.throws(()=>eyeClosurePatch({}, {expressions:[]},{left:1,right:1}));
 assert.throws(()=>eyeClosurePatch({}, capabilities,{left:NaN}));
});
test('blink edits are scoped to the selected actor, undoable, and preserve the staged scene',()=>{
 const profile=JSON.parse(readFileSync(new URL('../assets/profiles/primary.json',import.meta.url)));
 profile.assetRef={id:profile.id,sha256:'1'.repeat(64),relativePath:'profiles/primary.json'};
 const model=JSON.parse(readFileSync(new URL('../assets/model-source-a.json',import.meta.url)));
 const engine=createSceneEngine(makeProject(model,profile),profile);
 assert.equal(engine.apply(makeCommand(engine.read(),[{kind:'scene',action:'add-actor',id:'second'}],fullScope(engine.read()),'preset')).status,'applied');
 const before=engine.read(),value={expressions:eyeClosurePatch({},profile.capabilities,{left:1,right:1})};
 const scope={bones:[],expressions:Object.keys(value.expressions),root:false,gaze:false,stage:false,camera:false,lighting:false};
 const command={...makeCommand(before,[{kind:'patch',value}],scope,'preset',[]),actorId:'second'};
 assert.equal(engine.apply(command).status,'applied');
 const after=engine.read();
 assert.equal(after.scene.actors[0].pose.snapshot.expressions.blink,1);
 for(const key of ['snapshot','stage','camera','lighting'])assert.deepEqual(after[key],before[key]);
 assert.deepEqual(after.scene.actors[0].pose.snapshot.rotations,before.scene.actors[0].pose.snapshot.rotations);
 assert.equal(engine.apply(makeCommand(after,[{kind:'undo'}],fullScope(after))).status,'applied');
 const undone=engine.read();delete undone.revision;delete before.revision;
 assert.deepEqual(undone,before);
});
