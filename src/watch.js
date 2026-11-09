// Follows the matches and teams you've starred and reports goals, kick-offs and full time.
// Used both while the app is open (every 30 s) and by the background task (about every 15 min);
// the last-seen score of each match is kept on disk so the two never announce the same event twice.
import { load, save } from './store';
import { sportByKey } from './sports';
import { pool, scoreboard } from './api/sportsData';
import { matchEvents } from './watchEvents';

const KEY = 'watch:sigs';

export async function checkFollowed(favs, onEvent) {
  if (!favs) return [];
  const today = new Date();
  const followed = new Set((favs.matches || []).map((m) => m.key));
  const teamIds = new Set((favs.teams || []).map((tm) => `${tm.sport}:${tm.teamId}`));
  const leagues = new Map();
  (favs.matches || []).forEach((m) => {
    if (Math.abs(new Date(m.date) - today) < 36 * 3600 * 1000 && !sportByKey(m.sport).field) leagues.set(`${m.sport}|${m.league}`, 1);
  });
  (favs.teams || []).forEach((tm) => leagues.set(`${tm.sport}|${tm.league}`, 1));
  if (!leagues.size) return [];
  const res = await pool([...leagues.keys()], 4, (k) => {
    const [s, l] = k.split('|');
    return scoreboard(s, l, today, 5000);
  });
  const sigs = await load(KEY, {});
  const events = [];
  res.forEach((r) =>
    (r ? r.items : []).forEach((m) => {
      if (m.kind !== 'match') return;
      const mine = followed.has(m.key) || teamIds.has(`${m.sport}:${m.home.id}`) || teamIds.has(`${m.sport}:${m.away.id}`);
      if (!mine) return;
      const score = `${m.home.score ?? ''}-${m.away.score ?? ''}`;
      const sig = `${m.state}|${score}`;
      const prev = sigs[m.key] && sigs[m.key].s;
      sigs[m.key] = { s: sig, t: Date.now() };
      if (!prev || prev === sig) return;
      events.push(...matchEvents(prev,m));
    })
  );
  // forget matches not seen for two days
  Object.keys(sigs).forEach((k) => Date.now() - sigs[k].t > 2 * 86400000 && delete sigs[k]);
  save(KEY, sigs);
  for (const ev of events) await onEvent(ev);
  return events;
}
