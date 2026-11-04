import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('MSport odds pipeline is present and disclosed in the privacy policy', async () => {
  await access(path.join(root, '.github/workflows/odds.yml'));
  await access(path.join(root, 'scripts/build_odds.py'));
  const legal = await readFile(path.join(root, 'src/legalPages.js'), 'utf8');
  assert.match(legal, /MSport Ghana \(msport\.com\)/);
  assert.doesNotMatch(legal, /ESPN|TheSportsDB|SofaScore/i);
});
