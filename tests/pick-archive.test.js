import test from 'node:test';
import assert from 'node:assert/strict';
import { datesForPickHistory, getOrCreatePickDay } from '../src/pickArchive.js';

function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  const indexed = [];
  return {
    entries,
    indexed,
    read: async (key, fallback) => entries.has(key) ? entries.get(key) : fallback,
    write: async (key, value) => entries.set(key, structuredClone(value)),
    ensureIndexed: async (date) => indexed.push(date),
  };
}

test('the first non-empty selection is saved and reused on refresh', async () => {
  const store = fakeStorage();
  let generated = 0;
  const create = async () => {
    generated += 1;
    return { date: '20261030', picks: [{ key: 'fixture-a' }] };
  };
  const options = { ...store, create };

  const first = await getOrCreatePickDay('20261030', options);
  const refreshed = await getOrCreatePickDay('20261030', { ...options, create: async () => { throw new Error('must not regenerate'); } });

  assert.equal(generated, 1);
  assert.equal(first.origin, 'generated');
  assert.deepEqual(refreshed.day, first.day);
  assert.equal(store.entries.get('picks5:20261030').picks[0].key, 'fixture-a');
  assert.deepEqual(store.indexed, ['20261030', '20261030']);
});

test('concurrent requests for one date share one generated list', async () => {
  const store = fakeStorage();
  let generated = 0;
  const create = async () => {
    generated += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { date: '20261031', picks: [{ key: 'fixture-b' }] };
  };
  const options = { ...store, create };

  const [a, b] = await Promise.all([
    getOrCreatePickDay('20261031', options),
    getOrCreatePickDay('20261031', options),
  ]);

  assert.equal(generated, 1);
  assert.deepEqual(a.day, b.day);
  assert.equal(store.entries.get('picks5:20261031').picks[0].key, 'fixture-b');
});

test('a legacy future preview is promoted without being regenerated', async () => {
  const preview = { date: '20261102', picks: [{ key: 'future-fixture' }] };
  const store = fakeStorage({ 'picksf:20261102': preview });
  const result = await getOrCreatePickDay('20261102', {
    ...store,
    legacyKeys: ['picksf:20261102'],
    create: async () => { throw new Error('legacy preview must be retained'); },
  });

  assert.equal(result.origin, 'legacy');
  assert.deepEqual(store.entries.get('picks5:20261102'), preview);
  assert.deepEqual(store.indexed, ['20261102']);
});

test('a failed derived history-index write does not hide a successfully saved pick day', async () => {
  const store = fakeStorage();
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await getOrCreatePickDay('20261102', {
      ...store,
      ensureIndexed: async () => { throw new Error('index write failed'); },
      create: async () => ({ date: '20261102', picks: [{ key: 'saved-pick' }] }),
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.day.picks[0].key, 'saved-pick');
  assert.deepEqual(store.entries.get('picks5:20261102').picks, [{ key: 'saved-pick' }]);
});

test('empty scans are not archived so a later scan can discover fixtures', async () => {
  const store = fakeStorage();
  const empty = await getOrCreatePickDay('20261103', {
    ...store,
    create: async () => ({ date: '20261103', picks: [] }),
  });
  assert.equal(empty.origin, 'empty');
  assert.equal(store.entries.has('picks5:20261103'), false);

  const populated = await getOrCreatePickDay('20261103', {
    ...store,
    create: async () => ({ date: '20261103', picks: [{ key: 'late-fixture' }] }),
  });
  assert.equal(populated.origin, 'generated');
  assert.equal(store.entries.get('picks5:20261103').picks[0].key, 'late-fixture');
});

test('the track record selects saved dates by calendar window, excludes today and future, and deduplicates', () => {
  assert.deepEqual(
    datesForPickHistory(['20261001', '20261018', '20261018', '20261029', '20261030', '20261102'], '20261030', '20261016'),
    ['20261029', '20261018'],
  );
});
