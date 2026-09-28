import {handGesture} from '../src/assets/gestures.js';
import {projectJoint,effectiveRule} from '../src/pose/limits.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,profile,apply,ok,cmd} from './scene-fixture.js';
import {actorProject} from '../src/scene/state.js';
import {createSceneEngine,checkScene} from '../src/scene/engine.js';
import {captureCombination,externalLinkCount} from '../src/scene/combinations.js';
import {validateStoredCombination} from '../server/combination-library.js';
import {groundPoseCommand} from '../src/assets/ground-poses.js';
import {pairedGeometry,interactionBones} from '../src/pose/paired-hands.js';
import {Quaternion,Vector3} from 'three';
import {actorClient} from '../src/view/client.js';

export function setup(preset){
 const e=fresh();
 if(preset!=='palms-together'){
  ok(apply(e,{action:'add-actor',id:'partner'}));
  ok(apply(e,{action:'update',id:'partner',value:{transform:{position:preset==='handshake'?[0,0,.75]:[.55,0,0],yaw:preset==='handshake'?180:0,scale:1}}}));
 }
 const hands=preset==='palms-together'?[{actorId:'primary',hand:'leftHand'},{actorId:'primary',hand:'rightHand'}]:[{actorId:'primary',hand:preset==='handshake'?'rightHand':'leftHand'},{actorId:'partner',hand:'rightHand'}];
 return{e,op:{action:'hand-interact',id:'pair',preset,hands,position:preset==='palms-together'?[0,1.18,.24]:preset==='handshake'?[0,1,.375]:[.275,.84,0],yaw:0,strength:.45,overwriteManual:false}};
}
for(const preset of ['palms-together','handshake','hand-hold'])test(preset+' applies as one transaction and preserves unrelated bones',()=>{
 const {e,op}=setup(preset),before=e.read();ok(apply(e,op));const p=e.read();assert.equal(p.revision,before.revision+1);assert.equal(p.scene.handInteractions.length,1);assert.deepEqual(p.scene.handInteractions[0].hands,op.hands);
 for(const id of new Set(op.hands.map(h=>h.actorId))){const a=actorProject(before,id),b=actorProject(p,id),sides=op.hands.filter(h=>h.actorId===id).map(h=>h.hand.replace('Hand',''));
  for(const bone of Object.keys(a.snapshot.rotations).filter(n=>!sides.some(s=>n.startsWith(s)&&!/Leg|Foot|Toes/.test(n))))assert.deepEqual(b.snapshot.rotations[bone],a.snapshot.rotations[bone]);
  assert.deepEqual(b.snapshot.expressions,a.snapshot.expressions);
 }
 assert.deepEqual(p.camera,before.camera);assert.deepEqual(p.lighting,before.lighting);
 assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(p)),profile).read(),p);
 ok(e.apply(cmd(e,{kind:'undo'})));assert.deepEqual(e.read().snapshot,before.snapshot);assert.deepEqual(e.read().scene,before.scene);
 ok(e.apply(cmd(e,{kind:'redo'})));assert.deepEqual(e.read().scene,p.scene);
});
test('unreachable pair and locked participating actor reject atomically',()=>{
 const {e,op}=setup('handshake');let before=e.read();assert.notEqual(apply(e,{...op,position:[0,5,0]}).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'update',id:'partner',value:{locked:true}}));before=e.read();assert.notEqual(apply(e,op).status,'applied');assert.deepEqual(e.read(),before);
});
test('an established pair follows a small participant move and releases without losing pose',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));const t=structuredClone(e.read().scene.actors[0].transform);t.position[2]+=.02;ok(apply(e,{action:'update',id:'partner',value:{transform:t}}));
 const before=e.read();ok(apply(e,{action:'hand-release',id:'pair'}));assert.deepEqual(e.read().snapshot,before.snapshot);assert.deepEqual(e.read().scene.actors,before.scene.actors);assert.equal(e.read().scene.handInteractions.length,0);
});
test('legal contact measures are small; corrupted geometry and duplicate hands cannot be loaded',()=>{
 const {e,op}=setup('palms-together');ok(apply(e,op));const p=e.read();for(const g of pairedGeometry(p,p.scene.handInteractions[0],profile)){assert.ok(g.distance<.006);assert.ok(g.angle<8*Math.PI/180);}
 for(const change of [p=>p.scene.handInteractions[0].position[0]+=1,p=>p.scene.handInteractions[0].hands[1]=p.scene.handInteractions[0].hands[0],p=>p.scene.handInteractions[0].hands[0]=null,p=>p.scene.handInteractions[0].strength=NaN,p=>p.scene.handInteractions.push(structuredClone(p.scene.handInteractions[0]))]){const copy=structuredClone(p);change(copy);assert.throws(()=>createSceneEngine(copy,profile));}
});
test('manual fingers and joint locks remain protected even across the other actor',()=>{
 const {e,op}=setup('handshake');const bone='rightIndexProximal';ok(e.apply(cmd(e,{kind:'patch',value:{layers:[{id:'mine',manual:true,bones:[bone],expressionNames:[]}] }},'partner')));let before=e.read();assert.notEqual(apply(e,op).status,'applied');assert.deepEqual(e.read(),before);ok(apply(e,{...op,overwriteManual:true}));
 const rotation=actorProject(e.read(),'partner').snapshot.rotations.rightHand;ok(e.apply(cmd(e,{kind:'set-locks',value:[{kind:'joint',bone:'rightHand',rotation}]},'partner')));
 before=e.read();assert.notEqual(apply(e,{action:'hand-adjust',id:'pair',yaw:90}).status,'applied');assert.deepEqual(e.read(),before);
});
test('pair movement protects locked observers and extreme participant movement is atomic',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));const before=e.read();assert.notEqual(apply(e,{action:'update',id:'partner',value:{transform:{position:[0,0,8],yaw:180,scale:1}}}).status,'applied');assert.deepEqual(e.read(),before);
 ok(apply(e,{action:'update',id:'partner',value:{locked:true}}));const locked=e.read();assert.notEqual(apply(e,{action:'hand-adjust',id:'pair',position:[.05,1,.375]}).status,'applied');assert.deepEqual(e.read(),locked);
});
test('whole-body pose replacement releases pair, while deletion and solo duplication do not leave links',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));ok(apply(e,{action:'duplicate',id:'partner',newId:'copy'}));assert.equal(e.read().scene.handInteractions.length,1);assert.ok(e.read().scene.handInteractions.every(r=>r.hands.every(h=>h.actorId!=='copy')));
 ok(e.apply(groundPoseCommand({...actorProject(e.read()),_actorId:'primary'},'stand',profile)));assert.equal(e.read().scene.handInteractions.length,0);
 ok(apply(e,{...op,overwriteManual:true}));ok(apply(e,{action:'remove',id:'primary'}));assert.equal(e.read().scene.handInteractions.length,0);
});
test('full groups move without altering poses; partial groups reject their external hand contact',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));ok(apply(e,{action:'group-create',id:'all',name:'握手',memberIds:['primary','partner']}));const before=e.read();ok(apply(e,{action:'group-transform',id:'all',position:[2,0,3],yaw:80}));assert.deepEqual(e.read().snapshot,before.snapshot);assert.deepEqual(e.read().scene.actors[0].pose,before.scene.actors[0].pose);
 ok(apply(e,{action:'group-dissolve',id:'all'}));ok(apply(e,{action:'group-create',id:'one',name:'单人',memberIds:['partner']}));const current=e.read();assert.notEqual(apply(e,{action:'group-transform',id:'one',position:[1,0,1],yaw:0}).status,'applied');assert.deepEqual(e.read(),current);
});
test('combination stores and copies internal pair IDs; outgoing pair is omitted with notice',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));const p=e.read(),c=captureCombination(p,{memberIds:['primary','partner'],name:'握手'});assert.equal(c.handInteractions.length,1);validateStoredCombination(c,p,profile);
 ok(apply(e,{action:'apply-combination',id:'copy',idMap:{primary:'a2',partner:'b2'},position:[2,0,0],yaw:40,combination:c}));assert.deepEqual(e.read().scene.handInteractions[1].hands.map(h=>h.actorId),['a2','b2']);assert.notEqual(e.read().scene.handInteractions[1].id,'pair');
 const partial=captureCombination(p,{memberIds:['primary'],name:'一个人'});assert.equal(partial.handInteractions?.length||0,0);assert.equal(externalLinkCount(p,['primary']),1);
});
test('existing support cannot silently claim a hand participating in a pair',()=>{
 const {e,op}=setup('palms-together');ok(apply(e,op));const before=e.read();assert.notEqual(e.apply(cmd(e,{kind:'hand-support',hand:'leftHand',preset:'face'})).status,'applied');assert.deepEqual(e.read(),before);
});
test('body edits require the full participating scope; explicit scope can keep the relation',()=>{
 const {e,op}=setup('palms-together');ok(apply(e,op));const before=e.read(),rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.12).toArray();const c=cmd(e,{kind:'patch',value:{rotations:{chest:rotation}}},'primary');c.scope.bones=['chest'];c.overwriteManual=['chest'];assert.notEqual(e.apply(c).status,'applied');assert.deepEqual(e.read(),before);
 c.id=crypto.randomUUID();c.scope.bones=['chest',...interactionBones('leftHand',profile),...interactionBones('rightHand',profile)];c.overwriteManual=c.scope.bones;ok(e.apply(c));assert.equal(e.read().scene.handInteractions.length,1);
});
test('overlapping hands report a named finger clearance issue in addition to contact errors',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));const p=e.read();p.scene.actors[0].pose=structuredClone({snapshot:p.snapshot,layers:p.layers,stage:p.stage});p.scene.actors[0].transform=structuredClone(p.scene.primary.transform);
 assert.ok(checkScene(p,profile).some(i=>i.code==='HAND_CLEARANCE'&&/食指|中指|无名指|小指|拇指/.test(i.message)));
});
test('default templates settle finger contacts without deep proxy intersections',()=>{
 for(const preset of ['palms-together','handshake','hand-hold']){const {e,op}=setup(preset);ok(apply(e,op));assert.deepEqual(checkScene(e.read(),profile).filter(i=>i.code==='HAND_CLEARANCE'),[],preset);}
});
test('copying a solo prayer preserves its internal two-hand link with new identities',()=>{
 const {e,op}=setup('palms-together');ok(apply(e,op));ok(apply(e,{action:'duplicate',id:'primary',newId:'copy'}));assert.equal(e.read().scene.handInteractions.length,2);assert.deepEqual(e.read().scene.handInteractions[1].hands.map(h=>h.actorId),['copy','copy']);
});
test('actor client expands linked arms but never overwrites protected manual fingers',async()=>{
 const {e,op}=setup('palms-together');ok(apply(e,op));const client=actorClient({read:e.read,send:c=>e.apply(c),preview:e.preview,isOwner:()=>true},'primary',profile);
 const c=cmd(e,{kind:'patch',value:{rotations:{chest:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.12).toArray()}}},'primary');c.scope.bones=['chest'];c.overwriteManual=['chest'];ok(await client.send(c));
 const other=setup('handshake');ok(apply(other.e,other.op));const bone='rightIndexProximal';ok(other.e.apply(cmd(other.e,{kind:'patch',value:{layers:[{id:'my-finger',manual:true,bones:[bone],expressionNames:[]}]}})));const before=other.e.read();assert.notEqual(apply(other.e,{action:'hand-adjust',id:'pair',strength:.2}).status,'applied');assert.deepEqual(other.e.read(),before);
});
test('mirror hand pair and bounded strength adjustments stay legal; stale requests do not reapply',()=>{
 const {e,op}=setup('handshake');op.hands=op.hands.map(h=>({...h,hand:'leftHand'}));ok(apply(e,op));ok(apply(e,{action:'hand-adjust',id:'pair',strength:.2}));ok(apply(e,{action:'hand-adjust',id:'pair',strength:.7}));
 const stale=cmd(e,{kind:'scene',action:'hand-adjust',id:'pair',strength:.4});ok(apply(e,{action:'hand-adjust',id:'pair',strength:.5}));const p=e.read();assert.notEqual(e.apply(stale).status,'applied');assert.deepEqual(e.read(),p);
});

test('fine finger edits do not refit or disturb a locked partner at an accepted contact tolerance',()=>{
 const {e,op}=setup('handshake');op.position=[0,.9,.375];ok(apply(e,op));
 ok(apply(e,{action:'update',id:'partner',value:{locked:true}}));const before=e.read(),bone='rightIndexProximal';
 assert.ok(pairedGeometry(before,before.scene.handInteractions[0],profile)[1].distance>.001);
 const c=cmd(e,{kind:'patch',value:{rotations:{[bone]:[0,0,0,1]}}},'primary');c.scope.bones=[bone];c.overwriteManual=[bone];ok(e.apply(c));
 assert.deepEqual(actorProject(e.read(),'partner').snapshot,actorProject(before,'partner').snapshot);
 assert.deepEqual(e.read().scene.handInteractions,before.scene.handInteractions);
});


test('a loaded locked actor already at the template stays unchanged during final finger settling',()=>{
 const {e,op}=setup('handshake');ok(apply(e,op));ok(apply(e,{action:'hand-release',id:'pair'}));const p=e.read();
 for(const [bone,rotation]of Object.entries(handGesture('fist','right',.25+.45*.36,.1,profile).rotations)){
  const target=bone.includes('Thumb')?new Quaternion().setFromAxisAngle(new Vector3(1,0,0),bone.endsWith('Metacarpal')?.2:0).toArray():rotation;
  p.snapshot.rotations[bone]=projectJoint(target,effectiveRule(bone,p.snapshot.rotations,profile),p.snapshot.rotations[bone]);
 }
 p.scene.primary.locked=true;const loaded=createSceneEngine(p,profile),before=loaded.read(),result=apply(loaded,op);
 if(result.status==='applied'){assert.deepEqual(loaded.read().snapshot,before.snapshot);assert.deepEqual(loaded.read().layers,before.layers);}else assert.deepEqual(loaded.read(),before);
});
