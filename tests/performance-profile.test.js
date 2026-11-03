import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseLowEndProfile } from '../src/performanceProfile.js';

test('selects Optimized for devices with 3 GB RAM or less', () => {
  assert.equal(shouldUseLowEndProfile({ totalMemory: 3 * 1024 ** 3 }), true);
  assert.equal(shouldUseLowEndProfile({ totalMemory: 3.1 * 1024 ** 3 }), false);
});

test('selects Optimized for older device-year classes', () => {
  assert.equal(shouldUseLowEndProfile({ deviceYearClass: 2019 }), true);
  assert.equal(shouldUseLowEndProfile({ deviceYearClass: 2020 }), false);
});

test('selects Optimized for 32-bit-only ARM devices', () => {
  assert.equal(shouldUseLowEndProfile({ supportedCpuArchitectures: ['armeabi-v7a'] }), true);
  assert.equal(
    shouldUseLowEndProfile({ supportedCpuArchitectures: ['armeabi-v7a', 'arm64-v8a'] }),
    false,
  );
});

test('uses Performance when device capability data is unavailable', () => {
  assert.equal(shouldUseLowEndProfile(), false);
  assert.equal(shouldUseLowEndProfile({ supportedCpuArchitectures: ['x86_64'] }), false);
});
