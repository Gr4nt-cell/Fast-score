// Flashscore's own data feeds (what flashscore.com loads), read straight from the phone. No key,
// no sign-up: every request just carries the site's public "x-fsign" value.
// The feeds are plain text: records separated by "~", fields by "¬", key and value by "÷".
// Everything is converted into the same shapes the ESPN layer produces, so screens don't change.
// League slugs look like "fs:<tournamentId>_<stageId>"; team ids are Flashscore participant ids.

import AsyncStorage from '@react-native-async-storage/async-storage';

const HOSTS = ['https://global.flashscore.ninja/2/x/feed', 'https://2.flashscore.ninja/2/x/feed', 'https://d.flashscore.com/x/feed'];
const SIGN = 'SW9D1eZo';
const WEB = 'https://www.flashscore.com';
const IMG = 'https://static.flashscore.com/res/image/data/';
const HEADERS = { 'x-fsign': SIGN, Accept: '*/*', Referer: WEB + '/', Origin: WEB };

export const FS_SPORT = { soccer: 1, tennis: 2, basketball: 3, hockey: 4, football: 5, baseball: 6, rugby: 8, volleyball: 12 };
const FROM_FS = Object.fromEntries(Object.entries(FS_SPORT).map(([k, v]) => [v, k]));
export const supports = (sport) => !!FS_SPORT[sport];
export const isFs = (league) => String(league || '').startsWith('fs:');
const INDIVIDUAL = new Set(['tennis']);

let preferred = 0;
let downUntil = 0;
export const fsDown = () => Date.now() < downUntil;
const mem = new Map();
const inflight = new Map();
// team id -> one of its matches, so its recent games can come from that match's H2H feed
const teamEvent = new Map();

// participant id -> url slug (team pages need it); kept on disk for favourites
let slugs = {};
AsyncStorage.getItem('fs:slugs')
  .then((s) => {
    if (s) slugs = { ...JSON.parse(s), ...slugs };
  })
  .catch(() => {});
let slugSave = null;
function rememberSlug(id, slug) {
  if (!id || !slug || slugs[id] === slug) return;
  slugs[id] = slug;
  clearTimeout(slugSave);
  slugSave = setTimeout(() => {
    const keys = Object.keys(slugs);
    if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete slugs[k]);
    AsyncStorage.setItem('fs:slugs', JSON.stringify(slugs)).catch(() => {});
  }, 3000);
}

async function fetchText(url, timeout = 12000, headers = HEADERS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** GET a feed ("f_1_0_0_en_1"); tries each host. Empty answers are fine (no data). */
async function feed(name, ttl = 30000) {
  const hit = mem.get(name);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (inflight.has(name)) return inflight.get(name);
  const pr = (async () => {
    let last = 'no answer';
    for (const i of [preferred, ...HOSTS.map((_, k) => k).filter((k) => k !== preferred)]) {
      try {
        const r = await fetchText(`${HOSTS[i]}/${name}`);
        if (r.status === 200) {
          preferred = i;
          mem.set(name, { t: Date.now(), data: r.body });
          if (mem.size > 150) mem.delete(mem.keys().next().value);
          return r.body;
        }
        last = `HTTP ${r.status}`;
      } catch (e) {
        last = String(e.message || e);
      }
    }
    const old = mem.get(name);
    if (old) return old.data;
    throw new Error(`Flashscore unavailable (${last})`);
  })().finally(() => inflight.delete(name));
  inflight.set(name, pr);
  return pr;
}

/** "A÷1¬B÷2¬~C÷3¬" -> [{A:'1',B:'2'},{C:'3'}] (a repeated key inside a record becomes a list in key+'*') */
export function parse(text) {
  const out = [];
  String(text || '')
    .split('~')
    .forEach((rec) => {
      const o = {};
      let any = false;
      rec.split('¬').forEach((f) => {
        const i = f.indexOf('÷');
        if (i < 0) return;
        const k = f.slice(0, i);
        const v = f.slice(i + 1);
        if (k in o) (o[k + '*'] = o[k + '*'] || [o[k]]).push(v);
        o[k] = v;
        any = true;
      });
      if (any) out.push(o);
    });
  return out;
}

// ---------- helpers ----------

const img = (p) => (p ? IMG + p : null);
const num = (v) => (v == null || v === '' ? null : v);
const tzHours = () => Math.round(-new Date().getTimezoneOffset() / 60);
function dayOffset(date) {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(date);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}
const sameLocalDay = (ms, d) => {
  const x = new Date(ms);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};
const titleCountry = (s) => String(s || '').replace(/\w\S*/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

// competitions shown first (Flashscore lists countries A-Z)
const TOP = [
  [/^(WORLD|EUROPE|SOUTH AMERICA|AFRICA|ASIA): (World Cup|Euro|Copa America|Africa Cup of Nations|Champions League|Europa League|Conference League|Nations League|Copa Libertadores|CAF Champions League)/, 100],
  [/^ENGLAND: Premier League( |$)/, 95],
  [/^SPAIN: LaLiga( |$)/, 94],
  [/^ITALY: Serie A( |$)/, 93],
  [/^GERMANY: Bundesliga( |$)/, 92],
  [/^FRANCE: Ligue 1( |$)/, 91],
  [/^USA: (NBA|NFL|NHL|MLB|MLS)( |$)/, 95],
  [/^(ATP|WTA) - SINGLES/, 90],
  [/^ENGLAND: (FA Cup|EFL Cup|Championship)/, 80],
  [/^(SPAIN: Copa del Rey|ITALY: Coppa Italia|GERMANY: DFB Pokal|FRANCE: Coupe de France)/, 79],
  [/^(NETHERLANDS: Eredivisie|PORTUGAL: Liga Portugal|SAUDI ARABIA: Saudi Professional League|TURKEY: Super Lig|SCOTLAND: Premiership|BELGIUM: Jupiler Pro League|BRAZIL: Serie A|ARGENTINA: Liga Profesional)/, 75],
  [/^GHANA: Premier League/, 74],
  [/^EUROPE: (Euroleague|Champions League)/, 85],
  [/^WORLD: (Friendly International|Club Friendly)/, 20],
  [/^(ATP|WTA) - DOUBLES|CHALLENGER|ITF/, 5],
];
function priorityOf(za) {
  let p = (TOP.find(([re]) => re.test(za)) || [null, 30])[1];
  if (/women|\bU\d{2}\b| W$/i.test(za)) p -= 60;
  else if (/qualif|friendly/i.test(za)) p -= 25;
  return p;
}

// ---------- status ----------

const STAGE = {
  4: 'PPD', 5: 'Canc', 6: 'ET', 7: 'Pens', 8: 'Ret', 9: 'W/O', 10: 'AET', 11: 'Pen', 12: '1st', 13: '2nd', 14: 'P1', 15: 'P2', 16: 'P3',
  17: 'Set 1', 18: 'Set 2', 19: 'Set 3', 20: 'Set 4', 21: 'Set 5', 22: 'Q1', 23: 'Q2', 24: 'Q3', 25: 'Q4', 36: 'Int', 37: 'Aband', 38: 'HT', 42: 'Live', 43: 'Delay', 45: 'Break', 46: 'Break', 47: 'Break', 54: 'Awd',
};

function liveClock(r, sport) {
  const ac = Number(r.AC);
  if (sport === 'soccer' && (ac === 12 || ac === 13) && r.AO) {
    // Flashscore counts from the start of the current half
    const min = Math.floor((Date.now() / 1000 - Number(r.AO)) / 60) + 1 + (ac === 13 ? 45 : 0);
    const cap = ac === 13 ? 90 : 45;
    return min > cap ? `${cap}+${min - cap}'` : `${Math.max(1, min)}'`;
  }
  if (sport === 'soccer' && ac === 6) return 'ET';
  return STAGE[ac] || 'Live';
}

// ---------- normalising ----------

const H_PERIODS = ['BA', 'BC', 'BE', 'BG', 'BI', 'BK', 'BM', 'BO', 'BQ'];
const A_PERIODS = ['BB', 'BD', 'BF', 'BH', 'BJ', 'BL', 'BN', 'BP', 'BR'];

function side(r, which, sport, state) {
  const h = which === 'home';
  const id = h ? r.PX : r.PY;
  const slug = h ? r.WU : r.WV;
  rememberSlug(id, slug);
  const name = (h ? r.AE : r.AF) || 'TBD';
  const score = h ? r.AG : r.AH;
  const per = (h ? H_PERIODS : A_PERIODS).map((k) => r[k]).filter((v) => v != null && v !== '');
  const individual = INDIVIDUAL.has(sport);
  return {
    id: String(id || name),
    name: (h ? r.FH : r.FK) || name,
    short: name,
    abbr: (h ? r.WM : r.WN) || name.slice(0, 3).toUpperCase(),
    logo: img(h ? r.OA : r.OB),
    flag: null,
    color: null,
    score: state === 'pre' ? null : num(score),
    winner: r.AS === (h ? '1' : '2'),
    homeAway: which,
    form: null,
    record: null,
    rank: null,
    linescores: sport === 'soccer' ? [] : per,
    tiebreaks: [],
    position: null,
    isAthlete: individual,
    athleteId: individual ? String(id || '') : null,
    teamId: id ? String(id) : null,
    stats: [],
  };
}

function normalize(r, lg, sport) {
  const ab = r.AB;
  const ac = Number(r.AC);
  let state = ab === '2' ? 'in' : ab === '3' ? 'post' : 'pre';
  const postponed = [4, 5, 36, 37, 43].includes(ac);
  if (postponed && state === 'in') state = 'pre';
  const date = new Date(Number(r.AD || 0) * 1000);
  let short;
  if (state === 'in') short = liveClock(r, sport);
  else if (state === 'post') short = ac === 10 ? 'AET' : ac === 11 ? 'PEN' : ac === 8 ? 'Ret' : ac === 9 ? 'W/O' : ac === 54 ? 'Awd' : 'FT';
  else short = postponed ? STAGE[ac] || 'Off' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const slug = `fs:${lg.ZE || ''}_${lg.ZC || ''}`;
  if (r.PX) teamEvent.set(r.PX, r.AA);
  if (r.PY) teamEvent.set(r.PY, r.AA);
  const za = lg.ZA || '';
  const home = side(r, 'home', sport, state);
  const away = side(r, 'away', sport, state);
  const details = [];
  for (let i = 0; i < Number(r.AJ || 0); i++) details.push({ teamId: home.id, red: true });
  for (let i = 0; i < Number(r.AK || 0); i++) details.push({ teamId: away.id, red: true });
  const leagueName = za.includes(': ') ? za.split(': ').slice(1).join(': ') : za;
  return {
    source: 'flashscore',
    sport,
    league: slug,
    leagueName,
    leagueLogo: img(lg.OAJ),
    country: lg.ZY || titleCountry(za.split(': ')[0]),
    priority: priorityOf(za),
    fsName: za,
    tpl: lg.ZEE || '',
    eventId: r.AA,
    eventName: `${home.name} vs ${away.name}`,
    key: `${sport}:fs:${r.AA}`,
    id: r.AA,
    compId: r.AA,
    kind: 'match',
    group: '',
    date: date.toISOString(),
    state,
    completed: state === 'post',
    name: STAGE[ac] || '',
    detail: STAGE[ac] || '',
    short,
    clock: short,
    period: 0,
    status: { name: STAGE[ac] || '' },
    postponed,
    home,
    away,
    individual: INDIVIDUAL.has(sport),
    neutral: false,
    venue: '',
    odds: null,
    details,
    note: r.LS || '',
    broadcast: '',
    round: r.ER || '',
  };
}

/** Feed text -> normalized matches (league header records come before their matches). */
function matchesOf(text, sport) {
  let lg = {};
  const out = [];
  parse(text).forEach((r) => {
    if (r.ZA != null) lg = r;
    else if (r.AA) out.push(normalize(r, lg, sport));
  });
  return out;
}

// slug -> { name, logo } of competitions seen in day lists (for pinned lists)
export const leagueNames = new Map();
AsyncStorage.getItem('fs:leagueNames')
  .then((s) => s && Object.entries(JSON.parse(s)).forEach(([k, v]) => !leagueNames.has(k) && leagueNames.set(k, v)))
  .catch(() => {});
let namesSave = null;

function group(items) {
  const by = new Map();
  items.forEach((m) => {
    const name = m.country && !m.leagueName.toLowerCase().startsWith(m.country.toLowerCase()) ? `${m.country}: ${m.leagueName}` : m.leagueName;
    const g = by.get(m.league) || { league: { slug: m.league, sport: m.sport, name, logo: m.leagueLogo, priority: m.priority, country: m.country }, items: [] };
    g.items.push(m);
    by.set(m.league, g);
  });
  const out = [...by.values()];
  out.forEach((g) => g.items.sort((a, b) => new Date(a.date) - new Date(b.date)));
  // keeps Flashscore's A-Z order inside each priority level
  out.forEach((g, i) => (g.i = i));
  out.sort((a, b) => b.league.priority - a.league.priority || a.i - b.i);
  out.forEach((g) => {
    delete g.i;
    leagueNames.set(g.league.slug, { name: g.league.name, logo: g.league.logo });
  });
  clearTimeout(namesSave);
  namesSave = setTimeout(() => {
    const o = {};
    [...leagueNames.entries()].slice(-3000).forEach(([k, v]) => (o[k] = v));
    AsyncStorage.setItem('fs:leagueNames', JSON.stringify(o)).catch(() => {});
  }, 4000);
  return out;
}

// ---------- endpoints ----------

/** Every match of a sport on a local day (Flashscore covers 7 days back and forward). */
export async function dayBoard(sport, date, ttl = 30000) {
  const off = dayOffset(date);
  if (off < -7 || off > 7) throw new Error('Flashscore only covers a week either side');
  const text = await feed(`f_${FS_SPORT[sport]}_${off}_${tzHours()}_en_1`, Math.max(ttl, off === 0 ? 25000 : 5 * 60000));
  const items = matchesOf(text, sport).filter((m) => m.state === 'in' || sameLocalDay(new Date(m.date).getTime(), date));
  if (!items.length && sport === 'soccer') {
    // football always has games somewhere: an empty day means the feed isn't answering properly
    downUntil = Date.now() + 5 * 60000;
    throw new Error('Flashscore returned nothing');
  }
  const out = group(items);
  out.source = 'flashscore';
  return out;
}

// "fs:t:<countryId>:<templateId>:<countrySlug>~<leagueSlug>": a competition from the full index
export const isTpl = (slug) => String(slug || '').startsWith('fs:t:');
export function tplSlug(sport, country, league) {
  return `fs:t:${country.id}:${league.tpl}:${country.slug}~${league.slug}`;
}
function tplParts(slug) {
  const [cid, tpl, path] = slug.slice(5).split(':');
  const [countrySlug, leagueSlug] = String(path || '').split('~');
  return { cid, tpl, countrySlug, leagueSlug };
}
const SPORT_PATH = { soccer: 'football', tennis: 'tennis', basketball: 'basketball', hockey: 'hockey', football: 'american-football', baseball: 'baseball', rugby: 'rugby-union', volleyball: 'volleyball' };

export async function leagueDay(sport, slug, date) {
  const all = await dayBoard(sport, date).catch(() => []);
  if (isTpl(slug)) {
    const { tpl } = tplParts(slug);
    const groups = all.filter((g) => g.items.some((m) => m.tpl === tpl));
    const items = groups.flatMap((g) => g.items).sort((a, b) => new Date(a.date) - new Date(b.date));
    const first = groups[0];
    return { league: first ? { ...first.league, slug } : { slug, sport, name: 'Competition', logo: null }, items };
  }
  const g = all.find((x) => x.league.slug === slug);
  return { league: g ? g.league : { slug, sport, name: 'Competition', logo: null }, items: g ? g.items : [] };
}

function findCached(eventId) {
  for (const [name, v] of mem) {
    if (!name.startsWith('f_') || !v.data.includes(`AA÷${eventId}¬`)) continue;
    const sport = FROM_FS[Number(name.split('_')[1])];
    const m = matchesOf(v.data, sport).find((x) => x.eventId === eventId);
    if (m) return m;
  }
  return null;
}

const NOTE = { q: 'Promotion / qualification', r: 'Relegation', p: 'Play-offs' };

/** The current season of an indexed competition (read once from its standings page, then kept). */
const seasonCache = new Map();
async function currentStage(sport, slug) {
  if (seasonCache.has(slug)) return seasonCache.get(slug);
  const key = 'fs:season2:' + slug;
  try {
    const c = JSON.parse((await AsyncStorage.getItem(key)) || 'null');
    if (c && Date.now() - c.t < 3 * 86400000) {
      seasonCache.set(slug, c.v);
      return c.v;
    }
  } catch {}
  const { countrySlug, leagueSlug } = tplParts(slug);
  const r = await fetchText(`${WEB}/${SPORT_PATH[sport] || 'football'}/${countrySlug}/${leagueSlug}/standings/`, 15000, { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const tid = (r.body.match(/tournamentId:\s*"([A-Za-z0-9]+)"/) || [])[1];
  const sid = (r.body.match(/tournamentStageId:\s*"([A-Za-z0-9]+)"/) || [])[1];
  const logo = (r.body.match(/<img[^>]+class="heading__logo[^"]*"[^>]+src="([^"]+)"/) || r.body.match(/heading__logo[^>]*src="([^"]+)"/) || [])[1];
  // every stage of the competition (e.g. Euro: final tournament, play-offs, qualifying;
  // Nations League: League A/B/C/D) from the page's "stages_group"
  let stages = [];
  const sg = r.body.match(/"stages_group":\{[\s\S]*?"stages":(\[[^\]]*\])/);
  if (sg) {
    try {
      stages = JSON.parse(sg[1]).map((x) => ({ id: x.id, name: x.name, table: x.statsType !== 'draw' }));
    } catch {}
  }
  const v = tid && sid ? { tid, sid, logo: logo || null, stages } : null;
  seasonCache.set(slug, v);
  if (v) AsyncStorage.setItem(key, JSON.stringify({ t: Date.now(), v })).catch(() => {});
  return v;
}

export async function leagueLogo(sport, slug) {
  if (!isTpl(slug)) return null;
  const v = await currentStage(sport, slug).catch(() => null);
  return v && v.logo;
}

/** Teams of a competition, from its table. */
export async function teams(sport, slug) {
  const groups = await standings(slug, sport).catch(() => []);
  const seen = new Set();
  return groups
    .flatMap((g) => g.rows)
    .filter((r) => r.teamId && !seen.has(r.teamId) && seen.add(r.teamId))
    .map((r) => ({ id: r.teamId, name: r.name, logo: r.logo }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One stage's table(s): [{ name, rows }] (several groups for group stages). */
async function stageTable(tid, sid) {
  const recs = parse(await feed(`to_${tid}_${sid}_1`, 10 * 60000));
  const logos = {};
  recs.forEach((r) => (r['IPI*'] || (r.IPI ? [r.IPI] : [])).forEach((id, i) => (logos[id] = (r['IPU*'] || [r.IPU])[i])));
  // legend: "q1|Promotion - Euro (Play Offs: 1/8-finals)|004682"
  const legend = {};
  recs.forEach((r) => (r['TV*'] || (r.TV ? [r.TV] : [])).forEach((v) => {
    const [code, text, color] = String(v).split('|');
    if (code) legend[code] = { text: text || '', color: color || '' };
  }));
  const groups = [];
  let cur = null;
  recs.forEach((r) => {
    // "TD÷10¬TE÷Group A" starts a group
    if (r.TE != null && r.TD != null) {
      groups.push((cur = { name: r.TE, rows: [] }));
      return;
    }
    if (!r.TR) return;
    if (!cur) groups.push((cur = { name: '', rows: [] }));
    rememberSlug(r.TI, (r.TIU || '').split('/')[2]);
    const [gf, ga] = String(r.TG || '').split(':').map((x) => Number(x));
    const lg = legend[r.TU];
    const kind = String(r.TU || '').charAt(0);
    cur.rows.push({
      teamId: r.TI,
      name: r.TN,
      short: r.TN,
      logo: img(logos[r.TI]),
      note: r.TUC ? { color: r.TUC, text: (lg && lg.text) || NOTE[kind] || '' } : null,
      gp: Number(r.TM),
      w: Number(r.TW),
      d: r.TDR != null ? Number(r.TDR) : null,
      l: Number(r.TL),
      gf: Number.isFinite(gf) ? gf : null,
      ga: Number.isFinite(ga) ? ga : null,
      gd: Number.isFinite(gf) && Number.isFinite(ga) ? gf - ga : null,
      pts: r.TP != null ? Number(r.TP) : null,
      rank: Number(r.TR),
      pct: null,
    });
  });
  return groups.filter((g) => g.rows.length);
}

/**
 * Standings. For a competition from the full index every stage with a table is included and each
 * group carries `stage` / `stageId` (the competition page shows a stage picker); `current` marks
 * the stage that's on now. A slug from a match ("fs:<tournament>_<stage>") gives that stage only.
 */
export async function standings(slug, sport = 'soccer') {
  if (isTpl(slug)) {
    const v = await currentStage(sport, slug);
    if (!v) return [];
    const stages = (v.stages && v.stages.length ? v.stages : [{ id: v.sid, name: '', table: true }]).filter((x) => x.table || x.id === v.sid);
    const tables = await Promise.all(stages.map((st) => stageTable(v.tid, st.id).catch(() => [])));
    const out = [];
    stages.forEach((st, i) =>
      tables[i].forEach((g) => out.push({ ...g, name: g.name || st.name, stage: st.name, stageId: st.id, current: st.id === v.sid }))
    );
    return out;
  }
  const [tid, sid] = slug.slice(3).split('_');
  if (!tid || !sid) return [];
  return stageTable(tid, sid);
}

const KEY_TYPES = {
  Goal: ['Goal', 'goal'],
  'Own goal': ['Own Goal', 'goal'],
  Penalty: ['Penalty - Scored', 'goal'],
  'Yellow Card': ['Yellow Card', 'yellow-card'],
  'Red Card': ['Red Card', 'red-card'],
  'Yellow card / Red card': ['Red Card', 'red-card'],
  'Substitution - In': ['Substitution', 'substitution'],
  VAR: ['VAR', 'varDecision'],
  'Missed Penalty': ['Penalty - Missed', 'penalty-missed'],
};

/** Match details in the shape the match screen reads from ESPN's summary. */
export async function summary(sport, eventId) {
  const s = FS_SPORT[sport] || 1;
  const [core, sui, st, li, hh, sur, lc, momentum] = await Promise.all([
    feed(`dc_${s}_${eventId}`, 10000).catch(() => ''),
    feed(`df_sui_${s}_${eventId}`, 15000).catch(() => ''),
    feed(`df_st_${s}_${eventId}`, 20000).catch(() => ''),
    feed(`df_li_${s}_${eventId}`, 5 * 60000).catch(() => ''),
    feed(`df_hh_${s}_${eventId}`, 30 * 60000).catch(() => ''),
    feed(`df_sur_${s}_${eventId}`, 15000).catch(() => ''),
    feed(`df_lc_${s}_${eventId}`, 15000).catch(() => ''),
    sport === 'soccer' ? matchMomentum(eventId).catch(() => null) : null,
  ]);
  let match = findCached(eventId);
  const c = parse(core)[0] || {};
  if (match && c.DA) {
    // the core feed is fresher than the day list
    const state = c.DA === '2' ? 'in' : c.DA === '3' ? 'post' : 'pre';
    match.state = state;
    match.completed = state === 'post';
    if (state !== 'pre') {
      if (c.DE != null && c.DE !== '') match.home.score = c.DE;
      if (c.DF != null && c.DF !== '') match.away.score = c.DF;
    }
    if (state === 'in') match.short = match.clock = liveClock({ AC: c.DB, AO: c.DD }, sport);
  }
  const hid = match ? match.home.id : 'home';
  const aid = match ? match.away.id : 'away';

  // incidents -> keyEvents
  const keyEvents = [];
  parse(sui).forEach((r) => {
    if (!r.IK) return;
    const kinds = r['IK*'] || [r.IK];
    const names = r['IF*'] || [r.IF];
    const main = kinds[0];
    if (/Assistance|Substitution - Out/.test(main) && kinds.length === 1) return;
    let i = kinds.findIndex((k) => KEY_TYPES[k]);
    if (i < 0) return;
    const [text, type] = KEY_TYPES[kinds[i]];
    const people = [names[i]];
    const other = kinds.findIndex((k) => /Assistance|Substitution - Out/.test(k));
    if (other >= 0) people.push(names[other]);
    keyEvents.push({
      type: { text, type },
      clock: { displayValue: r.IB || '' },
      team: { id: r.IA === '2' ? aid : hid },
      participants: people.filter(Boolean).map((n) => ({ athlete: { displayName: n } })),
      scoringPlay: type === 'goal',
      text,
    });
  });

  // statistics (the "Match" block) -> boxscore.teams
  const stats = [];
  let block = null;
  parse(st).forEach((r) => {
    if (r.SE != null) block = r.SE;
    else if (r.SG && (block === 'Match' || block === null) && !stats.find((x) => x.name === r.SG)) stats.push({ name: r.SG, h: r.SH, a: r.SI });
  });
  const clean = (v) => (v == null ? '' : String(v).replace('%', ''));
  const boxscore = stats.length
    ? {
        teams: [
          { homeAway: 'home', team: { id: hid }, statistics: stats.map((x) => ({ name: x.name, label: x.name, displayValue: clean(x.h) })) },
          { homeAway: 'away', team: { id: aid }, statistics: stats.map((x) => ({ name: x.name, label: x.name, displayValue: clean(x.a) })) },
        ],
      }
    : undefined;

  // lineups -> rosters
  const sides = { 1: [], 2: [] };
  const formation = {};
  let section = '';
  let teamNo = 1;
  parse(li).forEach((r) => {
    if (r.LA != null) section = r.LA;
    if (r.LC != null) teamNo = Number(r.LC);
    if (!r.LP || !r.LI) return;
    if (r.LD && !formation[teamNo]) formation[teamNo] = r.LD;
    if (!/^(Starters|Starting|Substitutes)/i.test(section)) return;
    sides[teamNo] &&
      sides[teamNo].push({
        starter: /^Start/i.test(section),
        jersey: r.LJ || '',
        athlete: { id: r.LP, displayName: r.LI, lastName: r.LN || r.LI },
        position: { abbreviation: r.LR === '(G)' ? 'G' : '', displayName: r.LS || '' },
        formationPlace: sides[teamNo].length + 1,
        subbedIn: false,
        subbedOut: false,
      });
  });
  const rosters = [1, 2]
    .filter((n) => sides[n].length)
    .map((n) => ({
      homeAway: n === 1 ? 'home' : 'away',
      team: { id: n === 1 ? hid : aid, displayName: match ? match[n === 1 ? 'home' : 'away'].name : '' },
      formation: formation[n] || null,
      roster: sides[n],
    }));

  // head to head + each side's recent form
  const h2h = hhSections(hh);
  const meeting = h2h.find((x) => /head-to-head/i.test(x.title) && x.rows.length);
  let headToHeadGames;
  if (meeting) {
    headToHeadGames = [
      {
        team: { id: hid },
        events: meeting.rows
          .filter((x) => x.id !== eventId && x.finished)
          .slice(0, 10)
          .map((x) => {
            const us = x.homeId === hid ? x.hs : x.as;
            const them = x.homeId === hid ? x.as : x.hs;
            return {
              id: x.id,
              gameDate: x.date,
              score: `${x.hs}-${x.as}`,
              gameResult: us > them ? 'W' : us < them ? 'L' : 'D',
              atVs: x.homeId === hid ? 'vs' : '@',
              opponent: { displayName: x.homeId === hid ? x.awayName : x.homeName },
            };
          }),
      },
    ];
  }
  if (match) {
    const formOf = (id) =>
      (h2h.find((x) => /^Last matches/i.test(x.title) && x.rows.some((r) => r.homeId === id || r.awayId === id)) || { rows: [] }).rows
        .filter((r) => r.finished && r.id !== eventId)
        .slice(0, 5)
        .map((r) => {
          const us = r.homeId === id ? r.hs : r.as;
          const them = r.homeId === id ? r.as : r.hs;
          return us > them ? 'W' : us < them ? 'L' : 'D';
        })
        .reverse()
        .join('');
    match.home.form = formOf(hid) || null;
    match.away.form = formOf(aid) || null;
  }

  // venue, referee, attendance
  const info = {};
  parse(sur).forEach((r) => {
    const keys = r['MIT*'] || (r.MIT ? [r.MIT] : []);
    const vals = r['MIV*'] || (r.MIV ? [r.MIV] : []);
    keys.forEach((k, i) => {
      if (!info[k]) info[k] = vals[i];
    });
  });
  if (match && info.VEN) match.venue = [info.VEN, info.TWN].filter(Boolean).join(', ');

  // live commentary -> ESPN-style commentary (oldest first), with the event kind kept
  const commentary = parse(lc)
    .filter((r) => r.MD)
    .reverse()
    .map((r) => ({
      time: { displayValue: r.MB || '' },
      text: r.MD,
      kind: r.MC || '',
      important: r.MF === '1',
      play: { scoringPlay: /goal|soccer-ball|ball/i.test(r.MC || '') && !/kick/i.test(r.MC || ''), type: { text: r.MC || '' } },
    }));

  return {
    __match: match,
    commentary: commentary.length ? commentary : undefined,
    momentum,
    keyEvents,
    boxscore,
    rosters: rosters.length ? rosters : undefined,
    pickcenter: undefined,
    headToHeadGames,
    gameInfo: {
      venue: info.VEN ? { fullName: info.VEN, address: { city: info.TWN } } : null,
      attendance: info.ATT ? Number(String(info.ATT).replace(/\D/g, '')) : null,
      officials: info.REF ? [{ displayName: info.REF }] : [],
    },
  };
}

// ---------- match momentum (Opta; Premier League, World Cup and other selected competitions) ----------

const DS = 'https://2.ds.lsapp.eu/pq_graphql';
const momProvider = new Map();

async function dsJson(q, ttl) {
  const key = 'ds:' + q;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  const r = await fetchText(`${DS}?${q}`, 12000, { Accept: 'application/json', Referer: WEB + '/', Origin: WEB });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const data = JSON.parse(r.body).data;
  mem.set(key, { t: Date.now(), data });
  return data;
}

/** Minute-by-minute momentum: [{ t: "23'", v: -1..1 (home +, away -) }], plus goals/red cards. Null when not covered. */
export async function matchMomentum(eventId) {
  let provider = momProvider.get(eventId);
  if (provider == null) {
    const st = await dsJson(`_hash=mmte&eventId=${eventId}&projectId=2`, 6 * 3600 * 1000);
    const m = st && st.findStaticMatchMomentumByMatchId;
    if (!m) return null;
    provider = (m.updateFeedProviderId && m.updateFeedProviderId.id) || 7;
    momProvider.set(eventId, provider);
  }
  const d = await dsJson(`_hash=mmts&eventId=${eventId}&providerId=${provider}`, 20000);
  const m = d && d.findMatchMomentumStatsByMatchId;
  const entries = (m && m.momentum && m.momentum.entries) || [];
  if (!entries.length) return null;
  return {
    points: entries.map((e) => ({ t: (e.timeFrame && e.timeFrame.displayTime) || '', min: e.timeFrame ? e.timeFrame.elapsedMinute + 1 : 0, half: e.timeFrame && e.timeFrame.eventStage === 13 ? 2 : 1, v: Math.max(-1, Math.min(1, Number(e.momentumValue) || 0)) })),
    events: ((m.matchEvents && m.matchEvents.entries) || []).map((e) => ({
      type: e.type && e.type.type,
      teamId: e.teamId,
      t: e.timeFrame && e.timeFrame.displayTime,
      min: e.timeFrame ? e.timeFrame.elapsedMinute + 1 : 0,
    })),
  };
}

/** The H2H feed: "Last matches: <team>" and "Head-to-head matches" lists (Overall tab only). */
function hhSections(text) {
  const out = [];
  let tab = '';
  let cur = null;
  parse(text).forEach((r) => {
    if (r.KA != null) tab = r.KA;
    if (r.KB != null) {
      cur = { title: r.KB, tab, rows: [] };
      if (tab === 'Overall') out.push(cur);
      return;
    }
    if (!cur || !r.KP) return;
    const hs = Number(r.KU);
    const as = Number(r.KT);
    cur.rows.push({
      id: r.KP,
      date: new Date(Number(r.KC) * 1000).toISOString(),
      league: r.KF || '',
      finished: r.AC === '3' || (Number.isFinite(hs) && Number.isFinite(as) && r.KU !== ''),
      homeId: r.UQ,
      awayId: r.UO,
      homeName: (r.KJ || '').replace(/^\*/, ''),
      awayName: (r.KK || '').replace(/^\*/, ''),
      homeLogo: img(r.EC),
      awayLogo: img(r.ED),
      hs,
      as,
    });
  });
  return out;
}


function rowsToGames(rows, sport) {
  return rows.map((x) => {
    const home = {
      id: x.homeId,
      name: x.homeName,
      short: x.homeName,
      abbr: x.homeName.slice(0, 3).toUpperCase(),
      logo: x.homeLogo,
      score: x.finished ? String(x.hs) : null,
      winner: x.hs > x.as,
      homeAway: 'home',
      linescores: [],
      teamId: x.homeId,
    };
    const away = {
      id: x.awayId,
      name: x.awayName,
      short: x.awayName,
      abbr: x.awayName.slice(0, 3).toUpperCase(),
      logo: x.awayLogo,
      score: x.finished ? String(x.as) : null,
      winner: x.as > x.hs,
      homeAway: 'away',
      linescores: [],
      teamId: x.awayId,
    };
    return {
      source: 'flashscore',
      sport,
      league: 'fs:team',
      leagueName: x.league,
      eventId: x.id,
      key: `${sport}:fs:${x.id}`,
      id: x.id,
      kind: 'match',
      date: x.date,
      state: x.finished ? 'post' : 'pre',
      completed: x.finished,
      short: x.finished ? 'FT' : new Date(x.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clock: '',
      status: { name: '' },
      home,
      away,
      details: [],
      individual: INDIVIDUAL.has(sport),
    };
  });
}

/** A team's page (results + fixtures), read from the HTML flashscore.com serves. */
async function teamPage(id, tab) {
  const slug = slugs[id] || 'team';
  const key = `page:${id}:${tab}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < 10 * 60000) return hit.data;
  const r = await fetchText(`${WEB}/team/${slug}/${id}/${tab}/`, 15000, { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const html = r.body;
  const feeds = [...html.matchAll(/cjs\.initialFeeds\["([^"]+)"\]\s*=\s*\{\s*data:\s*`([^`]*)`/g)].map((m) => ({ name: m[1], data: m[2] }));
  const name = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1];
  const logo = (html.match(/<img[^>]+class="heading__logo[^"]*"[^>]+src="([^"]+)"/) || [])[1];
  const data = { feeds, name: name ? name.replace(/ (Results|Fixtures|Squad|Summary).*$/i, '') : '', logo };
  mem.set(key, { t: Date.now(), data });
  return data;
}

/** A team's last games from the H2H feed of one of its matches (small; used by AI Picks). */
export async function recentGames(sport, id) {
  const ev = teamEvent.get(id);
  if (ev) {
    const sec = hhSections(await feed(`df_hh_${FS_SPORT[sport] || 1}_${ev}`, 30 * 60000).catch(() => '')).find(
      (x) => /^Last matches/i.test(x.title) && x.rows.some((r) => r.homeId === id || r.awayId === id)
    );
    if (sec && sec.rows.length) return rowsToGames(sec.rows, sport).sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  return teamSchedule(sport, id);
}

/** A team's results and fixtures, from its page on flashscore.com (falls back to the H2H feed). */
export async function teamSchedule(sport, id) {
  try {
    const [res, fix] = await Promise.all([teamPage(id, 'results'), teamPage(id, 'fixtures').catch(() => ({ feeds: [] }))]);
    const out = [];
    const seen = new Set();
    [...res.feeds, ...fix.feeds].forEach((f) =>
      matchesOf(f.data, sport).forEach((m) => {
        if (!seen.has(m.key)) {
          seen.add(m.key);
          out.push(m);
        }
      })
    );
    if (out.length) return out.sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch {
    // fall back to a match's H2H feed
  }
  const ev = teamEvent.get(id);
  if (!ev) return [];
  const sec = hhSections(await feed(`df_hh_${FS_SPORT[sport] || 1}_${ev}`, 30 * 60000)).find(
    (x) => /^Last matches/i.test(x.title) && x.rows.some((r) => r.homeId === id || r.awayId === id)
  );
  return sec ? rowsToGames(sec.rows, sport).sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
}

export async function team(id) {
  const p = await teamPage(id, 'results').catch(() => null);
  let logo = p && p.logo;
  if (p && !logo) {
    const m = p.feeds.flatMap((f) => matchesOf(f.data, 'soccer')).find((x) => x.home.id === id || x.away.id === id);
    if (m) logo = (m.home.id === id ? m.home : m.away).logo;
  }
  return {
    id,
    displayName: (p && p.name) || 'Team',
    logos: logo ? [{ href: logo }] : [],
    venue: null,
    standingSummary: '',
  };
}

export async function roster() {
  return { groups: [], coach: '' };
}

export async function player(id) {
  return { athlete: { displayName: '', headshot: null, id }, overview: null, gamelog: null };
}

export async function search(q) {
  const url = `https://s.livesport.services/api/v2/search/?q=${encodeURIComponent(q)}&lang-id=1&type-ids=1,2,3,4&project-id=2&project-type-id=1`;
  const r = await fetchText(url, 10000, { Accept: 'application/json' });
  if (r.status !== 200) return [];
  let j;
  try {
    j = JSON.parse(r.body);
  } catch {
    return [];
  }
  const out = [];
  (Array.isArray(j) ? j : []).forEach((x) => {
    const sport = FROM_FS[x.sport && x.sport.id];
    if (!sport) return;
    const im = (x.images || [])[0];
    const type = x.type && x.type.name;
    rememberSlug(x.id, x.url);
    if (type === 'Team' || (type === 'Player' && INDIVIDUAL.has(sport))) {
      out.push({ type: 'team', id: x.id, name: x.name, sub: x.defaultCountry && x.defaultCountry.name, image: im ? img(im.path) : null, sport, league: 'fs:team' });
    }
  });
  return out.slice(0, 20);
}

/** For the Settings check: does today's football feed answer? */
export async function diagnose() {
  const t0 = Date.now();
  try {
    mem.delete(`f_1_0_${tzHours()}_en_1`);
    const b = await dayBoard('soccer', new Date(), 0);
    return { ok: true, events: b.reduce((n, g) => n + g.items.length, 0), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e.message || e), ms: Date.now() - t0 };
  }
}
