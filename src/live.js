// Hands the matches you follow to the phone's live-alert service (native, Android). It wakes a
// few minutes before each kick-off, checks the score every 30 seconds while the match is on and
// posts alerts for kick-off, goals, half-time and full time, even with the app closed.
import FastLive from '../modules/fast-live';
import { favMatch } from './components/match';
import { FS_SPORT } from './api/flashscore';
import { dayBoard, addDays } from './api/espn';

export const liveAvailable = () => !!FastLive;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function item(m) {
  const lg = String(m.league || '');
  let src = null;
  if (lg.startsWith('fs:')) src = 'fs';
  else if (!lg.startsWith('ss:') && !lg.startsWith('tsdb')) src = 'espn';
  if (!src || !m.eventId) return null;
  return {
    key: m.key,
    src,
    id: String(m.eventId),
    fsSport: FS_SPORT[m.sport] || 1,
    sport: m.sport,
    espnPath: src === 'espn' ? `${m.sport}/${lg}` : '',
    home: (m.home && (m.home.short || m.home.name)) || 'Home',
    away: (m.away && (m.away.short || m.away.name)) || 'Away',
    league: m.leagueName || '',
    date: new Date(m.date).getTime(),
    tap: JSON.stringify(favMatch(m)),
  };
}

/** Collect followed matches (and followed teams' games today/tomorrow) and give them to the service. */
export async function syncLive(favs, enabled = true) {
  if (!FastLive) return;
  try {
    FastLive.setEnabled(!!enabled);
    if (!enabled || !favs) return;
    const now = Date.now();
    const out = new Map();
    (favs.matches || []).forEach((m) => {
      const t = new Date(m.date).getTime();
      if (t > now - 4 * 3600 * 1000 && t < now + 7 * 86400 * 1000) {
        const it = item(m);
        if (it) out.set(it.key, it);
      }
    });
    const teams = favs.teams || [];
    if (teams.length) {
      const sports = [...new Set(teams.map((t) => t.sport))];
      const ids = new Set(teams.map((t) => `${t.sport}:${t.teamId}`));
      const names = new Set(teams.map((t) => `${t.sport}:${norm(t.name)}`));
      const mine = (m, side) => ids.has(`${m.sport}:${m[side].id}`) || names.has(`${m.sport}:${norm(m[side].name)}`);
      for (const s of sports) {
        for (const d of [new Date(), addDays(new Date(), 1)]) {
          try {
            const groups = await dayBoard(s, d, { ttl: 10 * 60 * 1000 });
            groups.forEach((g) =>
              g.items.forEach((m) => {
                if (m.kind !== 'match' || m.state === 'post' || !(mine(m, 'home') || mine(m, 'away'))) return;
                const it = item({ ...m, sport: s });
                if (it) out.set(it.key, it);
              })
            );
          } catch {}
        }
      }
    }
    FastLive.sync(JSON.stringify([...out.values()]));
  } catch {}
}

/** Matches the live service is handling (the app's own checks don't alert for these). */
export function trackedKeys() {
  try {
    return FastLive ? new Set(FastLive.trackedKeys()) : new Set();
  } catch {
    return new Set();
  }
}

/** Calls onOpen(match) when a live alert is tapped (including the one that opened the app). */
export function onLiveTap(onOpen) {
  if (!FastLive) return () => {};
  const take = (json) => {
    if (!json) return;
    try {
      onOpen(JSON.parse(json));
    } catch {}
  };
  try {
    take(FastLive.consumeTap());
  } catch {}
  const sub = FastLive.addListener ? FastLive.addListener('onTap', (e) => take(e && e.match)) : null;
  return () => sub && sub.remove();
}

export function batteryUnrestricted() {
  try {
    return FastLive ? FastLive.isIgnoringBattery() : true;
  } catch {
    return true;
  }
}

export function askBatteryUnrestricted() {
  try {
    FastLive && FastLive.requestIgnoreBattery();
  } catch {}
}
