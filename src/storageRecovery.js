const RECOVERABLE_CACHE_PREFIXES = [
  'fast-score:fixture-board:v2:flashscore:',
  'fast-score:fixture-board:v1:',
  'c:',
  'fs:',
];

let cacheCleanupInFlight = null;

export function isSqliteFullError(error) {
  if (Number(error?.code) === 13) return true;
  const details = `${error?.code || ''} ${error?.message || error || ''}`;
  return /SQLITE_FULL|database or disk is full|code\s*13\b/i.test(details);
}

async function removeRecoverableCaches(storage) {
  if (!cacheCleanupInFlight) {
    cacheCleanupInFlight = (async () => {
      const keys = await storage.getAllKeys();
      const removable = keys.filter((key) => RECOVERABLE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)));
      if (!removable.length) return 0;

      if (storage.multiRemove) {
        await storage.multiRemove(removable);
      } else if (storage.removeItem) {
        await Promise.all(removable.map((key) => storage.removeItem(key)));
      } else {
        return 0;
      }
      return removable.length;
    })();
  }

  try {
    return await cacheCleanupInFlight;
  } catch {
    // Retry the write even if listing or deleting caches failed.
    return 0;
  } finally {
    cacheCleanupInFlight = null;
  }
}

function actionableStorageError(cause) {
  const error = new Error(
    'Fast Score cleared cached match data, but the phone is still out of storage. Free up device space, then tap Check again.',
  );
  error.code = 'FAST_SCORE_STORAGE_FULL';
  error.cause = cause;
  return error;
}

export async function setItemWithRecovery(storage, key, value) {
  try {
    await storage.setItem(key, value);
  } catch (error) {
    if (!isSqliteFullError(error)) throw error;

    await removeRecoverableCaches(storage);
    try {
      await storage.setItem(key, value);
    } catch (retryError) {
      if (isSqliteFullError(retryError)) throw actionableStorageError(retryError);
      throw retryError;
    }
  }
}
