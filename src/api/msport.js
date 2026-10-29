// Odds from MSport Ghana (msport.com/gh), read from the JSON its website loads. Every request
// carries the site's "operId" (3 = Ghana). MSport uses Sportradar ids, so its matches are paired
// with ours by team names and kick-off time.

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = 'https://www.msport.com/api/gh/facts-center/query/frontend';
const HEADERS = { operId: '3', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
const SR_SPORT = { soccer: 1, basketball: 2, baseball: 3, hockey: 4, tennis: 5, rugby: 12, football: 16, volleyball: 23 };
export const msSupports = (sport) => !!SR_SPORT[sport];

const mem = new Map();
const inflight = new Map();

async function getJson(path, ttl) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (inflight.has(path)) return inflight.get(path);
  const pr = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(BASE + path, { headers: HEADERS, signal: ctrl.signal });
      if (!res.ok) throw new Error(`MSport ${res.status}`);
      const j = await res.json();
      if (j.bizCode !== 10000) throw new Error(j.message || 'MSport error');
      mem.set(path, { t: Date.now(), data: j.data });
      return j.data;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => inflight.delete(path));
  inflight.set(path, pr);
  return pr;
}

// ---------- the prebuilt odds file (every upcoming match, rebuilt every 5 minutes on GitHub) ----------

const FILE = 'https://raw.githubusercontent.com/Gr4nt-cell/Fast-score/odds/odds.json';
let file = null; // { t, sports: { soccer: [rows] } }, rows already expanded per sport
let fileFetched = 0;
let fileLoading = null;

function expand(row) {
  const [eventId, homeTeam, awayTeam, startTime, category, tournament, live, mks] = row;
  return {
    eventId,
    homeTeam,
    awayTeam,
    startTime,
    category,
    tournament,
    status: live ? 1 : 0,
    markets: (mks || []).map(([id, name, outs]) => ({ id, name, specifiers: '', isShown: 1, outcomes: outs.map(([description, odds]) => ({ description, odds, isActive: 1 })) })),
  };
}

function useFile(raw) {
  const sports = {};
  Object.entries((raw && raw.sports) || {}).forEach(([k, rows]) => (sports[k] = rows.map(expand)));
  file = { t: raw.t, sports };
}

/** Every MSport match of a sport from the odds file: from the phone at once, refreshed in the background. */
async function fileEvents(sport) {
  if (!file) {
    try {
      const saved = await AsyncStorage.getItem('ms:file');
      if (saved && !file) useFile(JSON.parse(saved));
    } catch {}
  }
  if (Date.now() - fileFetched > 4 * 60000 && !fileLoading) {
    fileFetched = Date.now();
    fileLoading = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(`${FILE}?t=${Math.floor(Date.now() / 120000)}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return;
        const text = await res.text();
        const raw = JSON.parse(text);
        if (!file || raw.t > file.t) {
          useFile(raw);
          AsyncStorage.setItem('ms:file', text).catch(() => {});
        }
      } catch {
        fileFetched = Date.now() - 3 * 60000; // try again in a minute
      } finally {
        fileLoading = null;
      }
    })();
    if (!file) await fileLoading; // nothing saved yet: wait for the first download
  }
  // prices older than 2 hours are too stale to show
  return file && Date.now() - file.t < 2 * 3600000 ? file.sports[sport] || [] : [];
}

// any object carrying an eventId (the lists nest events under tournaments in different ways)
function collect(d, out) {
  if (!d || typeof d !== 'object') return out;
  if (Array.isArray(d)) d.forEach((x) => collect(x, out));
  else if (d.eventId && d.homeTeam) out.set(d.eventId, d);
  else Object.values(d).forEach((x) => typeof x === 'object' && collect(x, out));
  return out;
}

/** Live + today's + the top competitions' matches: one cheap set, refreshed every minute. */
async function baseEvents(sport) {
  const sid = `sr:sport:${SR_SPORT[sport]}`;
  const key = 'base:' + sport;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < 60000) return hit.data;
  const out = new Map();
  await Promise.all(
    [`/live-matches/list?sportId=${sid}`, `/all-matches/today?sportId=${sid}`, `/all-matches/top-league?sportId=${sid}`].map((p) =>
      getJson(p, 30000)
        .then((d) => collect(d, out))
        .catch(() => {})
    )
  );
  const list = [...out.values()];
  mem.set(key, { t: Date.now(), data: list });
  return list;
}

/** Every competition MSport has upcoming matches in: [{ id, name, country }] */
async function tournaments(sport) {
  const d = await getJson(`/all-matches/countries?sportId=sr:sport:${SR_SPORT[sport]}`, 10 * 60000);
  const out = new Map();
  const walk = (x, country) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach((y) => walk(y, country));
    const c = x.category || country;
    if (x.tournamentId) out.set(x.tournamentId, { id: x.tournamentId, name: x.tournament || '', country: c || '' });
    Object.values(x).forEach((y) => typeof y === 'object' && walk(y, c));
  };
  walk(d, '');
  return [...out.values()];
}

/** The matches of some competitions (the website's own "sports-matches-list" call). */
async function byTournaments(ids) {
  const out = new Map();
  const todo = [];
  ids.forEach((id) => {
    const hit = mem.get('t:' + id);
    if (hit && Date.now() - hit.t < 120000) hit.data.forEach((e) => out.set(e.eventId, e));
    else todo.push(id);
  });
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(BASE + '/sports-matches-list', { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(chunk), signal: ctrl.signal });
      clearTimeout(timer);
      const j = await res.json();
      const got = [...collect(j && j.data, new Map()).values()];
      chunk.forEach((id) => mem.set('t:' + id, { t: Date.now(), data: got.filter((e) => e.tournamentId === id) }));
      got.forEach((e) => out.set(e.eventId, e));
    } catch {}
  }
  return [...out.values()];
}

const sameText = (a, b) => {
  const x = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const y = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** MSport competitions that could hold these matches (same country, similar competition name). */
async function candidates(sport, matches) {
  let ts;
  try {
    ts = await tournaments(sport);
  } catch {
    return [];
  }
  const ids = new Set();
  matches.forEach((m) => {
    ts.forEach((t) => {
      const country = sameText(t.country, m.country);
      const league = similar(t.name, m.leagueName) >= 0.5 || sameText(t.name, m.leagueName);
      if (country && (league || ts.filter((x) => sameText(x.country, m.country)).length <= 3)) ids.add(t.id);
      else if (!m.country && league) ids.add(t.id);
    });
  });
  return [...ids].slice(0, 60);
}

// ---------- pairing ----------


const STOP = new Set(['fc', 'cf', 'sc', 'afc', 'ac', 'cd', 'fk', 'sk', 'if', 'club', 'de', 'the', 'and', 'women', 'w', 'u21', 'u23', 'u19']);
function tokens(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}
function similar(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.length || !y.length) return 0;
  const sy = new Set(y);
  let hit = 0;
  x.forEach((w) => {
    if (sy.has(w) || [...sy].some((v) => (v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v))))) hit++;
  });
  return hit / Math.min(x.length, y.length);
}
const isWomen = (s) => /\bwomen\b|\(w\)| w$/i.test(String(s || ''));

function pair(m, list) {
  const t = new Date(m.date).getTime();
  let best = null;
  let score = 0;
  for (const e of list) {
    if (Math.abs(e.startTime - t) > 3 * 3600 * 1000) continue;
    if (isWomen(e.homeTeam) !== isWomen(m.home.name)) continue;
    const h = similar(m.home.name, e.homeTeam);
    const a = similar(m.away.name, e.awayTeam);
    if (h < 0.5 || a < 0.5) continue;
    const s = h + a - Math.abs(e.startTime - t) / (6 * 3600 * 1000);
    if (s > score) {
      score = s;
      best = e;
    }
  }
  return best;
}

// ---------- markets ----------

const decToMl = (d) => {
  const x = Number(d);
  if (!Number.isFinite(x) || x <= 1) return null;
  return x >= 2 ? Math.round((x - 1) * 100) : Math.round(-100 / (x - 1));
};

function outcomes(mk) {
  return (mk.outcomes || []).filter((o) => o.isActive !== 0 && o.odds);
}

/** The match-result market (1X2, or the two-way winner market). */
function mainMarket(e) {
  const ms = e.markets || [];
  return (
    ms.find((m) => m.id === 1) ||
    ms.find((m) => /^(winner|1x2|match winner|winner \(incl)/i.test(m.name || '') && outcomes(m).length >= 2) ||
    ms.find((m) => {
      const os = outcomes(m).map((o) => (o.description || '').toLowerCase());
      return os.includes('home') && os.includes('away');
    })
  );
}

/** Odds in the shape the rows / odds card use (American moneylines), plus the raw markets. */
function oddsOf(e) {
  const mk = mainMarket(e);
  if (!mk) return null;
  const os = outcomes(mk);
  const pick = (re) => os.find((o) => re.test(o.description || ''));
  const h = pick(/^home$|^1$/i);
  const d = pick(/^draw$|^x$/i);
  const a = pick(/^away$|^2$/i);
  if (!h || !a) return null;
  const ou = (e.markets || []).find((m) => m.id === 18 && /total=2\.5/.test(m.specifiers || '')) || (e.markets || []).find((m) => /over\/under|o\/u/i.test(m.name || '') && outcomes(m).some((o) => /2\.5/.test(o.description)));
  return {
    provider: 'MSport',
    home: decToMl(h.odds),
    draw: d ? decToMl(d.odds) : null,
    away: decToMl(a.odds),
    dec: { home: Number(h.odds), draw: d ? Number(d.odds) : null, away: Number(a.odds) },
    overUnder: ou ? '2.5' : null,
    markets: (e.markets || [])
      .filter((m) => outcomes(m).length && m.isShown !== 0 && !/UP$/.test(m.name || ''))
      .filter((m) => m.id !== 18 || /total=(1\.5|2\.5|3\.5)/.test(m.specifiers || ''))
      .slice(0, 10)
      .map((m) => ({
        id: `${m.id}|${m.specifiers || ''}`,
        name: `${m.name === '1x2' ? '1X2' : m.name}${/total=([\d.]+)/.test(m.specifiers || '') ? ' ' + m.specifiers.match(/total=([\d.]+)/)[1] : ''}`,
        outcomes: outcomes(m).map((o) => ({ label: o.description, odds: Number(o.odds) })),
      })),
    msEventId: e.eventId,
    live: e.status === 1,
  };
}

// last prices seen for each match, kept so finished matches can show their closing odds
const CLOSING = 'ms:closing';
let closing = null;
async function closingMap() {
  if (!closing) {
    try {
      closing = JSON.parse((await AsyncStorage.getItem(CLOSING)) || '{}');
    } catch {
      closing = {};
    }
  }
  return closing;
}
let closingSave = null;
closingMap().catch(() => {});
// every price found this session, so a match page can show odds the moment it opens
const fresh = new Map();

/** Odds already known for a match (instant, no network): current, else closing. */
export function cachedOdds(m) {
  if (!m || !m.key) return null;
  const f = fresh.get(m.key);
  if (f && (m.state !== 'post' || f.closing)) return f;
  const c = closing && closing[m.key];
  if (c && (m.state === 'post' || !f)) return { ...c, closing: m.state === 'post', live: false };
  return f || null;
}

/** Load the lists and saved prices early (app start), so odds are ready when needed. */
export function warmOdds(sport = 'soccer') {
  closingMap().catch(() => {});
  fileEvents(sport).catch(() => {});
  baseEvents(sport).catch(() => {});
  tournaments(sport).catch(() => {});
}

async function remember(m, o) {
  if (!o) return;
  fresh.set(m.key, o);
  if (o.live) return; // pre-match prices only: that's what "closing odds" means
  const c = await closingMap();
  c[m.key] = { ...o, t: Date.now() };
  clearTimeout(closingSave);
  closingSave = setTimeout(() => {
    // keep two weeks
    Object.keys(c).forEach((k) => Date.now() - c[k].t > 14 * 86400000 && delete c[k]);
    AsyncStorage.setItem(CLOSING, JSON.stringify(c)).catch(() => {});
  }, 2000);
}

/** MSport odds for one match: live/current prices, or the closing prices once it's over. */
export async function matchOdds(m) {
  if (!m || !msSupports(m.sport) || m.kind !== 'match') return null;
  try {
    if (m.state !== 'post') {
      // live matches: MSport's live list (prices move every minute); otherwise the odds file first
      let e = m.state === 'in' ? pair(m, await baseEvents(m.sport)) : null;
      if (!e) e = pair(m, await fileEvents(m.sport));
      if (!e && m.state !== 'in') e = pair(m, await baseEvents(m.sport));
      if (!e) e = pair(m, await byTournaments(await candidates(m.sport, [m])));
      const o = e ? oddsOf(e) : null;
      if (o) {
        remember(m, o);
        return o;
      }
    }
    const c = (await closingMap())[m.key];
    return c ? { ...c, closing: true, live: false } : null;
  } catch {
    return null;
  }
}

/** Fill `odds` on the matches of a day board (only where missing). Never throws. */
export async function attachOdds(groups, sport) {
  if (!msSupports(sport) || !groups || !groups.length) return groups;
  try {
    const fill = (list) => {
      const left = [];
      groups.forEach((g) =>
        g.items.forEach((m) => {
          if (m.kind !== 'match' || m.state === 'post' || (m.odds && m.odds.home != null)) return;
          const e = pair(m, list);
          const o = e && oddsOf(e);
          if (o) {
            m.odds = o;
            remember(m, o);
          } else left.push(m);
        })
      );
      return left;
    };
    let left = fill(await fileEvents(sport));
    if (left.length) left = fill(await baseEvents(sport));
    // the rest: look in their own competitions (bounded, so a huge day stays quick)
    if (left.length) fill(await byTournaments(await candidates(sport, left.slice(0, 200))));
  } catch {}
  return groups;
}
