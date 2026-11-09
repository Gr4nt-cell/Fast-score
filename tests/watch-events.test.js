import test from 'node:test';
import assert from 'node:assert/strict';
import {matchEvents} from '../src/watchEvents.js';
const match=(state,h=0,a=0)=>({state,sport:'soccer',home:{score:h},away:{score:a}});
test('0–0 kickoff emits start, without a fake goal',()=>{
 assert.deepEqual(matchEvents('pre|-',match('in')).map(e=>e.kind),['start']);
});
test('late final score changes retain both the score event and full time',()=>{
 assert.deepEqual(matchEvents('in|0-0',match('post',1,0)).map(e=>e.kind),['score','end']);
});
test('cancelled goals are corrections and unchanged or missing scores do not create goals',()=>{
 assert.equal(matchEvents('in|1-0',match('in',0,0))[0].title,'Score correction');
 assert.equal(matchEvents('in|1-0',match('in',1,0)).length,0);
 assert.equal(matchEvents('in|1-0',match('in',null,null)).length,0);
});
