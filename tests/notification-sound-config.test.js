import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const soundKinds = ['goal', 'kickoff', 'halftime', 'fulltime', 'redcard', 'lineups'];

test('Android notification channels use fresh, matching IDs', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
  const notifications = config.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  )?.[1];
  const jsNotifications = await readFile(path.join(root, 'src/notify.js'), 'utf8');
  const nativeLive = await readFile(
    path.join(root, 'modules/fast-live/android/src/main/java/expo/modules/fastlive/Live.kt'),
    'utf8',
  );
  const nativeModule = await readFile(
    path.join(root, 'modules/fast-live/android/src/main/java/expo/modules/fastlive/FastLiveModule.kt'),
    'utf8',
  );
  const liveService = await readFile(
    path.join(root, 'modules/fast-live/android/src/main/java/expo/modules/fastlive/LiveService.kt'),
    'utf8',
  );
  const app = await readFile(path.join(root, 'App.js'), 'utf8');
  const watcher = await readFile(path.join(root, 'src/watch.js'), 'utf8');

  assert.equal(notifications.defaultChannel, 'scores_v6');
  assert.match(jsNotifications, /const CHANNEL = 'scores_v6'/);
  assert.match(nativeLive, /const val CH_SCORES = "scores_v6"/);
  assert.match(jsNotifications, /`ev_\$\{kind\}_v6`/);
  assert.match(nativeLive, /"ev_\$\{kind\}_v6"/);
  assert.match(jsNotifications, /shouldShowAlert: true/);
  assert.match(jsNotifications, /getNotificationChannelAsync\(channelId\)/);
  assert.match(jsNotifications, /AndroidNotificationPriority\.HIGH/);
  assert.match(jsNotifications, /const channelTrigger = \(channelId\) => \(\{\s*channelId,/);
  assert.match(jsNotifications, /withTimeout\(FastLive\.testNotification\(\), 8000\)/);
  assert.match(nativeLive, /fun testNotification\(ctx: Context\): String/);
  assert.match(nativeModule, /AsyncFunction\("testNotification"\)/);
  assert.match(nativeModule, /AsyncFunction\("playTone"\)/);
  assert.match(nativeLive, /Settings\.System\.DEFAULT_NOTIFICATION_URI/);
  assert.match(nativeLive, /prepareAsync\(\)/);
  assert.match(jsNotifications, /sound: 'default'/);

  const toneStart = nativeLive.indexOf('fun playTone(');
  assert.ok(nativeLive.indexOf('setAudioAttributes(', toneStart) < nativeLive.indexOf('setDataSource(ctx, sound)', toneStart));
  assert.match(app, /setInterval\(check, 10000\)/);
  assert.match(watcher, /scoreboard\(s, l, today, 8000\)/);
  assert.match(liveService, /if \(anyLive\) 15 \* 1000L/);
});

test('all notification sounds are declared and packaged as app assets', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
  const notifications = config.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  )?.[1];
  const expected = soundKinds.map((kind) => `./assets/sounds/fs_${kind}.wav`);

  assert.deepEqual(notifications.sounds, expected);
  for (const sound of expected) {
    await access(path.resolve(root, sound));
  }
  assert.ok(config.expo.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
});
