const ACTIVE_POLL_MS = 15000;
const NEAR_KICKOFF_MS = 15 * 60 * 1000;
const REFRESH_BEFORE_KICKOFF_MS = 30000;
const MATCH_LIFETIME_MS = 6 * 60 * 60 * 1000;

export function fixtureRefreshPlan(groups, now = Date.now()) {
  let anyLive = false;
  let stalePre = false;
  let nextKickoff = null;

  for (const group of groups || []) {
    for (const match of group.items || []) {
      if (match.state === 'in') anyLive = true;
      if (match.state !== 'pre') continue;
      const kickoff = new Date(match.date).getTime();
      if (!Number.isFinite(kickoff)) continue;
      if (kickoff <= now && now - kickoff < MATCH_LIFETIME_MS) stalePre = true;
      if (kickoff > now && (nextKickoff == null || kickoff < nextKickoff)) nextKickoff = kickoff;
    }
  }

  const nearKickoff = nextKickoff != null && nextKickoff - now <= NEAR_KICKOFF_MS;
  const pollIntervalMs = anyLive || stalePre || nearKickoff ? ACTIVE_POLL_MS : null;
  const refreshAt = !pollIntervalMs && nextKickoff != null
    ? Math.max(now + ACTIVE_POLL_MS, nextKickoff - REFRESH_BEFORE_KICKOFF_MS)
    : null;

  return { pollIntervalMs, refreshAt };
}
