import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixtureBoardCache, fixtureBoardKey, savedOnLocalDay } from '../src/api/fixtureBoardCache.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null]),
    multiRemove: async (keys) => keys.forEach((key) => values.delete(key)),
  };
}

test('fixture cache keys use the selected local calendar date', () => {
  const date = new Date(2026, 9, 31, 23, 45);
  assert.equal(fixtureBoardKey('soccer', date), 'fast-score:fixture-board:v1:soccer:20261031');
});

test('a saved daily board is reused only on the same local calendar day', () => {
  const date = new Date(2026, 9, 31, 12);
  const snapshot = {
    savedAt: new Date(2026, 9, 31, 1).getTime(),
    groups: [],
  };

  assert.equal(savedOnLocalDay(snapshot, date), true);
  assert.equal(savedOnLocalDay(snapshot, new Date(2026, 10, 1, 12)), false);
  assert.equal(savedOnLocalDay(null, date), false);
});

test('fixture boards persist groups and their data source across cache instances', async () => {
  const storage = fakeStorage();
  const firstCache = createFixtureBoardCache(storage);
  const groups = [{ league: { slug: 'eng.1' }, items: [{ key: 'fixture-1' }] }];
  groups.source = 'flashscore';
  const key = fixtureBoardKey('soccer', new Date(2026, 9, 31));

  await firstCache.set(key, groups);
  const restored = await createFixtureBoardCache(storage).get(key);

  assert.equal(restored.source, 'flashscore');
  assert.deepEqual(restored.groups, Array.from(groups));
  assert.ok(restored.savedAt > 0);
});

test('fixture cache keeps the newest snapshots within its storage limit', async () => {
  const storage = fakeStorage();
  const cache = createFixtureBoardCache(storage, 2);
  const date = (day) => new Date(2026, 9, day);

  await cache.set(fixtureBoardKey('soccer', date(29)), []);
  await cache.set(fixtureBoardKey('soccer', date(30)), []);
  await cache.set(fixtureBoardKey('soccer', date(31)), []);

  assert.equal(storage.values.size, 2);
  assert.equal(storage.values.has(fixtureBoardKey('soccer', date(29))), false);
  assert.equal(storage.values.has(fixtureBoardKey('soccer', date(31))), true);
});

test('clearing fixture snapshots clears both memory and persistent storage', async () => {
  const storage = fakeStorage();
  const cache = createFixtureBoardCache(storage);
  const key = fixtureBoardKey('soccer', new Date(2026, 9, 31));

  await cache.set(key, [{ items: [{ key: 'fixture-1' }] }]);
  await cache.clear();

  assert.equal(await cache.get(key), null);
  assert.equal(storage.values.has(key), false);
});

test('the matches screen waits for fixture persistence before finishing its load', async () => {
  const source = await readFile(new URL('../src/screens/MatchesScreen.js', import.meta.url), 'utf8');
  assert.match(source, /await fixtureBoardCache\.set\(boardKey, res\)/);
});
