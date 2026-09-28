import test from 'node:test';
import assert from 'node:assert/strict';
import {focusSceneResult} from '../src/view/result-focus.js';

test('a completed arrangement with hands and a group focuses the hands once',async()=>{
 const calls=[],p={projectId:'scene',revision:4};
 await focusSceneResult({status:'applied',revision:4,handInteractionId:'pair',focusId:'group'},{read:()=>p,ready:async()=>{},hand:id=>calls.push(['hand',id]),group:id=>calls.push(['group',id])});
 assert.deepEqual(calls,[['hand','pair']]);
});
test('a delayed result never refocuses a newer revision or a different project',async()=>{
 for(const next of [{projectId:'scene',revision:5},{projectId:'other',revision:4}]){
  let p={projectId:'scene',revision:4},resolve;const calls=[],ready=()=>new Promise(r=>resolve=r);
  const done=focusSceneResult({status:'applied',revision:4,handInteractionId:'pair'},{read:()=>p,ready,hand:id=>calls.push(id)});
  p=next;resolve();await done;assert.deepEqual(calls,[]);
 }
});
