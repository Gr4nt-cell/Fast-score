import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(fullPath) : /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

test('mobile sports code uses only Flashscore for sports data', async () => {
  for (const module of ['espn.js','msport.js','sofascore.js','sportsdb.js','browserBridge.js','server.js']) {
    await assert.rejects(access(path.join(src,'api',module)));
  }
  const files=await sourceFiles(src);
  const sources=await Promise.all(files.map((file)=>readFile(file,'utf8')));
  const appCode=sources.join('\n');
  assert.doesNotMatch(appCode,/from\s+['"][^'"]*\/api\/(espn|msport|sofascore|sportsdb|browserBridge|server)['"]/i);
  assert.match(appCode,/from\s+['"][^'"]*\/api\/flashscore['"]/);
  assert.doesNotMatch(await readFile(path.join(src,'predict.js'),'utf8'),/attachOdds|bookmaker|MARKET_WEIGHT|marketProbs/i);
});
