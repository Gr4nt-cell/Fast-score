// ESPN's public sports API: free, no key, covers football (soccer), basketball, tennis, American
// football, baseball, hockey, MMA, motorsport, golf, rugby and volleyball.
// Two hosts serve the same data; when one starts refusing requests the other usually still
// works, so every call falls through to the next host.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPORTS, leagueMeta, sportByKey } from '../sports';
import * as tsdb from './sportsdb';

// 'auto' = ESPN, falling back to TheSportsDB when ESPN can't be reached; 'espn'; 'tsdb'
let MODE = 'auto';
let espnDownUntil = 0;
export function setSourceMode(m) {
  MODE = m || 'auto';
  espnDownUntil = 0;
}
const isTsdb = (league) => String(league || '').startsWith('tsdb');
const useTsdbFirst = () => MODE === 'tsdb' || (MODE === 'auto' && Date.now() < espnDownUntil);

const HOSTS = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
let preferred = 0;

const mem = new Map(); // key -> { t, data }
const inflight = new Map();

async function rawFetch(path, { webOnly = false, timeout = 12000 } = {}) {
  const order = webOnly ? [0] : [preferred, 1 - preferred];
  let lastErr;
  for (const i of order) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(HOSTS[i] + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!webOnly) preferred = i;
      return json;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Network error');
}

/** Cached GET. ttl in ms; `persist` also keeps it on disk for slow-changing data. */
export async function get(path, { ttl = 30000, persist = false, webOnly = false } = {}) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (persist && !hit) {
    try {
      const s = await AsyncStorage.getItem('c:' + path);
      if (s) {
        const p = JSON.parse(s);
        mem.set(path, p);
        if (Date.now() - p.t < ttl) return p.data;
      }
    } catch {}
  }
  if (inflight.has(path)) return inflight.get(path);
  const pr = rawFetch(path, { webOnly })
    .then((data) => {
      const entry = { t: Date.now(), data };
      mem.set(path, entry);
      if (persist) AsyncStorage.setItem('c:' + path, JSON.stringify(entry)).catch(() => {});
      return data;
    })
    .catch((e) => {
      // stale data beats no data
      const old = mem.get(path);
      if (old) return old.data;
      throw e;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, pr);
  return pr;
}

export async function clearCache() {
  mem.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith('c:')));
  } catch {}
}

// run async jobs with a concurrency cap
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try {
        out[k] = await fn(items[k], k);
      } catch {
        out[k] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- dates ----------

export const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const sameDay = (a, b) => ymd(a) === ymd(b);

// ---------- normalisation ----------

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function scoreOf(c) {
  if (c.score == null) return null;
  if (typeof c.score === 'object') return c.score.displayValue ?? (c.score.value != null ? String(c.score.value) : null);
  return String(c.score);
}

export function competitor(c = {}) {
  const team = c.team || {};
  const ath = c.athlete || (c.athletes && c.athletes[0]) || {};
  const isAthlete = !c.team && !!(c.athlete || c.athletes);
  const name = team.displayName || ath.displayName || ath.fullName || c.displayName || team.name || 'TBD';
  const logo =
    team.logo ||
    (team.logos && team.logos[0] && team.logos[0].href) ||
    (ath.headshot && (ath.headshot.href || ath.headshot)) ||
    (ath.flag && ath.flag.href) ||
    null;
  const record = (c.records && c.records[0] && c.records[0].summary) || (c.record && (c.record.displayValue || (Array.isArray(c.record) && c.record[0] && c.record[0].displayValue))) || null;
  return {
    id: String(team.id || ath.id || c.id || name),
    name,
    short: team.shortDisplayName || ath.shortName || name,
    abbr: team.abbreviation || (ath.shortName ? ath.shortName.split(' ').pop().slice(0, 3).toUpperCase() : name.slice(0, 3).toUpperCase()),
    logo: typeof logo === 'string' ? logo : null,
    flag: ath.flag && ath.flag.href,
    color: team.color ? '#' + team.color : null,
    score: scoreOf(c),
    winner: !!c.winner,
    homeAway: c.homeAway,
    order: c.order,
    form: c.form || null,
    record,
    rank: c.curatedRank && c.curatedRank.current < 99 ? c.curatedRank.current : c.seed || null,
    linescores: (c.linescores || []).map((l) => (l.displayValue != null ? l.displayValue : l.value != null ? String(l.value) : '')),
    tiebreaks: (c.linescores || []).map((l) => (l.tiebreak != null ? String(l.tiebreak) : null)),
    position: c.status && c.status.position ? c.status.position.displayName : null,
    thru: c.status && (c.status.thru != null ? c.status.thru : c.status.displayValue),
    isAthlete,
    athleteId: ath.id ? String(ath.id) : null,
    teamId: team.id ? String(team.id) : null,
    stats: c.statistics || [],
  };
}

function oddsOf(comp) {
  const o = comp && comp.odds && comp.odds[0];
  if (!o) return null;
  const ml = (side) => {
    if (!o) return null;
    const a = o[side + 'TeamOdds'];
    if (a && a.moneyLine != null) return num(a.moneyLine);
    const m = o.moneyline && o.moneyline[side];
    if (m) return num((m.close && m.close.odds) || (m.open && m.open.odds));
    return null;
  };
  let draw = o.drawOdds && o.drawOdds.moneyLine != null ? num(o.drawOdds.moneyLine) : null;
  if (draw == null && o.moneyline && o.moneyline.draw) draw = num((o.moneyline.draw.close || o.moneyline.draw.open || {}).odds);
  return {
    provider: (o.provider && o.provider.name) || 'Odds',
    details: o.details || null,
    overUnder: o.overUnder != null ? Number(o.overUnder) : null,
    home: ml('home'),
    away: ml('away'),
    draw,
  };
}

function statusOf(s = {}, date) {
  const type = s.type || {};
  const state = type.state || 'pre';
  let short = type.shortDetail || type.detail || '';
  if (state === 'pre') {
    const d = new Date(date);
    if (!type.name || type.name === 'STATUS_SCHEDULED') short = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return {
    state,
    completed: !!type.completed,
    name: type.name || '',
    detail: type.detail || type.description || '',
    short,
    clock: s.displayClock || null,
    period: s.period || 0,
    postponed: /POSTPONED|CANCELED|CANCELLED|SUSPENDED|DELAYED/.test(type.name || ''),
  };
}

function detailsOf(comp) {
  return (comp.details || []).map((d) => ({
    type: (d.type && d.type.text) || '',
    clock: (d.clock && d.clock.displayValue) || '',
    teamId: d.team && String(d.team.id),
    player: d.athletesInvolved && d.athletesInvolved[0] ? d.athletesInvolved[0].displayName : '',
    scoring: !!d.scoringPlay,
    red: !!d.redCard,
    yellow: !!d.yellowCard,
    pen: !!d.penaltyKick,
    own: !!d.ownGoal,
  }));
}

function soccerClock(st) {
  // soccer: "45'+2" style clock instead of ESPN's long detail
  if (st.state !== 'in') return st;
  if (/HALFTIME|HALF_TIME/.test(st.name)) return { ...st, short: 'HT' };
  if (st.clock) return { ...st, short: st.clock };
  return st;
}

/** One ESPN event -> one or more list items. */
export function normalizeEvent(e, sport, slug, leagueName) {
  const sp = sportByKey(sport);
  const meta = leagueMeta(sport, slug);
  const base = {
    sport,
    league: slug,
    leagueName: leagueName || meta.name,
    country: meta.country,
    eventId: String(e.id),
    eventName: e.name || e.shortName || '',
  };

  // tennis / some MMA: groupings -> competitions, one per match
  const comps = [];
  if (e.groupings && e.groupings.length) {
    e.groupings.forEach((g) => (g.competitions || []).forEach((c) => comps.push({ c, group: (g.grouping && g.grouping.displayName) || '' })));
  } else {
    (e.competitions || []).forEach((c) => comps.push({ c, group: '' }));
  }

  if (sp.field) {
    // golf / motorsport: a whole field of competitors, shown as one leaderboard
    const c = comps.find((x) => x.c.type && /race/i.test(x.c.type.abbreviation || x.c.type.text || '')) || comps[comps.length - 1] || { c: {} };
    let st = statusOf(c.c.status || e.status, e.date);
    if (!c.c.status && e.status) st = statusOf(e.status, e.date);
    const field = (c.c.competitors || []).map(competitor).sort((a, b) => (a.order || 999) - (b.order || 999));
    return [
      {
        ...base,
        key: `${sport}:${slug}:${e.id}`,
        id: String(e.id),
        kind: 'field',
        date: e.date,
        endDate: e.endDate,
        ...st,
        status: st,
        field,
        venue: (c.c.venue && c.c.venue.fullName) || (e.venues && e.venues[0] && e.venues[0].fullName) || (e.circuit && e.circuit.fullName) || '',
        sessions: comps.map((x) => ({ name: (x.c.type && (x.c.type.text || x.c.type.abbreviation)) || 'Session', date: x.c.date, state: x.c.status && x.c.status.type && x.c.status.type.state })),
      },
    ];
  }

  return comps.map(({ c, group }) => {
    let st = statusOf(c.status || e.status, c.date || e.date);
    if (sport === 'soccer') st = soccerClock(st);
    const cs = (c.competitors || []).map(competitor);
    let home = cs.find((x) => x.homeAway === 'home');
    let away = cs.find((x) => x.homeAway === 'away');
    if (!home || !away) {
      const sorted = [...cs].sort((a, b) => (a.order || 0) - (b.order || 0));
      home = sorted[0] || competitor({});
      away = sorted[1] || competitor({});
    }
    const venue = c.venue || {};
    return {
      ...base,
      key: `${sport}:${slug}:${c.id || e.id}`,
      id: String(sp.individual ? c.id || e.id : e.id),
      compId: String(c.id || e.id),
      kind: 'match',
      group: group || (sp.individual && comps.length > 1 ? base.eventName : ''),
      date: c.date || e.date,
      ...st,
      status: st,
      home,
      away,
      // individual sports list the first competitor on top, team sports list home first in
      // SofaScore's style (home on the left/top)
      individual: !!sp.individual,
      neutral: !!c.neutralSite,
      venue: venue.fullName ? `${venue.fullName}${venue.address && venue.address.city ? ', ' + venue.address.city : ''}` : '',
      odds: oddsOf(c),
      details: detailsOf(c),
      note: c.notes && c.notes[0] ? c.notes[0].headline : '',
      broadcast: c.broadcasts && c.broadcasts[0] && c.broadcasts[0].names ? c.broadcasts[0].names.join(', ') : '',
      round: (c.type && c.type.text) || (c.round && c.round.displayName) || '',
    };
  });
}

// ---------- endpoints ----------

const site = (sport, league) => `/apis/site/v2/sports/${sport}/${league}`;

export async function scoreboard(sport, league, date, ttl = 30000) {
  if (isTsdb(league)) return tsdb.leagueDay(sport, league, date || new Date());
  const q = date ? `?dates=${ymd(date)}&limit=300` : '?limit=300';
  const json = await get(`${site(sport, league)}/scoreboard${q}`, { ttl });
  const lg = json.leagues && json.leagues[0];
  const name = (lg && (lg.shortName || lg.name)) || leagueMeta(sport, league).name;
  const logo = lg && lg.logos && lg.logos[0] && lg.logos[0].href;
  const items = (json.events || []).flatMap((e) => normalizeEvent(e, sport, league, leagueMeta(sport, league).name || name));
  return { league: { slug: league, sport, name: leagueMeta(sport, league).name || name, logo, season: lg && lg.season }, items };
}

/**
 * Every match of a sport on a local calendar day, grouped by competition.
 * Returns [{ league, items }] with competitions that have nothing that day left out.
 */
export async function dayBoard(sportKey, date, { ttl = 30000, leagues } = {}) {
  const sp = sportByKey(sportKey);
  const fallback = async () => {
    const r = await tsdb.dayBoard(sp.key, date, ttl);
    r.source = 'tsdb';
    return r;
  };
  if (useTsdbFirst()) return fallback();
  const list = leagues || sp.leagues;
  const jobs = [];
  list.forEach((l) => {
    jobs.push({ l, d: date });
    if (l.am && !sp.multiDay) jobs.push({ l, d: addDays(date, -1) });
  });
  const res = await pool(jobs, 8, (j) => scoreboard(sp.key, j.l.slug, j.d, ttl));
  if (jobs.length && res.every((r) => !r)) {
    // ESPN unreachable: switch to TheSportsDB for the next few minutes
    if (MODE === 'auto') {
      espnDownUntil = Date.now() + 5 * 60 * 1000;
      return fallback();
    }
    throw new Error('ESPN could not be reached');
  }
  const byLeague = new Map();
  res.forEach((r, i) => {
    if (!r) return;
    const slug = jobs[i].l.slug;
    const cur = byLeague.get(slug) || { league: r.league, items: [] };
    if (r.league.logo) cur.league.logo = r.league.logo;
    r.items.forEach((it) => {
      if (!sp.multiDay && !sameDay(new Date(it.date), date) && it.state !== 'in') return;
      if (!cur.items.find((x) => x.key === it.key)) cur.items.push(it);
    });
    byLeague.set(slug, cur);
  });
  const out = [];
  list.forEach((l) => {
    const g = byLeague.get(l.slug);
    if (g && g.items.length) {
      g.items.sort((a, b) => new Date(a.date) - new Date(b.date));
      out.push(g);
    }
  });
  out.source = 'espn';
  return out;
}

export async function summary(sport, league, eventId, ttl = 15000) {
  if (isTsdb(league)) return tsdb.summary(sport, eventId);
  return get(`${site(sport, league)}/summary?event=${eventId}`, { ttl });
}

/** Standings of a competition as groups of rows. */
export async function standings(sport, league, ttl = 10 * 60 * 1000) {
  if (isTsdb(league)) return tsdb.standings(league);
  const json = await get(`/apis/v2/sports/${sport}/${league}/standings`, { ttl, persist: true });
  return parseStandings(json);
}

export function parseStandings(json) {
  const groups = [];
  const walk = (node, name) => {
    if (!node) return;
    if (node.standings && node.standings.entries && node.standings.entries.length) {
      groups.push({ name: node.name || node.abbreviation || name || '', rows: node.standings.entries.map(row) });
    }
    (node.children || []).forEach((ch) => walk(ch, ch.name));
  };
  walk(json, json && json.name);
  return groups;
}

function row(e) {
  const stats = {};
  (e.stats || []).forEach((s) => {
    const k = s.name || s.abbreviation || s.type;
    stats[k] = s.displayValue != null ? s.displayValue : s.value;
    if (s.value != null) stats[k + '_v'] = s.value;
    if (s.type && s.summary) stats[s.type] = s.summary;
  });
  const team = e.team || {};
  const v = (k) => (stats[k + '_v'] != null ? Number(stats[k + '_v']) : num(stats[k]));
  return {
    teamId: String(team.id || (e.athlete && e.athlete.id) || ''),
    name: team.displayName || team.name || (e.athlete && e.athlete.displayName) || '',
    short: team.shortDisplayName || team.abbreviation || team.displayName || '',
    logo: (team.logos && team.logos[0] && team.logos[0].href) || null,
    note: e.note ? { color: e.note.color, text: e.note.description } : null,
    gp: v('gamesPlayed'),
    w: v('wins'),
    d: v('ties'),
    l: v('losses'),
    gf: v('pointsFor'),
    ga: v('pointsAgainst'),
    gd: v('pointDifferential'),
    pts: v('points'),
    rank: v('rank') || v('playoffSeed'),
    pct: v('winPercent'),
    gb: stats.gamesBehind,
    streak: stats.streak,
    otl: v('otLosses') || v('overtimeLosses'),
    home: stats.home || stats.Home,
    road: stats.road || stats.away,
    raw: stats,
  };
}

export async function teams(sport, league) {
  if (isTsdb(league)) return [];
  const json = await get(`${site(sport, league)}/teams?limit=500`, { ttl: 24 * 3600 * 1000, persist: true });
  const lst = (json.sports && json.sports[0] && json.sports[0].leagues && json.sports[0].leagues[0] && json.sports[0].leagues[0].teams) || [];
  return lst.map((x) => {
    const t = x.team || x;
    return { id: String(t.id), name: t.displayName, short: t.shortDisplayName, abbr: t.abbreviation, logo: t.logos && t.logos[0] && t.logos[0].href, sport, league };
  });
}

export async function team(sport, league, id) {
  if (isTsdb(league)) return tsdb.team(id);
  const json = await get(`${site(sport, league)}/teams/${id}`, { ttl: 10 * 60 * 1000 });
  return json.team || {};
}

export async function teamSchedule(sport, league, id) {
  if (isTsdb(league)) return tsdb.teamSchedule(sport, id);
  const urls = [`${site(sport, league)}/teams/${id}/schedule`];
  if (sport === 'soccer') urls.push(`${site(sport, league)}/teams/${id}/schedule?fixture=true`);
  const res = await pool(urls, 2, (u) => get(u, { ttl: 60000 }));
  const seen = new Set();
  const out = [];
  res.forEach((json) => {
    if (!json) return;
    (json.events || []).forEach((e) => {
      const slugGuess = (e.league && e.league.slug) || league;
      normalizeEvent(e, sport, slugGuess, (e.league && (e.league.shortName || e.league.name)) || (e.seasonType && e.seasonType.name)).forEach((it) => {
        if (!seen.has(it.key)) {
          seen.add(it.key);
          out.push(it);
        }
      });
    });
  });
  out.sort((a, b) => new Date(a.date) - new Date(b.date));
  return out;
}

export async function roster(sport, league, id) {
  if (isTsdb(league)) return tsdb.roster(id);
  const json = await get(`${site(sport, league)}/teams/${id}/roster`, { ttl: 6 * 3600 * 1000, persist: true });
  const groups = [];
  const ath = json.athletes || [];
  const toP = (a) => ({
    id: String(a.id),
    name: a.displayName || a.fullName,
    jersey: a.jersey,
    pos: (a.position && (a.position.displayName || a.position.abbreviation)) || '',
    posAbbr: (a.position && a.position.abbreviation) || '',
    age: a.age,
    flag: a.flag && a.flag.href,
    country: a.citizenship || (a.birthPlace && a.birthPlace.country) || '',
    headshot: a.headshot && a.headshot.href,
  });
  if (ath.length && ath[0].items) {
    ath.forEach((g) => groups.push({ name: g.position || g.displayName || '', players: (g.items || []).map(toP) }));
  } else {
    const byPos = {};
    ath.map(toP).forEach((p) => {
      const k = p.pos || 'Players';
      (byPos[k] = byPos[k] || []).push(p);
    });
    const order = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
    Object.keys(byPos)
      .sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9))
      .forEach((k) => groups.push({ name: k, players: byPos[k] }));
  }
  return { groups, coach: json.coach && json.coach[0] ? `${json.coach[0].firstName || ''} ${json.coach[0].lastName || ''}`.trim() : '' };
}

export async function news(sport, league, limit = 25) {
  if (isTsdb(league)) return [];
  const json = await get(`${site(sport, league)}/news?limit=${limit}`, { ttl: 5 * 60 * 1000 });
  return (json.articles || []).map((a) => ({
    id: String(a.id || a.headline),
    title: a.headline,
    body: a.description,
    image: a.images && a.images[0] && a.images[0].url,
    date: a.published,
    url: a.links && a.links.web && a.links.web.href,
    sport,
    league,
  }));
}

export async function athlete(sport, league, id) {
  if (isTsdb(league)) return tsdb.player(id);
  const paths = [`/apis/common/v3/sports/${sport}/${league}/athletes/${id}`, `/apis/common/v3/sports/${sport}/athletes/${id}`];
  let a = null;
  for (const p of paths) {
    try {
      const j = await get(p, { ttl: 3600 * 1000, webOnly: true });
      a = j.athlete || j;
      if (a) break;
    } catch {}
  }
  let overview = null;
  try {
    overview = await get(`/apis/common/v3/sports/${sport}/${league}/athletes/${id}/overview`, { ttl: 3600 * 1000, webOnly: true });
  } catch {}
  let gamelog = null;
  try {
    gamelog = await get(`/apis/common/v3/sports/${sport}/${league}/athletes/${id}/gamelog`, { ttl: 3600 * 1000, webOnly: true });
  } catch {}
  return { athlete: a || {}, overview, gamelog };
}

/** Search ESPN and TheSportsDB together; either may come back empty. */
export async function search(q) {
  const [a, b] = await Promise.all([MODE === 'tsdb' ? [] : espnSearch(q), MODE === 'espn' ? [] : tsdb.search(q).catch(() => [])]);
  const seen = new Set(a.map((x) => x.type + norm(x.name)));
  return [...a, ...b.filter((x) => !seen.has(x.type + norm(x.name)))];
}
const norm = (s) => String(s || '').toLowerCase();

async function espnSearch(q) {
  try {
    const j = await get(`/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=30&mode=prefix`, { ttl: 60000, webOnly: true });
    const out = [];
    const items = j.items || (j.results || []).flatMap((r) => (r.contents || []).map((c) => ({ ...c, type: c.type || r.type })));
    items.forEach((it) => {
      const uid = it.uid || '';
      const sportName = (it.sport || it.defaultSport || '').toLowerCase();
      const league = it.league || it.defaultLeagueSlug || (it.leagueRelationships && it.leagueRelationships[0] && it.leagueRelationships[0].slug);
      const type = (it.type || '').toLowerCase();
      const id = it.id || (uid.match(/[at]:(\d+)/) || [])[1];
      const img = it.image && (it.image.default || it.image.href) || (it.logos && it.logos[0] && it.logos[0].href) || it.headshot && it.headshot.href;
      if (!id) return;
      out.push({
        type: /player|athlete/.test(type) ? 'player' : /team/.test(type) ? 'team' : type,
        id: String(id),
        name: it.displayName || it.name,
        sub: it.subtitle || it.description || (it.teamRelationships && it.teamRelationships[0] && it.teamRelationships[0].displayName) || '',
        image: img,
        sport: sportName,
        league: league || '',
      });
    });
    return out.filter((x) => x.sport && SPORTS.find((s) => s.key === x.sport));
  } catch {
    return [];
  }
}
