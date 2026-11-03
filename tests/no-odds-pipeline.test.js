import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the unused MSport odds pipeline is gone and the policy lists only live sources', async () => {
  await assert.rejects(access(path.join(root, '.github/workflows/odds.yml')));
  await assert.rejects(access(path.join(root, 'scripts/build_odds.py')));
  const legal = await readFile(path.join(root, 'src/legalPages.js'), 'utf8');
  assert.doesNotMatch(legal, /MSport|ESPN|TheSportsDB|SofaScore|Bookmaker odds/i);
});
