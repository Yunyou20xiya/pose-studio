import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const api=await import('../src/pose/contacts.js').catch(()=>({}));
const p=JSON.parse(readFileSync(new URL('./fixtures/minimal-project.json',import.meta.url)));
const profile=JSON.parse(readFileSync(new URL('./fixtures/rig-profile.json',import.meta.url)));
test('crossing bone capsules report zero centerline distance',()=>{assert.equal(typeof api.segmentDistance,'function');assert.ok(api.segmentDistance([-1,0,0],[1,0,0],[0,-1,0],[0,1,0])<1e-9);assert.ok(Math.abs(api.segmentDistance([0,0,0],[1,0,0],[0,.2,0],[1,.2,0])-.2)<1e-9);});
test('a required contact cannot silently float away from its anchor',()=>{assert.equal(typeof api.checkContacts,'function');const project=structuredClone(p);project.snapshot.contacts=[{bone:'leftFoot',objectId:'floor',localPoint:[0,0,0],worldPoint:[0,-2,0],mode:'required'}];assert.ok(api.checkContacts(project,profile).some(x=>x.code==='CONTACT_CONFLICT'&&x.severity==='error'));});
test('an anchor lock is checked in world coordinates',()=>{assert.equal(typeof api.checkContacts,'function');const project=structuredClone(p);project.snapshot.locks=[{kind:'anchor',bone:'leftHand',position:[10,10,10],rotation:[0,0,0,1]}];assert.ok(api.checkContacts(project,profile).some(x=>x.code==='ANCHOR_LOCKED'));});
