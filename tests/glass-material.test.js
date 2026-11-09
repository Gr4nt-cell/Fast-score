import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Pearl Mist is a compact static backdrop and scroll does not animate full-screen layers',async()=>{
 const glass=await readFile('src/components/Glass.js','utf8'),app=await readFile('App.js','utf8');
 assert.match(glass,/pearl-mist.webp/);assert.match(glass,/backgroundColor:t.dark\?'#000000'/);
 assert.doesNotMatch(glass,/Animated.loop|BloomField|phase.interpolate/);assert.match(app,/<Backdrop \/>/);
 assert((await readFile('assets/glass/pearl-mist.webp')).length<10000);
});
