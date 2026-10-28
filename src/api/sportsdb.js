// TheSportsDB (https://www.thesportsdb.com) — the second free source. The public key "123"
// needs no sign-up. It is used when ESPN can't be reached, or always if chosen in Settings.
// Limits: 30 requests a minute on the free key, so calls are spaced and cached.
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = 'https://www.thesportsdb.com/api/v1/json/123/';
const MAX_PER_MIN = 25;

export const TSDB_SPORT = {
  soccer: 'Soccer',
  basketball: 'Basketball',
  tennis: 'Tennis',
  football: 'American Football',
  baseball: 'Baseball',
  hockey: 'Ice Hockey',
  mma: 'Fighting',
  racing: 'Motorsport',
  golf: 'Golf',
  rugby: 'Rugby',
  volleyball: 'Volleyball',
};
export const sportFromTsdb = (name) => Object.keys(TSDB_SPORT).find((k) => TSDB_SPORT[k] === name) || null;

const mem = new Map();
const inflight = new Map();
const stamps = [];

async function slot() {
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60000) stamps.shift();
    if (stamps.length < MAX_PER_MIN) {
      stamps.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60000 - (now - stamps[0]) + 50));
  }
}

async function get(path, ttl = 60000, persist = false) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (persist && !hit) {
    try {
      const s = await AsyncStorage.getItem('t:' + path);
      if (s) {
        const p = JSON.parse(s);
        mem.set(path, p);
        if (Date.now() - p.t < ttl) return p.data;
      }
    } catch {}
  }
  if (inflight.has(path)) return inflight.get(path);
  const pr = (async () => {
    await slot();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(BASE + path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      const entry = { t: Date.now(), data };
      mem.set(path, entry);
      if (persist) AsyncStorage.setItem('t:' + path, JSON.stringify(entry)).catch(() => {});
      return data;
    } catch (e) {
      const old = mem.get(path);
      if (old) return old.data;
      throw e;
    } finally {
      clearTimeout(timer);
      inflight.delete(path);
    }
  })();
  inflight.set(path, pr);
  return pr;
}

const ymdDash = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (v) => (v == null || v === '' ? null : Number(v));

function when(e) {
  if (e.strTimestamp) return new Date(/Z|[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : e.strTimestamp + 'Z').toISOString();
  if (e.dateEvent) return new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`).toISOString();
  return new Date().toISOString();
}

function statusOf(e) {
  const s = String(e.strStatus || '').trim();
  const up = s.toUpperCase();
  if (/POSTPONED|CANCEL|ABANDON|SUSPEND|DELAY/.test(up) || e.strPostponed === 'yes') return { state: 'pre', short: up.startsWith('POST') ? 'PPD' : s, detail: s, postponed: true, completed: false };
  if (!s || up === 'NS' || /NOT STARTED|SCHEDULED|TBD/.test(up)) {
    const d = new Date(when(e));
    return { state: 'pre', short: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), detail: 'Not started', completed: false };
  }
  if (/^(FT|AET|PEN|AP|AOT|FINISHED|MATCH FINISHED|FINAL|ENDED|AWARDED)/.test(up) || /FINISHED/.test(up)) return { state: 'post', short: up === 'AET' ? 'AET' : up === 'PEN' ? 'PEN' : 'FT', detail: s, completed: true };
  if (up === 'HT') return { state: 'in', short: 'HT', detail: 'Half-time', completed: false };
  const prog = e.strProgress ? `${String(e.strProgress).replace(/'$/, '')}'` : s;
  return { state: 'in', short: prog, detail: s, completed: false };
}

function side(e, which) {
  const H = which === 'home';
  const name = (H ? e.strHomeTeam : e.strAwayTeam) || (e.strEvent || '').split(/ vs\.? /i)[H ? 0 : 1] || 'TBD';
  return {
    id: String((H ? e.idHomeTeam : e.idAwayTeam) || name),
    name,
    short: name,
    abbr: name.slice(0, 3).toUpperCase(),
    logo: (H ? e.strHomeTeamBadge : e.strAwayTeamBadge) || null,
    color: null,
    score: (H ? e.intHomeScore : e.intAwayScore) != null ? String(H ? e.intHomeScore : e.intAwayScore) : null,
    winner: false,
    homeAway: which,
    form: null,
    record: null,
    rank: null,
    linescores: [],
    tiebreaks: [],
    isAthlete: false,
    athleteId: null,
    teamId: String((H ? e.idHomeTeam : e.idAwayTeam) || ''),
    stats: [],
  };
}

export function normalize(e, sport) {
  const st = statusOf(e);
  const home = side(e, 'home');
  const away = side(e, 'away');
  if (st.state === 'post' && home.score != null && away.score != null) {
    home.winner = Number(home.score) > Number(away.score);
    away.winner = Number(away.score) > Number(home.score);
  }
  const field = sport === 'golf' || sport === 'racing';
  return {
    source: 'tsdb',
    sport,
    league: 'tsdb:' + e.idLeague,
    leagueName: e.strLeague || 'Other',
    leagueLogo: e.strLeagueBadge || null,
    country: e.strCountry || '',
    eventId: String(e.idEvent),
    eventName: e.strEvent || '',
    key: `${sport}:tsdb:${e.idEvent}`,
    id: String(e.idEvent),
    compId: String(e.idEvent),
    kind: field ? 'field' : 'match',
    field: [],
    group: '',
    date: when(e),
    ...st,
    clock: null,
    period: 0,
    status: { name: st.detail || '' },
    home,
    away,
    individual: sport === 'tennis' || sport === 'mma',
    neutral: false,
    venue: [e.strVenue, e.strCity].filter(Boolean).join(', '),
    odds: null,
    details: [],
    note: '',
    broadcast: '',
    round: e.intRound ? `Round ${e.intRound}` : '',
  };
}

/** All events of a sport on a local day, grouped by competition (same shape as ESPN's dayBoard). */
export async function dayBoard(sport, date, ttl = 60000) {
  const name = TSDB_SPORT[sport];
  if (!name) return [];
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  const days = [date, prev];
  const events = [];
  for (const d of days) {
    try {
      const j = await get(`eventsday.php?d=${ymdDash(d)}&s=${encodeURIComponent(name)}`, ttl);
      (j.events || []).forEach((e) => events.push(e));
    } catch (err) {
      if (d === date) throw err;
    }
  }
  const sameLocalDay = (iso) => {
    const x = new Date(iso);
    return x.getFullYear() === date.getFullYear() && x.getMonth() === date.getMonth() && x.getDate() === date.getDate();
  };
  const by = new Map();
  const seen = new Set();
  events.forEach((e) => {
    if (seen.has(e.idEvent)) return;
    seen.add(e.idEvent);
    const m = normalize(e, sport);
    if (!sameLocalDay(m.date) && m.state !== 'in') return;
    const g = by.get(m.league) || { league: { slug: m.league, sport, name: m.leagueName, logo: m.leagueLogo }, items: [] };
    g.items.push(m);
    by.set(m.league, g);
  });
  const out = [...by.values()];
  out.forEach((g) => g.items.sort((a, b) => new Date(a.date) - new Date(b.date)));
  out.sort((a, b) => b.items.length - a.items.length);
  return out;
}

export async function leagueDay(sport, leagueSlug, date) {
  const id = leagueSlug.replace('tsdb:', '');
  const all = await dayBoard(sport, date);
  const g = all.find((x) => x.league.slug === 'tsdb:' + id);
  let name = g && g.league.name;
  if (!name) {
    try {
      const j = await get(`lookupleague.php?id=${id}`, 24 * 3600 * 1000, true);
      name = j.leagues && j.leagues[0] && j.leagues[0].strLeague;
    } catch {}
  }
  return { league: { slug: leagueSlug, sport, name: name || 'Competition', logo: g && g.league.logo }, items: g ? g.items : [] };
}

/** Match details in the shape the match screen reads from ESPN's summary */
export async function summary(sport, eventId) {
  const [ev, tl, stats, lu] = await Promise.all([
    get(`lookupevent.php?id=${eventId}`, 15000).catch(() => ({})),
    get(`lookuptimeline.php?id=${eventId}`, 30000).catch(() => ({})),
    get(`lookupeventstats.php?id=${eventId}`, 30000).catch(() => ({})),
    get(`lookuplineup.php?id=${eventId}`, 10 * 60000).catch(() => ({})),
  ]);
  const e = ev.events && ev.events[0];
  const match = e ? normalize(e, sport) : null;
  const hid = match ? match.home.id : '';
  const aid = match ? match.away.id : '';
  const keyEvents = (tl.timeline || []).map((x) => {
    const kind = x.strTimelineDetail || x.strTimeline || '';
    const home = x.strHome === 'Yes';
    const sub = /subst/i.test(x.strTimeline || '');
    return {
      type: { text: sub ? 'Substitution' : kind, type: sub ? 'substitution' : kind },
      clock: { displayValue: x.intTime != null ? `${x.intTime}'` : '' },
      team: { id: home ? hid : aid },
      participants: [x.strPlayer, x.strAssist].filter(Boolean).map((n) => ({ athlete: { displayName: n } })),
      scoringPlay: /goal/i.test(x.strTimeline || '') && !/miss/i.test(kind),
      text: kind,
    };
  });
  const st = stats.eventstats || [];
  const clean = (v) => (v == null ? '' : String(v).replace('%', ''));
  const boxscore = st.length
    ? {
        teams: [
          { homeAway: 'home', team: { id: hid }, statistics: st.map((s) => ({ name: s.strStat, label: s.strStat, displayValue: clean(s.intHome) })) },
          { homeAway: 'away', team: { id: aid }, statistics: st.map((s) => ({ name: s.strStat, label: s.strStat, displayValue: clean(s.intAway) })) },
        ],
      }
    : undefined;
  const pos = (p) => {
    const s = String(p.strPositionShort || p.strPosition || '').toUpperCase();
    if (/^G/.test(s)) return 'G';
    if (/^D|BACK/.test(s)) return 'D';
    if (/^M/.test(s)) return 'M';
    if (/^F|^S|^A|WING|STRIKER/.test(s)) return 'F';
    return s.slice(0, 3);
  };
  const lineup = lu.lineup || [];
  const rosters = lineup.length
    ? ['home', 'away'].map((ha) => ({
        homeAway: ha,
        team: { id: ha === 'home' ? hid : aid, displayName: match ? match[ha].name : '' },
        formation: null,
        roster: lineup
          .filter((p) => (p.strHome === 'Yes') === (ha === 'home'))
          .map((p, i) => ({
            starter: p.strSubstitute !== 'Yes',
            jersey: p.intSquadNumber,
            athlete: { id: p.idPlayer, displayName: p.strPlayer, lastName: String(p.strPlayer || '').split(' ').pop() },
            position: { abbreviation: pos(p), displayName: p.strPosition },
            formationPlace: i + 1,
          })),
      }))
    : undefined;
  return {
    __match: match,
    keyEvents,
    boxscore,
    rosters,
    gameInfo: e ? { venue: e.strVenue ? { fullName: e.strVenue, address: { city: e.strCity } } : null, attendance: e.intSpectators, officials: e.strOfficial ? [{ displayName: e.strOfficial }] : [] } : {},
    videos: e && e.strVideo ? [{ url: e.strVideo }] : [],
  };
}

export async function standings(leagueSlug) {
  const id = leagueSlug.replace('tsdb:', '');
  const j = await get(`lookuptable.php?l=${id}`, 10 * 60000, true);
  const rows = (j.table || []).map((r) => ({
    teamId: String(r.idTeam),
    name: r.strTeam,
    short: r.strTeam,
    logo: r.strBadge || r.strTeamBadge || null,
    note: r.strDescription ? { color: null, text: r.strDescription } : null,
    gp: num(r.intPlayed),
    w: num(r.intWin),
    d: num(r.intDraw),
    l: num(r.intLoss),
    gf: num(r.intGoalsFor),
    ga: num(r.intGoalsAgainst),
    gd: num(r.intGoalDifference),
    pts: num(r.intPoints),
    rank: num(r.intRank),
    form: r.strForm,
    raw: r,
  }));
  return rows.length ? [{ name: (j.table[0] && j.table[0].strGroup) || '', rows }] : [];
}

export async function team(id) {
  const j = await get(`lookupteam.php?id=${id}`, 3600 * 1000, true);
  const t = (j.teams && j.teams[0]) || {};
  return {
    id: t.idTeam,
    displayName: t.strTeam,
    logos: t.strBadge || t.strTeamBadge ? [{ href: t.strBadge || t.strTeamBadge }] : [],
    venue: t.strStadium ? { fullName: t.strStadium } : null,
    standingSummary: t.strLeague,
  };
}

export async function teamSchedule(sport, id) {
  const [last, next] = await Promise.all([get(`eventslast.php?id=${id}`, 5 * 60000).catch(() => ({})), get(`eventsnext.php?id=${id}`, 5 * 60000).catch(() => ({}))]);
  const evs = [...(last.results || last.events || []), ...(next.events || [])];
  const seen = new Set();
  return evs
    .filter((e) => (seen.has(e.idEvent) ? false : seen.add(e.idEvent)))
    .map((e) => normalize(e, sport))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function roster(id) {
  const j = await get(`lookup_all_players.php?id=${id}`, 6 * 3600 * 1000, true).catch(() => ({}));
  const by = {};
  (j.player || []).forEach((p) => {
    const k = p.strPosition || 'Players';
    (by[k] = by[k] || []).push({
      id: String(p.idPlayer),
      name: p.strPlayer,
      jersey: p.strNumber,
      pos: p.strPosition,
      posAbbr: (p.strPosition || '').slice(0, 3).toUpperCase(),
      country: p.strNationality,
      headshot: p.strCutout || p.strThumb,
    });
  });
  return { groups: Object.keys(by).map((k) => ({ name: k, players: by[k] })), coach: '' };
}

export async function player(id) {
  const j = await get(`lookupplayer.php?id=${id}`, 3600 * 1000, true);
  const p = (j.players && j.players[0]) || {};
  return {
    athlete: {
      displayName: p.strPlayer,
      headshot: p.strCutout || p.strThumb ? { href: p.strCutout || p.strThumb } : null,
      position: p.strPosition ? { displayName: p.strPosition } : null,
      jersey: p.strNumber,
      citizenship: p.strNationality,
      displayDOB: p.dateBorn,
      displayHeight: p.strHeight,
      displayWeight: p.strWeight,
      displayBirthPlace: p.strBirthLocation,
      team: p.strTeam ? { displayName: p.strTeam, id: p.idTeam } : null,
    },
    overview: null,
    gamelog: null,
  };
}

export async function search(q) {
  const out = [];
  const [t, p] = await Promise.all([
    get(`searchteams.php?t=${encodeURIComponent(q)}`, 5 * 60000).catch(() => ({})),
    get(`searchplayers.php?p=${encodeURIComponent(q)}`, 5 * 60000).catch(() => ({})),
  ]);
  (t.teams || []).forEach((x) => {
    const sport = sportFromTsdb(x.strSport);
    if (sport) out.push({ type: 'team', id: String(x.idTeam), name: x.strTeam, sub: x.strLeague, image: x.strBadge || x.strTeamBadge, sport, league: 'tsdb:' + x.idLeague });
  });
  (p.player || []).forEach((x) => {
    const sport = sportFromTsdb(x.strSport);
    if (sport) out.push({ type: 'player', id: String(x.idPlayer), name: x.strPlayer, sub: x.strTeam, image: x.strCutout || x.strThumb, sport, league: 'tsdb' });
  });
  return out;
}
