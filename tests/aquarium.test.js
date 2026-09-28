import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Scene,Box3} from 'three';
import {fresh,profile,apply,ok,add,move,near,obj} from './scene-fixture.js';
import {createObjectMesh,disposeObject} from '../src/scene/geometry.js';
import * as geometry from '../src/scene/geometry.js';
import {surfacePoint,surfaceAnchor,surfaceContains} from '../src/scene/surfaces.js';
import {actorProject,toWorld} from '../src/scene/state.js';
import {worldPoint,forward} from '../src/pose/kinematics.js';
import {createSceneEngine} from '../src/scene/engine.js';
import {prepareSceneReference} from '../src/view/reference-capture.js';

test('glass contact coordinates use the visitor face and round trip after resizing and turning',()=>{
 const wall={type:'glass-wall',transform:{position:[2,.3,1],yaw:40,scale:[1.2,.8,1.5]}},anchor=[.1,-.18];
 const expected=new Vector3(.8,4.2*.32,-.06).multiply(new Vector3(1.2,.8,1.5)).applyAxisAngle(new Vector3(0,1,0),40*Math.PI/180).add(new Vector3(2,.3,1));
 near(surfacePoint(wall,anchor),expected.toArray());near(surfaceAnchor(wall,expected.toArray()),anchor);
 assert.equal(surfaceContains(wall,anchor),true);assert.equal(surfaceContains(wall,[.51,0]),false);
 assert.equal(surfaceContains(wall,[0,0],{type:'cup',transform:{yaw:0,scale:[1,1,1]}}),false);
});

test('either palm stays against upright glass through a small move and yaw, without changing fingers',()=>{
 for(const side of ['left','right']){
  const e=fresh();add(e,'glass','glass-wall',[0,0,.4]);
  const anchor=[(side==='left'?.24:-.24)/8,1.32/4.2-.5],before=e.read();
  ok(apply(e,{action:'attach',id:'primary',targetId:'glass',relation:'hand',hand:side+'Hand',anchor,keep:true}));
  const check=()=>{const p=e.read(),a=actorProject(p),hand=side+'Hand',actual=toWorld(p,'primary',worldPoint(a,profile,hand,[side==='left'?-.032:.032,-.012,0]));near(actual,surfacePoint(obj(e,'glass'),anchor),.014);
   const normal=new Vector3(0,-1,0).applyQuaternion(new Quaternion(...forward(a,profile)[hand].rotation));const towardGlass=new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0),obj(e,'glass').transform.yaw*Math.PI/180);assert.ok(normal.angleTo(towardGlass)<.12);
  };check();ok(move(e,'glass',{position:[.005,.003,.402],yaw:1}));check();
  for(const name of Object.keys(before.snapshot.rotations).filter(n=>/Thumb|Index|Middle|Ring|Little/.test(n)))assert.deepEqual(e.read().snapshot.rotations[name],before.snapshot.rotations[name]);
  assert.deepEqual(createSceneEngine(JSON.parse(JSON.stringify(e.read())),profile).read(),e.read());
  const previous=e.read();assert.notEqual(move(e,'glass',{position:[0,0,5]}).status,'applied');assert.deepEqual(e.read(),previous);
 }
});

test('glass supports hands but cannot become a seat or an object shelf',()=>{
 const e=fresh();add(e,'glass','glass-wall');add(e,'cup','cup');
 for(const [id,relation]of [['primary','seat'],['cup','surface']]){const before=e.read();assert.notEqual(apply(e,{action:'attach',id,targetId:'glass',relation,anchor:[0,0],keep:true}).status,'applied');assert.deepEqual(e.read(),before);}
});

test('aquarium objects are grounded, tint preserves the frame and eyes, and the viewing front stays open',()=>{
 for(const type of ['glass-wall','aquarium-tank','fish']){const root=createObjectMesh(type);root.updateMatrixWorld(true);const bounds=new Box3().setFromObject(root);assert.ok(Math.abs(bounds.min.y)<1e-5,type);assert.ok(!bounds.isEmpty());disposeObject(root);}
 const glass=createObjectMesh('glass-wall'),pane=glass.children.find(o=>o.material.userData.referenceHidden),frame=glass.children.find(o=>!o.material.userData.referenceHidden),original=frame.material.color.getHex();
 geometry.updateObjectColor(glass,'#aaccff');assert.equal(pane.material.color.getHexString(),'aaccff');assert.equal(frame.material.color.getHex(),original);assert.equal(pane.castShadow,false);disposeObject(glass);
});

test('helper passes look through glass while the real glass and solid frame are restored for final images',()=>{
 const scene=new Scene(),glass=createObjectMesh('glass-wall');scene.add(glass);const p=fresh().read(),materials=glass.children.map(o=>o.material);
 for(const style of ['structure','depth','segments']){
  const restore=prepareSceneReference({scene,world:{object:()=>glass},project:p,style,depth:{near:.01,far:10}});
  for(let i=0;i<glass.children.length;i++)assert.equal(glass.children[i].material.visible,!materials[i].userData.referenceHidden);
  restore();assert.deepEqual(glass.children.map(o=>o.material),materials);assert.ok(materials.every(m=>m.visible));
 }disposeObject(glass);
});
