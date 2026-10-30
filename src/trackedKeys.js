/** Only suppress fallback notifications while the native service is actively polling matches. */
export function activeTrackedKeys(isRunning, keys) {
  if (!isRunning || !Array.isArray(keys)) return new Set();
  return new Set(keys.filter((key) => typeof key === 'string' && key.length > 0));
}
