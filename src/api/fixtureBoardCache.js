import { setItemWithRecovery } from '../storageRecovery.js';

const PREFIX = 'fast-score:fixture-board:v1:';
const DEFAULT_LIMIT = 18;

function localDateKey(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

export function fixtureBoardKey(sport, date) {
  return `${PREFIX}${sport}:${localDateKey(date)}`;
}

export function savedOnLocalDay(snapshot, date) {
  if (!validSnapshot(snapshot)) return false;
  const saved = new Date(snapshot.savedAt);
  return (
    saved.getFullYear() === date.getFullYear() &&
    saved.getMonth() === date.getMonth() &&
    saved.getDate() === date.getDate()
  );
}

function validSnapshot(value) {
  return value && Array.isArray(value.groups) && Number.isFinite(value.savedAt);
}

export function createFixtureBoardCache(storage, limit = DEFAULT_LIMIT) {
  const memory = new Map();

  async function trim(maxEntries = limit) {
    if (!storage.getAllKeys || !storage.multiGet || !storage.multiRemove) return;
    const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length <= maxEntries) return;

    const entries = await storage.multiGet(keys);
    const oldest = entries
      .map(([key, raw]) => {
        try {
          const value = JSON.parse(raw);
          return { key, savedAt: validSnapshot(value) ? value.savedAt : 0 };
        } catch {
          return { key, savedAt: 0 };
        }
      })
      .sort((a, b) => a.savedAt - b.savedAt)
      .slice(0, keys.length - maxEntries)
      .map((entry) => entry.key);

    if (oldest.length) {
      await storage.multiRemove(oldest);
      oldest.forEach((key) => memory.delete(key));
    }
  }

  async function trimBeforeWrite(key) {
    if (!storage.getAllKeys) return;
    try {
      const keys = (await storage.getAllKeys()).filter((entry) => entry.startsWith(PREFIX));
      await trim(keys.includes(key) ? limit : Math.max(0, limit - 1));
    } catch {
      // Cache eviction is best-effort; the write recovery path handles SQLITE_FULL.
    }
  }

  return {
    async get(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!validSnapshot(snapshot)) return null;
        memory.set(key, snapshot);
        return snapshot;
      } catch {
        return null;
      }
    },

    async set(key, groups) {
      if (!Array.isArray(groups)) return;
      const snapshot = {
        savedAt: Date.now(),
        source: groups.source || null,
        groups: Array.from(groups),
      };
      memory.set(key, snapshot);
      try {
        await trimBeforeWrite(key);
        await setItemWithRecovery(storage, key, JSON.stringify(snapshot));
        await trim();
      } catch (error) {
        console.warn('[Fast Score] Could not persist the daily fixture board', error);
      }
    },

    async clear() {
      memory.clear();
      try {
        const keys = storage.getAllKeys ? await storage.getAllKeys() : [];
        const cached = keys.filter((key) => key.startsWith(PREFIX));
        if (cached.length && storage.multiRemove) {
          await storage.multiRemove(cached);
        } else if (cached.length && storage.removeItem) {
          await Promise.all(cached.map((key) => storage.removeItem(key)));
        }
      } catch {
        // Cache clearing must not block other settings.
      }
    },
  };
}
