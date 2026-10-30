import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTrackedKeys } from '../src/trackedKeys.js';

test('stopped live service leaves every match eligible for fallback alerts', () => {
  assert.deepEqual(activeTrackedKeys(false, ['soccer:league:match']), new Set());
});

test('running live service only reports valid actively monitored match keys', () => {
  assert.deepEqual(
    activeTrackedKeys(true, ['soccer:league:match', '', null, 'soccer:league:match']),
    new Set(['soccer:league:match']),
  );
});
