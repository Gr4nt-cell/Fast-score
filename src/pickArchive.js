const inFlightByDate = new Map();

const hasPicks = (day) => day && Array.isArray(day.picks) && day.picks.length > 0;

/**
 * Persist one non-empty selection per calendar date. Legacy preview/backtest
 * caches are promoted into the canonical archive instead of being regenerated.
 */
export function getOrCreatePickDay(dateKey, { read, write, ensureIndexed, legacyKeys = [], create }) {
  const pending = inFlightByDate.get(dateKey);
  if (pending) return pending;

  const request = (async () => {
    const canonicalKey = `picks5:${dateKey}`;
    let day = await read(canonicalKey, null);
    let origin = 'saved';

    if (!hasPicks(day)) {
      day = null;
      for (const key of legacyKeys) {
        const legacy = await read(key, null);
        if (hasPicks(legacy)) {
          day = legacy;
          origin = 'legacy';
          break;
        }
      }
    }

    if (!day) {
      day = await create();
      origin = 'generated';
    }

    if (!hasPicks(day)) return { day, origin: 'empty' };

    if (origin !== 'saved') await write(canonicalKey, day);
    try {
      await ensureIndexed(dateKey);
    } catch (error) {
      // The dated archive is authoritative; a full index must not hide saved picks.
      console.warn('[Fast Score] Could not update the pick-history index', error);
    }
    return { day, origin };
  })();

  inFlightByDate.set(dateKey, request);
  return request.finally(() => {
    if (inFlightByDate.get(dateKey) === request) inFlightByDate.delete(dateKey);
  });
}

export function datesForPickHistory(index, today, earliest) {
  return [...new Set(Array.isArray(index) ? index : [])]
    .filter((date) => date >= earliest && date < today)
    .sort()
    .reverse();
}
