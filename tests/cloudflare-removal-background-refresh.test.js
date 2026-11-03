import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Cloudflare proxy and Worker source are removed', async () => {
  // the data layer after the Flashscore-only switch (espn.js was removed)
  const api = (await Promise.all(['src/api/flashscore.js', 'src/api/sportsData.js'].map((f) => readFile(path.join(root, f), 'utf8')))).join('\n');
  const settings = await readFile(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
  const legal = await readFile(path.join(root, 'src/legalPages.js'), 'utf8');
  assert.doesNotMatch(api, /serverUrl|serverJson|markServerDown|serverDay|workers\.dev/i);
  assert.doesNotMatch(settings, /workers\.dev|serverStatus|Fast Score server/i);
  assert.doesNotMatch(legal, /Cloudflare|workers\.dev|href="\/(privacy|child-safety)"/i);
  await assert.rejects(access(path.join(root, 'src/api/server.js')));
  await assert.rejects(access(path.join(root, 'wrangler.toml')));
  await assert.rejects(access(path.join(root, 'src/api/espn.js')));
});

test('background data access and current-day auto-refresh remain available', async () => {
  const settings = await readFile(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
  const matches = await readFile(path.join(root, 'src/screens/MatchesScreen.js'), 'utf8');
  const app = await readFile(path.join(root, 'App.js'), 'utf8');
  const background = await readFile(path.join(root, 'src/background.js'), 'utf8');
  assert.match(settings, /Allow background data use/);
  assert.match(settings, /Linking\.openSettings\(\)/);
  assert.match(matches, /sameDay\(date, new Date\(\)\).*60_000/);
  assert.match(app, /setInterval\(check, 10000\)/);
  assert.match(background, /registerTaskAsync/);
});
