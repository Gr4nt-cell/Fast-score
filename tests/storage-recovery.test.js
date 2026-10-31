import test from 'node:test';
import assert from 'node:assert/strict';
import { isSqliteFullError, setItemWithRecovery } from '../src/storageRecovery.js';

const sqliteFull = () => new Error('database or disk is full (code 13 SQLITE_FULL)');

function fakeStorage(initial = {}, setItemImpl) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    values,
    get writes() {
      return writes;
    },
    getAllKeys: async () => [...values.keys()],
    multiRemove: async (keys) => keys.forEach((key) => values.delete(key)),
    setItem: async (key, value) => {
      writes += 1;
      if (setItemImpl) return setItemImpl({ key, value, values, writes });
      values.set(key, value);
    },
  };
}

test('recognizes Android SQLite full errors without matching unrelated failures', () => {
  assert.equal(isSqliteFullError(sqliteFull()), true);
  assert.equal(isSqliteFullError({ code: 13, message: 'database full' }), true);
  assert.equal(isSqliteFullError(new Error('network unavailable')), false);
});

test('retries a write after removing only recoverable cache entries', async () => {
  const storage = fakeStorage({
    'fast-score:fixture-board:v2:flashscore:soccer:20261031': '{}',
    'fs:leagueNames': '{}',
    'c:legacy': '{}',
    'picks5:20261031': '{"picks":[{"key":"saved-pick"}]}',
    'picks5:index': '["20261031"]',
    settings: '{}',
    favs: '{}',
  }, ({ key, value, values }) => {
    if ([...values.keys()].some((storedKey) => storedKey.startsWith('fast-score:fixture-board:') || storedKey.startsWith('fs:') || storedKey.startsWith('c:'))) {
      throw sqliteFull();
    }
    values.set(key, value);
  });

  await setItemWithRecovery(storage, 'picks5:20261101', '{"picks":[{"key":"new-pick"}]}');

  assert.equal(storage.writes, 2);
  assert.equal(storage.values.has('fast-score:fixture-board:v2:flashscore:soccer:20261031'), false);
  assert.equal(storage.values.has('fs:leagueNames'), false);
  assert.equal(storage.values.has('c:legacy'), false);
  assert.equal(storage.values.has('picks5:20261031'), true);
  assert.equal(storage.values.has('picks5:index'), true);
  assert.equal(storage.values.has('settings'), true);
  assert.equal(storage.values.has('favs'), true);
  assert.equal(storage.values.has('picks5:20261101'), true);
});

test('returns a helpful error when storage remains full after cache cleanup', async () => {
  const storage = fakeStorage({
    'fast-score:fixture-board:v1:soccer:20261031': '{}',
  }, () => {
    throw sqliteFull();
  });

  await assert.rejects(
    setItemWithRecovery(storage, 'picks5:20261031', '{}'),
    (error) => error.code === 'FAST_SCORE_STORAGE_FULL' && /Free up device space/.test(error.message),
  );
});
